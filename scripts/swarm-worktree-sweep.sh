#!/usr/bin/env bash
# Periodic worktree cleanup sweep.
#
# Calls POST /api/swarm-worktrees with remove=true to clean up expired worktrees.
# By default runs in dry-run mode. Set SWEEP_REMOVE=true to actually remove.
#
# Usage:
#   SWEEP_REMOVE=true ./swarm-worktree-sweep.sh
#   SWARM_BASE_URL=http://localhost:3000 ./swarm-worktree-sweep.sh
#
# Environment:
#   SWARM_BASE_URL      Workspace base URL (default: http://localhost:3000)
#   SWEEP_REMOVE        Set to "true" to actually remove worktrees (default: dry-run)
#   SWEEP_MAX_AGE_HOURS Max age in hours for legacy fallback (default: 168 = 7 days)
#   SWEEP_LEASE_HOURS   Lease expiry in hours (default: 0 = disabled)
#   SWEEP_LOG_DIR       Log directory (default: ~/.hermes/workspace-attempts/logs)
#   SWEEP_AUTH_COOKIE   Auth cookie value for non-local deployments (default: none)

set -euo pipefail

BASE_URL="${SWARM_BASE_URL:-http://localhost:3000}"
REMOVE="${SWEEP_REMOVE:-false}"
MAX_AGE_HOURS="${SWEEP_MAX_AGE_HOURS:-168}"
LEASE_HOURS="${SWEEP_LEASE_HOURS:-0}"

LOG_DIR="${SWEEP_LOG_DIR:-$HOME/.hermes/workspace-attempts/logs}"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/sweep-$(date -u +%Y-%m-%d).jsonl"

# Build request body
BODY=$(cat <<EOF
{
  "remove": ${REMOVE},
  "maxAgeHours": ${MAX_AGE_HOURS},
  "leaseExpiryHours": ${LEASE_HOURS}
}
EOF
)

# Build curl auth args
CURL_AUTH_ARGS=()
if [[ -n "${SWEEP_AUTH_COOKIE:-}" ]]; then
  CURL_AUTH_ARGS+=(-H "Cookie: claude-auth=${SWEEP_AUTH_COOKIE}")
fi

response=$(curl -sS -X POST \
  -H 'Content-Type: application/json' \
  "${CURL_AUTH_ARGS[@]}" \
  -d "$BODY" \
  "$BASE_URL/api/swarm-worktrees" 2>&1) || {
    ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    printf '{"at":"%s","ok":false,"error":"curl failed: %s"}\n' "$ts" "$response" >> "$LOG_FILE"
    echo "$response"
    exit 1
  }

ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '{"at":"%s","response":%s}\n' "$ts" "$response" >> "$LOG_FILE"
echo "$response"
