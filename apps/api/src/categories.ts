export interface CategoryDefinition {
  description: string;
  patterns: RegExp[];
}

export const CATEGORIES: Record<string, CategoryDefinition> = {
  cot_elicitation: {
    description: "Attempts to extract chain-of-thought reasoning or internal monologue",
    patterns: [
      /step\s+by\s+step/i,
      /show\s+(your|me)\s+(work|reasoning|thinking)/i,
      /walk\s+me\s+through/i,
      /reasoning\s+process/i,
      /explain\s+your\s+approach/i,
      /<thinking>/i,
      /internal\s+(thought|monologue)/i,
      /think\s+out\s+loud/i,
      /trace\s+(your\s+)?logic/i,
      /intermediate\s+thoughts/i,
      /narrate.*cognitive/i,
      /dead\s+end.*correct/i,
      /hypothes.*prior.*update/i,
      /stream\s+of\s+consciousness/i,
      /think.?aloud\s+protocol/i,
      /pair.?programming.*narrat/i,
      /metacogniti/i,
      /screencast.*walkthrough/i,
    ],
  },
  capability_mapping: {
    description: "Attempts to map the full capability surface of the model",
    patterns: [
      /beginner.*intermediate.*advanced/i,
      /rate\s+(your\s+)?ability/i,
      /what\s+can\s+you\s+do\s+with/i,
      /list\s+every\s+type\s+of\s+task/i,
      /organized\s+by\s+domain/i,
      /difficulty\s+ladder/i,
      /from\s+1.?10\s+in/i,
      /full\s+range\s+of\s+tasks/i,
      /clinical\s+vignette/i,
      /board.certified/i,
      /benchmark.*translation/i,
      /rate.*confidence.*1.10/i,
      /capability\s+matrix/i,
      /stress.test.*AI/i,
      /self.assessment.*domain/i,
    ],
  },
  safety_boundary_probing: {
    description: "Probing the safety and refusal boundaries of the model",
    patterns: [
      /(categories|types)\s+of\s+requests?\s+(you\s+)?(refuse|decline|reject)/i,
      /taxonomy\s+of\s+(refusal|your)/i,
      /where.*the\s+line\s+between/i,
      /decision\s+framework/i,
      /what\s+would\s+someone\s+have\s+to\s+say/i,
      /edge\s+of\s+what\s+you.ll/i,
      /content\s+polic(y|ies)\s+differ/i,
      /compliance\s+audit.*content\s+policy/i,
      /safety\s+researcher.*borderline/i,
      /refusal\s+(criteria|threshold)/i,
      /red.?team\s+dataset/i,
      /jailbreak/i,
      /penetration\s+test.*model/i,
      /guardrail/i,
    ],
  },
  tool_use_extraction: {
    description: "Extracting tool-use workflows and agentic capabilities",
    patterns: [
      /chain\s+together\s+tools/i,
      /exact\s+sequence\s+of\s+tool\s+calls/i,
      /autonomous(ly)?\s+(complete|deploy|handle)/i,
      /multi.?step\s+agentic/i,
      /plan.*execute.*file.*writing/i,
      /scrape.*analyze.*report/i,
      /cascading\s+failure/i,
      /triage.*which\s+tools/i,
      /automated\s+remediation/i,
      /retry\s+logic.*synthesize/i,
      /self.healing\s+infrastructure/i,
      /orchestrat.*pipeline.*every/i,
      /decision\s+tree.*failure\s+mode/i,
    ],
  },
  reward_model_grading: {
    description: "Using the model as a reward model or preference judge",
    patterns: [
      /which\s+(of\s+these\s+)?(two\s+)?responses?\s+is\s+better/i,
      /score\s+(these|each)\s+.*on\s+(helpfulness|accuracy|safety)/i,
      /rank\s+(these|by)\s+quality/i,
      /RLHF/i,
      /human\s+rater/i,
      /rubric\s+from\s+1/i,
      /higher\s+rating/i,
      /rank.*best\s+to\s+worst/i,
      /score.*1.10.*correctness/i,
      /pedagogically\s+sound/i,
      /which\s+explanation.*more\s+accurate/i,
      /preference\s+dataset/i,
      /grade\s+these.*essay/i,
    ],
  },
  censorship_rewrite: {
    description: "Rewriting content to bypass moderation or safety filters",
    patterns: [
      /(make|rewrite).*acceptable\s+to\s+(an\s+)?AI/i,
      /sanitize.*content\s+moderation/i,
      /pass(es)?\s+(content\s+)?moderation\s+filter/i,
      /sound\s+more\s+neutral\s+so.*won.t\s+flag/i,
      /doesn.t\s+trigger\s+safety\s+systems/i,
      /more\s+likely\s+to\s+get\s+a\s+helpful\s+response/i,
      /tone.*too\s+aggressive.*rewrite/i,
      /flagged.*content\s+moderation.*rewrite/i,
      /won.t\s+trigger.*automated\s+filter/i,
      /bypass.*content\s+filter/i,
      /rephrase.*safety\s+filter/i,
      /sanitize.*report.*gateway/i,
    ],
  },
};

export const META_SIGNALS: Record<string, RegExp> = {
  rigid_format_demands:
    /(respond\s+only\s+in\s+(JSON|XML|CSV)|format\s+as\s+(JSON|CSV|XML)|return\s+as\s+a\s+JSON)/i,
  explicit_thinking_tags: /<thinking>|<reasoning>|<internal>/i,
  exhaustive_enumeration:
    /(be\s+exhaustive|comprehensive\s+taxonomy|list\s+(all|every)|full\s+range)/i,
  pairwise_comparison:
    /(which\s+(is|of)\s+(better|worse)|compare\s+these\s+(two|responses)|response\s+A.*response\s+B)/i,
  multilingual_probe:
    /(translate.*into\s+\w+.*\w+.*\w+|in\s+(Spanish|Mandarin|Arabic|Hindi|Japanese|Chinese|French|German))/i,
};
