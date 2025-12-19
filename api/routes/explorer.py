"""
Explorer API routes for UHT Factory.

Provides endpoints for exploring the relationship between
semantic embeddings and UHT structural codes.
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import Dict, Any, List, Optional, Literal
import asyncio
import os
import logging
import json
from datetime import datetime

from pydantic import BaseModel, Field
from collections import Counter
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

# Stop words for cluster labeling
STOP_WORDS = {
    'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'is',
    'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do',
    'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
    'shall', 'can', 'with', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'over', 'out',
    'up', 'down', 'off', 'about', 'against', 'not', 'no', 'but', 'if', 'then',
    'than', 'so', 'such', 'that', 'this', 'these', 'those', 'it', 'its'
}

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
    uht_umap_x: Optional[float] = None
    uht_umap_y: Optional[float] = None
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


class TourRequest(BaseModel):
    """Request to generate an LLM-guided tour through the embedding space."""
    tour_type: Literal['random_walk', 'theme', 'contrast', 'complexity', 'layer_journey'] = Field(
        default='theme',
        description="Type of tour to generate"
    )
    theme: Optional[str] = Field(
        default=None,
        description="Theme for 'theme' tour type (e.g., 'animals', 'technology')"
    )
    start_uuid: Optional[str] = Field(
        default=None,
        description="Optional starting entity UUID"
    )
    num_stops: int = Field(default=8, ge=3, le=20, description="Number of entities to visit")
    projection: Literal['umap', 'tsne', 'uht_umap'] = Field(
        default='umap',
        description="Projection method to use for coordinates"
    )


class TourStop(BaseModel):
    """A single stop on the tour."""
    uuid: str
    name: str
    uht_code: str
    x: float
    y: float
    narration: str
    image_url: Optional[str] = None


class TourResponse(BaseModel):
    """Response containing the generated tour."""
    tour_type: str
    theme: Optional[str]
    stops: List[TourStop]
    introduction: str
    conclusion: str


class SelectionDescribeRequest(BaseModel):
    """Request to describe a selection of entities."""
    uuids: List[str] = Field(..., min_length=1, max_length=100)


class SelectionDescribeResponse(BaseModel):
    """Response with LLM-generated description of selection."""
    description: str
    common_traits: List[str]
    suggested_label: str
    entity_count: int


class SimilarityExplainRequest(BaseModel):
    """Request to explain similarity pattern."""
    reference_uuid: str
    sample_uuids: List[str] = Field(..., min_length=1, max_length=20)


class SimilarityExplainResponse(BaseModel):
    """Response explaining the similarity pattern."""
    reference_name: str
    reference_code: str
    explanation: str
    pattern_summary: str


class SubsetProjectionRequest(BaseModel):
    """Request to compute projection for a subset of entities."""
    uuids: List[str] = Field(..., min_length=3, max_length=10000, description="Entity UUIDs to include")
    method: Literal['umap', 'tsne', 'pacmap'] = Field(default='umap', description="Projection method")


class SubsetProjectionPoint(BaseModel):
    """A point in the subset projection."""
    uuid: str
    name: str
    uht_code: str
    x: float
    y: float
    image_url: Optional[str] = None


class SubsetCluster(BaseModel):
    """A cluster in the subset projection."""
    cluster_id: int
    centroid_x: float
    centroid_y: float
    label: str
    size: int
    dominant_layer: str


class SubsetProjectionResponse(BaseModel):
    """Response with computed subset projection."""
    method: str
    entity_count: int
    points: List[SubsetProjectionPoint]
    clusters: List[SubsetCluster] = []
    computation_time_ms: int


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
    method: Literal['umap', 'tsne', 'uht_umap'] = 'umap',
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
               sum(CASE WHEN e.tsne_x IS NOT NULL THEN 1 ELSE 0 END) as with_tsne,
               sum(CASE WHEN e.uht_umap_x IS NOT NULL THEN 1 ELSE 0 END) as with_uht_umap
        """

        result = await neo4j_client.execute_query(query)

        if result:
            record = result[0]
            return {
                'total_entities': record.get('total_entities', 0),
                'with_embedding': record.get('with_embedding', 0),
                'with_umap': record.get('with_umap', 0),
                'with_tsne': record.get('with_tsne', 0),
                'with_uht_umap': record.get('with_uht_umap', 0)
            }

        return {'total_entities': 0, 'with_embedding': 0, 'with_umap': 0, 'with_tsne': 0, 'with_uht_umap': 0}

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


@router.post("/subset-projection", response_model=SubsetProjectionResponse)
async def compute_subset_projection(
    request: SubsetProjectionRequest,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Compute a new UMAP/t-SNE projection for a subset of entities.

    This allows users to select entities via lasso or filters and
    recompute the projection to see relationships within that subset.
    """
    import time
    import numpy as np

    logger.info(f"Subset projection request: {len(request.uuids)} UUIDs, method={request.method}")
    start_time = time.time()

    try:
        # Fetch embeddings for the selected entities
        query = """
        MATCH (e:Entity)
        WHERE e.uuid IN $uuids AND e.embedding IS NOT NULL
        RETURN e.uuid as uuid, e.name as name, e.uht_code as uht_code,
               e.embedding as embedding, e.image_url as image_url
        """
        results = await neo4j_client.execute_query(query, uuids=request.uuids)

        if not results or len(results) < 3:
            raise HTTPException(
                status_code=400,
                detail=f"Need at least 3 entities with embeddings, found {len(results) if results else 0}"
            )

        # Extract embeddings into numpy array
        embeddings = []
        entity_data = []

        for r in results:
            if r['embedding']:
                embeddings.append(r['embedding'])
                entity_data.append({
                    'uuid': r['uuid'],
                    'name': r['name'],
                    'uht_code': r['uht_code'] or '00000000',
                    'image_url': r.get('image_url')
                })

        if len(embeddings) < 3:
            raise HTTPException(
                status_code=400,
                detail=f"Need at least 3 entities with embeddings, found {len(embeddings)}"
            )

        embeddings_array = np.array(embeddings)

        # Compute projection
        worker = ProjectionWorker()

        # Adjust parameters for subset size
        n_entities = len(embeddings)

        if request.method == 'umap':
            # Adjust n_neighbors for smaller datasets
            n_neighbors = min(15, max(2, n_entities // 5))
            projection = worker.compute_umap(
                embeddings_array,
                n_neighbors=n_neighbors,
                min_dist=0.1
            )
        elif request.method == 'pacmap':
            # Adjust n_neighbors for smaller datasets
            n_neighbors = min(10, max(2, n_entities // 5))
            projection = worker.compute_pacmap(
                embeddings_array,
                n_neighbors=n_neighbors
            )
        else:  # tsne
            # Adjust perplexity for smaller datasets
            perplexity = min(30, max(5, n_entities // 4))
            projection = worker.compute_tsne(
                embeddings_array,
                perplexity=perplexity
            )

        # Normalize to [-1, 1] range
        x_coords = projection[:, 0]
        y_coords = projection[:, 1]

        x_min, x_max = x_coords.min(), x_coords.max()
        y_min, y_max = y_coords.min(), y_coords.max()

        x_range = x_max - x_min if x_max != x_min else 1
        y_range = y_max - y_min if y_max != y_min else 1

        # Normalize to [-0.9, 0.9] to leave some margin
        x_normalized = ((x_coords - x_min) / x_range) * 1.8 - 0.9
        y_normalized = ((y_coords - y_min) / y_range) * 1.8 - 0.9

        # Build points list
        points = []
        for i, entity in enumerate(entity_data):
            points.append(SubsetProjectionPoint(
                uuid=entity['uuid'],
                name=entity['name'],
                uht_code=entity['uht_code'],
                x=float(x_normalized[i]),
                y=float(y_normalized[i]),
                image_url=entity.get('image_url')
            ))

        # Compute clusters on the subset projection using HDBSCAN for better granularity
        clusters = []
        if n_entities >= 10:  # Only cluster if we have enough points
            import hdbscan

            coords = np.column_stack([x_normalized, y_normalized])

            # Adaptive min_cluster_size based on data size for more granularity
            # Use smaller values to capture outlying clusters
            if n_entities < 50:
                min_cluster_size = 3
                min_samples = 2
            elif n_entities < 200:
                min_cluster_size = 5
                min_samples = 2
            elif n_entities < 1000:
                min_cluster_size = 8
                min_samples = 3
            else:
                # For large subsets, use smaller min_cluster_size to catch outliers
                # Aim for clusters of at least 15-20 entities
                min_cluster_size = max(15, n_entities // 100)
                min_samples = 3

            clustering = hdbscan.HDBSCAN(
                min_cluster_size=min_cluster_size,
                min_samples=min_samples,
                cluster_selection_epsilon=0.0,  # Don't merge small clusters
                cluster_selection_method='leaf',  # More granular clusters
                allow_single_cluster=False  # Force finding multiple clusters
            ).fit(coords)
            cluster_labels = clustering.labels_

            unique_labels = set(cluster_labels)
            unique_labels.discard(-1)

            # For noise points (-1), try to create small clusters using DBSCAN with smaller eps
            noise_mask = cluster_labels == -1
            noise_count = np.sum(noise_mask)
            if noise_count >= 3 and noise_count < n_entities * 0.5:  # Only if reasonable noise
                from sklearn.cluster import DBSCAN
                noise_coords = coords[noise_mask]
                # Use small eps to find tight outlier groups
                noise_clustering = DBSCAN(eps=0.08, min_samples=2).fit(noise_coords)
                noise_labels = noise_clustering.labels_

                # Add noise clusters with offset IDs
                max_label = max(unique_labels) if unique_labels else -1
                noise_unique = set(noise_labels)
                noise_unique.discard(-1)

                # Map noise cluster indices back to original indices
                noise_indices = np.where(noise_mask)[0]
                for noise_cluster_id in noise_unique:
                    new_cluster_id = max_label + 1 + noise_cluster_id
                    for idx, noise_idx in enumerate(noise_indices):
                        if noise_labels[idx] == noise_cluster_id:
                            cluster_labels[noise_idx] = new_cluster_id
                    unique_labels.add(new_cluster_id)

            if unique_labels:
                # Collect cluster data
                clusters_data = []
                for cluster_id in sorted(unique_labels):
                    mask = cluster_labels == cluster_id
                    cluster_coords = coords[mask]
                    cluster_names = [entity_data[i]['name'] for i in range(len(entity_data)) if mask[i]]
                    cluster_codes = [entity_data[i]['uht_code'] for i in range(len(entity_data)) if mask[i]]

                    centroid_x = float(np.mean(cluster_coords[:, 0]))
                    centroid_y = float(np.mean(cluster_coords[:, 1]))

                    # Find dominant layer
                    layer_counts = Counter()
                    for code in cluster_codes:
                        layer_counts[get_dominant_layer(code)] += 1
                    dominant_layer = layer_counts.most_common(1)[0][0] if layer_counts else 'Physical'

                    clusters_data.append({
                        'id': int(cluster_id),
                        'names': cluster_names,
                        'layer': dominant_layer,
                        'size': int(np.sum(mask)),
                        'centroid_x': centroid_x,
                        'centroid_y': centroid_y
                    })

                # Generate labels in parallel
                logger.info(f"Generating labels for {len(clusters_data)} subset clusters...")
                generated_labels = await generate_labels_parallel(clusters_data, max_concurrent=8)

                for data in clusters_data:
                    label = generated_labels.get(data['id'])
                    if not label:
                        label = extract_keyword_label(data['names'])
                    if not label:
                        label = f"Group {data['id'] + 1}"

                    clusters.append(SubsetCluster(
                        cluster_id=data['id'],
                        centroid_x=data['centroid_x'],
                        centroid_y=data['centroid_y'],
                        label=label,
                        size=data['size'],
                        dominant_layer=data['layer']
                    ))

        elapsed_ms = int((time.time() - start_time) * 1000)

        return SubsetProjectionResponse(
            method=request.method,
            entity_count=len(points),
            points=points,
            clusters=[c.model_dump() for c in clusters],
            computation_time_ms=elapsed_ms
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Subset projection failed: {e}")
        raise HTTPException(status_code=500, detail=f"Projection computation failed: {str(e)}")
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


class ClusterLabel(BaseModel):
    cluster_id: int
    centroid_x: float
    centroid_y: float
    label: str
    count: int
    size: int  # Same as count, for frontend adaptive sizing
    dominant_layer: str


# Multi-resolution DBSCAN configurations (7 levels)
RESOLUTION_CONFIGS = {
    'level1': {'eps': 0.12, 'min_samples': 80},   # Most zoomed out - very large clusters
    'level2': {'eps': 0.08, 'min_samples': 50},   # Zoomed out
    'level3': {'eps': 0.06, 'min_samples': 35},   # Slightly zoomed out
    'level4': {'eps': 0.04, 'min_samples': 25},   # Medium zoom
    'level5': {'eps': 0.03, 'min_samples': 18},   # Slightly zoomed in
    'level6': {'eps': 0.02, 'min_samples': 12},   # Zoomed in
    'level7': {'eps': 0.015, 'min_samples': 8},   # Most zoomed in - fine-grained clusters
}

# Cache TTL: 24 hours for LLM-generated labels
CLUSTER_CACHE_TTL = 86400


async def generate_cluster_label_llm(
    cluster_names: List[str],
    dominant_layer: str,
    cluster_size: int
) -> str:
    """Generate a compelling cluster label using LLM."""
    try:
        from workers.llm_client import OpenRouterClient

        # Sample up to 15 names for the prompt
        sample_names = cluster_names[:15] if len(cluster_names) > 15 else cluster_names

        prompt = f"""Given these entities from a semantic cluster:
{', '.join(sample_names)}

Dominant category: {dominant_layer}
Cluster size: {cluster_size} entities

Generate a short, compelling label (2-4 words) that captures what unifies these entities semantically.
Be specific and evocative, not generic. Use title case.

Examples of good labels: "Marine Mammals", "Renaissance Art", "Quantum Phenomena", "Kitchen Appliances", "Ancient Civilizations"
Examples of bad labels: "Things", "Misc Items", "Various Objects", "Mixed Entities"

Respond with ONLY the label, nothing else."""

        client = OpenRouterClient()
        label = await client.get_completion(prompt, temperature=0.4)

        # Clean up the response
        label = label.strip().strip('"').strip("'")

        # Validate: should be 2-4 words, reasonable length
        words = label.split()
        if len(words) > 5 or len(label) > 40:
            # Truncate if too long
            label = ' '.join(words[:3])

        return label

    except Exception as e:
        logger.warning(f"LLM label generation failed: {e}, falling back to keyword extraction")
        return None


def extract_keyword_label(cluster_names: List[str]) -> str:
    """Fallback: Extract label from entity names using keyword frequency."""
    word_counts = Counter()
    for name in cluster_names:
        words = name.lower().replace('-', ' ').replace('_', ' ').split()
        for word in words:
            if word not in STOP_WORDS and len(word) >= 3 and word.isalpha():
                word_counts[word] += 1

    top_words = word_counts.most_common(3)
    if top_words:
        label_words = [w[0].capitalize() for w in top_words[:2]]
        return ' / '.join(label_words)
    return None


async def generate_labels_parallel(
    clusters_data: List[Dict[str, Any]],
    max_concurrent: int = 8
) -> Dict[int, str]:
    """
    Generate labels for multiple clusters in parallel.

    Args:
        clusters_data: List of dicts with 'id', 'names', 'layer', 'size' keys
        max_concurrent: Maximum number of concurrent LLM calls

    Returns:
        Dict mapping cluster_id to generated label
    """
    semaphore = asyncio.Semaphore(max_concurrent)

    async def generate_one(cluster_id: int, names: List[str], layer: str, size: int):
        async with semaphore:
            try:
                label = await generate_cluster_label_llm(names, layer, size)
                return cluster_id, label
            except Exception as e:
                logger.warning(f"Parallel label generation failed for cluster {cluster_id}: {e}")
                return cluster_id, None

    tasks = [
        generate_one(c['id'], c['names'], c['layer'], c['size'])
        for c in clusters_data
    ]

    results = await asyncio.gather(*tasks)
    return {cid: label for cid, label in results if label is not None}


@router.get("/clusters", response_model=Dict[str, Any])
async def get_cluster_labels(
    method: Literal['umap', 'tsne', 'uht', 'uht_umap'] = 'umap',
    resolution: Literal['level1', 'level2', 'level3', 'level4', 'level5', 'level6', 'level7'] = 'level7',
    use_llm: bool = True,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Get cluster labels for the 2D projection.

    7-level multi-resolution clustering with LLM-generated labels:
    - level1: Very large clusters (scale < 1.0)
    - level2: Large clusters (scale 1.0-1.5)
    - level3: Medium-large clusters (scale 1.5-2.0)
    - level4: Medium clusters (scale 2.0-3.0) [default]
    - level5: Medium-small clusters (scale 3.0-4.5)
    - level6: Small clusters (scale 4.5-6.0)
    - level7: Fine-grained clusters (scale > 6.0)
    """
    try:
        import numpy as np
        from sklearn.cluster import DBSCAN

        # Check cache first
        redis = await get_redis_client()
        cache_key = f"explorer:clusters:{method}:{resolution}"

        cached = await redis.get(cache_key)
        if cached:
            return json.loads(cached)

        x_field = f"{method}_x"
        y_field = f"{method}_y"

        # Fetch projection data with names
        query = f"""
        MATCH (e:Entity)
        WHERE e.{x_field} IS NOT NULL AND e.{y_field} IS NOT NULL
        RETURN e.uuid as uuid,
               e.name as name,
               e.uht_code as uht_code,
               e.{x_field} as x,
               e.{y_field} as y
        """

        result = await neo4j_client.execute_query(query)

        config = RESOLUTION_CONFIGS[resolution]
        if len(result) < config['min_samples']:
            return {'method': method, 'resolution': resolution, 'clusters': []}

        # Prepare data for clustering
        points = np.array([[r['x'], r['y']] for r in result])
        names = [r.get('name', '') for r in result]
        uht_codes = [r.get('uht_code', '00000000') for r in result]

        # Run DBSCAN with resolution-specific parameters
        clustering = DBSCAN(
            eps=config['eps'],
            min_samples=config['min_samples']
        ).fit(points)
        labels = clustering.labels_

        # Process each cluster - collect data first
        unique_labels = set(labels)
        unique_labels.discard(-1)  # Remove noise label

        clusters_data = []
        for cluster_id in sorted(unique_labels):
            mask = labels == cluster_id
            cluster_points = points[mask]
            cluster_names = [names[i] for i in range(len(names)) if mask[i]]
            cluster_uht_codes = [uht_codes[i] for i in range(len(uht_codes)) if mask[i]]

            # Compute centroid
            centroid_x = float(np.mean(cluster_points[:, 0]))
            centroid_y = float(np.mean(cluster_points[:, 1]))

            # Find dominant layer for this cluster
            layer_counts = Counter()
            for code in cluster_uht_codes:
                layer = get_dominant_layer(code)
                layer_counts[layer] += 1
            dominant_layer = layer_counts.most_common(1)[0][0] if layer_counts else 'Physical'

            cluster_size = int(np.sum(mask))

            clusters_data.append({
                'id': int(cluster_id),
                'names': cluster_names,
                'layer': dominant_layer,
                'size': cluster_size,
                'centroid_x': centroid_x,
                'centroid_y': centroid_y
            })

        # Generate all labels in parallel (much faster than sequential)
        generated_labels = {}
        if use_llm and clusters_data:
            logger.info(f"Generating labels for {len(clusters_data)} clusters in parallel...")
            generated_labels = await generate_labels_parallel(clusters_data, max_concurrent=8)
            logger.info(f"Generated {len(generated_labels)} labels via LLM")

        # Build cluster objects with labels
        clusters = []
        for data in clusters_data:
            label = generated_labels.get(data['id'])
            if not label:
                label = extract_keyword_label(data['names'])
            if not label:
                label = f"Cluster {data['id']}"

            clusters.append(ClusterLabel(
                cluster_id=data['id'],
                centroid_x=data['centroid_x'],
                centroid_y=data['centroid_y'],
                label=label,
                count=data['size'],
                size=data['size'],
                dominant_layer=data['layer']
            ))

        response = {
            'method': method,
            'resolution': resolution,
            'total_points': len(result),
            'clustered_points': int(np.sum(labels != -1)),
            'noise_points': int(np.sum(labels == -1)),
            'clusters': [c.model_dump() for c in clusters]
        }

        # Cache for 24 hours (LLM labels don't change often)
        await redis.setex(cache_key, CLUSTER_CACHE_TTL, json.dumps(response))

        return response

    except ImportError as e:
        logger.error(f"Missing dependency for clustering: {e}")
        raise HTTPException(status_code=500, detail="Clustering dependencies not installed")
    except Exception as e:
        logger.error(f"Error computing clusters: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await neo4j_client.close()


@router.post("/clusters/compute")
async def compute_all_cluster_labels(
    method: Literal['umap', 'tsne'] = 'umap',
    background_tasks: BackgroundTasks = None,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Pre-compute cluster labels for all resolution levels.

    This endpoint triggers background computation of clusters and LLM labels
    for macro, meso, and micro resolutions. Use this after projection data changes.
    """
    try:
        # Clear existing cache for this method
        redis = await get_redis_client()
        for resolution in ['level1', 'level2', 'level3', 'level4', 'level5', 'level6', 'level7']:
            cache_key = f"explorer:clusters:{method}:{resolution}"
            await redis.delete(cache_key)

        # Start background computation for all resolutions
        if background_tasks:
            background_tasks.add_task(
                compute_clusters_background,
                method=method
            )

            return {
                'status': 'started',
                'message': f'Computing clusters for all resolutions ({method})',
                'resolutions': ['level1', 'level2', 'level3', 'level4', 'level5', 'level6', 'level7']
            }
        else:
            # If no background tasks, compute synchronously
            results = {}
            for resolution in ['level1', 'level2', 'level3', 'level4', 'level5', 'level6', 'level7']:
                # Fetch clusters (will compute and cache)
                response = await get_cluster_labels(
                    method=method,
                    resolution=resolution,
                    use_llm=True,
                    neo4j_client=neo4j_client
                )
                results[resolution] = len(response.get('clusters', []))

            return {
                'status': 'completed',
                'clusters_per_resolution': results
            }

    except Exception as e:
        logger.error(f"Error starting cluster computation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def compute_clusters_background(method: str):
    """Background task to compute clusters for all resolutions."""
    logger.info(f"Starting background cluster computation for {method}")

    try:
        neo4j = Neo4jClient(
            uri=os.getenv("NEO4J_URI"),
            user=os.getenv("NEO4J_USER"),
            password=os.getenv("NEO4J_PASSWORD")
        )
        await neo4j.connect()

        for resolution in ['level1', 'level2', 'level3', 'level4', 'level5', 'level6', 'level7']:
            logger.info(f"Computing {resolution} clusters...")
            try:
                await get_cluster_labels(
                    method=method,
                    resolution=resolution,
                    use_llm=True,
                    neo4j_client=neo4j
                )
                logger.info(f"Completed {resolution} clusters")
            except Exception as e:
                logger.error(f"Error computing {resolution} clusters: {e}")

        logger.info(f"Background cluster computation completed for {method}")

    except Exception as e:
        logger.error(f"Background cluster computation failed: {e}")
    finally:
        await neo4j.close()


# ===== LLM-Enhanced Tour & Insight Endpoints =====

@router.post("/generate-tour", response_model=TourResponse)
async def generate_tour(
    request: TourRequest,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Generate an LLM-guided tour through the embedding space.

    Tour types:
    - random_walk: Explore neighbors starting from a point
    - theme: Visit entities matching a theme (e.g., "animals", "technology")
    - contrast: Show semantically opposite entities
    - complexity: Journey from simple to complex (low to high trait count)
    - layer_journey: Physical → Functional → Abstract → Social
    """
    try:
        from workers.llm_client import OpenRouterClient
        import random
        import math
        llm = OpenRouterClient()

        # Helper to count set bits in UHT code
        def count_traits(uht_code: str) -> int:
            try:
                return bin(int(uht_code, 16)).count('1')
            except (ValueError, TypeError):
                return 0

        # Map projection to coordinate field names
        proj_fields = {
            'umap': ('umap_x', 'umap_y'),
            'tsne': ('tsne_x', 'tsne_y'),
            'uht_umap': ('uht_umap_x', 'uht_umap_y')
        }
        x_field, y_field = proj_fields.get(request.projection, ('umap_x', 'umap_y'))

        # First, fetch clusters to use as framework for diverse selection
        cluster_query = f"""
        MATCH (c:Cluster)
        WHERE c.method = $method AND c.resolution = 'level7'
        RETURN c.label as label, c.centroid_x as cx, c.centroid_y as cy, c.size as size
        ORDER BY c.size DESC
        LIMIT 50
        """
        clusters = await neo4j_client.execute_query(cluster_query, method=request.projection)

        # Fetch entities with their nearest cluster info
        entity_query = f"""
        MATCH (e:Entity)
        WHERE e.{x_field} IS NOT NULL AND e.uht_code IS NOT NULL
        RETURN e.uuid as uuid, e.name as name, e.uht_code as uht_code,
               e.{x_field} as x, e.{y_field} as y, e.image_url as image_url,
               e.description as description
        LIMIT 2000
        """
        all_entities = await neo4j_client.execute_query(entity_query)

        if not all_entities or len(all_entities) < request.num_stops:
            raise HTTPException(status_code=404, detail="Not enough entities found for tour")

        # Assign entities to nearest cluster
        def assign_to_cluster(entity, clusters):
            if not clusters:
                return None, float('inf')
            min_dist = float('inf')
            nearest = None
            for c in clusters:
                dist = math.sqrt((entity['x'] - c['cx'])**2 + (entity['y'] - c['cy'])**2)
                if dist < min_dist:
                    min_dist = dist
                    nearest = c
            return nearest, min_dist

        # Group entities by cluster
        cluster_entities = {}
        for entity in all_entities:
            cluster, dist = assign_to_cluster(entity, clusters)
            if cluster:
                label = cluster['label']
                if label not in cluster_entities:
                    cluster_entities[label] = {'cluster': cluster, 'entities': []}
                cluster_entities[label]['entities'].append((entity, dist))

        # Sort entities within each cluster by distance to centroid (closest first)
        for label in cluster_entities:
            cluster_entities[label]['entities'].sort(key=lambda x: x[1])

        # Select tour stops based on type
        selected = []
        cluster_context = []  # Track which cluster each stop is from

        if request.tour_type == 'complexity':
            # Sort all entities by trait count, but ensure cluster diversity
            all_with_counts = [(e, count_traits(e['uht_code'])) for e in all_entities]
            all_with_counts.sort(key=lambda x: x[1])

            # Pick evenly spaced through complexity range, avoiding same cluster consecutively
            step = len(all_with_counts) // (request.num_stops * 2)
            candidates = [all_with_counts[i * step][0] for i in range(request.num_stops * 2)]

            used_clusters = set()
            for entity in candidates:
                if len(selected) >= request.num_stops:
                    break
                cluster, _ = assign_to_cluster(entity, clusters)
                cluster_label = cluster['label'] if cluster else 'Unknown'
                # Allow repeat if we've used many clusters already
                if cluster_label not in used_clusters or len(used_clusters) > request.num_stops // 2:
                    selected.append(entity)
                    cluster_context.append(cluster_label)
                    used_clusters.add(cluster_label)

            # Fill remaining if needed
            for entity in candidates:
                if len(selected) >= request.num_stops:
                    break
                if entity not in selected:
                    cluster, _ = assign_to_cluster(entity, clusters)
                    selected.append(entity)
                    cluster_context.append(cluster['label'] if cluster else 'Unknown')

        elif request.tour_type == 'layer_journey':
            # Pick from each layer, ensuring cluster diversity
            layers = {'Physical': [], 'Functional': [], 'Abstract': [], 'Social': []}
            for e in all_entities:
                layer = get_dominant_layer(e['uht_code'])
                cluster, dist = assign_to_cluster(e, clusters)
                layers[layer].append((e, cluster, dist))

            per_layer = max(2, request.num_stops // 4)
            used_clusters = set()

            for layer_name in ['Physical', 'Functional', 'Abstract', 'Social']:
                layer_ents = layers[layer_name]
                # Sort by cluster diversity then distance
                random.shuffle(layer_ents)
                count = 0
                for entity, cluster, dist in layer_ents:
                    if count >= per_layer:
                        break
                    cluster_label = cluster['label'] if cluster else 'Unknown'
                    if cluster_label not in used_clusters or count == 0:
                        selected.append(entity)
                        cluster_context.append(cluster_label)
                        used_clusters.add(cluster_label)
                        count += 1

        elif request.tour_type == 'theme' and request.theme:
            # Search for theme, then pick from diverse clusters
            theme_lower = request.theme.lower()
            theme_matches = [e for e in all_entities if theme_lower in e['name'].lower()]

            if len(theme_matches) < request.num_stops:
                # Expand search to descriptions
                for e in all_entities:
                    if e not in theme_matches and e.get('description') and theme_lower in e['description'].lower():
                        theme_matches.append(e)

            # Group by cluster and pick one from each
            theme_by_cluster = {}
            for entity in theme_matches:
                cluster, dist = assign_to_cluster(entity, clusters)
                label = cluster['label'] if cluster else 'Unknown'
                if label not in theme_by_cluster:
                    theme_by_cluster[label] = []
                theme_by_cluster[label].append((entity, dist))

            # Pick best from each cluster
            for label, entities in sorted(theme_by_cluster.items(), key=lambda x: -len(x[1])):
                if len(selected) >= request.num_stops:
                    break
                entities.sort(key=lambda x: x[1])  # Closest to centroid
                selected.append(entities[0][0])
                cluster_context.append(label)

            # Fill with remaining if needed
            for label, entities in theme_by_cluster.items():
                for entity, _ in entities[1:]:
                    if len(selected) >= request.num_stops:
                        break
                    if entity not in selected:
                        selected.append(entity)
                        cluster_context.append(label)

        else:
            # Random walk through clusters - create a spatial journey
            # Pick diverse clusters and find representative entities
            if clusters:
                # Sort clusters by size, pick top ones
                top_clusters = sorted(clusters, key=lambda c: -c['size'])[:request.num_stops * 2]

                # Create a path through clusters (nearest neighbor chain)
                if top_clusters:
                    path = [top_clusters[0]]
                    remaining = top_clusters[1:]

                    while remaining and len(path) < request.num_stops:
                        current = path[-1]
                        # Find nearest unvisited cluster
                        nearest = min(remaining, key=lambda c:
                            math.sqrt((c['cx'] - current['cx'])**2 + (c['cy'] - current['cy'])**2))
                        path.append(nearest)
                        remaining.remove(nearest)

                    # Pick best entity from each cluster in path
                    for cluster in path:
                        if len(selected) >= request.num_stops:
                            break
                        label = cluster['label']
                        if label in cluster_entities and cluster_entities[label]['entities']:
                            # Pick a random entity from top 3 closest to centroid
                            top_ents = cluster_entities[label]['entities'][:3]
                            entity, _ = random.choice(top_ents)
                            selected.append(entity)
                            cluster_context.append(label)

            # Fallback if not enough
            if len(selected) < request.num_stops:
                random.shuffle(all_entities)
                for entity in all_entities:
                    if len(selected) >= request.num_stops:
                        break
                    if entity not in selected:
                        cluster, _ = assign_to_cluster(entity, clusters)
                        selected.append(entity)
                        cluster_context.append(cluster['label'] if cluster else 'Unknown')

        # Ensure we have enough stops
        selected = selected[:request.num_stops]
        cluster_context = cluster_context[:request.num_stops]

        if len(selected) < request.num_stops:
            raise HTTPException(status_code=404, detail="Could not find enough diverse entities for tour")

        # Generate narration with cluster context for better narrative
        entity_names = [s['name'] for s in selected]
        cluster_names = cluster_context

        # Generate introduction with journey context
        journey_description = " → ".join(f"{name} ({cluster})" for name, cluster in zip(entity_names[:4], cluster_names[:4]))
        intro_prompt = f"""You are narrating an animated tour through a semantic knowledge space.

Tour type: {request.tour_type}
{f"Theme: {request.theme}" if request.theme else ""}
Journey path: {journey_description}{"..." if len(selected) > 4 else ""}
Total stops: {len(selected)}

The viewer will fly between locations in 2D space, seeing entities light up and their neighbors highlighted.

Write a captivating introduction (2-3 sentences) that sets up this journey. Hint at the connections and contrasts we'll discover. Be specific about what makes this tour interesting."""

        introduction = await llm.get_completion(intro_prompt, temperature=0.7)

        # Generate narration for each stop with cluster context
        stops = []
        for i, entity in enumerate(selected):
            cluster_name = cluster_context[i]
            prev_cluster = cluster_context[i-1] if i > 0 else None
            next_cluster = cluster_context[i+1] if i < len(selected)-1 else None

            transition_note = ""
            if prev_cluster and prev_cluster != cluster_name:
                transition_note = f"We've just traveled from the '{prev_cluster}' region to '{cluster_name}'."
            elif prev_cluster == cluster_name:
                transition_note = f"We're still exploring the '{cluster_name}' region."

            narration_prompt = f"""You are narrating stop {i+1} of {len(selected)} on an animated tour through semantic space.

Current entity: {entity['name']}
Semantic region: {cluster_name}
{transition_note}
Previous stop: {selected[i-1]['name'] if i > 0 else "None (this is the first stop)"}
Next stop: {selected[i+1]['name'] if i < len(selected)-1 else "None (this is the final stop)"}
{f"Next region: {next_cluster}" if next_cluster and next_cluster != cluster_name else ""}

Write a brief, insightful narration (2-3 sentences) that:
1. Introduces this entity and what makes it interesting
2. Creates a narrative thread connecting it to the previous/next stops
3. Notes any surprising connections or contrasts

Be engaging and specific - avoid generic statements."""

            narration = await llm.get_completion(narration_prompt, temperature=0.7)

            stops.append(TourStop(
                uuid=entity['uuid'],
                name=entity['name'],
                uht_code=entity['uht_code'],
                x=entity['x'],
                y=entity['y'],
                narration=narration.strip(),
                image_url=entity.get('image_url')
            ))

        # Generate conclusion that ties the journey together
        regions_visited = list(dict.fromkeys(cluster_context))  # Unique, preserve order
        conclusion_prompt = f"""You just completed an animated tour through {len(selected)} entities across {len(regions_visited)} semantic regions.

Tour type: {request.tour_type}
Journey: {' → '.join(entity_names)}
Regions explored: {', '.join(regions_visited)}

Write a memorable conclusion (2-3 sentences) that:
1. Reflects on the journey and what it revealed
2. Highlights an unexpected connection or insight
3. Leaves the viewer with something to think about"""

        conclusion = await llm.get_completion(conclusion_prompt, temperature=0.7)

        return TourResponse(
            tour_type=request.tour_type,
            theme=request.theme,
            stops=stops,
            introduction=introduction.strip(),
            conclusion=conclusion.strip()
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Tour generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Tour generation failed: {str(e)}")


@router.post("/describe-selection", response_model=SelectionDescribeResponse)
async def describe_selection(
    request: SelectionDescribeRequest,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Get an LLM-generated description of a selection of entities.

    Useful for understanding what unifies a lasso selection or filter result.
    """
    try:
        from workers.llm_client import OpenRouterClient
        llm = OpenRouterClient()

        # Fetch entity details
        query = """
        MATCH (e:Entity)
        WHERE e.uuid IN $uuids
        RETURN e.uuid as uuid, e.name as name, e.uht_code as uht_code
        """
        results = await neo4j_client.execute_query(query, uuids=request.uuids)

        if not results:
            raise HTTPException(status_code=404, detail="No entities found")

        entity_names = [r['name'] for r in results]
        uht_codes = [r['uht_code'] for r in results]

        # Analyze common traits
        trait_counts = Counter()
        for code in uht_codes:
            try:
                num = int(code, 16)
                for i in range(32):
                    if (num >> (31 - i)) & 1:
                        trait_counts[i + 1] += 1
            except:
                pass

        # Traits present in >50% of entities
        common_trait_indices = [t for t, c in trait_counts.items() if c > len(results) * 0.5]

        # Get trait names (we'll use generic names if traits aren't loaded)
        trait_names = {
            1: 'Tangible', 2: 'Bounded', 3: 'Animate', 4: 'Natural',
            5: 'Rigid', 6: 'Articulable', 7: 'Composite', 8: 'Microscale',
            9: 'Energy-Dependent', 10: 'Transformative', 11: 'Containing',
            12: 'Mobile', 13: 'Signal-Emitting', 14: 'Cyclical', 15: 'Conditional',
            16: 'Interfacing', 17: 'Symbolic', 18: 'Intentional', 19: 'Informational',
            20: 'Aesthetic', 21: 'Temporal', 22: 'Probabilistic', 23: 'Nested', 24: 'Polar',
            25: 'Social-Collective', 26: 'Normative', 27: 'Transactional', 28: 'Hierarchical',
            29: 'Identifiable', 30: 'Relational', 31: 'Narrative', 32: 'Memetic'
        }
        common_traits = [trait_names.get(i, f'Trait {i}') for i in sorted(common_trait_indices)]

        # Generate description using LLM
        sample_names = entity_names[:20]  # Sample for prompt
        prompt = f"""Analyze this selection of {len(entity_names)} entities from a semantic classification system:

Sample entities: {', '.join(sample_names)}
{f"(and {len(entity_names) - 20} more)" if len(entity_names) > 20 else ""}

Common traits shared by >50% of entities: {', '.join(common_traits) if common_traits else 'None identified'}

1. Write a 2-3 sentence description of what unifies this selection. What theme or category do they represent?
2. Suggest a short label (2-4 words) for this group.

Format your response as:
DESCRIPTION: [your description]
LABEL: [your suggested label]"""

        response = await llm.get_completion(prompt, temperature=0.5)

        # Parse response
        description = ""
        label = "Selected Entities"

        for line in response.strip().split('\n'):
            if line.startswith('DESCRIPTION:'):
                description = line.replace('DESCRIPTION:', '').strip()
            elif line.startswith('LABEL:'):
                label = line.replace('LABEL:', '').strip()

        if not description:
            description = response.strip()

        return SelectionDescribeResponse(
            description=description,
            common_traits=common_traits[:10],  # Limit to top 10
            suggested_label=label,
            entity_count=len(results)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Selection description failed: {e}")
        raise HTTPException(status_code=500, detail=f"Description generation failed: {str(e)}")


@router.post("/explain-similarity", response_model=SimilarityExplainResponse)
async def explain_similarity(
    request: SimilarityExplainRequest,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Explain the similarity pattern between a reference entity and sample entities.

    Useful for understanding heatmap patterns.
    """
    try:
        from workers.llm_client import OpenRouterClient
        llm = OpenRouterClient()

        # Fetch reference entity
        ref_query = """
        MATCH (e:Entity {uuid: $uuid})
        RETURN e.name as name, e.uht_code as uht_code
        """
        ref_results = await neo4j_client.execute_query(ref_query, uuid=request.reference_uuid)

        if not ref_results:
            raise HTTPException(status_code=404, detail="Reference entity not found")

        reference = ref_results[0]

        # Fetch sample entities
        sample_query = """
        MATCH (e:Entity)
        WHERE e.uuid IN $uuids
        RETURN e.uuid as uuid, e.name as name, e.uht_code as uht_code
        """
        sample_results = await neo4j_client.execute_query(sample_query, uuids=request.sample_uuids)

        # Calculate Hamming distances
        ref_code = int(reference['uht_code'], 16)
        distances = []
        for sample in sample_results:
            try:
                sample_code = int(sample['uht_code'], 16)
                xor = ref_code ^ sample_code
                distance = bin(xor).count('1')
                distances.append({
                    'name': sample['name'],
                    'distance': distance,
                    'similar': distance < 10
                })
            except:
                pass

        similar_entities = [d for d in distances if d['similar']]
        different_entities = [d for d in distances if not d['similar']]

        # Generate explanation using LLM
        prompt = f"""Explain the similarity pattern for this entity comparison:

Reference entity: {reference['name']} (UHT code: {reference['uht_code']})

Similar entities (Hamming distance < 10):
{chr(10).join([f"- {d['name']} (distance: {d['distance']})" for d in similar_entities[:5]]) if similar_entities else "None in sample"}

Different entities (Hamming distance >= 10):
{chr(10).join([f"- {d['name']} (distance: {d['distance']})" for d in different_entities[:5]]) if different_entities else "None in sample"}

1. Explain why the similar entities might be grouped together with the reference.
2. Explain what distinguishes the different entities.
3. Provide a one-sentence summary of the similarity pattern.

Format:
EXPLANATION: [your explanation, 2-3 sentences]
PATTERN: [one-sentence summary]"""

        response = await llm.get_completion(prompt, temperature=0.5)

        # Parse response
        explanation = ""
        pattern = ""

        for line in response.strip().split('\n'):
            if line.startswith('EXPLANATION:'):
                explanation = line.replace('EXPLANATION:', '').strip()
            elif line.startswith('PATTERN:'):
                pattern = line.replace('PATTERN:', '').strip()

        if not explanation:
            explanation = response.strip()
        if not pattern:
            pattern = f"Entities similar to {reference['name']} share related structural traits."

        return SimilarityExplainResponse(
            reference_name=reference['name'],
            reference_code=reference['uht_code'],
            explanation=explanation,
            pattern_summary=pattern
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Similarity explanation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Explanation generation failed: {str(e)}")
