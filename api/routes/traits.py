from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
import json
import os

from db.neo4j_client import Neo4jClient

router = APIRouter()

@router.get("/")
async def get_all_traits():
    """Get all canonical traits"""
    try:
        traits_path = "/root/project/uht-github/canonical_traits/traits_v2.json"
        with open(traits_path, "r") as f:
            traits_data = json.load(f)
        
        # Group traits by layer
        layers = {}
        for trait in traits_data["traits"]:
            layer = trait["layer"]
            if layer not in layers:
                layers[layer] = []
            layers[layer].append(trait)
        
        return {
            "version": traits_data["version"],
            "total_traits": len(traits_data["traits"]),
            "layers": layers,
            "traits": traits_data["traits"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/layer/{layer_name}")
async def get_traits_by_layer(layer_name: str):
    """Get traits for a specific layer"""
    try:
        traits_data = await get_all_traits()
        
        if layer_name not in traits_data["layers"]:
            raise HTTPException(status_code=404, detail=f"Layer '{layer_name}' not found")
        
        return {
            "layer": layer_name,
            "traits": traits_data["layers"][layer_name]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{bit}")
async def get_trait_by_bit(bit: int):
    """Get specific trait by bit position"""
    if bit < 1 or bit > 32:
        raise HTTPException(status_code=400, detail="Bit must be between 1 and 32")
    
    try:
        traits_data = await get_all_traits()
        
        trait = next((t for t in traits_data["traits"] if t["bit"] == bit), None)
        if not trait:
            raise HTTPException(status_code=404, detail=f"Trait for bit {bit} not found")
        
        return trait
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/statistics")
async def get_trait_statistics():
    """Get usage statistics for all traits"""
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )
    
    try:
        await neo4j.connect()
        stats = await neo4j.get_trait_statistics()
        return stats
    finally:
        await neo4j.close()