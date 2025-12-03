from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional, List, Any, Dict
from pydantic import BaseModel
import os
from neo4j.time import DateTime as Neo4jDateTime

from models.entity import EntitySearch
from db.neo4j_client import Neo4jClient
from api.middleware.api_key_auth import require_classify


class EntityUpdate(BaseModel):
    """Request model for updating an entity."""
    name: Optional[str] = None
    description: Optional[str] = None
    additional_context: Optional[str] = None


def serialize_entity(entity: Dict[str, Any]) -> Dict[str, Any]:
    """Convert Neo4j entity to JSON-serializable format"""
    result = {}
    for key, value in entity.items():
        if isinstance(value, Neo4jDateTime):
            result[key] = value.isoformat()
        else:
            result[key] = value
    return result

router = APIRouter()

async def get_neo4j_client():
    client = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )
    await client.connect()
    return client

@router.get("/{uuid}")
async def get_entity(uuid: str):
    """Get entity by UUID"""
    neo4j = await get_neo4j_client()
    
    try:
        entity = await neo4j.find_entity_by_uuid(uuid)
        if not entity:
            raise HTTPException(status_code=404, detail="Entity not found")
        return entity
    finally:
        await neo4j.close()

@router.get("/")
async def search_entities(
    uht_pattern: Optional[str] = Query(None, description="UHT code pattern to match"),
    name_contains: Optional[str] = Query(None, description="Entity name contains"),
    limit: int = Query(100, ge=1, le=50000),
    offset: int = Query(0, ge=0)
):
    """Search entities with filters"""
    neo4j = await get_neo4j_client()

    try:
        if uht_pattern:
            raw_entities = await neo4j.search_entities_by_uht(uht_pattern)
            entities = [serialize_entity(e) for e in raw_entities]
        elif name_contains:
            # Search by name
            query = """
            MATCH (e:Entity)
            WHERE toLower(e.name) CONTAINS toLower($name)
            RETURN e
            ORDER BY e.created_at DESC
            LIMIT $limit
            """
            results = await neo4j.execute_query(query, name=name_contains, limit=limit)
            entities = [serialize_entity(dict(r["e"])) for r in results]
        else:
            # Get all entities
            query = """
            MATCH (e:Entity)
            RETURN e
            ORDER BY e.created_at DESC
            LIMIT $limit
            """
            results = await neo4j.execute_query(query, limit=limit + offset)
            entities = [serialize_entity(dict(r["e"])) for r in results]

        # Apply pagination
        paginated = entities[offset:offset + limit]

        return {
            "total": len(entities),
            "limit": limit,
            "offset": offset,
            "entities": paginated
        }
    finally:
        await neo4j.close()

@router.get("/{uuid}/similar")
async def find_similar_entities(
    uuid: str,
    threshold: int = Query(28, ge=20, le=32, description="Similarity threshold (bits)")
):
    """Find entities similar to the given entity"""
    neo4j = await get_neo4j_client()
    
    try:
        # First get the entity
        entity = await neo4j.find_entity_by_uuid(uuid)
        if not entity:
            raise HTTPException(status_code=404, detail="Entity not found")
        
        # Find similar entities
        similar = await neo4j.find_similar_entities(
            entity["uht_code"],
            threshold
        )
        
        return {
            "source_entity": entity,
            "threshold": threshold,
            "similar_entities": similar
        }
    finally:
        await neo4j.close()

@router.delete("/{uuid}")
async def delete_entity(uuid: str):
    """Delete an entity (admin only)"""
    # Would implement auth check here
    neo4j = await get_neo4j_client()

    try:
        query = """
        MATCH (e:Entity {uuid: $uuid})
        DETACH DELETE e
        RETURN count(e) as deleted
        """

        async with neo4j.driver.session() as session:
            result = await session.run(query, uuid=uuid)
            record = await result.single()

            if record["deleted"] == 0:
                raise HTTPException(status_code=404, detail="Entity not found")

            return {"message": f"Entity {uuid} deleted"}
    finally:
        await neo4j.close()


@router.patch("/{uuid}")
async def update_entity(
    uuid: str,
    update: EntityUpdate,
    key_data: dict = Depends(require_classify)
):
    """
    Update an entity's name, description, or additional context.

    **Requires API key with 'classify' scope.**

    Only provided fields will be updated. Null fields are ignored.
    """
    neo4j = await get_neo4j_client()

    try:
        # Build dynamic SET clause for only provided fields
        set_clauses = []
        params = {"uuid": uuid}

        if update.name is not None:
            set_clauses.append("e.name = $name")
            params["name"] = update.name

        if update.description is not None:
            set_clauses.append("e.description = $description")
            params["description"] = update.description

        if update.additional_context is not None:
            set_clauses.append("e.additional_context = $additional_context")
            params["additional_context"] = update.additional_context

        if not set_clauses:
            raise HTTPException(status_code=400, detail="No fields to update")

        # Always update the updated_at timestamp
        set_clauses.append("e.updated_at = datetime()")

        query = f"""
        MATCH (e:Entity {{uuid: $uuid}})
        SET {', '.join(set_clauses)}
        RETURN e
        """

        async with neo4j.driver.session() as session:
            result = await session.run(query, **params)
            record = await result.single()

            if not record:
                raise HTTPException(status_code=404, detail="Entity not found")

            entity = dict(record["e"])
            return serialize_entity(entity)
    finally:
        await neo4j.close()