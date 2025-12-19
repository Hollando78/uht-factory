from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, UploadFile, File, Form, Query
from fastapi.responses import FileResponse, Response
from typing import Dict, Any, List, Optional
import os
import json
import uuid
import shutil
import hashlib
import httpx
from datetime import datetime

from workers.image_client import ImageGenerationOrchestrator
from db.neo4j_client import Neo4jClient
from models.entity import Entity
from pydantic import BaseModel
from api.middleware.api_key_auth import require_images, require_admin

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
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
    key_data: dict = Depends(require_images)  # Require API key with images scope
):
    """
    Generate an AI image for a classified UHT entity using Gemini Flash.

    **Requires API key with 'images' scope.**

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
            await update_entity_image(
                neo4j_client,
                request.entity_uuid,
                result["image_url"],
                changed_by=key_data.get("key_id", "api")
            )
        
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
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
    key_data: dict = Depends(require_images)  # Require API key with images scope
):
    """
    Generate images for multiple entities in the background.

    **Requires API key with 'images' scope.**

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
    offset: int = 0,
    layer_filter: Optional[str] = None,
    sort_by: str = "newest",  # newest, most_views, uht_code, name, random
    min_confidence: Optional[float] = None,
    has_wikidata: Optional[bool] = None,
    search: Optional[str] = None,  # Text search filter
    include_nsfw: bool = False,  # Whether to include NSFW content
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Get a gallery of all generated entity images with UHT metadata.

    Supports pagination, filtering, sorting, and text search.

    - **limit**: Number of items to return (default 50)
    - **offset**: Number of items to skip for pagination
    - **layer_filter**: Filter by dominant layer (Physical, Functional, Abstract, Social)
    - **sort_by**: Sort order - newest, most_views, uht_code, name, random
    - **min_confidence**: Filter by minimum average confidence score
    - **has_wikidata**: Filter to only show entities with Wikidata links
    - **search**: Text search filter (searches name and description, case-insensitive)
    - **include_nsfw**: Include NSFW content (default false)
    """
    try:
        # Build dynamic query based on filters
        where_clauses = ["e.image_url IS NOT NULL"]
        params = {"limit": limit, "offset": offset}

        # Filter NSFW content unless explicitly included
        if not include_nsfw:
            where_clauses.append("(e.nsfw IS NULL OR e.nsfw = false)")

        # Add text search filter
        if search and search.strip():
            search_term = search.strip().lower()
            params["search_term"] = f"(?i).*{search_term}.*"
            where_clauses.append("(e.name =~ $search_term OR e.description =~ $search_term)")

        if has_wikidata is True:
            where_clauses.append("e.wikidata_qid IS NOT NULL")
        elif has_wikidata is False:
            where_clauses.append("e.wikidata_qid IS NULL")

        # Build ORDER BY clause based on sort option
        order_clause = "ORDER BY "
        if sort_by == "most_views":
            order_clause += "COALESCE(e.view_count, 0) DESC, e.created_at DESC"
        elif sort_by == "uht_code":
            order_clause += "e.uht_code ASC"
        elif sort_by == "name":
            order_clause += "e.name ASC"
        elif sort_by == "random":
            order_clause += "rand()"
        else:  # newest (default)
            order_clause += "e.created_at DESC"

        # Main query with optional confidence filter via subquery
        if min_confidence is not None:
            params["min_confidence"] = min_confidence
            query = f"""
            MATCH (e:Entity)
            WHERE {' AND '.join(where_clauses)}
            OPTIONAL MATCH (e)-[r:HAS_TRAIT]->(t:Trait)
            WHERE r.applicable = true
            WITH e, avg(r.confidence) as avg_conf
            WHERE avg_conf >= $min_confidence OR avg_conf IS NULL
            RETURN e.uuid as uuid,
                   e.name as name,
                   e.uht_code as uht_code,
                   e.description as description,
                   e.image_url as image_url,
                   e.created_at as created_at,
                   COALESCE(e.view_count, 0) as view_count,
                   e.wikidata_qid as wikidata_qid,
                   avg_conf as avg_confidence
            {order_clause}
            SKIP $offset
            LIMIT $limit
            """
        else:
            query = f"""
            MATCH (e:Entity)
            WHERE {' AND '.join(where_clauses)}
            RETURN e.uuid as uuid,
                   e.name as name,
                   e.uht_code as uht_code,
                   e.description as description,
                   e.image_url as image_url,
                   e.created_at as created_at,
                   COALESCE(e.view_count, 0) as view_count,
                   e.wikidata_qid as wikidata_qid
            {order_clause}
            SKIP $offset
            LIMIT $limit
            """

        result = await neo4j_client.execute_query(query, **params)

        gallery_items = []
        for record in result:
            # Analyze layer dominance for filtering
            uht_code = record.get("uht_code", "00000000")
            dominant_layer = calculate_dominant_layer_from_code(uht_code)

            # Apply layer filter if specified (post-query filter for layer dominance)
            if layer_filter and dominant_layer.lower() != layer_filter.lower():
                continue

            gallery_items.append({
                "uuid": record.get("uuid"),
                "name": record.get("name"),
                "uht_code": uht_code,
                "description": record.get("description"),
                "image_url": record.get("image_url"),
                "dominant_layer": dominant_layer,
                "created_at": record.get("created_at"),
                "view_count": record.get("view_count", 0),
                "wikidata_qid": record.get("wikidata_qid"),
                "avg_confidence": record.get("avg_confidence")
            })

        # Get total count for pagination info
        count_where = where_clauses.copy()
        count_query = f"""
        MATCH (e:Entity)
        WHERE {' AND '.join(count_where)}
        RETURN count(e) as total
        """
        count_result = await neo4j_client.execute_query(count_query, **params)
        total_count = count_result[0]["total"] if count_result else 0

        return {
            "gallery": gallery_items,
            "total_count": total_count,
            "returned_count": len(gallery_items),
            "offset": offset,
            "limit": limit,
            "has_more": offset + len(gallery_items) < total_count,
            "layer_filter": layer_filter,
            "sort_by": sort_by
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gallery retrieval failed: {str(e)}")

@router.get("/proxy")
async def proxy_image(
    url: str = Query(..., description="External image URL to proxy")
):
    """
    Proxy external images to bypass CORS restrictions.

    Caches images locally to reduce external requests.
    Only allows image content types.
    """
    try:
        # Validate URL
        if not url.startswith(('http://', 'https://')):
            raise HTTPException(status_code=400, detail="Invalid URL")

        # Only allow known image domains for security
        allowed_domains = [
            'commons.wikimedia.org',
            'upload.wikimedia.org',
            'www.wikidata.org',
            'i.imgur.com',
            'images.unsplash.com'
        ]

        from urllib.parse import urlparse
        parsed = urlparse(url)
        if parsed.netloc not in allowed_domains:
            raise HTTPException(status_code=403, detail="Domain not allowed")

        # Check cache first
        cache_dir = "static/images/cache"
        os.makedirs(cache_dir, exist_ok=True)

        url_hash = hashlib.md5(url.encode()).hexdigest()
        cache_path = os.path.join(cache_dir, f"{url_hash}.img")
        cache_meta = os.path.join(cache_dir, f"{url_hash}.meta")

        if os.path.exists(cache_path) and os.path.exists(cache_meta):
            # Return cached image
            with open(cache_meta, 'r') as f:
                content_type = f.read().strip()
            with open(cache_path, 'rb') as f:
                content = f.read()
            return Response(
                content=content,
                media_type=content_type,
                headers={"Cache-Control": "public, max-age=86400"}
            )

        # Fetch the image with redirect following
        async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
            response = await client.get(url, headers={
                "User-Agent": "UHT-Factory/1.0 (https://factory.universalhex.org)"
            })

            if response.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Failed to fetch image: {response.status_code}")

            content_type = response.headers.get('content-type', '')
            if not content_type.startswith('image/'):
                raise HTTPException(status_code=400, detail="URL does not point to an image")

            content = response.content

            # Cache the image (max 5MB)
            if len(content) < 5 * 1024 * 1024:
                with open(cache_path, 'wb') as f:
                    f.write(content)
                with open(cache_meta, 'w') as f:
                    f.write(content_type)

            return Response(
                content=content,
                media_type=content_type,
                headers={"Cache-Control": "public, max-age=86400"}
            )

    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Image fetch timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")


@router.post("/entity/{entity_uuid}/view")
async def track_entity_view(
    entity_uuid: str,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Track a view for an entity. Increments the view_count property.

    This is called when a user views an entity in the gallery or detail view.
    """
    try:
        query = """
        MATCH (e:Entity {uuid: $uuid})
        SET e.view_count = COALESCE(e.view_count, 0) + 1,
            e.last_viewed_at = datetime()
        RETURN e.view_count as view_count
        """
        result = await neo4j_client.execute_query(query, uuid=entity_uuid)

        if not result:
            raise HTTPException(status_code=404, detail="Entity not found")

        return {
            "entity_uuid": entity_uuid,
            "view_count": result[0]["view_count"]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/entity/{entity_uuid}")
async def delete_entity_image(
    entity_uuid: str,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
    key_data: dict = Depends(require_admin)  # Require API key with admin scope
):
    """
    Delete an entity's generated image.

    **Requires API key with 'admin' scope.**
    """
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
        await update_entity_image(
            neo4j_client,
            entity_uuid,
            None,
            changed_by=key_data.get("key_id", "admin")
        )

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
    description: str = Form(...),
    key_data: dict = Depends(require_admin)  # Require API key with admin scope
):
    """
    Upload an example image for a canonical trait.

    **Requires API key with 'admin' scope.**
    """
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


@router.post("/upload")
async def upload_entity_image(
    image: UploadFile = File(...),
    entity_uuid: str = Form(...),
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
    key_data: dict = Depends(require_images)  # Require API key with images scope
):
    """
    Upload a custom image for an entity.

    **Requires API key with 'images' scope.**

    Replaces any existing image for this entity.
    """
    try:
        # Validate file type
        if not image.content_type or not image.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="File must be an image")

        # Validate file size (10MB max)
        contents = await image.read()
        if len(contents) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image must be less than 10MB")

        # Verify entity exists
        entity = await get_entity_by_uuid(neo4j_client, entity_uuid)
        if not entity:
            raise HTTPException(status_code=404, detail="Entity not found")

        # Delete old image if exists
        old_image_url = entity.get("image_url")
        if old_image_url and old_image_url.startswith("/static/images/"):
            try:
                old_file_path = f".{old_image_url}"
                if os.path.exists(old_file_path):
                    os.remove(old_file_path)
            except:
                pass  # Continue even if deletion fails

        # Create images directory if it doesn't exist
        images_dir = "static/images"
        os.makedirs(images_dir, exist_ok=True)

        # Generate unique filename
        file_extension = image.filename.split('.')[-1] if image.filename and '.' in image.filename else 'jpg'
        safe_name = "".join(c for c in entity.get("name", "entity") if c.isalnum() or c in (' ', '-', '_')).strip()
        safe_name = safe_name.replace(' ', '_')[:30]
        unique_filename = f"{safe_name}_{uuid.uuid4().hex[:8]}.{file_extension}"
        file_path = os.path.join(images_dir, unique_filename)

        # Save the uploaded file
        with open(file_path, "wb") as buffer:
            buffer.write(contents)

        # Create web-accessible URL
        image_url = f"/static/images/{unique_filename}"

        # Update entity in Neo4j
        await update_entity_image(
            neo4j_client,
            entity_uuid,
            image_url,
            changed_by=key_data.get("key_id", "api")
        )

        return {
            "success": True,
            "entity_uuid": entity_uuid,
            "image_url": image_url,
            "filename": unique_filename,
            "message": "Image uploaded successfully"
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

async def update_entity_image(
    neo4j_client: Neo4jClient,
    entity_uuid: str,
    image_url: Optional[str],
    changed_by: str = "system",
    create_version: bool = True
):
    """Update entity's image URL in Neo4j and create version snapshot"""
    # Capture previous state for version delta
    previous_state = await neo4j_client.get_entity_state_for_versioning(entity_uuid) if create_version else None

    if image_url:
        query = """
        MATCH (e:Entity {uuid: $uuid})
        SET e.image_url = $image_url,
            e.updated_at = datetime(),
            e.version = COALESCE(e.version, 1) + 1
        RETURN e
        """
        await neo4j_client.execute_query(query, uuid=entity_uuid, image_url=image_url)
        change_summary = "Generated AI image" if "/static/generated/" in image_url else "Updated image"
    else:
        query = """
        MATCH (e:Entity {uuid: $uuid})
        REMOVE e.image_url
        SET e.updated_at = datetime(),
            e.version = COALESCE(e.version, 1) + 1
        RETURN e
        """
        await neo4j_client.execute_query(query, uuid=entity_uuid)
        change_summary = "Removed image"

    # Create version snapshot
    if create_version:
        await neo4j_client.create_entity_version(
            entity_uuid=entity_uuid,
            change_type="image_change",
            change_summary=change_summary,
            changed_by=changed_by,
            previous_state=previous_state
        )

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
                await update_entity_image(
                    neo4j_client,
                    entity_uuid,
                    result["image_url"],
                    changed_by="batch_generation"
                )
        
        # Log completion
        successful_count = sum(1 for r in results if isinstance(r, dict) and r.get("success"))
        print(f"Batch {batch_id} completed: {successful_count}/{len(entities)} images generated")
        
    except Exception as e:
        print(f"Batch {batch_id} failed: {e}")