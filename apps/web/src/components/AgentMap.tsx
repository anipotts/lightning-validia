"use client";

import React, { useState } from "react";
import {
  Desktop,
  Cloud,
  Terminal,
  Cube,
  GitBranch,
  GitFork,
  Folder,
  CaretDown,
  CaretRight,
  Circle,
  Pulse,
  Eye,
  PencilSimple,
  File,
  Trash,
  Terminal as CommandIcon,
  GitCommit,
  GitMerge,
} from "@phosphor-icons/react";

// Types matching the API response
interface MapAgent {
  sessionId: string;
  agentType: string;
  status: string;
  currentAction?: string;
  currentFile?: string;
  lastHeartbeat: number;
  conversationVisible?: boolean;
  projectName?: string;
}

interface MapBranch {
  branch: string;
  isWorktree: boolean;
  agents: MapAgent[];
}

interface MapWorkspace {
  path: string;
  gitRemote?: string;
  isGit: boolean;
  branches: MapBranch[];
}

interface MapEnvironment {
  hostname: string;
  type: string;
  provider?: string;
  workspaces: MapWorkspace[];
}

interface AgentMapData {
  environments: MapEnvironment[];
  totalAgents: number;
}

const ENV_ICONS: Record<string, React.ElementType> = {
  local: Desktop,
  cloud: Cloud,
  ssh: Terminal,
  container: Cube,
};

const AGENT_COLORS: Record<string, string> = {
  "claude-code": "#a3b18a",
  cursor: "#c9a96e",
  codex: "#7ea8be",
  ollama: "#b07bac",
  other: "#6b6560",
};

const ACTION_ICONS: Record<string, React.ElementType> = {
  read: Eye,
  reading: Eye,
  edit: PencilSimple,
  editing: PencilSimple,
  create: File,
  creating: File,
  delete: Trash,
  deleting: Trash,
  run_command: CommandIcon,
  commit: GitCommit,
  merge: GitMerge,
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 5000) return "now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "ACTIVE", color: "#a3b18a" },
  idle: { label: "IDLE", color: "#c9a96e" },
  disconnected: { label: "OFF", color: "#4a4640" },
};

function AgentNode({ agent }: { agent: MapAgent }) {
  const color = AGENT_COLORS[agent.agentType] || AGENT_COLORS.other;
  const isActive = agent.status === "active";
  const isIdle = agent.status === "idle";
  const isOff = agent.status === "disconnected";
  const statusInfo = STATUS_LABELS[agent.status] || STATUS_LABELS.disconnected;
  const ActionIcon = agent.currentAction ? ACTION_ICONS[agent.currentAction.toLowerCase()] || Circle : Circle;

  const displayColor = isOff ? "#3d3a34" : isIdle ? color + "80" : color;

  return (
    <div className={`flex items-center gap-2 py-1.5 px-2 rounded-sm hover:bg-panel/50 group ${isOff ? "opacity-40" : ""}`}>
      {/* Status pulse */}
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${isActive ? "animate-pulse" : ""}`}
        style={{
          background: isOff ? "#3d3a34" : isIdle ? "#c9a96e" : color,
          boxShadow: isActive ? `0 0 6px ${color}` : isIdle ? "0 0 3px #c9a96e" : "none",
        }}
      />

      {/* Agent type + name/ID */}
      <span className="text-[11px] font-bold" style={{ color: displayColor }}>
        {agent.projectName || agent.agentType}
      </span>
      <span className="text-[9px] text-text-sub">
        {agent.projectName ? agent.agentType : ""}#{agent.sessionId.slice(0, 4)}
      </span>

      {/* Status badge for non-active */}
      {!isActive && (
        <span
          className="text-[8px] font-bold uppercase tracking-wider px-1 rounded-sm"
          style={{ color: statusInfo.color, background: statusInfo.color + "15" }}
        >
          {statusInfo.label}
        </span>
      )}

      {/* Current action */}
      {isActive && agent.currentAction && (
        <span className="flex items-center gap-1 text-[10px] text-text-dim">
          <ActionIcon size={10} weight="bold" />
          {agent.currentAction}
        </span>
      )}

      {/* Current file */}
      {isActive && agent.currentFile && (
        <span className="text-[10px] text-text-sub truncate max-w-[180px]">
          {agent.currentFile}
        </span>
      )}

      {/* Heartbeat */}
      <span className="text-[9px] text-text-sub ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
        {timeAgo(agent.lastHeartbeat)}
      </span>
    </div>
  );
}

function BranchNode({ branch }: { branch: MapBranch }) {
  const [open, setOpen] = useState(true);
  const Caret = open ? CaretDown : CaretRight;

  return (
    <div className="ml-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 py-0.5 text-[11px] text-text-label hover:text-text-primary transition-colors w-full"
      >
        <Caret size={10} />
        {branch.isWorktree ? (
          <GitFork size={12} weight="bold" className="text-suspicious" />
        ) : (
          <GitBranch size={12} weight="bold" />
        )}
        <span>{branch.branch}</span>
        {branch.isWorktree && (
          <span className="text-[9px] text-suspicious uppercase tracking-wider">worktree</span>
        )}
        <span className="text-[9px] text-text-sub ml-auto">{branch.agents.length}</span>
      </button>
      {open && (
        <div className="ml-3 border-l border-panel-border/40 pl-1">
          {branch.agents.map((agent) => (
            <AgentNode key={agent.sessionId} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkspaceNode({ workspace }: { workspace: MapWorkspace }) {
  const [open, setOpen] = useState(true);
  const Caret = open ? CaretDown : CaretRight;
  const agentCount = workspace.branches.reduce((acc, b) => acc + b.agents.length, 0);

  // Show last path segment
  const shortPath = workspace.path.split("/").slice(-2).join("/");

  return (
    <div className="ml-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 py-1 text-[11px] text-text-primary hover:text-text-primary transition-colors w-full"
      >
        <Caret size={10} />
        <Folder size={13} weight="bold" className="text-text-dim" />
        <span className="font-bold">{shortPath}</span>
        {workspace.isGit && workspace.gitRemote && (
          <span className="text-[9px] text-text-sub truncate max-w-[200px]">
            {workspace.gitRemote.replace(/^.*[:/]/, "").replace(/\.git$/, "")}
          </span>
        )}
        <span className="text-[9px] text-text-sub ml-auto">{agentCount}</span>
      </button>
      {open && (
        <div>
          {workspace.branches.map((branch) => (
            <BranchNode key={branch.branch} branch={branch} />
          ))}
        </div>
      )}
    </div>
  );
}

function EnvironmentNode({ env }: { env: MapEnvironment }) {
  const [open, setOpen] = useState(true);
  const Caret = open ? CaretDown : CaretRight;
  const EnvIcon = ENV_ICONS[env.type] || Desktop;
  const agentCount = env.workspaces.reduce(
    (acc, ws) => acc + ws.branches.reduce((a, b) => a + b.agents.length, 0),
    0
  );

  return (
    <div className="border border-panel-border rounded-sm bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 w-full hover:bg-panel/30 transition-colors"
      >
        <Caret size={11} className="text-text-sub" />
        <EnvIcon size={15} weight="bold" className="text-text-label" />
        <span className="text-[12px] font-bold text-text-primary">{env.hostname}</span>
        <span className="text-[10px] text-text-sub uppercase tracking-wider">
          {env.type}
          {env.provider && ` / ${env.provider}`}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Pulse size={12} className="text-safe" />
          <span className="text-[10px] text-text-label">{agentCount}</span>
        </span>
      </button>
      {open && (
        <div className="px-1 pb-2">
          {env.workspaces.map((ws) => (
            <WorkspaceNode key={ws.path} workspace={ws} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentMap({ data }: { data: AgentMapData | null }) {
  if (!data || data.environments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-12">
        <Desktop size={28} weight="bold" className="text-text-sub" />
        <span className="text-[12px] text-text-dim">No agents connected</span>
        <span className="text-[10px] text-text-sub">Agents will appear here when they send heartbeats</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.environments.map((env) => (
        <EnvironmentNode key={env.hostname} env={env} />
      ))}
    </div>
  );
}
