#!/usr/bin/env python3
"""
Generate meta-classes (named archetypes) for frequently occurring hex pairs per layer.
Uses free OpenRouter LLM to generate names and descriptions.
"""

import asyncio
import json
import os
import sys
from datetime import datetime
from typing import Dict, List, Any
import httpx

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Configuration
THRESHOLD_PERCENT = 5.0  # Minimum frequency to qualify as meta-class
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_FORCE_MODEL", "meta-llama/llama-3.2-3b-instruct:free")

# Layer bit ranges
LAYER_BIT_RANGES = {
    "Physical": (1, 8),
    "Functional": (9, 16),
    "Abstract": (17, 24),
    "Social": (25, 32)
}


def load_traits() -> List[Dict[str, Any]]:
    """Load canonical traits from JSON file."""
    traits_path = "/root/project/uht-github/canonical_traits/traits_v2.json"
    with open(traits_path, "r") as f:
        data = json.load(f)
    return data["traits"]


def get_traits_for_layer(traits: List[Dict], layer: str) -> List[Dict]:
    """Get traits for a specific layer."""
    return [t for t in traits if t["layer"] == layer]


def hex_to_binary(hex_val: str) -> str:
    """Convert hex string to 8-bit binary."""
    return bin(int(hex_val, 16))[2:].zfill(8)


def get_active_traits_from_hex(hex_val: str, layer: str, traits: List[Dict]) -> List[Dict]:
    """Decode which traits are active based on hex value and layer."""
    binary = hex_to_binary(hex_val)
    layer_traits = get_traits_for_layer(traits, layer)

    active = []
    for i, bit in enumerate(binary):
        if bit == "1":
            # Bit index maps to trait within layer (0-7 -> first 8 traits of layer)
            trait = layer_traits[i] if i < len(layer_traits) else None
            if trait:
                active.append(trait)

    return active


def build_llm_prompt(layer: str, hex_val: str, binary: str,
                      active_traits: List[Dict], frequency: float) -> str:
    """Build the prompt for the LLM."""
    trait_lines = "\n".join([
        f"- Bit {t['bit']}: {t['name']} - {t['short_description']}"
        for t in active_traits
    ])

    return f"""You are analyzing a UHT (Universal Hex Taxonomy) trait pattern.

Layer: {layer}
Hex Value: {hex_val}
Binary: {binary}
Active Traits:
{trait_lines}

This pattern appears in {frequency:.1f}% of classified entities.

Generate:
1. A concise archetype NAME (2-4 words) that captures what kind of entity has this trait combination
2. A DESCRIPTION (1-2 sentences) explaining what this archetype represents

Format your response exactly like this:
NAME: <archetype name>
DESCRIPTION: <description>"""


async def call_llm(prompt: str, retries: int = 3) -> Dict[str, str]:
    """Call OpenRouter API to generate name and description with retry logic."""
    if not OPENROUTER_API_KEY:
        # Fallback for testing without API key
        return {
            "name": "Unnamed Archetype",
            "description": "Description pending LLM generation."
        }

    # Try multiple free models in order of preference
    models_to_try = [
        OPENROUTER_MODEL,
        "google/gemma-2-9b-it:free",
        "meta-llama/llama-3.2-3b-instruct:free",
        "mistralai/mistral-7b-instruct:free"
    ]

    async with httpx.AsyncClient() as client:
        for model in models_to_try:
            for attempt in range(retries):
                try:
                    response = await client.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                            "Content-Type": "application/json",
                            "HTTP-Referer": "https://universalhex.org",
                            "X-Title": "UHT Factory"
                        },
                        json={
                            "model": model,
                            "messages": [{"role": "user", "content": prompt}],
                            "temperature": 0.7,
                            "max_tokens": 200
                        },
                        timeout=60.0
                    )

                    if response.status_code == 200:
                        result = response.json()
                        content = result["choices"][0]["message"]["content"]

                        # Parse response
                        name = "Unnamed Archetype"
                        description = "Description not found."

                        for line in content.split("\n"):
                            line = line.strip()
                            if line.upper().startswith("NAME:"):
                                name = line[5:].strip()
                            elif line.upper().startswith("DESCRIPTION:"):
                                description = line[12:].strip()

                        if name != "Unnamed Archetype":
                            return {"name": name, "description": description}

                    elif response.status_code == 429:
                        # Rate limited - wait and retry
                        wait_time = (attempt + 1) * 5  # 5, 10, 15 seconds
                        print(f"    Rate limited, waiting {wait_time}s...")
                        await asyncio.sleep(wait_time)
                        continue
                    else:
                        print(f"    API error: {response.status_code}")

                except Exception as e:
                    print(f"    Request error: {e}")
                    await asyncio.sleep(2)

    return {
        "name": "Unnamed Archetype",
        "description": "LLM generation failed after retries."
    }


async def fetch_hex_pairs_from_api() -> Dict[str, Any]:
    """Fetch hex pair frequency data from the API."""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                "http://localhost:8100/api/v1/traits/statistics/hex-pairs",
                timeout=30.0
            )
            if response.status_code == 200:
                return response.json()
        except Exception as e:
            print(f"Could not fetch from API: {e}")

    # Fallback: query Neo4j directly
    from db.neo4j_client import Neo4jClient

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


async def fetch_cross_domain_from_neo4j(min_percent: float = 1.0) -> Dict[str, Any]:
    """Fetch cross-domain (full UHT code) frequency data."""
    from db.neo4j_client import Neo4jClient

    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )

    try:
        await neo4j.connect()
        return await neo4j.get_cross_domain_frequency(min_percent)
    finally:
        await neo4j.close()


def get_all_traits_from_uht_code(uht_code: str, traits: List[Dict]) -> Dict[str, List[Dict]]:
    """Decode all traits from a full 8-character UHT code."""
    layers = {
        "Physical": (0, 2, 1),      # start, end, bit_offset
        "Functional": (2, 4, 9),
        "Abstract": (4, 6, 17),
        "Social": (6, 8, 25)
    }

    result = {}
    for layer, (start, end, bit_offset) in layers.items():
        hex_val = uht_code[start:end].upper()
        binary = hex_to_binary(hex_val)

        layer_traits = get_traits_for_layer(traits, layer)
        active = []

        for i, bit in enumerate(binary):
            if bit == "1" and i < len(layer_traits):
                active.append(layer_traits[i])

        result[layer] = {
            "hex": hex_val,
            "binary": binary,
            "traits": active
        }

    return result


def build_cross_domain_prompt(uht_code: str, layer_data: Dict, frequency: float) -> str:
    """Build prompt for cross-domain meta-class."""
    trait_sections = []
    for layer in ["Physical", "Functional", "Abstract", "Social"]:
        data = layer_data[layer]
        if data["traits"]:
            trait_lines = [f"  - {t['name']}: {t['short_description']}" for t in data["traits"]]
            trait_sections.append(f"{layer} Layer ({data['hex']}):\n" + "\n".join(trait_lines))
        else:
            trait_sections.append(f"{layer} Layer ({data['hex']}): No traits active")

    return f"""You are analyzing a complete UHT (Universal Hex Taxonomy) cross-domain pattern.

Full UHT Code: {uht_code}
This pattern appears in {frequency:.1f}% of classified entities.

Active traits across all layers:
{chr(10).join(trait_sections)}

Generate:
1. A concise archetype NAME (2-4 words) that captures what kind of entity has this complete trait combination
2. A DESCRIPTION (1-2 sentences) explaining what this cross-domain archetype represents

Format your response exactly like this:
NAME: <archetype name>
DESCRIPTION: <description>"""


async def generate_meta_classes() -> Dict[str, Any]:
    """Generate all meta-classes."""
    print("Loading traits...")
    traits = load_traits()

    print("Fetching hex pair frequencies...")
    hex_data = await fetch_hex_pairs_from_api()

    if "error" in hex_data:
        print(f"Error fetching hex pairs: {hex_data['error']}")
        return {"error": hex_data["error"]}

    meta_classes = []

    for layer, layer_data in hex_data["layers"].items():
        print(f"\nProcessing {layer} layer...")
        pairs = layer_data.get("pairs", [])

        for pair in pairs:
            hex_val = pair["hex"]
            frequency = pair["percentage"]
            count = pair["count"]

            # Filter by threshold
            if frequency < THRESHOLD_PERCENT:
                continue

            print(f"  Generating meta-class for {layer} {hex_val} ({frequency:.1f}%)...")

            # Decode binary and active traits
            binary = hex_to_binary(hex_val)
            active_traits = get_active_traits_from_hex(hex_val, layer, traits)

            # Build prompt and call LLM
            prompt = build_llm_prompt(layer, hex_val, binary, active_traits, frequency)
            llm_result = await call_llm(prompt)

            meta_class = {
                "id": f"{layer.lower()}_{hex_val.lower()}",
                "layer": layer,
                "hex": hex_val,
                "binary": binary,
                "active_bits": [t["bit"] for t in active_traits],
                "trait_names": [t["name"] for t in active_traits],
                "name": llm_result["name"],
                "description": llm_result["description"],
                "frequency_percent": round(frequency, 2),
                "entity_count": count
            }

            meta_classes.append(meta_class)

            # Small delay to avoid rate limiting
            await asyncio.sleep(0.5)

    # Sort by frequency descending
    meta_classes.sort(key=lambda x: x["frequency_percent"], reverse=True)

    # Generate cross-domain meta-classes (full 32-bit patterns)
    print("\nFetching cross-domain patterns...")
    cross_domain_data = await fetch_cross_domain_from_neo4j(min_percent=1.0)
    cross_domain_classes = []

    if "patterns" in cross_domain_data:
        print(f"Found {len(cross_domain_data['patterns'])} cross-domain patterns above 1%")

        for pattern in cross_domain_data["patterns"][:20]:  # Top 20
            uht_code = pattern["uht_code"]
            frequency = pattern["percentage"]
            count = pattern["count"]

            print(f"  Generating cross-domain meta-class for {uht_code} ({frequency:.1f}%)...")

            # Get all traits
            layer_data = get_all_traits_from_uht_code(uht_code, traits)

            # Build prompt and call LLM
            prompt = build_cross_domain_prompt(uht_code, layer_data, frequency)
            llm_result = await call_llm(prompt)

            cross_domain_class = {
                "id": f"cross_{uht_code.lower()}",
                "uht_code": uht_code,
                "layers": {
                    "physical": {
                        "hex": layer_data["Physical"]["hex"],
                        "traits": [t["name"] for t in layer_data["Physical"]["traits"]]
                    },
                    "functional": {
                        "hex": layer_data["Functional"]["hex"],
                        "traits": [t["name"] for t in layer_data["Functional"]["traits"]]
                    },
                    "abstract": {
                        "hex": layer_data["Abstract"]["hex"],
                        "traits": [t["name"] for t in layer_data["Abstract"]["traits"]]
                    },
                    "social": {
                        "hex": layer_data["Social"]["hex"],
                        "traits": [t["name"] for t in layer_data["Social"]["traits"]]
                    }
                },
                "name": llm_result["name"],
                "description": llm_result["description"],
                "frequency_percent": round(frequency, 2),
                "entity_count": count
            }

            cross_domain_classes.append(cross_domain_class)
            await asyncio.sleep(0.5)

    result = {
        "version": "1.0",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "threshold_percent": THRESHOLD_PERCENT,
        "total_meta_classes": len(meta_classes),
        "meta_classes": meta_classes,
        "cross_domain": cross_domain_classes
    }

    return result


async def main():
    """Main entry point."""
    print("=" * 60)
    print("UHT Meta-Class Generator")
    print("=" * 60)

    if not OPENROUTER_API_KEY:
        print("\nWARNING: OPENROUTER_API_KEY not set. Using placeholder values.")
        print("Set the environment variable to generate real names/descriptions.")

    result = await generate_meta_classes()

    if "error" in result:
        print(f"\nFailed: {result['error']}")
        return

    # Save to file
    output_path = "/root/project/uht-factory/data/meta_classes.json"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\n{'=' * 60}")
    print(f"Generated {result['total_meta_classes']} meta-classes")
    print(f"Saved to: {output_path}")
    print("=" * 60)

    # Print summary
    print("\nMeta-Classes by Layer:")
    layer_counts = {}
    for mc in result["meta_classes"]:
        layer = mc["layer"]
        layer_counts[layer] = layer_counts.get(layer, 0) + 1

    for layer, count in sorted(layer_counts.items()):
        print(f"  {layer}: {count}")


if __name__ == "__main__":
    asyncio.run(main())
