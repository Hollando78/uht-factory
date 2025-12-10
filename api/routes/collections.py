"""
Collection Management Routes for UHT Factory.

Provides CRUD operations for user collections.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
import uuid

from api.middleware.jwt_auth import get_current_user
from api.dependencies import get_neo4j_client
from db.neo4j_client import Neo4jClient

router = APIRouter()


# ==================== Request/Response Models ====================

class CreateCollectionRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class UpdateCollectionRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class AddEntitiesRequest(BaseModel):
    entity_uuids: List[str] = Field(..., min_items=1, max_items=100)


class RemoveEntitiesRequest(BaseModel):
    entity_uuids: List[str] = Field(..., min_items=1, max_items=100)


class EntitySummary(BaseModel):
    uuid: str
    name: str
    uht_code: str
    added_at: Optional[str] = None


class CollectionResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    entity_count: int
    entity_uuids: List[str] = []
    created_at: str
    updated_at: str


class CollectionDetailResponse(CollectionResponse):
    entities: List[EntitySummary]


class CollectionListResponse(BaseModel):
    collections: List[CollectionResponse]
    total: int


# ==================== Routes ====================

@router.get("", response_model=CollectionListResponse)
async def list_collections(
    current_user: dict = Depends(get_current_user),
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    List all collections owned by the current user.
    """
    collections = await neo4j.get_user_collections(current_user["user_id"])

    return CollectionListResponse(
        collections=[
            CollectionResponse(
                id=c["id"],
                name=c["name"],
                description=c.get("description"),
                entity_count=c.get("entity_count", 0),
                entity_uuids=c.get("entity_uuids", []),
                created_at=c["created_at"],
                updated_at=c["updated_at"]
            )
            for c in collections
        ],
        total=len(collections)
    )


@router.post("", response_model=CollectionResponse)
async def create_collection(
    data: CreateCollectionRequest,
    current_user: dict = Depends(get_current_user),
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Create a new collection.
    """
    collection_data = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "description": data.description
    }

    collection = await neo4j.create_collection(current_user["user_id"], collection_data)

    if not collection:
        raise HTTPException(status_code=500, detail="Failed to create collection")

    return CollectionResponse(
        id=collection["id"],
        name=collection["name"],
        description=collection.get("description"),
        entity_count=0,
        created_at=collection["created_at"],
        updated_at=collection["updated_at"]
    )


@router.get("/{collection_id}", response_model=CollectionDetailResponse)
async def get_collection(
    collection_id: str,
    current_user: dict = Depends(get_current_user),
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Get a collection by ID with all entity details.
    """
    collection = await neo4j.get_collection_by_id(collection_id, current_user["user_id"])

    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    return CollectionDetailResponse(
        id=collection["id"],
        name=collection["name"],
        description=collection.get("description"),
        entity_count=collection.get("entity_count", 0),
        created_at=collection["created_at"],
        updated_at=collection["updated_at"],
        entities=[
            EntitySummary(
                uuid=e["uuid"],
                name=e["name"],
                uht_code=e["uht_code"],
                added_at=e.get("added_at")
            )
            for e in collection.get("entities", [])
        ]
    )


@router.patch("/{collection_id}", response_model=CollectionResponse)
async def update_collection(
    collection_id: str,
    data: UpdateCollectionRequest,
    current_user: dict = Depends(get_current_user),
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Update a collection's name or description.
    """
    updates = {}
    if data.name is not None:
        updates["name"] = data.name
    if data.description is not None:
        updates["description"] = data.description

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    collection = await neo4j.update_collection(collection_id, current_user["user_id"], updates)

    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    # Get entity count separately
    full_collection = await neo4j.get_collection_by_id(collection_id, current_user["user_id"])
    entity_count = full_collection.get("entity_count", 0) if full_collection else 0

    return CollectionResponse(
        id=collection["id"],
        name=collection["name"],
        description=collection.get("description"),
        entity_count=entity_count,
        created_at=collection["created_at"],
        updated_at=collection["updated_at"]
    )


@router.delete("/{collection_id}")
async def delete_collection(
    collection_id: str,
    current_user: dict = Depends(get_current_user),
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Delete a collection.

    - Only removes the collection and entity relationships
    - Does not delete the entities themselves
    """
    success = await neo4j.delete_collection(collection_id, current_user["user_id"])

    if not success:
        raise HTTPException(status_code=404, detail="Collection not found")

    return {"message": "Collection deleted successfully"}


@router.post("/{collection_id}/entities")
async def add_entities_to_collection(
    collection_id: str,
    data: AddEntitiesRequest,
    current_user: dict = Depends(get_current_user),
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Add entities to a collection.

    - Entities must exist in the database
    - Duplicate additions are ignored (idempotent)
    """
    # Verify collection exists and user owns it
    collection = await neo4j.get_collection_by_id(collection_id, current_user["user_id"])
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    added = await neo4j.add_entities_to_collection(
        collection_id,
        current_user["user_id"],
        data.entity_uuids
    )

    return {
        "message": f"Added {added} entities to collection",
        "added_count": added,
        "requested_count": len(data.entity_uuids)
    }


@router.delete("/{collection_id}/entities")
async def remove_entities_from_collection(
    collection_id: str,
    data: RemoveEntitiesRequest,
    current_user: dict = Depends(get_current_user),
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Remove entities from a collection.

    - Does not delete the entities themselves
    """
    # Verify collection exists and user owns it
    collection = await neo4j.get_collection_by_id(collection_id, current_user["user_id"])
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    removed = await neo4j.remove_entities_from_collection(
        collection_id,
        current_user["user_id"],
        data.entity_uuids
    )

    return {
        "message": f"Removed {removed} entities from collection",
        "removed_count": removed,
        "requested_count": len(data.entity_uuids)
    }


@router.post("/{collection_id}/import")
async def import_collection(
    collection_id: str,
    data: AddEntitiesRequest,
    current_user: dict = Depends(get_current_user),
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Bulk import entities to a collection (same as add but named for clarity).

    Useful for migrating from localStorage collections.
    """
    # Verify collection exists and user owns it
    collection = await neo4j.get_collection_by_id(collection_id, current_user["user_id"])
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    added = await neo4j.add_entities_to_collection(
        collection_id,
        current_user["user_id"],
        data.entity_uuids
    )

    return {
        "message": f"Imported {added} entities to collection",
        "added_count": added,
        "collection_id": collection_id
    }
