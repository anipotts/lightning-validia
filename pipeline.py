"""
ShieldClaw Pipeline — connects to Ghost's REST API
for supply chain threat intelligence.

Usage:
    python pipeline.py check <package_name> [--registry npm|pypi|github]
    python pipeline.py stats
    python pipeline.py health
"""

import argparse
import json
import sys

import httpx

GHOST_URL = "http://localhost:8000"


def check_health():
    """Verify Ghost is running."""
    try:
        r = httpx.get(f"{GHOST_URL}/health", timeout=5)
        print(f"Ghost status: {r.json()}")
        return r.status_code == 200
    except httpx.ConnectError:
        print("ERROR: Ghost is not running. Start it with: cd ghost && docker-compose up")
        return False


def check_package(name: str, registry: str = "npm"):
    """Check a package's security status via Ghost."""
    if not check_health():
        return None

    # Search for the package
    r = httpx.get(
        f"{GHOST_URL}/api/v1/packages",
        params={"search": name, "registry": registry},
        timeout=30,
    )
    packages = r.json()

    if not packages.get("items"):
        print(f"Package '{name}' not found in Ghost's monitored list.")
        print("It may not be tracked yet. Ghost monitors ~545 critical packages.")
        return {"package": name, "status": "not_monitored"}

    package = packages["items"][0]
    package_id = package["id"]
    print(f"Found: {package['name']} ({package['registry']}) — ID: {package_id}")

    # Get latest analysis
    r = httpx.get(
        f"{GHOST_URL}/api/v1/analyses",
        params={"package_id": package_id},
        timeout=30,
    )
    analyses = r.json()

    if not analyses.get("items"):
        print("No analyses found for this package yet.")
        return {"package": name, "status": "no_analysis"}

    latest = analyses["items"][0]
    result = {
        "package": name,
        "registry": registry,
        "risk_score": latest.get("risk_score", 0),
        "risk_level": latest.get("risk_level", "unknown"),
        "status": latest.get("status"),
        "triage_flagged": latest.get("triage_flagged", False),
        "findings_count": len(latest.get("findings", [])),
    }

    # Print human-readable summary
    score = result["risk_score"]
    if score <= 1.0:
        badge = "SAFE"
    elif score <= 3.9:
        badge = "LOW RISK"
    elif score <= 6.0:
        badge = "SUSPICIOUS"
    elif score <= 8.0:
        badge = "HIGH RISK"
    else:
        badge = "CRITICAL"

    print(f"\n{'='*50}")
    print(f"  Package: {name}")
    print(f"  Risk Score: {score}/10.0 — {badge}")
    print(f"  Risk Level: {result['risk_level']}")
    print(f"  Findings: {result['findings_count']}")
    print(f"{'='*50}")

    return result


def get_stats():
    """Get Ghost monitoring stats for the dashboard."""
    if not check_health():
        return None

    r = httpx.get(f"{GHOST_URL}/api/v1/stats", timeout=10)
    stats = r.json()
    print(json.dumps(stats, indent=2))
    return stats


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ShieldClaw — Ghost Pipeline")
    sub = parser.add_subparsers(dest="command")

    check = sub.add_parser("check", help="Check a package's security")
    check.add_argument("name", help="Package name (e.g. express, requests)")
    check.add_argument("--registry", default="npm", choices=["npm", "pypi", "github"])

    sub.add_parser("stats", help="Get Ghost monitoring stats")
    sub.add_parser("health", help="Check if Ghost is running")

    args = parser.parse_args()

    if args.command == "check":
        check_package(args.name, args.registry)
    elif args.command == "stats":
        get_stats()
    elif args.command == "health":
        check_health()
    else:
        parser.print_help()
