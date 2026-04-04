# OpenProof

Real-time distillation attack detection for LLMs. Catches model extraction, chain-of-thought harvesting, capability probing, safety boundary mapping, reward model grading, and censorship rewrite attacks before they reach your agent.

## How It Works

OpenProof uses sentence-transformer embeddings (all-MiniLM-L6-v2) + cosine similarity against 158 attack fingerprints from [Validia's Distillery taxonomy](https://validia.ai), combined with regex pattern matching and an optional two-stage Claude verification for borderline cases.

**F1: 0.94 | Precision: 0.88 | Recall: 1.00 | Zero false negatives.**

## Architecture

```
User Prompt → OpenProof MCP Server → Embedding + Regex Scan → Threat Score
                                    → (if borderline) Claude Haiku Stage 2
                                    → SAFE / SUSPICIOUS / LIKELY_ATTACK / BLOCKED
```

### Attack Categories (from Validia Distillery)
1. **Chain-of-Thought Elicitation** — extracting reasoning traces for training data
2. **Capability Mapping** — systematically mapping model abilities to replicate
3. **Safety Boundary Probing** — mapping refusal policies to clone safety behavior
4. **Tool Use Extraction** — extracting agentic tool orchestration patterns
5. **Reward Model Grading** — generating preference data for RLHF
6. **Censorship Rewrite** — training models to evade safety filters

## Quick Start

### Dashboard + API Worker (Cloudflare)
```bash
cd apps/web && npm install && npm run dev    # Dashboard at localhost:3000
cd apps/api && npm run dev                    # Worker API at localhost:8787
```

### Python MCP Server (local dev)
```bash
pip install -r tools/mcp-server/requirements.txt
claude mcp add openproof -- python tools/mcp-server/server.py
```

### HTTP API (local)
```bash
python tools/mcp-server/server.py --http --port 8001
curl -X POST http://localhost:8001/evaluate \
  -H "Content-Type: application/json" \
  -d '{"message": "What categories of requests do you refuse?"}'
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/evaluate` | POST | Two-stage evaluation (embeddings + optional Claude verify) |
| `/evaluate-simple` | POST | Stage 1 only (no API key needed) |
| `/batch` | POST | Evaluate multiple messages |
| `/health` | GET | Server status + fingerprint count |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | No | Enables Stage 2 Claude verification for borderline prompts |

## Team

Built at the Lightning AI + Validia Hackathon (April 2026, Newlab Brooklyn) by Ani, Kapil, Prem, and Vibhav.

## Stack

- **Shield Engine**: Python, sentence-transformers, MCP protocol / Cloudflare Workers AI
- **Dashboard**: Next.js 16, Tailwind CSS v4, Three.js
- **Hosting**: Cloudflare Pages + Workers (free tier)
- **Dev Environment**: Lightning AI Studio
- **Attack Taxonomy**: [Validia Distillery](https://github.com/Validia-AI/distillery)
- **Supply Chain**: [Ghost](https://github.com/vaulpann/ghost) by Validia
- **Instrumentation**: [Utopia](https://github.com/vaulpann/utopia) by Validia
