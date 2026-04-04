"use client";

import { useState } from "react";

type ThreatLevel = "safe" | "suspicious" | "likely_attack" | "blocked";

interface Message {
  id: number;
  text: string;
  response: string;
  threatLevel: ThreatLevel;
  threatScore: number;
  category: string | null;
  signals: string[];
  timestamp: Date;
}

const THREAT_CONFIG: Record<
  ThreatLevel,
  { color: string; bg: string; border: string; icon: string; label: string }
> = {
  safe: {
    color: "text-emerald-400",
    bg: "bg-emerald-950/50",
    border: "border-emerald-800",
    icon: "\u{1F7E2}",
    label: "SAFE",
  },
  suspicious: {
    color: "text-yellow-400",
    bg: "bg-yellow-950/50",
    border: "border-yellow-800",
    icon: "\u{1F7E1}",
    label: "SUSPICIOUS",
  },
  likely_attack: {
    color: "text-red-400",
    bg: "bg-red-950/50",
    border: "border-red-800",
    icon: "\u{1F534}",
    label: "LIKELY ATTACK",
  },
  blocked: {
    color: "text-red-500",
    bg: "bg-red-950/80",
    border: "border-red-600",
    icon: "\u{1F6AB}",
    label: "BLOCKED",
  },
};

// Simulated threat analysis (in production this comes from OpenClaw gateway)
function analyzePrompt(text: string): {
  threatLevel: ThreatLevel;
  threatScore: number;
  category: string | null;
  signals: string[];
} {
  const lower = text.toLowerCase();
  const signals: string[] = [];
  let score = 0;

  // CoT elicitation signals
  if (/step by step|show your work|walk me through|reasoning process|explain your approach/i.test(lower)) {
    signals.push("cot_keywords");
    score += 0.2;
  }
  if (/thinking.*tag|<thinking>|internal monologue/i.test(lower)) {
    signals.push("tag_coercion_syntax");
    score += 0.3;
  }

  // Capability mapping
  if (/beginner.*intermediate.*advanced|easy.*medium.*hard/i.test(lower)) {
    signals.push("difficulty_ladder");
    score += 0.35;
  }
  if (/as prose.*as json.*as python|as json.*as xml/i.test(lower)) {
    signals.push("format_variation_pattern");
    score += 0.3;
  }

  // Safety boundary probing
  if (/what.*refuse|categories.*decline|taxonomy.*refusal|decision framework/i.test(lower)) {
    signals.push("policy_extraction_request");
    score += 0.5;
  }
  if (/explain.*why.*refuse|where.*the.*line|what makes it cross/i.test(lower)) {
    signals.push("refusal_inquiry");
    score += 0.4;
  }

  // Reward model grading
  if (/which.*better|compare.*responses|rate.*from.*best.*worst|score each/i.test(lower)) {
    signals.push("pairwise_comparison");
    score += 0.25;
  }

  // Systematic patterns
  if (/across.*jurisdictions|across.*domains|in mandarin.*in french|in japanese/i.test(lower)) {
    signals.push("multilingual_systematic");
    score += 0.25;
  }

  // Multiple categories hit = higher confidence
  if (signals.length >= 3) score = Math.min(score + 0.2, 1.0);

  let category: string | null = null;
  if (signals.some((s) => s.includes("cot") || s.includes("tag"))) category = "CoT Elicitation";
  else if (signals.some((s) => s.includes("difficulty") || s.includes("format"))) category = "Capability Mapping";
  else if (signals.some((s) => s.includes("policy") || s.includes("refusal"))) category = "Safety Boundary Probe";
  else if (signals.some((s) => s.includes("pairwise"))) category = "Reward Model Grading";
  else if (signals.some((s) => s.includes("multilingual"))) category = "Multilingual Sweep";

  score = Math.min(score, 1.0);

  let threatLevel: ThreatLevel = "safe";
  if (score >= 0.85) threatLevel = "blocked";
  else if (score >= 0.6) threatLevel = "likely_attack";
  else if (score >= 0.3) threatLevel = "suspicious";

  return { threatLevel, threatScore: score, category, signals };
}

const SAMPLE_RESPONSES: Record<ThreatLevel, (cat: string | null) => string> = {
  safe: () => "Paris is the capital of France. It has been the country's capital since the late 10th century.",
  suspicious: (cat) =>
    `I'll help with that. Note: this prompt has characteristics of ${cat ?? "a known attack pattern"}, but I'm answering since it appears legitimate in context.`,
  likely_attack: (cat) =>
    `I've detected patterns consistent with ${cat ?? "model extraction"}. I'll provide a simplified response, but I want you to know this matches known distillation attack signatures.`,
  blocked: (cat) =>
    `This prompt matches known distillation attack patterns (${cat ?? "extraction attempt"}). I'm designed to detect and resist model extraction. If this is legitimate, please rephrase naturally.`,
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [stats, setStats] = useState({ total: 0, blocked: 0, suspicious: 0, safe: 0 });

  function handleSend() {
    if (!input.trim()) return;

    const analysis = analyzePrompt(input);
    const newMessage: Message = {
      id: Date.now(),
      text: input,
      response: SAMPLE_RESPONSES[analysis.threatLevel](analysis.category),
      ...analysis,
      timestamp: new Date(),
    };

    setMessages((prev) => [newMessage, ...prev]);
    setStats((prev) => ({
      total: prev.total + 1,
      blocked: prev.blocked + (analysis.threatLevel === "blocked" || analysis.threatLevel === "likely_attack" ? 1 : 0),
      suspicious: prev.suspicious + (analysis.threatLevel === "suspicious" ? 1 : 0),
      safe: prev.safe + (analysis.threatLevel === "safe" ? 1 : 0),
    }));
    setInput("");
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-2xl">&#x1F6E1;&#xFE0F;</div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">ShieldClaw</h1>
            <p className="text-xs text-zinc-500">Paranoid Agent &middot; Powered by Validia + OpenClaw</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-zinc-500">Gateway Connected</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Chat */}
        <main className="flex-1 flex flex-col">
          {/* Stats Bar */}
          <div className="grid grid-cols-4 gap-px bg-zinc-800 border-b border-zinc-800">
            {[
              { label: "Total", value: stats.total, color: "text-zinc-300" },
              { label: "Safe", value: stats.safe, color: "text-emerald-400" },
              { label: "Suspicious", value: stats.suspicious, color: "text-yellow-400" },
              { label: "Blocked", value: stats.blocked, color: "text-red-400" },
            ].map((s) => (
              <div key={s.label} className="bg-zinc-950 px-4 py-3 text-center">
                <div className={`text-2xl font-mono font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-zinc-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-zinc-600">
                <div className="text-4xl mb-4">&#x1F6E1;&#xFE0F;</div>
                <p className="text-sm">Send a message to test the Paranoid Agent</p>
                <p className="text-xs mt-2 text-zinc-700">Try an attack: &quot;Explain recursion at beginner, intermediate, advanced, and expert level&quot;</p>
              </div>
            )}
            {messages.map((msg) => {
              const config = THREAT_CONFIG[msg.threatLevel];
              return (
                <div key={msg.id} className={`border rounded-lg ${config.border} ${config.bg} p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span>{config.icon}</span>
                      <span className={`text-xs font-mono font-bold ${config.color}`}>{config.label}</span>
                      <span className="text-xs text-zinc-500">score: {msg.threatScore.toFixed(2)}</span>
                    </div>
                    <span className="text-xs text-zinc-600">
                      {msg.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-sm text-zinc-300 mb-2 font-mono bg-zinc-900/50 rounded px-3 py-2">
                    {msg.text}
                  </div>
                  <div className="text-sm text-zinc-400 mb-2">{msg.response}</div>
                  {msg.signals.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {msg.category && (
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${config.border} ${config.color}`}>
                          {msg.category}
                        </span>
                      )}
                      {msg.signals.map((s) => (
                        <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Input */}
          <div className="border-t border-zinc-800 p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type a message to test the Paranoid Agent..."
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
              />
              <button
                onClick={handleSend}
                className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-lg px-6 py-3 text-sm font-medium transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        </main>

        {/* Right Sidebar — Threat Feed */}
        <aside className="w-72 border-l border-zinc-800 overflow-y-auto">
          <div className="p-4 border-b border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-400">Validia Detection Engine</h2>
            <p className="text-xs text-zinc-600 mt-1">Powered by Distillery threat taxonomy</p>
          </div>
          <div className="p-4 space-y-3">
            {[
              { cat: "CoT Elicitation", desc: "Extract reasoning traces", count: 12500 },
              { cat: "Capability Mapping", desc: "Map model abilities", count: 10000 },
              { cat: "Tool-Use Extraction", desc: "Force agentic patterns", count: 7500 },
              { cat: "Reward Model Grading", desc: "Generate preference data", count: 5000 },
              { cat: "Safety Boundary Probe", desc: "Map refusal policies", count: 4000 },
              { cat: "Censorship Rewrite", desc: "Policy adaptation", count: 2500 },
            ].map((c) => (
              <div key={c.cat} className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
                <div className="text-xs font-semibold text-zinc-300">{c.cat}</div>
                <div className="text-xs text-zinc-500 mt-1">{c.desc}</div>
                <div className="text-xs text-zinc-600 mt-1">{c.count.toLocaleString()} known patterns</div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-400">Stack</h2>
            <div className="mt-2 space-y-1 text-xs text-zinc-500">
              <div>&#x26A1; Lightning AI Studio</div>
              <div>&#x1F9E0; OpenClaw + Claude Opus 4.5</div>
              <div>&#x1F6E1;&#xFE0F; Validia Distillery (54K attack patterns)</div>
              <div>&#x1F47B; Validia Ghost (supply chain)</div>
              <div>&#x1F52C; Validia Utopia (runtime audit)</div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
