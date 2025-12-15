#!/usr/bin/env python3
"""
Reset all entity versions and recreate v1 snapshots.

This script:
1. Deletes all EntityVersion nodes and HAS_VERSION relationships
2. Resets all Entity.version fields to 1
3. Creates fresh v1 snapshots for all entities

Usage:
    python scripts/reset_entity_versions.py [--batch-size 100]
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


async def delete_all_versions(neo4j: Neo4jClient) -> int:
    """Delete all EntityVersion nodes and relationships."""
    query = """
    MATCH (v:EntityVersion)
    DETACH DELETE v
    RETURN count(v) as deleted
    """
    async with neo4j.driver.session() as session:
        result = await session.run(query)
        record = await result.single()
        return record["deleted"] if record else 0


async def reset_entity_versions(neo4j: Neo4jClient) -> int:
    """Reset all Entity.version fields to 1."""
    query = """
    MATCH (e:Entity)
    SET e.version = 1
    RETURN count(e) as updated
    """
    async with neo4j.driver.session() as session:
        result = await session.run(query)
        record = await result.single()
        return record["updated"] if record else 0


async def get_all_entities(neo4j: Neo4jClient, limit: int = 100, offset: int = 0) -> list:
    """Get entities for version creation."""
    query = """
    MATCH (e:Entity)
    RETURN e.uuid as uuid,
           e.name as name,
           e.description as description,
           e.uht_code as uht_code,
           e.binary_representation as binary_representation,
           e.nsfw as nsfw,
           e.image_url as image_url,
           e.created_at as created_at
    ORDER BY e.created_at ASC
    SKIP $offset
    LIMIT $limit
    """
    async with neo4j.driver.session() as session:
        result = await session.run(query, limit=limit, offset=offset)
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
    trait_snapshot_json = json.dumps(traits) if traits else "[]"

    query = """
    MATCH (e:Entity {uuid: $entity_uuid})
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
        change_summary: 'Initial entity creation',
        changed_by: 'system',
        changed_at: COALESCE(e.created_at, datetime()),
        changed_fields: [],
        previous_values: '{}'
    })
    CREATE (e)-[:HAS_VERSION]->(v)
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


async def count_entities(neo4j: Neo4jClient) -> int:
    """Count total entities."""
    query = "MATCH (e:Entity) RETURN count(e) as total"
    async with neo4j.driver.session() as session:
        result = await session.run(query)
        record = await result.single()
        return record["total"] if record else 0


async def main(batch_size: int = 100):
    """Main reset and migration function."""

    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )
    await neo4j.connect()

    # Step 1: Delete all existing versions
    logger.info("Step 1: Deleting all existing EntityVersion nodes...")
    deleted = await delete_all_versions(neo4j)
    logger.info(f"Deleted {deleted} version nodes")

    # Step 2: Reset entity version counters
    logger.info("Step 2: Resetting Entity.version to 1...")
    reset = await reset_entity_versions(neo4j)
    logger.info(f"Reset {reset} entities to v1")

    # Step 3: Create v1 snapshots for all entities
    logger.info("Step 3: Creating v1 snapshots for all entities...")
    total_entities = await count_entities(neo4j)
    logger.info(f"Total entities to process: {total_entities}")

    total_processed = 0
    total_success = 0
    total_errors = 0
    start_time = datetime.now()
    batch_num = 0

    while total_processed < total_entities:
        entities = await get_all_entities(neo4j, limit=batch_size, offset=total_processed)

        if not entities:
            break

        batch_num += 1
        batch_start = datetime.now()
        batch_success = 0
        batch_errors = 0

        for entity in entities:
            traits = await get_entity_traits(neo4j, entity["uuid"])
            success = await create_initial_version(neo4j, entity, traits)

            if success:
                batch_success += 1
            else:
                batch_errors += 1

        batch_time = (datetime.now() - batch_start).total_seconds()
        total_processed += len(entities)
        total_success += batch_success
        total_errors += batch_errors

        elapsed = (datetime.now() - start_time).total_seconds() / 60
        rate = total_processed / elapsed if elapsed > 0 else 0
        remaining = total_entities - total_processed
        eta = remaining / rate if rate > 0 else 0

        logger.info(
            f"Batch {batch_num}: {len(entities)} in {batch_time:.1f}s "
            f"[{total_processed}/{total_entities} - {100*total_processed/total_entities:.1f}%] "
            f"(~{eta:.1f}m remaining)"
        )

    # Summary
    elapsed_total = (datetime.now() - start_time).total_seconds()
    logger.info("")
    logger.info("=" * 60)
    logger.info("RESET COMPLETE")
    logger.info("=" * 60)
    logger.info(f"Entities processed: {total_processed}")
    logger.info(f"Snapshots created: {total_success}")
    logger.info(f"Errors: {total_errors}")
    logger.info(f"Time: {elapsed_total:.1f}s")

    await neo4j.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Reset entity versions and create v1 snapshots")
    parser.add_argument("--batch-size", type=int, default=100, help="Batch size (default: 100)")
    args = parser.parse_args()

    asyncio.run(main(batch_size=args.batch_size))
