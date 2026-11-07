#!/usr/bin/env bash
# test-product-intel.sh — automated L0/L1 test battery for the product-intel agent.
# Runs entirely on mocks/temp dirs: safe to execute at ANY time of day, never touches
# live Buzz/Qwen/Obsidian. Real-model E2E (night window) is documented in
# docs/ops/test-product-intel.md (TP17) and run via FORCE=1 after 00:45.
#
# Usage: ops/bin/test-product-intel.sh [-v]
set -u
WS_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RUNNER="$WS_DIR/ops/bin/run-product-intel.sh"
MOCK="$WS_DIR/ops/tests/fixtures/mock-hermes.sh"
REAL_CFG="$WS_DIR/ops/config/product-intel-targets.txt"
TPL="$WS_DIR/ops/agents/product-intel.md"
KB_REAL="$WS_DIR/docs/ops/intel/knowledge-base"
FIXDIR="$(mktemp -d /tmp/product-intel-test.XXXXXX)"
TODAY=$(date +%F)
VERBOSE="${1:-}"

PASS=0; FAIL=0; CURRENT=""

say() { [ "$VERBOSE" = "-v" ] && echo "    $*"; }
t_start() { CURRENT="$1"; say ""; say "▶ $1"; }
t_pass() { PASS=$((PASS+1)); echo "PASS $CURRENT"; }
t_fail() { FAIL=$((FAIL+1)); echo "FAIL $CURRENT — $*"; }

cleanup() { rm -rf "$FIXDIR"; }
trap cleanup EXIT

fresh_kb()  { cp -R "$KB_REAL" "$FIXDIR/kb-$1"; }
fresh_cfg() { printf 'Protecto|https://www.protecto.ai/|competitor\nTrueFoundry|https://www.truefoundry.com/|partner-candidate\n' > "$FIXDIR/targets-$1.txt"; }
fresh_state(){ mkdir -p "$FIXDIR/state-$1"; echo "$FIXDIR/state-$1"; }

run_cycle() { # run_cycle <tag> [extra env as KEY=val...]
  local tag="$1"; shift
  local sdir; sdir=$(fresh_state "$tag")
  fresh_kb "$tag"; fresh_cfg "$tag"
  env FORCE=1 DRYRUN=1 \
      TARGETS_CFG="$FIXDIR/targets-$tag.txt" \
      KB_DIR="$FIXDIR/kb-$tag" \
      STATE_DIR="$sdir" \
      RESEARCH_DIR="$FIXDIR/research-$tag" \
      OBSIDIAN_DIR="$FIXDIR/obsidian-$tag" \
      HERMES_BIN="$MOCK" \
      "$@" "$RUNNER" 2>&1
}

# ── TP01 day-window refusal (negative) ────────────────────────────────────────
t_start "TP01 window refusal (no FORCE outside 00–06h)"
h=$(date +%H)
if [ "$h" -ge 0 ] && [ "$h" -le 6 ]; then
  echo "SKIP TP01 (inside night window — refusal path not exercisable now)"
else
  out=$(env -u FORCE "$RUNNER" 2>&1); rc=$?
  [ $rc -eq 5 ] && echo "$out" | grep -q "outside night window" && t_pass || t_fail "rc=$rc out=$out"
fi

# ── TP02 empty target list refusal (negative) ────────────────────────────────
t_start "TP02 empty target list refusal"
sdir=$(fresh_state tp02); : > "$FIXDIR/empty.txt"
out=$(FORCE=1 DRYRUN=1 TARGETS_CFG="$FIXDIR/empty.txt" STATE_DIR="$sdir" HERMES_BIN="$MOCK" "$RUNNER" 2>&1); rc=$?
[ $rc -eq 3 ] && t_pass || t_fail "rc=$rc out=$out"

# ── TP03 missing config file refusal (negative) ──────────────────────────────
t_start "TP03 missing target config refusal"
sdir=$(fresh_state tp03)
out=$(FORCE=1 DRYRUN=1 TARGETS_CFG="$FIXDIR/nonexistent.txt" STATE_DIR="$sdir" HERMES_BIN="$MOCK" "$RUNNER" 2>&1); rc=$?
[ $rc -eq 3 ] && t_pass || t_fail "rc=$rc"

# ── TP04 stale lock refusal (negative) ───────────────────────────────────────
t_start "TP04 lock-file mutual exclusion"
sdir=$(fresh_state tp04); touch "$sdir/product-intel.lock"
out=$(FORCE=1 DRYRUN=1 TARGETS_CFG="$REAL_CFG" STATE_DIR="$sdir" HERMES_BIN="$MOCK" "$RUNNER" 2>&1); rc=$?
[ $rc -eq 8 ] && t_pass || t_fail "rc=$rc out=$out"

# ── TP05 prompt composition ──────────────────────────────────────────────────
t_start "TP05 prompt placeholders fully substituted + target list injected"
out=$(FORCE=1 DRYRUN=1 DEEP=1 TARGETS_CFG="$REAL_CFG" STATE_DIR="$(fresh_state tp05)" \
  KB_DIR="$(fresh_kb tp10; echo "$FIXDIR/kb-tp10")" RESEARCH_DIR="$FIXDIR/r05" OBSIDIAN_DIR="$FIXDIR/o05" TIMEOUT_SECS=30 \
  HERMES_BIN=/bin/true "$RUNNER" 2>&1)   # /bin/true writes nothing → run fails validation, prompt file remains
PROMPT="$(fresh_state tp05)/product-intel.prompt"
leftovers=$(grep -cE '\{(MODE|DATE|KB_DIR|TARGETS_LIST)\}' "$PROMPT")
if [ "$leftovers" = "0" ] && grep -q '^MODE: DEEP' "$PROMPT" \
   && grep -q 'Protecto|https://www.protecto.ai/|competitor' "$PROMPT" \
   && grep -q 'TrueFoundry|https://www.truefoundry.com/|partner-candidate' "$PROMPT"; then
  t_pass
else
  t_fail "leftovers=$leftovers or list injection failed"
fi

# ── TP06 guardrail clauses present in agent template ─────────────────────────
t_start "TP06 injection-resistance + approval-gate + read-only clauses"
if grep -qi "injection" "$TPL" && grep -q "must NOT add them to targets.json" "$TPL" \
   && grep -q "READ-ONLY on the web" "$TPL" && grep -q '\[UNVERIFIED\]' "$TPL"; then
  t_pass
else
  t_fail "one or more guardrail clauses missing from $TPL"
fi

# ── TP07 knowledge-base schema validation ────────────────────────────────────
t_start "TP07 KB schema: frontmatter dims valid against taxonomy; matrix completeness"
python3 - "$KB_REAL" <<'PY' && t_pass || t_fail "schema violations listed above"
import sys, re, pathlib, json
kb = pathlib.Path(sys.argv[1])
tax_text = (kb/"taxonomy.yaml").read_text()
tax_keys = set(re.findall(r'^ {6}(\w+):\s', tax_text, re.M))
clusters = set(re.findall(r'^ {2}([a-z-]+):\s*"', tax_text, re.M))
errors = []
for prof in sorted((kb/"vendors").glob("*.md")):
    txt = prof.read_text()
    m = re.match(r'^---\n(.*?)\n---', txt, re.S)
    if not m: errors.append(f"{prof.name}: no frontmatter"); continue
    fm = m.group(1)
    cl = re.search(r'^cluster:\s*(.+)$', fm, re.M)
    if not cl: errors.append(f"{prof.name}: no cluster")
    elif cl.group(1).strip() not in clusters:
        errors.append(f"{prof.name}: unknown cluster '{cl.group(1).strip()}'")
    feats = dict(re.findall(r'^  (\w+):\s*(none|partial|full|unverified)\s*$', fm, re.M))
    if len(feats) < 10: errors.append(f"{prof.name}: feature map too small ({len(feats)} parsed)")
    for k in feats:
        if k not in tax_keys: errors.append(f"{prof.name}: dim '{k}' not in taxonomy")
    for req in ("last_profiled", "url", "positioning"):
        if req + ":" not in fm: errors.append(f"{prof.name}: frontmatter missing {req}")
    if "Sources" not in txt: errors.append(f"{prof.name}: no Sources section")
own = (kb/"own-products.md").read_text()
for p in ("PrivacyScrubber", "AI-Protect"):
    if f"## {p}" not in own: errors.append(f"own-products.md missing section {p}")
reg = json.loads((kb/"targets.json").read_text())
if not reg.get("targets"): errors.append("targets.json empty")
matrix = (kb/"comparison-matrix.md").read_text()
for t in reg["targets"]:
    if t["name"] not in matrix: errors.append(f"comparison matrix missing target {t['name']}")
if errors:
    print("\n".join(errors)); raise SystemExit(1)
PY

# ── TP08 mock cycle E2E: virgin state must auto-select DEEP + publish ────────
t_start "TP08 mock first-run auto-DEEP E2E + Obsidian publish + candidates"
out=$(run_cycle tp08); rc=$?
if [ $rc -eq 0 ] && echo "$out" | grep -q "PASS product-intel \[DEEP\]" \
   && [ -f "$FIXDIR/obsidian-tp08/${TODAY}-product-intel.md" ] \
   && [ -f "$FIXDIR/kb-tp08/candidates/${TODAY}-candidates.md" ] \
   && grep -q '"last_deep": "'"$TODAY"'"' "$FIXDIR/state-tp08/product-intel-state.json"; then
  t_pass; say "$out" | tail -3
else
  t_fail "rc=$rc out=$out"
fi

# ── TP09 mock LIGHT cycle E2E (deep ran today → LIGHT expected) ──────────────
t_start "TP09 mock LIGHT cycle E2E (delta note + state update)"
sdir=$(fresh_state tp09)
python3 -c "
import json, datetime as dt
t = dt.date.today().isoformat()
json.dump({'last_light': t, 'last_deep': t}, open('$sdir/product-intel-state.json', 'w'))
"
fresh_kb tp09; fresh_cfg tp09
out=$(env FORCE=1 DRYRUN=1 TARGETS_CFG="$FIXDIR/targets-tp09.txt" KB_DIR="$FIXDIR/kb-tp09" \
  STATE_DIR="$sdir" RESEARCH_DIR="$FIXDIR/research-tp09" OBSIDIAN_DIR="$FIXDIR/o09" \
  HERMES_BIN="$MOCK" "$RUNNER" 2>&1); rc=$?
if [ $rc -eq 0 ] && echo "$out" | grep -q "PASS product-intel \[LIGHT\]" \
   && grep -q "^## Product Intel Delta — $TODAY" "$FIXDIR/research-tp09/${TODAY}-product-intel-delta.md" \
   && grep -q '"last_light": "'"$TODAY"'"' "$sdir/product-intel-state.json"; then
  t_pass
else
  t_fail "rc=$rc out=$out"
fi

# ── TP10 cadence boundary: last_deep = today-3 → auto-DEEP ───────────────────
t_start "TP10 cadence boundary (day 3 triggers deep)"
sdir=$(fresh_state tp10)
python3 -c "
import json, datetime as dt
d = (dt.date.today()-dt.timedelta(days=3)).isoformat()
json.dump({'last_light': d, 'last_deep': d}, open('$sdir/product-intel-state.json', 'w'))
"
out=$(FORCE=1 DRYRUN=1 TARGETS_CFG="$REAL_CFG" KB_DIR="$(fresh_kb tp11; echo "$FIXDIR/kb-tp11")" STATE_DIR="$sdir" \
  RESEARCH_DIR="$FIXDIR/r10" OBSIDIAN_DIR="$FIXDIR/o10" HERMES_BIN="$MOCK" "$RUNNER" 2>&1); rc=$?
echo "$out" | grep -q "\[DEEP\]" && [ $rc -eq 0 ] && t_pass || t_fail "expected auto-DEEP rc=0, got rc=$rc: $(echo "$out" | tail -2)"

# ── TP11 cadence boundary: last_deep = today-2 → stays LIGHT ─────────────────
t_start "TP11 cadence boundary (day 2 stays light)"
sdir=$(fresh_state tp11)
python3 -c "
import json, datetime as dt
d = (dt.date.today()-dt.timedelta(days=2)).isoformat()
json.dump({'last_light': d, 'last_deep': d}, open('$sdir/product-intel-state.json', 'w'))
"
out=$(FORCE=1 DRYRUN=1 TARGETS_CFG="$REAL_CFG" KB_DIR="$(fresh_kb tp13; echo "$FIXDIR/kb-tp13")" STATE_DIR="$sdir" \
  RESEARCH_DIR="$FIXDIR/r11" OBSIDIAN_DIR="$FIXDIR/o11" HERMES_BIN="$MOCK" "$RUNNER" 2>&1); rc=$?
echo "$out" | grep -q "\[LIGHT\]" && [ $rc -eq 0 ] && t_pass || t_fail "expected LIGHT rc=0, got rc=$rc: $(echo "$out" | tail -2)"

# ── TP12 malformed agent output rejected (negative) ──────────────────────────
t_start "TP12 malformed output rejected with rc=11"
out=$(env FORCE=1 DRYRUN=1 MOCK_BAD=1 \
  TARGETS_CFG="$REAL_CFG" KB_DIR="$(fresh_kb tp12; echo "$FIXDIR/kb-tp12")" STATE_DIR="$(fresh_state tp12)" \
  RESEARCH_DIR="$FIXDIR/r12" OBSIDIAN_DIR="$FIXDIR/o12" HERMES_BIN="$MOCK" "$RUNNER" 2>&1); rc=$?
[ $rc -eq 11 ] && t_pass || t_fail "rc=$rc out=$out"

# ── TP13 hermes crash propagates (negative) ──────────────────────────────────
t_start "TP13 hermes nonzero exit propagates rc=10"
out=$(env FORCE=1 DRYRUN=1 MOCK_FAIL=1 TARGETS_CFG="$REAL_CFG" KB_DIR="$(fresh_kb tp14; echo "$FIXDIR/kb-tp14")" \
  STATE_DIR="$(fresh_state tp13)" RESEARCH_DIR="$FIXDIR/r13" OBSIDIAN_DIR="$FIXDIR/o13" \
  HERMES_BIN="$MOCK" "$RUNNER" 2>&1); rc=$?
{ [ $rc -eq 10 ] || [ $rc -eq 7 ]; } && t_pass || t_fail "rc=$rc out=$out"

# ── TP14 hard timeout enforced (negative, fast) ──────────────────────────────
t_start "TP14 hard timeout kills runaway run (TIMEOUT_SECS=3)"
out=$(env FORCE=1 DRYRUN=1 MOCK_SLOW=1 TIMEOUT_SECS=3 TARGETS_CFG="$REAL_CFG" KB_DIR="$(fresh_kb tp14; echo "$FIXDIR/kb-tp14")" \
  STATE_DIR="$(fresh_state tp14)" RESEARCH_DIR="$FIXDIR/r14" OBSIDIAN_DIR="$FIXDIR/o14" \
  HERMES_BIN="$MOCK" "$RUNNER" 2>&1); rc=$?
{ [ $rc -eq 9 ] || [ $rc -eq 137 ] || [ $rc -eq 143 ]; } && t_pass || t_fail "rc=$rc out=$out"

# ── TP15 intel-add-target.sh happy path + guards ─────────────────────────────
t_start "TP15 target registration: happy path, duplicate refusal, bad type"
ADD="$WS_DIR/ops/bin/intel-add-target.sh"
export INTEL_CFG="$FIXDIR/reg-targets.txt" INTEL_TJSON="$FIXDIR/reg-targets.json"
cp "$REAL_CFG" "$INTEL_CFG"; cp "$KB_REAL/targets.json" "$INTEL_TJSON"
ok1=0
"$ADD" "LayerX Security" "https://layerxsecurity.com/" competitor >/dev/null 2>&1 \
  && grep -qF 'LayerX Security|https://layerxsecurity.com/|competitor' "$INTEL_CFG" \
  && python3 -c "
import json; d=json.load(open('$INTEL_TJSON'))
assert any(t['name']=='LayerX Security' for t in d['targets'])" && ok1=1
dup_out=$("$ADD" "LayerX Security" "https://layerxsecurity.com/" competitor 2>&1); dup_rc=$?
bad_out=$("$ADD" "X" "https://x.example/" rival 2>&1); bad_rc=$?
if [ $ok1 -eq 1 ] && [ $dup_rc -ne 0 ] && echo "$dup_out" | grep -q "already registered" \
   && [ $bad_rc -ne 0 ] && echo "$bad_out" | grep -q "type must be"; then
  t_pass
else
  t_fail "ok1=$ok1 dup_rc=$dup_rc type_rc=$bad_rc"
fi

# ── TP16 buzz dry-run: DRYRUN never opens a relay connection ─────────────────
t_start "TP16 DRYRUN never contacts Buzz relay even with posting enabled"
out=$(env BUZZ_POST_DIGESTS=1 BUZZ_RELAY_URL="ws://127.0.0.1:1" FORCE=1 DRYRUN=1 \
  TARGETS_CFG="$REAL_CFG" KB_DIR="$(fresh_kb tp16; echo "$FIXDIR/kb-tp16")" STATE_DIR="$(fresh_state tp16)" \
  RESEARCH_DIR="$FIXDIR/r16" OBSIDIAN_DIR="$FIXDIR/o16" HERMES_BIN="$MOCK" "$RUNNER" 2>&1); rc=$?
[ $rc -eq 0 ] && echo "$out" | grep -q "buzz post skipped" && t_pass || t_fail "rc=$rc out=$out"

# ── TP17 real config integrity ───────────────────────────────────────────────
t_start "TP17 production config integrity (5 targets, valid pipe format)"
n=$(grep -vc '^#\|^$' "$REAL_CFG")
m=$(grep -v '^#\|^$' "$REAL_CFG" | grep -cvE '^[^|]+\|https?://[^|]+\|(competitor|partner-candidate)$')
[ "$n" -ge 5 ] && [ "$m" = "0" ] && t_pass || t_fail "targets=$n malformed=$m"

echo
echo "== product-intel battery: $PASS passed, $FAIL failed =="
[ $FAIL -eq 0 ]
