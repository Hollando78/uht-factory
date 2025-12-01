import asyncio
from typing import Dict, Any, List
import logging
import time
import json
from datetime import datetime

from workers.llm_client import LLMFactory
from models.classification import UHTCode
from db.neo4j_client import Neo4jClient
from db.redis_client import RedisClient

logger = logging.getLogger(__name__)

class ClassificationEngine:
    """Engine for classifying entities using parallel LLM trait evaluation"""
    
    def __init__(
        self,
        llm_provider: str,
        traits: List[Dict[str, Any]],
        neo4j_client: Neo4jClient,
        redis_client: RedisClient
    ):
        self.llm_client = LLMFactory.create_client(llm_provider)
        self.traits = traits
        self.neo4j = neo4j_client
        self.redis = redis_client
        self.max_parallel = 32  # Evaluate all traits at once
    
    async def classify_entity(
        self, 
        entity: Dict[str, Any],
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """Classify an entity by evaluating all 32 traits"""
        
        start_time = time.time()
        
        # Check cache first
        if use_cache:
            cached = await self.redis.get_cached_classification(entity["name"])
            if cached:
                logger.info(f"Cache hit for entity: {entity['name']}")
                return {
                    **cached,
                    "cached": True,
                    "processing_time_ms": 0
                }
        
        # Evaluate traits in parallel batches
        evaluations = await self._evaluate_traits_parallel(entity)
        
        # Build UHT code from evaluations
        uht_code = self._build_uht_code(evaluations)
        
        # Extract model used from evaluations (all should use same model)
        model_used = None
        if evaluations and len(evaluations) > 0:
            model_used = evaluations[0].get("model_used", "unknown")

        # Create classification result
        classification = {
            "uuid": entity.get("uuid"),
            "name": entity["name"],
            "description": entity.get("description"),
            "uht_code": uht_code.hex_code,
            "binary_representation": uht_code.binary,
            "layer_classifications": [
                {"layer_name": k, "hex_value": v} for k, v in uht_code.layers.items()
            ],
            "layers": uht_code.layers,
            "trait_evaluations": evaluations,
            "model_used": model_used,
            "llm_model_version": model_used,
            "created_at": datetime.utcnow().isoformat(),
            "processing_time_ms": (time.time() - start_time) * 1000
        }
        
        # Cache the result
        await self.redis.cache_classification(entity["name"], classification)
        
        # Store in Neo4j
        await self._store_classification(classification)
        
        return {
            **classification,
            "cached": False
        }
    
    async def _evaluate_traits_parallel(
        self, 
        entity: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Evaluate all traits in parallel batches"""
        
        evaluations = []
        
        # Process traits in batches to avoid overwhelming the LLM
        for i in range(0, len(self.traits), self.max_parallel):
            batch = self.traits[i:i + self.max_parallel]
            
            # Create evaluation tasks for this batch
            tasks = [
                self.llm_client.evaluate_trait(entity, trait)
                for trait in batch
            ]
            
            # Execute batch in parallel
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Process results
            for result in batch_results:
                if isinstance(result, Exception):
                    logger.error(f"Trait evaluation failed: {result}")
                    # Create default failed evaluation
                    evaluations.append({
                        "trait_bit": batch[0]["bit"],
                        "trait_name": batch[0]["name"],
                        "applicable": False,
                        "confidence": 0.0,
                        "justification": f"Evaluation failed: {str(result)}",
                        "evaluated_at": datetime.utcnow().isoformat()
                    })
                else:
                    evaluations.append(result)
            
            # Small delay between batches to avoid rate limiting
            if i + self.max_parallel < len(self.traits):
                await asyncio.sleep(0.5)
        
        # Sort evaluations by trait bit
        evaluations.sort(key=lambda x: x["trait_bit"])
        
        return evaluations
    
    def _build_uht_code(self, evaluations: List[Dict[str, Any]]) -> UHTCode:
        """Build UHT code from trait evaluations"""
        
        # Create 32-bit binary string
        binary_str = ""
        for i in range(1, 33):
            # Find evaluation for this bit position
            eval_found = False
            for eval in evaluations:
                if eval["trait_bit"] == i:
                    binary_str += "1" if eval["applicable"] else "0"
                    eval_found = True
                    break
            
            # If no evaluation found, default to 0
            if not eval_found:
                binary_str += "0"
        
        return UHTCode.from_binary(binary_str)
    
    async def _store_classification(self, classification: Dict[str, Any]):
        """Store classification in Neo4j"""
        try:
            await self.neo4j.create_entity(classification)
            logger.info(f"Stored classification for: {classification['name']}")
        except Exception as e:
            logger.error(f"Failed to store classification: {e}")
    
    async def classify_batch(
        self,
        entities: List[Dict[str, Any]],
        parallel_workers: int = 4
    ) -> List[Dict[str, Any]]:
        """Classify multiple entities in parallel"""
        
        # Create classification tasks
        tasks = []
        for entity in entities:
            task = self.classify_entity(entity)
            tasks.append(task)
        
        # Process in parallel with limited concurrency
        results = []
        for i in range(0, len(tasks), parallel_workers):
            batch = tasks[i:i + parallel_workers]
            batch_results = await asyncio.gather(*batch, return_exceptions=True)
            
            for result in batch_results:
                if isinstance(result, Exception):
                    logger.error(f"Batch classification failed: {result}")
                    results.append({"error": str(result)})
                else:
                    results.append(result)
        
        return results

class ClassificationOrchestrator:
    """Orchestrates the classification process"""
    
    def __init__(
        self,
        traits_data: Dict[str, Any],
        neo4j_client: Neo4jClient,
        redis_client: RedisClient,
        llm_provider: str = "openai"
    ):
        self.traits = traits_data.get("traits", [])
        self.engine = ClassificationEngine(
            llm_provider=llm_provider,
            traits=self.traits,
            neo4j_client=neo4j_client,
            redis_client=redis_client
        )
    
    async def process_entity(
        self,
        entity_input: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Process a single entity classification request"""
        
        # Generate UUID if not provided
        if "uuid" not in entity_input:
            import uuid
            entity_input["uuid"] = str(uuid.uuid4())
        
        # Classify the entity
        result = await self.engine.classify_entity(entity_input)
        
        return result
    
    async def process_batch(
        self,
        entities: List[Dict[str, Any]],
        parallel_workers: int = 4
    ) -> List[Dict[str, Any]]:
        """Process multiple entities"""
        
        # Add UUIDs to entities
        import uuid
        for entity in entities:
            if "uuid" not in entity:
                entity["uuid"] = str(uuid.uuid4())
        
        # Process batch
        results = await self.engine.classify_batch(entities, parallel_workers)
        
        return results