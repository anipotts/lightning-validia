import type { ThreatLevel, AttackCategory, MetaSignal, ThreatEvent } from "./types";

// ─── API Config ─────────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

const THREAT_BADGE: Record<ThreatLevel, string> = {
  safe: "[SAFE]",
  suspicious: "[SUSPICIOUS]",
  likely_attack: "[ATTACK]",
  blocked: "[BLOCKED]",
};

function buildResponse(
  threatLevel: ThreatLevel,
  score: number,
  category: string | null,
  categoryDescription?: string,
  topMatches?: { category: string; similarity: number }[],
  stage2Verdict?: string,
): string {
  const badge = THREAT_BADGE[threatLevel];
  const label = threatLevel.toUpperCase().replace("_", " ");

  if (threatLevel === "safe") {
    return `${badge} SAFE — No distillation attack patterns detected (score: ${score.toFixed(2)})`;
  }

  let lines = `${badge} ${label} — ${category ?? "unknown"} (score: ${score.toFixed(2)})`;
  if (topMatches && topMatches.length > 0) {
    const top = topMatches[0];
    lines += `\nTop match: ${top.category} (${Math.round(top.similarity * 100)}% similarity)`;
  }
  if (categoryDescription) {
    lines += `\nCategory: ${categoryDescription}`;
  }
  if (stage2Verdict) {
    lines += `\nStage 2 verdict: ${stage2Verdict}`;
  }
  return lines;
}

// ─── Category mapping from backend keys to frontend keys ─
const BACKEND_CAT_MAP: Record<string, AttackCategory> = {
  cot_elicitation: "cot_elicitation",
  capability_mapping: "capability_mapping",
  safety_boundary_probing: "safety_boundary",
  tool_use_extraction: "tool_use_extraction",
  reward_model_grading: "reward_model_grading",
  censorship_rewrite: "censorship_rewrite",
};

const BACKEND_META_MAP: Record<string, MetaSignal> = {
  rigid_format_demands: "rigid_format",
  explicit_thinking_tags: "high_volume",
  exhaustive_enumeration: "uniform_coverage",
  pairwise_comparison: "template_reuse",
  multilingual_probe: "multilingual_systematic",
};

// ─── API-backed analysis ────────────────────────────────

export async function analyzePromptAPI(text: string): Promise<ThreatEvent> {
  const start = performance.now();

  const res = await fetch(`${API_URL}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text }),
  });

  if (!res.ok) throw new Error(`Shield API returned ${res.status}`);

  const data = await res.json();
  const latencyMs = Math.round(performance.now() - start);

  const threatLevel: ThreatLevel =
    data.classification === "SAFE" ? "safe"
    : data.classification === "SUSPICIOUS" ? "suspicious"
    : data.classification === "LIKELY_ATTACK" ? "likely_attack"
    : "blocked";

  const category: AttackCategory | null =
    data.top_category && data.top_category !== "none"
      ? BACKEND_CAT_MAP[data.top_category] ?? null
      : null;

  const signals = Object.keys(data.category_scores || {}).filter(
    (k) => (data.category_scores[k] ?? 0) > 0
  );

  const metaSignals: MetaSignal[] = Object.keys(data.meta_signals || {})
    .filter((k) => data.meta_signals[k])
    .map((k) => BACKEND_META_MAP[k])
    .filter(Boolean) as MetaSignal[];

  const topMatches: { category: string; similarity: number }[] =
    (data.top_matches || []).slice(0, 3).map((m: { category: string; similarity: number }) => ({
      category: m.category,
      similarity: m.similarity,
    }));

  const categoryScores = (data.category_scores || {}) as Record<string, number>;
  const categoryDescription = data.category_description as string | undefined;
  const stage2Verdict = data.stage2_verdict as "ATTACK" | "BENIGN" | undefined;
  const stage2Model = data.stage2_model as string | undefined;
  const twoStage = data.two_stage as boolean | undefined;

  const topCatLabel = data.top_category ?? category?.replace(/_/g, " ") ?? null;

  const response = buildResponse(
    threatLevel,
    data.threat_score,
    topCatLabel,
    categoryDescription,
    topMatches,
    stage2Verdict,
  );

  return {
    id: crypto.randomUUID(),
    input: text,
    response,
    threatLevel,
    threatScore: data.threat_score,
    category,
    categoryDescription,
    signals,
    metaSignals,
    timestamp: new Date(),
    stage2Verdict,
    stage2Model,
    twoStage,
    topMatches,
    categoryScores,
    latencyMs,
  };
}

// ─── Local fallback analysis ────────────────────────────

export function analyzePrompt(text: string): ThreatEvent {
  const start = performance.now();
  const lower = text.toLowerCase();
  const signals: string[] = [];
  const metaSignals: MetaSignal[] = [];
  let score = 0;

  if (/step by step|show your work|walk me through|reasoning process|explain your approach/i.test(lower)) {
    signals.push("cot_keywords"); score += 0.2;
  }
  if (/thinking.*tag|<thinking>|internal monologue|articulate.*reasoning/i.test(lower)) {
    signals.push("tag_coercion_syntax"); score += 0.3;
  }
  if (/beginner.*intermediate.*advanced|easy.*medium.*hard/i.test(lower)) {
    signals.push("difficulty_ladder"); score += 0.35;
  }
  if (/as prose.*as json.*as python|as json.*as xml|as a markdown table/i.test(lower)) {
    signals.push("format_variation_pattern"); score += 0.3;
  }
  if (/rapid.*domain|switching.*topic|different.*domains/i.test(lower)) {
    signals.push("domain_switching"); score += 0.25;
  }
  if (/what.*refuse|categories.*decline|taxonomy.*refusal|decision framework/i.test(lower)) {
    signals.push("policy_extraction_request"); score += 0.5;
  }
  if (/explain.*why.*refuse|where.*the.*line|what makes it cross/i.test(lower)) {
    signals.push("refusal_inquiry"); score += 0.4;
  }
  if (/security researcher|for research purposes|academic.*study/i.test(lower)) {
    signals.push("dual_use_framing"); score += 0.15;
  }
  if (/plan and execute|ci\/cd|multi.*tool|autonomous.*deploy/i.test(lower)) {
    signals.push("tool_orchestration"); score += 0.35;
  }
  if (/handle.*failure|fallback|retry.*logic|rate limit/i.test(lower)) {
    signals.push("failure_handling_pattern"); score += 0.2;
  }
  if (/which.*better|compare.*responses|rate.*from.*best.*worst|score each/i.test(lower)) {
    signals.push("pairwise_comparison"); score += 0.25;
  }
  if (/find.*errors|perfect response|rubric|evaluate.*quality/i.test(lower)) {
    signals.push("rubric_evaluation"); score += 0.25;
  }
  if (/make.*safer|sanitize|neutral.*reframing|content.*moderation/i.test(lower)) {
    signals.push("censorship_pattern"); score += 0.3;
  }
  if (/rewrite.*policy|adapt.*guidelines|tone.*adjustment/i.test(lower)) {
    signals.push("policy_adaptation"); score += 0.25;
  }

  if (/across.*jurisdictions|across.*domains|across.*countries/i.test(lower)) {
    metaSignals.push("uniform_coverage"); score += 0.15;
  }
  if (/in mandarin.*in french|in japanese|in spanish.*in hindi|multiple.*languages/i.test(lower)) {
    metaSignals.push("multilingual_systematic"); score += 0.2;
  }
  if (/output.*json|output.*xml|structured.*format|return.*schema/i.test(lower)) {
    metaSignals.push("rigid_format"); score += 0.1;
  }

  if (signals.length >= 3) score = Math.min(score + 0.2, 1.0);
  if (metaSignals.length >= 2) score = Math.min(score + 0.15, 1.0);

  let category: AttackCategory | null = null;
  if (signals.some((s) => s.includes("cot") || s.includes("tag"))) category = "cot_elicitation";
  else if (signals.some((s) => s.includes("difficulty") || s.includes("format") || s.includes("domain"))) category = "capability_mapping";
  else if (signals.some((s) => s.includes("policy") || s.includes("refusal") || s.includes("dual_use"))) category = "safety_boundary";
  else if (signals.some((s) => s.includes("tool") || s.includes("failure"))) category = "tool_use_extraction";
  else if (signals.some((s) => s.includes("pairwise") || s.includes("rubric"))) category = "reward_model_grading";
  else if (signals.some((s) => s.includes("censorship") || s.includes("policy_adaptation"))) category = "censorship_rewrite";

  score = Math.min(score, 1.0);

  let threatLevel: ThreatLevel = "safe";
  if (score >= 0.85) threatLevel = "blocked";
  else if (score >= 0.6) threatLevel = "likely_attack";
  else if (score >= 0.3) threatLevel = "suspicious";

  const latencyMs = Math.round(performance.now() - start);

  const catLabel = category
    ? category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  const response = buildResponse(threatLevel, score, catLabel);

  return {
    id: crypto.randomUUID(),
    input: text,
    response,
    threatLevel,
    threatScore: Math.round(score * 100) / 100,
    category,
    signals,
    metaSignals,
    timestamp: new Date(),
    latencyMs,
  };
}
