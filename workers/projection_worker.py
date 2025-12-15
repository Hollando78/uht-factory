"""
Dimension reduction worker for UHT Factory.

Computes UMAP and t-SNE projections from 1536-dim embeddings
to 2D coordinates for visualization.
"""

import os
import asyncio
import logging
import numpy as np
from typing import List, Dict, Any, Optional, Literal
from datetime import datetime

logger = logging.getLogger(__name__)

# Projection configuration
UMAP_N_NEIGHBORS = 15
UMAP_MIN_DIST = 0.1
UMAP_METRIC = 'cosine'

TSNE_PERPLEXITY = 30
TSNE_LEARNING_RATE = 200
TSNE_N_ITER = 1000


class ProjectionWorker:
    """Handles dimension reduction for embedding visualization."""

    def __init__(self):
        self._umap_reducer = None
        self._tsne_reducer = None

    def compute_umap(
        self,
        embeddings: np.ndarray,
        n_neighbors: int = UMAP_N_NEIGHBORS,
        min_dist: float = UMAP_MIN_DIST,
        metric: str = UMAP_METRIC,
        random_state: int = 42
    ) -> np.ndarray:
        """
        Compute UMAP projection from embeddings to 2D.

        Args:
            embeddings: (N, 1536) array of embeddings
            n_neighbors: UMAP neighborhood size
            min_dist: Minimum distance between points
            metric: Distance metric (cosine works well for embeddings)
            random_state: For reproducibility

        Returns:
            (N, 2) array of 2D coordinates
        """
        try:
            import umap
        except ImportError:
            raise ImportError("umap-learn is required. Install with: pip install umap-learn")

        logger.info(f"Computing UMAP projection for {len(embeddings)} embeddings...")
        start_time = datetime.now()

        reducer = umap.UMAP(
            n_components=2,
            n_neighbors=n_neighbors,
            min_dist=min_dist,
            metric=metric,
            random_state=random_state,
            verbose=False
        )

        projection = reducer.fit_transform(embeddings)

        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info(f"UMAP completed in {elapsed:.1f}s")

        return projection

    def compute_tsne(
        self,
        embeddings: np.ndarray,
        perplexity: float = TSNE_PERPLEXITY,
        learning_rate: str = 'auto',
        max_iter: int = TSNE_N_ITER,
        random_state: int = 42
    ) -> np.ndarray:
        """
        Compute t-SNE projection from embeddings to 2D.

        Args:
            embeddings: (N, 1536) array of embeddings
            perplexity: t-SNE perplexity parameter
            learning_rate: Optimization learning rate ('auto' recommended)
            max_iter: Maximum number of iterations
            random_state: For reproducibility

        Returns:
            (N, 2) array of 2D coordinates
        """
        from sklearn.manifold import TSNE

        logger.info(f"Computing t-SNE projection for {len(embeddings)} embeddings...")
        start_time = datetime.now()

        # For large datasets, use PCA initialization for speed
        init = 'pca' if len(embeddings) > 1000 else 'random'

        reducer = TSNE(
            n_components=2,
            perplexity=min(perplexity, len(embeddings) - 1),  # perplexity must be < n_samples
            learning_rate=learning_rate,
            max_iter=max_iter,
            random_state=random_state,
            init=init,
            verbose=0
        )

        projection = reducer.fit_transform(embeddings)

        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info(f"t-SNE completed in {elapsed:.1f}s")

        return projection

    def normalize_projection(self, projection: np.ndarray) -> np.ndarray:
        """
        Normalize projection to [-1, 1] range for consistent visualization.

        Args:
            projection: (N, 2) array of coordinates

        Returns:
            Normalized (N, 2) array
        """
        # Center around origin
        projection = projection - projection.mean(axis=0)

        # Scale to [-1, 1]
        max_abs = np.abs(projection).max()
        if max_abs > 0:
            projection = projection / max_abs

        return projection


def compute_uht_similarity(code1: str, code2: str) -> float:
    """
    Compute UHT similarity using Jaccard index on active traits.

    Jaccard = |intersection| / |union| of set bits.

    This is more appropriate than Hamming for sparse codes because
    it only considers traits that are present, not shared absences.

    Args:
        code1: 8-char hex code
        code2: 8-char hex code

    Returns:
        Similarity score 0-1 (1 = identical trait sets)
    """
    try:
        int1 = int(code1, 16)
        int2 = int(code2, 16)

        # Count bits in intersection (AND) and union (OR)
        intersection = bin(int1 & int2).count('1')
        union = bin(int1 | int2).count('1')

        # Handle case where both codes are 0 (no traits)
        if union == 0:
            return 1.0 if int1 == int2 else 0.0

        return intersection / union
    except (ValueError, TypeError):
        return 0.0


def compute_cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """
    Compute cosine similarity between two vectors.

    Args:
        vec1: First vector
        vec2: Second vector

    Returns:
        Cosine similarity -1 to 1
    """
    arr1 = np.array(vec1)
    arr2 = np.array(vec2)

    norm1 = np.linalg.norm(arr1)
    norm2 = np.linalg.norm(arr2)

    if norm1 == 0 or norm2 == 0:
        return 0.0

    return float(np.dot(arr1, arr2) / (norm1 * norm2))


def compute_correlation_sample(
    entities: List[Dict[str, Any]],
    sample_size: int = 5000,
    random_state: int = 42
) -> List[Dict[str, Any]]:
    """
    Compute correlation between embedding similarity and UHT similarity
    for a sample of entity pairs.

    Args:
        entities: List of entities with 'uuid', 'uht_code', 'embedding'
        sample_size: Number of pairs to sample
        random_state: For reproducibility

    Returns:
        List of dicts with embedding_similarity, uht_similarity, entity UUIDs
    """
    import random
    random.seed(random_state)

    n = len(entities)
    if n < 2:
        return []

    # Calculate max possible pairs
    max_pairs = n * (n - 1) // 2
    actual_sample = min(sample_size, max_pairs)

    logger.info(f"Sampling {actual_sample} pairs from {n} entities...")

    # Sample random pairs
    results = []
    seen_pairs = set()

    while len(results) < actual_sample:
        i = random.randint(0, n - 1)
        j = random.randint(0, n - 1)

        if i == j:
            continue

        pair = tuple(sorted([i, j]))
        if pair in seen_pairs:
            continue

        seen_pairs.add(pair)

        e1 = entities[i]
        e2 = entities[j]

        # Compute both similarities
        emb_sim = compute_cosine_similarity(e1['embedding'], e2['embedding'])
        uht_sim = compute_uht_similarity(e1['uht_code'], e2['uht_code'])

        results.append({
            'entity1_uuid': e1['uuid'],
            'entity1_name': e1.get('name', 'Unknown'),
            'entity2_uuid': e2['uuid'],
            'entity2_name': e2.get('name', 'Unknown'),
            'embedding_similarity': round(emb_sim, 4),
            'uht_similarity': round(uht_sim, 4)
        })

    logger.info(f"Computed {len(results)} correlation samples")
    return results


def find_outliers(
    correlation_data: List[Dict[str, Any]],
    threshold: float = 0.3
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Find entity pairs where embedding and UHT similarity disagree.

    Args:
        correlation_data: Output from compute_correlation_sample
        threshold: Minimum difference to be considered outlier

    Returns:
        Dict with 'semantic_only' and 'structural_only' outliers
    """
    semantic_only = []  # High embedding sim, low UHT sim
    structural_only = []  # Low embedding sim, high UHT sim

    for item in correlation_data:
        diff = item['embedding_similarity'] - item['uht_similarity']

        if diff > threshold:
            semantic_only.append({
                **item,
                'disagreement': round(diff, 4),
                'type': 'semantic_similar_structural_different'
            })
        elif diff < -threshold:
            structural_only.append({
                **item,
                'disagreement': round(abs(diff), 4),
                'type': 'structural_similar_semantic_different'
            })

    # Sort by disagreement
    semantic_only.sort(key=lambda x: x['disagreement'], reverse=True)
    structural_only.sort(key=lambda x: x['disagreement'], reverse=True)

    return {
        'semantic_only': semantic_only[:100],  # Top 100
        'structural_only': structural_only[:100]
    }


def get_dominant_layer(uht_code: str) -> str:
    """Get the dominant layer from a UHT code."""
    try:
        if not uht_code or len(uht_code) != 8:
            return 'Unknown'

        layers = {
            'Physical': bin(int(uht_code[0:2], 16)).count('1'),
            'Functional': bin(int(uht_code[2:4], 16)).count('1'),
            'Abstract': bin(int(uht_code[4:6], 16)).count('1'),
            'Social': bin(int(uht_code[6:8], 16)).count('1')
        }

        return max(layers, key=layers.get)
    except (ValueError, TypeError):
        return 'Unknown'


def count_active_traits(uht_code: str) -> int:
    """Count active traits (1 bits) in a UHT code."""
    try:
        return bin(int(uht_code, 16)).count('1')
    except (ValueError, TypeError):
        return 0
