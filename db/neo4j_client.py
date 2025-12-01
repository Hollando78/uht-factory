from neo4j import AsyncGraphDatabase, AsyncDriver
from typing import List, Dict, Any, Optional
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class Neo4jClient:
    """Neo4j database client for UHT Classification Factory"""
    
    def __init__(self, uri: str, user: str, password: str):
        self.uri = uri
        self.user = user
        self.password = password
        self.driver: Optional[AsyncDriver] = None
    
    async def connect(self):
        """Initialize database connection"""
        try:
            self.driver = AsyncGraphDatabase.driver(
                self.uri, 
                auth=(self.user, self.password)
            )
            await self.verify_connection()
            await self.create_constraints()
            logger.info("Neo4j connection established")
        except Exception as e:
            logger.error(f"Failed to connect to Neo4j: {e}")
            raise
    
    async def close(self):
        """Close database connection"""
        if self.driver:
            await self.driver.close()
    
    async def verify_connection(self) -> bool:
        """Verify database connection"""
        async with self.driver.session() as session:
            result = await session.run("RETURN 1 as test")
            record = await result.single()
            return record["test"] == 1
    
    async def create_constraints(self):
        """Create database constraints and indexes"""
        constraints = [
            "CREATE CONSTRAINT entity_uuid IF NOT EXISTS FOR (e:Entity) REQUIRE e.uuid IS UNIQUE",
            "CREATE CONSTRAINT trait_bit IF NOT EXISTS FOR (t:Trait) REQUIRE t.bit IS UNIQUE",
            "CREATE INDEX entity_name IF NOT EXISTS FOR (e:Entity) ON (e.name)",
            "CREATE INDEX entity_uht IF NOT EXISTS FOR (e:Entity) ON (e.uht_code)",
            "CREATE INDEX classification_date IF NOT EXISTS FOR (c:Classification) ON (c.created_at)"
        ]
        
        async with self.driver.session() as session:
            for constraint in constraints:
                try:
                    await session.run(constraint)
                except Exception as e:
                    logger.debug(f"Constraint already exists or error: {e}")
    
    async def create_trait(self, trait_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create or update a trait node"""
        query = """
        MERGE (t:Trait {bit: $bit})
        SET t.name = $name,
            t.layer = $layer,
            t.short_description = $short_description,
            t.expanded_definition = $expanded_definition,
            t.url = $url,
            t.updated_at = datetime()
        RETURN t
        """
        
        async with self.driver.session() as session:
            result = await session.run(query, **trait_data)
            record = await result.single()
            return dict(record["t"]) if record else None
    
    async def create_entity(self, entity_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create an entity with its classification"""
        query = """
        CREATE (e:Entity {
            uuid: $uuid,
            name: $name,
            description: $description,
            uht_code: $uht_code,
            binary_representation: $binary_representation,
            created_at: datetime(),
            version: 1
        })
        
        WITH e
        UNWIND $trait_evaluations as eval
        MATCH (t:Trait {bit: eval.trait_bit})
        CREATE (e)-[r:HAS_TRAIT {
            applicable: eval.applicable,
            confidence: eval.confidence,
            justification: eval.justification,
            evaluated_at: datetime()
        }]->(t)
        
        RETURN e
        """
        
        async with self.driver.session() as session:
            result = await session.run(query, **entity_data)
            record = await result.single()
            return dict(record["e"]) if record else None
    
    async def find_entity_by_uuid(self, uuid: str) -> Optional[Dict[str, Any]]:
        """Find entity by UUID"""
        query = """
        MATCH (e:Entity {uuid: $uuid})
        OPTIONAL MATCH (e)-[r:HAS_TRAIT]->(t:Trait)
        RETURN e, collect({
            trait: t,
            relationship: r
        }) as traits
        """
        
        async with self.driver.session() as session:
            result = await session.run(query, uuid=uuid)
            record = await result.single()
            if record:
                entity = dict(record["e"])
                entity["traits"] = [
                    {
                        **dict(t["trait"]),
                        "evaluation": dict(t["relationship"])
                    }
                    for t in record["traits"] if t["trait"]
                ]
                return entity
            return None
    
    async def search_entities_by_uht(self, pattern: str) -> List[Dict[str, Any]]:
        """Search entities by UHT code pattern"""
        query = """
        MATCH (e:Entity)
        WHERE e.uht_code CONTAINS $pattern
        RETURN e
        ORDER BY e.created_at DESC
        LIMIT 100
        """
        
        async with self.driver.session() as session:
            result = await session.run(query, pattern=pattern)
            entities = []
            async for record in result:
                entities.append(dict(record["e"]))
            return entities
    
    async def find_similar_entities(self, uht_code: str, threshold: int = 28) -> List[Dict[str, Any]]:
        """Find entities with similar UHT codes (Hamming distance)"""
        query = """
        MATCH (e:Entity)
        WITH e, 
             reduce(s = 0, i IN range(0, 31) | 
                 s + CASE 
                     WHEN substring(e.binary_representation, i, 1) = substring($binary, i, 1) 
                     THEN 1 
                     ELSE 0 
                 END
             ) as similarity
        WHERE similarity >= $threshold AND e.uht_code <> $uht_code
        RETURN e, similarity
        ORDER BY similarity DESC
        LIMIT 20
        """
        
        # Convert UHT to binary
        binary = bin(int(uht_code, 16))[2:].zfill(32)
        
        async with self.driver.session() as session:
            result = await session.run(
                query, 
                binary=binary, 
                uht_code=uht_code, 
                threshold=threshold
            )
            entities = []
            async for record in result:
                entity = dict(record["e"])
                entity["similarity_score"] = record["similarity"]
                entities.append(entity)
            return entities
    
    async def get_trait_statistics(self) -> Dict[str, Any]:
        """Get statistics about trait usage"""
        query = """
        MATCH (t:Trait)
        OPTIONAL MATCH (e:Entity)-[r:HAS_TRAIT {applicable: true}]->(t)
        WITH t, count(e) as entity_count
        RETURN t.bit as bit, 
               t.name as name, 
               t.layer as layer,
               entity_count
        ORDER BY t.bit
        """
        
        async with self.driver.session() as session:
            result = await session.run(query)
            stats = []
            async for record in result:
                stats.append({
                    "bit": record["bit"],
                    "name": record["name"],
                    "layer": record["layer"],
                    "entity_count": record["entity_count"]
                })
            return {"trait_statistics": stats}
    
    async def execute_query(self, query: str, **params) -> List[Dict[str, Any]]:
        """Execute a custom query and return results"""
        async with self.driver.session() as session:
            result = await session.run(query, **params)
            records = []
            async for record in result:
                # Convert record to dictionary
                record_dict = dict(record)
                records.append(record_dict)
            return records