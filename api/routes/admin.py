"""
Admin endpoints for trait flag review and bulk operations.

Requires JWT authentication (user account).
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime
import json

from db.neo4j_client import Neo4jClient
from api.dependencies import get_neo4j_client
from api.middleware.jwt_auth import get_current_user
from workers.llm_client import LLMFactory
import os

router = APIRouter(prefix="/admin", tags=["admin"])


class ReviewFlagRequest(BaseModel):
    """Request model for reviewing a trait flag."""
    action: str = Field(..., pattern="^(approve|reject)$", description="approve or reject")
    trigger_reclassification: bool = Field(True, description="Re-evaluate trait with LLM if approved")
    resolution_notes: Optional[str] = Field(None, max_length=500, description="Admin notes about the decision")


class TraitFlagResponse(BaseModel):
    """Response model for trait flag data."""
    flag_id: str
    entity_uuid: str
    entity_name: str
    trait_bit: int
    trait_name: str
    current_value: bool
    suggested_value: bool
    reason: str
    status: str
    created_at: str
    reviewed_at: Optional[str] = None
    reviewed_by: Optional[str] = None
    resolution_notes: Optional[str] = None


@router.get("/trait-flags", response_model=Dict[str, Any])
async def list_trait_flags(
    status: Optional[str] = Query("pending", regex="^(pending|approved|rejected|all)$"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user_data: dict = Depends(get_current_user),
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    List trait flags for admin review.

    **Requires JWT authentication.**

    Args:
        status: Filter by status (pending/approved/rejected/all)
        limit: Maximum number of results
        offset: Offset for pagination

    Returns:
        List of trait flags with entity and trait details
    """
    # Build query based on status filter
    status_filter = "" if status == "all" else "WHERE f.status = $status"

    query = f"""
    MATCH (f:TraitFlag)-[:FLAGS]->(e:Entity)
    MATCH (f)-[:CONCERNS]->(t:Trait)
    {status_filter}
    RETURN f, e.name as entity_name, t.name as trait_name
    ORDER BY f.created_at DESC
    SKIP $offset
    LIMIT $limit
    """

    params = {"offset": offset, "limit": limit}
    if status != "all":
        params["status"] = status

    async with neo4j.driver.session() as session:
        result = await session.run(query, **params)
        flags = []

        async for record in result:
            flag_data = dict(record["f"])

            # Serialize datetime fields
            for key in ["created_at", "reviewed_at"]:
                if key in flag_data and flag_data[key] is not None:
                    flag_data[key] = flag_data[key].isoformat() if hasattr(flag_data[key], 'isoformat') else str(flag_data[key])

            flags.append({
                "flag_id": flag_data["flag_id"],
                "entity_uuid": flag_data["entity_uuid"],
                "entity_name": record["entity_name"],
                "trait_bit": flag_data["trait_bit"],
                "trait_name": record["trait_name"],
                "current_value": flag_data["current_value"],
                "suggested_value": flag_data["suggested_value"],
                "reason": flag_data["reason"],
                "status": flag_data["status"],
                "created_at": flag_data["created_at"],
                "reviewed_at": flag_data.get("reviewed_at"),
                "reviewed_by": flag_data.get("reviewed_by"),
                "resolution_notes": flag_data.get("resolution_notes")
            })

    # Get total count
    count_query = f"""
    MATCH (f:TraitFlag)
    {status_filter}
    RETURN count(f) as total
    """

    async with neo4j.driver.session() as session:
        result = await session.run(count_query, **params)
        record = await result.single()
        total = record["total"] if record else 0

    return {
        "flags": flags,
        "total": total,
        "offset": offset,
        "limit": limit
    }


@router.post("/trait-flags/{flag_id}/review")
async def review_trait_flag(
    flag_id: str,
    review: ReviewFlagRequest,
    user_data: dict = Depends(get_current_user),
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Review a trait flag - approve or reject.

    **Requires JWT authentication.**

    If approved and trigger_reclassification is True:
    - Re-evaluates the trait with LLM
    - Updates HAS_TRAIT relationship
    - Recalculates UHT code
    - Creates CORRECTION_HISTORY record

    Args:
        flag_id: Flag ID to review
        review: Review decision and notes

    Returns:
        Updated flag with review details
    """
    user_id = user_data["user_id"]

    # Get flag details
    get_flag_query = """
    MATCH (f:TraitFlag {flag_id: $flag_id})-[:FLAGS]->(e:Entity)
    MATCH (f)-[:CONCERNS]->(t:Trait)
    WHERE f.status = 'pending'
    RETURN f, e, t
    """

    async with neo4j.driver.session() as session:
        result = await session.run(get_flag_query, flag_id=flag_id)
        record = await result.single()

        if not record:
            raise HTTPException(status_code=404, detail="Flag not found or already reviewed")

        flag_data = dict(record["f"])
        entity_data = dict(record["e"])
        trait_data = dict(record["t"])

        # Update flag status
        new_status = "approved" if review.action == "approve" else "rejected"

        update_flag_query = """
        MATCH (f:TraitFlag {flag_id: $flag_id})
        SET f.status = $status,
            f.reviewed_at = datetime(),
            f.reviewed_by = $reviewed_by,
            f.resolution_notes = $resolution_notes
        RETURN f
        """

        await session.run(
            update_flag_query,
            flag_id=flag_id,
            status=new_status,
            reviewed_by=user_id,
            resolution_notes=review.resolution_notes
        )

        # If approved and should re-classify
        if review.action == "approve" and review.trigger_reclassification:
            # Get old values for history
            old_trait_query = """
            MATCH (e:Entity {uuid: $uuid})-[r:HAS_TRAIT]->(t:Trait {bit: $bit})
            RETURN r.applicable as old_applicable,
                   r.confidence as old_confidence,
                   r.justification as old_justification
            """
            old_result = await session.run(
                old_trait_query,
                uuid=flag_data["entity_uuid"],
                bit=flag_data["trait_bit"]
            )
            old_record = await old_result.single()
            old_applicable = old_record["old_applicable"] if old_record else False
            old_confidence = old_record["old_confidence"] if old_record else 0.0
            old_justification = old_record["old_justification"] if old_record else ""

            # Re-evaluate trait with LLM
            llm_provider = os.getenv("LLM_PROVIDER", "openrouter")
            llm_client = LLMFactory.create_client(llm_provider)

            entity_dict = {
                "name": entity_data["name"],
                "description": entity_data.get("description", "")
            }

            evaluation = await llm_client.evaluate_trait(entity_dict, trait_data)

            # Update HAS_TRAIT relationship
            update_trait_query = """
            MATCH (e:Entity {uuid: $uuid})-[r:HAS_TRAIT]->(t:Trait {bit: $bit})
            SET r.applicable = $applicable,
                r.confidence = $confidence,
                r.justification = $justification,
                r.model_used = $model_used,
                r.evaluated_at = datetime()
            RETURN r
            """

            await session.run(
                update_trait_query,
                uuid=flag_data["entity_uuid"],
                bit=flag_data["trait_bit"],
                applicable=evaluation["applicable"],
                confidence=evaluation["confidence"],
                justification=evaluation["justification"],
                model_used=evaluation.get("model_used", "unknown")
            )

            # Recalculate UHT code
            recalc_query = """
            MATCH (e:Entity {uuid: $uuid})-[r:HAS_TRAIT]->(t:Trait)
            WITH e, collect({bit: t.bit, applicable: r.applicable}) as traits
            WITH e, traits,
                 reduce(binary = '', trait IN traits |
                     binary + CASE WHEN trait.applicable THEN '1' ELSE '0' END
                 ) as binary_str
            WITH e, binary_str,
                 reduce(hex = '', i IN range(0, 7) |
                     hex + substring('0123456789ABCDEF',
                         reduce(val = 0, j IN range(0, 3) |
                             val + CASE WHEN substring(binary_str, i*4 + j, 1) = '1'
                                 THEN toInteger(2^(3-j)) ELSE 0 END
                         ), 1)
                 ) as hex_code
            SET e.uht_code = hex_code,
                e.binary_representation = binary_str,
                e.updated_at = datetime()
            RETURN e.uht_code as new_uht_code
            """

            recalc_result = await session.run(recalc_query, uuid=flag_data["entity_uuid"])
            recalc_record = await recalc_result.single()
            new_uht_code = recalc_record["new_uht_code"] if recalc_record else None

            # Create CORRECTION_HISTORY record
            history_query = """
            MATCH (e:Entity {uuid: $uuid})
            MATCH (t:Trait {bit: $bit})
            CREATE (e)-[h:CORRECTION_HISTORY {
                old_value: $old_value,
                new_value: $new_value,
                old_confidence: $old_confidence,
                new_confidence: $new_confidence,
                old_justification: $old_justification,
                new_justification: $new_justification,
                changed_at: datetime(),
                changed_by: $changed_by,
                reason: $reason,
                model_used: $model_used,
                flag_id: $flag_id
            }]->(t)
            RETURN h
            """

            await session.run(
                history_query,
                uuid=flag_data["entity_uuid"],
                bit=flag_data["trait_bit"],
                old_value=old_applicable,
                new_value=evaluation["applicable"],
                old_confidence=old_confidence,
                new_confidence=evaluation["confidence"],
                old_justification=old_justification,
                new_justification=evaluation["justification"],
                changed_by=user_id,
                reason=f"Admin approved flag: {flag_data['reason']}",
                model_used=evaluation.get("model_used", "unknown"),
                flag_id=flag_id
            )

            return {
                "flag_id": flag_id,
                "status": new_status,
                "reviewed_by": user_id,
                "reclassified": True,
                "old_value": old_applicable,
                "new_value": evaluation["applicable"],
                "new_uht_code": new_uht_code,
                "confidence": evaluation["confidence"],
                "message": "Flag approved and trait re-evaluated successfully"
            }

        return {
            "flag_id": flag_id,
            "status": new_status,
            "reviewed_by": user_id,
            "reclassified": False,
            "message": f"Flag {new_status} successfully"
        }
