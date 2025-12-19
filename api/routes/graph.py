from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import Dict, Any, List, Optional, Literal
from pydantic import BaseModel, Field
import os
import json

from db.neo4j_client import Neo4jClient
from db.redis_client import RedisClient
from api.dependencies import get_redis_client
from workers.projection_worker import compute_uht_similarity

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


# ============= Neighborhood Exploration API =============

NEIGHBORHOOD_CACHE_TTL = 300  # 5 minutes

class ExpandRequest(BaseModel):
    """Request body for expanding from a node"""
    entity_uuid: str
    metric: Literal['embedding', 'hamming', 'hybrid'] = 'embedding'
    k: int = Field(default=10, ge=1, le=30)
    exclude_uuids: List[str] = Field(default_factory=list)
    include_nsfw: bool = False


class EntityNode(BaseModel):
    """Entity node for graph visualization"""
    id: str
    name: str
    type: str = "entity"
    uht_code: str
    description: Optional[str] = None
    layer_dominance: str
    trait_count: int
    color: str
    val: float
    image_url: Optional[str] = None
    is_center: bool = False


class SimilarityLink(BaseModel):
    """Entity-to-entity similarity link"""
    source: str
    target: str
    type: str = "entity_to_entity"
    metric: str
    similarity: float
    distance: int = 40


class NeighborhoodResponse(BaseModel):
    """Response for neighborhood query"""
    center: EntityNode
    nodes: List[EntityNode]
    links: List[SimilarityLink]
    trait_nodes: Optional[List[Dict[str, Any]]] = None
    trait_links: Optional[List[Dict[str, Any]]] = None
    stats: Dict[str, Any]


@router.get("/neighborhood/{uuid}", response_model=NeighborhoodResponse)
async def get_entity_neighborhood(
    uuid: str,
    metric: Literal['embedding', 'hamming', 'hybrid'] = Query('embedding'),
    k: int = Query(15, ge=5, le=50),
    min_similarity: float = Query(0.3, ge=0.0, le=1.0),
    include_traits: bool = Query(True),
    include_nsfw: bool = Query(False, description="Include NSFW content"),
    request = None,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
    redis: RedisClient = Depends(get_redis_client)
):
    """
    Get entity neighborhood graph with similar entities.

    Returns the center entity plus its k most similar neighbors,
    connected by similarity edges. Supports embedding (semantic),
    hamming (structural), or hybrid similarity metrics.
    """
    try:
        # Check cache first (include nsfw in cache key)
        cache_key = f"graph:neighborhood:{uuid}:{metric}:{k}:{include_nsfw}"
        cached = await redis.get(cache_key)
        if cached:
            return NeighborhoodResponse(**json.loads(cached))

        # Build NSFW filter clause
        nsfw_filter = "" if include_nsfw else "AND (node.nsfw IS NULL OR node.nsfw = false)"
        nsfw_filter_e = "" if include_nsfw else "AND (e.nsfw IS NULL OR e.nsfw = false)"

        # Get the center entity
        center_query = """
        MATCH (e:Entity {uuid: $uuid})
        RETURN e.uuid as uuid, e.name as name, e.uht_code as uht_code,
               e.description as description, e.embedding as embedding,
               e.image_url as image_url
        """
        center_result = await neo4j_client.execute_query(center_query, uuid=uuid)

        if not center_result:
            raise HTTPException(status_code=404, detail="Entity not found")

        center_data = center_result[0]
        center_uht = center_data.get('uht_code', '00000000')
        center_embedding = center_data.get('embedding')

        layer_colors = {
            "Physical": "#FF6B35",
            "Functional": "#00E5FF",
            "Abstract": "#9C27B0",
            "Social": "#4CAF50",
            "Unknown": "#757575"
        }

        # Build center node
        center_layer = calculate_dominant_layer({'uht_code': center_uht})
        center_traits = calculate_active_traits(center_uht)
        center_node = EntityNode(
            id=uuid,
            name=center_data.get('name', 'Unknown'),
            uht_code=center_uht,
            description=center_data.get('description'),
            layer_dominance=center_layer,
            trait_count=center_traits,
            color=layer_colors.get(center_layer, '#757575'),
            val=8,  # Larger for center node
            image_url=center_data.get('image_url'),
            is_center=True
        )

        neighbors = []

        # Get neighbors based on metric
        if metric in ['embedding', 'hybrid'] and center_embedding:
            # Embedding-based neighbors using vector index
            emb_query = f"""
            CALL db.index.vector.queryNodes('entity_embedding', $k_plus, $embedding)
            YIELD node, score
            WHERE node.uuid <> $uuid AND score >= $min_score {nsfw_filter}
            RETURN node.uuid as uuid, node.name as name, node.uht_code as uht_code,
                   node.description as description, node.image_url as image_url,
                   score as embedding_similarity
            LIMIT $k
            """
            emb_result = await neo4j_client.execute_query(
                emb_query,
                k_plus=k + 5,
                k=k,
                embedding=center_embedding,
                uuid=uuid,
                min_score=min_similarity
            )

            for r in emb_result:
                other_uht = r.get('uht_code', '00000000')
                emb_sim = r.get('embedding_similarity', 0)
                uht_sim = compute_uht_similarity(center_uht, other_uht)

                # For hybrid, compute blended score
                if metric == 'hybrid':
                    final_sim = 0.6 * emb_sim + 0.4 * uht_sim
                else:
                    final_sim = emb_sim

                neighbors.append({
                    'uuid': r.get('uuid'),
                    'name': r.get('name'),
                    'uht_code': other_uht,
                    'description': r.get('description'),
                    'image_url': r.get('image_url'),
                    'embedding_similarity': emb_sim,
                    'uht_similarity': uht_sim,
                    'final_similarity': final_sim
                })

        if metric == 'hamming':
            # UHT-based neighbors (Jaccard similarity on traits)
            uht_query = f"""
            MATCH (e:Entity)
            WHERE e.uuid <> $uuid AND e.uht_code IS NOT NULL {nsfw_filter_e}
            RETURN e.uuid as uuid, e.name as name, e.uht_code as uht_code,
                   e.description as description, e.image_url as image_url
            LIMIT 5000
            """
            uht_result = await neo4j_client.execute_query(uht_query, uuid=uuid)

            for r in uht_result:
                other_uht = r.get('uht_code', '00000000')
                uht_sim = compute_uht_similarity(center_uht, other_uht)

                if uht_sim >= min_similarity:
                    neighbors.append({
                        'uuid': r.get('uuid'),
                        'name': r.get('name'),
                        'uht_code': other_uht,
                        'description': r.get('description'),
                        'image_url': r.get('image_url'),
                        'embedding_similarity': 0,
                        'uht_similarity': uht_sim,
                        'final_similarity': uht_sim
                    })

        # Sort by final similarity and take top k
        neighbors.sort(key=lambda x: x['final_similarity'], reverse=True)
        neighbors = neighbors[:k]

        # Build neighbor nodes
        entity_nodes = []
        for n in neighbors:
            n_layer = calculate_dominant_layer({'uht_code': n['uht_code']})
            n_traits = calculate_active_traits(n['uht_code'])
            entity_nodes.append(EntityNode(
                id=n['uuid'],
                name=n['name'],
                uht_code=n['uht_code'],
                description=n.get('description'),
                layer_dominance=n_layer,
                trait_count=n_traits,
                color=layer_colors.get(n_layer, '#757575'),
                val=max(3, n_traits / 5),
                image_url=n.get('image_url'),
                is_center=False
            ))

        # Build similarity links (center to each neighbor)
        links = []
        for n in neighbors:
            links.append(SimilarityLink(
                source=uuid,
                target=n['uuid'],
                metric=metric,
                similarity=round(n['final_similarity'], 4)
            ))

        # Optionally include trait structure
        trait_nodes = None
        trait_links = None

        if include_traits:
            traits_data = load_traits()
            trait_nodes = []
            trait_links = []

            # Add layer nodes
            for layer_name, color in layer_colors.items():
                if layer_name == "Unknown":
                    continue
                trait_nodes.append({
                    "id": f"layer_{layer_name.lower()}",
                    "name": f"{layer_name} Layer",
                    "type": "layer",
                    "color": color,
                    "val": 10,
                    "layer": layer_name,
                    "opacity": 0.4
                })

            # Add trait nodes
            for trait in traits_data["traits"]:
                trait_nodes.append({
                    "id": f"trait_{trait['bit']}",
                    "name": trait['name'],
                    "type": "trait",
                    "color": layer_colors.get(trait['layer'], '#757575'),
                    "val": 4,
                    "layer": trait['layer'],
                    "bit": trait['bit'],
                    "opacity": 0.3
                })

                # Trait to layer links
                trait_links.append({
                    "source": f"trait_{trait['bit']}",
                    "target": f"layer_{trait['layer'].lower()}",
                    "type": "trait_to_layer",
                    "distance": 40
                })

            # Entity to trait links (for center and neighbors)
            all_entity_uuids = [uuid] + [n['uuid'] for n in neighbors]
            all_entity_uhts = [center_uht] + [n['uht_code'] for n in neighbors]

            for ent_uuid, ent_uht in zip(all_entity_uuids, all_entity_uhts):
                active_bits = get_active_trait_bits(ent_uht)
                for bit in active_bits:
                    trait_links.append({
                        "source": ent_uuid,
                        "target": f"trait_{bit}",
                        "type": "entity_to_trait",
                        "distance": 25
                    })

        response = NeighborhoodResponse(
            center=center_node,
            nodes=entity_nodes,
            links=links,
            trait_nodes=trait_nodes,
            trait_links=trait_links,
            stats={
                "total_neighbors": len(entity_nodes),
                "metric": metric,
                "k_requested": k
            }
        )

        # Cache the result
        await redis.setex(cache_key, NEIGHBORHOOD_CACHE_TTL, json.dumps(response.model_dump()))

        return response

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get neighborhood: {str(e)}")


@router.post("/expand")
async def expand_from_node(
    body: ExpandRequest,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Expand from a node to reveal new neighbors.

    Returns only NEW neighbors not already in the graph (filtered by exclude_uuids).
    Used for progressive graph exploration.
    """
    try:
        # Get the entity to expand from
        entity_query = """
        MATCH (e:Entity {uuid: $uuid})
        RETURN e.uuid as uuid, e.uht_code as uht_code, e.embedding as embedding
        """
        result = await neo4j_client.execute_query(entity_query, uuid=body.entity_uuid)

        if not result:
            raise HTTPException(status_code=404, detail="Entity not found")

        entity_data = result[0]
        entity_uht = entity_data.get('uht_code', '00000000')
        entity_embedding = entity_data.get('embedding')

        exclude_set = set(body.exclude_uuids)
        exclude_set.add(body.entity_uuid)  # Don't include self

        # Build NSFW filter clause
        nsfw_filter = "" if body.include_nsfw else "AND (node.nsfw IS NULL OR node.nsfw = false)"
        nsfw_filter_e = "" if body.include_nsfw else "AND (e.nsfw IS NULL OR e.nsfw = false)"

        layer_colors = {
            "Physical": "#FF6B35",
            "Functional": "#00E5FF",
            "Abstract": "#9C27B0",
            "Social": "#4CAF50",
            "Unknown": "#757575"
        }

        candidates = []

        # Get candidates based on metric
        if body.metric in ['embedding', 'hybrid'] and entity_embedding:
            # Get more than needed since we'll filter
            emb_query = f"""
            CALL db.index.vector.queryNodes('entity_embedding', $k_plus, $embedding)
            YIELD node, score
            WHERE node.uuid <> $uuid AND score >= 0.3 {nsfw_filter}
            RETURN node.uuid as uuid, node.name as name, node.uht_code as uht_code,
                   node.description as description, node.image_url as image_url,
                   score as embedding_similarity
            """
            emb_result = await neo4j_client.execute_query(
                emb_query,
                k_plus=body.k * 3,  # Get extra for filtering
                embedding=entity_embedding,
                uuid=body.entity_uuid
            )

            for r in emb_result:
                if r.get('uuid') in exclude_set:
                    continue

                other_uht = r.get('uht_code', '00000000')
                emb_sim = r.get('embedding_similarity', 0)
                uht_sim = compute_uht_similarity(entity_uht, other_uht)

                if body.metric == 'hybrid':
                    final_sim = 0.6 * emb_sim + 0.4 * uht_sim
                else:
                    final_sim = emb_sim

                candidates.append({
                    'uuid': r.get('uuid'),
                    'name': r.get('name'),
                    'uht_code': other_uht,
                    'description': r.get('description'),
                    'image_url': r.get('image_url'),
                    'final_similarity': final_sim
                })

        if body.metric == 'hamming':
            uht_query = f"""
            MATCH (e:Entity)
            WHERE e.uuid <> $uuid AND e.uht_code IS NOT NULL {nsfw_filter_e}
            RETURN e.uuid as uuid, e.name as name, e.uht_code as uht_code,
                   e.description as description, e.image_url as image_url
            LIMIT 5000
            """
            uht_result = await neo4j_client.execute_query(uht_query, uuid=body.entity_uuid)

            for r in uht_result:
                if r.get('uuid') in exclude_set:
                    continue

                other_uht = r.get('uht_code', '00000000')
                uht_sim = compute_uht_similarity(entity_uht, other_uht)

                if uht_sim >= 0.3:
                    candidates.append({
                        'uuid': r.get('uuid'),
                        'name': r.get('name'),
                        'uht_code': other_uht,
                        'description': r.get('description'),
                        'image_url': r.get('image_url'),
                        'final_similarity': uht_sim
                    })

        # Sort and take top k
        candidates.sort(key=lambda x: x['final_similarity'], reverse=True)
        new_neighbors = candidates[:body.k]

        # Build nodes
        new_nodes = []
        for n in new_neighbors:
            n_layer = calculate_dominant_layer({'uht_code': n['uht_code']})
            n_traits = calculate_active_traits(n['uht_code'])
            new_nodes.append({
                "id": n['uuid'],
                "name": n['name'],
                "type": "entity",
                "uht_code": n['uht_code'],
                "description": n.get('description'),
                "layer_dominance": n_layer,
                "trait_count": n_traits,
                "color": layer_colors.get(n_layer, '#757575'),
                "val": max(3, n_traits / 5),
                "image_url": n.get('image_url'),
                "is_center": False
            })

        # Build links from expansion source to new neighbors
        new_links = []
        for n in new_neighbors:
            new_links.append({
                "source": body.entity_uuid,
                "target": n['uuid'],
                "type": "entity_to_entity",
                "metric": body.metric,
                "similarity": round(n['final_similarity'], 4),
                "distance": 40
            })

        return {
            "new_nodes": new_nodes,
            "new_links": new_links,
            "expanded_from": body.entity_uuid,
            "count": len(new_nodes)
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to expand: {str(e)}")