#!/usr/bin/env bash
# test-scout-radar.sh — automated battery for run-night-agent.sh
# (competitor-scout / customer-watcher / partner-radar).
# Hermetic: runs a COPY of the ops tree in mktemp (no prod logs/research/board
# touched); mock hermes double; live Twenty only for SR11 (SKIP when :3000 down).
# Mirrors test-product-intel.sh style (SR01–SR12, PASS/FAIL, [-v]).
#
# Usage: ops/bin/test-scout-radar.sh [-v]
set -u
WS_REAL="$(cd "$(dirname "$0")/../.." && pwd)"
MOCK_REAL="$WS_REAL/ops/tests/fixtures/mock-hermes-scout.sh"
VERBOSE="${1:-}"
PASS=0; FAIL=0; CURRENT=""
say() { [ "$VERBOSE" = "-v" ] && echo "    $*"; }
t_start() { CURRENT="$1"; say ""; say "▶ $1"; }
t_pass() { PASS=$((PASS+1)); echo "PASS $CURRENT"; }
t_fail() { FAIL=$((FAIL+1)); echo "FAIL $CURRENT — $*"; }

FIX="$(mktemp -d /tmp/scout-radar-test.XXXXXX)"
trap 'rm -rf "$FIX"' EXIT
# ── hermetic ops copy: script derives OPS_DIR/WS_DIR from its own path ──
mkdir -p "$FIX/ws/docs/ops" "$FIX/ws/ops"
cp "$WS_REAL/ops/bin/run-night-agent.sh" "$WS_REAL/ops/bin/model-check.sh" \
   "$WS_REAL/ops/bin/kanban.sh" "$FIX/ws/ops/bin/" 2>/dev/null || {
  mkdir -p "$FIX/ws/ops/bin"
  cp "$WS_REAL/ops/bin/run-night-agent.sh" "$WS_REAL/ops/bin/model-check.sh" \
     "$WS_REAL/ops/bin/kanban.sh" "$FIX/ws/ops/bin/"
}
mkdir -p "$FIX/ws/ops/agents" "$FIX/ws/ops/config" "$FIX/ws/ops/lib" "$FIX/ws/ops/run" "$FIX/ws/docs/ops/research"
cp "$WS_REAL/ops/agents/competitor-scout.md" "$WS_REAL/ops/agents/customer-watcher.md" \
   "$WS_REAL/ops/agents/partner-radar.md" "$FIX/ws/ops/agents/"
cp "$WS_REAL/ops/config/model.env" "$WS_REAL/ops/config/buzz.env" \
   "$WS_REAL/ops/config/competitors.txt" "$WS_REAL/ops/config/partners.txt" "$FIX/ws/ops/config/"
cp "$WS_REAL/ops/lib/notify-slack.sh" "$FIX/ws/ops/lib/" 2>/dev/null || true
printf 'TWENTY_API_KEY=fake-test-key\n' > "$FIX/ws/.env"
RUNNER="$FIX/ws/ops/bin/run-night-agent.sh"
chmod +x "$MOCK_REAL"
KBDB="$FIX/kanban.db"

run_sr() { # run_sr <tag> [agent] — hermetic env, always FORCE=1
  local tag="$1"; shift
  env FORCE=1 HERMES_KANBAN_DB="$KBDB" HERMES_BIN="$MOCK_REAL" \
      TIMEOUT_SECS="${SR_T:-20}" "$RUNNER" "$@" 2>&1
}

# ── SR01 unknown agent refuses rc=64 ──
t_start "SR01 unknown agent refused rc=64"
out=$(env FORCE=1 HERMES_BIN="$MOCK_REAL" "$RUNNER" nope-not-an-agent 2>&1); rc=$?
[ $rc -eq 64 ] && t_pass || t_fail "rc=$rc out=$out"

# ── SR02 night-window refusal rc=5 (SKIP inside window) ──
t_start "SR02 night-window refusal without FORCE"
h=$(date +%H)
if [ "$h" -ge 0 ] && [ "$h" -le 6 ]; then
  echo "SKIP $CURRENT (inside night window)"
else
  out=$(env -u FORCE HERMES_BIN="$MOCK_REAL" "$RUNNER" competitor-scout 2>&1); rc=$?
  [ $rc -eq 5 ] && t_pass || t_fail "rc=$rc out=$out"
fi

# ── SR03 lock mutual exclusion rc=8 ──
t_start "SR03 lock mutual exclusion"
touch "$FIX/ws/ops/run/competitor-scout.lock"
out=$(run_sr sr03 competitor-scout 2>&1); rc=$?
rm -f "$FIX/ws/ops/run/competitor-scout.lock"
[ $rc -eq 8 ] && t_pass || t_fail "rc=$rc out=$out"

# ── SR04 competitor list substitution ──
t_start "SR04 competitor prompt has list substituted, no {LIST} leftover"
printf 'Acme Corp\n# comment\n\nGlobex\n' > "$FIX/ws/ops/config/competitors.txt"
out=$(run_sr sr04 competitor-scout 2>&1); rc=$?
P="$FIX/ws/ops/run/competitor-scout.prompt"
if [ $rc -eq 0 ] && [ -f "$P" ] && grep -q "Acme Corp" "$P" && grep -q "Globex" "$P" \
   && ! grep -q "{LIST}" "$P" && ! grep -q "# comment" "$P"; then
  t_pass
else t_fail "rc=$rc out=$(echo "$out"|tail -2)"; fi

# ── SR05 partner list substitution ──
t_start "SR05 partner prompt has list substituted"
printf 'Initech\n' > "$FIX/ws/ops/config/partners.txt"
out=$(run_sr sr05 partner-radar 2>&1); rc=$?
P="$FIX/ws/ops/run/partner-radar.prompt"
if [ $rc -eq 0 ] && grep -q "Initech" "$P" && ! grep -q "{LIST}" "$P"; then
  t_pass
else t_fail "rc=$rc out=$(echo "$out"|tail -2)"; fi

# ── SR06 empty target list refuses rc=3 ──
t_start "SR06 empty target list refused rc=3"
printf '# nothing here\n\n' > "$FIX/ws/ops/config/competitors.txt"
out=$(run_sr sr06 competitor-scout 2>&1); rc=$?
[ $rc -eq 3 ] && t_pass || t_fail "rc=$rc out=$(echo "$out"|tail -2)"
printf 'Acme Corp\nGlobex\n' > "$FIX/ws/ops/config/competitors.txt"

# ── SR07 malformed digest rejected rc=11 ──
t_start "SR07 malformed digest rejected rc=11"
out=$(MOCK_BAD=1 run_sr sr07 competitor-scout 2>&1); rc=$?
[ $rc -eq 11 ] && t_pass || t_fail "rc=$rc out=$(echo "$out"|tail -2)"

# ── SR08 hermes crash propagates rc=10 ──
t_start "SR08 hermes nonzero exit propagates rc=10"
out=$(MOCK_FAIL=1 run_sr sr08 competitor-scout 2>&1); rc=$?
[ $rc -eq 10 ] && t_pass || t_fail "rc=$rc out=$(echo "$out"|tail -2)"

# ── SR09 hard timeout kills runaway rc=9 ──
t_start "SR09 hard timeout kills runaway run"
out=$(SR_T=3 MOCK_SLOW=1 run_sr sr09 competitor-scout 2>&1); rc=$?
{ [ $rc -eq 9 ] || [ $rc -eq 137 ] || [ $rc -eq 143 ]; } && t_pass || t_fail "rc=$rc"

# ── SR10 mock E2E writes research digest ──
t_start "SR10 mock E2E writes research digest"
rm -f "$FIX/ws/docs/ops/research/"*-competitor-scout.md
out=$(run_sr sr10 competitor-scout 2>&1); rc=$?
F=$(ls "$FIX/ws/docs/ops/research/"*-competitor-scout.md 2>/dev/null | head -1)
if [ $rc -eq 0 ] && [ -n "$F" ] && grep -qE "## .*(Digest|Research)" "$F"; then
  t_pass
else t_fail "rc=$rc file=${F:-none}"; fi

# ── SR11 customer-watcher live Twenty list (SKIP when :3000 down) ──
t_start "SR11 customer-watcher fetches Twenty list (live)"
if curl -sf -m5 -X POST http://127.0.0.1:3000/graphql -H 'Content-Type: application/json' \
    -d '{"query":"{ __typename }"}' >/dev/null 2>&1; then
  # live CRM needs the real key (temp .env carries a fake one); scoped to this test, wiped by trap
  grep -E "^TWENTY_API_KEY=" "$WS_REAL/.env" > "$FIX/ws/.env" 2>/dev/null || true
  out=$(CUSTOMER_LIMIT=3 run_sr sr11 customer-watcher 2>&1); rc=$?
  P="$FIX/ws/ops/run/customer-watcher.prompt"
  if [ $rc -eq 0 ] && [ -f "$P" ] && ! grep -q "{LIST}" "$P"; then
    t_pass
  else t_fail "rc=$rc out=$(echo "$out"|tail -2)"; fi
else
  echo "SKIP $CURRENT (Twenty :3000 down)"
fi

# ── SR12 preflight degrades when primary down (still runs via mock) ──
t_start "SR12 preflight warns but runs when model endpoint down"
# model.env is the single source of truth (unconditional assignments win over
# env), so point the hermetic copy at a dead endpoint for this test
printf 'PRIMARY_MODEL_ID=ternary-bonsai-2-27b:q2_0\nPRIMARY_BASE_URL=http://127.0.0.1:9/v1\nFALLBACK_MODEL_ID=ternary-bonsai-2-27b:q2_0\nFALLBACK_BASE_URL=http://127.0.0.1:9/v1\n' > "$FIX/ws/ops/config/model.env"
out=$(run_sr sr12 competitor-scout 2>&1); rc=$?
cp "$WS_REAL/ops/config/model.env" "$FIX/ws/ops/config/model.env"
if [ $rc -eq 0 ] && echo "$out" | grep -q "neither primary nor fallback serving"; then
  t_pass
else t_fail "rc=$rc out=$(echo "$out"|tail -2)"; fi

echo
echo "== scout/radar battery: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
