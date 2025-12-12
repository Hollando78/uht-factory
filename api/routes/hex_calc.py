from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List, Optional
import os
import json
import re
import uuid
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

from pydantic import BaseModel
from workers.llm_client import LLMFactory, BaseLLMClient
from db.neo4j_client import Neo4jClient
from api.middleware.api_key_auth import optional_api_key_or_public
from api.middleware.jwt_auth import get_current_user

router = APIRouter()

class NameHexRequest(BaseModel):
    hex_code: str
    source_entity_uuids: Optional[List[str]] = None
    operation: Optional[str] = None  # XOR, AND, OR, ONE_HOT

class LayerInfo(BaseModel):
    hex: str
    active_count: int

class NameHexResponse(BaseModel):
    suggested_name: str
    suggested_description: str
    confidence: float
    active_traits: List[int]
    layer_summary: dict
    reasoning: str

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

def hex_to_binary(hex_code: str) -> str:
    """Convert 8-char hex to 32-char binary."""
    return bin(int(hex_code, 16))[2:].zfill(32)

def get_active_traits(hex_code: str) -> List[int]:
    """Get list of active trait bit positions (1-indexed)."""
    binary = hex_to_binary(hex_code)
    return [i + 1 for i, bit in enumerate(binary) if bit == '1']

def get_layer_summary(hex_code: str) -> dict:
    """Get layer breakdown for a hex code."""
    binary = hex_to_binary(hex_code)

    layers = {
        'Physical': {'hex': hex_code[0:2], 'active_count': sum(1 for b in binary[0:8] if b == '1')},
        'Functional': {'hex': hex_code[2:4], 'active_count': sum(1 for b in binary[8:16] if b == '1')},
        'Abstract': {'hex': hex_code[4:6], 'active_count': sum(1 for b in binary[16:24] if b == '1')},
        'Social': {'hex': hex_code[6:8], 'active_count': sum(1 for b in binary[24:32] if b == '1')}
    }
    return layers

# Canonical trait definitions (v2)
TRAITS = [
    (1, "Physical", "Physical Object", "A discrete, bounded physical entity"),
    (2, "Physical", "Synthetic", "Created or manufactured by humans"),
    (3, "Physical", "Biological/Biomimetic", "Has biological origin or structure inspired by biology"),
    (4, "Physical", "Powered", "Requires or uses external energy source"),
    (5, "Physical", "Structural", "Serves a load-bearing or structural function"),
    (6, "Physical", "Observable", "Detectable by human senses or instruments"),
    (7, "Physical", "Physical Medium", "Composed of physical matter"),
    (8, "Physical", "Active", "Exhibits autonomous behavior or initiates actions"),
    (9, "Functional", "Intentionally Designed", "Designed or intended for a specific function"),
    (10, "Functional", "Outputs Effect", "Produces a physical, sensory, or digital effect"),
    (11, "Functional", "Processes Signals/Logic", "Handles, transforms, or responds to signals or logic"),
    (12, "Functional", "State-Transforming", "Changes states of materials, systems, or environments"),
    (13, "Functional", "Human-Interactive", "Intended for direct human interaction"),
    (14, "Functional", "System-integrated", "Part of a larger system or network"),
    (15, "Functional", "Functionally Autonomous", "Operates independently without constant input"),
    (16, "Functional", "System-Essential", "Critical to a system's operation"),
    (17, "Abstract", "Symbolic", "Carries meaning beyond its physical form"),
    (18, "Abstract", "Signalling", "Communicates information or intent"),
    (19, "Abstract", "Rule-governed", "Follows explicit rules or protocols"),
    (20, "Abstract", "Compositional", "Built from smaller meaningful units"),
    (21, "Abstract", "Normative", "Relates to standards, norms, or expectations"),
    (22, "Abstract", "Meta", "About or referring to itself or its category"),
    (23, "Abstract", "Temporal", "Has time-based significance or constraints"),
    (24, "Abstract", "Digital/Virtual", "Exists in digital or virtual form"),
    (25, "Social", "Social Construct", "Exists primarily through social agreement"),
    (26, "Social", "Institutionally Defined", "Defined by formal institutions"),
    (27, "Social", "Identity-Linked", "Connected to personal or group identity"),
    (28, "Social", "Regulated", "Subject to formal rules or regulations"),
    (29, "Social", "Economically Significant", "Has economic value or impact"),
    (30, "Social", "Politicised", "Subject to political discourse or power"),
    (31, "Social", "Ritualised", "Part of ritualized or ceremonial practice"),
    (32, "Social", "Ethically Significant", "Carries ethical or moral weight")
]

@router.post("/name", response_model=NameHexResponse)
async def name_hex_code(
    request: NameHexRequest,
    llm_client: BaseLLMClient = Depends(get_llm_client),
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
    auth_data: dict = Depends(optional_api_key_or_public)
):
    """
    Generate a creative name and description for a computed hex code.

    **Public access allowed** - rate limited to 100 requests/hour per IP.
    """
    hex_code = request.hex_code.upper()

    # Validate hex code
    if len(hex_code) != 8 or not all(c in '0123456789ABCDEF' for c in hex_code):
        raise HTTPException(status_code=400, detail="Invalid hex code format")

    active_traits = get_active_traits(hex_code)
    layer_summary = get_layer_summary(hex_code)

    # Get trait names for active bits
    active_trait_names = []
    for bit in active_traits:
        for trait in TRAITS:
            if trait[0] == bit:
                active_trait_names.append(f"Bit {bit}: {trait[2]} ({trait[1]})")
                break

    # Get source entity names if provided
    source_names = []
    if request.source_entity_uuids:
        try:
            for uuid in request.source_entity_uuids[:10]:  # Limit to 10 for context
                query = "MATCH (e:Entity {uuid: $uuid}) RETURN e.name as name"
                result = await neo4j_client.execute_query(query, uuid=uuid)
                if result and len(result) > 0:
                    source_names.append(result[0]['name'])
        except Exception as e:
            pass  # Continue without source names

    # Build operation-aware context
    operation = request.operation or "XOR"

    # Explain what the result represents based on operation
    if operation == "ONE_HOT":
        operation_context = f"""This hex code represents DIFFERENTIATING TRAITS - traits that are UNIQUE to exactly one entity.
These are the traits that distinguish individual entities from the group.
Source entities compared: {', '.join(source_names) if source_names else 'Unknown'}

IMPORTANT: Name the RESULT CODE based on its {len(active_traits)} active traits below, NOT the source entities.
The name should capture what makes something uniquely different or distinguishing."""
    elif operation == "AND":
        operation_context = f"""This hex code represents COMMON TRAITS - traits shared by ALL entities.
These are the universal characteristics that unite the group.
Source entities compared: {', '.join(source_names) if source_names else 'Unknown'}

IMPORTANT: Name the RESULT CODE based on its {len(active_traits)} active traits below, NOT the source entities.
The name should capture what these entities fundamentally share."""
    elif operation == "OR":
        operation_context = f"""This hex code represents the UNION - all traits present in ANY entity.
This is the combined trait space of the group.
Source entities compared: {', '.join(source_names) if source_names else 'Unknown'}

IMPORTANT: Name the RESULT CODE based on its {len(active_traits)} active traits below, NOT the source entities.
The name should capture the full scope of characteristics."""
    else:  # XOR
        operation_context = f"""This hex code represents DIFFERENCES via XOR - traits where an odd number of entities have them.
Source entities compared: {', '.join(source_names) if source_names else 'Unknown'}

IMPORTANT: Name the RESULT CODE based on its {len(active_traits)} active traits below, NOT the source entities."""

    prompt = f"""You are a creative entity naming specialist for a Universal Hex Taxonomy (UHT) classification system.

{operation_context}

Hex Code: {hex_code}
Total Active Traits: {len(active_traits)} of 32

THE TRAITS TO NAME (these are what appear in the result):
{chr(10).join(active_trait_names)}

Layer Distribution:
- Physical ({layer_summary['Physical']['hex']}): {layer_summary['Physical']['active_count']}/8 bits
- Functional ({layer_summary['Functional']['hex']}): {layer_summary['Functional']['active_count']}/8 bits
- Abstract ({layer_summary['Abstract']['hex']}): {layer_summary['Abstract']['active_count']}/8 bits
- Social ({layer_summary['Social']['hex']}): {layer_summary['Social']['active_count']}/8 bits

Generate a creative name for an entity/concept that has EXACTLY these {len(active_traits)} traits listed above.
DO NOT name after the source entities - name based on what the RESULT traits represent.

The name should be:
1. Creative and memorable (1-4 words)
2. Capture the essence of these specific traits
3. Reflect what kind of entity would have this exact trait combination

Respond with valid JSON:
{{
    "suggested_name": "Creative Name for These Traits",
    "suggested_description": "2-3 sentences describing what entity/concept would have exactly these traits.",
    "confidence": 0.85,
    "reasoning": "Why this name fits these specific traits"
}}"""

    try:
        response = await llm_client.get_completion(prompt=prompt, temperature=0.7)

        # Parse response
        try:
            result = json.loads(response)
        except json.JSONDecodeError:
            # Extract JSON from markdown code blocks or raw text
            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response, re.DOTALL)
            if json_match:
                try:
                    result = json.loads(json_match.group())
                except json.JSONDecodeError:
                    result = None
            else:
                result = None

        if not result:
            # Fallback
            result = {
                "suggested_name": f"Entity-{hex_code[:4]}",
                "suggested_description": f"A computed entity with {len(active_traits)} active traits.",
                "confidence": 0.3,
                "reasoning": "AI naming failed, using fallback."
            }

        return NameHexResponse(
            suggested_name=result.get("suggested_name", f"Entity-{hex_code[:4]}"),
            suggested_description=result.get("suggested_description", ""),
            confidence=result.get("confidence", 0.5),
            active_traits=active_traits,
            layer_summary=layer_summary,
            reasoning=result.get("reasoning", "")
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Naming failed: {str(e)}")


# ============================================================================
# Analysis Endpoint - LLM explains shared/cancelled traits
# ============================================================================

class AnalyzeRequest(BaseModel):
    hex_code: str
    source_entity_uuids: List[str]

class TraitAnalysis(BaseModel):
    bit: int
    name: str
    layer: str
    status: str  # 'shared', 'cancelled', 'unique', 'absent'
    explanation: str

class AnalyzeResponse(BaseModel):
    hex_code: str
    shared_traits: List[TraitAnalysis]
    cancelled_traits: List[TraitAnalysis]
    unique_traits: List[TraitAnalysis]
    overall_interpretation: str

@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_calculation(
    request: AnalyzeRequest,
    llm_client: BaseLLMClient = Depends(get_llm_client),
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
    auth_data: dict = Depends(optional_api_key_or_public)
):
    """
    Analyze a hex calculation with LLM explanations for trait changes.

    **Public access allowed** - rate limited to 100 requests/hour per IP.
    """
    hex_code = request.hex_code.upper()

    if len(hex_code) != 8 or not all(c in '0123456789ABCDEF' for c in hex_code):
        raise HTTPException(status_code=400, detail="Invalid hex code format")

    # Get source entity data (no limit - need all entities for accurate analysis)
    source_entities = []
    for uuid_str in request.source_entity_uuids:
        query = "MATCH (e:Entity {uuid: $uuid}) RETURN e.name as name, e.uht_code as uht_code"
        result = await neo4j_client.execute_query(query, uuid=uuid_str)
        if result and len(result) > 0:
            source_entities.append({
                'name': result[0]['name'],
                'uht_code': result[0]['uht_code'],
                'binary': hex_to_binary(result[0]['uht_code'])
            })

    if len(source_entities) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 valid source entities")

    # Analyze each trait
    result_binary = hex_to_binary(hex_code)
    logger.info(f"Analyzing hex {hex_code} = binary {result_binary}")
    logger.info(f"Source entities: {[(e['name'], e['uht_code']) for e in source_entities]}")

    shared_traits = []
    cancelled_traits = []
    unique_traits = []

    trait_summaries = []

    for bit in range(1, 33):
        idx = bit - 1
        result_val = result_binary[idx] == '1'
        operand_vals = [e['binary'][idx] == '1' for e in source_entities]
        on_count = sum(operand_vals)

        # Get trait info
        trait_info = next((t for t in TRAITS if t[0] == bit), None)
        trait_name = trait_info[2] if trait_info else f"Trait {bit}"
        trait_layer = trait_info[1] if trait_info else "Unknown"

        # Determine status
        # Skip traits that are absent from BOTH inputs AND result
        if on_count == 0 and not result_val:
            continue
        elif on_count == 0 and result_val:
            # Edge case: trait in result but no source has it (shouldn't happen, but handle it)
            status = 'unique'
        elif on_count == len(source_entities):
            status = 'shared' if result_val else 'cancelled'
        elif result_val:
            status = 'unique'
        else:
            status = 'cancelled'

        # Build summary for LLM
        entities_with = [e['name'] for e, v in zip(source_entities, operand_vals) if v]
        entities_without = [e['name'] for e, v in zip(source_entities, operand_vals) if not v]

        trait_summaries.append({
            'bit': bit,
            'name': trait_name,
            'layer': trait_layer,
            'status': status,
            'entities_with': entities_with,
            'entities_without': entities_without,
            'result': result_val
        })

    # Build LLM prompt for explanations
    entity_names = [e['name'] for e in source_entities]
    num_entities = len(source_entities)

    # Separate traits by status for clearer prompting
    prompt_shared = [t for t in trait_summaries if t['status'] == 'shared']
    prompt_cancelled = [t for t in trait_summaries if t['status'] == 'cancelled']
    prompt_unique = [t for t in trait_summaries if t['status'] == 'unique']

    logger.info(f"Trait analysis - shared: {[t['bit'] for t in prompt_shared]}, cancelled: {[t['bit'] for t in prompt_cancelled]}, unique: {[t['bit'] for t in prompt_unique]}")

    # Build list of all bit numbers that need explanations
    all_bits_needing_explanation = [str(t['bit']) for t in prompt_shared + prompt_cancelled + prompt_unique]

    # Build semantics explanation based on the actual result (operation-agnostic)
    operation_semantics = f"""ANALYSIS SEMANTICS ({num_entities} entities):
- "shared" traits = ALL entities have this trait AND it appears in the result.
- "cancelled" traits = Some/all entities have this trait BUT it does NOT appear in result (filtered out by the operation).
- "unique" traits = Only SOME entities have this trait AND it appears in the result (differentiating traits)."""

    # Build trait sections
    trait_sections = ""

    if prompt_shared:
        trait_sections += f"""
UNIVERSALLY SHARED TRAITS (ALL {num_entities} entities have these - explain WHY they ALL share each trait):
{json.dumps(prompt_shared, indent=2)}
"""

    if prompt_cancelled:
        trait_sections += f"""
CANCELLED TRAITS (even count of entities share these - explain the commonality):
{json.dumps(prompt_cancelled, indent=2)}
"""

    if prompt_unique:
        trait_sections += f"""
DIFFERENTIATING TRAITS (odd count, not all - explain why only some entities have each trait):
{json.dumps(prompt_unique, indent=2)}
"""

    prompt = f"""You are an expert in the Universal Hex Taxonomy (UHT) classification system.

Analyzing combination of: {', '.join(entity_names)}
Result: {hex_code}

{operation_semantics}
{trait_sections}
CRITICAL: You MUST provide an explanation for EVERY SINGLE trait listed above.
The bit numbers requiring explanations are: {', '.join(all_bits_needing_explanation) if all_bits_needing_explanation else 'none'}

For SHARED traits: Explain WHY all entities share this fundamental characteristic.
For CANCELLED traits: Explain the commonality between the entities that have this trait.
For DIFFERENTIATING traits: Explain why only some entities have this trait.

Respond with valid JSON. Your trait_explanations object MUST have exactly these keys: {', '.join(all_bits_needing_explanation) if all_bits_needing_explanation else 'none'}
{{
    "trait_explanations": {{
        "1": "All share this because...",
        "17": "Both X and Y share this because...",
        ... (MUST include ALL of: {', '.join(all_bits_needing_explanation) if all_bits_needing_explanation else 'none'})
    }},
    "overall_interpretation": "2-3 sentences: What do they share? What makes them different?"
}}"""

    try:
        response = await llm_client.get_completion(prompt=prompt, temperature=0.5)

        # Parse response
        try:
            llm_result = json.loads(response)
        except json.JSONDecodeError:
            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response, re.DOTALL)
            if json_match:
                try:
                    llm_result = json.loads(json_match.group())
                except:
                    llm_result = {}
            else:
                llm_result = {}

        explanations = llm_result.get('trait_explanations', {})
        overall = llm_result.get('overall_interpretation', 'Analysis pending')

        # Build response
        for ts in trait_summaries:
            # Better fallback based on status
            fallback = f"Present in: {', '.join(ts['entities_with'])}"
            if ts['status'] == 'shared':
                fallback = f"All entities ({', '.join(ts['entities_with'])}) share this fundamental trait."
            elif ts['status'] == 'cancelled':
                fallback = f"Shared by {', '.join(ts['entities_with'])} (cancelled in XOR result)."
            elif ts['status'] == 'unique':
                fallback = f"Only {', '.join(ts['entities_with'])} has this trait."

            analysis = TraitAnalysis(
                bit=ts['bit'],
                name=ts['name'],
                layer=ts['layer'],
                status=ts['status'],
                explanation=explanations.get(str(ts['bit']), fallback)
            )
            if ts['status'] == 'shared':
                shared_traits.append(analysis)
            elif ts['status'] == 'cancelled':
                cancelled_traits.append(analysis)
            else:
                unique_traits.append(analysis)

        return AnalyzeResponse(
            hex_code=hex_code,
            shared_traits=shared_traits,
            cancelled_traits=cancelled_traits,
            unique_traits=unique_traits,
            overall_interpretation=overall
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


# ============================================================================
# Saved Calculations
# ============================================================================

class SaveCalculationRequest(BaseModel):
    name: str
    description: Optional[str] = None
    hex_code: str
    source_entity_uuids: List[str]
    # Optional: AI-generated name/description from "Name Result"
    accepted_name: Optional[str] = None
    accepted_description: Optional[str] = None
    # Optional: LLM analysis data (stored as JSON string)
    llm_analysis: Optional[str] = None
    # Optional: Database matches (stored as JSON string)
    database_matches: Optional[str] = None

class SavedCalculation(BaseModel):
    id: str
    name: str
    description: Optional[str]
    hex_code: str
    source_entity_uuids: List[str]
    source_entity_names: List[str]
    created_at: str
    user_id: str
    # AI-generated name/description
    accepted_name: Optional[str] = None
    accepted_description: Optional[str] = None
    # LLM analysis data (JSON string)
    llm_analysis: Optional[str] = None
    # Database matches (JSON string)
    database_matches: Optional[str] = None

class SavedCalculationsResponse(BaseModel):
    calculations: List[SavedCalculation]
    total: int

@router.post("/calculations", response_model=SavedCalculation)
async def save_calculation(
    request: SaveCalculationRequest,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
    current_user: dict = Depends(get_current_user)
):
    """
    Save a hex calculation for later reference.

    **Requires authentication.**
    """
    user_id = current_user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")

    hex_code = request.hex_code.upper()
    if len(hex_code) != 8 or not all(c in '0123456789ABCDEF' for c in hex_code):
        raise HTTPException(status_code=400, detail="Invalid hex code format")

    # Get source entity names
    source_names = []
    for entity_uuid in request.source_entity_uuids:
        query = "MATCH (e:Entity {uuid: $uuid}) RETURN e.name as name"
        result = await neo4j_client.execute_query(query, uuid=entity_uuid)
        if result and len(result) > 0:
            source_names.append(result[0]['name'])
        else:
            source_names.append("Unknown")

    # Create calculation node
    calc_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()

    query = """
    CREATE (c:HexCalculation {
        id: $id,
        name: $name,
        description: $description,
        hex_code: $hex_code,
        source_entity_uuids: $source_entity_uuids,
        source_entity_names: $source_entity_names,
        created_at: $created_at,
        user_id: $user_id,
        accepted_name: $accepted_name,
        accepted_description: $accepted_description,
        llm_analysis: $llm_analysis,
        database_matches: $database_matches
    })
    RETURN c
    """

    await neo4j_client.execute_query(
        query,
        id=calc_id,
        name=request.name,
        description=request.description or "",
        hex_code=hex_code,
        source_entity_uuids=request.source_entity_uuids,
        source_entity_names=source_names,
        created_at=created_at,
        user_id=user_id,
        accepted_name=request.accepted_name or "",
        accepted_description=request.accepted_description or "",
        llm_analysis=request.llm_analysis or "",
        database_matches=request.database_matches or ""
    )

    return SavedCalculation(
        id=calc_id,
        name=request.name,
        description=request.description,
        hex_code=hex_code,
        source_entity_uuids=request.source_entity_uuids,
        source_entity_names=source_names,
        created_at=created_at,
        user_id=user_id,
        accepted_name=request.accepted_name,
        accepted_description=request.accepted_description,
        llm_analysis=request.llm_analysis,
        database_matches=request.database_matches
    )

@router.get("/calculations", response_model=SavedCalculationsResponse)
async def list_calculations(
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
    current_user: dict = Depends(get_current_user)
):
    """
    List saved calculations for the current user.

    **Requires authentication.**
    """
    user_id = current_user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")

    query = """
    MATCH (c:HexCalculation {user_id: $user_id})
    RETURN c.id as id, c.name as name, c.description as description,
           c.hex_code as hex_code, c.source_entity_uuids as source_entity_uuids,
           c.source_entity_names as source_entity_names, c.created_at as created_at,
           c.user_id as user_id, c.accepted_name as accepted_name,
           c.accepted_description as accepted_description, c.llm_analysis as llm_analysis,
           c.database_matches as database_matches
    ORDER BY c.created_at DESC
    """

    results = await neo4j_client.execute_query(query, user_id=user_id)

    calculations = [
        SavedCalculation(
            id=r['id'],
            name=r['name'],
            description=r['description'] or None,
            hex_code=r['hex_code'],
            source_entity_uuids=r['source_entity_uuids'],
            source_entity_names=r['source_entity_names'],
            created_at=r['created_at'],
            user_id=r['user_id'],
            accepted_name=r['accepted_name'] or None,
            accepted_description=r['accepted_description'] or None,
            llm_analysis=r['llm_analysis'] or None,
            database_matches=r['database_matches'] or None
        )
        for r in results
    ]

    return SavedCalculationsResponse(calculations=calculations, total=len(calculations))

@router.delete("/calculations/{calc_id}")
async def delete_calculation(
    calc_id: str,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
    current_user: dict = Depends(get_current_user)
):
    """
    Delete a saved calculation.

    **Requires authentication.**
    """
    user_id = current_user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")

    # Verify ownership and delete
    query = """
    MATCH (c:HexCalculation {id: $calc_id, user_id: $user_id})
    DELETE c
    RETURN count(c) as deleted
    """

    result = await neo4j_client.execute_query(query, calc_id=calc_id, user_id=user_id)

    if not result or result[0]['deleted'] == 0:
        raise HTTPException(status_code=404, detail="Calculation not found")

    return {"message": "Calculation deleted", "id": calc_id}


class UpdateCalculationRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    accepted_name: Optional[str] = None
    accepted_description: Optional[str] = None
    llm_analysis: Optional[str] = None
    database_matches: Optional[str] = None


@router.put("/calculations/{calc_id}", response_model=SavedCalculation)
async def update_calculation(
    calc_id: str,
    request: UpdateCalculationRequest,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
    current_user: dict = Depends(get_current_user)
):
    """
    Update an existing saved calculation (name, description, analysis data).

    **Requires authentication.**
    """
    user_id = current_user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")

    # Build dynamic SET clause for non-null fields
    set_clauses = []
    params = {"calc_id": calc_id, "user_id": user_id}

    if request.name is not None:
        set_clauses.append("c.name = $name")
        params["name"] = request.name
    if request.description is not None:
        set_clauses.append("c.description = $description")
        params["description"] = request.description
    if request.accepted_name is not None:
        set_clauses.append("c.accepted_name = $accepted_name")
        params["accepted_name"] = request.accepted_name
    if request.accepted_description is not None:
        set_clauses.append("c.accepted_description = $accepted_description")
        params["accepted_description"] = request.accepted_description
    if request.llm_analysis is not None:
        set_clauses.append("c.llm_analysis = $llm_analysis")
        params["llm_analysis"] = request.llm_analysis
    if request.database_matches is not None:
        set_clauses.append("c.database_matches = $database_matches")
        params["database_matches"] = request.database_matches

    if not set_clauses:
        raise HTTPException(status_code=400, detail="No fields to update")

    query = f"""
    MATCH (c:HexCalculation {{id: $calc_id, user_id: $user_id}})
    SET {', '.join(set_clauses)}
    RETURN c.id as id, c.name as name, c.description as description,
           c.hex_code as hex_code, c.source_entity_uuids as source_entity_uuids,
           c.source_entity_names as source_entity_names, c.created_at as created_at,
           c.user_id as user_id, c.accepted_name as accepted_name,
           c.accepted_description as accepted_description, c.llm_analysis as llm_analysis,
           c.database_matches as database_matches
    """

    results = await neo4j_client.execute_query(query, **params)

    if not results:
        raise HTTPException(status_code=404, detail="Calculation not found")

    r = results[0]
    return SavedCalculation(
        id=r['id'],
        name=r['name'],
        description=r['description'] or None,
        hex_code=r['hex_code'],
        source_entity_uuids=r['source_entity_uuids'],
        source_entity_names=r['source_entity_names'],
        created_at=r['created_at'],
        user_id=r['user_id'],
        accepted_name=r['accepted_name'] or None,
        accepted_description=r['accepted_description'] or None,
        llm_analysis=r['llm_analysis'] or None,
        database_matches=r['database_matches'] or None
    )


# ============================================================================
# Add calculation to collection
# ============================================================================

class AddToCollectionRequest(BaseModel):
    collection_id: str
    calculation_id: str

@router.post("/calculations/{calc_id}/add-to-collection")
async def add_calculation_to_collection(
    calc_id: str,
    collection_id: str,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
    current_user: dict = Depends(get_current_user)
):
    """
    Add a saved calculation's result to a collection (as a virtual entity reference).

    **Requires authentication.**
    """
    user_id = current_user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")

    # Get calculation
    calc_query = """
    MATCH (c:HexCalculation {id: $calc_id, user_id: $user_id})
    RETURN c.hex_code as hex_code, c.name as name
    """
    calc_result = await neo4j_client.execute_query(calc_query, calc_id=calc_id, user_id=user_id)

    if not calc_result:
        raise HTTPException(status_code=404, detail="Calculation not found")

    # Verify collection ownership
    coll_query = """
    MATCH (col:Collection {id: $coll_id, user_id: $user_id})
    RETURN col
    """
    coll_result = await neo4j_client.execute_query(coll_query, coll_id=collection_id, user_id=user_id)

    if not coll_result:
        raise HTTPException(status_code=404, detail="Collection not found")

    # Create relationship
    link_query = """
    MATCH (c:HexCalculation {id: $calc_id})
    MATCH (col:Collection {id: $coll_id})
    MERGE (col)-[r:CONTAINS_CALCULATION]->(c)
    SET r.added_at = $added_at
    RETURN r
    """

    await neo4j_client.execute_query(
        link_query,
        calc_id=calc_id,
        coll_id=collection_id,
        added_at=datetime.utcnow().isoformat()
    )

    return {
        "message": "Calculation added to collection",
        "calculation_id": calc_id,
        "collection_id": collection_id
    }
