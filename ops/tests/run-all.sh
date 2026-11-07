#!/usr/bin/env bash
# run-all.sh — run every ops battery in one command (see `pnpm test:ops`).
# Suites: product-intel (TP), chief-of-staff (CS), buzz-kanban (TB/TK/TS/TN),
# slack mirror (S), fleet gemma smoke, night-services regression (20 checks).
# Mock-based suites are anytime-safe; fleet + night-services probe live
# services (read-only) and need Docker + gateway + models up.
# Usage: bash ops/tests/run-all.sh [-v]   Exit: 0 all green, 1 any suite failed.
set -u
OPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERBOSE="${1:-}"
SUITES=(
  "bin/test-product-intel.sh"
  "bin/test-chief-of-staff.sh"
  "bin/test-buzz-kanban.sh"
  "bin/test-slack-hermes.sh"
  "bin/test-scout-radar.sh"
  "bin/test-fleet-health.sh"
  "bin/test-ops-schedules.sh"
  "bin/test-fleet-gemma.sh"
  "tests/test-night-services.sh"
  "tests/test-cron-gate.sh"
)
pass=0; fail=0; failed_suites=()
for s in "${SUITES[@]}"; do
  echo "=== $s ==="
  if bash "$OPS_DIR/$s" $VERBOSE >/tmp/ops-suite-out.txt 2>&1; then
    echo "SUITE PASS $s"
    pass=$((pass+1))
  else
    echo "SUITE FAIL $s"
    tail -n 15 /tmp/ops-suite-out.txt
    fail=$((fail+1)); failed_suites+=("$s")
  fi
done
echo "---"
echo "SUITES PASS=$pass FAIL=$fail"
[ ${#failed_suites[@]} -gt 0 ] && echo "FAILED: ${failed_suites[*]}"
[ "$fail" -eq 0 ]
