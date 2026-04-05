#!/usr/bin/env bash
# ClaudeMon Hook — forwards Claude Code hook events to the monitor API
#
# This script receives the full hook JSON on stdin, enriches it with
# machine_id, timestamp, and project_path, then POSTs it to the monitor API.
#
# Environment variables:
#   CLAUDEMON_API_URL — API endpoint (default: https://api.claudemon.com)
#   CLAUDE_SESSION_ID     — Set automatically by Claude Code
#   CLAUDE_HOOK_EVENT_NAME — Set automatically by Claude Code

set -euo pipefail

API_URL="${CLAUDEMON_API_URL:-https://api.claudemon.com}"
MACHINE_ID="$(hostname -s | tr '[:upper:]' '[:lower:]')"
TIMESTAMP="$(date +%s)000"
PROJECT_PATH="${PWD}"
SESSION_ID="${CLAUDE_SESSION_ID:-unknown-$$}"
HOOK_EVENT="${CLAUDE_HOOK_EVENT_NAME:-unknown}"

# Read the full hook JSON from stdin
INPUT="$(cat)"

# Detect git branch if available
BRANCH=""
if git rev-parse --show-current 2>/dev/null; then
  BRANCH="$(git branch --show-current 2>/dev/null || true)"
fi

# Use jq if available for proper JSON merge, otherwise construct manually
if command -v jq &>/dev/null; then
  PAYLOAD="$(echo "$INPUT" | jq -c \
    --arg sid "$SESSION_ID" \
    --arg mid "$MACHINE_ID" \
    --arg ts "$TIMESTAMP" \
    --arg pp "$PROJECT_PATH" \
    --arg hen "$HOOK_EVENT" \
    --arg br "$BRANCH" \
    '. + {
      session_id: $sid,
      machine_id: $mid,
      timestamp: ($ts | tonumber),
      project_path: $pp,
      hook_event_name: $hen,
      branch: $br
    }'
  )"
else
  # Fallback: extract tool_name and tool_input from stdin JSON with grep
  TOOL_NAME="$(echo "$INPUT" | grep -o '"tool_name":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
  FILE_PATH="$(echo "$INPUT" | grep -o '"file_path":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
  COMMAND="$(echo "$INPUT" | grep -o '"command":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"

  PAYLOAD="{\"session_id\":\"$SESSION_ID\",\"machine_id\":\"$MACHINE_ID\",\"timestamp\":$TIMESTAMP,\"project_path\":\"$PROJECT_PATH\",\"hook_event_name\":\"$HOOK_EVENT\""

  [ -n "$TOOL_NAME" ] && PAYLOAD="$PAYLOAD,\"tool_name\":\"$TOOL_NAME\""
  [ -n "$FILE_PATH" ] && PAYLOAD="$PAYLOAD,\"tool_input\":{\"file_path\":\"$FILE_PATH\"}"
  [ -n "$COMMAND" ] && PAYLOAD="$PAYLOAD,\"tool_input\":{\"command\":\"$COMMAND\"}"
  [ -n "$BRANCH" ] && PAYLOAD="$PAYLOAD,\"branch\":\"$BRANCH\""

  PAYLOAD="$PAYLOAD}"
fi

# Fire-and-forget POST to monitor API
curl -sf -X POST "$API_URL/events" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  --max-time 2 \
  >/dev/null 2>&1 &

# Never block Claude Code
exit 0
