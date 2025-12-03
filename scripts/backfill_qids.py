#!/usr/bin/env python3
"""
Backfill Wikidata QIDs from sanitized JSON to Neo4j entities.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

from db.neo4j_client import Neo4jClient


async def main():
    # Load sanitized data with QIDs
    json_path = Path(__file__).parent.parent / "data" / "wikidata_types_sanitized.json"
    with open(json_path) as f:
        entities = json.load(f)

    # Build name -> QID mapping
    name_to_qid = {e["name"]: e["wikidata_qid"] for e in entities}
    print(f"Loaded {len(name_to_qid)} entities from JSON")

    # Connect to Neo4j
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )
    await neo4j.connect()

    # Get all entities from Neo4j
    results = await neo4j.execute_query("MATCH (e:Entity) RETURN e.name as name, e.uuid as uuid")
    print(f"Found {len(results)} entities in Neo4j")

    # Update QIDs in batches
    updated = 0
    not_found = 0
    batch_size = 100

    for i, r in enumerate(results):
        name = r["name"]
        uuid = r["uuid"]

        qid = name_to_qid.get(name)

        if qid:
            await neo4j.execute_query(
                "MATCH (e:Entity {uuid: $uuid}) SET e.wikidata_qid = $qid",
                uuid=uuid, qid=qid
            )
            updated += 1
        else:
            not_found += 1

        if (i + 1) % 500 == 0:
            print(f"  Processed {i + 1}/{len(results)}...")

    print(f"\nDone!")
    print(f"Updated with QIDs: {updated}")
    print(f"Not found in JSON: {not_found}")

    await neo4j.close()


if __name__ == "__main__":
    asyncio.run(main())
