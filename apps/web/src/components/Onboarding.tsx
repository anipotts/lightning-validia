"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Copy,
  Check,
  Terminal,
  ArrowRight,
  Circle,
  GitBranch,
  Desktop,
  Cloud,
  Cube,
  TreeStructure,
  Lightning,
  Eye,
} from "@phosphor-icons/react";

// ── Copy button ─────────────────────────────────────────────────────

function CopyBlock({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative">
      {label && (
        <div className="text-[9px] text-text-sub uppercase tracking-wider mb-1">{label}</div>
      )}
      <button
        onClick={handleCopy}
        className="w-full text-left bg-[#0e0d0c] border border-panel-border/60 rounded-sm px-3 py-2.5 text-[12px] text-text-primary leading-5 hover:border-text-dim/40 transition-all cursor-pointer"
      >
        <pre className="whitespace-pre-wrap break-all overflow-hidden">{text}</pre>
        <span className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {copied ? (
            <Check size={14} weight="bold" className="text-safe" />
          ) : (
            <Copy size={14} weight="bold" className="text-text-sub" />
          )}
        </span>
      </button>
    </div>
  );
}

// ── Animated pulse ring ─────────────────────────────────────────────

function PulseRing() {
  return (
    <div className="relative w-20 h-20 flex items-center justify-center">
      <div className="absolute inset-0 rounded-full border border-safe/20 animate-[ping_3s_ease-out_infinite]" />
      <div className="absolute inset-2 rounded-full border border-safe/30 animate-[ping_3s_ease-out_0.5s_infinite]" />
      <div className="absolute inset-4 rounded-full border border-safe/40 animate-[ping_3s_ease-out_1s_infinite]" />
      <ShieldCheck size={32} weight="bold" className="text-safe relative z-10" />
    </div>
  );
}

// ── Fake agent map preview (shows what they'll get) ─────────────────

function MapPreview() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % 4);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const agents = [
    { type: "claude-code", branch: "main", action: "editing src/index.ts", color: "#a3b18a" },
    { type: "cursor", branch: "feat/auth", action: "reading api/routes.ts", color: "#c9a96e" },
    { type: "codex", branch: "main", action: "running tests", color: "#7ea8be" },
  ];

  return (
    <div className="border border-panel-border/40 rounded-sm bg-card/50 p-3 text-[11px]">
      <div className="flex items-center gap-2 mb-2 text-text-sub">
        <Desktop size={12} weight="bold" />
        <span className="font-bold text-text-label">your-machine</span>
        <span className="text-[9px] uppercase tracking-wider">local</span>
      </div>
      <div className="ml-3 border-l border-panel-border/30 pl-3 space-y-1.5">
        {agents.map((agent, i) => (
          <div
            key={agent.type}
            className="flex items-center gap-2 transition-all duration-500"
            style={{ opacity: i <= step ? 1 : 0.2 }}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${i <= step ? "animate-pulse" : ""}`}
              style={{
                background: i <= step ? agent.color : "#3d3a34",
                boxShadow: i <= step ? `0 0 4px ${agent.color}` : "none",
              }}
            />
            <GitBranch size={10} className="text-text-sub" />
            <span className="text-text-sub">{agent.branch}</span>
            <span className="font-bold" style={{ color: agent.color }}>
              {agent.type}
            </span>
            <span className="text-text-sub truncate">{agent.action}</span>
          </div>
        ))}
        {step >= 3 && (
          <div className="flex items-center gap-1.5 mt-1 step-in">
            <Lightning size={10} weight="bold" className="text-attack" />
            <span className="text-[10px] text-attack">Conflict: src/index.ts</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step indicator ──────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1 rounded-full transition-all duration-300 ${
            i === current ? "w-6 bg-safe" : i < current ? "w-1.5 bg-safe/50" : "w-1.5 bg-panel-border"
          }`}
        />
      ))}
    </div>
  );
}

// ── Main onboarding ─────────────────────────────────────────────────

const HOOK_CONFIG = `{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "bash /path/to/openproof-hook.sh"
      }
    ]
  }
}`;

export function Onboarding({ apiUrl }: { apiUrl: string }) {
  const [step, setStep] = useState(0);
  const [checking, setChecking] = useState(false);

  const hookScript = `curl -fsSL ${apiUrl.replace('/api', '')}/hook.sh -o ~/.openproof-hook.sh && chmod +x ~/.openproof-hook.sh`;

  const settingsSnippet = `// Add to ~/.claude/settings.json → "hooks"
"PreToolUse": [
  {
    "type": "command",
    "command": "bash ~/.openproof-hook.sh"
  }
]`;

  const testCommand = `curl -s -X POST ${apiUrl}/sessions/heartbeat \\
  -H "Content-Type: application/json" \\
  -d '{"sessionId":"test-'$RANDOM'","agentType":"claude-code","environment":{"hostname":"'$(hostname -s)'","type":"local"},"workspace":{"path":"'$PWD'","isGit":true}}' | python3 -m json.tool`;

  return (
    <div className="flex-1 flex items-center justify-center overflow-y-auto">
      <div className="max-w-xl w-full px-6 py-12">
        {/* Hero */}
        {step === 0 && (
          <div className="step-in flex flex-col items-center text-center gap-6">
            <PulseRing />

            <div>
              <h1 className="text-2xl font-bold tracking-wide mb-2">OpenProof</h1>
              <p className="text-[13px] text-text-dim leading-5 max-w-md">
                See every AI agent working on your codebase. Across machines, branches, and worktrees &mdash; in real time.
              </p>
            </div>

            {/* Preview */}
            <MapPreview />

            {/* Value props */}
            <div className="grid grid-cols-3 gap-4 w-full text-center">
              <div className="flex flex-col items-center gap-1.5">
                <TreeStructure size={18} weight="bold" className="text-safe" />
                <span className="text-[10px] text-text-label">Agent Map</span>
                <span className="text-[9px] text-text-sub leading-3">See who is working where</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <Eye size={18} weight="bold" className="text-suspicious" />
                <span className="text-[10px] text-text-label">Live Activity</span>
                <span className="text-[9px] text-text-sub leading-3">Every read, edit, and commit</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <Lightning size={18} weight="bold" className="text-attack" />
                <span className="text-[10px] text-text-label">Conflict Detection</span>
                <span className="text-[9px] text-text-sub leading-3">Before merge nightmares</span>
              </div>
            </div>

            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-2 bg-safe/15 border border-safe/30 rounded-sm px-6 py-2.5 text-[11px] font-bold text-safe hover:bg-safe/25 transition-colors uppercase tracking-wider"
            >
              Connect Claude Code <ArrowRight size={13} weight="bold" />
            </button>

            <StepDots current={0} total={3} />
          </div>
        )}

        {/* Step 1: Download hook */}
        {step === 1 && (
          <div className="step-in flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <button onClick={() => setStep(0)} className="text-text-sub hover:text-text-primary transition-colors text-[11px]">&larr;</button>
              <div>
                <h2 className="text-lg font-bold">Install the hook</h2>
                <p className="text-[12px] text-text-dim">One script, zero dependencies</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-safe/20 text-safe flex items-center justify-center text-[10px] font-bold">1</span>
                  <span className="text-[11px] text-text-label">Download the hook script</span>
                </div>
                <CopyBlock text={`curl -fsSL ${apiUrl}/hook.sh -o ~/.openproof-hook.sh && chmod +x ~/.openproof-hook.sh`} />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-safe/20 text-safe flex items-center justify-center text-[10px] font-bold">2</span>
                  <span className="text-[11px] text-text-label">Add to Claude Code settings</span>
                </div>
                <CopyBlock
                  label="~/.claude/settings.json"
                  text={settingsSnippet}
                />
              </div>

              <div className="bg-panel/50 rounded-sm p-3 border border-panel-border/40">
                <div className="flex items-center gap-2 mb-1.5">
                  <Terminal size={13} weight="bold" className="text-text-dim" />
                  <span className="text-[10px] text-text-label uppercase tracking-wider">How it works</span>
                </div>
                <p className="text-[11px] text-text-dim leading-4">
                  The hook runs on every Claude Code tool call. It auto-detects your machine, repo, branch, and worktree — then fires a heartbeat + event to the OpenProof API. Non-blocking, under 50ms overhead.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-2 bg-safe/15 border border-safe/30 rounded-sm px-5 py-2 text-[11px] font-bold text-safe hover:bg-safe/25 transition-colors uppercase tracking-wider"
              >
                Next: Verify <ArrowRight size={13} weight="bold" />
              </button>
              <StepDots current={1} total={3} />
            </div>
          </div>
        )}

        {/* Step 2: Verify connection */}
        {step === 2 && (
          <div className="step-in flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <button onClick={() => setStep(1)} className="text-text-sub hover:text-text-primary transition-colors text-[11px]">&larr;</button>
              <div>
                <h2 className="text-lg font-bold">Verify connection</h2>
                <p className="text-[12px] text-text-dim">Start a Claude Code session &mdash; it should appear here automatically</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="text-[12px] text-text-label">
                Open any project with Claude Code. The hook will start reporting immediately.
              </div>

              <div className="border border-panel-border rounded-sm p-4 bg-card/50">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <div className="relative">
                    <Circle
                      size={40}
                      weight="bold"
                      className={`${checking ? "text-suspicious animate-spin" : "text-panel-border"}`}
                    />
                    <ShieldCheck
                      size={18}
                      weight="bold"
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-text-dim"
                    />
                  </div>
                </div>

                <div className="text-center mb-4">
                  <div className="text-[12px] text-text-dim">
                    {checking ? "Listening for agents..." : "Waiting for first heartbeat"}
                  </div>
                  <div className="text-[10px] text-text-sub mt-1">
                    This page auto-refreshes every 5 seconds
                  </div>
                </div>

                <button
                  onClick={() => setChecking(true)}
                  className="w-full bg-panel border border-panel-border rounded-sm px-4 py-2 text-[11px] text-text-dim hover:text-text-primary hover:border-text-dim transition-colors"
                >
                  {checking ? "Checking..." : "Check now"}
                </button>
              </div>

              <details className="group">
                <summary className="text-[11px] text-text-sub cursor-pointer hover:text-text-primary transition-colors">
                  Want to test manually?
                </summary>
                <div className="mt-2">
                  <CopyBlock
                    label="Run in any terminal"
                    text={`curl -s -X POST ${apiUrl}/sessions/heartbeat \\\n  -H "Content-Type: application/json" \\\n  -d '{"sessionId":"manual-test","agentType":"claude-code","environment":{"hostname":"test","type":"local"},"workspace":{"path":"/tmp/test","isGit":false}}'`}
                  />
                </div>
              </details>
            </div>

            <div className="flex items-center gap-3 mt-2">
              <StepDots current={2} total={3} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
