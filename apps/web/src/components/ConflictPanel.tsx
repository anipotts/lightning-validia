"use client";

import React from "react";
import { Warning, File, Lightning } from "@phosphor-icons/react";

export interface ConflictData {
  id: string;
  file_path: string;
  sessionIds: string[];
  detected_at: number;
  resolved_at?: number;
  resolution?: string;
}

const AGENT_COLORS: Record<string, string> = {
  "claude-code": "#a3b18a",
  cursor: "#c9a96e",
  codex: "#7ea8be",
  ollama: "#b07bac",
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

function ConflictRow({
  conflict,
  sessionMap,
}: {
  conflict: ConflictData;
  sessionMap?: Record<string, string>;
}) {
  return (
    <div className="px-3 py-2 border border-attack/30 rounded-sm bg-attack/5">
      {/* File path */}
      <div className="flex items-center gap-1.5 mb-1">
        <File size={12} weight="bold" className="text-attack" />
        <span className="text-[11px] text-text-primary font-bold truncate">{conflict.file_path}</span>
      </div>

      {/* Involved agents */}
      <div className="flex flex-wrap gap-1 mb-1">
        {conflict.sessionIds.map((sid) => {
          const agentType = sessionMap?.[sid] || "unknown";
          const color = AGENT_COLORS[agentType] || "#6b6560";
          return (
            <span
              key={sid}
              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm"
              style={{ color, background: color + "15", border: `1px solid ${color}30` }}
            >
              {agentType} #{sid.slice(0, 4)}
            </span>
          );
        })}
      </div>

      {/* Time + description */}
      <div className="flex items-center gap-2 text-[10px]">
        <Lightning size={10} weight="bold" className="text-attack" />
        <span className="text-attack">Both editing &mdash; diverging changes</span>
        <span className="text-text-sub ml-auto">{timeAgo(conflict.detected_at)}</span>
      </div>
    </div>
  );
}

export function ConflictPanel({
  conflicts,
  sessionMap,
}: {
  conflicts: ConflictData[];
  sessionMap?: Record<string, string>;
}) {
  if (conflicts.length === 0) {
    return (
      <div className="flex items-center gap-2 py-3 px-3 text-[11px] text-text-sub">
        <Warning size={14} weight="bold" />
        <span>No conflicts detected</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conflicts.map((c) => (
        <ConflictRow key={c.id} conflict={c} sessionMap={sessionMap} />
      ))}
    </div>
  );
}
