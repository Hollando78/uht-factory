#!/usr/bin/env python3
"""
Migration script to create initial version snapshots for existing entities.

This script:
1. Finds all entities that don't have any HAS_VERSION relationships
2. Creates a v1 EntityVersion snapshot with change_type='created'
3. Initializes the Entity.version field to 1

Usage:
    python scripts/migrate_entity_versions.py [--batch-size 100] [--limit 0] [--dry-run]

Options:
    --batch-size    Number of entities to process per batch (default: 100)
    --limit         Maximum entities to process (0 = unlimited, default: 0)
    --dry-run       Show what would be done without making changes
"""

import os
import sys
import asyncio
import argparse
import logging
import json
from datetime import datetime
from pathlib import Path
from uuid import uuid4

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from db.neo4j_client import Neo4jClient

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def get_entities_without_versions(neo4j: Neo4jClient, limit: int = 100) -> list:
    """Get entities that don't have any version history."""
    query = """
    MATCH (e:Entity)
    WHERE NOT EXISTS((e)-[:HAS_VERSION]->())
    RETURN e.uuid as uuid,
           e.name as name,
           e.description as description,
           e.uht_code as uht_code,
           e.binary_representation as binary_representation,
           e.nsfw as nsfw,
           e.image_url as image_url,
           e.created_at as created_at,
           e.version as current_version
    ORDER BY e.created_at ASC
    LIMIT $limit
    """
    async with neo4j.driver.session() as session:
        result = await session.run(query, limit=limit)
        entities = []
        async for record in result:
            entities.append(dict(record))
        return entities


async def get_entity_traits(neo4j: Neo4jClient, entity_uuid: str) -> list:
    """Get trait evaluations for an entity."""
    query = """
    MATCH (e:Entity {uuid: $uuid})-[r:HAS_TRAIT]->(t:Trait)
    RETURN t.bit as bit,
           t.name as name,
           r.applicable as applicable,
           r.confidence as confidence,
           r.justification as justification
    ORDER BY t.bit
    """
    async with neo4j.driver.session() as session:
        result = await session.run(query, uuid=entity_uuid)
        traits = []
        async for record in result:
            traits.append({
                "bit": record["bit"],
                "name": record["name"],
                "applicable": record["applicable"],
                "confidence": record["confidence"],
                "justification": record["justification"] or ""
            })
        return traits


async def create_initial_version(
    neo4j: Neo4jClient,
    entity: dict,
    traits: list
) -> bool:
    """Create the initial v1 version snapshot for an entity."""
    version_id = str(uuid4())

    # Serialize traits to JSON
    trait_snapshot_json = json.dumps(traits) if traits else "[]"

    query = """
    MATCH (e:Entity {uuid: $entity_uuid})

    // Create the version node
    CREATE (v:EntityVersion {
        version_id: $version_id,
        entity_uuid: $entity_uuid,
        version_number: 1,
        name: e.name,
        description: e.description,
        uht_code: e.uht_code,
        binary_representation: e.binary_representation,
        nsfw: COALESCE(e.nsfw, false),
        image_url: e.image_url,
        trait_snapshot: $trait_snapshot,
        change_type: 'created',
        change_summary: 'Initial entity creation (migrated)',
        changed_by: 'migration_script',
        changed_at: COALESCE(e.created_at, datetime()),
        changed_fields: [],
        previous_values: '{}'
    })

    // Create the relationship
    CREATE (e)-[:HAS_VERSION]->(v)

    // Set version number on entity if not set
    SET e.version = COALESCE(e.version, 1)

    RETURN v.version_id as version_id
    """

    try:
        async with neo4j.driver.session() as session:
            result = await session.run(
                query,
                entity_uuid=entity["uuid"],
                version_id=version_id,
                trait_snapshot=trait_snapshot_json
            )
            record = await result.single()
            return record is not None
    except Exception as e:
        logger.error(f"Failed to create version for {entity['name']}: {e}")
        return False


async def count_entities_status(neo4j: Neo4jClient) -> dict:
    """Count entities with and without version history."""
    query = """
    MATCH (e:Entity)
    OPTIONAL MATCH (e)-[:HAS_VERSION]->(v:EntityVersion)
    WITH e, count(v) as version_count
    RETURN
        count(CASE WHEN version_count > 0 THEN 1 END) as with_versions,
        count(CASE WHEN version_count = 0 THEN 1 END) as without_versions,
        count(*) as total
    """
    async with neo4j.driver.session() as session:
        result = await session.run(query)
        record = await result.single()
        return {
            "with_versions": record["with_versions"],
            "without_versions": record["without_versions"],
            "total": record["total"]
        }


async def main(
    batch_size: int = 100,
    max_limit: int = 0,
    dry_run: bool = False
):
    """Main migration function."""

    # Initialize Neo4j client
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )
    await neo4j.connect()

    # Get initial counts
    counts = await count_entities_status(neo4j)
    logger.info(f"Version status: {counts['with_versions']} with / {counts['without_versions']} without / {counts['total']} total")

    if counts["without_versions"] == 0:
        logger.info("All entities already have version history. Nothing to do.")
        await neo4j.close()
        return

    # Calculate how many to process
    to_process = counts["without_versions"]
    if max_limit > 0:
        to_process = min(to_process, max_limit)

    logger.info(f"Will process {to_process} entities")

    if dry_run:
        logger.info("DRY RUN - No changes will be made")

        # Show sample of entities that would be migrated
        sample = await get_entities_without_versions(neo4j, limit=min(5, to_process))
        logger.info("Sample entities that would be migrated:")
        for entity in sample:
            logger.info(f"  - {entity['name']} ({entity['uht_code']})")

        await neo4j.close()
        return

    # Process in batches
    total_processed = 0
    total_success = 0
    total_errors = 0
    start_time = datetime.now()
    batch_num = 0

    while total_processed < to_process:
        # Get next batch
        remaining = to_process - total_processed
        current_batch_size = min(batch_size, remaining)

        entities = await get_entities_without_versions(neo4j, limit=current_batch_size)

        if not entities:
            logger.info("No more entities to process")
            break

        batch_num += 1
        batch_start = datetime.now()
        batch_success = 0
        batch_errors = 0

        for entity in entities:
            # Get traits for this entity
            traits = await get_entity_traits(neo4j, entity["uuid"])

            # Create initial version
            success = await create_initial_version(neo4j, entity, traits)

            if success:
                batch_success += 1
            else:
                batch_errors += 1

        batch_time = (datetime.now() - batch_start).total_seconds()
        total_processed += len(entities)
        total_success += batch_success
        total_errors += batch_errors

        # Calculate progress
        elapsed = (datetime.now() - start_time).total_seconds() / 60
        rate = total_processed / elapsed if elapsed > 0 else 0
        remaining_entities = to_process - total_processed
        eta_minutes = remaining_entities / rate if rate > 0 else 0

        logger.info(
            f"Batch {batch_num}: {len(entities)} entities in {batch_time:.1f}s "
            f"(success: {batch_success}, errors: {batch_errors}) "
            f"[{total_processed}/{to_process} - {100*total_processed/to_process:.1f}%] "
            f"(elapsed: {elapsed:.1f}m, remaining: ~{eta_minutes:.1f}m)"
        )

    # Final summary
    elapsed_total = (datetime.now() - start_time).total_seconds() / 60
    logger.info("")
    logger.info("=" * 60)
    logger.info("ENTITY VERSION MIGRATION COMPLETE")
    logger.info("=" * 60)
    logger.info(f"Total processed: {total_processed}")
    logger.info(f"Successful: {total_success}")
    logger.info(f"Errors: {total_errors}")
    logger.info(f"Time elapsed: {elapsed_total:.1f} minutes")
    if elapsed_total > 0:
        logger.info(f"Rate: {total_processed / elapsed_total:.1f} entities/minute")

    # Final counts
    final_counts = await count_entities_status(neo4j)
    logger.info(f"Final status: {final_counts['with_versions']} with / {final_counts['without_versions']} without")

    await neo4j.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Create initial version snapshots for existing entities"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Number of entities to process per batch (default: 100)"
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
        help="Show what would be done without making changes"
    )

    args = parser.parse_args()

    asyncio.run(main(
        batch_size=args.batch_size,
        max_limit=args.limit,
        dry_run=args.dry_run
    ))
