#!/usr/bin/env python3
"""
Batch Image Acquisition from Wikidata/Wikimedia Commons

Fetches images for entities using their Wikidata QIDs and the P18 (image) property.
Uses SPARQL queries to batch-fetch image URLs from Wikidata.

Usage:
    python scripts/batch_wikidata_images.py
    python scripts/batch_wikidata_images.py --limit 100  # Test with first 100
    python scripts/batch_wikidata_images.py --resume     # Resume from checkpoint
"""

import asyncio
import httpx
import json
import sys
import os
import argparse
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

from db.neo4j_client import Neo4jClient

WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"
BATCH_SIZE = 100  # QIDs per SPARQL query
PROGRESS_FILE = Path("data/wikidata_images_progress.json")


def load_progress() -> dict:
    """Load progress from checkpoint file"""
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {
        "started_at": None,
        "processed_qids": [],
        "images_found": 0,
        "images_missing": 0,
        "last_updated": None
    }


def save_progress(progress: dict):
    """Save progress to checkpoint file"""
    progress["last_updated"] = datetime.now().isoformat()
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)


async def get_entities_with_qids(neo4j: Neo4jClient, limit: int = None, skip_with_images: bool = True) -> list:
    """Get entities that have QIDs but no images yet"""

    if skip_with_images:
        query = """
        MATCH (e:Entity)
        WHERE e.wikidata_qid IS NOT NULL
          AND (e.image_url IS NULL OR e.image_url = '')
        RETURN e.uuid as uuid, e.name as name, e.wikidata_qid as qid
        ORDER BY e.created_at DESC
        """
    else:
        query = """
        MATCH (e:Entity)
        WHERE e.wikidata_qid IS NOT NULL
        RETURN e.uuid as uuid, e.name as name, e.wikidata_qid as qid
        ORDER BY e.created_at DESC
        """

    if limit:
        query += f" LIMIT {limit}"

    results = await neo4j.execute_query(query)
    return [dict(r) for r in results]


async def fetch_wikidata_images(client: httpx.AsyncClient, qids: list) -> dict:
    """
    Query Wikidata SPARQL for P18 (image) property for a batch of QIDs.
    Returns dict mapping QID -> image filename
    """
    # Build VALUES clause
    qid_values = " ".join([f"wd:{qid}" for qid in qids])

    sparql = f"""
    SELECT ?item ?image WHERE {{
      VALUES ?item {{ {qid_values} }}
      ?item wdt:P18 ?image .
    }}
    """

    try:
        response = await client.get(
            WIKIDATA_SPARQL_URL,
            params={"query": sparql, "format": "json"},
            headers={"User-Agent": "UHT-Factory/1.0 (https://github.com/uht-factory)"},
            timeout=30.0
        )
        response.raise_for_status()

        data = response.json()
        results = {}

        for binding in data.get("results", {}).get("bindings", []):
            # Extract QID from full URI (http://www.wikidata.org/entity/Q12345 -> Q12345)
            item_uri = binding.get("item", {}).get("value", "")
            qid = item_uri.split("/")[-1] if item_uri else None

            # Extract image filename from Commons URI
            image_uri = binding.get("image", {}).get("value", "")

            if qid and image_uri:
                results[qid] = image_uri

        return results

    except Exception as e:
        print(f"  SPARQL query error: {e}")
        return {}


def build_wikimedia_url(commons_uri: str, width: int = 400) -> str:
    """
    Convert Wikimedia Commons URI to usable image URL.

    Input: http://commons.wikimedia.org/wiki/Special:FilePath/Example.jpg
    Output: https://commons.wikimedia.org/wiki/Special:FilePath/Example.jpg?width=400
    """
    # Already a FilePath URL
    if "Special:FilePath" in commons_uri:
        url = commons_uri.replace("http://", "https://")
        return f"{url}?width={width}"

    # Raw filename - construct FilePath URL
    filename = commons_uri.split("/")[-1]
    encoded_filename = quote(filename, safe="")
    return f"https://commons.wikimedia.org/wiki/Special:FilePath/{encoded_filename}?width={width}"


async def update_entity_image(neo4j: Neo4jClient, uuid: str, image_url: str):
    """Update entity with image URL"""
    query = """
    MATCH (e:Entity {uuid: $uuid})
    SET e.image_url = $image_url, e.updated_at = datetime()
    RETURN e.name as name
    """
    await neo4j.execute_query(query, uuid=uuid, image_url=image_url)


async def main():
    parser = argparse.ArgumentParser(description="Fetch images from Wikidata for entities")
    parser.add_argument("--limit", type=int, help="Limit number of entities to process")
    parser.add_argument("--resume", action="store_true", help="Resume from checkpoint")
    parser.add_argument("--force", action="store_true", help="Process entities even if they have images")
    args = parser.parse_args()

    print("=" * 70)
    print("WIKIDATA IMAGE ACQUISITION")
    print("=" * 70)
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    # Connect to Neo4j
    neo4j = Neo4jClient(
        uri=os.getenv("NEO4J_URI"),
        user=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )
    await neo4j.connect()

    # Load progress if resuming
    progress = load_progress() if args.resume else {
        "started_at": datetime.now().isoformat(),
        "processed_qids": [],
        "images_found": 0,
        "images_missing": 0,
        "last_updated": None
    }

    processed_qids = set(progress.get("processed_qids", []))

    if args.resume and processed_qids:
        print(f"Resuming from checkpoint: {len(processed_qids)} already processed")

    # Get entities
    print("Loading entities from Neo4j...")
    entities = await get_entities_with_qids(neo4j, args.limit, skip_with_images=not args.force)

    # Filter out already processed
    if args.resume:
        entities = [e for e in entities if e["qid"] not in processed_qids]

    total = len(entities)
    print(f"Entities to process: {total}")

    if total == 0:
        print("No entities need images!")
        await neo4j.close()
        return

    # Build QID -> entity mapping
    qid_to_entity = {e["qid"]: e for e in entities}
    all_qids = list(qid_to_entity.keys())

    # Process in batches
    batches = [all_qids[i:i + BATCH_SIZE] for i in range(0, len(all_qids), BATCH_SIZE)]
    print(f"Split into {len(batches)} batches of {BATCH_SIZE}")
    print()

    images_found = progress.get("images_found", 0)
    images_missing = progress.get("images_missing", 0)

    async with httpx.AsyncClient() as client:
        for batch_num, batch_qids in enumerate(batches, 1):
            print(f"[Batch {batch_num}/{len(batches)}] Querying {len(batch_qids)} QIDs...")

            # Query Wikidata
            qid_images = await fetch_wikidata_images(client, batch_qids)

            batch_found = 0
            batch_missing = 0

            # Update entities
            for qid in batch_qids:
                entity = qid_to_entity[qid]

                if qid in qid_images:
                    # Build image URL
                    image_url = build_wikimedia_url(qid_images[qid])
                    await update_entity_image(neo4j, entity["uuid"], image_url)
                    batch_found += 1
                else:
                    batch_missing += 1

                processed_qids.add(qid)

            images_found += batch_found
            images_missing += batch_missing

            print(f"  Found: {batch_found}, Missing: {batch_missing}")

            # Save progress
            progress["processed_qids"] = list(processed_qids)
            progress["images_found"] = images_found
            progress["images_missing"] = images_missing
            save_progress(progress)

            # Small delay to be nice to Wikidata
            await asyncio.sleep(0.5)

    # Cleanup
    await neo4j.close()

    # Remove progress file on completion
    if PROGRESS_FILE.exists():
        PROGRESS_FILE.unlink()

    # Summary
    print()
    print("=" * 70)
    print("COMPLETE")
    print("=" * 70)
    print(f"Total processed:  {len(processed_qids)}")
    print(f"Images found:     {images_found} ({images_found * 100 / max(len(processed_qids), 1):.1f}%)")
    print(f"Images missing:   {images_missing}")
    print()


if __name__ == "__main__":
    asyncio.run(main())
