#!/usr/bin/env python3
"""
Batch improve short entity descriptions using LLM.

Finds entities with short/missing descriptions and generates better ones.

Usage:
    python scripts/batch_improve_descriptions.py [--batch-size 10] [--max-length 30] [--limit 0] [--dry-run]

Options:
    --batch-size    Number of entities per batch (default: 10)
    --max-length    Max description length to consider "short" (default: 30)
    --limit         Maximum entities to process (0 = unlimited, default: 0)
    --dry-run       Show what would be done without making changes
"""

import os
import sys
import asyncio
import argparse
import logging
import json
import re
from datetime import datetime
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from db.neo4j_client import Neo4jClient
from workers.llm_client import LLMFactory

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def get_entities_with_short_descriptions(
    neo4j: Neo4jClient,
    max_length: int = 30,
    limit: int = 100
) -> list:
    """Get entities with short or missing descriptions."""
    query = """
    MATCH (e:Entity)
    WHERE size(COALESCE(e.description, '')) <= $max_length
    RETURN e.uuid as uuid,
           e.name as name,
           COALESCE(e.description, '') as description
    ORDER BY size(COALESCE(e.description, '')) ASC
    LIMIT $limit
    """
    async with neo4j.driver.session() as session:
        result = await session.run(query, max_length=max_length, limit=limit)
        entities = []
        async for record in result:
            entities.append(dict(record))
        return entities


async def generate_description(llm_client, entity_name: str, current_desc: str) -> dict:
    """Generate an improved description for an entity."""
    prompt = f"""Generate a clear, informative description for this entity.

Entity: {entity_name}
Current description: {current_desc if current_desc else "(none)"}

Requirements:
- 2-3 sentences, 100-200 characters
- Factual and objective
- Explain what it IS, not what it does
- No subjective opinions

Respond with ONLY valid JSON:
{{"description": "Your description here", "confidence": 0.9}}

Entity: {entity_name}"""

    try:
        response = await llm_client.get_completion(prompt=prompt, temperature=0.3)

        # Parse JSON response
        try:
            result = json.loads(response)
        except json.JSONDecodeError:
            # Extract JSON from markdown
            json_match = re.search(r'\{[^{}]*\}', response, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
            else:
                return {"success": False, "error": "Failed to parse JSON"}

        description = result.get("description", "")
        if len(description) < 20:
            return {"success": False, "error": "Description too short"}

        return {
            "success": True,
            "description": description,
            "confidence": result.get("confidence", 0.8)
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


async def update_entity_description(neo4j: Neo4jClient, uuid: str, description: str) -> bool:
    """Update an entity's description in Neo4j."""
    query = """
    MATCH (e:Entity {uuid: $uuid})
    SET e.description = $description,
        e.description_improved_at = datetime()
    RETURN e.uuid
    """
    try:
        async with neo4j.driver.session() as session:
            result = await session.run(query, uuid=uuid, description=description)
            record = await result.single()
            return record is not None
    except Exception as e:
        logger.error(f"Failed to update entity {uuid}: {e}")
        return False


async def count_short_descriptions(neo4j: Neo4jClient, max_length: int) -> int:
    """Count entities with short descriptions."""
    query = """
    MATCH (e:Entity)
    WHERE size(COALESCE(e.description, '')) <= $max_length
    RETURN count(e) as count
    """
    async with neo4j.driver.session() as session:
        result = await session.run(query, max_length=max_length)
        record = await result.single()
        return record["count"] if record else 0


async def main(
    batch_size: int = 10,
    max_length: int = 30,
    max_limit: int = 0,
    dry_run: bool = False
):
    """Main batch description improvement function."""

    # Initialize clients
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )
    await neo4j.connect()

    llm_provider = os.getenv("LLM_PROVIDER", "openrouter")
    llm_client = LLMFactory.create_client(llm_provider)

    # Get count
    total_short = await count_short_descriptions(neo4j, max_length)
    logger.info(f"Entities with descriptions <= {max_length} chars: {total_short}")

    if total_short == 0:
        logger.info("No entities need description improvement.")
        await neo4j.close()
        return

    # Calculate how many to process
    to_process = total_short
    if max_limit > 0:
        to_process = min(to_process, max_limit)

    logger.info(f"Will process {to_process} entities")
    logger.info(f"Using LLM provider: {llm_provider}")

    if dry_run:
        # Show sample
        sample = await get_entities_with_short_descriptions(neo4j, max_length, limit=5)
        logger.info("DRY RUN - Sample entities:")
        for e in sample:
            logger.info(f"  {e['name']}: \"{e['description']}\"")
        await neo4j.close()
        return

    # Process in batches
    total_processed = 0
    total_success = 0
    total_errors = 0
    start_time = datetime.now()
    batch_num = 0

    while total_processed < to_process:
        remaining = to_process - total_processed
        current_batch_size = min(batch_size, remaining)

        entities = await get_entities_with_short_descriptions(
            neo4j, max_length, limit=current_batch_size
        )

        if not entities:
            logger.info("No more entities to process")
            break

        batch_num += 1
        batch_start = datetime.now()
        batch_success = 0
        batch_errors = 0

        for entity in entities:
            # Generate improved description
            result = await generate_description(
                llm_client,
                entity["name"],
                entity["description"]
            )

            if result["success"]:
                # Update in Neo4j
                updated = await update_entity_description(
                    neo4j,
                    entity["uuid"],
                    result["description"]
                )
                if updated:
                    batch_success += 1
                    logger.debug(f"  ✓ {entity['name']}: \"{result['description'][:50]}...\"")
                else:
                    batch_errors += 1
            else:
                batch_errors += 1
                logger.warning(f"  ✗ {entity['name']}: {result.get('error', 'Unknown error')}")

            # Small delay to avoid rate limits
            await asyncio.sleep(0.5)

        batch_time = (datetime.now() - batch_start).total_seconds()
        total_processed += len(entities)
        total_success += batch_success
        total_errors += batch_errors

        # Progress
        elapsed = (datetime.now() - start_time).total_seconds() / 60
        rate = total_processed / elapsed if elapsed > 0 else 0
        remaining_count = to_process - total_processed
        eta = remaining_count / rate if rate > 0 else 0

        logger.info(
            f"Batch {batch_num}: {len(entities)} in {batch_time:.1f}s "
            f"(success: {batch_success}, errors: {batch_errors}) "
            f"[{total_processed}/{to_process} - {100*total_processed/to_process:.1f}%] "
            f"(~{eta:.1f}m remaining)"
        )

    # Summary
    elapsed_total = (datetime.now() - start_time).total_seconds() / 60
    logger.info("")
    logger.info("=" * 60)
    logger.info("DESCRIPTION IMPROVEMENT COMPLETE")
    logger.info("=" * 60)
    logger.info(f"Total processed: {total_processed}")
    logger.info(f"Successful: {total_success}")
    logger.info(f"Errors: {total_errors}")
    logger.info(f"Time: {elapsed_total:.1f} minutes")

    # Final count
    final_count = await count_short_descriptions(neo4j, max_length)
    logger.info(f"Remaining short descriptions: {final_count}")

    await neo4j.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Improve short entity descriptions using LLM"
    )
    parser.add_argument(
        "--batch-size", type=int, default=10,
        help="Entities per batch (default: 10)"
    )
    parser.add_argument(
        "--max-length", type=int, default=30,
        help="Max description length to improve (default: 30)"
    )
    parser.add_argument(
        "--limit", type=int, default=0,
        help="Max entities to process (0 = unlimited)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Show what would be done"
    )

    args = parser.parse_args()

    asyncio.run(main(
        batch_size=args.batch_size,
        max_length=args.max_length,
        max_limit=args.limit,
        dry_run=args.dry_run
    ))
