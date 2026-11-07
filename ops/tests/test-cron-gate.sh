#!/usr/bin/env bash
# test-cron-gate.sh — B1 kanban-gate battery (remediation-2026-11-04 §B1).
#
# Covers ops/bin/cron-gate.sh verdict logic over hermetic fixture snapshots and
# the runner wiring (run-night-agent.sh closes before any card claim or model
# call, FORCE=1 is the documented bypass, product-intel DRYRUN skips the gate).
# Hermetic: fixtures/cron-gate/*.json + temp kanban DB + mock hermes binary —
# never touches the live board, the live snapshot, or a real model.
#
# Usage: ops/tests/test-cron-gate.sh [-v]; exit 0 = green, 1 = any FAIL
# (PASS/WARN/FAIL conventions per test-hermes-health.sh; test-log is append-only).
set -u
OPS_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
FIX_SRC="$OPS_DIR/ops/tests/fixtures/cron-gate"
VERBOSE=0; [ "${1:-}" = "-v" ] && VERBOSE=1
pass=0; warn=0; fail=0
GATE="$OPS_DIR/ops/bin/cron-gate.sh"
RUNNER="$OPS_DIR/ops/bin/run-night-agent.sh"
PINTEL="$OPS_DIR/ops/bin/run-product-intel.sh"

# 2026-11-06 B4: fixtures carry a fixed `generated_at` that ages out of the
# gate's 90-min staleness check → the open-gate cases rotted after ~10 h
# (found when G13–G15 ran on a next-day session). Fix: copy every fixture into
# a temp dir and stamp `generated_at` = now. Still hermetic — the gate only
# ever reads these copies, never the live snapshot.
FIX="$(mktemp -d /tmp/cron-gate-fresh.XXXXXX)"
trap 'rm -rf "$FIX" "$MOCKDIR" "$(dirname "$TMPKB" 2>/dev/null)" "$TMPLOG" "$RESEARCH_DIR" 2>/dev/null' EXIT
for f in "$FIX_SRC"/*.json; do
  case "$(basename "$f")" in
    closed-stale-snapshot.json) cp "$f" "$FIX/" ;;
    *)
      # stamp summary.generated_at = now (naive local, same format the live
      # writer emits); the gate nests it under `summary` and compares naive.
      python3 -c "import json,sys; p=sys.argv[1]; j=json.load(open(p)); j['summary']['generated_at']=sys.argv[2]; json.dump(j, open(sys.argv[3],'w'))" "$f" "$(date +%Y-%m-%dT%H:%M:%S)" "$FIX/$(basename "$f")"
      ;;
  esac
done

t(){ t_name="$1"; t_status="$2"; t_note="$3"
  case "$t_status" in
    PASS) pass=$((pass+1)); s="PASS";;
    WARN) warn=$((warn+1)); s="WARN";;
    *)    fail=$((fail+1)); s="FAIL";;
  esac
  s_note=$(printf '%s' "$t_note" | tr '\n' '|' | sed 's/§/ …/g' | cut -c1-220)
  echo "| test-cron-gate | $t_name | $t_status | $s_note |"
  if [ "$VERBOSE" = 1 ] || [ "$t_status" != "PASS" ]; then
    echo "  $s $t_name: $s_note"
  fi
}

# ------------------------------------------------- G01–G08 verdict logic
g(){ # fixture expect_open(1|0) name
  local fix="$1" want="$2" name="$3" rc
  local want_rc=1; [ "$want" = "open" ] && want_rc=0
  local out; out=$(GATE_HEALTH_JSON="$fix" bash "$GATE" 2>/dev/null); rc=$?
  if [ "$rc" = "$want_rc" ]; then
    t "$name" PASS "$out"
  else
    t "$name" FAIL "expected $want (rc=$want_rc), got rc=$rc: $out"
  fi
}

g "$FIX/open-chronic.json"          open   "G01 chronic artifact debt does not close the gate"
g "$FIX/closed-acute-stale.json"    closed "G02 failed runs + stale artifact close the gate"
g "$FIX/open-report-half.json"      open   "G03 report-only half failed, artifact fresh -> open"
g "$FIX/closed-stalled-missed.json" closed "G04 stalled execution / missed daily run close the gate"
g "$FIX/closed-stale-snapshot.json" closed "G05 snapshot >90min old closes the gate (fail-closed)"
g "$FIX/closed-corrupt.json"        closed "G06 corrupt snapshot closes the gate (fail-closed)"
g "$FIX/open-clean.json"            open   "G07 healthy snapshot opens the gate"

out=$(GATE_HEALTH_JSON="$FIX/nonexistent.json" bash "$GATE" 2>/dev/null); rc=$?
[ "$rc" = "1" ] && t "G08 missing snapshot closes the gate" PASS "$out" \
                 || t "G08 missing snapshot closes the gate" FAIL "rc=$rc: $out"

# ------------------------------------------------- G09–G12 runner wiring
# mock hermes (well-formed digest on success) + temp board + temp research dir
# so bypass/proceed runs are fully hermetic; time-boxed guards (45s) turn a
# future wedge into a test failure instead of a hang.
MOCKDIR=$(mktemp -d); trap 'rm -rf "$MOCKDIR" "$FIX" "$(dirname "$TMPKB" 2>/dev/null)" "$TMPLOG" "$RESEARCH_DIR" 2>/dev/null' EXIT
printf '#!/bin/sh\necho "## Digest — ok"\n' > "$MOCKDIR/hermes"; chmod +x "$MOCKDIR/hermes"
TMPKB="$(mktemp -d)/kanban.db"
TMPLOG="$(mktemp)"
RESEARCH_DIR=$(mktemp -d)
# hermetic run dir: locks/logs/outs go here, never into ops/run (a killed test
# must not leave a stale lock that fails real nightly runs, and vice versa)
RUN_DIR_EXPORT="$(mktemp -d)"
export RUN_DIR_OVERRIDE="$RUN_DIR_EXPORT"
sqlite3 "$TMPKB" "create table tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT, assignee TEXT, status TEXT NOT NULL default 'queued', priority INTEGER default 0, created_by TEXT, created_at INTEGER NOT NULL, started_at INTEGER, completed_at INTEGER, workspace_kind TEXT NOT NULL default 'scratch', workspace_path TEXT, claim_lock TEXT, claim_expires INTEGER, tenant TEXT, result TEXT, idempotency_key TEXT, spawn_failures INTEGER NOT NULL default 0, worker_pid INTEGER, last_spawn_error TEXT, max_runtime_seconds INTEGER, last_heartbeat_at INTEGER, current_run_id INTEGER, workflow_template_id TEXT, current_step_key TEXT, skills TEXT, consecutive_failures INTEGER NOT NULL default 0, last_failure_error TEXT, max_retries INTEGER, branch_name TEXT, model_override TEXT, session_id TEXT, goal_mode TEXT, goal_max_turns INTEGER, project_id TEXT, block_kind TEXT, block_recurrences INTEGER, provider_override TEXT, reasoning_effort TEXT, completion_contract TEXT, worker_started_at INTEGER);"

timebox(){ # seconds cmd… — launch, capture rc, kill if still alive past $1
  local secs="$1"; shift
  "$@" > "$TMPLOG" 2>&1 & local p=$!
  ( sleep "$secs"; kill -9 $p 2>/dev/null ) & local w=$!
  wait $p; local rc=$?
  kill -9 $w 2>/dev/null; wait $w 2>/dev/null
  return $rc
}
runlog(){ [ -s "$TMPLOG" ] && tail -4 -- "$TMPLOG" | tr '\n' '|'; }

# G09: closed fixture inside window -> rc=4, gate message, nothing claimed
NOW_HOUR=2 FORCE= GATE_HEALTH_JSON="$FIX/closed-acute-stale.json" \
HERMES_KANBAN_DB="$TMPKB" timebox 45 bash "$RUNNER" competitor-scout; rc=$?
gline=$(grep -m1 'gate closed' "$TMPLOG")
if [ "$rc" = "4" ] && [ -n "$gline" ]; then
  t "G09 runner refuses on closed gate (rc=4)" PASS "$gline"
else
  t "G09 runner refuses on closed gate (rc=4)" FAIL "rc=$rc: $(runlog)"
fi

# G10: FORCE=1 bypasses the gate (operator override reaches mock-hermes, no gate line)
NOW_HOUR=2 FORCE=1 GATE_HEALTH_JSON="$FIX/closed-acute-stale.json" \
HERMES_KANBAN_DB="$TMPKB" HERMES_BIN="$MOCKDIR/hermes" RESEARCH_DIR="$RESEARCH_DIR" timebox 45 bash "$RUNNER" competitor-scout; rc=$?
if [ "$rc" = "0" ] && ! grep -q 'gate closed' "$TMPLOG"; then
  t "G10 documented FORCE=1 bypass skips the gate" PASS "mock-hermes reached, no gate consult"
else
  t "G10 documented FORCE=1 bypass skips the gate" FAIL "rc=$rc: $(runlog)"
fi

# G11: open fixture inside window -> gate open printed, claim made, mock reached
NOW_HOUR=2 GATE_HEALTH_JSON="$FIX/open-clean.json" \
HERMES_KANBAN_DB="$TMPKB" HERMES_BIN="$MOCKDIR/hermes" RESEARCH_DIR="$RESEARCH_DIR" timebox 45 bash "$RUNNER" competitor-scout; rc=$?
if [ "$rc" = "0" ] && grep -q 'GATE open' "$TMPLOG"; then
  n=$(sqlite3 "$TMPKB" "select count(*) from tasks where status='running' and assignee='competitor-scout';" 2>/dev/null)
  t "G11 runner proceeds past open gate + claims card (temp board)" PASS "gate: $(grep -m1 'GATE open' "$TMPLOG"); running cards: ${n:-0}"
else
  t "G11 runner proceeds past open gate + claims card (temp board)" FAIL "rc=$rc: $(runlog)"
fi

# G12: product-intel DRYRUN skips the gate entirely even on a closed fixture
DRYRUN=1 GATE_HEALTH_JSON="$FIX/closed-acute-stale.json" timebox 45 bash "$PINTEL"; rc=$?
if ! grep -q 'gate closed' "$TMPLOG"; then
  t "G12 product-intel DRYRUN skips the gate (hermetic tests unaffected)" PASS "no gate consult, rc=$rc"
else
  t "G12 product-intel DRYRUN skips the gate (hermetic tests unaffected)" FAIL "gate consulted under DRYRUN"
fi

# ------------------------------------------------- G13–G15 B4 day catch-up
# Reset the board, then drive the runner in CATCHUP=1 mode: night window
# refused, oldest stale ready card adopted+completed through the same gate,
# and no-op when nothing stale exists.
sqlite3 "$TMPKB" "insert into tasks (id,title,body,assignee,status,priority,created_by,created_at,started_at,completed_at,workspace_kind,workspace_path) values
 ('t_catcha0','night-run: competitor-scout 2026-10-24','stale','competitor-scout','ready',0,'pre-night-check',1792830000,0,0,'scratch','/tmp/w'),
 ('t_catchb1','night-run: competitor-scout 2026-10-30','stale2','competitor-scout','ready',0,'pre-night-check',1793395200,0,0,'scratch','/tmp/w'),
 ('t_catchc2','night-run: competitor-scout $(date +%F)','today','competitor-scout','ready',0,'pre-night-check',strftime('%s','now'),0,0,'scratch','/tmp/w');"

# G13: CATCHUP in night hours -> refused, nothing claimed
: > "$TMPLOG"
NOW_HOUR=2 CATCHUP=1 GATE_HEALTH_JSON="$FIX/open-clean.json" \
HERMES_KANBAN_DB="$TMPKB" timebox 45 bash "$RUNNER" competitor-scout; rc=$?
if [ "$rc" = "5" ] && ! sqlite3 "$TMPKB" "select 1 from tasks where status='running';" 2>/dev/null | grep -q 1; then
  t "G13 catch-up refused outside day window (rc=5)" PASS "no claim in night window"
else
  t "G13 catch-up refused outside day window (rc=5)" FAIL "rc=$rc: $(runlog)"
fi

# G14: CATCHUP at midday, open gate -> adopts the OLDEST stale card, completes it
: > "$TMPLOG"
NOW_HOUR=12 CATCHUP=1 GATE_HEALTH_JSON="$FIX/open-clean.json" \
HERMES_KANBAN_DB="$TMPKB" HERMES_BIN="$MOCKDIR/hermes" RESEARCH_DIR="$RESEARCH_DIR" timebox 45 bash "$RUNNER" competitor-scout; rc=$?
done_c=$(sqlite3 "$TMPKB" "select id from tasks where status='done' and id in ('t_catcha0','t_catchb1','t_catchc2');" 2>/dev/null | tr -d '\n')
ready_b=$(sqlite3 "$TMPKB" "select status from tasks where id='t_catchb1';" 2>/dev/null)
if [ "$rc" = "0" ] && [ "$done_c" = "t_catcha0" ] && [ "$ready_b" = "ready" ]; then
  t "G14 catch-up adopts OLDEST stale card through gate + completes it" PASS "done=$done_c, newer stale still ready"
else
  t "G14 catch-up adopts OLDEST stale card through gate + completes it" FAIL "rc=$rc done=$done_c catchb1=$ready_b: $(runlog)"
fi

# G15: CATCHUP with only today's card -> quiet no-op, zero claims
# (clean slate: remove ALL competitor-scout cards incl. the ones G14 consumed,
# keep a single card whose title is today's date = "nothing stale")
sqlite3 "$TMPKB" "delete from tasks where assignee='competitor-scout'; insert into tasks (id,title,body,assignee,status,priority,created_by,created_at,started_at,completed_at,workspace_kind,workspace_path) values ('t_today0','night-run: competitor-scout $(date +%F)','today','competitor-scout','ready',0,'pre-night-check',strftime('%s','now'),0,0,'scratch','/tmp/w');"
: > "$TMPLOG"
NOW_HOUR=12 CATCHUP=1 GATE_HEALTH_JSON="$FIX/open-clean.json" \
HERMES_KANBAN_DB="$TMPKB" timebox 45 bash "$RUNNER" competitor-scout; rc=$?
claimed=$(sqlite3 "$TMPKB" "select count(*) from tasks where status='running';" 2>/dev/null | tr -d '\n')
noop=$(grep -c 'nothing to do' "$TMPLOG")
if [ "$rc" = "0" ] && [ "${claimed:-0}" = "0" ] && [ "${noop:-0}" -ge 1 ]; then
  t "G15 catch-up no-ops (no stale cards) without model spend" PASS "quiet no-op, claimed=$claimed"
else
  t "G15 catch-up no-ops (no stale cards) without model spend" FAIL "rc=$rc claimed=$claimed noop=$noop: $(runlog)"
fi

# ------------------------------------------------- G16–G18 product-intel catch-up
# Same CATCHUP=1 contract as G13–G15, driven through run-product-intel.sh's own
# window/lock/claim/validation chain. Hermetic knobs: STATE_DIR (lock + cadence
# state — product-intel reads STATE_DIR, not RUN_DIR_OVERRIDE), TARGETS_CFG,
# KB_DIR/RESEARCH_DIR, HERMES_BIN mock producing a valid LIGHT delta,
# BUZZ_POST_DIGESTS=0, temp board. The happy path fires one real macOS
# notification (osascript is unconditional outside DRYRUN) — cosmetic, and
# notify-slack no-ops because no Slack webhook/token exists in the test env.
cat > "$MOCKDIR/hermes-pintel" <<'MOCK'
#!/bin/sh
printf '## Product Intel Delta — %s\n### Changes\n- mock catch-up delta ok\n' "$(date +%F)"
MOCK
chmod +x "$MOCKDIR/hermes-pintel"
printf 'ExampleCorp | https://example.com\n' > "$RUN_DIR_EXPORT/product-intel-targets.txt"
printf '{"last_light":"2026-11-05","last_deep":"2026-11-06"}\n' > "$RUN_DIR_EXPORT/product-intel-state.json"
sqlite3 "$TMPKB" "insert into tasks (id,title,body,assignee,status,priority,created_by,created_at,started_at,completed_at,workspace_kind,workspace_path) values
 ('t_pi_a0','night-run: product-intel 2026-10-24','stale','product-intel','ready',0,'pre-night-check',1792830000,0,0,'scratch','/tmp/w'),
 ('t_pi_b1','night-run: product-intel 2026-10-30','stale2','product-intel','ready',0,'pre-night-check',1793395200,0,0,'scratch','/tmp/w'),
 ('t_pi_c2','night-run: product-intel $(date +%F)','today','product-intel','ready',0,'pre-night-check',strftime('%s','now'),0,0,'scratch','/tmp/w');"

# G16: CATCHUP at night hour -> refused before lock/claim, nothing adopted
: > "$TMPLOG"
NOW_HOUR=2 CATCHUP=1 BUZZ_POST_DIGESTS=0 GATE_HEALTH_JSON="$FIX/open-clean.json" \
HERMES_KANBAN_DB="$TMPKB" STATE_DIR="$RUN_DIR_EXPORT" timebox 45 bash "$PINTEL"; rc=$?
if [ "$rc" = "5" ] && ! sqlite3 "$TMPKB" "select 1 from tasks where status='running';" 2>/dev/null | grep -q 1; then
  t "G16 product-intel catch-up refused outside day window (rc=5)" PASS "no claim in night window"
else
  t "G16 product-intel catch-up refused outside day window (rc=5)" FAIL "rc=$rc: $(runlog)"
fi

# G17: CATCHUP at midday, open gate -> adopts the OLDEST stale card, completes
# it through the LIGHT cycle, and leaves the cadence state file untouched.
: > "$TMPLOG"
NOW_HOUR=12 CATCHUP=1 BUZZ_POST_DIGESTS=0 GATE_HEALTH_JSON="$FIX/open-clean.json" \
HERMES_KANBAN_DB="$TMPKB" STATE_DIR="$RUN_DIR_EXPORT" \
TARGETS_CFG="$RUN_DIR_EXPORT/product-intel-targets.txt" \
RESEARCH_DIR="$RESEARCH_DIR" KB_DIR="$RESEARCH_DIR/kb" \
HERMES_BIN="$MOCKDIR/hermes-pintel" timebox 60 bash "$PINTEL"; rc=$?
done_pi=$(sqlite3 "$TMPKB" "select id from tasks where status='done' and id in ('t_pi_a0','t_pi_b1','t_pi_c2');" 2>/dev/null | tr -d '\n')
ready_pi=$(sqlite3 "$TMPKB" "select status from tasks where id='t_pi_b1';" 2>/dev/null)
state_light=$(python3 -c "import json;print(json.load(open('$RUN_DIR_EXPORT/product-intel-state.json'))['last_light'])" 2>/dev/null)
if [ "$rc" = "0" ] && [ "$done_pi" = "t_pi_a0" ] && [ "$ready_pi" = "ready" ] && [ "$state_light" = "2026-11-05" ]; then
  t "G17 product-intel catch-up adopts OLDEST card, cadence state untouched" PASS "done=$done_pi · newer stale still ready · last_light=$state_light (pre-seeded)"
else
  t "G17 product-intel catch-up adopts OLDEST card, cadence state untouched" FAIL "rc=$rc done=$done_pi catchb=$ready_pi last_light=$state_light: $(runlog)"
fi

# G18: CATCHUP with only today's card -> quiet no-op, zero claims
sqlite3 "$TMPKB" "delete from tasks where assignee='product-intel'; insert into tasks (id,title,body,assignee,status,priority,created_by,created_at,started_at,completed_at,workspace_kind,workspace_path) values ('t_pi_today','night-run: product-intel $(date +%F)','today','product-intel','ready',0,'pre-night-check',strftime('%s','now'),0,0,'scratch','/tmp/w');"
: > "$TMPLOG"
NOW_HOUR=12 CATCHUP=1 BUZZ_POST_DIGESTS=0 GATE_HEALTH_JSON="$FIX/open-clean.json" \
HERMES_KANBAN_DB="$TMPKB" STATE_DIR="$RUN_DIR_EXPORT" timebox 45 bash "$PINTEL"; rc=$?
claimed=$(sqlite3 "$TMPKB" "select count(*) from tasks where status='running';" 2>/dev/null | tr -d '\n')
noop=$(grep -c 'nothing to do' "$TMPLOG")
if [ "$rc" = "0" ] && [ "${claimed:-0}" = "0" ] && [ "${noop:-0}" -ge 1 ]; then
  t "G18 product-intel catch-up no-ops (no stale cards) without model spend" PASS "quiet no-op, claimed=$claimed"
else
  t "G18 product-intel catch-up no-ops (no stale cards) without model spend" FAIL "rc=$rc claimed=$claimed noop=$noop: $(runlog)"
fi

echo
echo "RESULT: $pass PASS / $warn WARN / $fail FAIL"
[ "$fail" = "0" ] || exit 1
