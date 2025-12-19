#!/usr/bin/env python3
"""
Compute UMAP, t-SNE, and UHT-based projections for entity embeddings.

This script loads all entity embeddings from Neo4j, computes 2D projections
using UMAP, t-SNE, and/or UHT-based methods, and stores the coordinates back in the database.

Supported methods:
  - umap: UMAP on embedding vectors (semantic similarity)
  - tsne: t-SNE on embedding vectors (semantic similarity)
  - uht_umap: UMAP on UHT code bit vectors (structural similarity)
  - uht_pacmap: PaCMAP on UHT code bit vectors (structural similarity)
  - all: All of the above

Usage:
    python scripts/compute_projections.py [--method umap|tsne|uht_umap|uht_pacmap|all] [--batch-size 500]

Options:
    --method        Projection method (default: all)
    --batch-size    Entities to store per database batch (default: 500)
    --dry-run       Show what would be done without computing/storing
"""

import os
import sys
import asyncio
import argparse
import logging
import numpy as np
from datetime import datetime
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from db.neo4j_client import Neo4jClient
from workers.projection_worker import ProjectionWorker

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def uht_code_to_binary(uht_code: str) -> np.ndarray:
    """Convert 8-char hex UHT code to 32-bit binary vector."""
    try:
        num = int(uht_code, 16)
        return np.array([int(b) for b in bin(num)[2:].zfill(32)], dtype=np.float32)
    except (ValueError, TypeError):
        return np.zeros(32, dtype=np.float32)


async def main(
    method: str = "all",
    batch_size: int = 500,
    dry_run: bool = False
):
    """Main projection computation function"""

    # Initialize Neo4j client
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )
    await neo4j.connect()

    # Get projection statistics
    stats = await neo4j.get_projection_stats()
    logger.info(f"Entity statistics:")
    logger.info(f"  Total entities: {stats['total_entities']}")
    logger.info(f"  With embeddings: {stats['with_embedding']}")
    logger.info(f"  With UMAP projections: {stats['with_umap']}")
    logger.info(f"  With t-SNE projections: {stats['with_tsne']}")
    logger.info(f"  With UHT-UMAP projections: {stats.get('with_uht_umap', 0)}")

    if stats['with_embedding'] == 0:
        logger.warning("No entities have embeddings. Run batch_generate_embeddings.py first.")
        await neo4j.close()
        return

    if dry_run:
        logger.info("DRY RUN - No projections will be computed")
        await neo4j.close()
        return

    # Determine which methods to run
    do_umap = method in ('umap', 'both', 'all')
    do_tsne = method in ('tsne', 'both', 'all')
    do_uht_umap = method in ('uht_umap', 'all')
    do_uht_pacmap = method in ('uht_pacmap', 'all')

    # Load all entities with embeddings
    logger.info("Loading entities with embeddings from database...")
    load_start = datetime.now()
    entities = await neo4j.get_entities_with_embeddings_for_projection()
    load_time = (datetime.now() - load_start).total_seconds()
    logger.info(f"Loaded {len(entities)} entities in {load_time:.1f}s")

    if not entities:
        logger.warning("No entities with embeddings found.")
        await neo4j.close()
        return

    # Extract embeddings as numpy array
    uuids = [e['uuid'] for e in entities]
    embeddings = np.array([e['embedding'] for e in entities], dtype=np.float32)
    logger.info(f"Embeddings shape: {embeddings.shape}")

    # Extract UHT codes as binary vectors for UHT-based projections
    uht_codes = [e.get('uht_code', '00000000') for e in entities]
    uht_vectors = np.array([uht_code_to_binary(code) for code in uht_codes], dtype=np.float32)
    logger.info(f"UHT vectors shape: {uht_vectors.shape}")

    # Initialize projection worker
    worker = ProjectionWorker()

    # Compute projections
    umap_projection = None
    tsne_projection = None
    uht_umap_projection = None
    uht_pacmap_projection = None

    if do_umap:
        logger.info("\n" + "=" * 50)
        logger.info("Computing UMAP projection (on embeddings)...")
        logger.info("=" * 50)
        umap_start = datetime.now()
        umap_projection = worker.compute_umap(embeddings)
        umap_projection = worker.normalize_projection(umap_projection)
        umap_time = (datetime.now() - umap_start).total_seconds()
        logger.info(f"UMAP completed in {umap_time:.1f}s")
        logger.info(f"UMAP bounds: x=[{umap_projection[:, 0].min():.3f}, {umap_projection[:, 0].max():.3f}], "
                   f"y=[{umap_projection[:, 1].min():.3f}, {umap_projection[:, 1].max():.3f}]")

    if do_tsne:
        logger.info("\n" + "=" * 50)
        logger.info("Computing t-SNE projection (on embeddings)...")
        logger.info("=" * 50)
        tsne_start = datetime.now()
        tsne_projection = worker.compute_tsne(embeddings)
        tsne_projection = worker.normalize_projection(tsne_projection)
        tsne_time = (datetime.now() - tsne_start).total_seconds()
        logger.info(f"t-SNE completed in {tsne_time:.1f}s")
        logger.info(f"t-SNE bounds: x=[{tsne_projection[:, 0].min():.3f}, {tsne_projection[:, 0].max():.3f}], "
                   f"y=[{tsne_projection[:, 1].min():.3f}, {tsne_projection[:, 1].max():.3f}]")

    if do_uht_umap:
        logger.info("\n" + "=" * 50)
        logger.info("Computing UHT-UMAP projection (on UHT code vectors)...")
        logger.info("=" * 50)
        uht_umap_start = datetime.now()
        uht_umap_projection = worker.compute_umap(uht_vectors, metric='hamming')
        uht_umap_projection = worker.normalize_projection(uht_umap_projection)
        uht_umap_time = (datetime.now() - uht_umap_start).total_seconds()
        logger.info(f"UHT-UMAP completed in {uht_umap_time:.1f}s")
        logger.info(f"UHT-UMAP bounds: x=[{uht_umap_projection[:, 0].min():.3f}, {uht_umap_projection[:, 0].max():.3f}], "
                   f"y=[{uht_umap_projection[:, 1].min():.3f}, {uht_umap_projection[:, 1].max():.3f}]")

    if do_uht_pacmap:
        logger.info("\n" + "=" * 50)
        logger.info("Computing UHT-PaCMAP projection (on UHT code vectors)...")
        logger.info("=" * 50)
        uht_pacmap_start = datetime.now()
        uht_pacmap_projection = worker.compute_pacmap(uht_vectors)
        uht_pacmap_projection = worker.normalize_projection(uht_pacmap_projection)
        uht_pacmap_time = (datetime.now() - uht_pacmap_start).total_seconds()
        logger.info(f"UHT-PaCMAP completed in {uht_pacmap_time:.1f}s")
        logger.info(f"UHT-PaCMAP bounds: x=[{uht_pacmap_projection[:, 0].min():.3f}, {uht_pacmap_projection[:, 0].max():.3f}], "
                   f"y=[{uht_pacmap_projection[:, 1].min():.3f}, {uht_pacmap_projection[:, 1].max():.3f}]")

    # Store projections in batches
    logger.info("\n" + "=" * 50)
    logger.info("Storing projections in database...")
    logger.info("=" * 50)
    store_start = datetime.now()
    total_stored = 0

    for i in range(0, len(uuids), batch_size):
        batch_uuids = uuids[i:i + batch_size]
        batch_projections = []

        for j, uuid in enumerate(batch_uuids):
            idx = i + j
            proj = {"uuid": uuid}

            if umap_projection is not None:
                proj["umap_x"] = float(umap_projection[idx, 0])
                proj["umap_y"] = float(umap_projection[idx, 1])
            else:
                proj["umap_x"] = None
                proj["umap_y"] = None

            if tsne_projection is not None:
                proj["tsne_x"] = float(tsne_projection[idx, 0])
                proj["tsne_y"] = float(tsne_projection[idx, 1])
            else:
                proj["tsne_x"] = None
                proj["tsne_y"] = None

            if uht_umap_projection is not None:
                proj["uht_umap_x"] = float(uht_umap_projection[idx, 0])
                proj["uht_umap_y"] = float(uht_umap_projection[idx, 1])
            else:
                proj["uht_umap_x"] = None
                proj["uht_umap_y"] = None

            if uht_pacmap_projection is not None:
                proj["uht_pacmap_x"] = float(uht_pacmap_projection[idx, 0])
                proj["uht_pacmap_y"] = float(uht_pacmap_projection[idx, 1])
            else:
                proj["uht_pacmap_x"] = None
                proj["uht_pacmap_y"] = None

            batch_projections.append(proj)

        stored = await neo4j.batch_store_projections(batch_projections)
        total_stored += stored

        progress = min(i + batch_size, len(uuids))
        logger.info(f"Stored batch {i // batch_size + 1}: {stored} entities "
                   f"[{progress}/{len(uuids)} - {100 * progress / len(uuids):.1f}%]")

    store_time = (datetime.now() - store_start).total_seconds()
    logger.info(f"Stored {total_stored} projections in {store_time:.1f}s")

    # Final summary
    logger.info("\n" + "=" * 60)
    logger.info("PROJECTION COMPUTATION COMPLETE")
    logger.info("=" * 60)
    logger.info(f"Entities processed: {len(entities)}")
    if umap_projection is not None:
        logger.info(f"UMAP projections: {len(umap_projection)}")
    if tsne_projection is not None:
        logger.info(f"t-SNE projections: {len(tsne_projection)}")
    if uht_umap_projection is not None:
        logger.info(f"UHT-UMAP projections: {len(uht_umap_projection)}")
    if uht_pacmap_projection is not None:
        logger.info(f"UHT-PaCMAP projections: {len(uht_pacmap_projection)}")
    logger.info(f"Stored in database: {total_stored}")

    # Final stats
    final_stats = await neo4j.get_projection_stats()
    logger.info(f"\nFinal projection coverage:")
    logger.info(f"  With UMAP: {final_stats['with_umap']} / {final_stats['total_entities']}")
    logger.info(f"  With t-SNE: {final_stats['with_tsne']} / {final_stats['total_entities']}")
    logger.info(f"  With UHT-UMAP: {final_stats.get('with_uht_umap', 0)} / {final_stats['total_entities']}")

    await neo4j.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Compute projections for entity embeddings and UHT codes"
    )
    parser.add_argument(
        "--method",
        type=str,
        choices=["umap", "tsne", "both", "uht_umap", "uht_pacmap", "all"],
        default="all",
        help="Projection method (default: all)"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="Entities to store per database batch (default: 500)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without computing/storing"
    )

    args = parser.parse_args()

    asyncio.run(main(
        method=args.method,
        batch_size=args.batch_size,
        dry_run=args.dry_run
    ))
