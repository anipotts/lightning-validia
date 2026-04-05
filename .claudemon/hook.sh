#!/usr/bin/env bash
# ClaudeMon Hook — auto-detects local vs cloud, chooses transport
set -euo pipefail

API_URL="${CLAUDEMON_API_URL:-https://api.claudemon.com}"
API_KEY="${CLAUDEMON_API_KEY:-}"
INPUT="$(cat)"
MACHINE_ID="$(hostname -s | tr '[:upper:]' '[:lower:]')"
TIMESTAMP="$(date +%s)000"

# Detect git context
BRANCH=""; PROJECT_PATH="$PWD"
if git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  BRANCH="$(git branch --show-current 2>/dev/null || true)"
  PROJECT_PATH="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
fi

# Build payload
if command -v jq &>/dev/null; then
  PAYLOAD="$(echo "$INPUT" | jq -c \
    --arg mid "$MACHINE_ID" \
    --argjson ts "$TIMESTAMP" \
    --arg pp "$PROJECT_PATH" \
    --arg br "$BRANCH" \
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
  # Safe fallback: extract only simple string fields, properly escape for JSON
  _esc() { printf '%s' "$1" | sed 's/\\/\\\\/g;s/"/\\"/g;s/	/\\t/g'; }
  SID="$(echo "$INPUT" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
  HEN="$(echo "$INPUT" | grep -o '"hook_event_name":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
  TN="$(echo "$INPUT" | grep -o '"tool_name":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
  TUID="$(echo "$INPUT" | grep -o '"tool_use_id":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
  SID="${SID:-unknown-$$}"; HEN="${HEN:-unknown}"
  PAYLOAD="{\"session_id\":\"$(_esc "$SID")\",\"machine_id\":\"$(_esc "$MACHINE_ID")\",\"timestamp\":$TIMESTAMP,\"project_path\":\"$(_esc "$PROJECT_PATH")\",\"hook_event_name\":\"$(_esc "$HEN")\""
  [ -n "$BRANCH" ] && PAYLOAD="$PAYLOAD,\"branch\":\"$(_esc "$BRANCH")\""
  [ -n "$TN" ] && PAYLOAD="$PAYLOAD,\"tool_name\":\"$(_esc "$TN")\""
  [ -n "$TUID" ] && PAYLOAD="$PAYLOAD,\"tool_use_id\":\"$(_esc "$TUID")\""
  PAYLOAD="$PAYLOAD}"
fi

# Build curl args safely (no eval)
CURL_ARGS=(-sf -X POST "$API_URL/events" -H "Content-Type: application/json")
[ -n "$API_KEY" ] && CURL_ARGS+=(-H "Authorization: Bearer $API_KEY")
CURL_ARGS+=(-d "$PAYLOAD" --max-time 2)

# Detect environment and choose transport
if [ -n "${CLAUDE_CODE_REMOTE_SESSION_ID:-}" ]; then
  # Cloud mode: relay via GitHub repository_dispatch
  REPO="${CLAUDEMON_GITHUB_REPO:-anipotts/lightning-validia}"
  GH_TOKEN="${GITHUB_TOKEN:-}"
  if [ -n "$GH_TOKEN" ]; then
    curl -sf -X POST "https://api.github.com/repos/$REPO/dispatches" \
      -H "Authorization: Bearer $GH_TOKEN" \
      -H "Accept: application/vnd.github+json" \
      -d "{\"event_type\":\"claudemon_event\",\"client_payload\":{\"data\":$PAYLOAD}}" \
      --max-time 3 >/dev/null 2>&1 &
  fi
else
  # Local mode: direct POST
  curl "${CURL_ARGS[@]}" >/dev/null 2>&1 &
fi

exit 0
