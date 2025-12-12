#!/usr/bin/env python3
"""
Test bit 3 re-evaluation on a small subset of entities.
"""

import asyncio
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from neo4j import GraphDatabase
from workers.llm_client import OpenRouterClient
import json
from dotenv import load_dotenv

load_dotenv()


async def test_bit3_reevaluation():
    """Test bit 3 re-evaluation on small subset."""

    # Load trait definition
    traits_path = "/root/project/uht-github/canonical_traits/traits_v2.json"
    with open(traits_path) as f:
        traits_data = json.load(f)

    trait = next((t for t in traits_data["traits"] if t["bit"] == 3), None)

    print(f"Testing re-evaluation of: {trait['name']} (bit {trait['bit']})")
    print()

    # Connect to Neo4j
    driver = GraphDatabase.driver(
        os.getenv("NEO4J_URI"),
        auth=(os.getenv("NEO4J_USER"), os.getenv("NEO4J_PASSWORD"))
    )

    # Get specific test cases: English Springer Spaniel + a few others
    with driver.session() as session:
        result = session.run("""
            MATCH (e:Entity)-[r:HAS_TRAIT]->(t:Trait {bit: 3})
            WHERE e.uht_code IN ['C7880008']  // English Springer Spaniel
               OR (toLower(e.name) CONTAINS 'dog' AND r.applicable = false)
               OR (toLower(e.name) CONTAINS 'plant' AND r.applicable = false)
            RETURN e.uuid as uuid, e.name as name, e.description as description,
                   r.applicable as current_value
            LIMIT 10
        """)
        entities = [dict(r) for r in result]

    print(f"Testing {len(entities)} entities:")
    for e in entities:
        print(f"  - {e['name']} (current bit 3: {'ON' if e['current_value'] else 'OFF'})")
    print()

    # Initialize LLM client
    llm_client = OpenRouterClient()

    # Evaluate each entity
    for entity in entities:
        print(f"Evaluating: {entity['name']}")
        entity_dict = {
            "name": entity["name"],
            "description": entity.get("description") or ""
        }

        result = await llm_client.evaluate_trait(entity_dict, trait)

        current = "ON" if entity["current_value"] else "OFF"
        new = "ON" if result["applicable"] else "OFF"
        changed = " [CHANGE]" if entity["current_value"] != result["applicable"] else ""

        print(f"  Current: {current} → New: {new}{changed}")
        print(f"  Confidence: {result['confidence']:.2f}")
        print(f"  Justification: {result['justification']}")
        print()

    driver.close()


if __name__ == "__main__":
    asyncio.run(test_bit3_reevaluation())
