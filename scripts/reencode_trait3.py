#!/usr/bin/env python3
"""
Re-encode trait 3 (Biological/Biomimetic) for all entities.

This script:
1. Loads all entities from Neo4j
2. Re-evaluates ONLY trait 3 using the LLM with updated specification
3. Updates bit 3 in the entity's UHT code (keeping other 31 bits unchanged)
4. Saves the updated entity and creates a version snapshot
"""

import asyncio
import os
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, List
from dotenv import load_dotenv

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from db.neo4j_client import Neo4jClient
from workers.llm_client import LLMFactory, TraitSpecificationLoader


def hex_to_binary(hex_code: str) -> str:
    """Convert 8-character hex code to 32-bit binary string."""
    return bin(int(hex_code, 16))[2:].zfill(32)


def binary_to_hex(binary_str: str) -> str:
    """Convert 32-bit binary string to 8-character hex code."""
    return format(int(binary_str, 2), '08X')


def update_bit(binary_str: str, bit_position: int, value: bool) -> str:
    """
    Update a specific bit in a 32-bit binary string.
    bit_position is 1-indexed (1-32), where bit 1 is the leftmost (MSB).
    """
    bits = list(binary_str)
    index = bit_position - 1  # Convert to 0-indexed
    bits[index] = '1' if value else '0'
    return ''.join(bits)


async def reencode_trait3():
    """Main function to re-encode trait 3 for all entities."""

    # Configuration
    BATCH_SIZE = 50
    LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openrouter")

    # Trait 3 definition (from traits_v2.json)
    TRAIT_3 = {
        "bit": 3,
        "name": "Biological/Biomimetic",
        "layer": "Physical",
        "short_description": "Has biological origin or structure inspired by biology.",
        "expanded_definition": "Either a biological organism, component, or artifact that mimics or draws design inspiration from biological structures or behaviors (e.g., neural nets, bionic limbs)."
    }

    # Initialize clients
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI", "bolt://localhost:7687"),
        user=os.getenv("NEO4J_USER", "neo4j"),
        password=os.getenv("NEO4J_PASSWORD", "uht-password-2025")
    )
    await neo4j.connect()

    llm_client = LLMFactory.create_client(LLM_PROVIDER)

    # Force reload trait specifications to get latest
    TraitSpecificationLoader.load_specifications(force_reload=True)

    # Get all entities
    print("Loading entities from Neo4j...")
    result = await neo4j.execute_query("""
        MATCH (e:Entity)
        RETURN e.uuid as uuid, e.name as name, e.description as description,
               e.uht_code as uht_code, e.version as version
        ORDER BY e.name
    """)

    entities = [dict(r) for r in result]
    total = len(entities)
    print(f"Found {total} entities to process")

    # Statistics
    stats = {
        "total": total,
        "changed": 0,
        "unchanged": 0,
        "errors": 0,
        "true_to_false": 0,
        "false_to_true": 0
    }

    start_time = time.time()

    # Process in batches
    for batch_start in range(0, total, BATCH_SIZE):
        batch_end = min(batch_start + BATCH_SIZE, total)
        batch = entities[batch_start:batch_end]

        print(f"\nProcessing batch {batch_start//BATCH_SIZE + 1} ({batch_start+1}-{batch_end} of {total})...")

        # Evaluate trait 3 for each entity in batch
        tasks = []
        for entity in batch:
            task = llm_client.evaluate_trait(
                {"name": entity["name"], "description": entity.get("description", "")},
                TRAIT_3
            )
            tasks.append(task)

        # Execute batch in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Process results
        for entity, result in zip(batch, results):
            try:
                if isinstance(result, Exception):
                    print(f"  ERROR: {entity['name']}: {result}")
                    stats["errors"] += 1
                    continue

                old_hex = entity["uht_code"]
                old_binary = hex_to_binary(old_hex)
                old_bit3 = old_binary[2] == '1'  # Bit 3 is at index 2 (0-indexed)

                new_bit3 = result.get("applicable", False)

                if old_bit3 == new_bit3:
                    stats["unchanged"] += 1
                    continue

                # Update bit 3
                new_binary = update_bit(old_binary, 3, new_bit3)
                new_hex = binary_to_hex(new_binary)

                # Track direction of change
                if old_bit3 and not new_bit3:
                    stats["true_to_false"] += 1
                    direction = "1->0"
                else:
                    stats["false_to_true"] += 1
                    direction = "0->1"

                print(f"  CHANGED: {entity['name']}: {old_hex} -> {new_hex} (bit3: {direction})")
                print(f"           Reason: {result.get('justification', 'N/A')[:80]}...")

                # Update entity in Neo4j
                new_version = (entity.get("version") or 1) + 1

                await neo4j.execute_query("""
                    MATCH (e:Entity {uuid: $uuid})
                    SET e.uht_code = $new_code,
                        e.version = $new_version,
                        e.updated_at = datetime()
                    WITH e
                    CREATE (v:EntityVersion {
                        entity_uuid: e.uuid,
                        version: $new_version,
                        name: e.name,
                        description: e.description,
                        uht_code: $new_code,
                        change_reason: $reason,
                        created_at: datetime()
                    })
                    CREATE (e)-[:HAS_VERSION]->(v)
                """,
                    uuid=entity["uuid"],
                    new_code=new_hex,
                    new_version=new_version,
                    reason=f"Re-encoded trait 3: {result.get('justification', 'Updated specification')}"
                )

                stats["changed"] += 1

            except Exception as e:
                print(f"  ERROR processing {entity['name']}: {e}")
                stats["errors"] += 1

        # Rate limiting between batches
        await asyncio.sleep(1)

        # Progress update
        elapsed = time.time() - start_time
        processed = batch_end
        rate = processed / elapsed if elapsed > 0 else 0
        eta = (total - processed) / rate if rate > 0 else 0

        print(f"  Progress: {processed}/{total} ({processed/total*100:.1f}%) - "
              f"Rate: {rate:.1f}/s - ETA: {eta/60:.1f}min")
        print(f"  Stats: {stats['changed']} changed, {stats['unchanged']} unchanged, {stats['errors']} errors")

    # Final summary
    elapsed = time.time() - start_time
    print("\n" + "=" * 60)
    print("COMPLETED")
    print("=" * 60)
    print(f"Total entities:     {stats['total']}")
    print(f"Changed:            {stats['changed']}")
    print(f"  - True -> False:  {stats['true_to_false']}")
    print(f"  - False -> True:  {stats['false_to_true']}")
    print(f"Unchanged:          {stats['unchanged']}")
    print(f"Errors:             {stats['errors']}")
    print(f"Time elapsed:       {elapsed/60:.1f} minutes")
    print(f"Rate:               {stats['total']/elapsed:.1f} entities/second")

    await neo4j.close()


if __name__ == "__main__":
    asyncio.run(reencode_trait3())
