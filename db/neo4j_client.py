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
            "CREATE INDEX entity_wikidata_qid IF NOT EXISTS FOR (e:Entity) ON (e.wikidata_qid)",
            "CREATE INDEX entity_wikidata_type IF NOT EXISTS FOR (e:Entity) ON (e.wikidata_type)",
            "CREATE INDEX classification_date IF NOT EXISTS FOR (c:Classification) ON (c.created_at)"
        ]

        async with self.driver.session() as session:
            for constraint in constraints:
                try:
                    await session.run(constraint)
                except Exception as e:
                    logger.debug(f"Constraint already exists or error: {e}")

        # Create vector index for embeddings (Neo4j 5.18+)
        await self._create_vector_index()

    async def _create_vector_index(self):
        """Create vector index for entity embeddings if not exists"""
        try:
            async with self.driver.session() as session:
                # Check if index already exists
                result = await session.run("SHOW INDEXES WHERE name = 'entity_embedding'")
                records = [record async for record in result]

                if not records:
                    # Create vector index (Neo4j 5.18+)
                    await session.run("""
                        CREATE VECTOR INDEX entity_embedding IF NOT EXISTS
                        FOR (e:Entity) ON (e.embedding)
                        OPTIONS {
                            indexConfig: {
                                `vector.dimensions`: 1536,
                                `vector.similarity_function`: 'cosine'
                            }
                        }
                    """)
                    logger.info("Created vector index 'entity_embedding' for semantic search")
                else:
                    logger.debug("Vector index 'entity_embedding' already exists")
        except Exception as e:
            logger.warning(f"Could not create vector index (requires Neo4j 5.18+): {e}")
    
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
        """Create or update an entity with its classification (MERGE for reclassification support)"""

        # First, delete existing trait relationships if entity exists (for clean reclassification)
        delete_query = """
        MATCH (e:Entity {uuid: $uuid})-[r:HAS_TRAIT]->()
        DELETE r
        """

        # Use MERGE to create or update the entity
        query = """
        MERGE (e:Entity {uuid: $uuid})
        ON CREATE SET
            e.name = $name,
            e.description = $description,
            e.uht_code = $uht_code,
            e.binary_representation = $binary_representation,
            e.wikidata_qid = $wikidata_qid,
            e.wikidata_type = $wikidata_type,
            e.wikidata_type_label = $wikidata_type_label,
            e.sitelinks_count = $sitelinks_count,
            e.created_at = datetime(),
            e.version = 1
        ON MATCH SET
            e.name = $name,
            e.description = $description,
            e.uht_code = $uht_code,
            e.binary_representation = $binary_representation,
            e.wikidata_qid = COALESCE($wikidata_qid, e.wikidata_qid),
            e.wikidata_type = COALESCE($wikidata_type, e.wikidata_type),
            e.wikidata_type_label = COALESCE($wikidata_type_label, e.wikidata_type_label),
            e.sitelinks_count = COALESCE($sitelinks_count, e.sitelinks_count),
            e.updated_at = datetime(),
            e.version = COALESCE(e.version, 0) + 1

        WITH e
        UNWIND $trait_evaluations as eval
        MATCH (t:Trait {bit: eval.trait_bit})
        CREATE (e)-[r:HAS_TRAIT {
            applicable: eval.applicable,
            confidence: eval.confidence,
            justification: eval.justification,
            model_used: eval.model_used,
            evaluated_at: datetime()
        }]->(t)

        RETURN DISTINCT e
        """

        # Ensure wikidata fields have defaults
        entity_data.setdefault("wikidata_qid", None)
        entity_data.setdefault("wikidata_type", None)
        entity_data.setdefault("wikidata_type_label", None)
        entity_data.setdefault("sitelinks_count", None)

        async with self.driver.session() as session:
            # Delete old trait relationships first (if entity exists)
            await session.run(delete_query, uuid=entity_data["uuid"])
            # Then create/update entity with new traits
            result = await session.run(query, **entity_data)
            # Consume all records and get the first one (DISTINCT should return only one)
            records = [record async for record in result]
            if records:
                return dict(records[0]["e"])
            return None
    
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

    # ===== TRAIT ANALYTICS METHODS =====

    async def get_trait_frequency_detailed(self) -> Dict[str, Any]:
        """Get detailed trait frequency with confidence breakdown"""
        query = """
        MATCH (total:Entity)
        WITH count(total) as total_entities
        MATCH (t:Trait)
        OPTIONAL MATCH (e:Entity)-[r:HAS_TRAIT]->(t)
        WHERE r.applicable = true
        WITH t, total_entities,
             count(e) as entity_count,
             avg(r.confidence) as avg_confidence,
             sum(CASE WHEN r.confidence >= 0.8 THEN 1 ELSE 0 END) as high_confidence,
             sum(CASE WHEN r.confidence >= 0.5 AND r.confidence < 0.8 THEN 1 ELSE 0 END) as medium_confidence,
             sum(CASE WHEN r.confidence < 0.5 THEN 1 ELSE 0 END) as low_confidence
        RETURN t.bit as bit,
               t.name as name,
               t.layer as layer,
               entity_count,
               total_entities,
               round(100.0 * entity_count / total_entities, 2) as percentage,
               round(avg_confidence, 3) as avg_confidence,
               high_confidence,
               medium_confidence,
               low_confidence
        ORDER BY t.bit
        """

        async with self.driver.session() as session:
            result = await session.run(query)
            traits = []
            total_entities = 0
            async for record in result:
                total_entities = record["total_entities"]
                traits.append({
                    "bit": record["bit"],
                    "name": record["name"],
                    "layer": record["layer"],
                    "count": record["entity_count"],
                    "percentage": record["percentage"],
                    "avg_confidence": record["avg_confidence"],
                    "high_confidence_count": record["high_confidence"],
                    "medium_confidence_count": record["medium_confidence"],
                    "low_confidence_count": record["low_confidence"]
                })
            return {"total_entities": total_entities, "traits": traits}

    async def get_trait_cooccurrence_matrix(self) -> Dict[str, Any]:
        """Get pairwise co-occurrence counts for all trait pairs"""
        query = """
        MATCH (e:Entity)-[:HAS_TRAIT {applicable: true}]->(t1:Trait)
        MATCH (e)-[:HAS_TRAIT {applicable: true}]->(t2:Trait)
        WHERE t1.bit < t2.bit
        WITH t1.bit as trait1, t1.name as name1, t1.layer as layer1,
             t2.bit as trait2, t2.name as name2, t2.layer as layer2,
             count(e) as cooccurrence
        RETURN trait1, name1, layer1, trait2, name2, layer2, cooccurrence
        ORDER BY cooccurrence DESC
        """

        async with self.driver.session() as session:
            result = await session.run(query)
            matrix = []
            async for record in result:
                matrix.append({
                    "trait1": record["trait1"],
                    "name1": record["name1"],
                    "layer1": record["layer1"],
                    "trait2": record["trait2"],
                    "name2": record["name2"],
                    "layer2": record["layer2"],
                    "cooccurrence": record["cooccurrence"]
                })

            # Identify strongest pairs (top 20)
            strongest = matrix[:20] if len(matrix) > 20 else matrix

            return {
                "matrix": matrix,
                "strongest_pairs": strongest,
                "total_pairs": len(matrix)
            }

    async def get_trait_mutual_exclusivity(self) -> Dict[str, Any]:
        """Find trait pairs that rarely co-occur (potential mutual exclusivity)"""
        # First get individual trait counts
        query = """
        MATCH (t:Trait)
        OPTIONAL MATCH (e:Entity)-[:HAS_TRAIT {applicable: true}]->(t)
        WITH t.bit as bit, t.name as name, t.layer as layer, count(e) as count
        RETURN bit, name, layer, count
        ORDER BY bit
        """

        trait_counts = {}
        async with self.driver.session() as session:
            result = await session.run(query)
            async for record in result:
                trait_counts[record["bit"]] = {
                    "name": record["name"],
                    "layer": record["layer"],
                    "count": record["count"]
                }

        # Get co-occurrence for all pairs
        cooccurrence_query = """
        MATCH (e:Entity)-[:HAS_TRAIT {applicable: true}]->(t1:Trait)
        MATCH (e)-[:HAS_TRAIT {applicable: true}]->(t2:Trait)
        WHERE t1.bit < t2.bit
        RETURN t1.bit as trait1, t2.bit as trait2, count(e) as both_count
        """

        cooccurrences = {}
        async with self.driver.session() as session:
            result = await session.run(cooccurrence_query)
            async for record in result:
                key = (record["trait1"], record["trait2"])
                cooccurrences[key] = record["both_count"]

        # Calculate Jaccard index for each pair and find low ones
        exclusivity_pairs = []
        for t1 in range(1, 33):
            for t2 in range(t1 + 1, 33):
                if t1 not in trait_counts or t2 not in trait_counts:
                    continue

                count1 = trait_counts[t1]["count"]
                count2 = trait_counts[t2]["count"]
                both = cooccurrences.get((t1, t2), 0)

                # Skip if either trait has 0 occurrences
                if count1 == 0 or count2 == 0:
                    continue

                # Jaccard index: intersection / union
                union = count1 + count2 - both
                jaccard = both / union if union > 0 else 0

                # Expected co-occurrence if independent
                # P(A and B) = P(A) * P(B) if independent
                # But we only have counts, not total - use min as proxy
                min_possible = min(count1, count2)
                exclusivity_ratio = 1 - (both / min_possible) if min_possible > 0 else 0

                exclusivity_pairs.append({
                    "trait1": t1,
                    "name1": trait_counts[t1]["name"],
                    "layer1": trait_counts[t1]["layer"],
                    "trait2": t2,
                    "name2": trait_counts[t2]["name"],
                    "layer2": trait_counts[t2]["layer"],
                    "count1": count1,
                    "count2": count2,
                    "both_count": both,
                    "jaccard": round(jaccard, 4),
                    "exclusivity_ratio": round(exclusivity_ratio, 4)
                })

        # Sort by jaccard (lowest = most exclusive)
        exclusivity_pairs.sort(key=lambda x: x["jaccard"])

        return {
            "pairs": exclusivity_pairs,
            "most_exclusive": exclusivity_pairs[:30],
            "least_exclusive": exclusivity_pairs[-30:] if len(exclusivity_pairs) >= 30 else []
        }

    async def get_layer_statistics(self) -> Dict[str, Any]:
        """Get aggregate statistics by layer"""
        query = """
        MATCH (t:Trait)
        OPTIONAL MATCH (e:Entity)-[r:HAS_TRAIT {applicable: true}]->(t)
        WITH t.layer as layer, t.bit as bit, count(e) as trait_usage
        WITH layer, collect({bit: bit, usage: trait_usage}) as traits, sum(trait_usage) as total_usage
        RETURN layer,
               size(traits) as trait_count,
               total_usage,
               traits
        ORDER BY layer
        """

        async with self.driver.session() as session:
            result = await session.run(query)
            layers = {}
            async for record in result:
                layer_name = record["layer"]
                traits = record["traits"]
                usages = [t["usage"] for t in traits]

                layers[layer_name] = {
                    "trait_count": record["trait_count"],
                    "total_usage": record["total_usage"],
                    "avg_usage_per_trait": round(record["total_usage"] / record["trait_count"], 2) if record["trait_count"] > 0 else 0,
                    "max_trait_usage": max(usages) if usages else 0,
                    "min_trait_usage": min(usages) if usages else 0,
                    "traits": traits
                }

        # Get average traits per entity by layer
        entity_layer_query = """
        MATCH (e:Entity)
        WHERE e.uht_code IS NOT NULL AND size(e.uht_code) = 8
        WITH e,
             toInteger('0x' + substring(e.uht_code, 0, 2)) as physical_hex,
             toInteger('0x' + substring(e.uht_code, 2, 2)) as functional_hex,
             toInteger('0x' + substring(e.uht_code, 4, 2)) as abstract_hex,
             toInteger('0x' + substring(e.uht_code, 6, 2)) as social_hex
        RETURN count(e) as entity_count,
               avg(size([x IN range(0,7) WHERE (physical_hex / toInteger(2^x)) % 2 = 1])) as avg_physical,
               avg(size([x IN range(0,7) WHERE (functional_hex / toInteger(2^x)) % 2 = 1])) as avg_functional,
               avg(size([x IN range(0,7) WHERE (abstract_hex / toInteger(2^x)) % 2 = 1])) as avg_abstract,
               avg(size([x IN range(0,7) WHERE (social_hex / toInteger(2^x)) % 2 = 1])) as avg_social
        """

        # This query is complex; let's simplify by counting from binary
        simple_query = """
        MATCH (e:Entity)
        WHERE e.binary_representation IS NOT NULL
        WITH e,
             size([i IN range(0, 7) WHERE substring(e.binary_representation, i, 1) = '1']) as physical_count,
             size([i IN range(8, 15) WHERE substring(e.binary_representation, i, 1) = '1']) as functional_count,
             size([i IN range(16, 23) WHERE substring(e.binary_representation, i, 1) = '1']) as abstract_count,
             size([i IN range(24, 31) WHERE substring(e.binary_representation, i, 1) = '1']) as social_count
        RETURN count(e) as entity_count,
               round(avg(physical_count), 2) as avg_physical,
               round(avg(functional_count), 2) as avg_functional,
               round(avg(abstract_count), 2) as avg_abstract,
               round(avg(social_count), 2) as avg_social
        """

        async with self.driver.session() as session:
            result = await session.run(simple_query)
            record = await result.single()
            if record:
                layers["Physical"]["avg_traits_per_entity"] = record["avg_physical"]
                layers["Functional"]["avg_traits_per_entity"] = record["avg_functional"]
                layers["Abstract"]["avg_traits_per_entity"] = record["avg_abstract"]
                layers["Social"]["avg_traits_per_entity"] = record["avg_social"]

        return {"layers": layers, "entity_count": record["entity_count"] if record else 0}

    async def get_confidence_statistics(self) -> Dict[str, Any]:
        """Get per-trait confidence metrics"""
        query = """
        MATCH (e:Entity)-[r:HAS_TRAIT]->(t:Trait)
        WHERE r.applicable = true
        WITH t.bit as bit, t.name as name, t.layer as layer,
             collect(r.confidence) as confidences
        RETURN bit, name, layer,
               size(confidences) as entity_count,
               round(reduce(s = 0.0, c IN confidences | s + c) / size(confidences), 4) as avg_confidence,
               reduce(mn = 1.0, c IN confidences | CASE WHEN c < mn THEN c ELSE mn END) as min_confidence,
               reduce(mx = 0.0, c IN confidences | CASE WHEN c > mx THEN c ELSE mx END) as max_confidence
        ORDER BY bit
        """

        async with self.driver.session() as session:
            result = await session.run(query)
            traits = []
            async for record in result:
                traits.append({
                    "bit": record["bit"],
                    "name": record["name"],
                    "layer": record["layer"],
                    "entity_count": record["entity_count"],
                    "avg_confidence": record["avg_confidence"],
                    "min_confidence": record["min_confidence"],
                    "max_confidence": record["max_confidence"],
                    "confidence_range": round(record["max_confidence"] - record["min_confidence"], 4)
                })

            # Sort by avg confidence to find problematic traits
            sorted_by_confidence = sorted(traits, key=lambda x: x["avg_confidence"])

            return {
                "traits": traits,
                "lowest_confidence": sorted_by_confidence[:10],
                "highest_confidence": sorted_by_confidence[-10:]
            }

    async def get_full_analytics(self) -> Dict[str, Any]:
        """Get all analytics combined"""
        frequency = await self.get_trait_frequency_detailed()
        cooccurrence = await self.get_trait_cooccurrence_matrix()
        exclusivity = await self.get_trait_mutual_exclusivity()
        layers = await self.get_layer_statistics()
        confidence = await self.get_confidence_statistics()

        return {
            "frequency": frequency,
            "cooccurrence": cooccurrence,
            "exclusivity": exclusivity,
            "layers": layers,
            "confidence": confidence
        }

    async def get_hex_pair_frequency(self) -> Dict[str, Any]:
        """Get frequency of hex pairs per layer (byte position in UHT code)"""
        async with self.driver.session() as session:
            # UHT code format: PPFFAASS (8 hex chars = 4 bytes)
            # Physical: chars 0-1, Functional: 2-3, Abstract: 4-5, Social: 6-7
            query = """
            MATCH (e:Entity)
            WHERE e.uht_code IS NOT NULL AND size(e.uht_code) = 8
            WITH e,
                 toUpper(substring(e.uht_code, 0, 2)) as physical_hex,
                 toUpper(substring(e.uht_code, 2, 2)) as functional_hex,
                 toUpper(substring(e.uht_code, 4, 2)) as abstract_hex,
                 toUpper(substring(e.uht_code, 6, 2)) as social_hex
            RETURN
                physical_hex, count(*) as physical_count,
                functional_hex, count(*) as functional_count,
                abstract_hex, count(*) as abstract_count,
                social_hex, count(*) as social_count
            """

            # Run separate queries for each layer for cleaner results
            layers_data = {}

            for layer, start_pos in [("Physical", 0), ("Functional", 2), ("Abstract", 4), ("Social", 6)]:
                layer_query = f"""
                MATCH (e:Entity)
                WHERE e.uht_code IS NOT NULL AND size(e.uht_code) = 8
                WITH toUpper(substring(e.uht_code, {start_pos}, 2)) as hex_pair
                RETURN hex_pair, count(*) as count
                ORDER BY count DESC
                """
                result = await session.run(layer_query)
                records = await result.data()

                # Calculate totals and percentages
                total = sum(r["count"] for r in records)
                hex_pairs = []
                for r in records:
                    hex_pairs.append({
                        "hex": r["hex_pair"],
                        "count": r["count"],
                        "percentage": round(r["count"] / total * 100, 2) if total > 0 else 0
                    })

                layers_data[layer] = {
                    "total_entities": total,
                    "unique_pairs": len(hex_pairs),
                    "pairs": hex_pairs[:20],  # Top 20 most common
                    "all_pairs": hex_pairs  # Full list for detailed analysis
                }

            # Get total entity count
            count_result = await session.run("MATCH (e:Entity) RETURN count(e) as total")
            count_record = await count_result.single()
            total_entities = count_record["total"] if count_record else 0

            return {
                "total_entities": total_entities,
                "layers": layers_data
            }

    async def get_cross_domain_frequency(self, min_percent: float = 1.0) -> Dict[str, Any]:
        """Get frequency of complete UHT codes (all 8 hex chars) - cross-domain patterns"""
        async with self.driver.session() as session:
            query = """
            MATCH (e:Entity)
            WHERE e.uht_code IS NOT NULL AND size(e.uht_code) = 8
            WITH toUpper(e.uht_code) as uht_code
            RETURN uht_code, count(*) as count
            ORDER BY count DESC
            """
            result = await session.run(query)
            records = await result.data()

            # Calculate totals and percentages
            total = sum(r["count"] for r in records)
            cross_domain_patterns = []

            for r in records:
                percent = round(r["count"] / total * 100, 2) if total > 0 else 0
                if percent >= min_percent:
                    uht = r["uht_code"]
                    cross_domain_patterns.append({
                        "uht_code": uht,
                        "physical_hex": uht[0:2],
                        "functional_hex": uht[2:4],
                        "abstract_hex": uht[4:6],
                        "social_hex": uht[6:8],
                        "count": r["count"],
                        "percentage": percent
                    })

            return {
                "total_entities": total,
                "unique_patterns": len(records),
                "patterns_above_threshold": len(cross_domain_patterns),
                "threshold_percent": min_percent,
                "patterns": cross_domain_patterns[:50]  # Top 50
            }

    # ===== EMBEDDING METHODS =====

    async def store_entity_embedding(
        self,
        uuid: str,
        embedding: List[float],
        model_used: str
    ) -> Dict[str, Any]:
        """
        Store embedding vector on an entity node.

        Args:
            uuid: Entity UUID
            embedding: 1536-dimensional embedding vector
            model_used: Name of the embedding model

        Returns:
            Updated entity data
        """
        query = """
        MATCH (e:Entity {uuid: $uuid})
        SET e.embedding = $embedding,
            e.embedding_model = $model_used,
            e.embedding_created_at = datetime()
        RETURN e.uuid as uuid,
               e.name as name,
               e.embedding_model as embedding_model,
               e.embedding_created_at as embedding_created_at
        """

        async with self.driver.session() as session:
            result = await session.run(
                query,
                uuid=uuid,
                embedding=embedding,
                model_used=model_used
            )
            record = await result.single()
            if record:
                return dict(record)
            return None

    async def get_entity_embedding(self, uuid: str) -> Optional[Dict[str, Any]]:
        """
        Get embedding for an entity.

        Args:
            uuid: Entity UUID

        Returns:
            Dict with embedding vector and metadata, or None if not found
        """
        query = """
        MATCH (e:Entity {uuid: $uuid})
        WHERE e.embedding IS NOT NULL
        RETURN e.uuid as uuid,
               e.name as name,
               e.embedding as embedding,
               e.embedding_model as model_used,
               e.embedding_created_at as created_at
        """

        async with self.driver.session() as session:
            result = await session.run(query, uuid=uuid)
            record = await result.single()
            if record:
                return {
                    "entity_uuid": record["uuid"],
                    "name": record["name"],
                    "embedding": list(record["embedding"]) if record["embedding"] else None,
                    "dimension": len(record["embedding"]) if record["embedding"] else 0,
                    "model_used": record["model_used"],
                    "created_at": str(record["created_at"]) if record["created_at"] else None
                }
            return None

    async def find_similar_by_embedding(
        self,
        embedding: List[float],
        limit: int = 20,
        min_score: float = 0.7
    ) -> List[Dict[str, Any]]:
        """
        Find entities similar to the given embedding using vector index.

        Args:
            embedding: Query embedding vector (1536 dimensions)
            limit: Maximum number of results
            min_score: Minimum similarity score (0-1, cosine similarity)

        Returns:
            List of similar entities with similarity scores
        """
        query = """
        CALL db.index.vector.queryNodes('entity_embedding', $limit, $embedding)
        YIELD node, score
        WHERE score >= $min_score
        RETURN node.uuid as uuid,
               node.name as name,
               node.description as description,
               node.uht_code as uht_code,
               node.image_url as image_url,
               score as similarity_score
        ORDER BY score DESC
        """

        try:
            async with self.driver.session() as session:
                result = await session.run(
                    query,
                    embedding=embedding,
                    limit=limit,
                    min_score=min_score
                )
                entities = []
                async for record in result:
                    entities.append({
                        "uuid": record["uuid"],
                        "name": record["name"],
                        "description": record["description"],
                        "uht_code": record["uht_code"],
                        "image_url": record["image_url"],
                        "similarity_score": round(record["similarity_score"], 4)
                    })
                return entities
        except Exception as e:
            logger.error(f"Vector similarity search failed: {e}")
            return []

    async def get_all_embeddings(
        self,
        limit: int = 1000,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get all entities with embeddings.

        Args:
            limit: Maximum number of results
            offset: Offset for pagination

        Returns:
            List of entities with their embeddings
        """
        query = """
        MATCH (e:Entity)
        WHERE e.embedding IS NOT NULL
        RETURN e.uuid as uuid,
               e.name as name,
               e.embedding as embedding,
               e.embedding_model as model_used,
               e.embedding_created_at as created_at
        ORDER BY e.embedding_created_at DESC
        SKIP $offset
        LIMIT $limit
        """

        async with self.driver.session() as session:
            result = await session.run(query, limit=limit, offset=offset)
            embeddings = []
            async for record in result:
                embeddings.append({
                    "entity_uuid": record["uuid"],
                    "name": record["name"],
                    "embedding": list(record["embedding"]) if record["embedding"] else None,
                    "dimension": len(record["embedding"]) if record["embedding"] else 0,
                    "model_used": record["model_used"],
                    "created_at": str(record["created_at"]) if record["created_at"] else None
                })
            return embeddings

    async def get_entities_without_embeddings(
        self,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get entities that don't have embeddings yet.

        Used for batch migration of existing entities.

        Args:
            limit: Maximum number of results

        Returns:
            List of entities without embeddings
        """
        query = """
        MATCH (e:Entity)
        WHERE e.embedding IS NULL
        OPTIONAL MATCH (e)-[r:HAS_TRAIT]->(t:Trait)
        WITH e, collect({
            trait_name: t.name,
            applicable: r.applicable
        }) as traits
        RETURN e.uuid as uuid,
               e.name as name,
               e.description as description,
               e.uht_code as uht_code,
               e.binary_representation as binary_representation,
               traits
        LIMIT $limit
        """

        async with self.driver.session() as session:
            result = await session.run(query, limit=limit)
            entities = []
            async for record in result:
                # Build trait evaluations list
                trait_evaluations = []
                for trait in record["traits"]:
                    if trait.get("trait_name"):
                        trait_evaluations.append({
                            "trait_name": trait["trait_name"],
                            "applicable": trait.get("applicable", False)
                        })

                entities.append({
                    "uuid": record["uuid"],
                    "name": record["name"],
                    "description": record["description"],
                    "uht_code": record["uht_code"],
                    "binary_representation": record["binary_representation"],
                    "trait_evaluations": trait_evaluations
                })
            return entities

    async def count_entities_with_embeddings(self) -> Dict[str, int]:
        """Count entities with and without embeddings"""
        query = """
        MATCH (e:Entity)
        RETURN
            count(CASE WHEN e.embedding IS NOT NULL THEN 1 END) as with_embeddings,
            count(CASE WHEN e.embedding IS NULL THEN 1 END) as without_embeddings,
            count(e) as total
        """

        async with self.driver.session() as session:
            result = await session.run(query)
            record = await result.single()
            return {
                "with_embeddings": record["with_embeddings"],
                "without_embeddings": record["without_embeddings"],
                "total": record["total"]
            }