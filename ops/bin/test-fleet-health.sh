#!/usr/bin/env bash
# test-fleet-health.sh — automated battery for run-fleet-health.sh (L1/L2).
# Hermetic outputs via STATE_DIR/RESEARCH_DIR/HERMES_KANBAN_DB; live service
# probes are read-only. L2 LLM is mocked (mock-hermes-fleet.sh).
# Mirrors test-product-intel.sh style (FH01–FH07, PASS/FAIL, [-v]).
#
# Usage: ops/bin/test-fleet-health.sh [-v]
set -u
WS_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RUNNER="$WS_DIR/ops/bin/run-fleet-health.sh"
MOCK="$WS_DIR/ops/tests/fixtures/mock-hermes-fleet.sh"
VERBOSE="${1:-}"
PASS=0; FAIL=0; CURRENT=""
say() { [ "$VERBOSE" = "-v" ] && echo "    $*"; }
t_start() { CURRENT="$1"; say ""; say "▶ $1"; }
t_pass() { PASS=$((PASS+1)); echo "PASS $CURRENT"; }
t_fail() { FAIL=$((FAIL+1)); echo "FAIL $CURRENT — $*"; }

FIX="$(mktemp -d /tmp/fleet-health-test.XXXXXX)"
trap 'rm -rf "$FIX"' EXIT
chmod +x "$MOCK"

run_fh() { # run_fh <tag> [KEY=val...]
  local tag="$1"; shift
  mkdir -p "$FIX/state-$tag" "$FIX/research-$tag"
  env FORCE=1 STATE_DIR="$FIX/state-$tag" RESEARCH_DIR="$FIX/research-$tag" \
      HERMES_KANBAN_DB="$FIX/board-$tag.db" HERMES_BIN="$MOCK" \
      TIMEOUT_SECS="${FH_T:-30}" DRYRUN=1 "$@" "$RUNNER" 2>&1
}

# ── FH01 window refusal rc=5 (SKIP inside 05–08) ──
t_start "FH01 night-window refusal without FORCE"
h=$(date +%H)
if [ "$h" -ge 5 ] && [ "$h" -le 8 ]; then
  echo "SKIP $CURRENT (inside window 05–08)"
else
  out=$(env -u FORCE "$RUNNER" 2>&1); rc=$?
  [ $rc -eq 5 ] && t_pass || t_fail "rc=$rc out=$out"
fi

# ── FH02 lock refusal rc=8 ──
t_start "FH02 lock mutual exclusion"
mkdir -p "$FIX/state-fh02"; touch "$FIX/state-fh02/fleet-health-monitor.lock"
out=$(FORCE=1 STATE_DIR="$FIX/state-fh02" HERMES_BIN="$MOCK" "$RUNNER" 2>&1); rc=$?
[ $rc -eq 8 ] && t_pass || t_fail "rc=$rc out=$out"

# ── FH03 SKIP_LLM=1 writes L1 matrix + health.json ──
t_start "FH03 SKIP_LLM L1 matrix + health.json structure"
out=$(SKIP_LLM=1 run_fh fh03 2>&1); rc=$?
HJ="$FIX/state-fh03/fleet-inputs-$(date +%F)/health.json"
L1=$(ls "$FIX/research-fh03/"*-fleet-health.md 2>/dev/null | head -1)
if [ $rc -eq 0 ] && [ -f "$HJ" ] && [ -n "$L1" ] \
   && python3 -c "import json,sys; d=json.load(open('$HJ')); assert set(['gateway','dashboard','twenty','buzz','ollama','tailnet','primary','fallback']).issubset(d.keys())" 2>/dev/null \
   && grep -q "^# Fleet Health" "$L1" && grep -q "## Health matrix" "$L1"; then
  t_pass
else t_fail "rc=$rc hj=$HJ l1=${L1:-none}"; fi

# ── FH04 tailnet SKIP by default (local-only) ──
t_start "FH04 tailnet is SKIP without TAILNET_OPTIONAL"
HJ="$FIX/state-fh03/fleet-inputs-$(date +%F)/health.json"
if [ -f "$HJ" ] && python3 -c "import json,sys; sys.exit(0 if json.load(open('$HJ')).get('tailnet')=='SKIP' else 1)" 2>/dev/null; then
  t_pass
else t_fail "tailnet=$(python3 -c "import json; print(json.load(open('$HJ')).get('tailnet'))" 2>/dev/null)"; fi

# ── FH05 TAILNET_OPTIONAL=1 probes tailnet (PASS/FAIL, never SKIP) ──
t_start "FH05 TAILNET_OPTIONAL=1 yields PASS or FAIL, not SKIP"
out=$(SKIP_LLM=1 TAILNET_OPTIONAL=1 run_fh fh05 2>&1); rc=$?
HJ="$FIX/state-fh05/fleet-inputs-$(date +%F)/health.json"
if [ $rc -eq 0 ] && python3 -c "import json,sys; sys.exit(0 if json.load(open('$HJ')).get('tailnet') in ('PASS','FAIL') else 1)" 2>/dev/null; then
  t_pass
else t_fail "rc=$rc tailnet field unexpected"; fi

# ── FH06 L2 degrade keeps L1 + degraded note ──
t_start "FH06 L2 garbage output degrades to L1"
out=$(MOCK_BAD=1 run_fh fh06 2>&1); rc=$?
L1=$(ls "$FIX/research-fh06/"*-fleet-health.md 2>/dev/null | head -1)
if [ $rc -eq 0 ] && [ -n "$L1" ] && grep -q "LLM synthesis timed out / unavailable" "$L1"; then
  t_pass
else t_fail "rc=$rc degraded-note-missing"; fi

# ── FH07 L2 valid output replaces L1 ──
t_start "FH07 L2 valid synthesis accepted"
out=$(run_fh fh07 2>&1); rc=$?
L1=$(ls "$FIX/research-fh07/"*-fleet-health.md 2>/dev/null | head -1)
if [ $rc -eq 0 ] && [ -n "$L1" ] && grep -q "mock L2 synthesis for testing" "$L1"; then
  t_pass
else t_fail "rc=$rc mock-marker-missing"; fi

echo
echo "== fleet-health battery: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
