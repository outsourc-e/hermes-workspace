#!/usr/bin/env bash
# Nightly self-improvement loop.
#
# Gathers hard evidence about repo/swarm health (typecheck error count, test
# summary, health-endpoint warnings, worker scoreboard failures), then
# dispatches a mission to the maintainer worker to propose and stage fixes.
# The maintainer must NOT push or merge — its work lands as mission
# checkpoints awaiting operator greenlight, and the morning concierge/Discord
# digest (08:00/08:05) surfaces it for review.
#
# Installed by swarm-install-schedules.sh as com.hermes.swarm.self-improve
# (01:00 nightly). Safe to run by hand.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${SWARM_BASE_URL:-http://localhost:3000}"
DISPATCH="$REPO_DIR/scripts/swarm-scheduled-mission.sh"

# ---- Evidence gathering (each best-effort, bounded) -------------------------

TSC_ERRORS="unknown"
if [ -x "$REPO_DIR/node_modules/.bin/tsc" ]; then
  TSC_ERRORS=$(cd "$REPO_DIR" && ./node_modules/.bin/tsc --noEmit 2>&1 | grep -c "error TS" || true)
fi

TEST_SUMMARY="unknown"
if [ -x "$REPO_DIR/node_modules/.bin/vitest" ]; then
  TEST_SUMMARY=$(cd "$REPO_DIR" && ./node_modules/.bin/vitest run 2>&1 | grep -E "Test Files|Tests " | tr '\n' ' ' || true)
fi

HEALTH_WARNINGS="[]"
SCOREBOARD=""
TOK="${SWARM_AUTH_TOKEN:-}"
SESSIONS_FILE="${SWARM_SESSIONS_FILE:-$HOME/.hermes/workspace-sessions.json}"
if [ -z "$TOK" ] && [ -f "$SESSIONS_FILE" ]; then
  TOK=$(python3 -c "import json,sys,time;d=json.load(open(sys.argv[1]));now=time.time()*1000;print(next((t for t,e in d.get('tokens',{}).items() if e>now),''))" "$SESSIONS_FILE")
fi
if [ -n "$TOK" ]; then
  HEALTH_WARNINGS=$(curl -sS -m 20 -H "Cookie: claude-auth=$TOK" "$BASE_URL/api/swarm-health" \
    | python3 -c "import json,sys;d=json.load(sys.stdin);print(json.dumps(d.get('summary',{}).get('warnings',[])[:10]))" 2>/dev/null || echo "[]")
  SCOREBOARD=$(curl -sS -m 20 -H "Cookie: claude-auth=$TOK" "$BASE_URL/api/swarm-scoreboard" \
    | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[w for w in d.get('workers',[]) if w.get('attempts',0)>=3 and w.get('successRate',1)<0.6]
print('; '.join(f\"{w['workerId']}: {round(w['successRate']*100)}% ok over {w['attempts']} tasks (last block: {w.get('lastBlockReason') or 'n/a'})\" for w in rows[:8]))
" 2>/dev/null || echo "")
fi

# Pre-create the isolated worktree so the maintainer never has a reason to
# run git branch commands in the live repo. Idempotent per night.
WT_DIR="$HOME/workspace/nightly-fixes/$(date +%Y%m%d)"
WT_BRANCH="nightly/self-improve-$(date +%Y%m%d)"
if [ ! -d "$WT_DIR" ]; then
  git -C "$REPO_DIR" worktree add "$WT_DIR" -b "$WT_BRANCH" 2>/dev/null \
    || git -C "$REPO_DIR" worktree add "$WT_DIR" "$WT_BRANCH" 2>/dev/null \
    || true
fi

TASK="Nightly self-improvement pass on the hermes-workspace repo at $REPO_DIR.

Tonight's evidence:
- TypeScript errors (tsc --noEmit): $TSC_ERRORS (long-standing baseline is ~95 from a dirty tree; only investigate if higher)
- Test suite: $TEST_SUMMARY
- Swarm health warnings: $HEALTH_WARNINGS
- Underperforming workers (scoreboard): ${SCOREBOARD:-none}

Do the following, in order:
1. If tests fail or tsc rose above baseline, diagnose the top failure and prepare a minimal fix inside the ALREADY-CREATED worktree at $WT_DIR (branch $WT_BRANCH). Do ALL file edits, git adds and commits inside $WT_DIR only. You are FORBIDDEN from running any git command that changes state in $REPO_DIR itself (no checkout, switch, reset, branch, rebase there — read-only git like log/diff is fine). Do NOT push, do NOT merge.
2. Otherwise pick ONE small, concrete improvement grounded in the evidence above (a health warning, a recurring block reason, flaky area). Prepare the fix the same way.
3. Run the relevant tests to prove the fix.
4. Checkpoint with STATE: DONE, exact FILES_CHANGED, COMMANDS_RUN, and in NEXT_ACTION say exactly what the operator should review and greenlight.
Keep the diff small and reviewable. Never touch credentials, launchd plists, or push to any remote."

exec /bin/bash "$DISPATCH" maintainer "$TASK"
