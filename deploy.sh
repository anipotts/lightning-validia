#!/usr/bin/env bash
# ClaudeMon — Self-hosted deploy
set -euo pipefail

echo "ClaudeMon — Self-hosted Deploy"
echo ""

if ! command -v wrangler &>/dev/null; then
  echo "Error: wrangler CLI not found. Install with: npm i -g wrangler"
  exit 1
fi

echo "[1/3] Deploying API Worker (single-user mode, no auth)..."
pushd apps/monitor-api >/dev/null
DEPLOY_OUTPUT=$(wrangler deploy -c wrangler.self-hosted.toml 2>&1)
echo "$DEPLOY_OUTPUT"
# Extract URL from deploy output
API_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://[a-zA-Z0-9._-]+\.workers\.dev' | head -1)
if [ -z "$API_URL" ]; then
  echo "Could not detect worker URL. Enter it manually:"
  read -r API_URL
fi
popd >/dev/null

echo ""
echo "[2/3] Building frontend (API: $API_URL)..."
pushd apps/monitor >/dev/null
VITE_MONITOR_API_URL="$API_URL" VITE_MONITOR_WS_URL="$(echo "$API_URL" | sed 's/https/wss/')/ws" npm run build
popd >/dev/null

echo ""
echo "[3/3] Deploying frontend..."
pushd apps/monitor >/dev/null
wrangler pages deploy dist --project-name=claudemon-self-hosted
popd >/dev/null

echo ""
echo "Done! Your ClaudeMon instance is deployed."
echo ""
echo "Install the hook:"
echo "  curl -fsSL $API_URL/hook.sh -o ~/.claudemon-hook.sh && chmod +x ~/.claudemon-hook.sh"
