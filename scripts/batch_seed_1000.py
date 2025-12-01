#!/usr/bin/env python3
"""
Optimized batch classification of 1000 entities.
Skips preprocessing - uses provided descriptions directly.

Key optimizations:
1. Skip AI preprocessing (descriptions already curated)
2. Bulk duplicate check (single Neo4j query)
3. Chunked classification (batches of 100)
4. Parallel chunk processing (2 concurrent batches)
5. Progress tracking with ETA

Usage:
    python scripts/batch_seed_1000.py
"""

import asyncio
import httpx
import json
import sys
import os
from datetime import datetime, timedelta

API_BASE = "http://localhost:8100/api/v1"
CHUNK_SIZE = 100
PARALLEL_CHUNKS = 2  # Process 2 batches concurrently


async def check_api_health(client: httpx.AsyncClient) -> bool:
    """Verify API is running"""
    try:
        response = await client.get("http://localhost:8100/health", timeout=5.0)
        return response.status_code == 200
    except Exception as e:
        print(f"ERROR: Cannot connect to API: {e}")
        return False


async def bulk_duplicate_check(client: httpx.AsyncClient, names: list) -> set:
    """Check all entity names against database in bulk"""
    existing = set()

    # Check each name via the duplicate-check endpoint
    # This is sequential but fast (no LLM calls)
    print("Checking for existing entities...")
    for i, name in enumerate(names):
        if i % 50 == 0:
            sys.stdout.write(f"\r  Checked {i}/{len(names)} names...")
            sys.stdout.flush()

        try:
            response = await client.post(
                f"{API_BASE}/preprocess/duplicate-check",
                params={"entity_name": name},
                timeout=10.0
            )
            if response.status_code == 200:
                result = response.json()
                if result.get("exists"):
                    existing.add(name)
        except Exception:
            pass  # On error, assume it doesn't exist

    print(f"\r  Checked {len(names)}/{len(names)} names - {len(existing)} already exist")
    return existing


async def classify_chunk(
    client: httpx.AsyncClient,
    entities: list,
    chunk_num: int,
    total_chunks: int,
    start_time: datetime
) -> dict:
    """Classify a chunk of entities (up to 100)"""
    try:
        print(f"  [Chunk {chunk_num + 1}/{total_chunks}] Classifying {len(entities)} entities...")

        response = await client.post(
            f"{API_BASE}/classify/batch",
            json={
                "entities": entities,
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
    # Load entities
    data_file = "data/entities_1000.json"
    if not os.path.exists(data_file):
        print(f"ERROR: {data_file} not found!")
        print("Run: python scripts/parse_markdown_entities.py first")
        sys.exit(1)

    with open(data_file) as f:
        entities = json.load(f)

    total_entities = len(entities)

    print("=" * 70)
    print("UHT FACTORY - OPTIMIZED BATCH CLASSIFICATION")
    print("=" * 70)
    print(f"Entities to process: {total_entities}")
    print(f"Chunk size: {CHUNK_SIZE}")
    print(f"Parallel chunks: {PARALLEL_CHUNKS}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    async with httpx.AsyncClient() as client:
        # Health check
        if not await check_api_health(client):
            print("ERROR: API server not responding!")
            print("Start with: uvicorn api.main:app --port 8100")
            sys.exit(1)
        print("API server healthy")
        print()

        # Phase 1: Bulk duplicate check
        print("PHASE 1: Duplicate Check (NO preprocessing)")
        print("-" * 70)

        entity_names = [e["name"] for e in entities]
        existing = await bulk_duplicate_check(client, entity_names)

        # Filter out duplicates
        new_entities = [e for e in entities if e["name"] not in existing]
        skipped = total_entities - len(new_entities)

        print(f"\nNew entities to classify: {len(new_entities)}")
        print(f"Duplicates skipped: {skipped}")

        if not new_entities:
            print("\nNo new entities to classify!")
            return

        # Phase 2: Chunked classification
        print()
        print("PHASE 2: Classification")
        print("-" * 70)

        # Split into chunks
        chunks = [new_entities[i:i+CHUNK_SIZE] for i in range(0, len(new_entities), CHUNK_SIZE)]
        total_chunks = len(chunks)

        print(f"Split into {total_chunks} chunks of ~{CHUNK_SIZE} entities each")
        print(f"Running {PARALLEL_CHUNKS} chunks in parallel")
        print()

        # Estimate time
        estimated_per_chunk = 7 * 60  # ~7 minutes per 100 entities
        estimated_total = (total_chunks / PARALLEL_CHUNKS) * estimated_per_chunk
        print(f"Estimated time: ~{estimated_total / 60:.0f} minutes")
        print()

        start_time = datetime.now()
        all_results = []

        # Process chunks with controlled parallelism
        semaphore = asyncio.Semaphore(PARALLEL_CHUNKS)

        async def process_chunk_with_semaphore(chunk, chunk_num):
            async with semaphore:
                return await classify_chunk(client, chunk, chunk_num, total_chunks, start_time)

        tasks = [process_chunk_with_semaphore(chunk, i) for i, chunk in enumerate(chunks)]
        results = await asyncio.gather(*tasks)
        all_results.extend(results)

        # Calculate totals
        elapsed = (datetime.now() - start_time).total_seconds()
        total_successful = sum(r.get("successful", 0) for r in all_results)
        total_failed = sum(r.get("failed", 0) for r in all_results)
        errors = [r.get("error") for r in all_results if "error" in r]

        # Summary
        print()
        print("=" * 70)
        print("SUMMARY")
        print("=" * 70)
        print(f"Total entities in file:    {total_entities}")
        print(f"Duplicates skipped:        {skipped}")
        print(f"Entities processed:        {len(new_entities)}")
        print(f"Successfully classified:   {total_successful}")
        print(f"Failed classifications:    {total_failed}")
        print(f"Total time:                {elapsed:.1f} seconds ({elapsed/60:.1f} minutes)")
        print(f"Average per entity:        {elapsed / max(len(new_entities), 1):.2f} seconds")
        print()

        if errors:
            print("Errors encountered:")
            for err in errors:
                print(f"  - {err}")
            print()

        # Show sample results
        for result in all_results:
            sample_results = result.get("results", [])[:3]
            for r in sample_results:
                if "error" not in r:
                    print(f"  {r.get('name', 'Unknown'):<30} {r.get('uht_code', '????????')}")

        print()
        print("=" * 70)
        print("Done! Check the frontend at http://localhost:5173 to view results.")
        print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
