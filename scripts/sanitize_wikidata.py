#!/usr/bin/env python3
"""
Sanitize Wikidata entities JSON using AI enhancement.
- Capitalizes names (Title Case)
- Improves vague/short descriptions via LLM
- Processes in micro-batches of 10
- Saves progress for resume capability
"""

import asyncio
import json
import re
import sys
import os
from pathlib import Path
from typing import List, Dict, Any

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Load environment variables from .env
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

from workers.llm_client import OpenRouterClient

INPUT_FILE = Path(__file__).parent.parent / "data" / "wikidata_types_10000.json"
OUTPUT_FILE = Path(__file__).parent.parent / "data" / "wikidata_types_10000_sanitized.json"
PROGRESS_FILE = Path(__file__).parent.parent / "data" / "wikidata_sanitize_progress.json"

BATCH_SIZE = 25


def load_progress() -> Dict[str, Any]:
    """Load progress from file if exists."""
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"processed_count": 0, "results": []}


def save_progress(progress: Dict[str, Any]):
    """Save progress to file."""
    with open(PROGRESS_FILE, 'w', encoding='utf-8') as f:
        json.dump(progress, f, indent=2, ensure_ascii=False)


def build_batch_prompt(entities: List[Dict[str, Any]]) -> str:
    """Build prompt for batch sanitization."""
    entities_text = "\n".join([
        f'{i+1}. name: "{e["name"]}" | description: "{e["description"]}" | qid: {e["wikidata_qid"]}'
        for i, e in enumerate(entities)
    ])

    return f"""Sanitize these Wikidata entities for a classification system.

For each entity:
1. CAPITALIZE the name using Title Case (preserve acronyms like DNA, HTTP; handle hyphens properly)
2. IMPROVE the description if it's vague (< 25 chars) or uninformative. Make it 1-2 clear sentences.
3. Keep the wikidata_qid unchanged

Entities to sanitize:
{entities_text}

Respond with ONLY a valid JSON array, no other text:
[
  {{"name": "Capitalized Name", "description": "Improved description.", "wikidata_qid": "Q12345"}},
  ...
]"""


def parse_llm_response(response: str, original_entities: List[Dict]) -> List[Dict[str, Any]]:
    """Parse LLM response, fallback to originals on error."""
    try:
        # Find JSON array in response
        match = re.search(r'\[[\s\S]*\]', response)
        if match:
            parsed = json.loads(match.group())

            # Validate we got the right number
            if len(parsed) == len(original_entities):
                # Ensure QIDs match originals (safety)
                for i, item in enumerate(parsed):
                    item["wikidata_qid"] = original_entities[i]["wikidata_qid"]
                return parsed
    except (json.JSONDecodeError, Exception) as e:
        print(f"  Parse error: {e}")

    # Fallback: just capitalize names
    return [
        {
            "name": capitalize_name(e["name"]),
            "description": e["description"],
            "wikidata_qid": e["wikidata_qid"]
        }
        for e in original_entities
    ]


def capitalize_name(name: str) -> str:
    """Capitalize name using Title Case, preserving acronyms."""
    words = name.split()
    result = []

    for word in words:
        # Preserve acronyms (2-5 uppercase chars)
        if word.isupper() and 2 <= len(word) <= 5:
            result.append(word)
        # Preserve words with internal caps (e.g., iPhone)
        elif any(c.isupper() for c in word[1:]):
            result.append(word)
        # Handle hyphenated words
        elif '-' in word:
            result.append('-'.join(part.capitalize() for part in word.split('-')))
        else:
            result.append(word.capitalize())

    return ' '.join(result)


async def process_batch(client: OpenRouterClient, entities: List[Dict], batch_num: int) -> List[Dict]:
    """Process a single batch of entities."""
    prompt = build_batch_prompt(entities)

    try:
        response = await client.get_completion(prompt, temperature=0.3)
        result = parse_llm_response(response, entities)
        print(f"  Batch {batch_num}: Processed {len(result)} entities")
        return result
    except Exception as e:
        print(f"  Batch {batch_num}: Error - {e}, using fallback")
        # Fallback to just capitalizing
        return [
            {
                "name": capitalize_name(e["name"]),
                "description": e["description"],
                "wikidata_qid": e["wikidata_qid"]
            }
            for e in entities
        ]


async def main():
    print(f"Loading entities from {INPUT_FILE}...")

    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        all_entities = json.load(f)

    total = len(all_entities)
    print(f"Loaded {total} entities")

    # Load progress
    progress = load_progress()
    start_idx = progress["processed_count"]
    results = progress["results"]

    if start_idx > 0:
        print(f"Resuming from entity {start_idx} ({start_idx}/{total})")

    # Initialize client
    client = OpenRouterClient()

    # Process in batches
    batch_num = start_idx // BATCH_SIZE

    for i in range(start_idx, total, BATCH_SIZE):
        batch = all_entities[i:i + BATCH_SIZE]
        batch_num += 1

        print(f"Processing batch {batch_num} (entities {i+1}-{min(i+BATCH_SIZE, total)}/{total})...")

        batch_results = await process_batch(client, batch, batch_num)
        results.extend(batch_results)

        # Save progress after each batch
        progress["processed_count"] = i + len(batch)
        progress["results"] = results
        save_progress(progress)

        # Small delay to avoid rate limits
        await asyncio.sleep(0.5)

    # Save final output
    print(f"\nWriting sanitized data to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    # Clean up progress file
    if PROGRESS_FILE.exists():
        PROGRESS_FILE.unlink()

    print(f"Done! Sanitized {len(results)} entities.")

    # Show samples
    print("\n--- Sample sanitized entries ---")
    for i in range(min(5, len(results))):
        orig = all_entities[i]
        sani = results[i]
        print(f"\nOriginal:  {orig['name']}")
        print(f"Sanitized: {sani['name']}")
        if orig['description'] != sani['description']:
            print(f"Orig desc: {orig['description']}")
            print(f"New desc:  {sani['description']}")


if __name__ == "__main__":
    asyncio.run(main())
