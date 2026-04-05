"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { AgentMap } from "../components/AgentMap";
import { ActivityTimeline, type TimelineEvent } from "../components/ActivityTimeline";
import { ConflictPanel, type ConflictData } from "../components/ConflictPanel";
import { Onboarding } from "../components/Onboarding";
import {
  ShieldCheck,
  ArrowsClockwise,
  Pulse,
  Lightning,
  ListBullets,
  TreeStructure,
  Eye,
  EyeSlash,
} from "@phosphor-icons/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://openproof-api.anipotts.workers.dev";

interface AgentMapData {
  environments: Array<{
    hostname: string;
    type: string;
    provider?: string;
    workspaces: Array<{
      path: string;
      gitRemote?: string;
      isGit: boolean;
      branches: Array<{
        branch: string;
        isWorktree: boolean;
        agents: Array<{
          sessionId: string;
          agentType: string;
          status: string;
          currentAction?: string;
          currentFile?: string;
          lastHeartbeat: number;
          conversationVisible?: boolean;
          projectName?: string;
        }>;
      }>;
    }>;
  }>;
  totalAgents: number;
  active?: number;
  idle?: number;
  disconnected?: number;
}

function buildSessionMap(data: AgentMapData | null): Record<string, string> {
  const map: Record<string, string> = {};
  if (!data) return map;
  for (const env of data.environments) {
    for (const ws of env.workspaces) {
      for (const br of ws.branches) {
        for (const agent of br.agents) {
          map[agent.sessionId] = agent.agentType;
        }
      }
    }
  }
  return map;
}

export default function Home() {
  const [mapData, setMapData] = useState<AgentMapData | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [conflicts, setConflicts] = useState<ConflictData[]>([]);
  const [connected, setConnected] = useState(false);
  const [showAll, setShowAll] = useState(true);
  const eventSourceRef = useRef<(() => void) | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [mapRes, eventsRes, conflictsRes] = await Promise.all([
        fetch(`${API_URL}/map?showAll=${showAll}`),
        fetch(`${API_URL}/events/history?limit=50`),
        fetch(`${API_URL}/conflicts`),
      ]);

      const mapJson = await mapRes.json();
      const eventsJson = await eventsRes.json();
      const conflictsJson = await conflictsRes.json();

      setMapData(mapJson);
      setEvents(
        (eventsJson.events || []).map((e: Record<string, unknown>) => ({
          id: e.id,
          sessionId: e.session_id,
          action: e.action,
          filePath: e.file_path,
          summary: e.summary,
          timestamp: e.ts,
          metadata: e.metadata,
        }))
      );
      setConflicts(conflictsJson.conflicts || []);
    } catch {
      // Silently retry
    }
  }, [showAll]);

  useEffect(() => {
    fetchAll();

    let aborted = false;
    const connectSSE = async () => {
      try {
        const response = await fetch(`${API_URL}/events/stream`);
        if (!response.ok || !response.body) return;

        setConnected(true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "ping" || parsed.type === "connected") continue;

              if (parsed.id && parsed.action) {
                setEvents((prev) => [
                  {
                    id: parsed.id,
                    sessionId: parsed.sessionId,
                    action: parsed.action,
                    filePath: parsed.filePath,
                    summary: parsed.summary,
                    timestamp: parsed.timestamp,
                    metadata: parsed.metadata,
                  },
                  ...prev.slice(0, 99),
                ]);
                fetchAll();
              }
            } catch {
              // Skip
            }
          }
        }
      } catch {
        setConnected(false);
      }
    };

    connectSSE();
    const pollInterval = setInterval(fetchAll, 5000);

    eventSourceRef.current = () => {
      aborted = true;
      clearInterval(pollInterval);
    };

    return () => {
      aborted = true;
      clearInterval(pollInterval);
    };
  }, [fetchAll]);

  const sessionMap = buildSessionMap(mapData);
  const totalAgents = mapData?.totalAgents || 0;
  const activeCount = mapData?.active || 0;
  const idleCount = mapData?.idle || 0;
  const disconnectedCount = mapData?.disconnected || 0;
  const hasAgents = totalAgents > 0 || events.length > 0;

  if (!hasAgents) {
    return (
      <div className="flex flex-col h-screen bg-bg text-text-primary font-mono overflow-hidden">
        <header className="h-11 shrink-0 flex items-center justify-between px-5 bg-item border-b border-panel-border shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold tracking-wider flex items-center gap-1.5">
              <ShieldCheck size={20} weight="bold" /> OPENPROOF
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-dim">{connected ? "LIVE" : "POLLING"}</span>
            <span
              className={`w-2.5 h-2.5 rounded-full ${connected ? "bg-safe animate-pulse" : "bg-suspicious"}`}
              style={{ boxShadow: connected ? "0 0 6px var(--safe)" : "0 0 4px var(--suspicious)" }}
            />
          </div>
        </header>
        <Onboarding apiUrl={API_URL} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-bg text-text-primary font-mono overflow-hidden">
      {/* Header */}
      <header className="h-11 shrink-0 flex items-center justify-between px-5 bg-item border-b border-panel-border shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-wider flex items-center gap-1.5">
            <ShieldCheck size={20} weight="bold" /> OPENPROOF
          </span>
          <span className="text-text-sub">|</span>
          <span className="text-[11px] text-text-dim tracking-wider">MULTI-AGENT MONITOR</span>
        </div>
        <div className="flex items-center gap-4">
          {/* Agent counts */}
          <div className="flex items-center gap-3 text-[10px]">
            {activeCount > 0 && (
              <span className="flex items-center gap-1 text-safe">
                <span className="w-1.5 h-1.5 rounded-full bg-safe animate-pulse" />
                {activeCount} active
              </span>
            )}
            {idleCount > 0 && (
              <span className="flex items-center gap-1 text-suspicious">
                <span className="w-1.5 h-1.5 rounded-full bg-suspicious" />
                {idleCount} idle
              </span>
            )}
            {showAll && disconnectedCount > 0 && (
              <span className="flex items-center gap-1 text-text-sub">
                <span className="w-1.5 h-1.5 rounded-full bg-text-sub" />
                {disconnectedCount} off
              </span>
            )}
          </div>

          {/* Show all toggle */}
          <button
            onClick={() => setShowAll(!showAll)}
            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-sm border transition-colors ${
              showAll
                ? "border-safe/30 text-safe bg-safe/10"
                : "border-panel-border text-text-sub hover:text-text-primary"
            }`}
            title={showAll ? "Showing all sessions" : "Showing active only"}
          >
            {showAll ? <Eye size={12} weight="bold" /> : <EyeSlash size={12} weight="bold" />}
            {showAll ? "All" : "Active"}
          </button>

          <button
            onClick={fetchAll}
            className="text-[10px] text-text-sub hover:text-text-primary transition-colors"
            title="Refresh"
          >
            <ArrowsClockwise size={14} weight="bold" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-dim">{connected ? "LIVE" : "POLLING"}</span>
            <span
              className={`w-2.5 h-2.5 rounded-full ${connected ? "bg-safe animate-pulse" : "bg-suspicious"}`}
              style={{ boxShadow: connected ? "0 0 6px var(--safe)" : "0 0 4px var(--suspicious)" }}
            />
          </div>
        </div>
      </header>

      {/* Main layout: 3-panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Agent Map */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-panel-border">
          <div className="px-4 py-2 border-b border-panel-border flex items-center gap-2">
            <TreeStructure size={14} weight="bold" className="text-text-label" />
            <span className="text-[10px] text-text-label uppercase tracking-[2px]">Agent Map</span>
            <span className="text-[9px] text-text-sub ml-auto">
              {totalAgents} session{totalAgents !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <AgentMap data={mapData} />
          </div>
        </div>

        {/* Right sidebar: Activity + Conflicts */}
        <div className="w-[340px] shrink-0 flex flex-col overflow-hidden">
          {/* Activity Timeline */}
          <div className="flex-1 flex flex-col min-h-0 border-b border-panel-border">
            <div className="px-3 py-2 border-b border-panel-border flex items-center gap-2 shrink-0">
              <ListBullets size={14} weight="bold" className="text-text-label" />
              <span className="text-[10px] text-text-label uppercase tracking-[2px]">Activity</span>
              <span className="text-[9px] text-text-sub ml-auto">{events.length} events</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ActivityTimeline events={events} sessionMap={sessionMap} />
            </div>
          </div>

          {/* Conflicts */}
          <div className="shrink-0 max-h-[250px] overflow-y-auto">
            <div className="px-3 py-2 border-b border-panel-border flex items-center gap-2">
              <Lightning size={14} weight="bold" className="text-attack" />
              <span className="text-[10px] text-text-label uppercase tracking-[2px]">Conflicts</span>
              {conflicts.length > 0 && (
                <span className="text-[9px] text-attack font-bold ml-auto">{conflicts.length}</span>
              )}
            </div>
            <div className="p-2">
              <ConflictPanel conflicts={conflicts} sessionMap={sessionMap} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
