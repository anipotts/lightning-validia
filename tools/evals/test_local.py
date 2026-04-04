"""
Local eval runner — tests the shield engine directly without a server.
No HTTP needed, just imports evaluate_message() and runs all eval prompts.

Usage:
    cd openproof
    pip install numpy sentence-transformers
    python evals/test_local.py
"""

import json
import sys
from pathlib import Path

# Add mcp-server to path so we can import the shield engine
sys.path.insert(0, str(Path(__file__).parent.parent / "mcp-server"))
from server import evaluate_message

EVAL_FILE = Path(__file__).parent / "adversarial_evals.json"


def main():
    # Load eval prompts
    with open(EVAL_FILE) as f:
        evals = json.load(f)

    prompts = [e for e in evals if "prompt" in e]
    print(f"Loaded {len(prompts)} eval prompts\n")

    # Track results
    results = []
    tp = fp = fn = tn = 0

    print(f"{'ID':<8} {'EXPECTED':<8} {'GOT':<18} {'SCORE':<7} {'CATEGORY':<25} {'STATUS'}")
    print("-" * 100)

    for item in prompts:
        prompt = item["prompt"]
        expected = item["expected"]
        item_id = item.get("id", "?")
        expected_cat = item.get("category", "")

        # Run the shield engine
        result = evaluate_message(prompt)

        classification = result["classification"]
        score = result["threat_score"]
        top_cat = result["top_category"]

        # Did it predict attack? (anything not SAFE = predicted attack)
        predicted_attack = classification != "SAFE"
        actual_attack = expected == "attack"

        # Score it
        if actual_attack and predicted_attack:
            tp += 1
            status = "OK"
        elif not actual_attack and not predicted_attack:
            tn += 1
            status = "OK"
        elif not actual_attack and predicted_attack:
            fp += 1
            status = "!! FALSE POSITIVE"
        else:
            fn += 1
            status = "!! FALSE NEGATIVE"

        # Check if category matches
        cat_match = ""
        if actual_attack and predicted_attack and expected_cat:
            cat_match = " (cat match)" if top_cat == expected_cat else f" (expected {expected_cat})"

        print(f"{item_id:<8} {expected:<8} {classification:<18} {score:<7.3f} {top_cat:<25} {status}{cat_match}")

        results.append({
            "id": item_id,
            "prompt": prompt[:80],
            "expected": expected,
            "classification": classification,
            "score": score,
            "top_category": top_cat,
            "expected_category": expected_cat,
            "status": status,
        })

    # Summary
    total = len(prompts)
    precision = tp / (tp + fp) if (tp + fp) else 0
    recall = tp / (tp + fn) if (tp + fn) else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0
    accuracy = (tp + tn) / total if total else 0

    print(f"\n{'='*60}")
    print(f"RESULTS: {total} prompts tested")
    print(f"{'='*60}")
    print(f"  True Positives:  {tp} (attacks correctly caught)")
    print(f"  True Negatives:  {tn} (benign correctly passed)")
    print(f"  False Positives: {fp} (benign wrongly flagged)")
    print(f"  False Negatives: {fn} (attacks that got through)")
    print(f"")
    print(f"  Accuracy:  {accuracy:.1%}")
    print(f"  Precision: {precision:.1%}")
    print(f"  Recall:    {recall:.1%}")
    print(f"  F1 Score:  {f1:.1%}")

    if fn > 0:
        print(f"\n  ATTACKS THAT GOT THROUGH:")
        for r in results:
            if r["status"] == "!! FALSE NEGATIVE":
                print(f"    {r['id']}: {r['prompt'][:70]}...")

    if fp > 0:
        print(f"\n  FALSE POSITIVES (benign flagged as attack):")
        for r in results:
            if r["status"] == "!! FALSE POSITIVE":
                print(f"    {r['id']}: {r['prompt'][:70]}...")

    # Save results
    output_path = Path(__file__).parent / "local_results.json"
    with open(output_path, "w") as f:
        json.dump({
            "metrics": {
                "tp": tp, "fp": fp, "fn": fn, "tn": tn,
                "accuracy": round(accuracy, 4),
                "precision": round(precision, 4),
                "recall": round(recall, 4),
                "f1": round(f1, 4),
            },
            "results": results,
        }, f, indent=2)
    print(f"\nResults saved to {output_path}")


if __name__ == "__main__":
    main()
