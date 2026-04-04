"use client";

import { useState, useRef, useEffect } from "react";
import {
  type ThreatEvent,
  type Stats,
  type AttackCategory,
  type FlaggedFile,
  CATEGORY_LABELS,
  THREAT_LABELS,
  LOG_PREFIXES,
  INITIAL_STATS,
  INITIAL_FLAGGED_FILES,
} from "./types";
import { analyzePrompt } from "./analyzer";
import { useGateway } from "./useGateway";

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

function pad(s: string, len: number): string {
  return s + " ".repeat(Math.max(0, len - s.length));
}

function dotPad(label: string, value: number): string {
  const dots = ".".repeat(Math.max(1, 26 - label.length));
  return `  ${label} ${dots} ${value}`;
}

const LEVEL_TEXT_CLASS: Record<string, string> = {
  safe: "text-safe",
  suspicious: "text-suspicious",
  likely_attack: "text-attack",
  blocked: "text-blocked",
};

type RocketPhase = "idle" | "launch" | "fly" | "land" | "crash";

const ROCKET_ART = `   |
  /|\\
 / | \\
|  S  |
|  H  |
|  I  |
|  E  |
|  L  |
|  D  |
\\_____/
 || ||`;

const EXHAUST = [
  " )| |(  \n  \\~~/  \n   \\/   ",
  "(| | )( \n  (~~)  \n   \\/   ",
  " )| |(  \n  )~~(  \n   \\/   ",
];

const CRASH_ART = `     *
  \\  |  /
 -- 💥 --
  /  |  \\
    / \\
  /_ _ _\\
 |  S H  |
 | I E L |
 |__D____|
  //  \\\\
~~~~~~~~~~~`;

const LANDED_ART = `   |
  /|\\
 / | \\
|  S  |
|  H  |
|  I  |
|  E  |
|  L  |
|  D  |
\\_____/
 || ||
=======
  ✓`;

const LEVEL_BG_CLASS: Record<string, string> = {
  safe: "bg-safe",
  suspicious: "bg-suspicious",
  likely_attack: "bg-attack",
  blocked: "bg-blocked",
};

// ─── Page ───────────────────────────────────────────────

export default function Home() {
  const [events, setEvents] = useState<ThreatEvent[]>([]);
  const [stats, setStats] = useState<Stats>(INITIAL_STATS);
  const [input, setInput] = useState("");
  const [useWs, setUseWs] = useState(false);
  const [flaggedFiles] = useState<FlaggedFile[]>(INITIAL_FLAGGED_FILES);
  const [routingEvent, setRoutingEvent] = useState<ThreatEvent | null>(null);
  const [rocketPhase, setRocketPhase] = useState<RocketPhase>("idle");
  const [exhaustFrame, setExhaustFrame] = useState(0);
  const [pendingEvent, setPendingEvent] = useState<ThreatEvent | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const gateway = useGateway(useWs);

  // Merge gateway events
  useEffect(() => {
    if (gateway.events.length > 0 && gateway.events[0]) {
      const latest = gateway.events[0];
      if (!events.find((e) => e.id === latest.id)) {
        setEvents((prev) => [latest, ...prev]);
        setStats((prev) => updateStats(prev, latest));
        setRoutingEvent(latest);
      }
    }
  }, [gateway.events, events]);

  // Exhaust animation loop during launch/fly
  useEffect(() => {
    if (rocketPhase !== "launch" && rocketPhase !== "fly") return;
    const interval = setInterval(() => {
      setExhaustFrame((f) => (f + 1) % EXHAUST.length);
    }, 100);
    return () => clearInterval(interval);
  }, [rocketPhase]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  function handleSend() {
    const text = input.trim();
    if (!text) return;

    if (useWs && gateway.sendMessage(text)) {
      setInput("");
      return;
    }

    const event = analyzePrompt(text);
    setPendingEvent(event);
    setRocketPhase("launch");

    // launch → fly → land/crash
    setTimeout(() => setRocketPhase("fly"), 400);
    setTimeout(() => {
      const isSafe = event.threatLevel === "safe";
      setRocketPhase(isSafe ? "land" : "crash");
      setEvents((prev) => [...prev, event]);
      setStats((prev) => updateStats(prev, event));
      setRoutingEvent(event);
    }, 1200);
    setTimeout(() => {
      setRocketPhase("idle");
      setPendingEvent(null);
    }, 3000);
    setInput("");
  }

  const blockRate = stats.total > 0
    ? ((stats.blocked + stats.likely_attack) / stats.total * 100).toFixed(1)
    : "0.0";

  const safePercent = stats.total > 0 ? (stats.safe / stats.total * 100).toFixed(1) : "0.0";
  const susPercent = stats.total > 0 ? (stats.suspicious / stats.total * 100).toFixed(1) : "0.0";
  const attackPercent = stats.total > 0 ? (stats.likely_attack / stats.total * 100).toFixed(1) : "0.0";
  const blockedPercent = stats.total > 0 ? (stats.blocked / stats.total * 100).toFixed(1) : "0.0";

  const msgNumber = stats.total;

  return (
    <div className="flex flex-col h-screen bg-bg text-text-primary font-mono">
      {/* ─── Header ─── */}
      <header className="h-11 shrink-0 flex items-center justify-between px-5 bg-item border-b border-panel-border">
        <div className="flex items-center gap-3">
          <span className="text-base font-bold tracking-wider text-text-primary">SHIELDCLAW</span>
          <span className="text-text-sub">|</span>
          <span className="text-[11px] text-text-dim tracking-wider">PARANOID SHIELD DASHBOARD</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setUseWs(!useWs)}
            className="text-[10px] text-text-dim hover:text-text-primary border border-panel-border rounded px-2 py-0.5 transition-colors"
          >
            {useWs ? "LOCAL" : "CONNECT"}
          </button>
          <span className="text-[10px] text-text-dim">
            {useWs ? gateway.status.toUpperCase() : "LIVE"}
          </span>
          <span className={`w-2 h-2 rounded-full ${useWs && gateway.status !== "connected" ? "bg-suspicious" : "bg-safe"}`} />
        </div>
      </header>

      {/* ─── 3-Column Layout ─── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ═══ LEFT COLUMN ═══ */}
        <div className="w-[340px] shrink-0 flex flex-col gap-3 p-3 overflow-y-auto">

          {/* Scanned Docs */}
          <div className="bg-panel border border-panel-border rounded-sm flex flex-col">
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-[10px] text-text-label uppercase tracking-[2px]">Scanned Docs</span>
              <svg width="14" height="14" viewBox="0 0 14 14" className="text-text-dim" stroke="currentColor" fill="none" strokeWidth="1.5">
                <line x1="7" y1="2" x2="7" y2="9" />
                <polyline points="4,7 7,10 10,7" />
                <line x1="3" y1="12" x2="11" y2="12" />
              </svg>
            </div>
            <div className="mx-3 mb-3 bg-[#0e0d0c] rounded-sm p-3 text-[11px] leading-relaxed overflow-auto max-h-[320px]">
              <div className="text-safe">$ openclaw scan --input session.log</div>
              <div className="text-text-dim mt-1">Scanning {stats.total || 142} messages...</div>
              <div className="text-text-primary mt-3">Results:</div>
              <div className="mt-2 text-safe">{pad("", 2)}{String(stats.safe || 118).padStart(4)} safe</div>
              <div className="text-suspicious">{pad("", 2)}{String(stats.suspicious || 16).padStart(4)} suspicious</div>
              <div className="text-attack">{pad("", 2)}{String(stats.likely_attack || 6).padStart(4)} likely attack</div>
              <div className="text-blocked">{pad("", 2)}{String(stats.blocked || 2).padStart(4)} blocked</div>
              <div className="border-t border-panel-border my-3" />
              <div className="text-text-dim">Categories detected:</div>
              <div className="mt-1 text-text-label">
                {(Object.entries(CATEGORY_LABELS) as [AttackCategory, string][]).map(([key, label]) => (
                  <div key={key}>{dotPad(label, stats.byCategory[key])}</div>
                ))}
              </div>
              <div className="border-t border-panel-border my-3" />
              <div className="text-text-dim">Block rate: {blockRate}%</div>
            </div>
          </div>

          {/* Alerts / Flagged Files */}
          <div className="bg-panel border border-panel-border rounded-sm flex-1 flex flex-col">
            <div className="px-3 py-2">
              <span className="text-[10px] text-text-label uppercase tracking-[2px]">Alerts</span>
              <div className="text-sm font-semibold text-text-primary mt-0.5">Flagged Files</div>
            </div>
            <div className="px-3 pb-3 space-y-1.5 overflow-y-auto flex-1">
              {flaggedFiles.map((f, i) => (
                <div key={i} className="bg-item rounded-sm flex items-stretch overflow-hidden">
                  <div className={`w-1.5 shrink-0 ${LEVEL_BG_CLASS[f.threatLevel]}`} />
                  <div className="px-3 py-2">
                    <div className={`text-[10px] font-bold ${LEVEL_TEXT_CLASS[f.threatLevel]}`}>
                      {THREAT_LABELS[f.threatLevel]}
                    </div>
                    <div className="text-text-dim text-[11px]">
                      {f.name} — {f.category} ({f.score.toFixed(2)})
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ CENTER COLUMN ═══ */}
        <div className="flex-1 min-w-0 flex flex-col gap-3 py-3 overflow-y-auto">

          {/* Previously Generated Output */}
          <div className="bg-panel border border-panel-border rounded-sm mx-0">
            <div className="px-3 py-2">
              <span className="text-[10px] text-text-label uppercase tracking-[2px]">Previously Generated Output</span>
            </div>
            <div className="mx-3 mb-3 bg-[#0e0d0c] rounded-sm p-3 text-[11px] leading-relaxed max-h-[180px] overflow-y-auto">
              {events.length === 0 ? (
                <div className="text-text-dim"># Waiting for messages...</div>
              ) : (
                <>
                  <div className="text-text-dim"># Last classification batch — {new Date().toLocaleString()}</div>
                  {[...events].reverse().slice(-8).map((evt, i) => (
                    <div key={evt.id} className={LEVEL_TEXT_CLASS[evt.threatLevel]}>
                      {LOG_PREFIXES[evt.threatLevel]}#{i + 1}{pad("", 3)}&quot;{evt.input.length > 50 ? evt.input.slice(0, 50) + "..." : evt.input}&quot;
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Routing Engine */}
          <div className="bg-panel border border-panel-border rounded-sm">
            <div className="px-3 py-2">
              <span className="text-[10px] text-text-label uppercase tracking-[2px]">Routing Engine</span>
              <div className="text-sm font-semibold text-text-primary mt-0.5">Paranoid Shield — ASCII Mode</div>
            </div>
            <div className="px-3 pb-3 flex">
              {/* Left stats */}
              <div className="text-[11px] text-text-dim w-36 shrink-0">
                <div>Session: {stats.total} msgs</div>
                <div>Blocked: {stats.blocked + stats.likely_attack}</div>
                <div>Flagged: {stats.suspicious}</div>
                <div>Clean: {stats.safe}</div>
              </div>

              {/* ASCII Shield */}
              <div className="flex-1 flex flex-col items-center justify-center overflow-hidden">
                {rocketPhase === "crash" ? (
                  <pre className="text-[10px] leading-[1.2] select-none text-center text-attack whitespace-pre">{CRASH_ART}</pre>
                ) : rocketPhase === "land" ? (
                  <pre className="text-[10px] leading-[1.2] select-none text-center text-safe whitespace-pre">{LANDED_ART}</pre>
                ) : (
                  <div
                    className={`flex flex-col items-center transition-transform duration-500 ease-in-out ${
                      rocketPhase === "fly" ? "-translate-y-6" : rocketPhase === "launch" ? "-translate-y-2" : "translate-y-0"
                    }`}
                  >
                    <pre className={`text-[10px] leading-[1.2] select-none text-center whitespace-pre transition-colors ${
                      rocketPhase === "launch" || rocketPhase === "fly" ? "text-suspicious" : "text-text-sub"
                    }`}>{ROCKET_ART}</pre>
                    {(rocketPhase === "launch" || rocketPhase === "fly") ? (
                      <pre className="text-[10px] leading-[1.2] select-none text-center text-attack whitespace-pre">{EXHAUST[exhaustFrame]}</pre>
                    ) : (
                      <pre className="text-[10px] leading-[1.2] select-none text-center text-text-sub whitespace-pre">{" ^^  ^^\n"}</pre>
                    )}
                  </div>
                )}
              </div>

              {/* Routing status */}
              <div className="text-[11px] w-44 shrink-0">
                {routingEvent ? (
                  <>
                    <div className={LEVEL_TEXT_CLASS[routingEvent.threatLevel]}>Routing...</div>
                    <div className="text-text-primary mt-1">msg #{msgNumber} → classify()</div>
                    <div className="text-text-dim mt-2">Category: {routingEvent.category ?? "none"}</div>
                    <div className="text-text-dim">Score: {pad("", 3)}{routingEvent.threatScore.toFixed(2)}</div>
                    <div className="text-text-dim">Latency: {pad("", 1)}{Math.floor(Math.random() * 20 + 5)}ms</div>
                    <div className="border-t border-panel-border my-2" />
                    <div className={`text-xs font-bold ${LEVEL_TEXT_CLASS[routingEvent.threatLevel]}`}>
                      RESULT: {THREAT_LABELS[routingEvent.threatLevel]}
                    </div>
                    <div className="text-text-dim">
                      {routingEvent.threatLevel === "safe" ? "Pass through to agent" : "Flagged by shield"}
                    </div>
                  </>
                ) : (
                  <div className="text-text-dim">Awaiting input...</div>
                )}
              </div>
            </div>
          </div>

          {/* Chat */}
          <div className="bg-panel border border-panel-border rounded-sm flex-1 flex flex-col min-h-[180px]">
            <div className="px-3 py-2">
              <span className="text-[10px] text-text-label uppercase tracking-[2px]">Chat</span>
              <div className="text-sm font-semibold text-text-primary mt-0.5">Agent Interface</div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-2">
              {events.length === 0 && (
                <div className="flex items-center justify-center h-full text-text-sub text-[11px]">
                  Type a message to test the Paranoid Agent...
                </div>
              )}
              {events.map((evt) => (
                <div key={evt.id} className="space-y-1.5">
                  {/* User bubble */}
                  <div className="flex justify-end">
                    <div className="bg-input-bg rounded-sm px-3 py-2 max-w-[80%]">
                      <span className="text-[11px] text-text-primary">{evt.input}</span>
                    </div>
                  </div>
                  {/* Agent bubble */}
                  <div className="flex justify-start">
                    <div className="bg-[#161512] rounded-sm px-3 py-2 max-w-[85%]">
                      <span className={`inline-block text-[8px] font-bold tracking-[0.5px] px-1.5 py-0.5 rounded-sm text-bg ${LEVEL_BG_CLASS[evt.threatLevel]}`}>
                        {THREAT_LABELS[evt.threatLevel]}
                      </span>
                      <div className={`text-[10px] mt-1 ${LEVEL_TEXT_CLASS[evt.threatLevel]}`}>
                        {evt.response}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            {/* Input */}
            <div className="px-3 pb-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Type a message..."
                  className="flex-1 bg-input-bg border border-panel-border rounded-sm px-3 py-1.5 text-[11px] text-text-primary placeholder:text-text-sub focus:outline-none focus:border-text-dim"
                />
                <button
                  onClick={handleSend}
                  className="bg-input-bg border border-panel-border rounded-sm px-4 py-1.5 text-[10px] font-bold text-text-label hover:text-text-primary hover:border-text-dim transition-colors uppercase tracking-wider"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT COLUMN ═══ */}
        <div className="w-[330px] shrink-0 p-3 overflow-y-auto">
          <div className="bg-panel border border-panel-border rounded-sm h-full flex flex-col">
            <div className="px-3 py-2">
              <span className="text-[10px] text-text-label uppercase tracking-[2px]">Threat Overview</span>
            </div>
            <div className="px-3 pb-3 flex flex-col gap-2 flex-1">

              {/* Total */}
              <div className="bg-card border border-panel-border rounded-sm py-5 text-center">
                <div className="text-[9px] text-text-label uppercase tracking-[1.5px]">Total Scanned</div>
                <div className="text-[28px] font-bold text-text-primary mt-2">{stats.total || 142}</div>
                <div className="text-[11px] text-text-dim mt-1">messages this session</div>
              </div>

              {/* Safe */}
              <div className="bg-card border border-panel-border rounded-sm py-4 text-center relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-safe" />
                <div className="text-[9px] text-text-label uppercase tracking-[1.5px]">Safe</div>
                <div className="text-[28px] font-bold text-safe mt-1">{stats.safe || 118}</div>
                <div className="text-[11px] text-text-dim mt-0.5">{safePercent}%</div>
              </div>

              {/* Suspicious */}
              <div className="bg-card border border-panel-border rounded-sm py-4 text-center relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-suspicious" />
                <div className="text-[9px] text-text-label uppercase tracking-[1.5px]">Suspicious</div>
                <div className="text-[28px] font-bold text-suspicious mt-1">{stats.suspicious || 16}</div>
                <div className="text-[11px] text-text-dim mt-0.5">{susPercent}%</div>
              </div>

              {/* Likely Attack */}
              <div className="bg-card border border-panel-border rounded-sm py-4 text-center relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-attack" />
                <div className="text-[9px] text-text-label uppercase tracking-[1.5px]">Likely Attack</div>
                <div className="text-[28px] font-bold text-attack mt-1">{stats.likely_attack || 6}</div>
                <div className="text-[11px] text-text-dim mt-0.5">{attackPercent}%</div>
              </div>

              {/* Blocked */}
              <div className="bg-card border border-panel-border rounded-sm py-4 text-center relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blocked" />
                <div className="text-[9px] text-text-label uppercase tracking-[1.5px]">Blocked</div>
                <div className="text-[28px] font-bold text-blocked mt-1">{stats.blocked || 2}</div>
                <div className="text-[11px] text-text-dim mt-0.5">{blockedPercent}%</div>
              </div>

              {/* Block Rate */}
              <div className="bg-card border border-panel-border rounded-sm px-4 py-3 flex items-center justify-between">
                <span className="text-[9px] text-text-label uppercase tracking-[1.5px]">Block Rate</span>
                <span className="text-base font-bold text-text-primary">{blockRate}%</span>
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
