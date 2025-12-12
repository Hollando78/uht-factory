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
    # Search for English Springer Spaniel
    result = session.run("""
        MATCH (e:Entity)
        WHERE toLower(e.name) CONTAINS 'english springer spaniel'
           OR e.uht_code = 'C7880008'
        OPTIONAL MATCH (e)-[r:HAS_TRAIT]->(t:Trait {bit: 3})
        RETURN e.name as name, e.uht_code as code, e.uuid as uuid,
               r.applicable as bit3_on, r.justification as justification
        LIMIT 5
    """)

    print("Search results for 'English Springer Spaniel' or code 'C7880008':")
    records = list(result)
    if not records:
        print("  NOT FOUND")
    else:
        for record in records:
            print(f"\n  Name: {record['name']}")
            print(f"  UUID: {record['uuid']}")
            print(f"  UHT Code: {record['code']}")
            print(f"  Bit 3 (Biological): {'ON' if record['bit3_on'] else 'OFF'}")
            if record['justification']:
                print(f"  Justification: {record['justification']}")

driver.close()
