#!/usr/bin/env bash
# Read-only periodic Swarm lifecycle status snapshot.
#
# Lifecycle mutations are Card-authoritative and must originate from a caller
# carrying exact, source-qualified Card bindings. This unattended helper cannot
# safely own worker sessions, so it only records lifecycle status.
#
# Usage:
#   SWARM_BASE_URL=http://localhost:3002 ./swarm-lifecycle-sweep.sh
#   (default base URL is http://localhost:3002)

set -euo pipefail

BASE_URL="${SWARM_BASE_URL:-http://localhost:3002}"
LOG_DIR="${SWARM_LIFECYCLE_LOG_DIR:-${HOME}/.hermes/swarm/shared/lifecycle}"
LOG_FILE="${LOG_DIR}/auto-sweep.jsonl"
mkdir -p "$LOG_DIR"

response=$(curl -sS "$BASE_URL/api/swarm-lifecycle")

ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '{"at":"%s","readOnly":true,"response":%s}\n' "$ts" "$response" >> "$LOG_FILE"
printf '%s\n' "$response"
