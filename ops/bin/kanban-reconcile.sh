#!/usr/bin/env bash
# kanban-reconcile.sh — auto-block stale `running` cards left by crashes/timeouts.
# Runs at 06:40 daily and on-demand before fleet-health digest.
# Grace period 45 min = 40 min watchdog (now 45 min) + 5 min grace for slow-model overrun.
set -u
OPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB="${HERMES_KANBAN_DB:-${HERMES_HOME:-$HOME/.hermes}/kanban.db}"
KB="$OPS_DIR/bin/kanban.sh"
cutoff=$(python3 -c "import time; print(int(time.time())-2700)")
# Find running cards older than cutoff
stale=$(sqlite3 "$DB" "select id from tasks where status='running' and coalesce(started_at,created_at) < $cutoff;" 2>/dev/null | tr -d ' \n' | tr ',' ' ')
if [ -z "$stale" ]; then
  # alternative: parse line output
  stale=$(sqlite3 -json "$DB" "select id from tasks where status='running' and coalesce(started_at,created_at) < $cutoff;" 2>/dev/null \
    | python3 -c "import json,sys; rows=json.load(sys.stdin) if sys.stdin.read().strip() else []; print(' '.join(r['id'] for r in rows))" 2>/dev/null || true)
fi
# Fallback via kanban.sh list
if [ -z "$stale" ]; then
  stale=""
fi
# Use json query properly
ids=$(sqlite3 "$DB" "select id from tasks where status='running' and coalesce(started_at,created_at) < $cutoff;" 2>/dev/null)
if [ -z "$ids" ]; then
  echo "kanban-reconcile: no stale running cards"
  exit 0
fi
count=0
for id in $ids; do
  if [ -x "$KB" ]; then
    "$KB" fail "$id" "auto-reconciled: still running after 45 min (slow-model timeout or crash)" >/dev/null 2>&1 && echo "  reconciled $id → blocked" && count=$((count+1))
  fi
done
echo "kanban-reconcile: $count card(s) reconciled"
