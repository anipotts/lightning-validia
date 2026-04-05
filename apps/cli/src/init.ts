import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

const API_URL = "https://api.claudemon.com";
const HOOK_PATH = join(homedir(), ".claudemon-hook.sh");
const SETTINGS_PATH = join(homedir(), ".claude", "settings.json");

export async function init() {
  console.log("\n  ClaudeMon — Setup\n");

  // Step 1: Device auth
  console.log("  [1/3] Authenticating...");
  const apiKey = await deviceAuth();
  if (!apiKey) {
    console.log("  Authentication cancelled.\n");
    return;
  }
  console.log("  Authenticated!\n");

  // Step 2: Write hook script
  console.log("  [2/3] Installing hook...");
  writeHook(apiKey);
  console.log(`  Written to ${HOOK_PATH}\n`);

  // Step 3: Patch Claude Code settings
  console.log("  [3/3] Configuring Claude Code...");
  patchSettings();
  console.log(`  Updated ${SETTINGS_PATH}\n`);

  console.log("  Done! ClaudeMon is now active.");
  console.log("  Dashboard: https://app.claudemon.com\n");
}

async function deviceAuth(): Promise<string | null> {
  // Start device auth
  const startRes = await fetch(`${API_URL}/auth/device/start`, { method: "POST" });
  const { device_code, verification_url } = (await startRes.json()) as {
    device_code: string;
    verification_url: string;
  };

  console.log(`\n  Open this URL to authorize:\n  ${verification_url}\n`);

  // Try to open browser
  try {
    const cmd =
      process.platform === "darwin" ? "open" :
      process.platform === "win32" ? "start" : "xdg-open";
    execSync(`${cmd} "${verification_url}"`, { stdio: "ignore" });
  } catch {
    // User will open manually
  }

  console.log("  Waiting for authorization...");

  // Poll for approval
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(`${API_URL}/auth/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_code }),
    });
    if (pollRes.status === 200) {
      const { api_key } = (await pollRes.json()) as { api_key: string };
      return api_key;
    }
    // 202 = still pending, keep polling
    if (pollRes.status !== 202) return null;
    process.stdout.write(".");
  }

  return null;
}

function writeHook(apiKey: string) {
  const script = `#!/usr/bin/env bash
# ClaudeMon Hook — installed by \`npx claudemon init\`
set -euo pipefail

API_URL="\${CLAUDEMON_API_URL:-https://api.claudemon.com}"
CLAUDEMON_API_KEY="${apiKey}"
MACHINE_ID="$(hostname -s | tr '[:upper:]' '[:lower:]')"
TIMESTAMP="$(date +%s)000"
INPUT="$(cat)"

BRANCH=""; PROJECT_PATH="$PWD"
if git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  BRANCH="$(git branch --show-current 2>/dev/null || true)"
  PROJECT_PATH="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
fi

if command -v jq &>/dev/null; then
  PAYLOAD="$(echo "$INPUT" | jq -c \\
    --arg mid "$MACHINE_ID" \\
    --argjson ts "$TIMESTAMP" \\
    --arg pp "$PROJECT_PATH" \\
    --arg br "$BRANCH" \\
    '{
      session_id: .session_id,
      machine_id: $mid,
      timestamp: $ts,
      project_path: $pp,
      hook_event_name: .hook_event_name,
      branch: $br,
      tool_name: .tool_name,
      tool_input: .tool_input,
      tool_response: (.tool_response // null),
      tool_use_id: (.tool_use_id // null),
      model: (.model // null),
      permission_mode: (.permission_mode // null),
      cwd: (.cwd // null),
      transcript_path: (.transcript_path // null),
      last_assistant_message: (.last_assistant_message // null)
    } | with_entries(select(.value != null))'
  )"
else
  SID="$(echo "$INPUT" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
  HEN="$(echo "$INPUT" | grep -o '"hook_event_name":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
  SID="\${SID:-unknown-$$}"; HEN="\${HEN:-unknown}"
  PAYLOAD="{\\"session_id\\":\\"$SID\\",\\"machine_id\\":\\"$MACHINE_ID\\",\\"timestamp\\":$TIMESTAMP,\\"project_path\\":\\"$PROJECT_PATH\\",\\"hook_event_name\\":\\"$HEN\\"}"
fi

curl -sf -X POST "$API_URL/events" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $CLAUDEMON_API_KEY" \\
  -d "$PAYLOAD" \\
  --max-time 2 >/dev/null 2>&1 &

exit 0
`;

  writeFileSync(HOOK_PATH, script, { mode: 0o755 });
}

function patchSettings() {
  const claudeDir = join(homedir(), ".claude");
  if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });

  let settings: Record<string, unknown> = {};
  if (existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
    } catch {
      // corrupt file, start fresh
    }
  }

  const hookCmd = `bash ${HOOK_PATH}`;
  const hookEntry = { type: "command", command: hookCmd, async: true };
  const matcherEntry = { matcher: "", hooks: [hookEntry] };

  const hooks = (settings.hooks || {}) as Record<string, unknown[]>;
  for (const event of ["PreToolUse", "PostToolUse", "Notification", "Stop"]) {
    const existing = hooks[event] as Array<{ matcher: string; hooks: Array<{ command?: string }> }> || [];
    // Don't add if already present
    const hasClaudemon = existing.some((e) =>
      e.hooks?.some((h) => h.command?.includes("claudemon")),
    );
    if (!hasClaudemon) {
      existing.push(matcherEntry as never);
    }
    hooks[event] = existing;
  }
  settings.hooks = hooks;

  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
}
