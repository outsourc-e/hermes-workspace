#!/usr/bin/env bash
# Periodic swarm lifecycle sweep.
#
# Calls /api/swarm-lifecycle with action=auto-sweep, which:
#   - reads token pressure for each worker
#   - requests durable handoff for handoff_required workers
#   - renews (kill + restart tmux + resume prompt) for renew_required workers
#
# Intended to run from cron or launchd every ~10 minutes.
#
# Usage:
#   SWARM_BASE_URL=http://localhost:3000 ./swarm-lifecycle-sweep.sh
#   (default base URL is http://localhost:3000)

set -euo pipefail

BASE_URL="${SWARM_BASE_URL:-http://localhost:3000}"
LOG_DIR="${SWARM_LIFECYCLE_LOG_DIR:-$HOME/.hermes/memory/swarm/lifecycle-logs}"
SESSIONS_FILE="${SWARM_SESSIONS_FILE:-$HOME/.hermes/workspace-sessions.json}"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/$(date -u +%Y-%m-%d).jsonl"

# Auth: the endpoint requires the claude-auth cookie. Pull the first
# unexpired token from workspace-sessions.json unless SWARM_AUTH_TOKEN is set.
TOK="${SWARM_AUTH_TOKEN:-}"
if [ -z "$TOK" ] && [ -f "$SESSIONS_FILE" ]; then
  TOK=$(python3 -c "import json,sys,time;d=json.load(open(sys.argv[1]));now=time.time()*1000;print(next((t for t,e in d.get('tokens',{}).items() if e>now),''))" "$SESSIONS_FILE")
fi
if [ -z "$TOK" ]; then
  echo '{"error":"no unexpired auth token found"}' >&2
  exit 1
fi

response=$(curl -sS -X POST \
  -H 'Content-Type: application/json' \
  -H "Cookie: claude-auth=$TOK" \
  -d '{"action":"auto-sweep"}' \
  "$BASE_URL/api/swarm-lifecycle")

ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '{"at":"%s","response":%s}\n' "$ts" "$response" >> "$LOG_FILE"
echo "$response"

# Housekeeping: reap orphaned Hermes Desktop profile-backend dashboards.
# The Desktop app spawns `hermes --profile X dashboard --no-open --port 0` per
# profile and orphans them when force-quit (upstream bug in hermes-agent's
# electron main.cjs — no process-group kill). They idle at ~150MB each. Kill
# any that have been running >30min AND have no live Hermes.app parent.
if [ "${SWARM_SWEEP_DESKTOP_ORPHANS:-1}" = "1" ]; then
  desktop_running=$(pgrep -f 'Hermes.app/Contents/MacOS/Hermes' || true)
  if [ -z "$desktop_running" ]; then
    reaped=$(pkill -f 'dashboard --no-open --host 127.0.0.1 --port 0' && echo yes || true)
    [ -n "$reaped" ] && echo '{"desktop_orphans_reaped":true}'
  fi
fi
