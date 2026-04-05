"use client";

import React from "react";
import {
  Eye,
  PencilSimple,
  File,
  Trash,
  Terminal,
  GitCommit,
  GitBranch,
  GitMerge,
  Circle,
} from "@phosphor-icons/react";

export interface TimelineEvent {
  id: string;
  sessionId: string;
  action: string;
  filePath?: string;
  summary: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  // Enriched from session data
  session_id?: string;
  file_path?: string;
  ts?: number;
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  read: Eye,
  edit: PencilSimple,
  create: File,
  delete: Trash,
  run_command: Terminal,
  commit: GitCommit,
  branch: GitBranch,
  merge: GitMerge,
};

const ACTION_COLORS: Record<string, string> = {
  read: "#6b6560",
  edit: "#c9a96e",
  create: "#a3b18a",
  delete: "#b85c4a",
  run_command: "#7ea8be",
  commit: "#a3b18a",
  branch: "#c9a96e",
  merge: "#b07bac",
};

const AGENT_COLORS: Record<string, string> = {
  "claude-code": "#a3b18a",
  cursor: "#c9a96e",
  codex: "#7ea8be",
  ollama: "#b07bac",
};

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function EventRow({ event, agentType }: { event: TimelineEvent; agentType?: string }) {
  const action = event.action;
  const Icon = ACTION_ICONS[action] || Circle;
  const color = ACTION_COLORS[action] || "#6b6560";
  const agentColor = agentType ? AGENT_COLORS[agentType] || "#6b6560" : "#6b6560";
  const ts = event.timestamp || event.ts || 0;
  const filePath = event.filePath || event.file_path;

  return (
    <div className="flex items-start gap-2 py-1.5 px-2 hover:bg-panel/30 rounded-sm step-in">
      {/* Action icon */}
      <div
        className="w-5 h-5 rounded-sm flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: color + "20" }}
      >
        <Icon size={11} weight="bold" style={{ color }} />
      </div>

      <div className="flex-1 min-w-0">
        {/* Top line: agent badge + action + file */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {agentType && (
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-1 rounded-sm"
              style={{ color: agentColor, background: agentColor + "15" }}
            >
              {agentType}
            </span>
          )}
          <span className="text-[10px] font-bold uppercase" style={{ color }}>
            {action}
          </span>
          {filePath && (
            <span className="text-[10px] text-text-dim truncate">{filePath}</span>
          )}
        </div>

        {/* Summary */}
        <div className="text-[11px] text-text-label leading-4 mt-0.5">{event.summary}</div>
      </div>

      {/* Timestamp */}
      <span className="text-[9px] text-text-sub shrink-0 mt-1">{formatTs(ts)}</span>
    </div>
  );
}

export function ActivityTimeline({
  events,
  sessionMap,
}: {
  events: TimelineEvent[];
  sessionMap?: Record<string, string>; // sessionId → agentType
}) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <Terminal size={24} weight="bold" className="text-text-sub" />
        <span className="text-[11px] text-text-dim">No activity yet</span>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {events.map((event) => (
        <EventRow
          key={event.id}
          event={event}
          agentType={sessionMap?.[event.sessionId || event.session_id || ""]}
        />
      ))}
    </div>
  );
}
