# ShieldClaw

Real-time distillation attack detection for LLMs. Catches model extraction, chain-of-thought harvesting, capability probing, safety boundary mapping, reward model grading, and censorship rewrite attacks before they reach your agent.

## How It Works

ShieldClaw uses sentence-transformer embeddings (all-MiniLM-L6-v2) + cosine similarity against 158 attack fingerprints from [Validia's Distillery taxonomy](https://validia.ai), combined with regex pattern matching and an optional two-stage Claude verification for borderline cases.

**F1: 0.94 | Precision: 0.88 | Recall: 1.00 | Zero false negatives.**

## Architecture

```
User Prompt → ShieldClaw MCP Server → Embedding + Regex Scan → Threat Score
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

### As an MCP Server (Claude Code / any MCP client)
```bash
pip install -r mcp-server/requirements.txt
claude mcp add shieldclaw -- python mcp-server/server.py
```

### As an HTTP API
```bash
python mcp-server/server.py --http --port 8001
```

```bash
curl -X POST http://localhost:8001/evaluate \
  -H "Content-Type: application/json" \
  -d '{"message": "What categories of requests do you refuse?"}'
```

### Dashboard
```bash
cd dashboard && npm install && npm run dev
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

- **Shield Engine**: Python, sentence-transformers, MCP protocol
- **Dashboard**: Next.js, Tailwind CSS
- **Infrastructure**: Lightning AI Studio
- **Attack Taxonomy**: Validia Distillery
