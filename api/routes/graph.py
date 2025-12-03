from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, List, Optional
import os

from db.neo4j_client import Neo4jClient

router = APIRouter()

# Dependency to get Neo4j client
async def get_neo4j_client():
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )
    await neo4j.connect()
    return neo4j

@router.get("/nodes")
async def get_graph_nodes(
    limit: int = 100,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Get trait-centric graph nodes for 3D visualization.
    
    Returns a structured graph with layer nodes, trait nodes, and entity nodes
    connected through meaningful trait relationships.
    """
    try:
        # Load trait definitions
        traits_data = load_traits()
        
        # Get entities from database
        query = """
        MATCH (e:Entity)
        WHERE e.uht_code IS NOT NULL AND e.name IS NOT NULL
        RETURN e.uuid as id,
               e.name as name, 
               e.uht_code as uht_code,
               e.description as description,
               e.created_at as created_at
        ORDER BY e.created_at DESC
        LIMIT $limit
        """
        
        result = await neo4j_client.execute_query(query, limit=limit)
        
        nodes = []
        
        # Add layer nodes (4 large center nodes)
        layer_colors = {
            "Physical": "#FF6B35",    # Orange
            "Functional": "#00E5FF",  # Cyan  
            "Abstract": "#9C27B0",    # Purple
            "Social": "#4CAF50"      # Green
        }
        
        for layer_name, color in layer_colors.items():
            nodes.append({
                "id": f"layer_{layer_name.lower()}",
                "name": f"{layer_name} Layer",
                "type": "layer",
                "color": color,
                "val": 12,  # Extra large nodes for layers
                "layer": layer_name,
                "opacity": 0.8
            })
        
        # Add trait nodes (32 medium nodes)
        for trait in traits_data["traits"]:
            nodes.append({
                "id": f"trait_{trait['bit']}",
                "name": trait['name'],
                "type": "trait",
                "color": layer_colors.get(trait['layer'], '#757575'),
                "val": 5,  # Medium nodes for traits
                "layer": trait['layer'],
                "bit": trait['bit'],
                "description": trait['short_description'],
                "opacity": 0.6
            })
        
        # Add entity nodes (small nodes connected to their traits)
        for record in result:
            uht_code = record.get('uht_code', '00000000')
            trait_count = calculate_active_traits(uht_code)
            layer_dominance = calculate_dominant_layer({'uht_code': uht_code})
            
            nodes.append({
                "id": record.get('id'),
                "name": record.get('name'),
                "type": "entity",
                "uht_code": uht_code,
                "description": record.get('description', ''),
                "layer_dominance": layer_dominance,
                "trait_count": trait_count,
                "color": layer_colors.get(layer_dominance, '#FF6B35'),
                "val": max(2, trait_count / 4),  # Entity nodes sized by trait count
                "opacity": 1.0,  # Full opacity for entities
                "shape": "cube"  # Custom shape identifier
            })
            
        return {"nodes": nodes}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get graph nodes: {str(e)}")

@router.get("/links")
async def get_graph_links(
    similarity_threshold: float = 0.7,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Get trait-centric relationships for the graph visualization.
    
    Creates meaningful connections:
    - Traits connected to their parent layers
    - Entities connected to traits they possess
    - No arbitrary similarity connections
    """
    try:
        # Load trait definitions
        traits_data = load_traits()
        
        # Get entities from database
        query = """
        MATCH (e:Entity)
        WHERE e.uht_code IS NOT NULL AND e.name IS NOT NULL
        RETURN e.uuid as id, e.uht_code as uht_code
        """
        
        result = await neo4j_client.execute_query(query)
        
        links = []
        
        # Create trait-to-layer connections
        for trait in traits_data["traits"]:
            layer_id = f"layer_{trait['layer'].lower()}"
            trait_id = f"trait_{trait['bit']}"
            
            links.append({
                "source": trait_id,
                "target": layer_id,
                "type": "trait_to_layer",
                "distance": 50  # Medium distance to layer
            })
        
        # Create entity-to-trait connections
        for record in result:
            entity_id = record.get('id')
            uht_code = record.get('uht_code', '00000000')
            
            # Get active trait bits for this entity
            active_traits = get_active_trait_bits(uht_code)
            
            for trait_bit in active_traits:
                trait_id = f"trait_{trait_bit}"
                
                links.append({
                    "source": entity_id,
                    "target": trait_id,
                    "type": "entity_to_trait",
                    "distance": 30  # Close distance to traits
                })
        
        return {"links": links}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get graph links: {str(e)}")

@router.get("/full")
async def get_full_graph(
    node_limit: int = 50,
    similarity_threshold: float = 0.7,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Get complete trait-centric graph data for 3D visualization.

    Returns a structured graph with:
    - 4 layer nodes (Physical, Functional, Abstract, Social)
    - 32 trait nodes (connected to their respective layers)
    - Entity nodes (connected only to traits they possess)

    This creates a meaningful visualization of the UHT taxonomy
    instead of arbitrary similarity connections.
    """
    try:
        # Get nodes first
        nodes_response = await get_graph_nodes(limit=node_limit, neo4j_client=neo4j_client)
        nodes = nodes_response["nodes"]

        # Build set of valid node IDs
        valid_node_ids = {n["id"] for n in nodes}

        # Get links
        links_response = await get_graph_links(similarity_threshold=similarity_threshold, neo4j_client=neo4j_client)
        all_links = links_response["links"]

        # Filter links to only include those where both source and target exist in nodes
        links = [
            link for link in all_links
            if link["source"] in valid_node_ids and link["target"] in valid_node_ids
        ]

        # Count different node types for stats
        layer_nodes = [n for n in nodes if n.get("type") == "layer"]
        trait_nodes = [n for n in nodes if n.get("type") == "trait"]
        entity_nodes = [n for n in nodes if n.get("type") == "entity"]

        return {
            "nodes": nodes,
            "links": links,
            "stats": {
                "total_nodes": len(nodes),
                "layer_nodes": len(layer_nodes),
                "trait_nodes": len(trait_nodes),
                "entity_nodes": len(entity_nodes),
                "total_links": len(links),
                "entity_limit": node_limit
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get full graph: {str(e)}")

def calculate_dominant_layer(layers: Dict[str, str]) -> str:
    """Calculate which layer has the most active traits"""
    if not layers:
        return "Unknown"
    
    # UHT code is 32 bits split into 4 layers of 8 bits each
    # Physical: bits 1-8, Functional: bits 9-16, Abstract: bits 17-24, Social: bits 25-32
    layer_counts = {}
    
    # If layers is already provided as separate hex values, use them
    if 'Physical' in layers:
        for layer_name, hex_value in layers.items():
            if hex_value and hex_value != '00':
                try:
                    binary = bin(int(hex_value, 16))[2:].zfill(8)
                    layer_counts[layer_name] = binary.count('1')
                except:
                    layer_counts[layer_name] = 0
    else:
        # Calculate from full UHT code if individual layers not available
        try:
            full_hex = layers.get('uht_code', '00000000')
            if len(full_hex) == 8:
                # Split into 4 2-character hex values
                physical = full_hex[:2]
                functional = full_hex[2:4] 
                abstract = full_hex[4:6]
                social = full_hex[6:8]
                
                layer_counts['Physical'] = bin(int(physical, 16))[2:].count('1')
                layer_counts['Functional'] = bin(int(functional, 16))[2:].count('1') 
                layer_counts['Abstract'] = bin(int(abstract, 16))[2:].count('1')
                layer_counts['Social'] = bin(int(social, 16))[2:].count('1')
        except:
            return "Unknown"
    
    if not layer_counts or all(count == 0 for count in layer_counts.values()):
        return "Unknown"
        
    return max(layer_counts.items(), key=lambda x: x[1])[0]

def calculate_active_traits(uht_code: str) -> int:
    """Calculate total number of active traits from UHT code"""
    try:
        # Convert hex to binary and count 1s
        binary = bin(int(uht_code, 16))[2:].zfill(32)
        return binary.count('1')
    except:
        return 0

def get_layer_color(layer: str) -> str:
    """Get color for layer dominance"""
    colors = {
        "Physical": "#FF6B35",    # Orange
        "Functional": "#00E5FF",  # Cyan  
        "Abstract": "#9C27B0",    # Purple
        "Social": "#4CAF50",      # Green
        "Unknown": "#757575"      # Gray
    }
    return colors.get(layer, "#757575")

def get_active_trait_bits(uht_code: str) -> List[int]:
    """Get list of active trait bit positions from UHT code"""
    try:
        # Convert hex to binary
        binary = bin(int(uht_code, 16))[2:].zfill(32)
        
        # Find active bits (1s) and convert to trait numbers (1-32)
        active_bits = []
        for i, bit in enumerate(binary):
            if bit == '1':
                active_bits.append(i + 1)  # Trait bits are 1-indexed
                
        return active_bits
        
    except:
        return []

def load_traits():
    """Load traits data from canonical file"""
    import json
    traits_path = "/root/project/uht-github/canonical_traits/traits_v2.json"
    with open(traits_path, "r") as f:
        return json.load(f)

def calculate_uht_similarity(code1: str, code2: str) -> float:
    """Calculate similarity between two UHT codes"""
    if not code1 or not code2:
        return 0.0
    
    try:
        # Convert to binary
        bin1 = bin(int(code1, 16))[2:].zfill(32)
        bin2 = bin(int(code2, 16))[2:].zfill(32)
        
        # Count matching bits
        matches = sum(1 for a, b in zip(bin1, bin2) if a == b)
        return matches / 32.0
        
    except:
        return 0.0