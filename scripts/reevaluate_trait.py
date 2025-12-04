#!/usr/bin/env python3
"""
Re-evaluate a single trait for all entities.
Usage: python scripts/reevaluate_trait.py --bit 24 --batch-size 50
"""

import asyncio
import argparse
import json
import os
import sys
import time
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from neo4j import GraphDatabase
from workers.llm_client import OpenRouterClient

# Load environment
from dotenv import load_dotenv
load_dotenv()


async def reevaluate_trait(bit: int, batch_size: int = 50, dry_run: bool = False):
    """Re-evaluate a single trait for all entities."""

    # Load trait definition
    traits_path = "/root/project/uht-github/canonical_traits/traits_v2.json"
    with open(traits_path) as f:
        traits_data = json.load(f)

    trait = next((t for t in traits_data["traits"] if t["bit"] == bit), None)
    if not trait:
        print(f"Error: Trait bit {bit} not found")
        return

    print(f"Re-evaluating trait: {trait['name']} (bit {bit})")
    print(f"  Short: {trait['short_description']}")
    print(f"  Expanded: {trait['expanded_definition'][:100]}...")
    print()

    # Connect to Neo4j
    driver = GraphDatabase.driver(
        os.getenv("NEO4J_URI", "bolt://localhost:7687"),
        auth=(os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD"))
    )

    # Get all entities
    with driver.session() as session:
        result = session.run("""
            MATCH (e:Entity)
            RETURN e.uuid as uuid, e.name as name, e.description as description
            ORDER BY e.name
        """)
        entities = [dict(r) for r in result]

    print(f"Found {len(entities)} entities to re-evaluate")

    if dry_run:
        print("Dry run - not making any changes")
        driver.close()
        return

    # Initialize LLM client
    llm_client = OpenRouterClient()

    # Process in batches
    start_time = time.time()
    updated = 0
    errors = 0

    for i in range(0, len(entities), batch_size):
        batch = entities[i:i + batch_size]
        batch_start = time.time()

        # Evaluate trait for batch in parallel
        tasks = []
        for entity in batch:
            entity_dict = {
                "name": entity["name"],
                "description": entity.get("description") or ""
            }
            tasks.append(llm_client.evaluate_trait(entity_dict, trait))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Update Neo4j with results
        with driver.session() as session:
            for entity, result in zip(batch, results):
                if isinstance(result, Exception):
                    print(f"  Error for {entity['name']}: {result}")
                    errors += 1
                    continue

                # Update the HAS_TRAIT relationship
                session.run("""
                    MATCH (e:Entity {uuid: $uuid})-[r:HAS_TRAIT]->(t:Trait {bit: $bit})
                    SET r.applicable = $applicable,
                        r.confidence = $confidence,
                        r.justification = $justification,
                        r.model_used = $model_used,
                        r.evaluated_at = datetime(),
                        r.reevaluated = true
                """,
                    uuid=entity["uuid"],
                    bit=bit,
                    applicable=result["applicable"],
                    confidence=result["confidence"],
                    justification=result["justification"],
                    model_used=result.get("model_used", "unknown")
                )
                updated += 1

        # Update UHT codes for affected entities
        with driver.session() as session:
            for entity, result in zip(batch, results):
                if isinstance(result, Exception):
                    continue

                # Recalculate UHT code based on all traits
                traits_result = session.run("""
                    MATCH (e:Entity {uuid: $uuid})-[r:HAS_TRAIT]->(t:Trait)
                    RETURN t.bit as bit, r.applicable as applicable
                    ORDER BY t.bit
                """, uuid=entity["uuid"])

                # Build binary string
                trait_map = {r["bit"]: r["applicable"] for r in traits_result}
                binary = "".join("1" if trait_map.get(b, False) else "0" for b in range(1, 33))
                hex_code = format(int(binary, 2), '08X')

                # Update entity
                session.run("""
                    MATCH (e:Entity {uuid: $uuid})
                    SET e.uht_code = $uht_code,
                        e.binary_representation = $binary,
                        e.updated_at = datetime()
                """, uuid=entity["uuid"], uht_code=hex_code, binary=binary)

        batch_time = time.time() - batch_start
        elapsed = time.time() - start_time
        remaining = (len(entities) - i - len(batch)) / batch_size * batch_time

        print(f"  Batch {i//batch_size + 1}/{(len(entities) + batch_size - 1)//batch_size}: "
              f"{len(batch)} entities in {batch_time:.1f}s "
              f"(elapsed: {elapsed/60:.1f}m, remaining: ~{remaining/60:.1f}m)")

    driver.close()

    total_time = time.time() - start_time
    print()
    print(f"Complete! Updated {updated} entities, {errors} errors")
    print(f"Total time: {total_time/60:.1f} minutes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Re-evaluate a trait for all entities")
    parser.add_argument("--bit", type=int, required=True, help="Trait bit number to re-evaluate")
    parser.add_argument("--batch-size", type=int, default=50, help="Batch size for parallel processing")
    parser.add_argument("--dry-run", action="store_true", help="Don't make changes, just show what would be done")

    args = parser.parse_args()

    asyncio.run(reevaluate_trait(args.bit, args.batch_size, args.dry_run))
