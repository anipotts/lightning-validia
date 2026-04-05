import { Hono } from "hono";
import type { Bindings } from "../types";

const map = new Hono<{ Bindings: Bindings }>();

interface SessionRow {
  session_id: string;
  agent_type: string;
  env_hostname: string;
  env_type: string;
  env_provider: string | null;
  ws_path: string;
  ws_is_git: number;
  ws_git_remote: string | null;
  ws_branch: string | null;
  ws_is_worktree: number;
  status: string;
  current_action: string | null;
  current_file: string | null;
  last_heartbeat: number;
  created_at: number;
  conversation_visible: number;
  project_name: string | null;
}

// GET /map — current agent map grouped by env → workspace → branch
// ?showAll=true to include disconnected/idle sessions
map.get("/", async (c) => {
  const showAll = c.req.query("showAll") === "true";

  // Mark stale sessions (no heartbeat for 60s) as idle, 5min as disconnected
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE agent_sessions SET status = 'idle' WHERE status = 'active' AND last_heartbeat < ?`
    ).bind(now - 60000),
    c.env.DB.prepare(
      `UPDATE agent_sessions SET status = 'disconnected' WHERE status IN ('active','idle') AND last_heartbeat < ?`
    ).bind(now - 300000),
  ]);

  // Fetch sessions based on filter
  const query = showAll
    ? `SELECT * FROM agent_sessions ORDER BY status ASC, last_heartbeat DESC`
    : `SELECT * FROM agent_sessions WHERE status != 'disconnected' ORDER BY last_heartbeat DESC`;

  const result = await c.env.DB.prepare(query).all();
  const rows = result.results as unknown as SessionRow[];

  // Group: env → workspace → branch → agents
  const envMap = new Map<string, {
    hostname: string;
    type: string;
    provider?: string;
    workspaces: Map<string, {
      path: string;
      gitRemote?: string;
      isGit: boolean;
      branches: Map<string, {
        branch: string;
        isWorktree: boolean;
        agents: Array<{
          sessionId: string;
          agentType: string;
          status: string;
          currentAction?: string;
          currentFile?: string;
          lastHeartbeat: number;
          conversationVisible: boolean;
          projectName?: string;
        }>;
      }>;
    }>;
  }>();

  for (const row of rows) {
    if (!envMap.has(row.env_hostname)) {
      envMap.set(row.env_hostname, {
        hostname: row.env_hostname,
        type: row.env_type,
        provider: row.env_provider || undefined,
        workspaces: new Map(),
      });
    }
    const env = envMap.get(row.env_hostname)!;

    const wsKey = row.ws_git_remote || row.ws_path;
    if (!env.workspaces.has(wsKey)) {
      env.workspaces.set(wsKey, {
        path: row.ws_path,
        gitRemote: row.ws_git_remote || undefined,
        isGit: !!row.ws_is_git,
        branches: new Map(),
      });
    }
    const ws = env.workspaces.get(wsKey)!;

    const branchKey = row.ws_branch || "(no branch)";
    if (!ws.branches.has(branchKey)) {
      ws.branches.set(branchKey, {
        branch: branchKey,
        isWorktree: !!row.ws_is_worktree,
        agents: [],
      });
    }
    const branch = ws.branches.get(branchKey)!;

    branch.agents.push({
      sessionId: row.session_id,
      agentType: row.agent_type,
      status: row.status,
      currentAction: row.current_action || undefined,
      currentFile: row.current_file || undefined,
      lastHeartbeat: row.last_heartbeat,
      conversationVisible: row.conversation_visible === 1,
      projectName: row.project_name || undefined,
    });
  }

  const environments = Array.from(envMap.values()).map((env) => ({
    hostname: env.hostname,
    type: env.type,
    provider: env.provider,
    workspaces: Array.from(env.workspaces.values()).map((ws) => ({
      path: ws.path,
      gitRemote: ws.gitRemote,
      isGit: ws.isGit,
      branches: Array.from(ws.branches.values()),
    })),
  }));

  const activeCount = rows.filter((r) => r.status === "active").length;
  const idleCount = rows.filter((r) => r.status === "idle").length;
  const disconnectedCount = rows.filter((r) => r.status === "disconnected").length;

  return c.json({
    environments,
    totalAgents: rows.length,
    active: activeCount,
    idle: idleCount,
    disconnected: disconnectedCount,
  });
});

export { map };
