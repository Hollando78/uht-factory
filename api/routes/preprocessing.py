from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, Optional
import asyncio
import os

from workers.llm_client import LLMFactory, BaseLLMClient
from db.neo4j_client import Neo4jClient
from models.entity import (
    EntityInput,
    EntityPreProcessing,
    DuplicateCheck
)
from pydantic import BaseModel

router = APIRouter()

class PreprocessRequest(BaseModel):
    entity_name: str
    description: Optional[str] = None
    context: Optional[str] = None

class DuplicateCheckRequest(BaseModel):
    entity_name: str
    threshold: float = 0.8

# Dependency to get clients
async def get_llm_client() -> BaseLLMClient:
    provider = os.getenv("LLM_PROVIDER", "openrouter")
    return LLMFactory.create_client(provider)

async def get_neo4j_client():
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )
    await neo4j.connect()
    return neo4j

@router.post("/preprocess", response_model=EntityPreProcessing)
async def preprocess_entity(
    entity_name: str,
    llm_client: BaseLLMClient = Depends(get_llm_client)
):
    """
    Pre-process an entity name with AI enhancement suggestions.

    Uses configured LLM provider (OpenRouter free models by default) to:
    1. Suggest an optimal entity name
    2. Generate a detailed description
    3. Provide additional context
    4. Assess confidence level
    """
    try:
        # Create preprocessing prompt
        prompt = f"""
        Analyze and enhance the following entity for classification: "{entity_name}"
        
        Please provide JSON response with:
        1. An optimized entity name (clear, unambiguous, standardized)
        2. A concise but comprehensive description (2-3 sentences)
        3. Additional context that would help with classification
        4. A confidence score (0.0-1.0) for your suggestions
        
        Respond with valid JSON in this format:
        {{
            "suggested_name": "optimized name",
            "suggested_description": "clear description",
            "additional_context": "helpful context",
            "confidence": 0.85,
            "reasoning": "explanation of changes"
        }}
        
        Entity: {entity_name}
        """
        
        # Get AI response
        response = await llm_client.get_completion(
            prompt=prompt,
            temperature=0.3
        )
        
        # Parse response (simplified - would need better JSON parsing)
        import json
        try:
            result = json.loads(response)
        except:
            # Fallback if JSON parsing fails
            result = {
                "suggested_name": entity_name,
                "suggested_description": f"A {entity_name.lower()} entity requiring classification.",
                "additional_context": "No additional context available.",
                "confidence": 0.5,
                "reasoning": "AI preprocessing failed, using fallback values."
            }
        
        return EntityPreProcessing(
            original_name=entity_name,
            suggested_name=result.get("suggested_name", entity_name),
            suggested_description=result.get("suggested_description", ""),
            additional_context=result.get("additional_context", ""),
            confidence=result.get("confidence", 0.5),
            reasoning=result.get("reasoning", "AI enhancement applied")
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preprocessing failed: {str(e)}")

@router.post("/duplicate-check", response_model=DuplicateCheck)
async def check_duplicate(
    entity_name: str,
    threshold: float = 0.8,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Check if an entity already exists in the graph database.
    
    Performs fuzzy matching on entity names and returns any potential
    duplicates with similarity scores.
    """
    try:
        # Query for similar entities using Neo4j's text similarity
        query = """
        MATCH (e:Entity)
        WHERE e.name IS NOT NULL
        WITH e, 
             apoc.text.levenshteinSimilarity(toLower($entity_name), toLower(e.name)) AS similarity
        WHERE similarity >= $threshold
        RETURN e.uuid as uuid, e.name as name, e.uht_code as uht_code, 
               e.description as description, similarity
        ORDER BY similarity DESC
        LIMIT 1
        """
        
        result = await neo4j_client.execute_query(
            query, 
            entity_name=entity_name.lower(), 
            threshold=threshold
        )
        
        if result and len(result) > 0:
            # Found a potential duplicate
            entity = result[0]
            return DuplicateCheck(
                exists=True,
                similarity=entity.get("similarity", 0.0),
                existing_entity={
                    "uuid": entity.get("uuid"),
                    "name": entity.get("name"),
                    "uht_code": entity.get("uht_code"),
                    "description": entity.get("description")
                }
            )
        else:
            # No duplicates found
            return DuplicateCheck(
                exists=False,
                similarity=0.0,
                existing_entity=None
            )
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Duplicate check failed: {str(e)}")

@router.post("/enhance")
async def enhance_entity(
    request: PreprocessRequest,
    llm_client: BaseLLMClient = Depends(get_llm_client),
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Combined preprocessing and duplicate checking endpoint.
    
    Performs both AI enhancement and duplicate detection in a single call
    for optimal user experience.
    """
    try:
        # Run preprocessing and duplicate check in parallel
        preprocess_task = preprocess_entity(request.entity_name, llm_client)
        duplicate_task = check_duplicate(request.entity_name, neo4j_client=neo4j_client)
        
        preprocessing, duplicate_check = await asyncio.gather(
            preprocess_task,
            duplicate_task
        )
        
        return {
            "preprocessing": preprocessing,
            "duplicate_check": duplicate_check,
            "recommendations": {
                "proceed": not duplicate_check.exists or duplicate_check.similarity < 0.9,
                "message": "Entity looks unique" if not duplicate_check.exists 
                          else f"Similar entity found: {duplicate_check.existing_entity['name']}"
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Enhancement failed: {str(e)}")