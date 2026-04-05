-- Agent sessions: tracks each connected agent
CREATE TABLE IF NOT EXISTS agent_sessions (
  session_id TEXT PRIMARY KEY,
  agent_type TEXT NOT NULL,
  env_hostname TEXT NOT NULL,
  env_type TEXT NOT NULL,
  env_provider TEXT,
  ws_path TEXT NOT NULL,
  ws_is_git INTEGER NOT NULL DEFAULT 0,
  ws_git_remote TEXT,
  ws_branch TEXT,
  ws_is_worktree INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  current_action TEXT,
  current_file TEXT,
  last_heartbeat INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_sessions_status ON agent_sessions(status);
CREATE INDEX idx_sessions_heartbeat ON agent_sessions(last_heartbeat);

-- Events: agent activity log
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES agent_sessions(session_id),
  action TEXT NOT NULL,
  file_path TEXT,
  summary TEXT NOT NULL,
  ts INTEGER NOT NULL,
  metadata TEXT
);

CREATE INDEX idx_events_session ON events(session_id);
CREATE INDEX idx_events_ts ON events(ts DESC);
CREATE INDEX idx_events_file ON events(file_path);

-- Conflicts: detected file conflicts between agents
CREATE TABLE IF NOT EXISTS conflicts (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  session_ids TEXT NOT NULL,
  detected_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolution TEXT
);

CREATE INDEX idx_conflicts_file ON conflicts(file_path);
CREATE INDEX idx_conflicts_active ON conflicts(resolved_at) WHERE resolved_at IS NULL;
