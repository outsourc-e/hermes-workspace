#!/usr/bin/env bash
# run-day-catchup.sh — B4 day-time consumption rule (remediation-2026-11-04 §B4).
#
# Problem B4 closes: the nightly research runners adopt ONLY their own
# `night-run: $AGENT <today>` card — a night run that failed (proxy outage,
# model wedged, gate closed) leaves its card `ready`, the next night creates a
# fresh card, and the orphan is never consumed again. This is exactly how the
# 62-card ready backlog of Oct 24–Nov 5 accumulated (B2 note: below-breaker
# failures auto-recover to ready via the gateway's recompute_ready sweep).
#
# Rule: once a day in the day window, each research agent gets ONE catch-up
# run of its OLDEST stale ready night-run card, through the exact nightly
# chain (B1 gate fail-closed, lock, pre-flight, model, digest, Buzz post).
# Nothing to adopt → zero model spend. Night window is untouched.
#
# Usage: run-day-catchup.sh [agents...]   (default: the 3 research agents)
set -u
OPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$OPS_DIR/run/day-catchup.log"
AGENTS=("$@")
[ ${#AGENTS[@]} -eq 0 ] && AGENTS=(competitor-scout customer-watcher partner-radar)

echo "--- day-catchup $(date +%F_%T) ---" >> "$LOG"
rc_total=0
for A in "${AGENTS[@]}"; do
  echo "[$(date +%T)] catch-up $A" >> "$LOG"
  CATCHUP=1 bash "$OPS_DIR/bin/run-night-agent.sh" "$A" >> "$LOG" 2>&1
  rc=$?
  echo "[$(date +%T)] $A rc=$rc" >> "$LOG"
  # rc map (from run-night-agent.sh): 0 ok · 4 gate closed · 5 wrong window ·
  # 8 lock held · 9 timeout · 10 hermes failure · 11 digest missing · 64 usage
  # 4/5/8 are "skipped today" — not failures of the rule.
  case $rc in
    0|4|5|8) : ;;
    *) rc_total=$rc ;;
  esac
done
echo "[$(date +%T)] catch-up sweep done (last_fail_rc=$rc_total)" >> "$LOG"
[ "$rc_total" -eq 0 ] && echo "PASS day-catchup sweep" || echo "FAIL day-catchup sweep rc=$rc_total"
exit 0   # the launchd agent logs failures into day-catchup.log; keep rc 0
