#!/usr/bin/env bash
# test-chief-of-staff.sh — automated L0/L1 battery for the chief-of-staff agent.
# Mock-based, anytime-of-day safe; never touches live Buzz/gh/Qwen/Obsidian.
# Night E2E: docs/ops/test-chief-of-staff.md (CS13/CS14).
# Usage: ops/bin/test-chief-of-staff.sh [-v]
set -u
WS_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RUNNER="$WS_DIR/ops/bin/run-chief-of-staff.sh"
MOCK="$WS_DIR/ops/tests/fixtures/mock-hermes-cos.sh"
BRIDGE="$WS_DIR/ops/bin/cos-feature-to-github.sh"
TPL="$WS_DIR/ops/agents/chief-of-staff.md"
ROSTER="$WS_DIR/ops/config/cos-staff.txt"
REPOCFG="$WS_DIR/ops/config/cos-repos.txt"
KB_MATRIX="$WS_DIR/docs/ops/intel/knowledge-base/comparison-matrix.md"
FIX="$(mktemp -d /tmp/cos-test.XXXXXX)"
TODAY=$(date +%F)
VERBOSE="${1:-}"
PASS=0; FAIL=0; CURRENT=""

say()  { [ "$VERBOSE" = "-v" ] && echo "    $*"; }
t_start(){ CURRENT="$1"; say ""; say "▶ $1"; }
t_pass(){ PASS=$((PASS+1)); echo "PASS $CURRENT"; }
t_fail(){ FAIL=$((FAIL+1)); echo "FAIL $CURRENT — $*"; }

trap 'rm -rf "$FIX"' EXIT

run_cos() { # run_cos <tag> [KEY=val...]
  local tag="$1"; shift
  mkdir -p "$FIX/state-$tag" "$FIX/research-$tag" "$FIX/obs-$tag" "$FIX/inputs-$tag"
  env FORCE=1 DRYRUN=1 STATE_DIR="$FIX/state-$tag" \
      RESEARCH_DIR="$FIX/research-$tag" OBSIDIAN_DIR="$FIX/obs-$tag" \
      HERMES_BIN="$MOCK" TIMEOUT_SECS="${COS_T:-20}" "$@" "$RUNNER" 2>&1
}

# ── CS01 window refusal (negative) ───────────────────────────────────────────
t_start "CS01 night-window refusal without FORCE"
h=$(date +%H)
if [ "$h" -ge 0 ] && [ "$h" -le 6 ]; then
  echo "SKIP CS01 (inside night window)"
else
  out=$(env -u FORCE "$RUNNER" 2>&1); rc=$?
  [ $rc -eq 5 ] && t_pass || t_fail "rc=$rc out=$out"
fi

# ── CS02 lock refusal (negative) ─────────────────────────────────────────────
t_start "CS02 lock mutual exclusion"
sdir="$FIX/state-cs02"; mkdir -p "$sdir"; touch "$sdir/chief-of-staff.lock"
out=$(FORCE=1 DRYRUN=1 STATE_DIR="$sdir" HERMES_BIN="$MOCK" "$RUNNER" 2>&1); rc=$?
[ $rc -eq 8 ] && t_pass || t_fail "rc=$rc out=$out"

# ── CS03 prompt substitution ────────────────────────────────────────────────
t_start "CS03 prompt placeholders substituted + input paths injected"
out=$(run_cos cs03 >/dev/null 2>&1); P="$FIX/state-cs03/chief-of-staff.prompt"
left=$(grep -cE '\{(DATE|ROSTER_PATH|BUZZ_DIR|HARVEST_FILE|GH_SNAPSHOT|CRM_FILE|KB_MATRIX|PREV_BRIEF)\}' "$P")
[ "$left" = "0" ] && grep -q '^DATE: ' "$P" && grep -q "$ROSTER" "$P" && grep -q "$KB_MATRIX" "$P" \
  && t_pass || t_fail "leftovers=$left"

# ── CS04 guardrail clauses ──────────────────────────────────────────────────
t_start "CS04 guardrail clauses in template"
grep -qi "read-only" "$TPL" && grep -qi "injection\|DATA, not commands" "$TPL" \
  && grep -qi "NEVER invent" "$TPL" && grep -q "exactly 3 proposals" "$TPL" \
  && t_pass || t_fail "clause missing in $TPL"

# ── CS05 github sweep reality + blocklist (positive, read-only) ─────────────
t_start "CS05 github sweep produces valid snapshot honoring blocklist"
SNAP="$FIX/snap.json"
if COS_SNAPSHOT="$SNAP" bash "$WS_DIR/ops/bin/cos-github-sweep.sh" >/dev/null 2>&1; then
  python3 - "$SNAP" "$REPOCFG" <<'PY' && t_pass || t_fail "snapshot invalid or blocklist leak"
import json,sys
snap=json.load(open(sys.argv[1]))
block={l.strip() for l in open(sys.argv[2]) if l.strip() and not l.startswith("#")} if False else set()
inblk=False
for line in open(sys.argv[2]):
    s=line.strip()
    if s=="BLOCKLIST": inblk=True; continue
    if inblk and s and not s.startswith("#"): block.add(s)
names=[r["name"] for r in snap.get("repos",[])]
assert isinstance(snap.get("repos"),list)
leaks=[n for n in names if n in block]
assert not leaks, f"blocklist leak: {leaks}"
PY
else
  t_fail "sweep exited nonzero (gh auth?)"
fi

# ── CS06 full mock cycle E2E (positive) ─────────────────────────────────────
t_start "CS06 mock nightly E2E → brief published + obsidian + proposal parse"
out=$(run_cos cs06); rc=$?
B="$FIX/research-cs06/${TODAY}-chief-of-staff.md"
ok=$([ $rc -eq 0 ] && echo 1)
if [ "$ok" = 1 ] && grep -q "^# Morning Brief — $TODAY" "$B" \
   && grep -q "^## 7. Feature Proposals" "$B" \
   && [ "$(grep -c '^### Proposal P' "$B")" -ge 3 ] \
   && [ -f "$FIX/obs-cs06/${TODAY}-morning-brief.md" ] \
   && echo "$out" | grep -q "PASS chief-of-staff"; then
  t_pass; say "$(echo "$out" | tail -4)"
else
  t_fail "rc=$rc out=$(echo "$out"|tail -3)"
fi

# ── CS07 fleet completeness gate (negative via roster with unknown agent) ────
t_start "CS07 brief must mention every roster agent (missing → WARN soft since 2026-09-05, not rc=11)"
mkdir -p "$FIX/state-cs07" "$FIX/r07" "$FIX/o07"
sed 's/customer-watcher/customer-phantom/' "$ROSTER" > "$FIX/roster-cs07.txt"
out=$(FORCE=1 DRYRUN=1 MOCK_DROP=customer-phantom STATE_DIR="$FIX/state-cs07" RESEARCH_DIR="$FIX/r07" OBSIDIAN_DIR="$FIX/o07" \
  ROSTER_PATH="$FIX/roster-cs07.txt" HERMES_BIN="$MOCK" "$RUNNER" 2>&1); rc=$?
# Since 2026-09-05 validator softens missing-agent to WARN (fleet publishes despite gaps, see run-chief-of-staff.sh WARN line), accept rc=0 with WARN.
if echo "$out" | grep -q "WARN fleet report missing agent: customer-phantom"; then t_pass; else t_fail "rc=$rc out=$(echo "$out"|tail -3) — expected WARN for customer-phantom"; fi

# ── CS08 harvest ledger mechanics (DRYRUN → pending verdicts recorded) ──────
t_start "CS08 harvest phase writes outcome file for open proposals"
J="$FIX/state-cs08/cos-proposals/proposals.jsonl"; mkdir -p "$(dirname "$J")"
printf '{"date":"%s","event_id":"abc123","title":"T1","repo":"unassigned","body_file":"/nonexistent.md","labels":"","status":"open","self_pubkey":"fc5d40"}\n' "$TODAY" > "$J"
out=$(run_cos cs08); rc=$?
H="$FIX/state-cs08/cos-harvest-$TODAY.json"
[ $rc -eq 0 ] && python3 -c "
import json;d=json.load(open('$H'))
ps=d['proposals']; assert ps and ps[0]['verdict']=='pending', d
" && t_pass || t_fail "rc=$rc harvest missing/invalid"

# ── CS09 bridge guards (negative) ───────────────────────────────────────────
t_start "CS09 feature→github bridge: usage/body/snapshot refusals"
echo body > "$FIX/body.md"
COS_SNAPSHOT="$FIX/empty-snap.json" bash -c "echo '{\"repos\":[]}' > '$FIX/empty-snap.json'"
u=$(bash "$BRIDGE" 2>&1); urc=$?
b=$(bash "$BRIDGE" repo title /nope.md 2>&1); brc=$?
s=$(COS_SNAPSHOT="$FIX/empty-snap.json" bash "$BRIDGE" kinkypuppies.store "T" "$FIX/body.md" 2>&1); src=$?
{ [ $urc -eq 64 ] || [ $urc -eq 1 ]; } && [ $brc -eq 1 ] && [ $src -eq 5 ] \
  && echo "$s" | grep -q "not in active snapshot" && t_pass || t_fail "urc=$urc brc=$brc src=$src"

# ── CS10 malformed brief rejected (negative) ────────────────────────────────
t_start "CS10 malformed brief output rejected rc=11"
out=$(MOCK_BAD=1 run_cos cs10); rc=$?
[ $rc -eq 11 ] && t_pass || t_fail "rc=$rc out=$(echo "$out"|tail -2)"

# ── CS11 timeout enforcement (negative) ─────────────────────────────────────
t_start "CS11 hard timeout kills runaway generation"
COS_T=3 out=$(MOCK_SLOW=1 run_cos cs11); rc=$?
{ [ $rc -eq 9 ] || [ $rc -eq 137 ] || [ $rc -eq 143 ]; } && t_pass || t_fail "rc=$rc"

# ── CS12 production config integrity (meta) ─────────────────────────────────
t_start "CS12 staff roster + repos config integrity"
n=$(awk -F'|' 'NF>2 && $1 !~ /^#/' "$ROSTER" | wc -l | tr -d " ")
badch=$(awk -F'|' 'NF>2 && $1 !~ /^#/ && $2 !~ /^#[a-z-]+\|?/' "$ROSTER" | wc -l | tr -d " ")
has_settings=$(grep -c "^push_window_days=" "$REPOCFG")
has_block=$(grep -c "^BLOCKLIST" "$REPOCFG")
[ "$n" -ge 5 ] && [ "$badch" = "0" ] && [ "$has_settings" = "1" ] && [ "$has_block" = "1" ] \
  && t_pass || t_fail "agents=$n badchan=$badch settings=$has_settings block=$has_block"

echo
echo "== chief-of-staff battery: $PASS passed, $FAIL failed =="
[ $FAIL -eq 0 ]
