#!/usr/bin/env bash
# Dispatch a recurring mission to a swarm worker. Driven by launchd timers so
# the new agents (security-auditor, quant-agent, concierge) do real recurring
# work instead of sitting idle.
#
# Usage: swarm-scheduled-mission.sh <workerId> "<task text>"
#   env: SWARM_BASE_URL (default http://localhost:3000)
#        SWARM_SESSIONS_FILE (default ~/.hermes/workspace-sessions.json)
#        SWARM_AUTH_TOKEN (overrides cookie lookup)
set -euo pipefail

# Honor post-Clear-All dispatch pause (operator wiped the board on purpose).
PAUSE_FILE="$(cd "$(dirname "$0")/.." && pwd)/.runtime/dispatch-pause-until"
if [ -f "$PAUSE_FILE" ]; then
  PAUSE_UNTIL=$(cat "$PAUSE_FILE" 2>/dev/null || echo 0)
  NOW_MS=$(($(date +%s) * 1000))
  if [ "$NOW_MS" -lt "${PAUSE_UNTIL:-0}" ] 2>/dev/null; then
    echo "dispatch paused until $PAUSE_UNTIL (Clear All cooldown) — skipping"
    exit 0
  fi
fi


WORKER="${1:?worker id required}"
TASK="${2:?task text required}"
BASE_URL="${SWARM_BASE_URL:-http://localhost:3000}"
SESSIONS_FILE="${SWARM_SESSIONS_FILE:-$HOME/.hermes/workspace-sessions.json}"
LOG_DIR="${SWARM_SCHEDULED_LOG_DIR:-$HOME/.hermes/logs}"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/swarm-scheduled-$(date -u +%Y-%m-%d).jsonl"

TOK="${SWARM_AUTH_TOKEN:-}"
if [ -z "$TOK" ] && [ -f "$SESSIONS_FILE" ]; then
  TOK=$(python3 -c "import json,sys,time;d=json.load(open(sys.argv[1]));now=time.time()*1000;print(next((t for t,e in d.get('tokens',{}).items() if e>now),''))" "$SESSIONS_FILE")
fi
[ -n "$TOK" ] || { echo '{"error":"no unexpired auth token"}' >&2; exit 1; }

payload=$(python3 -c "import json,sys;print(json.dumps({'assignments':[{'workerId':sys.argv[1],'task':sys.argv[2]}],'waitForCheckpoint':False,'timeoutSeconds':480}))" "$WORKER" "$TASK")

response=$(curl -sS -m 540 -X POST \
  -H 'Content-Type: application/json' \
  -H "Cookie: claude-auth=$TOK" \
  -d "$payload" \
  "$BASE_URL/api/swarm-dispatch")

ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '{"at":"%s","worker":"%s","response":%s}\n' "$ts" "$WORKER" "$response" >> "$LOG_FILE"
echo "$response"
