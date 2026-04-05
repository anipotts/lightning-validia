#!/usr/bin/env bash
# Debug: log the raw hook JSON to a file so we can see what Claude Code sends
INPUT="$(cat)"
echo "--- $(date) --- HOOK_EVENT=${CLAUDE_HOOK_EVENT_NAME:-?} ---" >> /tmp/openproof-hook-debug.log
echo "$INPUT" | python3 -m json.tool >> /tmp/openproof-hook-debug.log 2>/dev/null || echo "$INPUT" >> /tmp/openproof-hook-debug.log
echo "" >> /tmp/openproof-hook-debug.log
# Pass through to the real hook
echo "$INPUT" | bash ~/.openproof-hook.sh
