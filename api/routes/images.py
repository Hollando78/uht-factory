from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, UploadFile, File, Form
from fastapi.responses import FileResponse
from typing import Dict, Any, List, Optional
import os
import json
import uuid
import shutil
from datetime import datetime

from workers.image_client import ImageGenerationOrchestrator
from db.neo4j_client import Neo4jClient
from models.entity import Entity
from pydantic import BaseModel

router = APIRouter()

class ImageGenerationRequest(BaseModel):
    entity_uuid: str
    custom_prompt: Optional[str] = None
    style: Optional[str] = "realistic"  # realistic, artistic, diagram, cartoon

class BatchImageRequest(BaseModel):
    entity_uuids: List[str]
    max_concurrent: int = 3
    custom_prompts: Optional[Dict[str, str]] = None

class ImageGenerationResponse(BaseModel):
    success: bool
    image_url: Optional[str]
    prompt_used: str
    generation_time_ms: float
    cost_usd: float
    llm_model: str
    error: Optional[str] = None

# Dependency to get orchestrator
async def get_orchestrator():
    return ImageGenerationOrchestrator()

# Dependency to get Neo4j client
async def get_neo4j_client():
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )
    await neo4j.connect()
    return neo4j

@router.post("/generate", response_model=ImageGenerationResponse)
async def generate_entity_image(
    request: ImageGenerationRequest,
    orchestrator: ImageGenerationOrchestrator = Depends(get_orchestrator),
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Generate an AI image for a classified UHT entity using Gemini Flash.
    
    Cost: $0.039 per image
    Model: gemini-2.5-flash-image (Nano Banana)
    """
    try:
        # Get entity from Neo4j
        entity = await get_entity_by_uuid(neo4j_client, request.entity_uuid)
        if not entity:
            raise HTTPException(status_code=404, detail="Entity not found")
        
        # Generate image
        result = await orchestrator.generate_entity_image(
            entity=entity,
            custom_prompt=request.custom_prompt
        )
        
        # Update entity with image URL in Neo4j
        if result["success"] and result["image_url"]:
            await update_entity_image(neo4j_client, request.entity_uuid, result["image_url"])
        
        return ImageGenerationResponse(
            success=result["success"],
            image_url=result["image_url"],
            prompt_used=result["prompt_used"],
            generation_time_ms=result["generation_time_ms"],
            cost_usd=result["cost_usd"],
            llm_model=result["model_used"],
            error=result.get("error")
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")

@router.post("/generate-batch")
async def generate_batch_images(
    request: BatchImageRequest,
    background_tasks: BackgroundTasks,
    orchestrator: ImageGenerationOrchestrator = Depends(get_orchestrator),
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Generate images for multiple entities in the background.
    
    This endpoint starts the generation process and returns immediately.
    Use /status/{batch_id} to check progress.
    """
    try:
        batch_id = f"batch_{int(datetime.now().timestamp())}"
        
        # Start background task
        background_tasks.add_task(
            process_batch_images,
            batch_id,
            request.entity_uuids,
            request.max_concurrent,
            request.custom_prompts or {},
            orchestrator,
            neo4j_client
        )
        
        return {
            "batch_id": batch_id,
            "status": "started",
            "entity_count": len(request.entity_uuids),
            "estimated_cost_usd": len(request.entity_uuids) * 0.039,
            "message": "Batch image generation started"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch generation failed: {str(e)}")

@router.get("/entity/{entity_uuid}")
async def get_entity_image(
    entity_uuid: str,
    generate_placeholder: bool = True,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Get the generated image for an entity.

    If no image exists and generate_placeholder=True, returns an SVG placeholder.
    """
    try:
        entity = await get_entity_by_uuid(neo4j_client, entity_uuid)
        if not entity:
            raise HTTPException(status_code=404, detail="Entity not found")

        image_url = entity.get("image_url")

        if image_url:
            return {
                "entity_uuid": entity_uuid,
                "entity_name": entity.get("name"),
                "image_url": image_url,
                "has_image": True,
                "is_placeholder": False
            }

        # No image - generate SVG placeholder if requested
        if generate_placeholder:
            from workers.image_client import SVGPlaceholderClient

            placeholder = SVGPlaceholderClient()
            uht_code = entity.get("uht_code", "00000000")

            # Determine dominant layer from UHT code
            layers = entity.get("layers", {})
            dominant_layer = max(layers.keys(), key=lambda k: int(layers[k], 16)) if layers else "Physical"

            svg_content = placeholder.generate_svg(
                entity.get("name", "Unknown"),
                uht_code,
                dominant_layer
            )

            # Return as data URL
            import base64
            svg_b64 = base64.b64encode(svg_content.encode()).decode()
            data_url = f"data:image/svg+xml;base64,{svg_b64}"

            return {
                "entity_uuid": entity_uuid,
                "entity_name": entity.get("name"),
                "image_url": data_url,
                "has_image": False,
                "is_placeholder": True
            }

        raise HTTPException(status_code=404, detail="No image found for this entity")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/gallery")
async def get_image_gallery(
    limit: int = 50,
    layer_filter: Optional[str] = None,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Get a gallery of all generated entity images with UHT metadata.
    
    Optionally filter by dominant layer (Physical, Functional, Abstract, Social).
    """
    try:
        # Build query with optional layer filter
        query = """
        MATCH (e:Entity)
        WHERE e.image_url IS NOT NULL
        """
        
        params = {"limit": limit}
        
        if layer_filter:
            # Add layer filtering logic based on UHT code analysis
            query += " AND e.uht_code IS NOT NULL"
            params["layer_filter"] = layer_filter
        
        query += """
        RETURN e.uuid as uuid,
               e.name as name,
               e.uht_code as uht_code,
               e.description as description,
               e.image_url as image_url,
               e.created_at as created_at
        ORDER BY e.created_at DESC
        LIMIT $limit
        """
        
        result = await neo4j_client.execute_query(query, **params)
        
        gallery_items = []
        for record in result:
            # Analyze layer dominance for filtering
            uht_code = record.get("uht_code", "00000000")
            dominant_layer = calculate_dominant_layer_from_code(uht_code)
            
            # Apply layer filter if specified
            if layer_filter and dominant_layer.lower() != layer_filter.lower():
                continue
            
            gallery_items.append({
                "uuid": record.get("uuid"),
                "name": record.get("name"),
                "uht_code": uht_code,
                "description": record.get("description"),
                "image_url": record.get("image_url"),
                "dominant_layer": dominant_layer,
                "created_at": record.get("created_at")
            })
        
        return {
            "gallery": gallery_items,
            "total_count": len(gallery_items),
            "layer_filter": layer_filter
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gallery retrieval failed: {str(e)}")

@router.delete("/entity/{entity_uuid}")
async def delete_entity_image(
    entity_uuid: str,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """Delete an entity's generated image"""
    try:
        # Get entity to find image file
        entity = await get_entity_by_uuid(neo4j_client, entity_uuid)
        if not entity:
            raise HTTPException(status_code=404, detail="Entity not found")
        
        image_url = entity.get("image_url")
        if image_url:
            # Delete physical file
            try:
                if image_url.startswith("/static/images/"):
                    file_path = f".{image_url}"  # Convert to relative path
                    if os.path.exists(file_path):
                        os.remove(file_path)
            except:
                pass  # Continue even if file deletion fails
        
        # Remove image URL from entity
        await update_entity_image(neo4j_client, entity_uuid, None)
        
        return {
            "entity_uuid": entity_uuid,
            "message": "Image deleted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload-trait-example")
async def upload_trait_example(
    image: UploadFile = File(...),
    trait_bit: int = Form(...),
    description: str = Form(...)
):
    """Upload an example image for a canonical trait"""
    try:
        # Validate file type
        if not image.content_type or not image.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Validate trait bit
        if not (1 <= trait_bit <= 32):
            raise HTTPException(status_code=400, detail="Trait bit must be between 1 and 32")
        
        # Create directories if they don't exist
        trait_examples_dir = "static/images/trait-examples"
        os.makedirs(trait_examples_dir, exist_ok=True)
        
        # Generate unique filename
        file_extension = image.filename.split('.')[-1] if image.filename and '.' in image.filename else 'jpg'
        unique_filename = f"trait_{trait_bit}_{uuid.uuid4()}.{file_extension}"
        file_path = os.path.join(trait_examples_dir, unique_filename)
        
        # Save the uploaded file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        
        # Create web-accessible URL
        image_url = f"/static/images/trait-examples/{unique_filename}"
        
        # TODO: Store trait example in database with metadata
        # For now, just return success response
        
        return {
            "success": True,
            "trait_bit": trait_bit,
            "description": description,
            "image_url": image_url,
            "filename": unique_filename,
            "message": f"Example image uploaded successfully for trait {trait_bit}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

# Helper functions

async def get_entity_by_uuid(neo4j_client: Neo4jClient, entity_uuid: str) -> Optional[Dict[str, Any]]:
    """Get entity from Neo4j by UUID"""
    query = """
    MATCH (e:Entity {uuid: $uuid})
    RETURN e.uuid as uuid,
           e.name as name,
           e.description as description,
           e.uht_code as uht_code,
           e.image_url as image_url,
           e.layers as layers
    """
    
    result = await neo4j_client.execute_query(query, uuid=entity_uuid)
    return result[0] if result else None

async def update_entity_image(neo4j_client: Neo4jClient, entity_uuid: str, image_url: Optional[str]):
    """Update entity's image URL in Neo4j"""
    if image_url:
        query = """
        MATCH (e:Entity {uuid: $uuid})
        SET e.image_url = $image_url,
            e.updated_at = datetime()
        RETURN e
        """
        await neo4j_client.execute_query(query, uuid=entity_uuid, image_url=image_url)
    else:
        query = """
        MATCH (e:Entity {uuid: $uuid})
        REMOVE e.image_url
        SET e.updated_at = datetime()
        RETURN e
        """
        await neo4j_client.execute_query(query, uuid=entity_uuid)

def calculate_dominant_layer_from_code(uht_code: str) -> str:
    """Calculate dominant layer from UHT code"""
    try:
        if len(uht_code) != 8:
            return "Unknown"
        
        layers = {
            "Physical": bin(int(uht_code[:2], 16))[2:].count('1'),
            "Functional": bin(int(uht_code[2:4], 16))[2:].count('1'),
            "Abstract": bin(int(uht_code[4:6], 16))[2:].count('1'),
            "Social": bin(int(uht_code[6:8], 16))[2:].count('1')
        }
        
        return max(layers.items(), key=lambda x: x[1])[0]
    except:
        return "Unknown"

async def process_batch_images(
    batch_id: str,
    entity_uuids: List[str],
    max_concurrent: int,
    custom_prompts: Dict[str, str],
    orchestrator: ImageGenerationOrchestrator,
    neo4j_client: Neo4jClient
):
    """Background task to process batch image generation"""
    from datetime import datetime
    
    try:
        # Get all entities
        entities = []
        for uuid in entity_uuids:
            entity = await get_entity_by_uuid(neo4j_client, uuid)
            if entity:
                if uuid in custom_prompts:
                    entity["custom_prompt"] = custom_prompts[uuid]
                entities.append(entity)
        
        # Generate images
        results = await orchestrator.generate_batch_images(entities, max_concurrent)
        
        # Update entities with results
        for i, result in enumerate(results):
            if isinstance(result, dict) and result.get("success") and result.get("image_url"):
                entity_uuid = entity_uuids[i]
                await update_entity_image(neo4j_client, entity_uuid, result["image_url"])
        
        # Log completion
        successful_count = sum(1 for r in results if isinstance(r, dict) and r.get("success"))
        print(f"Batch {batch_id} completed: {successful_count}/{len(entities)} images generated")
        
    except Exception as e:
        print(f"Batch {batch_id} failed: {e}")