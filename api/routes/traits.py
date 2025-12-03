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


# ===== META-CLASSES ENDPOINTS =====
# Note: These must be defined before /{bit} to avoid route conflicts

@router.get("/meta-classes")
async def get_meta_classes():
    """Get meta-class definitions (named archetypes for frequent hex pairs)"""
    try:
        meta_classes_path = "/root/project/uht-factory/data/meta_classes.json"

        if not os.path.exists(meta_classes_path):
            raise HTTPException(
                status_code=404,
                detail="Meta-classes not yet generated. Run generate_meta_classes.py first."
            )

        with open(meta_classes_path, "r") as f:
            return json.load(f)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/meta-classes/{layer}")
async def get_meta_classes_by_layer(layer: str):
    """Get meta-classes for a specific layer"""
    try:
        data = await get_meta_classes()

        # Normalize layer name (capitalize first letter)
        layer = layer.capitalize()

        layer_classes = [
            mc for mc in data.get("meta_classes", [])
            if mc["layer"] == layer
        ]

        if not layer_classes:
            raise HTTPException(
                status_code=404,
                detail=f"No meta-classes found for layer '{layer}'"
            )

        return {
            "layer": layer,
            "count": len(layer_classes),
            "meta_classes": layer_classes
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


# ===== TRAIT ANALYTICS ENDPOINTS =====

@router.get("/statistics/frequency")
async def get_trait_frequency():
    """Get detailed trait frequency with confidence breakdown"""
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )

    try:
        await neo4j.connect()
        return await neo4j.get_trait_frequency_detailed()
    finally:
        await neo4j.close()


@router.get("/statistics/cooccurrence")
async def get_trait_cooccurrence():
    """Get pairwise trait co-occurrence matrix"""
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )

    try:
        await neo4j.connect()
        return await neo4j.get_trait_cooccurrence_matrix()
    finally:
        await neo4j.close()


@router.get("/statistics/exclusivity")
async def get_trait_exclusivity():
    """Get trait mutual exclusivity analysis"""
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )

    try:
        await neo4j.connect()
        return await neo4j.get_trait_mutual_exclusivity()
    finally:
        await neo4j.close()


@router.get("/statistics/layers")
async def get_layer_statistics():
    """Get aggregate statistics by layer"""
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )

    try:
        await neo4j.connect()
        return await neo4j.get_layer_statistics()
    finally:
        await neo4j.close()


@router.get("/statistics/confidence")
async def get_confidence_statistics():
    """Get per-trait confidence metrics"""
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )

    try:
        await neo4j.connect()
        return await neo4j.get_confidence_statistics()
    finally:
        await neo4j.close()


@router.get("/statistics/full")
async def get_full_analytics():
    """Get all trait analytics combined"""
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )

    try:
        await neo4j.connect()
        return await neo4j.get_full_analytics()
    finally:
        await neo4j.close()


@router.get("/statistics/hex-pairs")
async def get_hex_pair_frequency():
    """Get hex pair frequency per layer"""
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )

    try:
        await neo4j.connect()
        return await neo4j.get_hex_pair_frequency()
    finally:
        await neo4j.close()