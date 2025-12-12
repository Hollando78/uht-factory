from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Request
from typing import Dict, Any, List
import os
import logging

from models.entity import (
    EntityInput,
    ClassificationRequest,
    ClassificationResponse,
    BatchClassificationRequest
)
from workers.classifier import ClassificationOrchestrator
from workers.image_client import ImageGenerationOrchestrator
from db.neo4j_client import Neo4jClient
from db.redis_client import RedisClient
from api.middleware.api_key_auth import require_classify, optional_api_key_or_public
from api.dependencies import get_neo4j_client, get_redis_client, get_traits

logger = logging.getLogger(__name__)

router = APIRouter()


# Dependency to get orchestrator using shared clients
async def get_orchestrator(request: Request):
    traits_data = get_traits(request)
    neo4j = await get_neo4j_client(request)
    redis = await get_redis_client(request)

    orchestrator = ClassificationOrchestrator(
        traits_data=traits_data,
        neo4j_client=neo4j,
        redis_client=redis,
        llm_provider=os.getenv("LLM_PROVIDER", "openai")
    )

    return orchestrator


# Background task to generate image and update entity
async def generate_image_background(entity_result: dict, neo4j: Neo4jClient):
    """Generate image in background and update entity in Neo4j."""
    try:
        logger.info(f"[Background] Generating image for: {entity_result.get('name')}")
        image_orchestrator = ImageGenerationOrchestrator()
        image_result = await image_orchestrator.generate_entity_image(entity_result)

        if image_result.get("success") and image_result.get("image_url"):
            await neo4j.execute_query(
                "MATCH (e:Entity {uuid: $uuid}) SET e.image_url = $image_url",
                uuid=entity_result["uuid"],
                image_url=image_result["image_url"]
            )
            logger.info(f"[Background] Image saved: {image_result['image_url']}")
        else:
            logger.warning(f"[Background] Image generation failed: {image_result.get('error')}")
    except Exception as e:
        logger.error(f"[Background] Image generation error: {e}")


# Background task to generate embedding and update entity
async def generate_embedding_background(entity_result: dict, neo4j: Neo4jClient):
    """Generate embedding in background and store in Neo4j."""
    try:
        logger.info(f"[Background] Generating embedding for: {entity_result.get('name')}")
        from workers.embedding_client import EmbeddingOrchestrator
        embedding_orchestrator = EmbeddingOrchestrator()
        embedding_result = await embedding_orchestrator.generate_entity_embedding(entity_result)

        if embedding_result.get("success") and embedding_result.get("embedding"):
            await neo4j.store_entity_embedding(
                uuid=entity_result["uuid"],
                embedding=embedding_result["embedding"],
                model_used=embedding_result["model_used"]
            )
            logger.info(f"[Background] Embedding saved: {embedding_result['dimension']} dims")
        else:
            logger.warning(f"[Background] Embedding generation failed: {embedding_result.get('error')}")
    except Exception as e:
        logger.error(f"[Background] Embedding generation error: {e}")

@router.post("/", response_model=ClassificationResponse)
async def classify_entity(
    request: ClassificationRequest,
    background_tasks: BackgroundTasks,
    fastapi_request: Request,
    orchestrator: ClassificationOrchestrator = Depends(get_orchestrator),
    auth_data: dict = Depends(optional_api_key_or_public)  # Allow public access with rate limiting
):
    """
    Classify a single entity using the 32 UHT traits.

    **Public access allowed** - rate limited to 100 classifications/hour per IP.
    API key users get higher rate limits based on their key configuration.

    The classification process:
    1. Checks cache for existing classification
    2. If not cached, evaluates all 32 traits in parallel
    3. Generates 8-character hex UHT code
    4. Stores result in Neo4j and cache
    5. Optionally queues AI image/embedding generation in background
    """
    try:
        # Convert entity input to dict
        entity_dict = request.entity.dict()
        entity_dict["use_cache"] = request.use_cache

        # Process classification
        result = await orchestrator.process_entity(entity_dict)

        # Get shared Neo4j client
        neo4j = await get_neo4j_client(fastapi_request)

        # Generate image synchronously (user is waiting to see it)
        if request.generate_image and result.get("uuid"):
            try:
                logger.info(f"Generating image for entity: {result.get('name')}")
                image_orchestrator = ImageGenerationOrchestrator()
                image_result = await image_orchestrator.generate_entity_image(result)

                if image_result.get("success") and image_result.get("image_url"):
                    result["image_url"] = image_result["image_url"]
                    await neo4j.execute_query(
                        "MATCH (e:Entity {uuid: $uuid}) SET e.image_url = $image_url",
                        uuid=result["uuid"],
                        image_url=result["image_url"]
                    )
                    logger.info(f"Image generated: {image_result['image_url']}")
            except Exception as img_err:
                logger.error(f"Image generation error: {img_err}")

        # Queue embedding generation in background (not immediately visible)
        if request.generate_embedding and result.get("uuid"):
            background_tasks.add_task(generate_embedding_background, result.copy(), neo4j)
            logger.info(f"Queued background embedding generation for: {result.get('name')}")

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
    orchestrator: ClassificationOrchestrator = Depends(get_orchestrator),
    key_data: dict = Depends(require_classify)  # Require API key with classify scope
):
    """
    Classify multiple entities in a single request.

    **Requires API key with 'classify' scope.**

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
    orchestrator: ClassificationOrchestrator = Depends(get_orchestrator),
    key_data: dict = Depends(require_classify)  # Require API key with classify scope
):
    """
    Submit entity for asynchronous classification.

    **Requires API key with 'classify' scope.**

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
    uht_code: str,
    fastapi_request: Request
):
    """
    Explain a UHT classification code.

    **No authentication required** - this is a read-only operation.

    Breaks down the hex code into its component traits and layers.
    """
    from models.classification import UHTCode

    try:
        # Parse UHT code
        uht = UHTCode.from_hex(uht_code)

        # Use cached trait definitions
        traits_data = get_traits(fastapi_request)
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
