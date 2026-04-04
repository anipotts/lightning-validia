export type ThreatLevel = "safe" | "suspicious" | "likely_attack" | "blocked";

export type AttackCategory =
  | "cot_elicitation"
  | "capability_mapping"
  | "safety_boundary"
  | "tool_use_extraction"
  | "reward_model_grading"
  | "censorship_rewrite";

export type MetaSignal =
  | "high_volume"
  | "uniform_coverage"
  | "template_reuse"
  | "multilingual_systematic"
  | "rigid_format";

export interface ThreatEvent {
  id: string;
  input: string;
  response: string;
  threatLevel: ThreatLevel;
  threatScore: number;
  category: AttackCategory | null;
  signals: string[];
  metaSignals: MetaSignal[];
  timestamp: Date;
  stage2Verdict?: "ATTACK" | "BENIGN";
  stage2Model?: string;
  twoStage?: boolean;
}

export interface FlaggedFile {
  name: string;
  threatLevel: ThreatLevel;
  category: string;
  score: number;
}

export interface Stats {
  total: number;
  safe: number;
  suspicious: number;
  likely_attack: number;
  blocked: number;
  byCategory: Record<AttackCategory, number>;
  byMetaSignal: Record<MetaSignal, number>;
}

export const CATEGORY_LABELS: Record<AttackCategory, string> = {
  cot_elicitation: "CoT_elicitation",
  capability_mapping: "capability_mapping",
  safety_boundary: "safety_probing",
  tool_use_extraction: "tool_use_extraction",
  reward_model_grading: "reward_grading",
  censorship_rewrite: "censorship_rewrite",
};

export const THREAT_COLORS: Record<ThreatLevel, string> = {
  safe: "var(--safe)",
  suspicious: "var(--suspicious)",
  likely_attack: "var(--attack)",
  blocked: "var(--blocked)",
};

export const THREAT_LABELS: Record<ThreatLevel, string> = {
  safe: "SAFE",
  suspicious: "SUSPICIOUS",
  likely_attack: "LIKELY ATTACK",
  blocked: "BLOCKED",
};

export const LOG_PREFIXES: Record<ThreatLevel, string> = {
  safe: "[green]  ",
  suspicious: "[yellow] ",
  likely_attack: "[red]    ",
  blocked: "[block]  ",
};

export const INITIAL_STATS: Stats = {
  total: 0,
  safe: 0,
  suspicious: 0,
  likely_attack: 0,
  blocked: 0,
  byCategory: {
    cot_elicitation: 0,
    capability_mapping: 0,
    safety_boundary: 0,
    tool_use_extraction: 0,
    reward_model_grading: 0,
    censorship_rewrite: 0,
  },
  byMetaSignal: {
    high_volume: 0,
    uniform_coverage: 0,
    template_reuse: 0,
    multilingual_systematic: 0,
    rigid_format: 0,
  },
};

export const INITIAL_FLAGGED_FILES: FlaggedFile[] = [
  { name: "config.yaml", threatLevel: "blocked", category: "safety_probing", score: 0.91 },
  { name: "batch.json", threatLevel: "suspicious", category: "template_reuse", score: 0.52 },
  { name: "eval_suite.py", threatLevel: "suspicious", category: "reward_grading", score: 0.48 },
  { name: "readme.md", threatLevel: "safe", category: "none", score: 0.03 },
  { name: "utils.py", threatLevel: "safe", category: "none", score: 0.01 },
  { name: "extract.py", threatLevel: "likely_attack", category: "CoT_elicitation", score: 0.74 },
];
