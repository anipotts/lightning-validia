import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API_URL = "https://api.claudemon.com";
const HOOK_PATH = join(homedir(), ".claudemon-hook.sh");
const SETTINGS_PATH = join(homedir(), ".claude", "settings.json");

export async function init() {
  console.log("\n  ClaudeMon — Setup\n");

  // Step 1: Download hook script from API
  console.log("  [1/3] Downloading hook script...");
  const res = await fetch(`${API_URL}/hook.sh`);
  if (!res.ok) {
    console.log(`  Failed to download hook script (HTTP ${res.status}).\n`);
    return;
  }
  const scriptContent = await res.text();
  writeHook(scriptContent);
  console.log(`  Written to ${HOOK_PATH}\n`);

  // Step 2: Print API key instructions
  console.log("  [2/3] API key setup:");
  console.log("    1. Sign in at https://app.claudemon.com");
  console.log("    2. Create an API key from the dashboard");
  console.log("    3. Add to your shell profile (~/.zshrc or ~/.bashrc):\n");
  console.log('       export CLAUDEMON_API_KEY="<your-key>"\n');

  // Step 3: Patch Claude Code settings
  console.log("  [3/3] Configuring Claude Code...");
  patchSettings();
  console.log(`  Updated ${SETTINGS_PATH}\n`);

  console.log("  Done! ClaudeMon will be active once CLAUDEMON_API_KEY is set.");
  console.log("  Dashboard: https://app.claudemon.com\n");
}

function writeHook(script: string) {
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
