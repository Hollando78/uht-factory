#!/usr/bin/env python3
"""
Parse markdown entity list into JSON format.
Handles format:
1. **Entity Name**
   Description text...

Reads from: UHT Core Entities (1000) — Version 2.md
Outputs to: data/entities_1000.json
"""

import re
import json
import os

def parse_markdown_entities(text):
    """Parse markdown formatted entity list into list of dicts"""
    entities = []

    # Pattern: number. **Name** followed by description on next line(s)
    # Handle both single and double digit indentation
    pattern = r'(\d+)\.\s+\*\*([^*]+)\*\*\s*\n\s+(.+?)(?=\n\n\d+\.|\n\n##|\n\n---|\Z)'

    matches = re.findall(pattern, text, re.DOTALL)

    for num, name, desc in matches:
        # Clean up the description - remove extra whitespace
        clean_desc = ' '.join(desc.split())
        entities.append({
            "name": name.strip(),
            "description": clean_desc
        })

    return entities

def main():
    # Find the markdown file
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    md_file = os.path.join(base_dir, "UHT Core Entities (1000) — Version 2.md")

    if not os.path.exists(md_file):
        print(f"ERROR: {md_file} not found!")
        return

    print(f"Reading: {md_file}")

    with open(md_file, 'r', encoding='utf-8') as f:
        markdown_text = f.read()

    print(f"File size: {len(markdown_text):,} characters")

    # Parse entities
    entities = parse_markdown_entities(markdown_text)
    print(f"Parsed {len(entities)} entities")

    if len(entities) < 1000:
        print(f"WARNING: Expected 1000 entities, got {len(entities)}")

    # Ensure data directory exists
    data_dir = os.path.join(base_dir, "data")
    os.makedirs(data_dir, exist_ok=True)

    # Save full list
    output_file = os.path.join(data_dir, "entities_1000.json")
    with open(output_file, "w", encoding='utf-8') as f:
        json.dump(entities, f, indent=2, ensure_ascii=False)
    print(f"Saved to {output_file}")

    # Also save chunks of 200 for easier processing
    chunk_size = 200
    for i in range(0, len(entities), chunk_size):
        chunk = entities[i:i+chunk_size]
        chunk_num = (i // chunk_size) + 1
        chunk_file = os.path.join(data_dir, f"entities_chunk_{chunk_num}.json")
        with open(chunk_file, "w", encoding='utf-8') as f:
            json.dump(chunk, f, indent=2, ensure_ascii=False)
        print(f"  Chunk {chunk_num}: {len(chunk)} entities -> {chunk_file}")

    # Show first and last few
    print("\nFirst 5 entities:")
    for e in entities[:5]:
        print(f"  - {e['name']}: {e['description'][:50]}...")

    print("\nLast 5 entities:")
    for e in entities[-5:]:
        print(f"  - {e['name']}: {e['description'][:50]}...")

if __name__ == "__main__":
    main()
