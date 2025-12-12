#!/usr/bin/env python3
from neo4j import GraphDatabase
from dotenv import load_dotenv
import os

load_dotenv()

driver = GraphDatabase.driver(
    os.getenv("NEO4J_URI"),
    auth=(os.getenv("NEO4J_USER"), os.getenv("NEO4J_PASSWORD"))
)

with driver.session() as session:
    # Check entities with bit 3 OFF that might be biological
    result = session.run("""
        MATCH (e:Entity)-[r:HAS_TRAIT]->(t:Trait {bit: 3})
        WHERE r.applicable = false
        AND (toLower(e.name) CONTAINS 'dog'
             OR toLower(e.name) CONTAINS 'cat'
             OR toLower(e.name) CONTAINS 'bird'
             OR toLower(e.name) CONTAINS 'plant'
             OR toLower(e.name) CONTAINS 'tree'
             OR toLower(e.name) CONTAINS 'animal'
             OR toLower(e.name) CONTAINS 'fish'
             OR toLower(e.name) CONTAINS 'bacteria')
        RETURN count(e) as count, collect(e.name)[0..10] as examples
    """)
    record = result.single()
    print(f"Potentially incorrect entities: {record['count']}")
    print(f"\nExamples:")
    for name in record['examples']:
        print(f"  - {name}")

    # Also check the specific English Springer Spaniel
    result2 = session.run("""
        MATCH (e:Entity {uht_code: 'C7880008'})-[r:HAS_TRAIT]->(t:Trait {bit: 3})
        RETURN e.name as name, e.uht_code as code, r.applicable as bit3_on
    """)
    record2 = result2.single()
    if record2:
        print(f"\nEnglish Springer Spaniel status:")
        print(f"  Name: {record2['name']}")
        print(f"  UHT Code: {record2['code']}")
        print(f"  Bit 3 (Biological): {'ON' if record2['bit3_on'] else 'OFF'}")
    else:
        print("\nEnglish Springer Spaniel not found in database")

    # Check total entities with bit 3 OFF
    result3 = session.run("""
        MATCH (e:Entity)-[r:HAS_TRAIT]->(t:Trait {bit: 3})
        WHERE r.applicable = false
        RETURN count(e) as total
    """)
    total = result3.single()['total']
    print(f"\nTotal entities with bit 3 OFF: {total}")

driver.close()
