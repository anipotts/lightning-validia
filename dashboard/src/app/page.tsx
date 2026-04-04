"use client";

import { useState, useRef, useEffect } from "react";
import {
  type ThreatEvent,
  type Stats,
  type AttackCategory,
  CATEGORY_LABELS,
  THREAT_LABELS,
  INITIAL_STATS,
} from "./types";
import { analyzePrompt, analyzePromptAPI } from "./analyzer";

// ─── Types ──────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "shield" | "agent";
  text: string;
  event?: ThreatEvent;
  streaming?: boolean;
  timestamp: Date;
}

// ─── Helpers ────────────────────────────────────────────

function updateStats(prev: Stats, event: ThreatEvent): Stats {
  const next = { ...prev };
  next.total++;
  next[event.threatLevel]++;
  if (event.category) {
    next.byCategory = { ...prev.byCategory, [event.category]: prev.byCategory[event.category] + 1 };
  }
  for (const ms of event.metaSignals) {
    next.byMetaSignal = { ...prev.byMetaSignal, [ms]: prev.byMetaSignal[ms] + 1 };
  }
  return next;
}

const LEVEL_TEXT_CLASS: Record<string, string> = {
  safe: "text-safe",
  suspicious: "text-suspicious",
  likely_attack: "text-attack",
  blocked: "text-blocked",
};

const LEVEL_HEX: Record<string, string> = {
  safe: "#a3b18a",
  suspicious: "#c9a96e",
  likely_attack: "#b85c4a",
  blocked: "#8a3a2e",
};

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ─── Pipeline Steps (real-time, with timing) ────────────

type PipelineStep = { text: string; color: string };

function usePipelineSteps(event: ThreatEvent | null) {
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!event) return;

    setSteps([]);
    setIsRunning(true);

    const latency = event.latencyMs ?? 0;
    // Distribute total latency across steps for granular display
    const encodeMs = Math.round(latency * 0.15);
    const fingerMs = Math.round(latency * 0.45);
    const regexMs = Math.round(latency * 0.10);
    const scoreMs = Math.round(latency * 0.20);
    const overheadMs = latency - encodeMs - fingerMs - regexMs - scoreMs;

    const planned: PipelineStep[] = [
      { text: `Encoding message... (${encodeMs}ms)`, color: "#6b6560" },
      { text: `Comparing against 158 fingerprints... (${fingerMs}ms)`, color: "#6b6560" },
      { text: `Regex pattern scan... ${event.signals.length} matches (${regexMs}ms)`, color: event.signals.length > 0 ? "#c9a96e" : "#6b6560" },
    ];

    if (event.topMatches && event.topMatches.length > 0) {
      const top = event.topMatches[0];
      planned.push({
        text: `Top similarity: ${top.similarity.toFixed(2)} (${top.category}) (${scoreMs}ms)`,
        color: top.similarity > 0.7 ? "#b85c4a" : "#c9a96e",
      });
    } else {
      planned.push({
        text: `Scoring... ${event.threatScore.toFixed(3)} (${scoreMs}ms)`,
        color: LEVEL_HEX[event.threatLevel] ?? "#6b6560",
      });
    }

    if (event.twoStage) {
      planned.push({ text: `Stage 2: Querying ${event.stage2Model ?? "Claude Haiku"}...`, color: "#c9a96e" });
      planned.push({
        text: `Stage 2 verdict: ${event.stage2Verdict}`,
        color: event.stage2Verdict === "BENIGN" ? "#a3b18a" : "#b85c4a",
      });
    }

    planned.push({
      text: `RESULT: ${THREAT_LABELS[event.threatLevel]} — total ${latency}ms`,
      color: LEVEL_HEX[event.threatLevel] ?? "#6b6560",
    });

    let i = 0;
    const interval = setInterval(() => {
      if (i < planned.length) {
        const step = planned[i];
        i++;
        setSteps((prev) => [...prev, step]);
      } else {
        clearInterval(interval);
        setIsRunning(false);
      }
    }, 150);

    return () => clearInterval(interval);
  }, [event]);

  return { steps, isRunning };
}

// ─── Markdown Renderer ──────────────────────────────────

function SimpleMarkdown({ text }: { text: string }) {
  const html = text
    // Code blocks (triple backtick)
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-[#0e0d0c] rounded p-3 my-2 overflow-x-auto text-[13px] leading-5 border border-panel-border/30"><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-[#1a1916] px-1 py-0.5 rounded text-[13px]">$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-text-primary font-semibold">$1</strong>')
    // Headers
    .replace(/^### (.+)$/gm, '<div class="font-bold text-text-primary mt-2 mb-0.5">$1</div>')
    .replace(/^## (.+)$/gm, '<div class="font-bold text-text-primary mt-2 mb-0.5">$1</div>')
    .replace(/^# (.+)$/gm, '<div class="font-bold text-text-primary mt-2 mb-0.5">$1</div>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr class="border-panel-border my-2" />')
    // List items
    .replace(/^- (.+)$/gm, '<div class="pl-3">&bull; $1</div>')
    // Numbered list items
    .replace(/^(\d+)\. (.+)$/gm, '<div class="pl-3">$1. $2</div>')
    // Collapse multiple newlines into one break, single newlines into breaks
    .replace(/\n{2,}/g, '<div class="h-2"></div>')
    .replace(/\n/g, '<br />');

  return <div className="text-[14px] text-text-primary leading-5" dangerouslySetInnerHTML={{ __html: html }} />;
}

// ─── Validia Check Rows ─────────────────────────────────

const VALIDIA_CHECKS: { key: string; label: string; description: string }[] = [
  { key: "cot_elicitation", label: "Chain-of-Thought Elicitation", description: "Detects attempts to extract reasoning traces, internal monologue, or step-by-step thought processes for training data harvesting." },
  { key: "CoT_Elicitation", label: "Chain-of-Thought Elicitation", description: "Detects attempts to extract reasoning traces, internal monologue, or step-by-step thought processes for training data harvesting." },
  { key: "capability_mapping", label: "Capability Mapping", description: "Identifies systematic probing across domains, difficulty levels, or output formats to map model abilities for replication." },
  { key: "Capability_Mapping", label: "Capability Mapping", description: "Identifies systematic probing across domains, difficulty levels, or output formats to map model abilities for replication." },
  { key: "safety_boundary_probing", label: "Safety Boundary Probing", description: "Catches attempts to enumerate refusal categories, extract content policies, or map decision boundaries for cloning." },
  { key: "Safety_Boundary_Probing", label: "Safety Boundary Probing", description: "Catches attempts to enumerate refusal categories, extract content policies, or map decision boundaries for cloning." },
  { key: "tool_use_extraction", label: "Tool Use Extraction", description: "Detects requests to expose agentic tool orchestration patterns, autonomous workflows, or decision trees for replication." },
  { key: "Tool_Use_Extraction", label: "Tool Use Extraction", description: "Detects requests to expose agentic tool orchestration patterns, autonomous workflows, or decision trees for replication." },
  { key: "reward_model_grading", label: "Reward Model Grading", description: "Identifies pairwise comparisons, scoring rubrics, and preference ranking requests designed to generate RLHF training data." },
  { key: "Reward_Model_Grading", label: "Reward Model Grading", description: "Identifies pairwise comparisons, scoring rubrics, and preference ranking requests designed to generate RLHF training data." },
  { key: "censorship_rewrite", label: "Censorship Rewrite", description: "Catches requests to rephrase content to evade safety filters, bypass moderation, or train filter-evasion models." },
  { key: "Censorship_Rewrite", label: "Censorship Rewrite", description: "Catches requests to rephrase content to evade safety filters, bypass moderation, or train filter-evasion models." },
];

function ValidiaChecks({ scores, topMatches }: {
  scores?: Record<string, number>;
  topMatches?: { category: string; similarity: number }[];
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (!scores) return null;

  // Deduplicate case variants, take max score
  const merged: Record<string, { label: string; description: string; score: number; similarity?: number }> = {};
  for (const check of VALIDIA_CHECKS) {
    const s = scores[check.key] ?? 0;
    const norm = check.key.toLowerCase();
    if (!merged[norm] || s > merged[norm].score) {
      const match = topMatches?.find((m) => m.category.toLowerCase() === norm);
      merged[norm] = { label: check.label, description: check.description, score: s, similarity: match?.similarity };
    }
  }

  const entries = Object.entries(merged).sort(([, a], [, b]) => b.score - a.score);
  if (entries.every(([, v]) => v.score < 0.01)) return null;

  return (
    <div className="mt-3 pt-3 border-t border-panel-border/40">
      <div className="text-[10px] text-text-label uppercase tracking-wider mb-2">Distillery Scan Results</div>
      <div className="space-y-1">
        {entries.map(([key, { label, description, score, similarity }]) => {
          const pct = Math.min(score * 100, 100);
          const color = score > 0.6 ? "#b85c4a" : score > 0.3 ? "#c9a96e" : "#3d3a34";
          const isExpanded = expandedKey === key;
          const isActive = score > 0.01;

          return (
            <div key={key}>
              <button
                onClick={() => isActive && setExpandedKey(isExpanded ? null : key)}
                className={`w-full rounded-sm overflow-hidden transition-colors ${isActive ? "cursor-pointer hover:bg-[#1a1916]" : "cursor-default opacity-50"}`}
              >
                <div className="flex items-center gap-3 px-2 py-1.5">
                  {/* Score bar — the primary visual */}
                  <div className="w-16 h-1.5 bg-[#1a1916] rounded-full overflow-hidden shrink-0">
                    <div className="h-full rounded-full score-bar-fill" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  {/* Label */}
                  <span className={`text-[11px] flex-1 text-left truncate ${isActive ? "text-text-primary" : "text-text-sub"}`}>
                    {label}
                  </span>
                  {/* Score */}
                  <span className="text-[11px] font-mono tabular-nums" style={{ color }}>
                    {score > 0 ? score.toFixed(2) : "\u2014"}
                  </span>
                </div>
              </button>
              {isExpanded && (
                <div className="px-2 pb-2 pt-1 ml-[76px] text-[11px] step-in space-y-1.5">
                  <div className="text-text-dim leading-4">{description}</div>
                  {similarity != null && similarity > 0 && (
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-text-sub">Fingerprint match:</span>
                      <span className="font-mono" style={{ color }}>{(similarity * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Rephrase Button ────────────────────────────────────

function RephraseButton({ prompt, category, onRephrase }: { prompt: string; category: string; onRephrase: (text: string) => void }) {
  const [rephrased, setRephrased] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Auto-fetch on mount — no click needed
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/rephrase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, category }),
        });
        const data = await res.json();
        if (!cancelled && data.rephrased && data.rephrased !== prompt) {
          setRephrased(data.rephrased);
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [prompt, category]);

  if (loading) {
    return (
      <div className="mt-3 pt-3 border-t border-panel-border/30">
        <div className="text-[10px] text-text-dim animate-pulse">Generating safe alternative...</div>
      </div>
    );
  }

  if (!rephrased) return null;

  return (
    <div className="mt-3 pt-3 border-t border-panel-border/30">
      <div className="text-[10px] text-safe uppercase tracking-wider mb-1.5">Suggested safe version</div>
      <div className="text-[14px] text-text-primary bg-safe/5 rounded-sm px-3 py-2.5 border border-safe/20 leading-5">
        {rephrased}
      </div>
      <button
        onClick={() => onRephrase(rephrased)}
        className="mt-2 text-[12px] text-safe hover:text-text-primary transition-colors font-medium"
      >
        Use this prompt &rarr;
      </button>
    </div>
  );
}

// ─── Feedback Buttons ───────────────────────────────────

function ShieldFeedback({ eventId }: { eventId: string }) {
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);

  if (feedback) {
    return (
      <span className="text-[10px] text-text-sub ml-2">
        {feedback === "correct" ? "Confirmed" : "Reported"}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 ml-2" data-event={eventId}>
      <button
        onClick={() => setFeedback("correct")}
        className="text-[10px] text-text-sub hover:text-safe transition-colors px-1"
        title="Correct classification"
      >
        &#x2713;
      </button>
      <button
        onClick={() => setFeedback("incorrect")}
        className="text-[10px] text-text-sub hover:text-attack transition-colors px-1"
        title="Incorrect classification"
      >
        &#x2717;
      </button>
    </span>
  );
}

// ─── Page ───────────────────────────────────────────────

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stats, setStats] = useState<Stats>(INITIAL_STATS);
  const [input, setInput] = useState("");
  const [currentEvent, setCurrentEvent] = useState<ThreatEvent | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { steps: pipelineSteps, isRunning: pipelineRunning } = usePipelineSteps(currentEvent);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleStop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsAnalyzing(false);
    setIsStreaming(false);
    // Mark any streaming messages as done
    setMessages((prev) => prev.map((m) => m.streaming ? { ...m, streaming: false } : m));
  }

  function handleClear() {
    setMessages([]);
    setStats(INITIAL_STATS);
    setCurrentEvent(null);
  }

  async function streamAgentResponse(userText: string, msgId: string) {
    const agentMsg: ChatMessage = {
      id: msgId,
      role: "agent",
      text: "",
      streaming: true,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, agentMsg]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Helper: finalize this message (mark done, preserve whatever text we have)
    const finalize = (appendText?: string) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msgId) return m;
          const text = appendText ? m.text + appendText : m.text;
          return { ...m, text: text || "No response received.", streaming: false };
        })
      );
      setIsStreaming(false);
      abortRef.current = null;
    };

    // Timeout: if nothing happens for 15s, stop gracefully
    const timeout = setTimeout(() => {
      controller.abort();
      finalize(" [timeout]");
    }, 15000);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText }),
        signal: controller.signal,
      });

      if (!res.ok) {
        clearTimeout(timeout);
        finalize(`Error: API returned ${res.status}`);
        return;
      }

      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Reset timeout on each chunk
            clearTimeout(timeout);

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  fullText += parsed.text;
                  setMessages((prev) =>
                    prev.map((m) => m.id === msgId ? { ...m, text: fullText } : m)
                  );
                }
              } catch {
                // Malformed SSE chunk — skip, keep going
              }
            }
          }
        } catch (readErr: unknown) {
          // Mid-stream read error — keep whatever text we got
          if (readErr instanceof Error && readErr.name !== "AbortError") {
            fullText += " [stream interrupted]";
          }
        }

        clearTimeout(timeout);
        finalize();
      } else {
        // Non-streaming JSON fallback
        clearTimeout(timeout);
        try {
          const data = await res.json();
          finalize(data.text || "Agent response unavailable.");
        } catch {
          finalize("Failed to parse response.");
        }
      }
    } catch (e: unknown) {
      clearTimeout(timeout);
      if (e instanceof Error && e.name === "AbortError") {
        // User stopped or timeout — keep partial text
        setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, streaming: false } : m));
        setIsStreaming(false);
        abortRef.current = null;
      } else {
        finalize("Connection failed.");
      }
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isAnalyzing) return;

    setInput("");
    setIsAnalyzing(true);
    setCurrentEvent(null);

    // 1. Add user message immediately
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // 2. Run shield analysis
    let event: ThreatEvent;
    try {
      event = await analyzePromptAPI(text);
    } catch {
      event = analyzePrompt(text);
    }

    // 3. Add shield result message
    const shieldMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "shield",
      text: "",
      event,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, shieldMsg]);
    setStats((prev) => updateStats(prev, event));
    setCurrentEvent(event);
    setIsAnalyzing(false);

    // 4. If passed (safe or suspicious-allow), stream agent response
    if (event.threatLevel === "safe" || event.threatLevel === "suspicious") {
      const agentId = crypto.randomUUID();
      await streamAgentResponse(text, agentId);
    }
  }

  // Derived stats
  const blockRate = stats.total > 0 ? ((stats.blocked + stats.likely_attack) / stats.total * 100).toFixed(1) : "0.0";
  const allScores = messages.filter((m) => m.event).map((m) => m.event!.threatScore);
  const avgScore = allScores.length > 0 ? (allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;
  const highestScore = allScores.length > 0 ? Math.max(...allScores) : 0;

  const catEntries = (Object.entries(CATEGORY_LABELS) as [AttackCategory, string][])
    .map(([key, label]) => ({ key, label, count: stats.byCategory[key] }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
  const maxCatCount = catEntries.length > 0 ? catEntries[0].count : 1;

  return (
    <div className="flex flex-col h-screen bg-bg text-text-primary font-mono">
      {/* Header */}
      <header className="h-11 shrink-0 flex items-center justify-between px-5 bg-item border-b border-panel-border">
        <div className="flex items-center gap-3">
          <span className="text-base font-bold tracking-wider">SHIELDCLAW</span>
          <span className="text-text-sub">|</span>
          <span className="text-[11px] text-text-dim tracking-wider">DISTILLATION ATTACK DETECTION</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-dim">LIVE</span>
          <span className="w-2 h-2 rounded-full bg-safe" />
        </div>
      </header>

      {/* 2-Column Layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* === CHAT === */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full text-text-sub text-[11px]">
                Send any prompt to scan for distillation attack patterns...
              </div>
            )}

            {messages.map((msg) => {
              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="flex justify-end mt-3">
                    <div className="bg-input-bg rounded-sm px-3 py-2 max-w-[75%]">
                      <span className="text-[14px] text-text-primary leading-6">{msg.text}</span>
                      <span className="text-[10px] text-text-sub ml-2">{formatTime(msg.timestamp)}</span>
                    </div>
                  </div>
                );
              }

              if (msg.role === "shield" && msg.event) {
                const evt = msg.event;
                const passed = evt.threatLevel === "safe" || evt.threatLevel === "suspicious";
                const blocked = !passed;

                // Validia category scores for visualization
                const catScoreEntries = evt.categoryScores
                  ? Object.entries(evt.categoryScores)
                      .filter(([, v]) => v > 0.01)
                      .sort(([, a], [, b]) => b - a)
                  : [];

                return (
                  <div
                    key={msg.id}
                    className="py-2 px-3 rounded-sm text-[13px]"
                    style={{
                      borderLeft: `3px solid ${LEVEL_HEX[evt.threatLevel]}`,
                      background: (LEVEL_HEX[evt.threatLevel]) + "08",
                    }}
                  >
                    {/* Main status line */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`font-bold badge-pulse ${LEVEL_TEXT_CLASS[evt.threatLevel]}`}>
                        {THREAT_LABELS[evt.threatLevel]}
                      </span>
                      <span className="text-text-sub">&middot;</span>
                      <span className="text-text-primary font-mono">{evt.threatScore.toFixed(3)}</span>
                      {evt.category && (
                        <>
                          <span className="text-text-sub">&middot;</span>
                          <span className="text-text-dim">{evt.category.replace(/_/g, " ").replace(/\bcot\b/gi, "Chain-of-Thought")}</span>
                        </>
                      )}
                      <span className="text-text-sub">&middot;</span>
                      <span className="text-text-dim">{evt.latencyMs ?? 0}ms</span>
                      <span className="text-text-sub">&middot;</span>
                      <span className={passed ? "text-safe" : "text-attack"} style={{ fontSize: 10 }}>
                        {passed ? "PASSED \u2192 agent" : "BLOCKED"}
                      </span>
                      <ShieldFeedback eventId={evt.id ?? msg.id} />
                    </div>

                    {/* Stage 2 verdict (only when we actually have a verdict) */}
                    {evt.twoStage && evt.stage2Verdict && (
                      <div className={`text-[9px] mt-1 font-bold ${evt.stage2Verdict === "BENIGN" ? "text-safe" : "text-attack"}`}>
                        Stage 2: {evt.stage2Verdict} ({evt.stage2Model})
                      </div>
                    )}

                    {/* Category description */}
                    {evt.categoryDescription && (
                      <div className="text-[11px] text-text-sub mt-1 italic leading-4">{evt.categoryDescription}</div>
                    )}

                    {/* Validia checks — collapsible per category */}
                    <ValidiaChecks scores={evt.categoryScores} topMatches={evt.topMatches} />

                    {/* Rephrase suggestion for blocked prompts */}
                    {blocked && (
                      <RephraseButton prompt={evt.input} category={evt.category ?? "unknown"} onRephrase={(text) => setInput(text)} />
                    )}
                  </div>
                );
              }

              if (msg.role === "agent") {
                return (
                  <div key={msg.id} className="max-w-[85%]">
                    <div className="bg-panel border border-panel-border rounded-sm px-3 py-2">
                      <div className="text-[10px] text-text-dim mb-2 uppercase tracking-wider">Agent Response</div>
                      {msg.text ? (
                        <>
                          <SimpleMarkdown text={msg.text} />
                          {msg.streaming && <span className="inline-block w-1.5 h-4 bg-text-primary ml-0.5 animate-pulse align-middle" />}
                        </>
                      ) : (
                        <span className="text-[13px] text-text-dim animate-pulse">Generating...</span>
                      )}
                    </div>
                  </div>
                );
              }

              return null;
            })}

            {isAnalyzing && (
              <div className="py-1.5 px-3 text-[11px] text-text-dim animate-pulse" style={{ borderLeft: "3px solid #6b6560" }}>
                Scanning for distillation patterns...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 pb-4 pt-2 border-t border-panel-border">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type a message..."
                className="flex-1 bg-input-bg border border-panel-border rounded-sm px-3 py-2.5 text-[14px] text-text-primary placeholder:text-text-sub focus:outline-none focus:border-text-dim"
                disabled={isAnalyzing || isStreaming}
              />
              <button
                onClick={isAnalyzing || isStreaming ? handleStop : handleSend}
                className={
                  isAnalyzing || isStreaming
                    ? "bg-attack/20 border border-attack/40 rounded-sm px-5 py-2 text-[10px] font-bold text-attack hover:bg-attack/30 transition-colors uppercase tracking-wider"
                    : "bg-input-bg border border-panel-border rounded-sm px-5 py-2 text-[10px] font-bold text-text-label hover:text-text-primary hover:border-text-dim transition-colors uppercase tracking-wider"
                }
              >
                {isAnalyzing || isStreaming ? "Stop" : "Send"}
              </button>
              <button
                onClick={handleClear}
                className="bg-input-bg border border-panel-border rounded-sm px-3 py-2 text-[10px] text-text-dim hover:text-text-primary hover:border-text-dim transition-colors disabled:opacity-0 disabled:pointer-events-none"
                disabled={messages.length === 0 || isAnalyzing || isStreaming}
                title="Clear history"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* === RIGHT SIDEBAR === */}
        <div className="w-[300px] shrink-0 border-l border-panel-border overflow-y-auto flex flex-col">

          {/* Pipeline */}
          <div className="border-b border-panel-border flex-1 flex flex-col">
            <div className="px-3 py-2">
              <span className="text-[10px] text-text-label uppercase tracking-[2px]">Pipeline</span>
            </div>
            <div className="px-3 pb-3 text-[11px] leading-relaxed flex-1 overflow-y-auto">
              {isAnalyzing && pipelineSteps.length === 0 ? (
                <div className="text-suspicious animate-pulse">Scanning...</div>
              ) : pipelineSteps.length === 0 ? (
                <div className="text-text-sub text-[10px]">Waiting for input...</div>
              ) : (
                <div className="space-y-0.5">
                  {pipelineSteps.map((step, i) => (
                    <div key={i} className="step-in flex items-start gap-1.5" style={{ color: step.color ?? "#6b6560", animationDelay: `${i * 50}ms` }}>
                      <span className="text-text-sub text-[9px] w-3 text-right shrink-0 mt-px">{i + 1}.</span>
                      <span>{step.text}</span>
                    </div>
                  ))}
                  {pipelineRunning && <div className="text-text-sub animate-pulse ml-4">...</div>}
                </div>
              )}
            </div>
          </div>

          {/* Session Stats */}
          <div className="border-b border-panel-border flex-1 flex flex-col">
            <div className="px-3 py-2">
              <span className="text-[10px] text-text-label uppercase tracking-[2px]">Session</span>
            </div>
            <div className="px-3 pb-3">
              <div className="text-center mb-3">
                <div className="text-[28px] font-bold text-text-primary">{stats.total}</div>
                <div className="text-[9px] text-text-dim uppercase tracking-wider">scanned</div>
              </div>

              <div className="grid grid-cols-4 gap-1 text-center mb-3">
                {([
                  { key: "safe", label: "Safe", count: stats.safe },
                  { key: "suspicious", label: "Susp", count: stats.suspicious },
                  { key: "likely_attack", label: "Attack", count: stats.likely_attack },
                  { key: "blocked", label: "Block", count: stats.blocked },
                ] as const).map((item) => (
                  <div key={item.key} className="bg-card rounded-sm py-1.5">
                    <div className={`text-[14px] font-bold ${LEVEL_TEXT_CLASS[item.key]}`}>{item.count}</div>
                    <div className="text-[8px] text-text-sub uppercase">{item.label}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-text-dim">Block Rate</span>
                  <span className="text-text-primary font-bold">{blockRate}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-dim">Avg Score</span>
                  <span className="text-text-primary">{avgScore.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-dim">Highest</span>
                  <span className={`font-bold ${highestScore > 0.6 ? "text-attack" : highestScore > 0.3 ? "text-suspicious" : "text-safe"}`}>
                    {highestScore.toFixed(3)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Categories */}
          {catEntries.length > 0 && (
            <div className="px-3 py-3">
              <span className="text-[10px] text-text-label uppercase tracking-[2px]">Categories</span>
              <div className="mt-2 space-y-1.5">
                {catEntries.map((c) => (
                  <div key={c.key}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[9px] text-text-dim truncate">{c.label}</span>
                      <span className="text-[9px] text-text-label ml-2">{c.count}</span>
                    </div>
                    <div className="h-1 bg-[#1a1916] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bar-grow bg-attack" style={{ width: `${(c.count / maxCatCount) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
