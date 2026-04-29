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
#   SWARM_BASE_URL=http://localhost:3002 ./swarm-lifecycle-sweep.sh
#   (default base URL is http://localhost:3002)

set -euo pipefail

BASE_URL="${SWARM_BASE_URL:-http://localhost:3002}"
LOG_DIR="${SWARM_LIFECYCLE_LOG_DIR:-$HOME/.ocplatform/workspace/memory/swarm/lifecycle-logs}"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/$(date -u +%Y-%m-%d).jsonl"

response=$(curl -sS -X POST \
  -H 'Content-Type: application/json' \
  -d '{"action":"auto-sweep"}' \
  "$BASE_URL/api/swarm-lifecycle")

ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '{"at":"%s","response":%s}\n' "$ts" "$response" >> "$LOG_FILE"
echo "$response"
