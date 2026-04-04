#!/usr/bin/env python3
"""
Pre-compute seed embeddings for the Cloudflare Workers AI deployment.

This script runs the same sentence-transformers model locally to generate
embeddings for all attack + benign seed prompts, then outputs seeds.json
for the Worker to load at runtime.

Usage:
    pip install sentence-transformers numpy
    python tools/precompute-seeds.py

Output: apps/api/src/seeds.json
"""

import json
import sys
from pathlib import Path

# Add mcp-server to path to reuse seed definitions
sys.path.insert(0, str(Path(__file__).parent / "mcp-server"))

OUTPUT = Path(__file__).parent.parent / "apps" / "api" / "src" / "seeds.json"


def main():
    from sentence_transformers import SentenceTransformer
    import numpy as np

    print("Loading model: all-MiniLM-L6-v2...")
    model = SentenceTransformer("all-MiniLM-L6-v2")

    # Import seeds from the MCP server
    from server import _load_seeds, _benign_embeddings, _seed_labels, _seed_embeddings

    # Force load
    _load_seeds()

    # Re-import after loading
    from server import _seed_embeddings as attack_embs, _seed_labels as attack_labs, _benign_embeddings as benign_embs

    # Build attack seeds
    attack_seeds = []
    if attack_embs is not None and len(attack_embs) > 0:
        for i, (label, emb) in enumerate(zip(attack_labs, attack_embs)):
            attack_seeds.append({
                "label": label,
                "embedding": emb.tolist(),
            })

    # Build benign seeds
    benign_seeds = []
    if benign_embs is not None and len(benign_embs) > 0:
        # We need benign labels too — they're all "benign"
        for emb in benign_embs:
            benign_seeds.append({
                "label": "benign",
                "embedding": emb.tolist(),
            })

    result = {
        "attack": attack_seeds,
        "benign": benign_seeds,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w") as f:
        json.dump(result, f)

    size_kb = OUTPUT.stat().st_size / 1024
    print(f"Written {len(attack_seeds)} attack + {len(benign_seeds)} benign seeds to {OUTPUT}")
    print(f"File size: {size_kb:.1f} KB")

    # Warn if too large for Worker bundle
    if size_kb > 1024:
        print("WARNING: seeds.json > 1MB — consider using KV storage instead of bundling")


if __name__ == "__main__":
    main()
