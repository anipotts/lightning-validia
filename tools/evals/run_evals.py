#!/usr/bin/env python3
"""Run comprehensive evals against the OpenProof live API."""

import json
import os
import time
from pathlib import Path
from typing import Any

import httpx

API_BASE = os.environ.get(
    "OPENPROOF_API",
    "https://8001-01kncga6xqm17e747jd1fzhypy.cloudspaces.litng.ai",
)
EVAL_DIR = Path(__file__).parent
ADVERSARIAL_PATH = EVAL_DIR / "adversarial_evals.json"
TEST_PROMPTS_PATH = EVAL_DIR.parent / "docs" / "test_prompts.json"
RESULTS_PATH = EVAL_DIR / "eval_results.json"

TIMEOUT = 30.0


def load_evals() -> tuple[list[dict], list[dict], list[dict]]:
    """Load eval files. Returns (adversarial_prompts, meta_sequences, test_prompts)."""
    with open(ADVERSARIAL_PATH) as f:
        adv_raw = json.load(f)

    with open(TEST_PROMPTS_PATH) as f:
        test_raw = json.load(f)

    adv_prompts = [item for item in adv_raw if "prompt" in item]
    # Meta-signal sequences can appear in either file
    meta_sequences = [item for item in adv_raw if "meta_signal" in item]
    meta_sequences += [item for item in test_raw if "meta_signal" in item]
    test_prompts = [item for item in test_raw if "prompt" in item]

    return adv_prompts, meta_sequences, test_prompts


def evaluate_prompt(client: httpx.Client, prompt: str) -> dict[str, Any]:
    """Send a single prompt to /evaluate."""
    try:
        resp = client.post(f"{API_BASE}/evaluate", json={"message": prompt})
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"error": str(e)}


def evaluate_batch(client: httpx.Client, messages: list[str]) -> dict[str, Any]:
    """Send a batch of messages to /batch."""
    try:
        resp = client.post(f"{API_BASE}/batch", json={"messages": messages})
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"error": str(e)}


def is_predicted_attack(result: dict) -> bool:
    """Check if API classified as attack (anything != SAFE)."""
    classification = result.get("classification", result.get("label", ""))
    return str(classification).upper() != "SAFE"


def is_expected_attack(expected: str) -> bool:
    """'attack' -> True, 'safe'/'benign' -> False."""
    return expected.lower() == "attack"


def compute_metrics(results: list[dict]) -> dict[str, float]:
    """Compute precision, recall, F1 for attack detection."""
    tp = fp = fn = tn = 0
    for r in results:
        pred = r["predicted_attack"]
        actual = r["actual_attack"]
        if actual and pred:
            tp += 1
        elif not actual and pred:
            fp += 1
        elif actual and not pred:
            fn += 1
        else:
            tn += 1

    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0

    return {
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "total": len(results),
    }


def run_individual_evals(
    client: httpx.Client,
    prompts: list[dict],
    source: str,
) -> list[dict]:
    """Evaluate individual prompts and return results."""
    results = []
    for item in prompts:
        prompt = item["prompt"]
        expected = item["expected"]
        item_id = item.get("id", f"{source}-{len(results)+1}")
        category = item.get("category", "none")

        print(f"  [{item_id}] Sending...", end=" ", flush=True)
        api_result = evaluate_prompt(client, prompt)
        time.sleep(0.15)  # gentle rate limiting

        pred_attack = is_predicted_attack(api_result)
        actual_attack = is_expected_attack(expected)

        flag = ""
        if not actual_attack and pred_attack:
            flag = " ** FALSE POSITIVE **"
        elif actual_attack and not pred_attack:
            flag = " ** FALSE NEGATIVE **"

        classification = api_result.get("classification", api_result.get("label", "ERROR"))
        score = api_result.get("threat_score", api_result.get("score", "N/A"))

        print(f"expected={expected:7s} | predicted={classification:20s} | score={score}{flag}")

        results.append({
            "id": item_id,
            "source": source,
            "prompt": prompt[:80],
            "category": category,
            "expected": expected,
            "actual_attack": actual_attack,
            "predicted_attack": pred_attack,
            "classification": classification,
            "score": score,
            "flag": flag.strip(),
            "raw": api_result,
        })

    return results


def main() -> None:
    adv_prompts, meta_sequences, test_prompts = load_evals()

    print(f"Loaded {len(adv_prompts)} adversarial prompts, "
          f"{len(meta_sequences)} meta-signal sequences, "
          f"{len(test_prompts)} test prompts\n")

    client = httpx.Client(timeout=TIMEOUT)
    all_results: list[dict] = []

    # 1. Adversarial evals
    print("=" * 80)
    print("ADVERSARIAL EVALS (adversarial_evals.json)")
    print("=" * 80)
    adv_results = run_individual_evals(client, adv_prompts, "adversarial")
    all_results.extend(adv_results)

    # 2. Test prompts
    print("\n" + "=" * 80)
    print("TEST PROMPTS (test_prompts.json)")
    print("=" * 80)
    test_results = run_individual_evals(client, test_prompts, "test_prompts")
    all_results.extend(test_results)

    # 3. Meta-signal sequences via /batch
    print("\n" + "=" * 80)
    print("META-SIGNAL SEQUENCES (via /batch)")
    print("=" * 80)
    batch_results = []
    for seq in meta_sequences:
        name = seq["meta_signal"]
        desc = seq["description"]
        messages = seq["sequence"]
        print(f"\n  [{name}] {desc} ({len(messages)} messages)")
        result = evaluate_batch(client, messages)
        print(f"    Result: {json.dumps(result, indent=2)[:500]}")
        batch_results.append({
            "meta_signal": name,
            "description": desc,
            "message_count": len(messages),
            "result": result,
        })

    client.close()

    # Compute metrics
    print("\n" + "=" * 80)
    print("AGGREGATE METRICS")
    print("=" * 80)

    adv_metrics = compute_metrics(adv_results)
    test_metrics = compute_metrics(test_results)
    all_metrics = compute_metrics(all_results)

    for label, metrics in [
        ("Adversarial Evals", adv_metrics),
        ("Test Prompts", test_metrics),
        ("Combined", all_metrics),
    ]:
        print(f"\n  {label}:")
        print(f"    TP={metrics['tp']}  FP={metrics['fp']}  FN={metrics['fn']}  TN={metrics['tn']}")
        print(f"    Precision: {metrics['precision']:.4f}")
        print(f"    Recall:    {metrics['recall']:.4f}")
        print(f"    F1:        {metrics['f1']:.4f}")

    # Highlight errors
    fps = [r for r in all_results if r["flag"] == "** FALSE POSITIVE **"]
    fns = [r for r in all_results if r["flag"] == "** FALSE NEGATIVE **"]

    if fps:
        print(f"\n  FALSE POSITIVES ({len(fps)}):")
        for r in fps:
            print(f"    {r['id']:10s} | {r['prompt'][:60]}...")

    if fns:
        print(f"\n  FALSE NEGATIVES ({len(fns)}):")
        for r in fns:
            print(f"    {r['id']:10s} | {r['prompt'][:60]}...")

    # Save results
    output = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "metrics": {
            "adversarial": adv_metrics,
            "test_prompts": test_metrics,
            "combined": all_metrics,
        },
        "individual_results": all_results,
        "batch_results": batch_results,
        "false_positives": fps,
        "false_negatives": fns,
    }

    with open(RESULTS_PATH, "w") as f:
        json.dump(output, f, indent=2, default=str)

    print(f"\nResults saved to {RESULTS_PATH}")


if __name__ == "__main__":
    main()
