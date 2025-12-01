from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import Dict, Any, List
import json
import os

from models.entity import (
    EntityInput, 
    ClassificationRequest, 
    ClassificationResponse,
    BatchClassificationRequest
)
from workers.classifier import ClassificationOrchestrator
from db.neo4j_client import Neo4jClient
from db.redis_client import RedisClient

router = APIRouter()

# Load traits from file
def load_traits():
    traits_path = "/root/project/uht-github/canonical_traits/traits_v2.json"
    with open(traits_path, "r") as f:
        return json.load(f)

# Dependency to get orchestrator
async def get_orchestrator():
    traits_data = load_traits()
    
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )
    await neo4j.connect()
    
    redis = RedisClient(url=os.getenv("REDIS_URL"))
    await redis.connect()
    
    orchestrator = ClassificationOrchestrator(
        traits_data=traits_data,
        neo4j_client=neo4j,
        redis_client=redis,
        llm_provider=os.getenv("LLM_PROVIDER", "openai")
    )
    
    return orchestrator

@router.post("/", response_model=ClassificationResponse)
async def classify_entity(
    request: ClassificationRequest,
    orchestrator: ClassificationOrchestrator = Depends(get_orchestrator)
):
    """
    Classify a single entity using the 32 UHT traits.
    
    The classification process:
    1. Checks cache for existing classification
    2. If not cached, evaluates all 32 traits in parallel
    3. Generates 8-character hex UHT code
    4. Stores result in Neo4j and cache
    """
    try:
        # Convert entity input to dict
        entity_dict = request.entity.dict()
        entity_dict["use_cache"] = request.use_cache
        
        # Process classification
        result = await orchestrator.process_entity(entity_dict)
        
        # Create response
        return ClassificationResponse(
            entity=result,
            cached=result.get("cached", False),
            processing_time_ms=result.get("processing_time_ms", 0),
            llm_model=result.get("model_used")
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/batch")
async def classify_batch(
    request: BatchClassificationRequest,
    orchestrator: ClassificationOrchestrator = Depends(get_orchestrator)
):
    """
    Classify multiple entities in a single request.
    
    Processes up to 100 entities in parallel batches.
    """
    try:
        # Convert entities to dicts
        entities = [entity.dict() for entity in request.entities]
        
        # Process batch
        results = await orchestrator.process_batch(
            entities=entities,
            parallel_workers=request.parallel_workers
        )
        
        return {
            "total": len(results),
            "successful": len([r for r in results if "error" not in r]),
            "failed": len([r for r in results if "error" in r]),
            "results": results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/async")
async def classify_async(
    request: ClassificationRequest,
    background_tasks: BackgroundTasks,
    orchestrator: ClassificationOrchestrator = Depends(get_orchestrator)
):
    """
    Submit entity for asynchronous classification.
    
    Returns a job ID for tracking the classification progress.
    """
    import uuid
    job_id = str(uuid.uuid4())
    
    # Add to background tasks
    background_tasks.add_task(
        orchestrator.process_entity,
        request.entity.dict()
    )
    
    return {
        "job_id": job_id,
        "status": "queued",
        "message": "Classification job submitted"
    }

@router.get("/job/{job_id}")
async def get_job_status(job_id: str):
    """Get the status of an async classification job"""
    # This would query the job tracking system
    # For now, return a placeholder
    return {
        "job_id": job_id,
        "status": "in_progress",
        "message": "Job tracking not yet implemented"
    }

@router.post("/explain")
async def explain_classification(
    entity_name: str,
    uht_code: str
):
    """
    Explain a UHT classification code.
    
    Breaks down the hex code into its component traits and layers.
    """
    from models.classification import UHTCode
    
    try:
        # Parse UHT code
        uht = UHTCode.from_hex(uht_code)
        
        # Load trait definitions
        traits_data = load_traits()
        traits_dict = {t["bit"]: t for t in traits_data["traits"]}
        
        # Build explanation
        explanation = {
            "entity": entity_name,
            "uht_code": uht_code,
            "binary": uht.binary,
            "layers": uht.layers,
            "active_traits": [],
            "inactive_traits": []
        }
        
        for bit in range(1, 33):
            trait = traits_dict.get(bit)
            if trait:
                trait_info = {
                    "bit": bit,
                    "name": trait["name"],
                    "layer": trait["layer"],
                    "description": trait["short_description"]
                }
                
                if bit in uht.trait_bits:
                    explanation["active_traits"].append(trait_info)
                else:
                    explanation["inactive_traits"].append(trait_info)
        
        return explanation
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))