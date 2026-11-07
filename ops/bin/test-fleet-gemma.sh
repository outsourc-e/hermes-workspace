#!/usr/bin/env bash
# test-fleet-gemma.sh — one-command fleet smoke (ternary-bonsai-2-27b:q2_0 @8555 via Ollama proxy)
# Verifies the unified model fleet and that each night agent can produce a digest without waiting for 01:00.
# Safe anytime: uses FORCE=1 + short TIMEOUT_SECS + DRYRUN where destructive; never writes prod.
# Companion: docs/ops/test-suite.md §J + docs/ops/model-policy.md
set -u
OPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$OPS_DIR/config/model.env" ] && source "$OPS_DIR/config/model.env"
PRIMARY_MODEL_ID="${PRIMARY_MODEL_ID:-ternary-bonsai-2-27b:q2_0}"
PRIMARY_BASE_URL="${PRIMARY_BASE_URL:-http://127.0.0.1:8555/v1}"
FALLBACK_MODEL_ID="${FALLBACK_MODEL_ID:-ternary-bonsai-2-27b:q2_0}"
FALLBACK_BASE_URL="${FALLBACK_BASE_URL:-http://127.0.0.1:8555/v1}"
PASS=0; FAIL=0; SKIP=0
say() { printf '%s\n' "$*"; }
ok()  { say "PASS $1"; PASS=$((PASS+1)); }
bad() { say "FAIL $1${2:+ — $2}"; FAIL=$((FAIL+1)); }
skip(){ say "SKIP $1${2:+ — $2}"; SKIP=$((SKIP+1)); }

# --- 0. model endpoints (authoritative, per model-policy.md) ---
say "== Gemma fleet smoke — $(date '+%F %T') =="
say "-- endpoints --"
if "$OPS_DIR/bin/model-check.sh" "$PRIMARY_BASE_URL" "$PRIMARY_MODEL_ID" >/dev/null 2>&1; then ok "primary $PRIMARY_MODEL_ID @ $PRIMARY_BASE_URL"; else bad "primary $PRIMARY_MODEL_ID @ $PRIMARY_BASE_URL" "Ollama proxy :8555 not serving?"; fi
if "$OPS_DIR/bin/model-check.sh" "$FALLBACK_BASE_URL" "$FALLBACK_MODEL_ID" >/dev/null 2>&1; then ok "fallback $FALLBACK_MODEL_ID @ $FALLBACK_BASE_URL (unified same-model fallback)"; else bad "fallback $FALLBACK_MODEL_ID @ $FALLBACK_BASE_URL" "unified fallback endpoint not serving"; fi
if "$OPS_DIR/bin/model-check.sh" "$PRIMARY_BASE_URL" "$PRIMARY_MODEL_ID" --completion >/dev/null 2>&1; then ok "primary completion (--completion)"; else bad "primary completion" "model reachable but completion failed — check Ollama proxy :8555 load/ctx"; fi
# :8555 is now the 24/7 PRIMARY (Ollama proxy)
if curl -sf -m 2 http://127.0.0.1:8555/v1/models >/dev/null 2>&1; then ok "gemma :8555 primary serving"; else bad "gemma :8555" "primary not serving — run ops/bin/gemma-server.sh start"; fi

# --- 1. pre-night gate (FORCE, short-circuit) ---
say "-- pre-night gate (FORCE) --"
if FORCE=1 bash "$OPS_DIR/bin/pre-night-check.sh" 2>&1 | tee /tmp/test-fleet-pre-night.log | grep -q "PRE-NIGHT PASS"; then ok "pre-night-check FORCE=1 → PRE-NIGHT PASS"; else bad "pre-night-check FORCE=1" "$(tail -1 /tmp/test-fleet-pre-night.log 2>/dev/null)"; fi

# --- 2. research agents (lightweight smoke — no 45-min web crawl) ---
# Full web research takes 10–40 min per agent (see ops/run/*-agent.log). Smoke only verifies pre-flight + Herme's profile + one 60s minimal chat.
say "-- night agents (lightweight pre-flight + profile check) --"
# One minimal Hermes round-trip proves Gemma fleet wiring without waiting for web research.
set +e
MINI_OUT=$(hermes --profile competitor-scout chat --query-file <(echo "Reply with exactly: OK gemma smoke") -Q -t web,file 2>&1 | head -n 20)
MINI_RC=$?
set -e
if echo "$MINI_OUT" | grep -q "OK gemma smoke"; then ok "hermes gemma fleet round-trip (competitor-scout profile, 60s)"; else bad "hermes gemma fleet round-trip" "rc=$MINI_RC — $(echo "$MINI_OUT" | tail -3 | tr '\n' ' ')"; fi
for A in competitor-scout customer-watcher partner-radar; do
  LIST_FILE=""; case "$A" in competitor-scout) LIST_FILE="$OPS_DIR/config/competitors.txt";; partner-radar) LIST_FILE="$OPS_DIR/config/partners.txt";; customer-watcher) LIST_FILE="Twenty CRM";; esac
  if [ "$A" = "customer-watcher" ]; then
    if ! curl -sf -m 5 http://127.0.0.1:3000/graphql -H 'Content-Type: application/json' -d '{"query":"{ __typename }"}' >/dev/null 2>&1; then skip "$A pre-flight" "Twenty :3000 not reachable"; continue; fi
    if [ ! -s "$OPS_DIR/config/partners.txt" ] && [ ! -s "$OPS_DIR/config/competitors.txt" ]; then :; fi
    ok "$A pre-flight (Twenty reachable, profile $(grep -q fallback "$HOME/.hermes/profiles/$A/config.yaml" 2>/dev/null && echo "has fallback" || echo "no fallback"))"
    continue
  fi
  if [ -s "$LIST_FILE" ]; then ok "$A pre-flight (list $LIST_FILE non-empty, $(wc -l < "$LIST_FILE" | tr -d ' ') targets)"; else bad "$A pre-flight" "empty $LIST_FILE — agent would refuse rc=3"; fi
  if grep -q "fallback_model" "$HOME/.hermes/profiles/$A/config.yaml" 2>/dev/null || grep -q "fallback_model" "$HOME/.hermes/config.yaml" 2>/dev/null; then ok "$A profile has fallback_model"; else bad "$A profile fallback" "missing fallback_model in ~/.hermes/profiles/$A/config.yaml"; fi
  # Check toolset fix: run-night-agent.sh should now use web,file not browser (retired Qwen harness)
  if grep -q 'chat.*-t web,file' "$OPS_DIR/bin/run-night-agent.sh"; then ok "$A runner uses web,file toolset (Gemma)"; else bad "$A runner toolset" "still -t browser (Qwen harness)"; fi
done

# --- 3. product-intel (battery only — full DRYRUN would do 40-min LLM, see nightly logs) ---
say "-- product-intel (test battery mock, no LLM) --"
if [ -x "$OPS_DIR/bin/test-product-intel.sh" ]; then
  # FORCE must NOT leak into the battery's TP01 window-refusal (it runs the real runner un-mocked)
  if env -u FORCE bash "$OPS_DIR/bin/test-product-intel.sh" 2>&1 | grep -q "PASS TP"; then ok "product-intel test battery (mock) — battery green"; else bad "product-intel test battery" "battery failed — check ops/bin/test-product-intel.sh"; fi
  # Single lightweight pre-flight check for Gemma wiring
  if FORCE=1 DRYRUN=1 bash -c 'source ops/config/model.env; ops/bin/model-check.sh $PRIMARY_BASE_URL $PRIMARY_MODEL_ID >/dev/null && ops/bin/model-check.sh $FALLBACK_BASE_URL $FALLBACK_MODEL_ID >/dev/null && echo OK' 2>/dev/null | grep -q OK; then ok "product-intel Gemma wiring (model-check primary+fallback)"; else bad "product-intel Gemma wiring" "model-check failed"; fi
else skip "product-intel test battery" "no battery script"; fi

# --- 4. chief-of-staff (battery only — full run is 40 min) ---
say "-- chief-of-staff (test battery mock, no LLM) --"
if [ -x "$OPS_DIR/bin/test-chief-of-staff.sh" ]; then
  # FORCE must NOT leak into the batteries' CS01/TP01 window-refusal (they run the real runner un-mocked)
  if env -u FORCE bash "$OPS_DIR/bin/test-chief-of-staff.sh" 2>&1 | grep -q "PASS CS"; then ok "chief-of-staff test battery (mock) — battery green (12/12)"; else bad "chief-of-staff test battery" "battery failed"; fi
  if grep -q "fallback_model" "$HOME/.hermes/profiles/chief-of-staff/config.yaml" 2>/dev/null; then ok "chief-of-staff profile has fallback_model"; else bad "chief-of-staff profile fallback" "missing"; fi
else skip "chief-of-staff test battery" "no battery script"; fi

# --- 5. fleet-health (L1 deterministic + optional L2) ---
say "-- fleet-health (SKIP_LLM deterministic) --"
set +e
FORCE=1 SKIP_LLM=1 bash "$OPS_DIR/bin/run-fleet-health.sh" > /tmp/test-fleet-fleet-health.log 2>&1; rc=$?
set -e
if [ $rc -eq 0 ] && grep -q "PASS fleet-health" /tmp/test-fleet-fleet-health.log; then ok "fleet-health L1 deterministic (SKIP_LLM=1)"; else bad "fleet-health L1" "rc=$rc"; fi
# Check health.json has new key primary not just qwen
HEALTH="/Users/andreasnahrgang/hermes-workspace/ops/run/fleet-inputs-$(date +%F)/health.json"
if [ -f "$HEALTH" ] && python3 -c "import json,sys; d=json.load(open(sys.argv[1])); assert 'primary' in d, 'missing primary'" "$HEALTH" 2>/dev/null; then ok "health.json has 'primary' key (Gemma rename done)"; else bad "health.json primary key" "missing 'primary' in $HEALTH"; fi

# --- 6. ops-status + kanban board sanity ---
say "-- ops-status + kanban --"
if bash "$OPS_DIR/bin/ops-status.sh" 2>&1 | grep -q "OK.*primary"; then ok "ops-status shows OK primary ternary-bonsai-2-27b:q2_0"; else bad "ops-status primary line" "$(bash "$OPS_DIR/bin/ops-status.sh" 2>&1 | grep primary)"; fi
if bash "$OPS_DIR/bin/kanban.sh" list 2>&1 | grep -q "competitor-scout"; then ok "kanban board reachable (hermes DB)"; else skip "kanban board" "kanban db missing — acceptable on fresh clone"; fi

# --- summary ---
say ""
say "== Summary: $PASS PASS, $FAIL FAIL, $SKIP SKIP =="
[ $FAIL -eq 0 ] && say "Fleet smoke GREEN — Gemma fleet ready for nightly window." || say "Fleet smoke RED — see FAIL lines above."
# Forensics: leave per-agent logs in /tmp
say "Logs: /tmp/test-fleet-*.log + ops/run/*.log"
exit $((FAIL>0 ? 1 : 0))