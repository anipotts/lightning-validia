import { Hono } from "hono";
import type { Bindings } from "../types";

const sessions = new Hono<{ Bindings: Bindings }>();

// POST /sessions/heartbeat — register or update an agent session
sessions.post("/heartbeat", async (c) => {
  const body = await c.req.json();

  const {
    sessionId,
    agentType,
    environment,
    workspace,
    currentAction,
    currentFile,
    sessionName,
  } = body;

  if (!sessionId || !agentType || !environment?.hostname || !workspace?.path) {
    return c.json({ error: "sessionId, agentType, environment.hostname, and workspace.path are required" }, 400);
  }

  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO agent_sessions (session_id, agent_type, env_hostname, env_type, env_provider, ws_path, ws_is_git, ws_git_remote, ws_branch, ws_is_worktree, status, current_action, current_file, last_heartbeat, created_at, project_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       status = 'active',
       current_action = excluded.current_action,
       current_file = excluded.current_file,
       last_heartbeat = excluded.last_heartbeat,
       ws_branch = excluded.ws_branch,
       env_hostname = excluded.env_hostname,
       project_name = COALESCE(excluded.project_name, agent_sessions.project_name)`
  )
    .bind(
      sessionId,
      agentType,
      environment.hostname,
      environment.type || "local",
      environment.provider || null,
      workspace.path,
      workspace.isGit ? 1 : 0,
      workspace.gitRemote || null,
      workspace.branch || null,
      workspace.isWorktree ? 1 : 0,
      currentAction || null,
      currentFile || null,
      now,
      now,
      sessionName || null,
    )
    .run();

  return c.json({ ok: true, sessionId, heartbeat: now });
});

// GET /sessions — list all sessions
sessions.get("/", async (c) => {
  const showAll = c.req.query("showAll") === "true";
  const query = showAll
    ? `SELECT * FROM agent_sessions ORDER BY last_heartbeat DESC`
    : `SELECT * FROM agent_sessions WHERE status != 'disconnected' ORDER BY last_heartbeat DESC`;
  const result = await c.env.DB.prepare(query).all();
  return c.json({ sessions: result.results });
});

// POST /sessions/:id/visibility — toggle conversation visibility
sessions.post("/:id/visibility", async (c) => {
  const id = c.req.param("id");
  const { visible } = await c.req.json();
  await c.env.DB.prepare(
    `UPDATE agent_sessions SET conversation_visible = ? WHERE session_id = ?`
  ).bind(visible ? 1 : 0, id).run();
  return c.json({ ok: true, sessionId: id, conversationVisible: visible });
});

// POST /sessions/:id/disconnect — mark session as disconnected
sessions.post("/:id/disconnect", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare(
    `UPDATE agent_sessions SET status = 'disconnected' WHERE session_id = ?`
  ).bind(id).run();
  return c.json({ ok: true });
});

export { sessions };
