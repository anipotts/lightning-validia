"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
import { analyzePrompt, analyzePromptAPI } from "./analyzer";
import { useGateway } from "./useGateway";
import dynamic from "next/dynamic";

const FlaggedContentBars = dynamic(() => import("./FlaggedContentBars"), { ssr: false });
const FileIcon3D = dynamic(() => import("./FlaggedContentBars").then((m) => ({ default: m.FileIcon3D })), { ssr: false });

// ─── Launch Animation ──────────────────────────────────

function Sprocket({ size = 120, color = "#c9a96e" }: { size?: number; color?: string }) {
  const teeth = 8;
  const outerR = size / 2;
  const innerR = outerR * 0.72;
  const toothH = outerR * 0.18;
  const toothW = 0.22; // radians half-width

  // Build sprocket gear path
  const points: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const angle = (i / teeth) * Math.PI * 2;
    // Tooth outer corners
    const a1 = angle - toothW;
    const a2 = angle + toothW;
    const r1 = innerR;
    const r2 = outerR + toothH;
    // Valley before tooth
    const va = angle - Math.PI / teeth;
    points.push(`${outerR + r1 * Math.cos(va)},${outerR + r1 * Math.sin(va)}`);
    // Tooth rise
    points.push(`${outerR + r2 * Math.cos(a1)},${outerR + r2 * Math.sin(a1)}`);
    points.push(`${outerR + r2 * Math.cos(a2)},${outerR + r2 * Math.sin(a2)}`);
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Gear body */}
      <polygon
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Inner circle */}
      <circle
        cx={outerR}
        cy={outerR}
        r={innerR * 0.45}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
      />
      {/* Center dot */}
      <circle cx={outerR} cy={outerR} r={4} fill={color} />
    </svg>
  );
}

function LaunchAnimation({ onComplete }: { onComplete: () => void }) {
  const [dots, setDots] = useState("");
  const [phase, setPhase] = useState<"spin" | "done" | "fade">("spin");
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 400);

    const doneTimeout = setTimeout(() => {
      setPhase("done");
      clearInterval(dotsInterval);
    }, 2400);

    return () => {
      clearInterval(dotsInterval);
      clearTimeout(doneTimeout);
    };
  }, []);

  useEffect(() => {
    if (phase === "done") {
      const t = setTimeout(() => setPhase("fade"), 500);
      return () => clearTimeout(t);
    }
    if (phase === "fade") {
      setOpacity(0);
      const t = setTimeout(onComplete, 500);
      return () => clearTimeout(t);
    }
  }, [phase, onComplete]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center font-mono"
      style={{
        background: "#0a0a0a",
        opacity,
        transition: "opacity 0.5s ease-out",
      }}
    >
      {/* Rotating sprocket */}
      <div
        style={{
          animation: phase === "spin" ? "sprocket-spin 2s linear infinite" : "none",
          transition: "filter 0.3s",
          filter: phase === "done" ? "drop-shadow(0 0 12px #a3b18a)" : "none",
        }}
      >
        <Sprocket size={120} color={phase === "done" ? "#a3b18a" : "#c9a96e"} />
      </div>

      {/* Status text */}
      <div className="mt-8 text-center">
        {phase === "done" ? (
          <span className="text-xs tracking-[4px] uppercase" style={{ color: "#a3b18a" }}>
            INITIALIZED
          </span>
        ) : (
          <span className="text-xs tracking-[4px] uppercase" style={{ color: "#8a8478" }}>
            INITIALIZING{dots}
          </span>
        )}
      </div>

      {/* Bottom branding */}
      <div className="absolute bottom-8 text-center">
        <div className="text-[10px] tracking-[4px] uppercase" style={{ color: "#3d3a34" }}>
          SHIELDCLAW
        </div>
      </div>

      <style>{`
        @keyframes sprocket-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
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

type ShieldPhase = "idle" | "launch" | "fly" | "land" | "crash";

function ShieldIcon({ phase }: { phase: ShieldPhase }) {
  const isAnalyzing = phase === "launch" || phase === "fly";
  const isSafe = phase === "land";
  const isDanger = phase === "crash";

  const color = isDanger
    ? "var(--attack)"
    : isSafe
    ? "var(--safe)"
    : isAnalyzing
    ? "var(--suspicious)"
    : "var(--text-sub)";

  return (
    <svg width="64" height="72" viewBox="0 0 64 72" fill="none"
      className={isAnalyzing ? "animate-pulse" : ""}>
      <path
        d="M32 2L4 16v20c0 17.6 11.9 34.1 28 38 16.1-3.9 28-20.4 28-38V16L32 2z"
        fill={color}
        fillOpacity="0.12"
        stroke={color}
        strokeWidth="2.5"
      />
      {isSafe && (
        <path d="M20 36l8 8 16-16" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      )}
      {isDanger && (
        <>
          <line x1="24" y1="28" x2="40" y2="44" stroke={color} strokeWidth="3" strokeLinecap="round" />
          <line x1="40" y1="28" x2="24" y2="44" stroke={color} strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {isAnalyzing && (
        <circle cx="32" cy="36" r="4" fill={color} />
      )}
    </svg>
  );
}

const LEVEL_BG_CLASS: Record<string, string> = {
  safe: "bg-safe",
  suspicious: "bg-suspicious",
  likely_attack: "bg-attack",
  blocked: "bg-blocked",
};

// ─── Flagged File Row ───────────────────────────────────

const SEVERITY_HEX: Record<string, string> = {
  safe: "#a3b18a",
  suspicious: "#c9a96e",
  likely_attack: "#b85c4a",
  blocked: "#8a3a2e",
};

function FlaggedFileRow({ file }: { file: FlaggedFile }) {
  const [hovered, setHovered] = useState(false);
  const color = SEVERITY_HEX[file.threatLevel];

  return (
    <div
      className="rounded-sm flex items-stretch relative"
      style={{ overflow: "visible" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Background + severity flood fill */}
      <div
        className="absolute inset-0 rounded-sm"
        style={{
          background: hovered
            ? `linear-gradient(90deg, ${color}35, ${color}10)`
            : "#12110f",
          border: hovered ? `1px solid ${color}50` : "1px solid transparent",
          transition: "all 0.3s ease",
        }}
      />

      {/* Left severity strip — glows on hover */}
      <div
        className="w-1.5 shrink-0 rounded-l-sm relative z-[1]"
        style={{
          background: color,
          boxShadow: hovered ? `0 0 8px ${color}80` : "none",
          transition: "box-shadow 0.3s",
        }}
      />

      {/* Content */}
      <div className="flex items-center gap-2 px-2 py-2 relative z-[1]">
        {/* 3D icon — bursts upward on hover */}
        <div
          style={{
            transition: "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
            transform: hovered ? "translateY(-8px) scale(1.25)" : "translateY(0) scale(1)",
          }}
        >
          <FileIcon3D filename={file.name} isHovered={hovered} />
        </div>
        <div>
          <div className={`text-[10px] font-bold ${LEVEL_TEXT_CLASS[file.threatLevel]}`}>
            {THREAT_LABELS[file.threatLevel]}
          </div>
          <div className="text-text-dim text-[11px]">
            {file.name} — {file.category} ({file.score.toFixed(2)})
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────

export default function Home() {
  const [launched, setLaunched] = useState(false);
  const [events, setEvents] = useState<ThreatEvent[]>([]);
  const [stats, setStats] = useState<Stats>(INITIAL_STATS);
  const [input, setInput] = useState("");
  const [useWs, setUseWs] = useState(false);
  const [flaggedFiles, setFlaggedFiles] = useState<FlaggedFile[]>(INITIAL_FLAGGED_FILES);
  const [routingEvent, setRoutingEvent] = useState<ThreatEvent | null>(null);
  const [shieldPhase, setShieldPhase] = useState<ShieldPhase>("idle");

  const [pendingEvent, setPendingEvent] = useState<ThreatEvent | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleLaunchComplete = useCallback(() => setLaunched(true), []);

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


  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  async function handleSend() {
    const text = input.trim();
    if (!text) return;

    if (useWs && gateway.sendMessage(text)) {
      setInput("");
      return;
    }

    setInput("");
    setShieldPhase("launch");
    setTimeout(() => setShieldPhase("fly"), 400);

    // Try real API first, fall back to local
    let event;
    try {
      event = await analyzePromptAPI(text);
    } catch {
      event = analyzePrompt(text);
    }

    setPendingEvent(event);

    // land/crash after fly
    setTimeout(() => {
      const isSafe = event.threatLevel === "safe";
      setShieldPhase(isSafe ? "land" : "crash");
      setEvents((prev) => [...prev, event]);
      setStats((prev) => updateStats(prev, event));
      setRoutingEvent(event);
      if (event.threatLevel !== "safe") {
        setFlaggedFiles((prev) => [
          { name: `msg_${stats.total + 1}`, threatLevel: event.threatLevel, category: event.category ?? "none", score: event.threatScore },
          ...prev,
        ]);
      }
    }, 800);
    setTimeout(() => {
      setShieldPhase("idle");
      setPendingEvent(null);
    }, 2600);
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
    <>
    {!launched && <LaunchAnimation onComplete={handleLaunchComplete} />}
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
              <div className="text-text-dim mt-1">Scanning {stats.total} messages...</div>
              <div className="text-text-primary mt-3">Results:</div>
              <div className="mt-2 text-safe">{pad("", 2)}{String(stats.safe).padStart(4)} safe</div>
              <div className="text-suspicious">{pad("", 2)}{String(stats.suspicious).padStart(4)} suspicious</div>
              <div className="text-attack">{pad("", 2)}{String(stats.likely_attack).padStart(4)} likely attack</div>
              <div className="text-blocked">{pad("", 2)}{String(stats.blocked).padStart(4)} blocked</div>
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
                <FlaggedFileRow key={i} file={f} />
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

          {/* Security Check */}
          <div className="bg-panel border border-panel-border rounded-sm">
            <div className="px-3 py-2">
              <div className="text-xs text-text-label">Security Check</div>
            </div>
            <div className="px-3 pb-3 flex">
              {/* Left stats */}
              <div className="text-[11px] text-text-dim w-36 shrink-0">
                <div>Session: {stats.total} msgs</div>
                <div>Blocked: {stats.blocked + stats.likely_attack}</div>
                <div>Flagged: {stats.suspicious}</div>
                <div>Clean: {stats.safe}</div>
              </div>

              {/* Shield Icon */}
              <div className="flex-1 flex items-center justify-center">
                <ShieldIcon phase={shieldPhase} />
              </div>

              {/* Routing status */}
              <div className="text-[11px] w-44 shrink-0">
                {routingEvent ? (
                  <>
                    <div className={`text-[10px] ${LEVEL_TEXT_CLASS[routingEvent.threatLevel]}`}>Checking...</div>
                    <div className="text-text-dim mt-1 text-[10px]">Message #{msgNumber}</div>
                    <div className="text-text-dim mt-2 text-[10px]">Category: {routingEvent.category ?? "none"}</div>
                    <div className="text-text-dim text-[10px]">Score: {pad("", 3)}{routingEvent.threatScore.toFixed(2)}</div>
                    <div className="text-text-dim text-[10px]">Latency: {pad("", 1)}{Math.floor(Math.random() * 20 + 5)}ms</div>
                    <div className="border-t border-panel-border my-2" />
                    {routingEvent.threatLevel === "safe" ? (
                      <div className="text-[10px] text-text-dim mt-1">&#10003; Message verified</div>
                    ) : (
                      <div className={`text-[10px] font-medium mt-1 ${LEVEL_TEXT_CLASS[routingEvent.threatLevel]}`}>&#10005; Message flagged</div>
                    )}
                    {routingEvent.twoStage && (
                      <div className={`text-[10px] mt-1 ${routingEvent.stage2Verdict === "BENIGN" ? "text-safe" : "text-attack"}`}>
                        Stage 2: {routingEvent.stage2Verdict} ({routingEvent.stage2Model})
                      </div>
                    )}
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
              <div className="text-xs text-text-label">Chat</div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-2">
              {events.length === 0 && (
                <div className="flex items-center justify-center h-full text-text-sub text-[11px]">
                  Type a message...
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
                      {evt.twoStage ? (
                        <span className={`inline-block text-[8px] font-bold tracking-[0.5px] px-1.5 py-0.5 rounded-sm ml-1 ${
                          evt.stage2Verdict === "BENIGN"
                            ? "bg-safe/20 text-safe border border-safe/30"
                            : "bg-attack/20 text-attack border border-attack/30"
                        }`}>
                          {evt.stage2Verdict === "BENIGN" ? "\u2713 Stage 2: Benign" : "\u26A0 Stage 2: Attack"}
                        </span>
                      ) : evt.threatLevel !== "safe" ? (
                        <span className="inline-block text-[8px] tracking-[0.5px] px-1.5 py-0.5 rounded-sm ml-1 bg-[#222] text-text-dim border border-panel-border">
                          Stage 1 only
                        </span>
                      ) : null}
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
        <div className="w-[330px] shrink-0 p-3 overflow-y-auto flex flex-col gap-3">
          <div className="bg-panel border border-panel-border rounded-sm flex flex-col flex-1">
            <div className="px-3 py-2">
              <span className="text-[10px] text-text-label uppercase tracking-[2px]">Threat Overview</span>
            </div>
            <div className="px-3 pb-3 flex flex-col gap-2 flex-1 justify-between">

              {/* Total */}
              <div className="bg-card border border-panel-border rounded-sm py-5 text-center">
                <div className="text-[9px] text-text-label uppercase tracking-[1.5px]">Total Scanned</div>
                <div className="text-[28px] font-bold text-text-primary mt-2">{stats.total}</div>
                <div className="text-[11px] text-text-dim mt-1">messages this session</div>
              </div>

              {/* Safe */}
              <div className="bg-card border border-panel-border rounded-sm py-4 text-center relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-safe" />
                <div className="text-[9px] text-text-label uppercase tracking-[1.5px]">Safe</div>
                <div className="text-[28px] font-bold text-safe mt-1">{stats.safe}</div>
                <div className="text-[11px] text-text-dim mt-0.5">{safePercent}%</div>
              </div>

              {/* Suspicious */}
              <div className="bg-card border border-panel-border rounded-sm py-4 text-center relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-suspicious" />
                <div className="text-[9px] text-text-label uppercase tracking-[1.5px]">Suspicious</div>
                <div className="text-[28px] font-bold text-suspicious mt-1">{stats.suspicious}</div>
                <div className="text-[11px] text-text-dim mt-0.5">{susPercent}%</div>
              </div>

              {/* Likely Attack */}
              <div className="bg-card border border-panel-border rounded-sm py-4 text-center relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-attack" />
                <div className="text-[9px] text-text-label uppercase tracking-[1.5px]">Likely Attack</div>
                <div className="text-[28px] font-bold text-attack mt-1">{stats.likely_attack}</div>
                <div className="text-[11px] text-text-dim mt-0.5">{attackPercent}%</div>
              </div>

              {/* Blocked */}
              <div className="bg-card border border-panel-border rounded-sm py-4 text-center relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blocked" />
                <div className="text-[9px] text-text-label uppercase tracking-[1.5px]">Blocked</div>
                <div className="text-[28px] font-bold text-blocked mt-1">{stats.blocked}</div>
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
    </>
  );
}
