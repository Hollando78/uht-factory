#!/usr/bin/env python3
"""
Batch generate embeddings for existing entities.

This script generates OpenAI embeddings for all entities that don't have
embeddings yet. Uses batch API for efficiency and includes progress tracking.

Usage:
    python scripts/batch_generate_embeddings.py [--batch-size 100] [--delay 1.0] [--limit 0]

Options:
    --batch-size    Number of entities per API call (default: 100)
    --delay         Seconds to wait between batches (default: 1.0)
    --limit         Maximum entities to process (0 = unlimited, default: 0)
    --dry-run       Show what would be done without making API calls
"""

import os
import sys
import asyncio
import argparse
import logging
from datetime import datetime
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from db.neo4j_client import Neo4jClient
from workers.embedding_client import EmbeddingOrchestrator, build_embedding_text

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def get_entities_without_embeddings(
    neo4j: Neo4jClient,
    limit: int = 100
) -> list:
    """Get entities that need embeddings"""
    return await neo4j.get_entities_without_embeddings(limit=limit)


async def generate_embeddings_batch(
    entities: list,
    orchestrator: EmbeddingOrchestrator,
    neo4j: Neo4jClient
) -> dict:
    """Generate embeddings for a batch of entities"""
    results = await orchestrator.generate_batch_entity_embeddings(entities)

    success_count = 0
    error_count = 0
    total_cost = 0.0
    total_tokens = 0

    for entity, result in zip(entities, results):
        if result.get("success"):
            # Store embedding in Neo4j
            await neo4j.store_entity_embedding(
                uuid=entity["uuid"],
                embedding=result["embedding"],
                model_used=result["model_used"]
            )
            success_count += 1
            total_cost += result.get("cost_usd", 0)
            total_tokens += result.get("tokens_used", 0)
        else:
            error_count += 1
            logger.warning(f"Failed to generate embedding for '{entity['name']}': {result.get('error')}")

    return {
        "success": success_count,
        "errors": error_count,
        "cost_usd": total_cost,
        "tokens": total_tokens
    }


async def main(
    batch_size: int = 100,
    delay: float = 1.0,
    max_limit: int = 0,
    dry_run: bool = False
):
    """Main batch embedding generation function"""

    # Initialize clients
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )
    await neo4j.connect()

    # Get initial counts
    counts = await neo4j.count_entities_with_embeddings()
    logger.info(f"Embedding status: {counts['with_embeddings']} with / {counts['without_embeddings']} without / {counts['total']} total")

    if counts["without_embeddings"] == 0:
        logger.info("All entities already have embeddings. Nothing to do.")
        await neo4j.close()
        return

    # Calculate how many to process
    to_process = counts["without_embeddings"]
    if max_limit > 0:
        to_process = min(to_process, max_limit)

    # Estimate cost
    estimated_tokens = to_process * 300  # ~300 tokens per entity average
    estimated_cost = (estimated_tokens / 1_000_000) * 0.02  # $0.02 per 1M tokens

    logger.info(f"Will process {to_process} entities")
    logger.info(f"Estimated cost: ${estimated_cost:.4f} ({estimated_tokens:,} tokens)")

    if dry_run:
        logger.info("DRY RUN - No embeddings will be generated")
        await neo4j.close()
        return

    # Initialize orchestrator
    orchestrator = EmbeddingOrchestrator()

    # Process in batches
    total_processed = 0
    total_success = 0
    total_errors = 0
    total_cost = 0.0
    total_tokens = 0
    start_time = datetime.now()
    batch_num = 0

    while total_processed < to_process:
        # Get next batch
        remaining = to_process - total_processed
        current_batch_size = min(batch_size, remaining)

        entities = await get_entities_without_embeddings(neo4j, limit=current_batch_size)

        if not entities:
            logger.info("No more entities to process")
            break

        batch_num += 1
        batch_start = datetime.now()

        # Generate embeddings
        result = await generate_embeddings_batch(entities, orchestrator, neo4j)

        batch_time = (datetime.now() - batch_start).total_seconds()
        total_processed += len(entities)
        total_success += result["success"]
        total_errors += result["errors"]
        total_cost += result["cost_usd"]
        total_tokens += result["tokens"]

        # Calculate progress
        elapsed = (datetime.now() - start_time).total_seconds() / 60
        rate = total_processed / elapsed if elapsed > 0 else 0
        remaining_entities = to_process - total_processed
        eta_minutes = remaining_entities / rate if rate > 0 else 0

        logger.info(
            f"Batch {batch_num}: {len(entities)} entities in {batch_time:.1f}s "
            f"(success: {result['success']}, errors: {result['errors']}, "
            f"cost: ${result['cost_usd']:.6f}) "
            f"[{total_processed}/{to_process} - {100*total_processed/to_process:.1f}%] "
            f"(elapsed: {elapsed:.1f}m, remaining: ~{eta_minutes:.1f}m)"
        )

        # Delay between batches
        if total_processed < to_process and delay > 0:
            await asyncio.sleep(delay)

    # Final summary
    elapsed_total = (datetime.now() - start_time).total_seconds() / 60
    logger.info("")
    logger.info("=" * 60)
    logger.info("BATCH EMBEDDING GENERATION COMPLETE")
    logger.info("=" * 60)
    logger.info(f"Total processed: {total_processed}")
    logger.info(f"Successful: {total_success}")
    logger.info(f"Errors: {total_errors}")
    logger.info(f"Total tokens: {total_tokens:,}")
    logger.info(f"Total cost: ${total_cost:.4f}")
    logger.info(f"Time elapsed: {elapsed_total:.1f} minutes")
    logger.info(f"Rate: {total_processed / elapsed_total:.1f} entities/minute")

    # Final counts
    final_counts = await neo4j.count_entities_with_embeddings()
    logger.info(f"Final status: {final_counts['with_embeddings']} with / {final_counts['without_embeddings']} without")

    await neo4j.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate embeddings for entities without embeddings"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Number of entities per API call (default: 100)"
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.0,
        help="Seconds to wait between batches (default: 1.0)"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Maximum entities to process (0 = unlimited)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making API calls"
    )

    args = parser.parse_args()

    asyncio.run(main(
        batch_size=args.batch_size,
        delay=args.delay,
        max_limit=args.limit,
        dry_run=args.dry_run
    ))
