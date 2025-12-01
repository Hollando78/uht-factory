#!/usr/bin/env python3
"""
Script to import canonical traits into Neo4j database
"""
import asyncio
import json
import os
import sys
from pathlib import Path

# Add project root to path
sys.path.append(str(Path(__file__).parent.parent))

from db.neo4j_client import Neo4jClient
from dotenv import load_dotenv

async def import_traits():
    """Import traits from JSON file into Neo4j"""
    
    # Load environment
    load_dotenv()
    
    # Initialize Neo4j client
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )
    
    try:
        await neo4j.connect()
        print("✅ Connected to Neo4j")
        
        # Load traits from file
        traits_path = "/root/project/uht-github/canonical_traits/traits_v2.json"
        with open(traits_path, "r") as f:
            traits_data = json.load(f)
        
        print(f"📊 Found {len(traits_data['traits'])} traits to import")
        
        # Import each trait
        for trait in traits_data["traits"]:
            try:
                result = await neo4j.create_trait(trait)
                print(f"✅ Imported trait {trait['bit']}: {trait['name']}")
            except Exception as e:
                print(f"❌ Failed to import trait {trait['bit']}: {e}")
        
        # Create layer nodes and relationships
        await create_layers(neo4j, traits_data["traits"])
        
        print("🎉 Trait import completed!")
        
        # Show summary
        stats = await neo4j.get_trait_statistics()
        print(f"📈 Total traits in database: {len(stats['trait_statistics'])}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    
    finally:
        await neo4j.close()
    
    return True

async def create_layers(neo4j: Neo4jClient, traits: list):
    """Create layer nodes and relationships"""
    
    layers = ["Physical", "Functional", "Abstract", "Social"]
    
    for i, layer_name in enumerate(layers):
        # Create layer node
        layer_query = """
        MERGE (l:Layer {name: $name})
        SET l.index = $index,
            l.bit_range_start = $start,
            l.bit_range_end = $end
        RETURN l
        """
        
        async with neo4j.driver.session() as session:
            await session.run(
                layer_query,
                name=layer_name,
                index=i,
                start=i * 8 + 1,
                end=(i + 1) * 8
            )
        
        # Connect traits to layer
        connect_query = """
        MATCH (l:Layer {name: $layer_name})
        MATCH (t:Trait {layer: $layer_name})
        MERGE (t)-[:BELONGS_TO]->(l)
        """
        
        async with neo4j.driver.session() as session:
            await session.run(connect_query, layer_name=layer_name)
        
        print(f"✅ Created layer: {layer_name}")

if __name__ == "__main__":
    success = asyncio.run(import_traits())
    sys.exit(0 if success else 1)