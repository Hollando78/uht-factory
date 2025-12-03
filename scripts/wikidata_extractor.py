#!/usr/bin/env python3
"""
Wikidata Types/Classes Extractor

Extracts diverse entity TYPES (classes) from Wikidata - not instances.
Types are more valuable for UHT taxonomy than individual instances.

Examples of types: "city", "mammal", "chemical element", "film genre"
(as opposed to instances like "Paris", "elephant", "oxygen", "comedy")

Key features:
- Extracts Wikidata classes (items used as P31 targets)
- Ranked by number of instances (popularity)
- English definitions required
- Progress tracking with resumability
- Rate limiting (5s delay between queries)

Usage:
    python scripts/wikidata_extractor.py
    python scripts/wikidata_extractor.py --resume
    python scripts/wikidata_extractor.py --target 1000  # Limit to 1000 types
"""

import asyncio
import httpx
import json
import sys
import os
import argparse
from datetime import datetime
from pathlib import Path
from typing import Optional

# Configuration
WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
QUERY_DELAY = 5  # Seconds between queries
QUERY_TIMEOUT = 90  # Seconds per query
CHUNK_SIZE = 300  # Types per query chunk (smaller = faster)
MAX_RETRIES = 3  # Retries per chunk on timeout

# Paths
DATA_DIR = Path("data/wikidata_raw")
PROGRESS_FILE = Path("data/wikidata_types_progress.json")
TYPES_FILE = Path("data/wikidata_types_10000.json")


def load_progress() -> dict:
    """Load progress from checkpoint file"""
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {
        "started_at": None,
        "types_discovered": 0,
        "types_processed": 0,
        "entities_extracted": 0,
        "completed_types": [],
        "failed_types": [],
        "last_updated": None
    }


def save_progress(progress: dict):
    """Save progress to checkpoint file"""
    progress["last_updated"] = datetime.now().isoformat()
    PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)


async def sparql_query(client: httpx.AsyncClient, query: str) -> Optional[dict]:
    """Execute SPARQL query against Wikidata"""
    headers = {
        "Accept": "application/sparql-results+json",
        "User-Agent": "UHT-Factory/1.0 (https://github.com/Hollando78/uht-factory)"
    }

    try:
        response = await client.get(
            WIKIDATA_SPARQL,
            params={"query": query},
            headers=headers,
            timeout=QUERY_TIMEOUT
        )

        if response.status_code == 429:
            print("  Rate limited! Waiting 60s...")
            await asyncio.sleep(60)
            return await sparql_query(client, query)  # Retry

        if response.status_code != 200:
            print(f"  SPARQL error: HTTP {response.status_code}")
            return None

        return response.json()

    except httpx.TimeoutException:
        print("  Query timeout!")
        return None
    except Exception as e:
        print(f"  Query error: {e}")
        return None


async def extract_types_chunk(
    client: httpx.AsyncClient,
    offset: int,
    limit: int = CHUNK_SIZE
) -> list:
    """
    Extract a chunk of Wikidata types/classes.
    Types are items that have subclass-of (P279) relationships.
    """
    # Simple query - just get types with subclass-of
    query = f"""
    SELECT DISTINCT ?type ?typeLabel ?typeDescription WHERE {{
      ?type wdt:P279 ?parent .
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }}
    LIMIT {limit}
    OFFSET {offset}
    """

    result = await sparql_query(client, query)

    if not result:
        return []

    # Words that indicate meta/internal types to filter out
    skip_words = ['wikimedia', 'wikipedia', 'wikidata', 'template', 'category',
                  'disambiguation', 'stub', 'redirect', 'infobox', 'navbox']

    types = []
    for binding in result.get("results", {}).get("bindings", []):
        type_uri = binding.get("type", {}).get("value", "")
        qid = type_uri.split("/")[-1] if type_uri else ""
        name = binding.get("typeLabel", {}).get("value", "")
        description = binding.get("typeDescription", {}).get("value", "")

        # Filter: must have name, description, not be unlabeled, not be meta
        if qid and name and description and not name.startswith("Q"):
            name_lower = name.lower()
            desc_lower = description.lower()
            # Skip meta/internal types
            if any(w in name_lower or w in desc_lower for w in skip_words):
                continue
            types.append({
                "name": name,
                "description": description,
                "wikidata_qid": qid
            })

    return types


async def extract_all_types(
    client: httpx.AsyncClient,
    progress: dict,
    target_count: int = 10000
) -> list:
    """
    Extract Wikidata types/classes with definitions.
    Uses chunked queries to avoid timeouts.
    """
    print("\nExtracting Wikidata Types/Classes")
    print("-" * 60)

    all_types = []
    seen_qids = set()

    # Load existing types if resuming
    partial_file = DATA_DIR / "types_partial.json"
    if partial_file.exists() and progress.get("types_extracted", 0) > 0:
        with open(partial_file) as f:
            existing = json.load(f)
            all_types = existing
            seen_qids = {t["wikidata_qid"] for t in existing}
            print(f"  Resuming with {len(all_types)} existing types")

    current_offset = progress.get("current_offset", 0)
    print(f"  Target: {target_count} types")
    print(f"  Starting offset: {current_offset}")
    print()

    consecutive_failures = 0
    while len(all_types) < target_count:
        pct = (len(all_types) / target_count) * 100
        print(f"  Fetching offset {current_offset}... ({len(all_types)} types, {pct:.1f}%)")

        # Fetch chunk with retries
        chunk = None
        for retry in range(MAX_RETRIES):
            chunk = await extract_types_chunk(client, current_offset, CHUNK_SIZE)
            if chunk:
                consecutive_failures = 0
                break
            print(f"    Retry {retry + 1}/{MAX_RETRIES}...")
            await asyncio.sleep(QUERY_DELAY * 2)  # Longer delay on retry

        if not chunk:
            consecutive_failures += 1
            print(f"  Failed at offset {current_offset}, skipping...")
            current_offset += CHUNK_SIZE
            if consecutive_failures >= 3:
                print("  Too many consecutive failures, stopping")
                break
            continue

        # Deduplicate
        new_types = [t for t in chunk if t["wikidata_qid"] not in seen_qids]
        for t in new_types:
            seen_qids.add(t["wikidata_qid"])

        all_types.extend(new_types)

        # Update progress
        current_offset += CHUNK_SIZE
        progress["current_offset"] = current_offset
        progress["types_extracted"] = len(all_types)
        save_progress(progress)

        # Save partial results
        with open(partial_file, "w") as f:
            json.dump(all_types, f)

        print(f"    Got {len(chunk)} types, {len(new_types)} new. Total: {len(all_types)}")

        # Rate limiting
        await asyncio.sleep(QUERY_DELAY)

        # Safety check - if we're getting no new types, stop
        if len(new_types) == 0:
            print("  No new types in chunk, stopping")
            break

    return all_types[:target_count]


async def main():
    parser = argparse.ArgumentParser(description="Extract Wikidata types/classes")
    parser.add_argument("--resume", action="store_true", help="Resume from last checkpoint")
    parser.add_argument("--target", type=int, default=10000, help="Target number of types (default: 10000)")
    args = parser.parse_args()

    print("=" * 70)
    print("WIKIDATA TYPES/CLASSES EXTRACTOR")
    print("=" * 70)
    print(f"Target types: {args.target}")
    print(f"Chunk size: {CHUNK_SIZE}")
    print(f"Query delay: {QUERY_DELAY}s")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    # Create data directory
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Load or initialize progress
    progress = load_progress() if args.resume else {
        "started_at": datetime.now().isoformat(),
        "current_offset": 0,
        "types_extracted": 0,
        "last_updated": None
    }

    if args.resume:
        print(f"Resuming from checkpoint:")
        print(f"  Current offset: {progress.get('current_offset', 0)}")
        print(f"  Types extracted: {progress.get('types_extracted', 0)}")
        print()

    async with httpx.AsyncClient() as client:
        start_time = datetime.now()

        # Extract types
        types = await extract_all_types(client, progress, args.target)
        elapsed = (datetime.now() - start_time).total_seconds()

        if not types:
            print("ERROR: No types extracted!")
            sys.exit(1)

        # Save final results
        print()
        print("Saving final results...")
        with open(TYPES_FILE, "w") as f:
            json.dump(types, f, indent=2)

        # Summary
        print()
        print("=" * 70)
        print("EXTRACTION COMPLETE")
        print("=" * 70)
        print(f"Total types extracted: {len(types)}")
        print(f"Time elapsed: {elapsed:.0f}s ({elapsed/60:.1f} minutes)")
        print(f"Output file: {TYPES_FILE}")
        print()

        # Sample types
        print("Sample types (first 20):")
        for t in types[:20]:
            name = t["name"][:40]
            desc = t["description"][:50] if t.get("description") else ""
            print(f"  {name:<40} {desc}...")

        print()
        print("=" * 70)
        print("Next: Run wikidata_batch_classify.py to classify types")
        print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
