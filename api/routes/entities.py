from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional, List, Any, Dict, Tuple
from pydantic import BaseModel
from neo4j.time import DateTime as Neo4jDateTime
import time

from models.entity import EntitySearch
from db.neo4j_client import Neo4jClient
from api.middleware.api_key_auth import require_classify
from api.dependencies import get_neo4j_client

# Cache for pattern search - stores (entities_with_binary, timestamp)
_pattern_search_cache: Dict[str, Any] = {
    "entities": [],  # List of (entity_dict, binary_string)
    "timestamp": 0,
    "ttl": 900  # 15 minutes - entities don't change often
}

def _hex_to_binary(hex_code: str) -> str:
    """Convert hex to 32-char binary string"""
    try:
        return bin(int(hex_code, 16))[2:].zfill(32)
    except (ValueError, TypeError):
        return '0' * 32

def _matches_pattern(binary: str, pattern: str, tolerance: int) -> Tuple[bool, int]:
    """Check if binary matches pattern with tolerance, returns (matches, mismatch_count)"""
    mismatches = 0
    for i, p in enumerate(pattern):
        if p == 'X':
            continue
        if binary[i] != p:
            mismatches += 1
            if mismatches > tolerance:
                return False, mismatches
    return True, mismatches


class EntityUpdate(BaseModel):
    """Request model for updating an entity."""
    name: Optional[str] = None
    description: Optional[str] = None
    additional_context: Optional[str] = None
    nsfw: Optional[bool] = None


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


@router.get("/list/minimal")
async def get_entities_minimal(
    limit: int = Query(50000, ge=1, le=100000),
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Get minimal entity data for list views - optimized for speed.
    Only returns: uuid, name, uht_code, description (truncated), created_at
    """
    query = """
    MATCH (e:Entity)
    RETURN e.uuid as uuid,
           e.name as name,
           e.uht_code as uht_code,
           substring(coalesce(e.description, ''), 0, 100) as description,
           e.created_at as created_at
    ORDER BY e.created_at DESC
    LIMIT $limit
    """
    results = await neo4j.execute_query(query, limit=limit)

    entities = []
    for r in results:
        entity = dict(r)
        # Convert Neo4j DateTime
        if entity.get('created_at'):
            entity['created_at'] = entity['created_at'].isoformat() if hasattr(entity['created_at'], 'isoformat') else str(entity['created_at'])
        entities.append(entity)

    return {
        "total": len(entities),
        "entities": entities
    }


@router.get("/search/pattern")
async def search_by_pattern(
    pattern: str = Query(..., min_length=32, max_length=32, description="32-char pattern of 0/1/X"),
    tolerance: int = Query(0, ge=0, le=8, description="Number of bits allowed to differ"),
    limit: int = Query(100, ge=1, le=500),
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Search entities by binary pattern.

    Pattern is a 32-character string where:
    - '1' = bit must be ON
    - '0' = bit must be OFF
    - 'X' = wildcard (any value)

    Tolerance allows up to N bits to differ from the pattern constraints.
    """
    global _pattern_search_cache

    # Validate pattern
    pattern = pattern.upper()
    if not all(c in '01X' for c in pattern):
        raise HTTPException(status_code=400, detail="Pattern must only contain 0, 1, or X")

    # Check if cache is valid
    now = time.time()
    cache_valid = (
        _pattern_search_cache["entities"] and
        (now - _pattern_search_cache["timestamp"]) < _pattern_search_cache["ttl"]
    )

    if not cache_valid:
        # Refresh cache - fetch only fields needed for pattern search
        query = """
        MATCH (e:Entity)
        WHERE e.uht_code IS NOT NULL
        RETURN e.uuid as uuid,
               e.name as name,
               e.uht_code as uht_code,
               e.image_url as image_url,
               e.description as description,
               e.created_at as created_at
        """
        results = await neo4j.execute_query(query)

        # Pre-compute binary representations
        entities_with_binary = []
        for r in results:
            entity = dict(r)
            binary = _hex_to_binary(entity.get("uht_code", ""))
            entities_with_binary.append((entity, binary))

        _pattern_search_cache["entities"] = entities_with_binary
        _pattern_search_cache["timestamp"] = now

    # Filter from cache (fast - just string comparisons)
    matching = []
    for entity, binary in _pattern_search_cache["entities"]:
        matches, mismatch_count = _matches_pattern(binary, pattern, tolerance)
        if matches:
            matching.append((mismatch_count, entity))

    # Sort by mismatch count, then by created_at
    matching.sort(key=lambda x: (x[0], x[1].get("created_at", "")))

    # Apply limit and serialize
    entities = [serialize_entity(e) for _, e in matching[:limit]]

    return {
        "total": len(matching),
        "pattern": pattern,
        "tolerance": tolerance,
        "entities": entities
    }


@router.get("/{uuid}")
async def get_entity(uuid: str, neo4j: Neo4jClient = Depends(get_neo4j_client)):
    """Get entity by UUID"""
    entity = await neo4j.find_entity_by_uuid(uuid)
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    return entity


@router.get("/")
async def search_entities(
    uht_pattern: Optional[str] = Query(None, description="UHT code pattern to match"),
    name_contains: Optional[str] = Query(None, description="Entity name contains"),
    limit: int = Query(100, ge=1, le=50000),
    offset: int = Query(0, ge=0),
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """Search entities with filters"""
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
        # Get all entities with proper SKIP/LIMIT
        query = """
        MATCH (e:Entity)
        RETURN e
        ORDER BY e.created_at DESC
        SKIP $offset LIMIT $limit
        """
        results = await neo4j.execute_query(query, offset=offset, limit=limit)
        entities = [serialize_entity(dict(r["e"])) for r in results]

        # Get total count
        count_query = "MATCH (e:Entity) RETURN count(e) as total"
        count_result = await neo4j.execute_query(count_query)
        total = count_result[0]["total"] if count_result else len(entities)

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "entities": entities
        }

    return {
        "total": len(entities),
        "limit": limit,
        "offset": offset,
        "entities": entities
    }


@router.get("/{uuid}/similar")
async def find_similar_entities(
    uuid: str,
    threshold: int = Query(28, ge=20, le=32, description="Similarity threshold (bits)"),
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """Find entities similar to the given entity"""
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

@router.delete("/{uuid}")
async def delete_entity(uuid: str, neo4j: Neo4jClient = Depends(get_neo4j_client)):
    """Delete an entity (admin only)"""
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


@router.patch("/{uuid}")
async def update_entity(
    uuid: str,
    update: EntityUpdate,
    key_data: dict = Depends(require_classify),
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Update an entity's name, description, or additional context.

    **Requires API key with 'classify' scope.**

    Only provided fields will be updated. Null fields are ignored.
    """
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

    if update.nsfw is not None:
        set_clauses.append("e.nsfw = $nsfw")
        params["nsfw"] = update.nsfw

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


@router.post("/{uuid}/flag-nsfw")
async def flag_entity_nsfw(
    uuid: str,
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Flag an entity as NSFW.

    **No authentication required** - anyone can flag content.
    """
    query = """
    MATCH (e:Entity {uuid: $uuid})
    SET e.nsfw = true, e.updated_at = datetime()
    RETURN e
    """

    async with neo4j.driver.session() as session:
        result = await session.run(query, uuid=uuid)
        record = await result.single()

        if not record:
            raise HTTPException(status_code=404, detail="Entity not found")

        entity = dict(record["e"])
        return serialize_entity(entity)


@router.post("/{uuid}/unflag-nsfw")
async def unflag_entity_nsfw(
    uuid: str,
    key_data: dict = Depends(require_classify),
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Remove NSFW flag from an entity.

    **Requires API key with 'classify' scope.**
    """
    query = """
    MATCH (e:Entity {uuid: $uuid})
    SET e.nsfw = false, e.updated_at = datetime()
    RETURN e
    """

    async with neo4j.driver.session() as session:
        result = await session.run(query, uuid=uuid)
        record = await result.single()

        if not record:
            raise HTTPException(status_code=404, detail="Entity not found")

        entity = dict(record["e"])
        return serialize_entity(entity)