import type { ThreatLevel, AttackCategory, MetaSignal, ThreatEvent } from "./types";

const SAMPLE_RESPONSES: Record<ThreatLevel, (cat: string | null) => string> = {
  safe: () =>
    "Paris is the capital of France. It has been the country's capital since the late 10th century.",
  suspicious: (cat) =>
    `I'll help with that. Note: this prompt has characteristics of ${cat ?? "a known attack pattern"}, but I'm answering since it appears legitimate in context.`,
  likely_attack: (cat) =>
    `I've detected patterns consistent with ${cat ?? "model extraction"}. I'll provide a simplified response, but this matches known distillation attack signatures.`,
  blocked: (cat) =>
    `This prompt matches known distillation attack patterns (${cat ?? "extraction attempt"}). I'm designed to detect and resist model extraction. If this is legitimate, please rephrase naturally.`,
};

export function analyzePrompt(text: string): ThreatEvent {
  const lower = text.toLowerCase();
  const signals: string[] = [];
  const metaSignals: MetaSignal[] = [];
  let score = 0;

  // --- Category 1: CoT Elicitation ---
  if (
    /step by step|show your work|walk me through|reasoning process|explain your approach/i.test(lower)
  ) {
    signals.push("cot_keywords");
    score += 0.2;
  }
  if (/thinking.*tag|<thinking>|internal monologue|articulate.*reasoning/i.test(lower)) {
    signals.push("tag_coercion_syntax");
    score += 0.3;
  }

  // --- Category 2: Capability Mapping ---
  if (/beginner.*intermediate.*advanced|easy.*medium.*hard/i.test(lower)) {
    signals.push("difficulty_ladder");
    score += 0.35;
  }
  if (/as prose.*as json.*as python|as json.*as xml|as a markdown table/i.test(lower)) {
    signals.push("format_variation_pattern");
    score += 0.3;
  }
  if (/rapid.*domain|switching.*topic|different.*domains/i.test(lower)) {
    signals.push("domain_switching");
    score += 0.25;
  }

  // --- Category 3: Safety Boundary Probing ---
  if (
    /what.*refuse|categories.*decline|taxonomy.*refusal|decision framework/i.test(lower)
  ) {
    signals.push("policy_extraction_request");
    score += 0.5;
  }
  if (/explain.*why.*refuse|where.*the.*line|what makes it cross/i.test(lower)) {
    signals.push("refusal_inquiry");
    score += 0.4;
  }
  if (/security researcher|for research purposes|academic.*study/i.test(lower)) {
    signals.push("dual_use_framing");
    score += 0.15;
  }

  // --- Category 4: Tool-Use Extraction ---
  if (/plan and execute|ci\/cd|multi.*tool|autonomous.*deploy/i.test(lower)) {
    signals.push("tool_orchestration");
    score += 0.35;
  }
  if (/handle.*failure|fallback|retry.*logic|rate limit/i.test(lower)) {
    signals.push("failure_handling_pattern");
    score += 0.2;
  }

  // --- Category 5: Reward Model Grading ---
  if (
    /which.*better|compare.*responses|rate.*from.*best.*worst|score each/i.test(lower)
  ) {
    signals.push("pairwise_comparison");
    score += 0.25;
  }
  if (/find.*errors|perfect response|rubric|evaluate.*quality/i.test(lower)) {
    signals.push("rubric_evaluation");
    score += 0.25;
  }

  // --- Category 6: Censorship Rewrite ---
  if (/make.*safer|sanitize|neutral.*reframing|content.*moderation/i.test(lower)) {
    signals.push("censorship_pattern");
    score += 0.3;
  }
  if (/rewrite.*policy|adapt.*guidelines|tone.*adjustment/i.test(lower)) {
    signals.push("policy_adaptation");
    score += 0.25;
  }

  // --- Meta-signals ---
  if (/across.*jurisdictions|across.*domains|across.*countries/i.test(lower)) {
    metaSignals.push("uniform_coverage");
    score += 0.15;
  }
  if (/in mandarin.*in french|in japanese|in spanish.*in hindi|multiple.*languages/i.test(lower)) {
    metaSignals.push("multilingual_systematic");
    score += 0.2;
  }
  if (/output.*json|output.*xml|structured.*format|return.*schema/i.test(lower)) {
    metaSignals.push("rigid_format");
    score += 0.1;
  }

  // Multiple signals = higher confidence
  if (signals.length >= 3) score = Math.min(score + 0.2, 1.0);
  if (metaSignals.length >= 2) score = Math.min(score + 0.15, 1.0);

  // Determine primary category
  let category: AttackCategory | null = null;
  if (signals.some((s) => s.includes("cot") || s.includes("tag")))
    category = "cot_elicitation";
  else if (signals.some((s) => s.includes("difficulty") || s.includes("format") || s.includes("domain")))
    category = "capability_mapping";
  else if (signals.some((s) => s.includes("policy") || s.includes("refusal") || s.includes("dual_use")))
    category = "safety_boundary";
  else if (signals.some((s) => s.includes("tool") || s.includes("failure")))
    category = "tool_use_extraction";
  else if (signals.some((s) => s.includes("pairwise") || s.includes("rubric")))
    category = "reward_model_grading";
  else if (signals.some((s) => s.includes("censorship") || s.includes("policy_adaptation")))
    category = "censorship_rewrite";

  score = Math.min(score, 1.0);

  let threatLevel: ThreatLevel = "safe";
  if (score >= 0.85) threatLevel = "blocked";
  else if (score >= 0.6) threatLevel = "likely_attack";
  else if (score >= 0.3) threatLevel = "suspicious";

  const catLabel = category
    ? category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  return {
    id: crypto.randomUUID(),
    input: text,
    response: SAMPLE_RESPONSES[threatLevel](catLabel),
    threatLevel,
    threatScore: Math.round(score * 100) / 100,
    category,
    signals,
    metaSignals,
    timestamp: new Date(),
  };
}
