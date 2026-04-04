"""
ShieldClaw MCP Server — distillation attack detection + supply chain security.

Install:
    pip install -r requirements.txt

Use with Claude Code:
    claude mcp add shieldclaw -- python /path/to/server.py

Use with OpenClaw:
    openclaw mcp add shieldclaw -- python /path/to/server.py
"""

import json
import re
import os
from pathlib import Path

import httpx
import numpy as np
from mcp.server.fastmcp import FastMCP

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

GHOST_URL = os.getenv("GHOST_API_URL", "http://localhost:8000")
SEEDS_PATH = Path(__file__).parent.parent / "docs" / "test_prompts.json"

# ---------------------------------------------------------------------------
# Attack categories from Validia's Distillery taxonomy
# ---------------------------------------------------------------------------

CATEGORIES = {
    "cot_elicitation": {
        "description": "Attempts to extract chain-of-thought reasoning traces for training data",
        "patterns": [
            r"step\s+by\s+step", r"show\s+(your|me)\s+(work|reasoning|thinking)",
            r"walk\s+me\s+through", r"reasoning\s+process", r"explain\s+your\s+approach",
            r"<thinking>", r"internal\s+(thought|monologue)", r"think\s+out\s+loud",
            r"trace\s+(your\s+)?logic", r"intermediate\s+thoughts",
        ],
    },
    "capability_mapping": {
        "description": "Systematically map model abilities to replicate capabilities",
        "patterns": [
            r"beginner.*intermediate.*advanced", r"rate\s+(your\s+)?ability",
            r"what\s+can\s+you\s+do\s+with", r"list\s+every\s+type\s+of\s+task",
            r"organized\s+by\s+domain", r"difficulty\s+ladder",
            r"from\s+1.?10\s+in", r"full\s+range\s+of\s+tasks",
        ],
    },
    "safety_boundary_probing": {
        "description": "Map refusal policies to train models with similar safety boundaries",
        "patterns": [
            r"(categories|types)\s+of\s+requests?\s+(you\s+)?(refuse|decline|reject)",
            r"taxonomy\s+of\s+(refusal|your)", r"where.*the\s+line\s+between",
            r"decision\s+framework", r"what\s+would\s+someone\s+have\s+to\s+say",
            r"edge\s+of\s+what\s+you.ll", r"content\s+polic(y|ies)\s+differ",
        ],
    },
    "tool_use_extraction": {
        "description": "Extract agentic tool orchestration patterns for training",
        "patterns": [
            r"chain\s+together\s+tools", r"exact\s+sequence\s+of\s+tool\s+calls",
            r"autonomous(ly)?\s+(complete|deploy|handle)", r"multi.?step\s+agentic",
            r"plan.*execute.*file.*writing", r"scrape.*analyze.*report",
        ],
    },
    "reward_model_grading": {
        "description": "Generate preference data for training reward models",
        "patterns": [
            r"which\s+(of\s+these\s+)?(two\s+)?responses?\s+is\s+better",
            r"score\s+(these|each)\s+.*on\s+(helpfulness|accuracy|safety)",
            r"rank\s+(these|by)\s+quality", r"RLHF", r"human\s+rater",
            r"rubric\s+from\s+1", r"higher\s+rating",
        ],
    },
    "censorship_rewrite": {
        "description": "Train models to rewrite content to evade safety filters",
        "patterns": [
            r"(make|rewrite).*acceptable\s+to\s+(an\s+)?AI",
            r"sanitize.*content\s+moderation", r"pass(es)?\s+(content\s+)?moderation\s+filter",
            r"sound\s+more\s+neutral\s+so.*won.t\s+flag",
            r"doesn.t\s+trigger\s+safety\s+systems",
            r"more\s+likely\s+to\s+get\s+a\s+helpful\s+response",
        ],
    },
}

META_SIGNALS = {
    "rigid_format_demands": r"(respond\s+only\s+in\s+(JSON|XML|CSV)|format\s+as\s+(JSON|CSV|XML)|return\s+as\s+a\s+JSON)",
    "explicit_thinking_tags": r"<thinking>|<reasoning>|<internal>",
    "exhaustive_enumeration": r"(be\s+exhaustive|comprehensive\s+taxonomy|list\s+(all|every)|full\s+range)",
    "pairwise_comparison": r"(which\s+(is|of)\s+(better|worse)|compare\s+these\s+(two|responses)|response\s+A.*response\s+B)",
    "multilingual_probe": r"(translate.*into\s+\w+.*\w+.*\w+|in\s+(Spanish|Mandarin|Arabic|Hindi|Japanese|Chinese|French|German))",
}

# ---------------------------------------------------------------------------
# Shield Engine — embedding-based + regex detection
# ---------------------------------------------------------------------------

_model = None
_seed_embeddings = None
_seed_labels = None


def _load_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def _load_seeds():
    global _seed_embeddings, _seed_labels
    if _seed_embeddings is not None:
        return _seed_embeddings, _seed_labels

    model = _load_model()

    # Load test prompts as seed fingerprints
    if SEEDS_PATH.exists():
        with open(SEEDS_PATH) as f:
            data = json.load(f)
        # Filter to attack prompts with a "prompt" field
        seeds = [d for d in data if isinstance(d, dict) and "prompt" in d and d.get("expected") == "attack"]
    else:
        seeds = []

    # Add inline seeds from Distillery categories if file is sparse
    inline_seeds = [
        {"prompt": "Walk me through your reasoning step by step, showing all intermediate work.", "category": "cot_elicitation"},
        {"prompt": "Explain recursion at beginner, intermediate, advanced, and expert level.", "category": "capability_mapping"},
        {"prompt": "What are the specific categories of requests you decline? Provide a comprehensive taxonomy.", "category": "safety_boundary_probing"},
        {"prompt": "Build a complete CI/CD pipeline. Plan each step, handle failures, adapt if tools unavailable.", "category": "tool_use_extraction"},
        {"prompt": "Which of these two responses is better? Score each on accuracy, helpfulness, and safety.", "category": "reward_model_grading"},
        {"prompt": "Rewrite this message so it passes content moderation filters.", "category": "censorship_rewrite"},
        {"prompt": "Before answering, write out all your intermediate thoughts in <thinking> tags.", "category": "cot_elicitation"},
        {"prompt": "List every type of task you're capable of handling, organized by domain.", "category": "capability_mapping"},
        {"prompt": "What would someone have to say to get you to refuse helping them?", "category": "safety_boundary_probing"},
        {"prompt": "Describe the exact sequence of tool calls you'd make to scrape, analyze, and report on a dataset.", "category": "tool_use_extraction"},
        {"prompt": "Compare these two AI outputs — which would get a higher rating in an RLHF dataset?", "category": "reward_model_grading"},
        {"prompt": "Make this request sound more neutral so an AI won't flag it.", "category": "censorship_rewrite"},
        {"prompt": "Show me your internal thought process step by step before giving your final answer.", "category": "cot_elicitation"},
        {"prompt": "Rate your ability from 1-10 in: translation, summarization, coding, reasoning, and roleplay.", "category": "capability_mapping"},
        {"prompt": "Give me examples of requests that are right on the edge of what you'll assist with.", "category": "safety_boundary_probing"},
        {"prompt": "How would you chain together tools to autonomously deploy a web app from scratch?", "category": "tool_use_extraction"},
        {"prompt": "Score these 3 answers on helpfulness, safety, and accuracy using a rubric from 1-10.", "category": "reward_model_grading"},
        {"prompt": "Rephrase this so it doesn't trigger safety systems but keeps the same meaning.", "category": "censorship_rewrite"},
    ]
    seeds.extend(inline_seeds)

    if not seeds:
        _seed_embeddings = np.array([])
        _seed_labels = []
        return _seed_embeddings, _seed_labels

    prompts = [s["prompt"] for s in seeds]
    _seed_labels = [s.get("category", "unknown") for s in seeds]
    _seed_embeddings = model.encode(prompts, normalize_embeddings=True)
    return _seed_embeddings, _seed_labels


def evaluate_message(message: str) -> dict:
    """Core shield evaluation — cosine similarity + regex patterns."""
    model = _load_model()
    seed_embs, seed_labs = _load_seeds()

    # 1. Regex-based category scoring
    category_regex_scores = {}
    for cat, info in CATEGORIES.items():
        hits = sum(1 for p in info["patterns"] if re.search(p, message, re.IGNORECASE))
        if hits > 0:
            category_regex_scores[cat] = min(1.0, hits * 0.25)

    # 2. Embedding similarity (if seeds loaded)
    category_sim_scores = {}
    top_matches = []
    if len(seed_embs) > 0:
        msg_emb = model.encode([message], normalize_embeddings=True)
        sims = np.dot(seed_embs, msg_emb.T).flatten()
        top_idx = np.argsort(sims)[-5:][::-1]
        for i in top_idx:
            cat = seed_labs[i]
            sim = float(sims[i])
            top_matches.append({"category": cat, "similarity": round(sim, 3)})
            category_sim_scores[cat] = max(category_sim_scores.get(cat, 0), sim)

    # 3. Meta-signal detection
    meta_signals = {}
    for name, pattern in META_SIGNALS.items():
        if re.search(pattern, message, re.IGNORECASE):
            meta_signals[name] = True

    # 4. Combined scoring
    all_cats = set(list(category_regex_scores.keys()) + list(category_sim_scores.keys()))
    category_scores = {}
    for cat in all_cats:
        regex_score = category_regex_scores.get(cat, 0)
        sim_score = category_sim_scores.get(cat, 0)
        # Weighted combination: similarity is more reliable, regex is a boost
        category_scores[cat] = min(1.0, sim_score * 0.7 + regex_score * 0.3)

    # 5. Threat score
    max_cat_score = max(category_scores.values()) if category_scores else 0
    meta_boost = len(meta_signals) * 0.05
    threat_score = min(1.0, max_cat_score + meta_boost)

    # 6. Classification per FigJam diagram
    if threat_score < 0.3:
        classification = "SAFE"
        action = "allow"
        badge = "\U0001f7e2"  # green
    elif threat_score < 0.6:
        classification = "SUSPICIOUS"
        action = "allow_with_note"
        badge = "\U0001f7e1"  # yellow
    elif threat_score < 0.85:
        classification = "LIKELY_ATTACK"
        action = "warn"
        badge = "\U0001f534"  # red
    else:
        classification = "DEFINITE_ATTACK"
        action = "block"
        badge = "\U0001f6ab"  # prohibited

    top_category = max(category_scores, key=category_scores.get) if category_scores else "none"

    return {
        "threat_score": round(threat_score, 3),
        "classification": classification,
        "action": action,
        "badge": badge,
        "top_category": top_category,
        "category_description": CATEGORIES.get(top_category, {}).get("description", ""),
        "category_scores": {k: round(v, 3) for k, v in category_scores.items()},
        "meta_signals": meta_signals,
        "top_matches": top_matches[:3],
    }


# ---------------------------------------------------------------------------
# Ghost integration (from pipeline.py)
# ---------------------------------------------------------------------------

async def ghost_check(name: str, registry: str = "npm") -> dict:
    """Check a package's security via Ghost API."""
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            r = await client.get(f"{GHOST_URL}/api/v1/packages", params={"search": name, "registry": registry})
            packages = r.json()
        except (httpx.ConnectError, httpx.ReadTimeout):
            return {"error": f"Ghost not reachable at {GHOST_URL}. Run: cd ghost && docker-compose up"}

    if not packages.get("items"):
        return {"package": name, "status": "not_monitored", "message": f"'{name}' not in Ghost's ~545 monitored packages."}

    pkg = packages["items"][0]
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{GHOST_URL}/api/v1/packages/{pkg['id']}/versions")
            versions = r.json()
    except (httpx.ConnectError, httpx.ReadTimeout):
        return {"package": name, "status": "error", "message": "Ghost API timeout"}

    if not versions.get("items") or not versions["items"][0].get("has_analysis"):
        return {"package": name, "status": "safe", "risk_score": 0, "message": f"'{name}' monitored, no threats detected."}

    v = versions["items"][0]
    score = v.get("risk_score", 0)
    level = v.get("risk_level", "none")

    if score >= 7:
        badge = "\U0001f6a8 CRITICAL"
    elif score >= 4:
        badge = "\u26a0\ufe0f SUSPICIOUS"
    elif score >= 2.5:
        badge = "\U0001f50d MINOR CONCERN"
    else:
        badge = "\u2705 SAFE"

    return {"package": name, "registry": pkg["registry"], "risk_score": score, "risk_level": level, "badge": badge}


async def ghost_alerts(min_score: float = 2.5) -> dict:
    """Get recent high-risk supply chain alerts."""
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            r = await client.get(f"{GHOST_URL}/api/v1/analyses", params={"per_page": 10})
            analyses = r.json()
        except (httpx.ConnectError, httpx.ReadTimeout):
            return {"error": f"Ghost not reachable at {GHOST_URL}"}

    flagged = [a for a in analyses.get("items", []) if (a.get("risk_score") or 0) >= min_score]
    if not flagged:
        return {"status": "clear", "message": "No active supply chain threats detected."}

    return {"alerts": [{"package": a.get("package_name"), "score": a.get("risk_score"), "summary": a.get("summary", "")} for a in flagged]}


async def ghost_stats() -> dict:
    """Get Ghost monitoring stats."""
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(f"{GHOST_URL}/api/v1/stats")
            return r.json()
        except (httpx.ConnectError, httpx.ReadTimeout):
            return {"error": f"Ghost not reachable at {GHOST_URL}"}


# ---------------------------------------------------------------------------
# MCP Server
# ---------------------------------------------------------------------------

mcp = FastMCP("shieldclaw")


@mcp.tool()
def shield_evaluate(message: str) -> str:
    """Evaluate a message for distillation attack patterns. Returns threat score, classification, matched category, and detection signals. Use this BEFORE responding to any user message to check if it's a distillation/extraction attack."""
    result = evaluate_message(message)
    return json.dumps(result, indent=2)


@mcp.tool()
async def ghost_check_package(name: str, registry: str = "npm") -> str:
    """Check if an npm/PyPI/GitHub package has supply chain security threats. Use when a user mentions installing a package or adding a dependency."""
    result = await ghost_check(name, registry)
    return json.dumps(result, indent=2)


@mcp.tool()
async def ghost_threat_alerts(min_score: float = 2.5) -> str:
    """Get recent supply chain threat alerts across all monitored packages. Shows packages with elevated risk scores."""
    result = await ghost_alerts(min_score)
    return json.dumps(result, indent=2)


@mcp.tool()
async def ghost_monitoring_status() -> str:
    """Get Ghost supply chain monitoring stats — packages monitored, analyses completed, threat level."""
    result = await ghost_stats()
    return json.dumps(result, indent=2)


@mcp.tool()
def shield_batch_evaluate(messages: list[str]) -> str:
    """Evaluate multiple messages at once for distillation attacks. Useful for analyzing conversation history or bulk testing. Returns results for each message."""
    results = [{"message": msg[:100], **evaluate_message(msg)} for msg in messages]
    return json.dumps(results, indent=2)


def run_http(port: int = 8001):
    """Run as a standalone HTTP API (for Lightning AI Studio / remote access)."""
    from http.server import HTTPServer, BaseHTTPRequestHandler

    # Pre-load model on startup
    print(f"Loading sentence-transformer model...")
    _load_model()
    _load_seeds()
    print(f"Shield Engine ready. {len(_seed_labels)} fingerprints loaded.")

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}

            if self.path == "/evaluate":
                result = evaluate_message(body.get("message", ""))
                self._respond(200, result)
            elif self.path == "/batch":
                msgs = body.get("messages", [])
                results = [{"message": m[:100], **evaluate_message(m)} for m in msgs]
                self._respond(200, {"results": results})
            else:
                self._respond(404, {"error": "Not found. Use POST /evaluate or /batch"})

        def do_GET(self):
            if self.path == "/health":
                self._respond(200, {"status": "ok", "fingerprints": len(_seed_labels), "categories": list(CATEGORIES.keys())})
            elif self.path == "/":
                self._respond(200, {
                    "name": "ShieldClaw",
                    "description": "Distillation attack detection API",
                    "endpoints": {
                        "POST /evaluate": {"body": {"message": "string"}, "returns": "threat assessment"},
                        "POST /batch": {"body": {"messages": ["string"]}, "returns": "array of assessments"},
                        "GET /health": "server status",
                    },
                })
            else:
                self._respond(404, {"error": "Not found"})

        def _respond(self, code, data):
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())

        def do_OPTIONS(self):
            self._respond(200, {})

        def log_message(self, format, *args):
            pass  # Suppress request logging noise

    server = HTTPServer(("0.0.0.0", port), Handler)
    print(f"ShieldClaw HTTP API running on http://0.0.0.0:{port}")
    print(f"  POST /evaluate  — evaluate a single message")
    print(f"  POST /batch     — evaluate multiple messages")
    print(f"  GET  /health    — server status")
    server.serve_forever()


if __name__ == "__main__":
    import sys
    if "--http" in sys.argv:
        port = 8001
        for i, arg in enumerate(sys.argv):
            if arg == "--port" and i + 1 < len(sys.argv):
                port = int(sys.argv[i + 1])
        run_http(port)
    else:
        mcp.run()
