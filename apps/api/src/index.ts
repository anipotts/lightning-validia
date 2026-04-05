import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Bindings } from "./types";
import { sessions } from "./routes/sessions";
import { events } from "./routes/events";
import { map } from "./routes/map";
import { conflicts } from "./routes/conflicts";

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "*",
  cors({
    origin: [
      "https://openproof.pages.dev",
      "https://openproof-api.anipotts.workers.dev",
      "http://localhost:3000",
    ],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

// Security headers
app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
});

// Health
app.get("/health", (c) =>
  c.json({ status: "ok", service: "openproof-api", version: "0.2.0" }),
);

// Serve hook script for easy install
app.get("/hook.sh", (c) => {
  const script = `#!/usr/bin/env bash
# OpenProof Claude Code Hook — auto-reports agent activity
# Install: curl -fsSL https://openproof-api.anipotts.workers.dev/hook.sh | bash
set -euo pipefail
API_URL="\${OPENPROOF_API_URL:-https://openproof-api.anipotts.workers.dev}"
if [ -z "\${OPENPROOF_SESSION:-}" ]; then export OPENPROOF_SESSION="cc-$(hostname -s | tr '[:upper:]' '[:lower:]')-\$\$"; fi
detect_env_type() {
  if [ -n "\${LIGHTNING_CLOUD_PROJECT_ID:-}" ] || [ -n "\${LIGHTNING_CLOUD_SPACE_ID:-}" ]; then echo "cloud"
  elif [ -n "\${CODESPACE_NAME:-}" ]; then echo "cloud"
  elif [ -f "/.dockerenv" ] || grep -q docker /proc/1/cgroup 2>/dev/null; then echo "container"
  elif [ -n "\${SSH_CONNECTION:-}" ]; then echo "ssh"
  else echo "local"; fi
}
detect_provider() {
  if [ -n "\${LIGHTNING_CLOUD_PROJECT_ID:-}" ]; then echo "lightning-ai"
  elif [ -n "\${CODESPACE_NAME:-}" ]; then echo "github-codespace"
  else echo ""; fi
}
detect_workspace() {
  local is_git=false git_remote="" branch="" is_worktree=false ws_path="\${PWD}"
  if git rev-parse --show-toplevel >/dev/null 2>&1; then
    is_git=true; ws_path="$(git rev-parse --show-toplevel)"
    git_remote="$(git remote get-url origin 2>/dev/null || echo "")"
    branch="$(git branch --show-current 2>/dev/null || echo "")"
    local git_dir git_common
    git_dir="$(git rev-parse --git-dir 2>/dev/null)"; git_common="$(git rev-parse --git-common-dir 2>/dev/null)"
    if [ "$git_dir" != "$git_common" ]; then is_worktree=true; fi
  fi
  printf '{"path":"%s","isGit":%s,"gitRemote":"%s","branch":"%s","isWorktree":%s}' "$ws_path" "$is_git" "$git_remote" "$branch" "$is_worktree"
}
INPUT="$(cat)"
TOOL_NAME="$(echo "$INPUT" | grep -o '"tool_name":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")"
FILE_PATH="$(echo "$INPUT" | grep -o '"file_path":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")"
case "$TOOL_NAME" in Read) ACTION="read";; Edit|Write) ACTION="edit";; Bash) ACTION="run_command";; *) ACTION="read";; esac
SUMMARY="$TOOL_NAME"; [ -n "$FILE_PATH" ] && SUMMARY="$TOOL_NAME $FILE_PATH"
ENV_TYPE="$(detect_env_type)"; ENV_PROVIDER="$(detect_provider)"; HOSTNAME_VAL="$(hostname -s)"; WORKSPACE="$(detect_workspace)"
SESSION_NAME="\${OPENPROOF_SESSION_NAME:-$(basename "\$PWD")}"
curl -sf -X POST "$API_URL/sessions/heartbeat" -H "Content-Type: application/json" -d "{\\"sessionId\\":\\"$OPENPROOF_SESSION\\",\\"agentType\\":\\"claude-code\\",\\"sessionName\\":\\"$SESSION_NAME\\",\\"environment\\":{\\"hostname\\":\\"$HOSTNAME_VAL\\",\\"type\\":\\"$ENV_TYPE\\",\\"provider\\":\\"$ENV_PROVIDER\\"},\\"workspace\\":$WORKSPACE,\\"currentAction\\":\\"$ACTION\\",\\"currentFile\\":\\"$FILE_PATH\\"}" >/dev/null 2>&1 &
[ -n "$TOOL_NAME" ] && curl -sf -X POST "$API_URL/events" -H "Content-Type: application/json" -d "{\\"sessionId\\":\\"$OPENPROOF_SESSION\\",\\"action\\":\\"$ACTION\\",\\"filePath\\":\\"$FILE_PATH\\",\\"summary\\":\\"$SUMMARY\\"}" >/dev/null 2>&1 &
exit 0`;
  return new Response(script, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
});

// Routes
app.route("/sessions", sessions);
app.route("/events", events);
app.route("/map", map);
app.route("/conflicts", conflicts);

export default app;
