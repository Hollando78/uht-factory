#!/usr/bin/env python3
"""
Batch Classification for Wikidata Entities

Classifies entities extracted from Wikidata using the UHT system.
Preserves Wikidata metadata (Q-ID, type, sitelinks count).

Key features:
- Processes extracted Wikidata entities
- Chunks of 100 entities, 2 concurrent batches
- Progress tracking with resumability
- Wikidata metadata preservation

Usage:
    python scripts/wikidata_batch_classify.py
    python scripts/wikidata_batch_classify.py --resume
    python scripts/wikidata_batch_classify.py --limit 1000  # Classify only first 1000
"""

import asyncio
import httpx
import json
import sys
import os
import argparse
from datetime import datetime
from pathlib import Path

API_BASE = "http://localhost:8100/api/v1"
CHUNK_SIZE = 100
PARALLEL_CHUNKS = 2

# Paths
ENTITIES_FILE = Path("data/wikidata_types_sanitized.json")
PROGRESS_FILE = Path("data/wikidata_classification_progress.json")
RESULTS_FILE = Path("data/wikidata_classified_results.json")


def load_progress() -> dict:
    """Load classification progress"""
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {
        "started_at": None,
        "total_entities": 0,
        "classified": 0,
        "failed": 0,
        "classified_qids": [],
        "failed_qids": [],
        "last_updated": None
    }


def save_progress(progress: dict):
    """Save classification progress"""
    progress["last_updated"] = datetime.now().isoformat()
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)


async def check_api_health(client: httpx.AsyncClient) -> bool:
    """Verify API is running"""
    try:
        response = await client.get("http://localhost:8100/health", timeout=5.0)
        return response.status_code == 200
    except Exception as e:
        print(f"ERROR: Cannot connect to API: {e}")
        return False


async def bulk_duplicate_check(client: httpx.AsyncClient, entities: list) -> set:
    """Check which entities already exist in database"""
    existing = set()

    print("Checking for existing entities...")
    for i, entity in enumerate(entities):
        if i % 100 == 0:
            sys.stdout.write(f"\r  Checked {i}/{len(entities)}...")
            sys.stdout.flush()

        try:
            response = await client.post(
                f"{API_BASE}/preprocess/duplicate-check",
                params={"entity_name": entity["name"]},
                timeout=10.0
            )
            if response.status_code == 200:
                result = response.json()
                if result.get("exists"):
                    existing.add(entity["wikidata_qid"])
        except Exception:
            pass

    print(f"\r  Checked {len(entities)}/{len(entities)} - {len(existing)} already exist")
    return existing


async def classify_chunk(
    client: httpx.AsyncClient,
    entities: list,
    chunk_num: int,
    total_chunks: int,
    start_time: datetime
) -> dict:
    """Classify a chunk of Wikidata entities"""
    try:
        print(f"  [Chunk {chunk_num + 1}/{total_chunks}] Classifying {len(entities)} entities...")

        # Format entities for classification API
        api_entities = []
        for e in entities:
            api_entities.append({
                "name": e["name"],
                "description": e["description"],
                "wikidata_qid": e.get("wikidata_qid"),
                "wikidata_type": e.get("wikidata_type"),
                "wikidata_type_label": e.get("wikidata_type_label"),
                "sitelinks_count": e.get("sitelinks_count")
            })

        response = await client.post(
            f"{API_BASE}/classify/batch",
            json={
                "entities": api_entities,
                "use_cache": True,
                "parallel_workers": 8
            },
            timeout=900.0  # 15 minutes per chunk
        )

        if response.status_code == 200:
            result = response.json()
            elapsed = (datetime.now() - start_time).total_seconds()
            print(f"  [Chunk {chunk_num + 1}] Done: {result.get('successful', 0)} successful, {result.get('failed', 0)} failed ({elapsed:.0f}s)")
            return result
        else:
            return {"error": f"HTTP {response.status_code}", "successful": 0, "failed": len(entities)}

    except asyncio.TimeoutError:
        return {"error": "Timeout after 15 minutes", "successful": 0, "failed": len(entities)}
    except Exception as e:
        return {"error": str(e), "successful": 0, "failed": len(entities)}


async def main():
    parser = argparse.ArgumentParser(description="Classify Wikidata entities with UHT")
    parser.add_argument("--resume", action="store_true", help="Resume from last checkpoint")
    parser.add_argument("--limit", type=int, help="Limit number of entities to classify")
    parser.add_argument("--skip-duplicate-check", action="store_true", help="Skip duplicate checking")
    args = parser.parse_args()

    # Check for input file
    if not ENTITIES_FILE.exists():
        print(f"ERROR: {ENTITIES_FILE} not found!")
        print("Run: python scripts/wikidata_extractor.py first")
        sys.exit(1)

    # Load entities
    with open(ENTITIES_FILE) as f:
        all_entities = json.load(f)

    if args.limit:
        all_entities = all_entities[:args.limit]

    total_entities = len(all_entities)

    print("=" * 70)
    print("WIKIDATA ENTITY CLASSIFICATION")
    print("=" * 70)
    print(f"Entities to process: {total_entities}")
    print(f"Chunk size: {CHUNK_SIZE}")
    print(f"Parallel chunks: {PARALLEL_CHUNKS}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    # Load progress if resuming
    progress = load_progress() if args.resume else {
        "started_at": datetime.now().isoformat(),
        "total_entities": total_entities,
        "classified": 0,
        "failed": 0,
        "classified_qids": [],
        "failed_qids": [],
        "last_updated": None
    }

    if args.resume:
        print(f"Resuming from checkpoint:")
        print(f"  Already classified: {progress['classified']}")
        print(f"  Failed: {progress['failed']}")
        print()

    async with httpx.AsyncClient() as client:
        # Health check
        if not await check_api_health(client):
            print("ERROR: API server not responding!")
            print("Start with: uvicorn api.main:app --port 8100")
            sys.exit(1)
        print("API server healthy")
        print()

        # Filter out already classified entities
        classified_qids = set(progress.get("classified_qids", []))
        entities_to_classify = [
            e for e in all_entities
            if e.get("wikidata_qid") not in classified_qids
        ]

        # Optional duplicate check against Neo4j
        if not args.skip_duplicate_check and not args.resume:
            print("PHASE 1: Duplicate Check")
            print("-" * 70)
            existing = await bulk_duplicate_check(client, entities_to_classify)
            entities_to_classify = [
                e for e in entities_to_classify
                if e.get("wikidata_qid") not in existing
            ]
            print(f"Entities after duplicate removal: {len(entities_to_classify)}")
            print()

        if not entities_to_classify:
            print("No new entities to classify!")
            return

        # Classification phase
        print("PHASE 2: Classification")
        print("-" * 70)

        # Split into chunks
        chunks = [
            entities_to_classify[i:i + CHUNK_SIZE]
            for i in range(0, len(entities_to_classify), CHUNK_SIZE)
        ]
        total_chunks = len(chunks)

        print(f"Split into {total_chunks} chunks of ~{CHUNK_SIZE} entities each")
        print(f"Running {PARALLEL_CHUNKS} chunks in parallel")
        print()

        # Estimate time
        estimated_per_chunk = 7 * 60  # ~7 minutes per 100 entities
        estimated_total = (total_chunks / PARALLEL_CHUNKS) * estimated_per_chunk
        print(f"Estimated time: ~{estimated_total / 60:.0f} minutes ({estimated_total / 3600:.1f} hours)")
        print()

        start_time = datetime.now()
        all_results = []

        # Process chunks with controlled parallelism
        semaphore = asyncio.Semaphore(PARALLEL_CHUNKS)

        async def process_chunk_with_semaphore(chunk, chunk_num):
            async with semaphore:
                return await classify_chunk(client, chunk, chunk_num, total_chunks, start_time)

        # Process in batches to allow periodic progress saving
        batch_size = PARALLEL_CHUNKS * 2
        for batch_start in range(0, len(chunks), batch_size):
            batch_chunks = chunks[batch_start:batch_start + batch_size]
            tasks = [
                process_chunk_with_semaphore(chunk, batch_start + i)
                for i, chunk in enumerate(batch_chunks)
            ]
            batch_results = await asyncio.gather(*tasks)
            all_results.extend(batch_results)

            # Update progress
            for result in batch_results:
                progress["classified"] += result.get("successful", 0)
                progress["failed"] += result.get("failed", 0)

                # Track classified Q-IDs
                for r in result.get("results", []):
                    if "error" not in r:
                        qid = r.get("wikidata_qid")
                        if qid:
                            progress["classified_qids"].append(qid)
                    else:
                        qid = r.get("wikidata_qid")
                        if qid:
                            progress["failed_qids"].append(qid)

            save_progress(progress)
            print(f"  Progress saved: {progress['classified']} classified, {progress['failed']} failed")

        # Calculate totals
        elapsed = (datetime.now() - start_time).total_seconds()
        total_successful = sum(r.get("successful", 0) for r in all_results)
        total_failed = sum(r.get("failed", 0) for r in all_results)
        errors = [r.get("error") for r in all_results if "error" in r]

        # Save final results
        with open(RESULTS_FILE, "w") as f:
            json.dump({
                "completed_at": datetime.now().isoformat(),
                "total_successful": total_successful,
                "total_failed": total_failed,
                "elapsed_seconds": elapsed,
                "results": all_results
            }, f, indent=2)

        # Summary
        print()
        print("=" * 70)
        print("CLASSIFICATION COMPLETE")
        print("=" * 70)
        print(f"Total entities in file:    {total_entities}")
        print(f"Entities processed:        {len(entities_to_classify)}")
        print(f"Successfully classified:   {total_successful}")
        print(f"Failed classifications:    {total_failed}")
        print(f"Total time:                {elapsed:.1f}s ({elapsed/60:.1f} min, {elapsed/3600:.1f} hours)")
        print(f"Average per entity:        {elapsed / max(len(entities_to_classify), 1):.2f}s")
        print()

        if errors:
            print("Errors encountered:")
            for err in errors[:10]:
                print(f"  - {err}")
            if len(errors) > 10:
                print(f"  ... and {len(errors) - 10} more")
            print()

        # Type distribution of classified entities
        type_counts = {}
        for result in all_results:
            for r in result.get("results", []):
                if "error" not in r:
                    tl = r.get("wikidata_type_label", "unknown")
                    type_counts[tl] = type_counts.get(tl, 0) + 1

        if type_counts:
            print("Classification by type (top 15):")
            sorted_types = sorted(type_counts.items(), key=lambda x: -x[1])[:15]
            for type_label, count in sorted_types:
                label = type_label or "unknown"
                print(f"  {label:<40} {count:>5}")

        print()
        print("=" * 70)
        print("Done! View results in the UHT Factory frontend.")
        print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
