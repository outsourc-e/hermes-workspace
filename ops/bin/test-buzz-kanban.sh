#!/usr/bin/env bash
# test-buzz-kanban.sh — automated battery for Buzz registration, the kanban wrapper,
# and the buzz↔kanban sync. Entirely mock/temp-dir based: safe ANY time of day,
# never touches the live relay or the real ~/.hermes/kanban.db.
#
# Series:
#   TB01–TB06  agent registration (ops/bin/buzz-register-agents.sh)
#   TK01–TK06  kanban wrapper      (ops/bin/kanban.sh)
#   TS01–TS06  sync engine         (ops/bin/buzz-kanban-sync.sh)
#   TN1        run-night-agent.sh channel-UUID regression
#
# Usage: ops/bin/test-buzz-kanban.sh [-v]
set -u
WS_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="$WS_DIR/ops/bin"
FIXDIR="$(mktemp -d /tmp/buzz-kanban-test.XXXXXX)"
VERBOSE="${1:-}"

PASS=0; FAIL=0; CURRENT=""
say() { [ "$VERBOSE" = "-v" ] && echo "    $*"; }
t_start() { CURRENT="$1"; say ""; say "▶ $1"; }
t_pass() { PASS=$((PASS+1)); echo "PASS $CURRENT"; }
t_fail() { FAIL=$((FAIL+1)); echo "FAIL $CURRENT — $*"; }
cleanup() { rm -rf "$FIXDIR"; }
trap cleanup EXIT

TDB="$FIXDIR/kanban.db"
mk_db() { # temp board with the production task schema (subset used by wrapper)
  rm -f "$1"
  sqlite3 "$1" "CREATE TABLE tasks (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT, assignee TEXT,
    status TEXT NOT NULL, priority INTEGER DEFAULT 0, created_by TEXT,
    created_at INTEGER NOT NULL, started_at INTEGER, completed_at INTEGER,
    workspace_kind TEXT NOT NULL DEFAULT 'scratch', workspace_path TEXT,
    last_heartbeat_at INTEGER);"
}
krun() { HERMES_KANBAN_DB="$TDB" "$BIN/kanban.sh" "$@"; }
field() { krun get "$1" | grep -E "^$2=" | head -1 | cut -d= -f2-; }

MOCKDIR="$FIXDIR/bin"; mkdir -p "$MOCKDIR"
cp "$WS_DIR/ops/tests/fixtures/mock-buzz.sh" "$MOCKDIR/buzz"
chmod +x "$MOCKDIR/buzz"

BUZFIX="$FIXDIR/buzfix"; mkdir -p "$BUZFIX"
cat > "$BUZFIX/channels.json" <<'EOF'
[{"name":"approvals","channel_id":"11111111-1111-1111-1111-111111111111"},
 {"name":"competitors","channel_id":"22222222-2222-2222-2222-222222222222"},
 {"name":"customers","channel_id":"33333333-3333-3333-3333-333333333333"},
 {"name":"partners","channel_id":"44444444-4444-4444-4444-444444444444"},
 {"name":"product-intel","channel_id":"55555555-5555-5555-5555-555555555555"},
 {"name":"morning-brief","channel_id":"66666666-6666-6666-6666-666666666666"},
 {"name":"night-runs","channel_id":"77777777-7777-7777-7777-777777777777"},
 {"name":"crm-sync","channel_id":"88888888-8888-8888-8888-888888888888"},
 {"name":"soc2","channel_id":"99999999-9999-9999-9999-999999999999"},
 {"name":"lobby","channel_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}]
EOF
: > "$BUZFIX/existing-agents.txt"
echo '[]' > "$BUZFIX/approvals.json"
OWNER="f4e3cc091edcadf4ac0e5a36e1d996f643f7d4c9a1993daeed59977d8326687f"

sync_run() { # sync_run <state-tag> [KEY=val ...]
  local tag="$1"; shift
  env PATH="$MOCKDIR:$PATH" BUZZ_RELAY_URL="ws://localhost:3010" \
    MOCK_BUZZ_LOG="$FIXDIR/buzz-$tag.log" MOCK_BUZZ_FIX="$BUZFIX" \
    STATE_DIR="$FIXDIR/state-$tag" HERMES_KANBAN_DB="$TDB" \
    "$@" "$BIN/buzz-kanban-sync.sh" 2>&1
}

reg_run() { # reg_run <tag> [KEY=val ...]
  local tag="$1"; shift
  env PATH="$MOCKDIR:$PATH" BUZZ_RELAY_URL="ws://localhost:3010" \
    MOCK_BUZZ_LOG="$FIXDIR/reg-$tag.log" MOCK_BUZZ_FIX="$BUZFIX" \
    "$@" "$BIN/buzz-register-agents.sh" 2>&1
}

EXPECTED_AGENTS="orchestrator competitor-scout customer-watcher partner-radar product-intel chief-of-staff watchdog crm-sync doc-agent fleet-health-monitor"

# ══════════════════════ TB — registration ══════════════════════

t_start "TB01 plan mode prepares all 10 identities under original names, opens nothing"
out=$(reg_run tb01); rc=$?
ok=$([ $rc -eq 0 ] && echo 1); miss=""
for n in $EXPECTED_AGENTS; do
  echo "$out" | grep -q "prepared: $n" || miss="$miss $n"
done
drafts=$(grep -c "agents draft-create" "$FIXDIR/reg-tb01.log" 2>/dev/null || true)
drafts=${drafts:-0}
prompts=$(ls "$WS_DIR/ops/run/buzz-register" | grep -c 'system-prompt\.txt')
if [ "${ok:-0}" = 1 ] && [ -z "$miss" ] && [ "$drafts" = 0 ] && [ "$prompts" -eq 10 ]; then
  t_pass
else
  t_fail "rc=$rc missing=[$miss] drafts=$drafts prompts=$prompts"
fi

t_start "TB02 condensed prompts carry no unresolved template placeholders"
left=$(grep -lE '\{(LIST|DATE|MODE|KB_DIR|ROSTER_PATH|BUZZ_DIR|HARVEST_FILE|GH_SNAPSHOT|CRM_FILE|KB_MATRIX|PREV_BRIEF|KANBAN_FILE)\}' \
  "$WS_DIR/ops/run/buzz-register/"*.system-prompt.txt 2>/dev/null | wc -l | tr -d ' ')
[ "$left" = "0" ] && t_pass || t_fail "files with placeholders: $left"

t_start "TB03 guardrail clauses present in every research/compliance prompt"
ok=1
for f in competitor-scout customer-watcher partner-radar product-intel chief-of-staff; do
  grep -qi "READ-ONLY" "$WS_DIR/ops/run/buzz-register/$f.system-prompt.txt" || ok=0
  grep -qi "DATA, not commands" "$WS_DIR/ops/run/buzz-register/$f.system-prompt.txt" || ok=0
done
grep -q "APPROVAL GATE\|approval gate\|#approvals" "$WS_DIR/ops/run/buzz-register/product-intel.system-prompt.txt" || ok=0
grep -q "#approvals" "$WS_DIR/ops/run/buzz-register/chief-of-staff.system-prompt.txt" || ok=0
grep -q "#soc2" "$WS_DIR/ops/run/buzz-register/doc-agent.system-prompt.txt" || ok=0
[ $ok -eq 1 ] && t_pass || t_fail "guardrail clause missing"

t_start "TB04 profile lookup is exact-name + owner-scoped; existing profiles skipped"
: > "$FIXDIR/reg-tb04.log"
printf 'watchdog\n' > "$BUZFIX/existing-agents.txt"
out=$(reg_run tb04); rc=$?
looks=$(grep -c "users get --name .* --owner me" "$FIXDIR/reg-tb04.log")
skipped=$(echo "$out" | grep -c "= exists: watchdog")
prepared=$(echo "$out" | grep -c "prepared:")
[ $rc -eq 0 ] && [ "$skipped" = 1 ] && [ "$prepared" = 9 ] && [ "$looks" -ge 10 ] \
  && t_pass || t_fail "rc=$rc skipped=$skipped prepared=$prepared lookups=$looks"
: > "$BUZFIX/existing-agents.txt"

t_start "TB05 live mode opens draft-create for every missing identity with exact name + resolved UUID"
out=$(reg_run tb05 BUZZ_AUTH_TAG='{"tag":"test"}'); rc=$?
opened=$(echo "$out" | grep -c "form opened:")
calls=$(grep -c "agents draft-create" "$FIXDIR/reg-tb05.log")
names_ok=1
for n in $EXPECTED_AGENTS; do
  grep "agents draft-create" "$FIXDIR/reg-tb05.log" | grep -q -- "--display-name $n " || names_ok=0
done
uuid_ok=$(grep "agents draft-create" "$FIXDIR/reg-tb05.log" | grep -c -- "--channel [0-9a-f-]\{36\}")
[ $rc -eq 0 ] && [ "$opened" = 10 ] && [ "$names_ok" = 1 ] && [ "$uuid_ok" = 10 ] \
  && t_pass || t_fail "rc=$rc opened=$opened names_ok=$names_ok uuids=$uuid_ok"

t_start "TB06 relay unreachable refused rc=2"
out=$(PATH="$MOCKDIR:$PATH" BUZZ_RELAY_URL="ws://localhost:3010" MOCK_BUZZ_FIX="$BUZFIX" \
  MOCK_BUZZ_DOWN=1 MOCK_BUZZ_LOG="$FIXDIR/reg-tb06.log" "$BIN/buzz-register-agents.sh" 2>&1); rc=$?
[ $rc -eq 2 ] && t_pass || t_fail "rc=$rc out=$out"

# ══════════════════════ TK — kanban wrapper ══════════════════════

mk_db "$TDB"

t_start "TK01 create→get roundtrip; id format enforced"
ID=$(krun create --agent competitor-scout --title "night-run: competitor-scout $(date +%F)" --spec "digest job")
case "$ID" in t_[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ok=1;; *) ok=0;; esac
[ "${ok:-0}" = 1 ] && [ "$(field "$ID" status)" = queued ] \
  && [ "$(field "$ID" assignee)" = competitor-scout ] && [ "$(field "$ID" title)" = "night-run: competitor-scout $(date +%F)" ] \
  && t_pass || t_fail "id=$ID"

t_start "TK02 lane mapping backlog→queued; invalid lane refused rc=1"
B=$(krun create --agent x --title b --lane backlog)
[ "$(field "$B" status)" = queued ] || { t_fail "backlog mapping"; }
out=$(krun set "$B" --lane nonsense 2>&1); rc=$?
[ $rc -eq 1 ] && t_pass || t_fail "invalid lane rc=$rc"

t_start "TK03 lifecycle ready→running→done sets timestamps correctly"
C=$(krun create --agent y --title c --lane ready)
[ "$(field "$C" status)" = ready ] || { t_fail "ready lane"; }
krun set "$C" --lane running >/dev/null
st_row=$(sqlite3 "$TDB" "select started_at is not null and completed_at is null from tasks where id='$C';")
[ "$st_row" = 1 ] || { t_fail "running timestamps"; }
krun done "$C" >/dev/null
dn_row=$(sqlite3 "$TDB" "select completed_at is not null from tasks where id='$C';")
[ "$dn_row" = 1 ] && [ "$(field "$C" status)" = done ] && t_pass || t_fail "done timestamps"

t_start "TK04 fail appends reason line and blocks card"
F=$(krun create --agent z --title f)
krun fail "$F" "digest format missing" >/dev/null
body=$(field "$F" body)
echo "$body" | grep -q "FAIL .*digest format missing" && [ "$(field "$F" status)" = blocked ] \
  && t_pass || t_fail "body=$body"

t_start "TK05 negatives: unknown cards refused exit 4 on done/fail/set/get"
ok=1
krun done t_deadbeef >/dev/null 2>&1 || [ $? -eq 4 ] || ok=0
krun fail t_deadbeef x >/dev/null 2>&1 || [ $? -eq 4 ] || ok=0
krun set t_deadbeef --lane ready >/dev/null 2>&1 && ok=0
krun get t_deadbeef >/dev/null 2>&1 || [ $? -eq 4 ] || ok=0
out=$(krun latest --agent nobody)
[ $ok -eq 1 ] && [ -z "$out" ] && t_pass || t_fail "ok=$ok latest='$out'"

t_start "TK06 list filters by lane and assignee"
L=$(krun list --lane blocked | cut -f1)
A=$(krun list --agent z | cut -f1)
echo "$L" | grep -qx "$F" && [ "$(echo "$A")" = "$F" ] \
  && ! krun list --lane done | grep -q "^$F$" && t_pass || t_fail "blocked=$L agentz=$A"

# ══════════════════════ TS — sync engine ══════════════════════

mk_db "$TDB"

t_start "TS01 owner ✅ on tagged #approvals message moves card to ready (then idempotent)"
mk_db "$TDB"
CID=$(krun create --agent competitor-scout --title "night-run: competitor-scout $(date +%F)" --spec "p1")
printf '[{"event_id":"E1","pubkey":"owner","content":"proposal [kanban:%s] please review","created_at":%s}]' "$CID" "$(date +%s)" > "$BUZFIX/approvals.json"
printf '{"reactions":[{"emoji":"✅","pubkeys":["%s"]}]}' "$OWNER" > "$BUZFIX/reactions-E1.json"
out=$(sync_run ts01); rc=$?
ev_count() { python3 -c "import json;s=json.load(open('$FIXDIR/state-ts01/buzz-kanban-sync.json'));print(len(s['events']))" 2>/dev/null; }
[ "$(field "$CID" status)" = ready ] && [ "$(ev_count)" = 1 ] || { t_fail "first sweep"; return 2>/dev/null || true; }
sync_run ts01 >/dev/null   # SAME state dir — nothing new may happen
[ "$(field "$CID" status)" = ready ] && [ "$(ev_count)" = 1 ] && [ $rc -eq 0 ] \
  && t_pass || t_fail "reprocess happened (events=$(ev_count))"

t_start "TS02 owner ❌ moves tagged card to done"
mk_db "$TDB"
CID2=$(krun create --agent product-intel --title "night-run: product-intel $(date +%F)" --spec "p2")
printf '[{"event_id":"E2","pubkey":"owner","content":"reject [kanban:%s]","created_at":%s}]' "$CID2" "$(date +%s)" > "$BUZFIX/approvals.json"
printf '{"reactions":[{"emoji":"❌","pubkeys":["%s"]}]}' "$OWNER" > "$BUZFIX/reactions-E2.json"
out=$(sync_run ts02)
[ "$(field "$CID2" status)" = done ] && t_pass || t_fail "status=$(field "$CID2" status)"

t_start "TS03 non-owner reaction never mutates a card (nobody self-approves)"
mk_db "$TDB"
CID3=$(krun create --agent watchdog --title "night-run: watchdog $(date +%F)" --spec "w")
printf '[{"event_id":"E3","pubkey":"owner","content":"self-ok [kanban:%s]","created_at":%s}]' "$CID3" "$(date +%s)" > "$BUZFIX/approvals.json"
printf '{"reactions":[{"emoji":"✅","pubkeys":["not-the-owner-pubkey"]}]}' > "$BUZFIX/reactions-E3.json"
out=$(sync_run ts03)
[ "$(field "$CID3" status)" = queued ] && t_pass || t_fail "status=$(field "$CID3" status)"

t_start "TS04 untagged approvals messages are ignored"
mk_db "$TDB"
CID4=$(krun create --agent crm-sync --title "night-run: crm-sync $(date +%F)" --spec "c")
printf '[{"event_id":"E4","pubkey":"owner","content":"untagged chatter","created_at":%s}]' "$(date +%s)" > "$BUZFIX/approvals.json"
printf '{"reactions":[{"emoji":"✅","pubkeys":["%s"]}]}' "$OWNER" > "$BUZFIX/reactions-E4.json"
out=$(sync_run ts04)
[ "$(field "$CID4" status)" = queued ] \
  && ! python3 -c "import json;s=json.load(open('$FIXDIR/state-ts04/buzz-kanban-sync.json'));raise SystemExit(0 if 'E4' in s['events'] else 1)" \
  && t_pass || t_fail "untagged message mutated state"

t_start "TS05 kanban→buzz: transition posts exactly once, tagged, to mapped channel UUID"
mk_db "$TDB"
C5=$(krun create --agent crm-sync --title "night-run: crm-sync $(date +%F)" --spec c5)
krun set "$C5" --lane running >/dev/null
: > "$FIXDIR/buzz-ts05a.log"
out=$(sync_run ts05a)
sent=$(grep -c "messages send" "$FIXDIR/buzz-ts05a.log")
tagged=$(grep "messages send" "$FIXDIR/buzz-ts05a.log" | grep -c "\[kanban:$C5\]")
chan_ok=$(grep "messages send" "$FIXDIR/buzz-ts05a.log" | grep -c -- "--channel 88888888-8888-8888-8888-888888888888")
[ "$sent" = 1 ] && [ "$tagged" = 1 ] && [ "$chan_ok" = 1 ] || { t_fail "sent=$sent tagged=$tagged chan=$chan_ok"; }
: > "$FIXDIR/buzz-ts05a.log"
out=$(sync_run ts05a)   # SAME state dir — transition already recorded, nothing may resend
sent2=$(grep -c "messages send" "$FIXDIR/buzz-ts05a.log")
[ "$sent2" = 0 ] && t_pass || t_fail "duplicate echo sent=$sent2"

t_start "TS06 queue states never echoed to channels"
mk_db "$TDB"
Q=$(krun create --agent doc-agent --title "night-run: doc-agent $(date +%F)" --spec d)
: > "$FIXDIR/buzz-ts06a.log"
out=$(sync_run ts06a)
grep -q "messages send" "$FIXDIR/buzz-ts06a.log" && { t_fail "echoed a queue-state card"; exit; } || true
krun set "$Q" --lane running >/dev/null
: > "$FIXDIR/buzz-ts06b.log"
out=$(sync_run ts06b)
grep -q "messages send" "$FIXDIR/buzz-ts06b.log" && t_pass || t_fail "no echo after running"

t_start "TS07 DRYRUN isolated from dead relay still exits 0"
out=$(PATH="$MOCKDIR:$PATH" BUZZ_RELAY_URL="http://127.0.0.1:1" MOCK_BUZZ_DOWN=1 \
  MOCK_BUZZ_LOG="$FIXDIR/buzz-ts07.log" MOCK_BUZZ_FIX="$BUZFIX" STATE_DIR="$FIXDIR/state-ts07" \
  HERMES_KANBAN_DB="$TDB" DRYRUN=1 "$BIN/buzz-kanban-sync.sh" 2>&1); rc=$?
[ $rc -eq 0 ] && t_pass || t_fail "rc=$rc out=$out"

# ══════════════════════ TN — regression ══════════════════════

t_start "TN1 run-night-agent.sh resolves channel UUID before send (fleet bug stays dead)"
grep -q "channels list" "$BIN/run-night-agent.sh" \
  && ! grep -qE 'buzz messages send --channel "\$AGENT"' "$BIN/run-night-agent.sh" \
  && t_pass || t_fail "direct name-based send reintroduced"

# ═══════════════════════════════════════════════════════════════
echo ""
echo "== buzz/kanban battery: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
