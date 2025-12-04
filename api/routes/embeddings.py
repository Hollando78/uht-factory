"""
Embeddings API routes for UHT Factory.

Provides endpoints for generating, storing, and searching entity embeddings
using OpenAI text-embedding-3-small (1536 dimensions).
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import Dict, Any, List, Optional
import os
import logging

from pydantic import BaseModel, Field
from db.neo4j_client import Neo4jClient
from workers.embedding_client import (
    EmbeddingOrchestrator,
    build_embedding_text,
    calculate_comparison_metrics
)
from api.middleware.api_key_auth import require_embeddings

logger = logging.getLogger(__name__)

router = APIRouter()


# ===== Request/Response Models =====

class EmbeddingGenerateRequest(BaseModel):
    entity_uuid: str = Field(..., description="UUID of entity to generate embedding for")


class EmbeddingCompareRequest(BaseModel):
    entity_uuid_1: str = Field(..., description="First entity UUID")
    entity_uuid_2: str = Field(..., description="Second entity UUID")


class EmbeddingSearchRequest(BaseModel):
    query: str = Field(..., description="Search query text")
    limit: int = Field(default=20, ge=1, le=100, description="Max results")
    min_score: float = Field(default=0.7, ge=0, le=1, description="Minimum similarity score")


class BatchEmbeddingRequest(BaseModel):
    entity_uuids: List[str] = Field(..., description="List of entity UUIDs")
    max_concurrent: int = Field(default=10, ge=1, le=50, description="Max concurrent generations")


class EntityEmbedding(BaseModel):
    entity_uuid: str
    embedding: List[float]
    dimension: int
    model_used: str
    created_at: str


class ComparisonMetrics(BaseModel):
    entity_uuid: str
    uht_vector: List[float]
    embedding_vector: List[float]
    cosine_similarity: float
    euclidean_distance: float
    correlation_score: float
    outlier_score: float


# ===== Dependencies =====

async def get_neo4j_client():
    """Get Neo4j client instance"""
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )
    await neo4j.connect()
    return neo4j


async def get_embedding_orchestrator():
    """Get embedding orchestrator instance"""
    return EmbeddingOrchestrator()


# ===== Endpoints =====

@router.post("/generate", response_model=Dict[str, Any])
async def generate_embedding(
    request: EmbeddingGenerateRequest,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
    orchestrator: EmbeddingOrchestrator = Depends(get_embedding_orchestrator),
    key_data: dict = Depends(require_embeddings)
):
    """
    Generate embedding for an entity.

    **Requires API key with 'embeddings' scope.**

    The embedding is generated from the entity's name, description,
    and applicable trait names for rich semantic context.

    Cost: ~$0.000006 per entity (~300 tokens average)
    """
    try:
        # Get entity with traits from Neo4j
        entity = await _get_entity_with_traits(neo4j_client, request.entity_uuid)
        if not entity:
            raise HTTPException(status_code=404, detail="Entity not found")

        # Generate embedding
        result = await orchestrator.generate_entity_embedding(entity)

        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=f"Embedding generation failed: {result.get('error')}"
            )

        # Store in Neo4j
        await neo4j_client.store_entity_embedding(
            uuid=request.entity_uuid,
            embedding=result["embedding"],
            model_used=result["model_used"]
        )

        return {
            "entity_uuid": request.entity_uuid,
            "embedding": result["embedding"],
            "dimension": result["dimension"],
            "model_used": result["model_used"],
            "created_at": result["created_at"],
            "tokens_used": result.get("tokens_used", 0),
            "cost_usd": result.get("cost_usd", 0),
            "generation_time_ms": result.get("generation_time_ms", 0)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Embedding generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/compare", response_model=Dict[str, Any])
async def compare_embeddings(
    request: EmbeddingCompareRequest,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
    orchestrator: EmbeddingOrchestrator = Depends(get_embedding_orchestrator),
    key_data: dict = Depends(require_embeddings)
):
    """
    Compare embeddings of two entities.

    **Requires API key with 'embeddings' scope.**

    Returns cosine similarity and other metrics between the two entity embeddings.
    If an entity doesn't have an embedding, one will be generated.
    """
    try:
        # Get or generate embeddings for both entities
        emb1 = await _get_or_generate_embedding(
            neo4j_client, orchestrator, request.entity_uuid_1
        )
        emb2 = await _get_or_generate_embedding(
            neo4j_client, orchestrator, request.entity_uuid_2
        )

        if not emb1 or not emb2:
            raise HTTPException(
                status_code=404,
                detail="Could not get embeddings for one or both entities"
            )

        # Calculate similarity
        from workers.embedding_client import cosine_similarity, euclidean_distance

        cos_sim = cosine_similarity(emb1["embedding"], emb2["embedding"])
        euc_dist = euclidean_distance(emb1["embedding"], emb2["embedding"])

        return {
            "entity_uuid_1": request.entity_uuid_1,
            "entity_uuid_2": request.entity_uuid_2,
            "cosine_similarity": round(cos_sim, 4),
            "euclidean_distance": round(euc_dist, 4),
            "is_similar": cos_sim >= 0.8,
            "similarity_level": _get_similarity_level(cos_sim)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Embedding comparison error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/metrics/{entity_uuid}", response_model=ComparisonMetrics)
async def get_embedding_metrics(
    entity_uuid: str,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Get comparison metrics between UHT code and embedding for an entity.

    Compares the 32-dimensional UHT binary vector with the 1536-dimensional
    embedding to analyze correlation between syntactic and semantic classifications.
    """
    try:
        # Get entity with embedding
        entity = await _get_entity_with_traits(neo4j_client, entity_uuid)
        if not entity:
            raise HTTPException(status_code=404, detail="Entity not found")

        # Get embedding
        embedding_data = await neo4j_client.get_entity_embedding(entity_uuid)
        if not embedding_data or not embedding_data.get("embedding"):
            raise HTTPException(
                status_code=404,
                detail="Entity does not have an embedding. Generate one first."
            )

        # Calculate comparison metrics
        binary_rep = entity.get("binary_representation", "0" * 32)
        metrics = calculate_comparison_metrics(
            entity_uuid,
            binary_rep,
            embedding_data["embedding"]
        )

        return ComparisonMetrics(**metrics)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Metrics calculation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=Dict[str, Any])
async def get_all_embeddings(
    limit: int = 100,
    offset: int = 0,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Get all entities with embeddings.

    Returns paginated list of entities that have embeddings stored.
    Note: Full embedding vectors are included, which can be large.
    """
    try:
        embeddings = await neo4j_client.get_all_embeddings(limit=limit, offset=offset)
        counts = await neo4j_client.count_entities_with_embeddings()

        return {
            "embeddings": embeddings,
            "returned_count": len(embeddings),
            "total_with_embeddings": counts["with_embeddings"],
            "total_without_embeddings": counts["without_embeddings"],
            "total_entities": counts["total"],
            "offset": offset,
            "limit": limit,
            "has_more": offset + len(embeddings) < counts["with_embeddings"]
        }

    except Exception as e:
        logger.error(f"Get all embeddings error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search", response_model=Dict[str, Any])
async def semantic_search(
    request: EmbeddingSearchRequest,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
    orchestrator: EmbeddingOrchestrator = Depends(get_embedding_orchestrator)
):
    """
    Search for entities semantically similar to a query.

    **No authentication required** - search is a read operation.

    Generates an embedding for the query text and finds the most similar
    entities using the Neo4j vector index.
    """
    try:
        # Generate embedding for query
        result = await orchestrator.client.generate_embedding(
            request.query,
            entity_name="search_query"
        )

        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=f"Query embedding failed: {result.get('error')}"
            )

        # Search using vector index
        similar_entities = await neo4j_client.find_similar_by_embedding(
            embedding=result["embedding"],
            limit=request.limit,
            min_score=request.min_score
        )

        return {
            "query": request.query,
            "results": similar_entities,
            "result_count": len(similar_entities),
            "min_score": request.min_score,
            "query_tokens": result.get("tokens_used", 0),
            "query_cost_usd": result.get("cost_usd", 0)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Semantic search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch", response_model=Dict[str, Any])
async def generate_batch_embeddings(
    request: BatchEmbeddingRequest,
    background_tasks: BackgroundTasks,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
    key_data: dict = Depends(require_embeddings)
):
    """
    Generate embeddings for multiple entities.

    **Requires API key with 'embeddings' scope.**

    Processes embeddings in the background and returns immediately.
    Use GET /stats to check progress.
    """
    try:
        # Estimate cost
        estimated_cost = len(request.entity_uuids) * 0.000006

        # Start background task
        background_tasks.add_task(
            _process_batch_embeddings,
            request.entity_uuids,
            request.max_concurrent
        )

        return {
            "status": "started",
            "entity_count": len(request.entity_uuids),
            "estimated_cost_usd": round(estimated_cost, 6),
            "message": "Batch embedding generation started. Use GET /stats to check progress."
        }

    except Exception as e:
        logger.error(f"Batch embedding error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats", response_model=Dict[str, Any])
async def get_embedding_stats(
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Get embedding statistics.

    Returns counts of entities with/without embeddings and coverage percentage.
    """
    try:
        counts = await neo4j_client.count_entities_with_embeddings()

        coverage = (
            (counts["with_embeddings"] / counts["total"] * 100)
            if counts["total"] > 0 else 0
        )

        return {
            "with_embeddings": counts["with_embeddings"],
            "without_embeddings": counts["without_embeddings"],
            "total_entities": counts["total"],
            "coverage_percent": round(coverage, 2),
            "embedding_model": os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
            "embedding_dimensions": 1536
        }

    except Exception as e:
        logger.error(f"Stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== Helper Functions =====

async def _get_entity_with_traits(
    neo4j_client: Neo4jClient,
    entity_uuid: str
) -> Optional[Dict[str, Any]]:
    """Get entity with trait evaluations from Neo4j"""
    query = """
    MATCH (e:Entity {uuid: $uuid})
    OPTIONAL MATCH (e)-[r:HAS_TRAIT]->(t:Trait)
    WITH e, collect({
        trait_name: t.name,
        applicable: r.applicable,
        confidence: r.confidence
    }) as traits
    RETURN e.uuid as uuid,
           e.name as name,
           e.description as description,
           e.uht_code as uht_code,
           e.binary_representation as binary_representation,
           traits
    """

    result = await neo4j_client.execute_query(query, uuid=entity_uuid)
    if not result:
        return None

    record = result[0]

    # Build trait evaluations list
    trait_evaluations = []
    for trait in record.get("traits", []):
        if trait.get("trait_name"):
            trait_evaluations.append({
                "trait_name": trait["trait_name"],
                "applicable": trait.get("applicable", False),
                "confidence": trait.get("confidence", 0)
            })

    return {
        "uuid": record["uuid"],
        "name": record["name"],
        "description": record.get("description", ""),
        "uht_code": record.get("uht_code", ""),
        "binary_representation": record.get("binary_representation", "0" * 32),
        "trait_evaluations": trait_evaluations
    }


async def _get_or_generate_embedding(
    neo4j_client: Neo4jClient,
    orchestrator: EmbeddingOrchestrator,
    entity_uuid: str
) -> Optional[Dict[str, Any]]:
    """Get existing embedding or generate new one"""
    # Try to get existing embedding
    embedding_data = await neo4j_client.get_entity_embedding(entity_uuid)
    if embedding_data and embedding_data.get("embedding"):
        return embedding_data

    # Generate new embedding
    entity = await _get_entity_with_traits(neo4j_client, entity_uuid)
    if not entity:
        return None

    result = await orchestrator.generate_entity_embedding(entity)
    if not result.get("success"):
        return None

    # Store in Neo4j
    await neo4j_client.store_entity_embedding(
        uuid=entity_uuid,
        embedding=result["embedding"],
        model_used=result["model_used"]
    )

    return {
        "entity_uuid": entity_uuid,
        "embedding": result["embedding"],
        "dimension": result["dimension"],
        "model_used": result["model_used"]
    }


def _get_similarity_level(cosine_similarity: float) -> str:
    """Convert cosine similarity to human-readable level"""
    if cosine_similarity >= 0.95:
        return "nearly identical"
    elif cosine_similarity >= 0.85:
        return "very similar"
    elif cosine_similarity >= 0.7:
        return "similar"
    elif cosine_similarity >= 0.5:
        return "somewhat related"
    else:
        return "different"


async def _process_batch_embeddings(
    entity_uuids: List[str],
    max_concurrent: int
):
    """Background task to process batch embeddings"""
    import asyncio

    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )
    await neo4j.connect()

    orchestrator = EmbeddingOrchestrator()

    try:
        # Get all entities
        entities = []
        for uuid in entity_uuids:
            entity = await _get_entity_with_traits(neo4j, uuid)
            if entity:
                entities.append(entity)

        if not entities:
            logger.warning("No entities found for batch embedding")
            return

        # Generate embeddings in batch
        results = await orchestrator.generate_batch_entity_embeddings(
            entities,
            max_concurrent=max_concurrent
        )

        # Store results
        success_count = 0
        for entity, result in zip(entities, results):
            if result.get("success"):
                await neo4j.store_entity_embedding(
                    uuid=entity["uuid"],
                    embedding=result["embedding"],
                    model_used=result["model_used"]
                )
                success_count += 1

        logger.info(f"Batch embedding completed: {success_count}/{len(entities)} successful")

    except Exception as e:
        logger.error(f"Batch embedding failed: {e}")
    finally:
        await neo4j.close()
