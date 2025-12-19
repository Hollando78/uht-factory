#!/usr/bin/env python3
"""
Pre-compute cluster labels for all resolution levels.

This script pre-computes DBSCAN clusters and generates LLM labels
for macro, meso, and micro resolutions. Results are cached in Redis
with a 24-hour TTL.

Usage:
    python scripts/precompute_cluster_labels.py [--method umap|tsne|both]

Options:
    --method        Projection method to cluster (default: both)
    --no-llm        Skip LLM label generation, use keyword extraction only
    --dry-run       Show what would be done without computing
"""

import os
import sys
import asyncio
import argparse
import logging
import json
import numpy as np
from datetime import datetime
from pathlib import Path
from collections import Counter
from typing import List, Optional

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from db.neo4j_client import Neo4jClient
from db.redis_client import RedisClient
from workers.projection_worker import get_dominant_layer


def compute_uht_raw_values(uht_code: str) -> tuple[int, int]:
    """Extract raw X/Y values from hex code (before normalization).
    X = First 4 hex chars as 16-bit value
    Y = Last 4 hex chars as 16-bit value
    """
    if not uht_code or len(uht_code) != 8:
        return (0, 0)
    try:
        return (int(uht_code[0:4], 16), int(uht_code[4:8], 16))
    except:
        return (0, 0)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

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

# Cache TTL: 24 hours
CLUSTER_CACHE_TTL = 86400

# Stop words for keyword extraction fallback
STOP_WORDS = {
    'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'is',
    'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do',
    'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
    'shall', 'can', 'with', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'over', 'out',
    'up', 'down', 'off', 'about', 'against', 'not', 'no', 'but', 'if', 'then',
    'than', 'so', 'such', 'that', 'this', 'these', 'those', 'it', 'its'
}


async def generate_cluster_label_llm(
    cluster_names: List[str],
    dominant_layer: str,
    cluster_size: int,
    existing_labels: set = None,
    temperature: float = 0.4
) -> Optional[str]:
    """Generate a compelling cluster label using LLM."""
    try:
        from workers.llm_client import OpenRouterClient

        # Sample up to 15 names for the prompt
        sample_names = cluster_names[:15] if len(cluster_names) > 15 else cluster_names

        # Build avoid list if we have existing labels
        avoid_clause = ""
        if existing_labels:
            # Filter to show only potentially similar labels (share words with entity names)
            sample_words = set()
            for name in sample_names:
                sample_words.update(name.lower().split())

            relevant_labels = [l for l in existing_labels
                              if any(w in l.lower() for w in sample_words) or len(existing_labels) < 20]

            if relevant_labels:
                # Create specific alternatives based on the labels we need to avoid
                avoid_clause = f"""\n\nCRITICAL - DO NOT USE ANY OF THESE LABELS (they are already taken):
{', '.join(sorted(relevant_labels))}

You MUST create a UNIQUE label. For similar items, try these approaches:
- Geographic: "European Apples", "German Cultivars", "American Varieties"
- Time: "Modern Varieties", "Historic Cultivars", "20th Century Breeds"
- Color: "Red-Skinned Apples", "Golden Varieties", "Green Apple Types"
- Use: "Cooking Apples", "Cider Varieties", "Dessert Fruits"
- Taste: "Sweet Apple Cultivars", "Tart Varieties", "Aromatic Breeds"

Pick ONE approach and create a label that is NOT in the forbidden list above."""

        prompt = f"""Given these entities from a semantic cluster:
{', '.join(sample_names)}

Dominant category: {dominant_layer}
Cluster size: {cluster_size} entities

Generate a short, compelling label (2-4 words) that captures what unifies these entities semantically.
Be specific and evocative, not generic. Use title case.

Examples of good labels: "Marine Mammals", "Renaissance Art", "Quantum Phenomena", "Kitchen Appliances", "Ancient Civilizations"
Examples of bad labels: "Things", "Misc Items", "Various Objects", "Mixed Entities"{avoid_clause}

Respond with ONLY the label, nothing else."""

        client = OpenRouterClient()
        label = await client.get_completion(prompt, temperature=temperature)

        # Clean up the response
        label = label.strip().strip('"').strip("'")

        # Validate: should be 2-4 words, reasonable length
        words = label.split()
        if len(words) > 5 or len(label) > 40:
            label = ' '.join(words[:3])

        return label

    except Exception as e:
        logger.warning(f"LLM label generation failed: {e}")
        return None


def extract_keyword_label(cluster_names: List[str]) -> Optional[str]:
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


async def compute_clusters_for_resolution(
    neo4j: Neo4jClient,
    redis: RedisClient,
    method: str,
    resolution: str,
    use_llm: bool = True,
    dry_run: bool = False
) -> dict:
    """Compute clusters for a single resolution level."""
    from sklearn.cluster import DBSCAN

    config = RESOLUTION_CONFIGS[resolution]

    logger.info(f"  Fetching {method} projection data...")

    if method == 'uht':
        # For UHT, compute coordinates from uht_code with data-range normalization
        query = """
        MATCH (e:Entity)
        WHERE e.uht_code IS NOT NULL AND e.uht_code <> ''
        RETURN e.uuid as uuid,
               e.name as name,
               e.uht_code as uht_code
        """
        result = await neo4j.execute_query(query)

        # First pass: get raw values and find max
        raw_values = []
        for r in result:
            raw_x, raw_y = compute_uht_raw_values(r.get('uht_code', ''))
            raw_values.append((raw_x, raw_y))

        if raw_values:
            max_x = max(v[0] for v in raw_values) or 1
            max_y = max(v[1] for v in raw_values) or 1

            # Second pass: normalize so 0x0000 at bottom-left, max at top-right
            for i, r in enumerate(result):
                raw_x, raw_y = raw_values[i]
                r['x'] = (raw_x / max_x) * 1.8 - 0.9  # [-0.9, 0.9]
                r['y'] = (raw_y / max_y) * 1.8 - 0.9
    else:
        # For UMAP/t-SNE, use stored coordinates
        x_field = f"{method}_x"
        y_field = f"{method}_y"
        query = f"""
        MATCH (e:Entity)
        WHERE e.{x_field} IS NOT NULL AND e.{y_field} IS NOT NULL
        RETURN e.uuid as uuid,
               e.name as name,
               e.uht_code as uht_code,
               e.{x_field} as x,
               e.{y_field} as y
        """
        result = await neo4j.execute_query(query)

    logger.info(f"  Found {len(result)} entities with {method} projections")

    if len(result) < config['min_samples']:
        logger.warning(f"  Not enough data points for {resolution} clustering")
        return {'method': method, 'resolution': resolution, 'clusters': []}

    # Prepare data for clustering
    points = np.array([[r['x'], r['y']] for r in result])
    names = [r.get('name', '') for r in result]
    uht_codes = [r.get('uht_code', '00000000') for r in result]

    logger.info(f"  Running DBSCAN with eps={config['eps']}, min_samples={config['min_samples']}...")

    if dry_run:
        return {'method': method, 'resolution': resolution, 'clusters': [], 'dry_run': True}

    # Run DBSCAN
    clustering = DBSCAN(
        eps=config['eps'],
        min_samples=config['min_samples']
    ).fit(points)
    labels = clustering.labels_

    # Count clusters (excluding noise)
    unique_labels = set(labels)
    unique_labels.discard(-1)
    n_clusters = len(unique_labels)
    n_noise = int(np.sum(labels == -1))

    logger.info(f"  Found {n_clusters} clusters ({n_noise} noise points)")

    # Process each cluster
    clusters = []
    used_labels = set()  # Track labels to prevent duplicates

    for cluster_id in sorted(unique_labels):
        mask = labels == cluster_id
        cluster_points = points[mask]
        cluster_names = [names[i] for i in range(len(names)) if mask[i]]
        cluster_uht_codes = [uht_codes[i] for i in range(len(uht_codes)) if mask[i]]

        # Compute centroid
        centroid_x = float(np.mean(cluster_points[:, 0]))
        centroid_y = float(np.mean(cluster_points[:, 1]))

        # Find dominant layer
        layer_counts = Counter()
        for code in cluster_uht_codes:
            layer = get_dominant_layer(code)
            layer_counts[layer] += 1
        dominant_layer = layer_counts.most_common(1)[0][0] if layer_counts else 'Physical'

        cluster_size = int(np.sum(mask))

        # Generate label (with retry for duplicates)
        label = None
        max_retries = 5

        if use_llm:
            base_llm_label = None  # Track the label LLM keeps returning
            for attempt in range(max_retries):
                # Increase temperature on retries to get more diverse outputs
                temp = 0.4 + (attempt * 0.15)  # 0.4, 0.55, 0.7, 0.85, 1.0
                label = await generate_cluster_label_llm(
                    cluster_names, dominant_layer, cluster_size,
                    existing_labels=used_labels,  # Always pass existing labels
                    temperature=temp
                )
                if label and label not in used_labels:
                    logger.info(f"    Cluster {cluster_id} ({cluster_size} entities): \"{label}\"")
                    break
                elif label:
                    if not base_llm_label:
                        base_llm_label = label  # Remember first duplicate for qualifier fallback
                    logger.warning(f"    Duplicate label \"{label}\", retrying ({attempt + 1}/{max_retries}, temp={temp:.2f})...")
                    label = None

            # If LLM kept returning duplicates, add a qualifier to make it unique
            if not label and base_llm_label:
                qualifiers = ['More', 'Additional', 'Other', 'Further', 'Extra']
                for qual in qualifiers:
                    qualified = f"{qual} {base_llm_label}"
                    if qualified not in used_labels:
                        label = qualified
                        logger.info(f"    Cluster {cluster_id} ({cluster_size} entities): \"{label}\" (qualified)")
                        break

        if not label:
            base_label = extract_keyword_label(cluster_names)
            if base_label:
                # Make keyword labels unique if needed
                label = base_label
                suffix = 2
                while label in used_labels:
                    label = f"{base_label} ({suffix})"
                    suffix += 1
                logger.info(f"    Cluster {cluster_id} ({cluster_size} entities): \"{label}\" (keywords)")

        if not label:
            label = f"Cluster {cluster_id}"
            logger.info(f"    Cluster {cluster_id} ({cluster_size} entities): \"{label}\" (fallback)")

        used_labels.add(label)

        clusters.append({
            'cluster_id': int(cluster_id),
            'centroid_x': centroid_x,
            'centroid_y': centroid_y,
            'label': label,
            'size': cluster_size,
            'count': cluster_size,
            'dominant_layer': dominant_layer
        })

    response = {
        'method': method,
        'resolution': resolution,
        'total_points': len(result),
        'clustered_points': int(np.sum(labels != -1)),
        'noise_points': n_noise,
        'clusters': clusters
    }

    # Cache result
    cache_key = f"explorer:clusters:{method}:{resolution}"
    await redis.setex(cache_key, CLUSTER_CACHE_TTL, json.dumps(response))
    logger.info(f"  Cached {len(clusters)} clusters to {cache_key}")

    return response


async def main(
    method: str = "both",
    use_llm: bool = True,
    dry_run: bool = False,
    resolution: str = "all"
):
    """Main pre-computation function"""

    # Initialize clients
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )
    await neo4j.connect()

    redis_url = os.getenv("REDIS_URL", "redis://localhost:6383")
    redis = RedisClient(redis_url)

    logger.info("=" * 60)
    logger.info("CLUSTER LABEL PRE-COMPUTATION")
    logger.info("=" * 60)
    logger.info(f"Method: {method}")
    logger.info(f"Use LLM: {use_llm}")
    logger.info(f"Dry run: {dry_run}")
    logger.info("")

    # Determine which methods to process
    if method == 'all':
        methods = ['umap', 'tsne', 'uht', 'uht_umap']
    elif method == 'both':
        methods = ['umap', 'tsne']
    else:
        methods = [method]

    start_time = datetime.now()
    results = {}

    for m in methods:
        logger.info(f"\n{'=' * 40}")
        logger.info(f"Processing {m.upper()} projections")
        logger.info("=" * 40)

        results[m] = {}

        resolutions = [resolution] if resolution != 'all' else ['level1', 'level2', 'level3', 'level4', 'level5', 'level6', 'level7']
        for res in resolutions:
            logger.info(f"\n[{res.upper()}]")

            try:
                result = await compute_clusters_for_resolution(
                    neo4j, redis, m, res, use_llm, dry_run
                )
                results[m][res] = len(result.get('clusters', []))
            except Exception as e:
                logger.error(f"  Error: {e}")
                results[m][res] = 0

    elapsed = (datetime.now() - start_time).total_seconds()

    # Summary
    logger.info("\n" + "=" * 60)
    logger.info("SUMMARY")
    logger.info("=" * 60)

    for m in methods:
        logger.info(f"\n{m.upper()}:")
        summary_resolutions = [resolution] if resolution != 'all' else ['level1', 'level2', 'level3', 'level4', 'level5', 'level6', 'level7']
        for res in summary_resolutions:
            count = results[m].get(res, 0)
            logger.info(f"  {res}: {count} clusters")

    logger.info(f"\nTotal time: {elapsed:.1f}s")

    await neo4j.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Pre-compute cluster labels for all resolution levels"
    )
    parser.add_argument(
        "--method",
        type=str,
        choices=["umap", "tsne", "uht", "uht_umap", "both", "all"],
        default="both",
        help="Projection method to cluster: umap, tsne, uht, uht_umap, both (umap+tsne), or all (default: both)"
    )
    parser.add_argument(
        "--no-llm",
        action="store_true",
        help="Skip LLM label generation, use keyword extraction only"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without computing"
    )
    parser.add_argument(
        "--resolution",
        type=str,
        choices=["level1", "level2", "level3", "level4", "level5", "level6", "level7", "all"],
        default="level7",
        help="Resolution level to compute (default: level7 - finest granularity)"
    )

    args = parser.parse_args()

    asyncio.run(main(
        method=args.method,
        use_llm=not args.no_llm,
        dry_run=args.dry_run,
        resolution=args.resolution
    ))
