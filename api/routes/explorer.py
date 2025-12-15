"""
Explorer API routes for UHT Factory.

Provides endpoints for exploring the relationship between
semantic embeddings and UHT structural codes.
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import Dict, Any, List, Optional, Literal
import os
import logging
import json
from datetime import datetime

from pydantic import BaseModel, Field
from db.neo4j_client import Neo4jClient
from db.redis_client import RedisClient
from workers.projection_worker import (
    ProjectionWorker,
    compute_correlation_sample,
    find_outliers,
    get_dominant_layer,
    count_active_traits,
    compute_uht_similarity,
    compute_cosine_similarity
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Cache TTL in seconds
PROJECTION_CACHE_TTL = 3600  # 1 hour
CORRELATION_CACHE_TTL = 3600  # 1 hour


# ===== Request/Response Models =====

class ProjectionPoint(BaseModel):
    uuid: str
    name: str
    uht_code: str
    umap_x: Optional[float] = None
    umap_y: Optional[float] = None
    tsne_x: Optional[float] = None
    tsne_y: Optional[float] = None
    dominant_layer: str
    trait_count: int
    image_url: Optional[str] = None


class CorrelationDataPoint(BaseModel):
    entity1_uuid: str
    entity1_name: str
    entity2_uuid: str
    entity2_name: str
    embedding_similarity: float
    uht_similarity: float


class NeighborInfo(BaseModel):
    uuid: str
    name: str
    uht_code: str
    similarity: Optional[float] = None
    hamming_distance: Optional[int] = None
    image_url: Optional[str] = None


class NeighborComparison(BaseModel):
    entity_uuid: str
    entity_name: str
    embedding_neighbors: List[NeighborInfo]
    hamming_neighbors: List[NeighborInfo]
    overlap_count: int
    jaccard_similarity: float


class OutlierEntity(BaseModel):
    entity1_uuid: str
    entity1_name: str
    entity1_uht_code: str = ""
    entity2_uuid: str
    entity2_name: str
    entity2_uht_code: str = ""
    embedding_similarity: float
    uht_similarity: float
    disagreement: float
    type: str


class ComputeProjectionsRequest(BaseModel):
    method: Literal['umap', 'tsne', 'both'] = Field(default='both')
    force: bool = Field(default=False, description="Force recomputation even if exists")


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


async def get_redis_client():
    """Get Redis client instance"""
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6383")
    return RedisClient(redis_url)


# ===== Endpoints =====

@router.get("/projections", response_model=Dict[str, Any])
async def get_all_projections(
    method: Literal['umap', 'tsne'] = 'umap',
    limit: int = 15000,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Get all 2D projection coordinates for visualization.

    Returns entities that have projection coordinates computed.
    """
    try:
        x_field = f"{method}_x"
        y_field = f"{method}_y"

        query = f"""
        MATCH (e:Entity)
        WHERE e.{x_field} IS NOT NULL AND e.{y_field} IS NOT NULL
        RETURN e.uuid as uuid,
               e.name as name,
               e.uht_code as uht_code,
               e.{x_field} as x,
               e.{y_field} as y,
               e.image_url as image_url
        LIMIT $limit
        """

        result = await neo4j_client.execute_query(query, limit=limit)

        points = []
        for record in result:
            uht_code = record.get('uht_code', '00000000')
            points.append({
                'uuid': record.get('uuid'),
                'name': record.get('name'),
                'uht_code': uht_code,
                'x': record.get('x'),
                'y': record.get('y'),
                'dominant_layer': get_dominant_layer(uht_code),
                'trait_count': count_active_traits(uht_code),
                'image_url': record.get('image_url')
            })

        # Calculate bounds for visualization
        if points:
            xs = [p['x'] for p in points]
            ys = [p['y'] for p in points]
            bounds = {
                'min_x': min(xs),
                'max_x': max(xs),
                'min_y': min(ys),
                'max_y': max(ys)
            }
        else:
            bounds = {'min_x': -1, 'max_x': 1, 'min_y': -1, 'max_y': 1}

        return {
            'method': method,
            'count': len(points),
            'bounds': bounds,
            'points': points
        }

    except Exception as e:
        logger.error(f"Error fetching projections: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await neo4j_client.close()


@router.get("/projections/stats")
async def get_projection_stats(
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """Get statistics about projection coverage."""
    try:
        query = """
        MATCH (e:Entity)
        RETURN count(e) as total_entities,
               sum(CASE WHEN e.embedding IS NOT NULL THEN 1 ELSE 0 END) as with_embedding,
               sum(CASE WHEN e.umap_x IS NOT NULL THEN 1 ELSE 0 END) as with_umap,
               sum(CASE WHEN e.tsne_x IS NOT NULL THEN 1 ELSE 0 END) as with_tsne
        """

        result = await neo4j_client.execute_query(query)

        if result:
            record = result[0]
            return {
                'total_entities': record.get('total_entities', 0),
                'with_embedding': record.get('with_embedding', 0),
                'with_umap': record.get('with_umap', 0),
                'with_tsne': record.get('with_tsne', 0)
            }

        return {'total_entities': 0, 'with_embedding': 0, 'with_umap': 0, 'with_tsne': 0}

    except Exception as e:
        logger.error(f"Error fetching projection stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await neo4j_client.close()


@router.get("/correlations")
async def get_correlations(
    sample_size: int = 5000,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Get correlation data between embedding similarity and UHT similarity.

    Returns sampled entity pairs with both similarity scores.
    """
    try:
        # Try to get from cache first
        redis = await get_redis_client()
        cache_key = f"explorer:correlations:{sample_size}"

        cached = await redis.get(cache_key)
        if cached:
            return json.loads(cached)

        # Fetch entities with embeddings
        query = """
        MATCH (e:Entity)
        WHERE e.embedding IS NOT NULL AND e.uht_code IS NOT NULL
        RETURN e.uuid as uuid, e.name as name, e.uht_code as uht_code, e.embedding as embedding
        LIMIT 15000
        """

        result = await neo4j_client.execute_query(query)

        entities = [
            {
                'uuid': r.get('uuid'),
                'name': r.get('name', 'Unknown'),
                'uht_code': r.get('uht_code'),
                'embedding': r.get('embedding')
            }
            for r in result if r.get('embedding')
        ]

        if len(entities) < 2:
            return {'samples': [], 'correlation': 0, 'sample_size': 0}

        # Compute correlation sample
        correlation_data = compute_correlation_sample(entities, sample_size)

        # Compute Pearson correlation coefficient
        if correlation_data:
            emb_sims = [d['embedding_similarity'] for d in correlation_data]
            uht_sims = [d['uht_similarity'] for d in correlation_data]
            n = len(emb_sims)
            mean_emb = sum(emb_sims) / n
            mean_uht = sum(uht_sims) / n
            cov = sum((e - mean_emb) * (u - mean_uht) for e, u in zip(emb_sims, uht_sims)) / n
            std_emb = (sum((e - mean_emb) ** 2 for e in emb_sims) / n) ** 0.5
            std_uht = (sum((u - mean_uht) ** 2 for u in uht_sims) / n) ** 0.5
            correlation = cov / (std_emb * std_uht) if std_emb > 0 and std_uht > 0 else 0
        else:
            correlation = 0

        response = {
            'samples': correlation_data,
            'correlation': round(correlation, 4),
            'sample_size': len(correlation_data)
        }

        # Cache result
        await redis.setex(cache_key, CORRELATION_CACHE_TTL, json.dumps(response))

        return response

    except Exception as e:
        logger.error(f"Error computing correlations: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await neo4j_client.close()


@router.get("/neighbors/{entity_uuid}", response_model=NeighborComparison)
async def get_neighbor_comparison(
    entity_uuid: str,
    k: int = 10,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Compare top-K neighbors by embedding similarity vs UHT Hamming distance.
    """
    try:
        # Get the target entity
        target_query = """
        MATCH (e:Entity {uuid: $uuid})
        RETURN e.uuid as uuid, e.name as name, e.uht_code as uht_code,
               e.embedding as embedding, e.image_url as image_url
        """

        target_result = await neo4j_client.execute_query(target_query, uuid=entity_uuid)

        if not target_result:
            raise HTTPException(status_code=404, detail="Entity not found")

        target = target_result[0]
        target_embedding = target.get('embedding')
        target_uht = target.get('uht_code')

        if not target_embedding:
            raise HTTPException(status_code=400, detail="Entity has no embedding")

        # Get embedding neighbors using vector index
        emb_query = """
        CALL db.index.vector.queryNodes('entity_embedding', $k_plus, $embedding)
        YIELD node, score
        WHERE node.uuid <> $uuid
        RETURN node.uuid as uuid, node.name as name, node.uht_code as uht_code,
               node.image_url as image_url, score as similarity
        LIMIT $k
        """

        emb_result = await neo4j_client.execute_query(
            emb_query,
            k_plus=k + 1,  # +1 because target might be included
            k=k,
            embedding=target_embedding,
            uuid=entity_uuid
        )

        embedding_neighbors = [
            NeighborInfo(
                uuid=r.get('uuid'),
                name=r.get('name'),
                uht_code=r.get('uht_code', '00000000'),
                similarity=round(r.get('similarity', 0), 4),
                image_url=r.get('image_url')
            )
            for r in emb_result
        ]

        # Get UHT neighbors by Hamming distance
        # We need to compute this manually since Neo4j doesn't have native Hamming
        uht_query = """
        MATCH (e:Entity)
        WHERE e.uuid <> $uuid AND e.uht_code IS NOT NULL
        RETURN e.uuid as uuid, e.name as name, e.uht_code as uht_code,
               e.image_url as image_url
        LIMIT 5000
        """

        uht_result = await neo4j_client.execute_query(uht_query, uuid=entity_uuid)

        # Compute Jaccard similarity for sorting and Hamming distance for display
        uht_with_metrics = []
        target_int = int(target_uht, 16) if target_uht else 0
        for r in uht_result:
            other_code = r.get('uht_code', '00000000')
            other_int = int(other_code, 16)

            # Jaccard similarity for sorting (better for sparse codes)
            jaccard_sim = compute_uht_similarity(target_uht, other_code)

            # Actual Hamming distance for display
            xor = target_int ^ other_int
            hamming_dist = bin(xor).count('1')

            uht_with_metrics.append({
                'uuid': r.get('uuid'),
                'name': r.get('name'),
                'uht_code': other_code,
                'jaccard_similarity': jaccard_sim,
                'hamming_distance': hamming_dist,
                'image_url': r.get('image_url')
            })

        # Sort by Jaccard similarity (descending - higher is more similar)
        uht_with_metrics.sort(key=lambda x: x['jaccard_similarity'], reverse=True)
        uht_neighbors = [
            NeighborInfo(
                uuid=item['uuid'],
                name=item['name'],
                uht_code=item['uht_code'],
                hamming_distance=item['hamming_distance'],
                image_url=item['image_url']
            )
            for item in uht_with_metrics[:k]
        ]

        # Compute overlap
        emb_uuids = set(n.uuid for n in embedding_neighbors)
        uht_uuids = set(n.uuid for n in uht_neighbors)
        overlap_uuids = list(emb_uuids & uht_uuids)

        # Agreement score (Jaccard)
        union = emb_uuids | uht_uuids
        agreement_score = len(overlap_uuids) / len(union) if union else 0

        return NeighborComparison(
            entity_uuid=entity_uuid,
            entity_name=target.get('name', ''),
            embedding_neighbors=embedding_neighbors,
            hamming_neighbors=uht_neighbors,
            overlap_count=len(overlap_uuids),
            jaccard_similarity=round(agreement_score, 4)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error computing neighbor comparison: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await neo4j_client.close()


@router.get("/outliers")
async def get_outliers(
    threshold: float = 0.3,
    limit: int = 50,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Get entity pairs where embedding and UHT similarity disagree most.

    Returns two categories:
    - semantic_only: High embedding similarity, low UHT similarity
    - structural_only: High UHT similarity, low embedding similarity
    """
    try:
        # Get correlation data first
        redis = await get_redis_client()
        cache_key = "explorer:correlations:5000"

        cached = await redis.get(cache_key)
        if cached:
            correlation_response = json.loads(cached)
            correlation_data = correlation_response.get('samples', [])
        else:
            # Fetch and compute if not cached
            query = """
            MATCH (e:Entity)
            WHERE e.embedding IS NOT NULL AND e.uht_code IS NOT NULL
            RETURN e.uuid as uuid, e.uht_code as uht_code, e.embedding as embedding
            LIMIT 15000
            """

            result = await neo4j_client.execute_query(query)

            entities = [
                {
                    'uuid': r.get('uuid'),
                    'uht_code': r.get('uht_code'),
                    'embedding': r.get('embedding')
                }
                for r in result if r.get('embedding')
            ]

            correlation_data = compute_correlation_sample(entities, 5000)

        # Find outliers
        outliers = find_outliers(correlation_data, threshold)

        # Enrich with entity names
        all_uuids = set()
        for item in outliers['semantic_only'][:limit] + outliers['structural_only'][:limit]:
            all_uuids.add(item['entity1_uuid'])
            all_uuids.add(item['entity2_uuid'])

        if all_uuids:
            name_query = """
            MATCH (e:Entity)
            WHERE e.uuid IN $uuids
            RETURN e.uuid as uuid, e.name as name, e.uht_code as uht_code
            """
            name_result = await neo4j_client.execute_query(name_query, uuids=list(all_uuids))
            uuid_to_info = {r['uuid']: {'name': r['name'], 'uht_code': r.get('uht_code', '')} for r in name_result}
        else:
            uuid_to_info = {}

        def enrich_outlier(item):
            info1 = uuid_to_info.get(item['entity1_uuid'], {'name': 'Unknown', 'uht_code': ''})
            info2 = uuid_to_info.get(item['entity2_uuid'], {'name': 'Unknown', 'uht_code': ''})
            return OutlierEntity(
                entity1_uuid=item['entity1_uuid'],
                entity1_name=info1['name'],
                entity1_uht_code=info1['uht_code'],
                entity2_uuid=item['entity2_uuid'],
                entity2_name=info2['name'],
                entity2_uht_code=info2['uht_code'],
                embedding_similarity=item['embedding_similarity'],
                uht_similarity=item['uht_similarity'],
                disagreement=item['disagreement'],
                type=item['type']
            )

        return {
            'threshold': threshold,
            'semantic_only': [enrich_outlier(o) for o in outliers['semantic_only'][:limit]],
            'structural_only': [enrich_outlier(o) for o in outliers['structural_only'][:limit]]
        }

    except Exception as e:
        logger.error(f"Error finding outliers: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await neo4j_client.close()


@router.post("/compute")
async def compute_projections(
    request: ComputeProjectionsRequest,
    background_tasks: BackgroundTasks,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Trigger computation of 2D projections for all entities.

    This is an admin endpoint that runs UMAP/t-SNE on all embeddings
    and stores the results in Neo4j.
    """
    try:
        # Check current status
        stats_query = """
        MATCH (e:Entity)
        WHERE e.embedding IS NOT NULL
        RETURN count(e) as total
        """

        result = await neo4j_client.execute_query(stats_query)
        total = result[0]['total'] if result else 0

        if total == 0:
            raise HTTPException(
                status_code=400,
                detail="No entities with embeddings found"
            )

        # Start background computation
        background_tasks.add_task(
            run_projection_computation,
            method=request.method,
            force=request.force
        )

        return {
            'status': 'started',
            'message': f'Computing {request.method} projections for {total} entities',
            'total_entities': total
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting projection computation: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await neo4j_client.close()


async def run_projection_computation(method: str, force: bool):
    """Background task to compute projections."""
    import numpy as np

    logger.info(f"Starting projection computation: method={method}, force={force}")

    try:
        neo4j = Neo4jClient(
            uri=os.getenv("NEO4J_URI"),
            user=os.getenv("NEO4J_USER"),
            password=os.getenv("NEO4J_PASSWORD")
        )
        await neo4j.connect()

        # Fetch all embeddings
        query = """
        MATCH (e:Entity)
        WHERE e.embedding IS NOT NULL
        RETURN e.uuid as uuid, e.embedding as embedding
        ORDER BY e.uuid
        """

        result = await neo4j.execute_query(query)

        if not result:
            logger.warning("No embeddings found")
            return

        uuids = [r['uuid'] for r in result]
        embeddings = np.array([r['embedding'] for r in result])

        logger.info(f"Loaded {len(uuids)} embeddings with shape {embeddings.shape}")

        worker = ProjectionWorker()

        # Compute UMAP
        if method in ['umap', 'both']:
            logger.info("Computing UMAP...")
            umap_proj = worker.compute_umap(embeddings)
            umap_proj = worker.normalize_projection(umap_proj)

            # Store UMAP projections
            for i, uuid in enumerate(uuids):
                await neo4j.execute_query(
                    """
                    MATCH (e:Entity {uuid: $uuid})
                    SET e.umap_x = $x, e.umap_y = $y, e.projection_updated = datetime()
                    """,
                    uuid=uuid,
                    x=float(umap_proj[i, 0]),
                    y=float(umap_proj[i, 1])
                )

            logger.info(f"Stored UMAP projections for {len(uuids)} entities")

        # Compute t-SNE
        if method in ['tsne', 'both']:
            logger.info("Computing t-SNE...")
            tsne_proj = worker.compute_tsne(embeddings)
            tsne_proj = worker.normalize_projection(tsne_proj)

            # Store t-SNE projections
            for i, uuid in enumerate(uuids):
                await neo4j.execute_query(
                    """
                    MATCH (e:Entity {uuid: $uuid})
                    SET e.tsne_x = $x, e.tsne_y = $y, e.projection_updated = datetime()
                    """,
                    uuid=uuid,
                    x=float(tsne_proj[i, 0]),
                    y=float(tsne_proj[i, 1])
                )

            logger.info(f"Stored t-SNE projections for {len(uuids)} entities")

        logger.info("Projection computation completed successfully")

    except Exception as e:
        logger.error(f"Projection computation failed: {e}")
    finally:
        await neo4j.close()
