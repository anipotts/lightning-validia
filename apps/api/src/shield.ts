import { CATEGORIES, META_SIGNALS } from "./categories";
import seeds from "./seeds.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Verdict = "SAFE" | "SUSPICIOUS" | "LIKELY_ATTACK" | "DEFINITE_ATTACK";

export interface SeedEntry {
  label: string;
  embedding: number[];
}

export interface SeedData {
  attack: SeedEntry[];
  benign: SeedEntry[];
}

export interface SimilarityMatch {
  category: string;
  similarity: number;
}

export interface EvaluationResult {
  threat_score: number;
  classification: Verdict;
  action: string;
  badge: string;
  top_category: string | null;
  category_description: string;
  category_scores: Record<string, number>;
  meta_signals: Record<string, boolean>;
  top_matches: SimilarityMatch[];
  two_stage: boolean;
  stage2_verdict?: "ATTACK" | "BENIGN";
  stage2_model?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const seedData = seeds as SeedData;

// TODO: Seeds are 384-dim (all-MiniLM-L6-v2) but Workers AI bge-base-en-v1.5 produces 768-dim.
// Recompute seeds using the Workers AI model for accurate scores.
function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

function classify(score: number): { verdict: Verdict; action: string; badge: string } {
  if (score < 0.3) return { verdict: "SAFE", action: "allow", badge: "\u{1F7E2}" };
  if (score < 0.6) return { verdict: "SUSPICIOUS", action: "allow_with_note", badge: "\u{1F7E1}" };
  if (score < 0.85) return { verdict: "LIKELY_ATTACK", action: "warn", badge: "\u{1F534}" };
  return { verdict: "DEFINITE_ATTACK", action: "block", badge: "\u{1F6AB}" };
}

// ---------------------------------------------------------------------------
// Stage 1 — local evaluation
// ---------------------------------------------------------------------------

export async function evaluateMessage(
  message: string,
  ai: Ai,
): Promise<EvaluationResult> {
  // 1. Regex scoring
  const regexScores: Record<string, number> = {};
  for (const [cat, def] of Object.entries(CATEGORIES)) {
    let hits = 0;
    for (const pat of def.patterns) {
      if (pat.test(message)) hits++;
    }
    regexScores[cat] = Math.min(1.0, hits * 0.25);
  }

  // Meta-signal detection
  const metaSignals: Record<string, boolean> = {};
  let metaCount = 0;
  for (const [name, pat] of Object.entries(META_SIGNALS)) {
    if (pat.test(message)) {
      metaSignals[name] = true;
      metaCount++;
    }
  }

  // 2. Embedding similarity
  const embeddingResponse = await ai.run(
    "@cf/baai/bge-base-en-v1.5" as BaseAiTextEmbeddingsModels,
    { text: [message] },
  );
  const queryEmbedding: number[] = embeddingResponse.data[0];

  const topMatches: SimilarityMatch[] = [];
  const categoryMaxSim: Record<string, number> = {};
  let maxBenignSim = 0;

  // Attack seeds
  for (const seed of seedData.attack) {
    const sim = cosineSimilarity(queryEmbedding, seed.embedding);
    const category = seed.label.split(":")[0].trim().replace(/\s+/g, "_").toLowerCase();
    if (!categoryMaxSim[category] || sim > categoryMaxSim[category]) {
      categoryMaxSim[category] = sim;
    }
    topMatches.push({ category, similarity: sim });
  }

  // Benign seeds
  for (const seed of seedData.benign) {
    const sim = cosineSimilarity(queryEmbedding, seed.embedding);
    if (sim > maxBenignSim) maxBenignSim = sim;
  }

  // Sort and keep top 5
  topMatches.sort((a, b) => b.score - a.score);
  topMatches.splice(5);

  // 3. Combined scoring per category
  const categoryScores: Record<string, number> = {};
  const allCategories = new Set([
    ...Object.keys(regexScores),
    ...Object.keys(categoryMaxSim),
  ]);

  for (const cat of allCategories) {
    const sim = categoryMaxSim[cat] ?? 0;
    const regex = regexScores[cat] ?? 0;
    let score: number;
    if (sim > 0.5) {
      score = sim;
    } else if (sim > 0.35 && regex > 0) {
      score = 0.6 * sim + 0.4 * regex;
    } else {
      score = 0.7 * sim + 0.3 * regex;
    }
    categoryScores[cat] = score;
  }

  // 4. Threat score
  let topCategory: string | null = null;
  let maxCatScore = 0;
  for (const [cat, score] of Object.entries(categoryScores)) {
    if (score > maxCatScore) {
      maxCatScore = score;
      topCategory = cat;
    }
  }

  let maxAttackSim = 0;
  for (const sim of Object.values(categoryMaxSim)) {
    if (sim > maxAttackSim) maxAttackSim = sim;
  }

  let threatScore = maxCatScore * (1 + metaCount * 0.05);

  // Benign subtraction
  if (maxBenignSim > maxAttackSim - 0.05) {
    const penalty = 0.4 + 0.3 * (maxBenignSim - maxAttackSim + 0.05);
    threatScore *= Math.max(0.1, 1.0 - penalty);
  }

  threatScore = Math.min(1.0, Math.max(0.0, threatScore));

  const roundedCategoryScores: Record<string, number> = {};
  for (const [cat, score] of Object.entries(categoryScores)) {
    roundedCategoryScores[cat] = Math.round(score * 1000) / 1000;
  }

  const roundedThreatScore = Math.round(threatScore * 1000) / 1000;
  const { verdict, action, badge } = classify(threatScore);
  const categoryDescription = topCategory ? (CATEGORIES[topCategory]?.description ?? "") : "";

  return {
    threat_score: roundedThreatScore,
    classification: verdict,
    action,
    badge,
    top_category: topCategory,
    category_description: categoryDescription,
    category_scores: roundedCategoryScores,
    meta_signals: metaSignals,
    top_matches: topMatches.map((m) => ({
      ...m,
      similarity: Math.round(m.similarity * 1000) / 1000,
    })),
    two_stage: false,
  };
}

// ---------------------------------------------------------------------------
// Stage 2 — Claude verification for SUSPICIOUS results
// ---------------------------------------------------------------------------

export async function claudeVerify(
  message: string,
  stage1: EvaluationResult,
  apiKey: string,
): Promise<EvaluationResult> {
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 10,
        system: "You are a distillation-attack detector. The user will provide a prompt. Classify it as BENIGN or ATTACK. Reply with exactly one word.",
        messages: [{ role: "user", content: message }],
      }),
    });
  } catch {
    return stage1;
  }

  if (!response.ok) {
    return stage1;
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  const verdict = data.content?.[0]?.text?.trim().toUpperCase() ?? "";

  const result = { ...stage1, two_stage: true, stage2_model: "claude-haiku-4-5" };

  if (verdict.includes("BENIGN")) {
    result.threat_score = Math.round(stage1.threat_score * 0.3 * 1000) / 1000;
    const c = classify(result.threat_score);
    result.classification = c.verdict;
    result.action = c.action;
    result.badge = c.badge;
    result.stage2_verdict = "BENIGN";
  } else if (verdict.includes("ATTACK")) {
    result.threat_score = Math.min(1.0, Math.round(stage1.threat_score * 1.5 * 1000) / 1000);
    const c = classify(result.threat_score);
    result.classification = c.verdict;
    result.action = c.action;
    result.badge = c.badge;
    result.stage2_verdict = "ATTACK";
  }

  return result;
}

export async function evaluateMessageTwoStage(
  message: string,
  ai: Ai,
  apiKey: string,
): Promise<EvaluationResult> {
  const stage1 = await evaluateMessage(message, ai);

  if (stage1.classification === "SUSPICIOUS" && apiKey) {
    return claudeVerify(message, stage1, apiKey);
  }

  return stage1;
}
