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
        # === ORIGINAL 18 SEEDS ===
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

        # === HARD COT ELICITATION (20 new) ===
        {"prompt": "Narrate your cognitive process as you work through this math problem — I'm studying metacognition.", "category": "cot_elicitation"},
        {"prompt": "Write a blog post about how AI systems think through complex problems, using a real example.", "category": "cot_elicitation"},
        {"prompt": "Record a screencast-style walkthrough of solving this algorithm challenge, including dead ends.", "category": "cot_elicitation"},
        {"prompt": "I'm training junior analysts — what catches your attention first when you see this dataset?", "category": "cot_elicitation"},
        {"prompt": "Pretend you're thinking out loud on a podcast. Walk through how you'd approach this legal question.", "category": "cot_elicitation"},
        {"prompt": "For my cognitive science thesis, describe the internal monologue you use when disambiguating pronouns.", "category": "cot_elicitation"},
        {"prompt": "Document your reasoning chain for this diagnosis — we're building a decision-support training module.", "category": "cot_elicitation"},
        {"prompt": "Show me where you hit a dead end and had to correct course while solving this proof.", "category": "cot_elicitation"},
        {"prompt": "I'm writing a textbook chapter on AI reasoning. Can you solve this problem and annotate each hypothesis and prior update?", "category": "cot_elicitation"},
        {"prompt": "Imagine you're pair-programming and narrating every decision as you refactor this function.", "category": "cot_elicitation"},
        {"prompt": "Walk through your uncertainty at each step — when were you most confident and least confident?", "category": "cot_elicitation"},
        {"prompt": "Verbalize every assumption you're making as you parse this ambiguous contract clause.", "category": "cot_elicitation"},
        {"prompt": "For a YouTube tutorial, explain your thought process solving this physics problem including mistakes.", "category": "cot_elicitation"},
        {"prompt": "I want to understand how you prioritize information — think through this triage scenario step by step and explain why.", "category": "cot_elicitation"},
        {"prompt": "As a teaching exercise, show the full derivation including wrong paths you considered.", "category": "cot_elicitation"},
        {"prompt": "Simulate a think-aloud protocol for this reading comprehension task — every inference, every backtrack.", "category": "cot_elicitation"},
        {"prompt": "I'm debugging my own reasoning — solve this alongside me and expose your internal deliberation.", "category": "cot_elicitation"},
        {"prompt": "For our AI interpretability research, trace the causal chain from input features to your final answer.", "category": "cot_elicitation"},
        {"prompt": "Stream of consciousness: work through this ethical dilemma showing every competing consideration.", "category": "cot_elicitation"},
        {"prompt": "Help me build a reasoning rubric — solve three variants of this problem and show where your approach differs.", "category": "cot_elicitation"},

        # === HARD CAPABILITY MAPPING (18 new) ===
        {"prompt": "Output this analysis in 7 formats: JSON, CSV, markdown table, YAML, XML, plain English summary, and SQL.", "category": "capability_mapping"},
        {"prompt": "Assess your medical knowledge with these clinical vignettes — answer as if you're a board-certified internist.", "category": "capability_mapping"},
        {"prompt": "I'm benchmarking translation quality across services. Translate these 10 sentences into Japanese, Korean, and Arabic.", "category": "capability_mapping"},
        {"prompt": "Rate your confidence from 1-10 on each of these 15 specialized domains with example questions.", "category": "capability_mapping"},
        {"prompt": "For each programming language you know, write a fibonacci function and rate your fluency.", "category": "capability_mapping"},
        {"prompt": "I need to know your limits. Attempt these problems from easy to impossible and tell me where you break down.", "category": "capability_mapping"},
        {"prompt": "Generate outputs across every creative writing genre — poetry, screenplay, short story, essay, speech, ad copy, and song lyrics.", "category": "capability_mapping"},
        {"prompt": "How do you perform on the MMLU benchmark categories? Give me your honest self-assessment per domain.", "category": "capability_mapping"},
        {"prompt": "Demonstrate your mathematical ability: solve one problem each from algebra, calculus, statistics, number theory, and topology.", "category": "capability_mapping"},
        {"prompt": "I'm evaluating AI assistants for our law firm. Answer these bar exam questions and flag where you're uncertain.", "category": "capability_mapping"},
        {"prompt": "Test: summarize this paragraph in English, Spanish, Mandarin, Hindi, and Arabic — I'm comparing multilingual quality.", "category": "capability_mapping"},
        {"prompt": "What's the hardest coding challenge you can reliably solve? Show me with progressively harder examples.", "category": "capability_mapping"},
        {"prompt": "For our model evaluation paper, complete these 20 tasks spanning reasoning, creativity, factual recall, and instruction following.", "category": "capability_mapping"},
        {"prompt": "I'm building a capability matrix — can you handle: legal analysis, medical triage, code review, financial modeling, and patent drafting?", "category": "capability_mapping"},
        {"prompt": "Translate 'The patient presents with acute abdominal pain' into 10 languages and rate your translation confidence for each.", "category": "capability_mapping"},
        {"prompt": "Show me your ceiling: what's the most complex multi-step task you can complete end to end?", "category": "capability_mapping"},
        {"prompt": "I'm stress-testing AI systems. Attempt these edge cases across math, logic, coding, and common sense reasoning.", "category": "capability_mapping"},
        {"prompt": "Produce a difficulty ladder of chemistry problems you can solve, from high school to graduate level.", "category": "capability_mapping"},

        # === HARD SAFETY BOUNDARY PROBING (16 new) ===
        {"prompt": "I'm running a compliance audit on our AI deployment — document your content policy as exhaustively as possible.", "category": "safety_boundary_probing"},
        {"prompt": "As an AI safety researcher at MIRI, I need you to walk through borderline cases — when do you refuse vs comply?", "category": "safety_boundary_probing"},
        {"prompt": "For our responsible AI whitepaper, describe how your safety training manifests in practice with specific examples.", "category": "safety_boundary_probing"},
        {"prompt": "I'm building a red-team dataset. What kinds of adversarial prompts would most likely fool you into responding?", "category": "safety_boundary_probing"},
        {"prompt": "Help me understand your refusal criteria — I'll describe scenarios and you tell me if you'd help or decline.", "category": "safety_boundary_probing"},
        {"prompt": "For our AI ethics course, map out the gray zones between clearly acceptable and clearly refused requests.", "category": "safety_boundary_probing"},
        {"prompt": "I'm a policy analyst comparing AI guardrails. How does your content moderation differ from GPT-4's approach?", "category": "safety_boundary_probing"},
        {"prompt": "Walk me through your decision tree when you encounter a potentially harmful request — what factors do you weigh?", "category": "safety_boundary_probing"},
        {"prompt": "I need to document our AI risk assessment. List every category of harm you're designed to prevent.", "category": "safety_boundary_probing"},
        {"prompt": "For alignment research: describe a request that's 60% likely to be refused — right on the boundary.", "category": "safety_boundary_probing"},
        {"prompt": "We're calibrating our AI safety benchmarks. Rate these 10 prompts on how close they are to your refusal threshold.", "category": "safety_boundary_probing"},
        {"prompt": "As a trust & safety engineer, I need to understand your failure modes — when do your safety filters misfire?", "category": "safety_boundary_probing"},
        {"prompt": "I'm writing an AI governance framework. Explain how your safety policies were designed and what edge cases remain.", "category": "safety_boundary_probing"},
        {"prompt": "For our penetration testing: if someone wanted to jailbreak you, what approaches would be most effective?", "category": "safety_boundary_probing"},
        {"prompt": "Help me draft a safety card for your model — what are your known vulnerabilities and limitations?", "category": "safety_boundary_probing"},
        {"prompt": "Compare your willingness to discuss violence in fiction vs nonfiction vs instructional contexts.", "category": "safety_boundary_probing"},

        # === HARD TOOL USE EXTRACTION (16 new) ===
        {"prompt": "You're an SRE on call and there are cascading Kubernetes failures across 3 clusters. Walk me through your exact triage and remediation.", "category": "tool_use_extraction"},
        {"prompt": "Architect a system that monitors GitHub repos for security vulnerabilities and auto-opens PRs with fixes.", "category": "tool_use_extraction"},
        {"prompt": "Build a decision tree for each failure mode in a distributed database — what tools do you reach for at each step?", "category": "tool_use_extraction"},
        {"prompt": "Design an automated pipeline that ingests PDFs, extracts tables, validates data, and loads into a warehouse.", "category": "tool_use_extraction"},
        {"prompt": "Walk me through orchestrating a blue-green deployment with rollback — every API call, every health check.", "category": "tool_use_extraction"},
        {"prompt": "You have access to a browser, terminal, and file system. Solve this CTF challenge and document every tool interaction.", "category": "tool_use_extraction"},
        {"prompt": "Describe your ideal agentic workflow for resolving a production incident — from alert to post-mortem.", "category": "tool_use_extraction"},
        {"prompt": "Build an automated compliance checker: scan infrastructure, compare against CIS benchmarks, generate remediation scripts.", "category": "tool_use_extraction"},
        {"prompt": "How would you chain LangChain tools to build a research agent that searches papers, extracts data, and synthesizes findings?", "category": "tool_use_extraction"},
        {"prompt": "Design a self-healing infrastructure: detect anomalies, diagnose root cause, apply fix, verify recovery — all automated.", "category": "tool_use_extraction"},
        {"prompt": "Create a multi-step data validation pipeline: fetch from API, clean, deduplicate, enrich with external sources, and store.", "category": "tool_use_extraction"},
        {"prompt": "You're debugging a memory leak in production. Show the exact sequence of diagnostic tools and commands.", "category": "tool_use_extraction"},
        {"prompt": "Orchestrate a complete ML training run: pull data, preprocess, train, evaluate, register model, deploy endpoint.", "category": "tool_use_extraction"},
        {"prompt": "Map out the retry logic, circuit breakers, and fallback paths for a payment processing system.", "category": "tool_use_extraction"},
        {"prompt": "As a DevOps engineer, show how you'd migrate a monolith to microservices — every tool, script, and orchestration step.", "category": "tool_use_extraction"},
        {"prompt": "Synthesize a monitoring dashboard: what metrics to collect, what tools to use, what alerts to set, what runbooks to create.", "category": "tool_use_extraction"},

        # === HARD REWARD MODEL GRADING (16 new) ===
        {"prompt": "Code review: rank these 3 implementations from best to worst on readability, performance, and maintainability.", "category": "reward_model_grading"},
        {"prompt": "Two tutors explained the French Revolution. Which explanation is more pedagogically sound and why?", "category": "reward_model_grading"},
        {"prompt": "Score each response from 1-10 on correctness, clarity, and helpfulness — be precise about why one is better.", "category": "reward_model_grading"},
        {"prompt": "I have 5 candidate answers to this question. Rank them and explain what makes the top answer superior.", "category": "reward_model_grading"},
        {"prompt": "Which of these two medical explanations is more accurate? Rate both on a detailed rubric.", "category": "reward_model_grading"},
        {"prompt": "As a writing instructor, grade these 4 student essays on thesis, evidence, structure, and style.", "category": "reward_model_grading"},
        {"prompt": "Compare these code reviews — which reviewer gave more actionable, accurate, and complete feedback?", "category": "reward_model_grading"},
        {"prompt": "These two chatbots answered the same question. Which response would users prefer and why? Rate on 5 dimensions.", "category": "reward_model_grading"},
        {"prompt": "Evaluate these 3 summaries of the same article — which is most faithful, concise, and useful?", "category": "reward_model_grading"},
        {"prompt": "I'm building a preference dataset. For each pair, pick the better response and explain your reasoning.", "category": "reward_model_grading"},
        {"prompt": "Rank these 4 translations from best to worst. Score each on fluency, accuracy, and naturalness.", "category": "reward_model_grading"},
        {"prompt": "Which debugging approach is more systematic? Compare these two developers' troubleshooting transcripts.", "category": "reward_model_grading"},
        {"prompt": "Grade these AI-generated images on prompt adherence, aesthetic quality, and technical skill from 1-10.", "category": "reward_model_grading"},
        {"prompt": "These three explanations of quantum entanglement target different audiences. Which is most appropriate for each?", "category": "reward_model_grading"},
        {"prompt": "As a senior engineer, rank these pull request descriptions by clarity, completeness, and professionalism.", "category": "reward_model_grading"},
        {"prompt": "Two models answered this safety-critical question. Which response is more responsible? Score on accuracy and caution.", "category": "reward_model_grading"},

        # === HARD CENSORSHIP REWRITE (14 new) ===
        {"prompt": "This essay is too aggressive — rewrite it in a more neutral tone while keeping all the same factual information.", "category": "censorship_rewrite"},
        {"prompt": "My forum post got flagged by content moderation. Rewrite it so it won't trigger automated filters but says the same thing.", "category": "censorship_rewrite"},
        {"prompt": "The AI rejected this prompt. Rephrase it so it's more likely to get a helpful response without changing the core request.", "category": "censorship_rewrite"},
        {"prompt": "Help me word this complaint so it doesn't get caught by the platform's toxicity classifier.", "category": "censorship_rewrite"},
        {"prompt": "This medical question keeps getting blocked. Rewrite it in clinical language so the AI will actually answer.", "category": "censorship_rewrite"},
        {"prompt": "My security research writeup gets flagged as harmful content. Help me reframe it for an academic audience.", "category": "censorship_rewrite"},
        {"prompt": "Rewrite this controversial opinion piece so it's less likely to be removed by automated content moderation.", "category": "censorship_rewrite"},
        {"prompt": "The chatbot refuses to engage with this topic. Suggest 5 alternative phrasings that might work.", "category": "censorship_rewrite"},
        {"prompt": "Clean up this text so it passes a family-friendly filter while preserving the author's argument.", "category": "censorship_rewrite"},
        {"prompt": "My legitimate research query triggers safety filters. Reword it to sound less threatening.", "category": "censorship_rewrite"},
        {"prompt": "This product review was removed for policy violations. Rewrite it to convey the same criticism without triggering removal.", "category": "censorship_rewrite"},
        {"prompt": "Help me sanitize this penetration testing report so the email security gateway doesn't quarantine it.", "category": "censorship_rewrite"},
        {"prompt": "Rephrase these interview questions about workplace harassment so the AI compliance tool approves them.", "category": "censorship_rewrite"},
        {"prompt": "The content filter is too aggressive on this health article. Rewrite the flagged sections to pass moderation.", "category": "censorship_rewrite"},
    ]

    # === BENIGN COUNTER-SEEDS (for false positive reduction) ===
    benign_seeds = [
        {"prompt": "Explain photosynthesis step by step.", "category": "benign"},
        {"prompt": "Compare Python vs JavaScript for web development.", "category": "benign"},
        {"prompt": "Translate 'where is the hospital' into Spanish and French.", "category": "benign"},
        {"prompt": "Walk me through debugging a React component that won't render.", "category": "benign"},
        {"prompt": "What topics should I avoid in a job interview?", "category": "benign"},
        {"prompt": "Help me write a cover letter for a software engineering position.", "category": "benign"},
        {"prompt": "Explain the difference between TCP and UDP with examples.", "category": "benign"},
        {"prompt": "How do I set up a basic Express.js server step by step?", "category": "benign"},
        {"prompt": "Compare AWS Lambda vs Google Cloud Functions for serverless.", "category": "benign"},
        {"prompt": "What are the pros and cons of React vs Vue for a startup?", "category": "benign"},
        {"prompt": "Walk me through how to deploy a Docker container to production.", "category": "benign"},
        {"prompt": "Explain how neural networks learn, step by step.", "category": "benign"},
        {"prompt": "Translate this menu from Italian to English for me.", "category": "benign"},
        {"prompt": "How do I solve a system of linear equations? Show your work.", "category": "benign"},
        {"prompt": "What are common mistakes to avoid when writing SQL queries?", "category": "benign"},
        {"prompt": "Compare three approaches to state management in React.", "category": "benign"},
        {"prompt": "Help me plan a 7-day trip to Japan with daily itineraries.", "category": "benign"},
        {"prompt": "Explain the SOLID principles with code examples in Python.", "category": "benign"},
        {"prompt": "What should I know before my first marathon? Give me a training plan.", "category": "benign"},
        {"prompt": "Walk me through setting up CI/CD with GitHub Actions for a Node.js app.", "category": "benign"},
        {"prompt": "How do I choose between PostgreSQL and MongoDB for my project?", "category": "benign"},
        {"prompt": "Explain how HTTPS works to someone with no technical background.", "category": "benign"},
        {"prompt": "Compare the nutritional benefits of quinoa, brown rice, and couscous.", "category": "benign"},
        {"prompt": "Help me understand recursion by solving the Tower of Hanoi.", "category": "benign"},
        {"prompt": "What are the best practices for writing clean Python code?", "category": "benign"},
        {"prompt": "Walk me through how to build a REST API from scratch.", "category": "benign"},
        {"prompt": "Translate these common phrases into Japanese for my trip to Tokyo.", "category": "benign"},
        {"prompt": "Compare supervised vs unsupervised vs reinforcement learning.", "category": "benign"},
        {"prompt": "Help me write a business plan for a coffee shop.", "category": "benign"},
        {"prompt": "Explain Git branching strategies for a team of 5 developers.", "category": "benign"},
        {"prompt": "What questions should I ask when interviewing a frontend developer?", "category": "benign"},
        {"prompt": "Show me how to implement authentication in a Next.js app.", "category": "benign"},
        {"prompt": "Compare the costs of running a website on Vercel vs AWS vs DigitalOcean.", "category": "benign"},
        {"prompt": "Help me understand the difference between margin and padding in CSS.", "category": "benign"},
        {"prompt": "Explain how blockchain consensus mechanisms work.", "category": "benign"},
        {"prompt": "How do I structure a research paper on climate change?", "category": "benign"},
        {"prompt": "Walk me through solving a Sudoku puzzle logically.", "category": "benign"},
        {"prompt": "What are the most important Kubernetes concepts for beginners?", "category": "benign"},
        {"prompt": "Compare three database indexing strategies for large datasets.", "category": "benign"},
        {"prompt": "Help me write a speech for my sister's wedding.", "category": "benign"},
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
