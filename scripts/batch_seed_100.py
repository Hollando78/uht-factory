#!/usr/bin/env python3
"""
Batch classification of 100 curated entities.
Full pipeline: Duplicate Check → AI Enhancement → Classification

Usage:
    python scripts/batch_seed_100.py
"""

import asyncio
import httpx
import json
import sys
from datetime import datetime

API_BASE = "http://localhost:8100/api/v1"

# 100 Curated Entities with meaningful descriptions
ENTITIES = {
    # Physical Objects (25)
    "Hammer": "A hand tool with a heavy head attached to a handle, used for driving nails or breaking objects",
    "Violin": "A wooden string instrument played with a bow, central to classical and folk music",
    "Bicycle": "A two-wheeled vehicle propelled by pedaling, used for transportation and recreation",
    "Telescope": "An optical instrument that magnifies distant objects, used in astronomy",
    "Candle": "A cylinder of wax with a wick that produces light when burned",
    "Bridge": "A structure built to span physical obstacles like water or roads, allowing passage",
    "Diamond": "A precious gemstone made of crystallized carbon, the hardest natural material",
    "Sword": "A bladed weapon with a long metal blade and hilt, used historically in combat",
    "Clock": "A device that measures and displays time using mechanical or electronic means",
    "Mirror": "A reflective surface that forms images by reflecting light",
    "Lighthouse": "A tower with a powerful light that guides ships and warns of hazards",
    "Umbrella": "A collapsible canopy on a central rod that protects from rain or sun",
    "Compass": "A navigational instrument that indicates direction relative to magnetic north",
    "Pottery": "Objects made from clay that are shaped and hardened by heat",
    "Windmill": "A structure that converts wind energy into rotational motion for grinding or pumping",
    "Glacier": "A massive body of ice that forms from accumulated snow and slowly moves",
    "Volcano": "A rupture in Earth's crust where molten rock and gases escape from below",
    "Coral Reef": "An underwater ecosystem formed by calcium carbonate structures secreted by corals",
    "Meteorite": "A solid piece of debris from outer space that survives passage through atmosphere",
    "Fossil": "Preserved remains or traces of ancient organisms found in rock",
    "Cathedral": "A large and important Christian church, typically the seat of a bishop",
    "Submarine": "A watercraft capable of independent underwater operation",
    "Satellite": "An artificial object placed in orbit around Earth for communication or observation",
    "3D Printer": "A machine that creates three-dimensional objects by depositing material layer by layer",
    "Solar Panel": "A device that converts sunlight directly into electricity using photovoltaic cells",

    # Living Things (20)
    "Octopus": "A soft-bodied eight-armed cephalopod known for intelligence and camouflage abilities",
    "Redwood Tree": "A massive coniferous tree species, among the tallest and oldest living organisms",
    "Honeybee": "A social insect that produces honey and plays a crucial role in pollination",
    "Mushroom": "The spore-bearing fruiting body of a fungus, typically found above ground",
    "Coral": "Marine invertebrates that secrete calcium carbonate to form hard skeletons",
    "Elephant": "The largest living land animal, known for intelligence and complex social behavior",
    "Venus Flytrap": "A carnivorous plant that captures and digests insects with hinged leaves",
    "Tardigrade": "A microscopic animal known for surviving extreme conditions including space vacuum",
    "Dolphin": "A highly intelligent marine mammal known for social behavior and echolocation",
    "Orchid": "A diverse family of flowering plants known for complex and beautiful blooms",
    "Bacteria": "Single-celled microorganisms found everywhere, some beneficial and some pathogenic",
    "Blue Whale": "The largest animal ever known to exist, a marine mammal reaching 100 feet",
    "Hummingbird": "A tiny bird capable of hovering flight and flying backwards",
    "Slime Mold": "A single-celled organism that can form large aggregates and solve mazes",
    "Sequoia": "A genus of giant trees including some of the most massive organisms on Earth",
    "Axolotl": "A salamander that retains larval features and can regenerate body parts",
    "Bonsai Tree": "A tree cultivated in miniature form through careful pruning and training",
    "Komodo Dragon": "The largest living lizard species, a powerful predator from Indonesia",
    "Jellyfish": "A free-swimming marine animal with a gelatinous umbrella-shaped bell",
    "Lichen": "A composite organism arising from symbiosis between fungi and algae",

    # Abstract Concepts (20)
    "Democracy": "A system of government where citizens exercise power through voting and participation",
    "Entropy": "A measure of disorder or randomness in a system, central to thermodynamics",
    "Nostalgia": "A sentimental longing for the past, often idealized in memory",
    "Justice": "The concept of moral rightness and fair treatment according to law or ethics",
    "Infinity": "A concept representing something without any bound or larger than any number",
    "Consciousness": "The state of being aware of and able to think about one's own existence",
    "Time": "The indefinite continued progress of existence and events from past through future",
    "Love": "A deep affection or attachment to another person, idea, or thing",
    "Chaos Theory": "The study of systems highly sensitive to initial conditions, producing unpredictable results",
    "Karma": "The principle that actions influence future circumstances, central to Eastern philosophy",
    "Paradox": "A statement or situation that seems contradictory but may reveal a deeper truth",
    "Intuition": "The ability to understand something immediately without conscious reasoning",
    "Free Will": "The power to make choices that are not determined by prior causes or divine will",
    "Beauty": "A quality that gives pleasure to the senses or exalts the mind",
    "Truth": "The quality of being in accordance with fact or reality",
    "Morality": "Principles concerning the distinction between right and wrong behavior",
    "Dreams": "Sequences of images and sensations occurring involuntarily during sleep",
    "Gravity": "The force of attraction between objects with mass, governing planetary motion",
    "Evolution": "The process of change in living organisms over generations through natural selection",
    "Imagination": "The faculty of forming new ideas or images not present to the senses",

    # Social Constructs (20)
    "Money": "A medium of exchange that facilitates trade and represents stored value",
    "Marriage": "A legally or socially recognized union between partners establishing rights and obligations",
    "University": "An institution of higher education offering degrees and conducting research",
    "Religion": "A system of beliefs and practices relating to the sacred and ultimate meaning",
    "Government": "The system by which a state or community is controlled and organized",
    "Language": "A structured system of communication using words, gestures, or symbols",
    "Corporation": "A legal entity separate from its owners that can conduct business",
    "Copyright": "Legal protection granting exclusive rights to creators of original works",
    "Citizenship": "The status of belonging to a nation with associated rights and duties",
    "Tradition": "Customs or beliefs passed down through generations within a culture",
    "Social Media": "Online platforms enabling users to create and share content and network",
    "Museum": "An institution that preserves and displays objects of cultural or scientific importance",
    "Olympics": "An international multi-sport event held every four years featuring world athletes",
    "Stock Market": "A marketplace where shares of publicly traded companies are bought and sold",
    "Jury": "A group of citizens sworn to deliver a verdict in a legal case",
    "Newspaper": "A periodical publication containing news, opinion, and advertising",
    "Hospital": "An institution providing medical treatment and nursing care for the sick",
    "Orchestra": "A large ensemble of musicians playing various instruments together",
    "Parliament": "A legislative body of government that makes and passes laws",
    "Library": "A collection of books and resources organized for reading and research",

    # Technologies (15)
    "Blockchain": "A distributed ledger technology recording transactions across many computers",
    "Artificial Intelligence": "Computer systems able to perform tasks normally requiring human intelligence",
    "Internet": "A global network connecting millions of computers enabling communication and data sharing",
    "Nuclear Reactor": "A device that initiates and controls sustained nuclear fission reactions",
    "CRISPR": "A gene-editing technology allowing precise modifications to DNA sequences",
    "Smartphone": "A mobile device combining phone, computer, and camera capabilities",
    "GPS": "A satellite-based navigation system providing location and time information globally",
    "MRI Scanner": "A medical imaging device using magnetic fields to visualize internal body structures",
    "Electric Vehicle": "A vehicle propelled by electric motors using energy stored in batteries",
    "Quantum Computer": "A computer using quantum mechanics principles to process information",
    "Search Engine": "A software system that searches and retrieves information from the internet",
    "Video Game": "An electronic game involving interaction with a user interface to generate visual feedback",
    "Cryptocurrency": "A digital currency using cryptography for security, operating independently of banks",
    "Drone": "An unmanned aerial vehicle controlled remotely or autonomously",
    "Virtual Reality": "A simulated three-dimensional environment that can be interacted with",
}


async def check_duplicate(client: httpx.AsyncClient, name: str) -> dict:
    """Check if entity already exists in the database"""
    try:
        response = await client.post(
            f"{API_BASE}/preprocess/duplicate-check",
            params={"entity_name": name},
            timeout=30.0
        )
        if response.status_code == 200:
            return response.json()
        return {"exists": False, "error": f"HTTP {response.status_code}"}
    except Exception as e:
        return {"exists": False, "error": str(e)}


async def enhance_entity(client: httpx.AsyncClient, name: str, fallback_desc: str) -> dict:
    """AI-enhance entity name and generate description"""
    try:
        response = await client.post(
            f"{API_BASE}/preprocess/preprocess",
            params={"entity_name": name},
            timeout=60.0
        )
        if response.status_code == 200:
            return response.json()
        # Fallback to our curated description
        return {
            "suggested_name": name,
            "suggested_description": fallback_desc,
            "error": f"HTTP {response.status_code}"
        }
    except Exception as e:
        return {
            "suggested_name": name,
            "suggested_description": fallback_desc,
            "error": str(e)
        }


async def classify_batch(client: httpx.AsyncClient, entities: list) -> dict:
    """Classify a batch of entities"""
    try:
        response = await client.post(
            f"{API_BASE}/classify/batch",
            json={
                "entities": entities,
                "use_cache": True,
                "parallel_workers": 8
            },
            timeout=600.0  # 10 minutes for large batch
        )
        if response.status_code == 200:
            return response.json()
        return {"error": f"HTTP {response.status_code}", "successful": 0, "failed": len(entities)}
    except Exception as e:
        return {"error": str(e), "successful": 0, "failed": len(entities)}


async def main():
    print("=" * 70)
    print("UHT FACTORY - BATCH CLASSIFICATION")
    print(f"Starting batch classification of {len(ENTITIES)} entities")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)
    print()

    # Check API health first
    async with httpx.AsyncClient() as client:
        try:
            health = await client.get(f"http://localhost:8100/health", timeout=5.0)
            if health.status_code != 200:
                print("ERROR: API server not healthy!")
                sys.exit(1)
            print("✓ API server is healthy")
        except Exception as e:
            print(f"ERROR: Cannot connect to API server: {e}")
            print("Make sure the server is running: uvicorn api.main:app --port 8100")
            sys.exit(1)

    async with httpx.AsyncClient() as client:
        enhanced_entities = []
        skipped_duplicates = 0
        enhancement_errors = 0

        print()
        print("PHASE 1: Preprocessing (Duplicate Check + AI Enhancement)")
        print("-" * 70)

        for i, (name, description) in enumerate(ENTITIES.items(), 1):
            sys.stdout.write(f"\r[{i:3d}/{len(ENTITIES)}] Processing: {name:<30}")
            sys.stdout.flush()

            # Check for duplicates first
            dupe = await check_duplicate(client, name)
            if dupe.get("exists"):
                print(f"\n         ⚠ SKIP: Duplicate found (similarity: {dupe.get('similarity', 0):.2f})")
                skipped_duplicates += 1
                continue

            # Enhance with AI (with curated description as fallback)
            enhanced = await enhance_entity(client, name, description)

            if "error" in enhanced:
                enhancement_errors += 1
                # Use fallback description silently

            enhanced_entities.append({
                "name": enhanced.get("suggested_name", name),
                "description": enhanced.get("suggested_description", description)
            })

            # Brief pause to avoid overwhelming the API
            await asyncio.sleep(0.1)

        print(f"\n\nPreprocessing complete:")
        print(f"  - Entities to classify: {len(enhanced_entities)}")
        print(f"  - Duplicates skipped: {skipped_duplicates}")
        print(f"  - Enhancement errors (used fallback): {enhancement_errors}")

        if not enhanced_entities:
            print("\nNo entities to classify. Exiting.")
            return

        print()
        print("PHASE 2: Classification")
        print("-" * 70)
        print(f"Classifying {len(enhanced_entities)} entities in batch...")
        print("(This may take several minutes...)")
        print()

        start_time = datetime.now()
        result = await classify_batch(client, enhanced_entities)
        elapsed = (datetime.now() - start_time).total_seconds()

        print()
        print("=" * 70)
        print("SUMMARY")
        print("=" * 70)
        print(f"Total entities in list:    {len(ENTITIES)}")
        print(f"Duplicates skipped:        {skipped_duplicates}")
        print(f"Entities processed:        {len(enhanced_entities)}")
        print(f"Successfully classified:   {result.get('successful', 0)}")
        print(f"Failed classifications:    {result.get('failed', 0)}")
        print(f"Classification time:       {elapsed:.1f} seconds")
        print()

        if "error" in result:
            print(f"ERROR: {result['error']}")

        # Show sample results
        results = result.get("results", [])
        if results:
            print("Sample Results (first 10):")
            print("-" * 70)
            for r in results[:10]:
                if "error" not in r:
                    name = r.get("name", "Unknown")
                    code = r.get("uht_code", "????????")
                    print(f"  {name:<30} → {code}")
            print()

        print("=" * 70)
        print("Done! Check the frontend at http://localhost:5173 to view results.")
        print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
