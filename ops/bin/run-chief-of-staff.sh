#!/usr/bin/env bash
# run-chief-of-staff.sh — nightly Chief-of-Staff cycle (Morning Brief generator + approval bridge).
#
# Phases:
#   0 HARVEST  — check ✅/❌ reactions on open feature proposals in #approvals; create GitHub
#                issues for approved ones; write outcomes to run/cos-harvest.json (input for brief)
#   1 INPUTS   — dump Buzz channels since last run → run/cos-inputs/buzz-<ch>.txt;
#                CRM company list; cos-github-sweep.sh snapshot
#   2 GENERATE — compose prompt from ops/agents/chief-of-staff.md, run hermes chief-of-staff (-t web,file)
#           Primary: ternary-bonsai-2-27b:q2_0 (Ollama @11434, proxied to :8555) → fallback same
#   3 VALIDATE — enforce Morning Brief section contract + ≥3 proposal blocks
#   4 PUBLISH  — research dir + Obsidian Intelligence/Morning-Brief/ + Buzz #morning-brief + notify
#   5 PROPOSE  — parse Proposal blocks → post each to #approvals → track in run/cos-proposals.jsonl
#
# Env overrides (testing): FORCE DRYRUN HERMES_BIN TIMEOUT_SECS COS_SINCE_DAYS
#   BUZZ_DUMP=0 skip channel dumps · GH_SWEEP=0 skip github sweep · OBSIDIAN_DIR STATE_DIR
set -u
# launchd runs agents with a minimal PATH — ensure hermes & tooling are found.
export PATH="$HOME/.local/bin:$HOME/.hermes/hermes-agent/venv/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
HERMES_BIN="${HERMES_BIN:-$(command -v hermes 2>/dev/null || echo "$HOME/.local/bin/hermes")}"
if [ ! -x "$HERMES_BIN" ] && [ -x "$HOME/.hermes/hermes-agent/venv/bin/hermes" ]; then HERMES_BIN="$HOME/.hermes/hermes-agent/venv/bin/hermes"; fi
OPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# Model routing — locked 2026-10-11
[ -f "$OPS_DIR/config/model.env" ] && source "$OPS_DIR/config/model.env"
PRIMARY_MODEL_ID="${PRIMARY_MODEL_ID:-ternary-bonsai-2-27b:q2_0}"
PRIMARY_BASE_URL="${PRIMARY_BASE_URL:-http://127.0.0.1:8555/v1}"
FALLBACK_MODEL_ID="${FALLBACK_MODEL_ID:-ternary-bonsai-2-27b:q2_0}"
FALLBACK_BASE_URL="${FALLBACK_BASE_URL:-http://127.0.0.1:8555/v1}"
# Load Buzz posting defaults (BUZZ_RELAY_URL, BUZZ_POST_DIGESTS=1).
[ -f "$OPS_DIR/config/buzz.env" ] && source "$OPS_DIR/config/buzz.env"
WS_DIR="$(cd "$OPS_DIR/.." && pwd)"
AGENT="chief-of-staff"
TPL="$OPS_DIR/agents/$AGENT.md"
[ -f "$TPL" ] || { echo "FAIL template missing"; exit 64; }

RUN_DIR="${STATE_DIR:-$OPS_DIR/run}"; mkdir -p "$RUN_DIR"
LOCK="$RUN_DIR/$AGENT.lock"
LOG="$RUN_DIR/$AGENT.log"
TODAY=$(date +%F)
INPUTS="$RUN_DIR/cos-inputs-$TODAY"; mkdir -p "$INPUTS"
PROPOSAL_DIR="$RUN_DIR/cos-proposals"; mkdir -p "$PROPOSAL_DIR"
JSONL="$PROPOSAL_DIR/proposals.jsonl"
HARVEST="$RUN_DIR/cos-harvest-$TODAY.json"
RESEARCH="${RESEARCH_DIR:-$WS_DIR/docs/ops/research}"
OBSIDIAN_DIR="${OBSIDIAN_DIR:-$HOME/Documents/Obsidian Vault/Intelligence/Morning-Brief}"
ROSTER_PATH="${ROSTER_PATH:-$OPS_DIR/config/cos-staff.txt}"
GH_SNAPSHOT="${COS_SNAPSHOT:-$RUN_DIR/cos-github-snapshot.json}"
KB_MATRIX="$WS_DIR/docs/ops/intel/knowledge-base/comparison-matrix.md"
TIMEOUT_SECS="${TIMEOUT_SECS:-2700}"
COS_SINCE_DAYS="${COS_SINCE_DAYS:-1}"
OWNER_PUBKEY="${COS_OWNER_PUBKEY:-f4e3cc091edcadf4ac0e5a36e1d996f643f7d4c9a1993daeed59977d8326687f}"
CHANNELS="night-runs competitors customers partners product-intel approvals crm-sync incidents morning-brief"

log() { echo "[$(date +%F_%T)] $*" >>"$LOG"; }

# --- kanban lifecycle (graceful; disabled in DRYRUN to keep tests hermetic) ---
KB="$OPS_DIR/bin/kanban.sh"; CARD=""
if [ -x "$KB" ] && [ "${DRYRUN:-0}" != "1" ]; then
  kb_done()   { [ -n "$CARD" ] && "$KB" done "$CARD" >/dev/null 2>&1 || true; }
  kb_fail()   { [ -n "$CARD" ] && "$KB" fail "$CARD" "$1" >/dev/null 2>&1 || true; }
  kb_begin() { # adopt tonight's queued card or create one; sets CARD
    local t="night-run: $AGENT $(date +%F)" cid
    cid=$("$KB" latest --agent "$AGENT" 2>/dev/null || true)
    if [ -n "$cid" ] && "$KB" get "$cid" 2>/dev/null | grep -q "^title=$t\$"; then
      CARD="$cid"; "$KB" set "$CARD" --lane running >/dev/null 2>&1 || true
    else
      CARD=$("$KB" create --agent "$AGENT" --title "$t" --spec "Morning Brief cycle" \
        --lane running --created-by "run-$AGENT" 2>/dev/null || true)
    fi
  }
else
  kb_done() { :; }; kb_fail() { :; }; kb_begin() { :; }
fi

# ── window + lock + preflight ────────────────────────────────────────────────
h=$(date +%H)
if [ "${FORCE:-0}" != "1" ]; then
  [ $h -ge 0 ] && [ $h -le 6 ] || { echo "FAIL outside night window (hour=$h)"; exit 5; }
fi
[ -e "$LOCK" ] && { echo "FAIL already running/stale lock"; exit 8; }
if [ -f "$LOCK" ]; then find "$LOCK" -mmin +90 -exec rm -f {} \; 2>/dev/null || true; fi
trap 'rm -f "$LOCK"; kb_fail "signal/early-exit after $SECONDS s (slow-model)" 2>/dev/null || true' EXIT ERR TERM
touch "$LOCK"
if [ "${DRYRUN:-0}" != "1" ]; then
  if "$OPS_DIR/bin/model-check.sh" "$PRIMARY_BASE_URL" "$PRIMARY_MODEL_ID" >/dev/null; then
    echo "pre-flight: primary $PRIMARY_MODEL_ID PASS ($PRIMARY_BASE_URL)"
  else
    echo "WARN ollama $PRIMARY_MODEL_ID not serving — checking fallback $FALLBACK_MODEL_ID ($FALLBACK_BASE_URL)"
    if ! "$OPS_DIR/bin/model-check.sh" "$FALLBACK_BASE_URL" "$FALLBACK_MODEL_ID" >/dev/null; then
      echo "WARN neither primary nor fallback serving — hermes profile fallback_model will be tried"; log "warn: both models down"
    else
      echo "pre-flight: fallback $FALLBACK_MODEL_ID PASS"; log "warn: primary down, fallback up"
    fi
  fi
fi

SINCE_TS=$(python3 -c "import datetime as dt;print(int((dt.datetime.now()-dt.timedelta(days=$COS_SINCE_DAYS)).timestamp()))")

kb_begin

# ─── PHASE 0: HARVEST approvals ──────────────────────────────────────────────
echo "--- [$AGENT] phase 0: harvest approvals ---"
python3 - "$JSONL" "$HARVEST" "$OWNER_PUBKEY" "${DRYRUN:-0}" <<'PY'
import json, os, subprocess, sys
jsonl, out_path, owner, dry = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
def buzz(key_env, *args):
    if dry == "1":
        return None
    env = dict(os.environ)
    env["BUZZ_PRIVATE_KEY"] = key_env
    r = subprocess.run(["buzz", *args], capture_output=True, text=True, env=env)
    return json.loads(r.stdout) if r.returncode == 0 and r.stdout.strip() else None
key = os.environ.get("KEY_chief_of_staff", "")
results = []
if os.path.exists(jsonl):
    lines = [json.loads(l) for l in open(jsonl) if l.strip()]
else:
    lines = []
for p in lines:
    if p.get("status") != "open": continue
    rx = buzz(key, "reactions", "get", "--event", p["event_id"]) or {"reactions": []}
    verdict = None
    for r in rx.get("reactions", []):
        actors = [pk for pk in r.get("pubkeys", []) if not pk.startswith(p.get("self_pubkey","")[:16])]
        if r["emoji"] in ("✅","👍") and actors: verdict = "approved"
        elif r["emoji"] in ("❌","👎") and actors and not verdict: verdict = "rejected"
    entry = dict(p); entry["verdict"] = verdict or "pending"
    results.append(entry)
json.dump({"harvested_at": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
           "proposals": results}, open(out_path,"w"), indent=2)
print(f"harvest: {len(results)} open proposals checked")
PY

# act on approvals (needs live relay + gh) unless DRYRUN
if [ "${DRYRUN:-0}" != "1" ]; then
  source "$OPS_DIR/secrets/agent-keys.env"
  export BUZZ_RELAY_URL="${BUZZ_RELAY_URL:-http://localhost:3010}"
  python3 - "$HARVEST" "$JSONL" <<'PY'
import json, subprocess, sys, os
harvest, jsonl = sys.argv[1], sys.argv[2]
data = json.load(open(harvest))
changed = False
for e in data.get("proposals", []):
    if e.get("verdict") != "approved" or e.get("issue_url"): continue
    repo = e.get("repo"); body = e.get("body_file")
    if not repo or repo == "unassigned" or not body or not os.path.exists(body):
        continue
    r = subprocess.run(["bash", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(jsonl))),
                       "../bin/cos-feature-to-github.sh"), repo, e["title"], body,
                       e.get("labels","chief-of-staff,feature-proposal")], capture_output=True, text=True)
    line = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ""
    if line.startswith(("CREATED", "EXISTS")):
        e["issue_url"] = line.split()[1]; e["status"] = "issued"; changed = True
        ch = os.environ.get("COS_APPROVALS_CH_ID","")
        if ch:
            subprocess.run(["buzz","messages","send","--channel",ch,"--reply-to",e["event_id"],
                            "--content", f"Issue created: {e['issue_url']}"],
                           capture_output=True, env={**os.environ,"BUZZ_PRIVATE_KEY":os.environ.get("KEY_chief_of_staff","")})
    elif line.startswith("FAIL"):
        e["status"] = "failed"; e["error"] = line[:200]; changed = True
json.dump(data, open(harvest,"w"), indent=2)
if changed:
    lines=[json.dumps(json.loads(l)) for l in open(jsonl) if l.strip()]
    byid={json.loads(l)["event_id"]: json.loads(l) for l in lines}
    for e in data["proposals"]:
        if e["event_id"] in byid: byid[e["event_id"]] = e
    open(jsonl,"w").write("\n".join(json.dumps(v) for v in byid.values())+"\n")
PY
fi
[ -f "$HARVEST" ] || printf '{"proposals":[]}' > "$HARVEST"

# ─── PHASE 1: INPUTS ─────────────────────────────────────────────────────────
echo "--- [$AGENT] phase 1: inputs ---"
if [ "${BUZZ_DUMP:-1}" = "1" ] && [ "${DRYRUN:-0}" != "1" ]; then
  source "$OPS_DIR/secrets/agent-keys.env"
  export BUZZ_RELAY_URL="${BUZZ_RELAY_URL:-http://localhost:3010}"
  for CH in $CHANNELS; do
    CID=$(BUZZ_PRIVATE_KEY="$KEY_chief_of_staff" buzz channels list 2>/dev/null \
      | python3 -c "import json,sys
try:
  [print(c['channel_id']) for c in json.load(sys.stdin) if c.get('name')=='$CH']
except Exception: pass" | head -1)
    [ -n "$CID" ] || continue
    BUZZ_PRIVATE_KEY="$KEY_chief_of_staff" buzz messages get --channel "$CID" --since "$SINCE_TS" --limit 60 2>/dev/null \
      | python3 -c "
import json,sys,datetime as dt
try: msgs=json.load(sys.stdin)
except Exception: msgs=[]
out=[]
for m in msgs[:60]:
    ts=dt.datetime.fromtimestamp(m.get('created_at',0)).strftime('%m-%d %H:%M')
    out.append(f\"[{ts}] {m.get('pubkey','?')[:12]}: {(m.get('content') or '')[:800]}\")
print('\n'.join(out) if out else '(no messages in window)')" > "$INPUTS/buzz-$CH.txt"
  done
  echo "  buzz dumps: $(ls "$INPUTS" | wc -l | tr -d ' ') channels"
else
  for CH in $CHANNELS; do echo "(dryrun placeholder)" > "$INPUTS/buzz-$CH.txt"; done
fi

K=$(grep '^TWENTY_API_KEY=' "$WS_DIR/.env" | cut -d= -f2 || true)
if [ -n "${K:-}" ] && [ "${DRYRUN:-0}" != "1" ]; then
  curl -sf -m 15 -X POST http://127.0.0.1:3000/graphql -H "Authorization: Bearer $K" \
    -H 'Content-Type: application/json' \
    -d '{"query":"{ companies { edges { node { name } } } }"}' 2>/dev/null \
    | python3 -c "import json,sys
try:
  d=json.load(sys.stdin)
  print('\n'.join(sorted({e['node']['name'] for e in d['data']['companies']['edges'] if e['node'].get('name')})))
except Exception: print('(crm unavailable)')" > "$INPUTS/crm-companies.txt" \
    || echo "(crm unavailable)" > "$INPUTS/crm-companies.txt"
else
  echo "(dryrun placeholder)" > "$INPUTS/crm-companies.txt"
fi

if [ "${GH_SWEEP:-1}" = "1" ] && [ "${DRYRUN:-0}" != "1" ]; then
  COS_SINCE_DAYS="$COS_SINCE_DAYS" "$OPS_DIR/bin/cos-github-sweep.sh" >/dev/null 2>&1 || true
fi
[ -f "$GH_SNAPSHOT" ] || printf '{"repos":[]}' > "$GH_SNAPSHOT"

PREV_BRIEF=$(ls -t "$RESEARCH"/2*-chief-of-staff.md 2>/dev/null | head -1)
[ -n "$PREV_BRIEF" ] || PREV_BRIEF="(none yet)"

# kanban board snapshot as fleet-run evidence for §5
KANBAN_FILE="$INPUTS/kanban-board.txt"
if [ -x "$KB" ] && [ "${DRYRUN:-0}" != "1" ]; then
  "$KB" list > "$KANBAN_FILE" 2>/dev/null || echo "(kanban unavailable)" > "$KANBAN_FILE"
else
  echo "(dryrun placeholder)" > "$KANBAN_FILE"
fi

# ─── PHASE 2: GENERATE ───────────────────────────────────────────────────────
echo "--- [$AGENT] phase 2: generate brief ---"
PROMPT_FILE="$RUN_DIR/$AGENT.prompt"
python3 - "$TPL" "$PROMPT_FILE" "$TODAY" "$ROSTER_PATH" "$INPUTS" "$HARVEST" "$GH_SNAPSHOT" \
  "$INPUTS/crm-companies.txt" "$KB_MATRIX" "$PREV_BRIEF" "$KANBAN_FILE" <<'PY'
import sys
args = sys.argv[1:]
tpl_path, out, today, roster, buzzd, harvest, ghsnap, crm, kb, prev, kanban = args
tpl = open(tpl_path).read()
txt = (tpl.replace("{DATE}", today).replace("{ROSTER_PATH}", roster)
          .replace("{BUZZ_DIR}", buzzd).replace("{HARVEST_FILE}", harvest)
          .replace("{GH_SNAPSHOT}", ghsnap).replace("{CRM_FILE}", crm)
          .replace("{KB_MATRIX}", kb).replace("{PREV_BRIEF}", prev)
          .replace("{KANBAN_FILE}", kanban))
open(out, "w").write(txt)
PY
[ -s "$PROMPT_FILE" ] || { echo "FAIL prompt composition produced empty file"; kb_fail "prompt composition empty"; exit 12; }

OUT_FILE="$RESEARCH/${TODAY}-chief-of-staff.md"
# Resource-aware hermes invocation: 2700s budget + TERM→KILL + one retry on gateway blip
# Profile: chief-of-staff (primary ternary-bonsai-2-27b:q2_0 @8555 via Ollama proxy, fallback same via fallback_model)
_run_once() {
  "$HERMES_BIN" --profile chief-of-staff chat --query-file "$PROMPT_FILE" -Q -t web,file \
    > "$OUT_FILE" 2>>"$LOG" &
  H_PID=$!
  ( sleep "$TIMEOUT_SECS" && kill -TERM "$H_PID" 2>/dev/null; sleep 30; kill -9 "$H_PID" 2>/dev/null ) >/dev/null 2>&1 & WATCHDOG=$!
  set +e
  wait "$H_PID"; rc=$?
  kill "$WATCHDOG" 2>/dev/null; wait "$WATCHDOG" 2>/dev/null
  # NOTE: stay non-errexit — the retry loop maps rc explicitly (see run-night-agent.sh).
  set +e
  return $rc
}
rc=0
for attempt in 1 2; do
  _run_once; rc=$?
  [ $rc -eq 0 ] && break
  if [ $rc -eq 124 ] || [ $rc -eq 137 ] || [ $rc -eq 143 ]; then
    echo "WARN chief-of-staff timed out attempt $attempt — retrying after gateway probe"
    curl -sf -m 5 http://127.0.0.1:8642/health >/dev/null 2>&1 || echo "WARN gateway not healthy before retry"
    sleep $((attempt*10))
    continue
  fi
  if [ $rc -eq 127 ]; then
    echo "FAIL hermes binary not found at $HERMES_BIN"; kb_fail "hermes binary not found at $HERMES_BIN rc=127"; exit 10
  fi
  if [ $rc -ne 0 ] && [ $attempt -eq 1 ]; then
    echo "WARN hermes exited rc=$rc — retrying after 20s (gateway backoff)"
    sleep 20
    continue
  fi
  break
done
{ [ $rc -eq 124 ] || [ $rc -eq 137 ] || [ $rc -eq 143 ]; } && { echo "FAIL timeout after ${TIMEOUT_SECS}s (attempts exhausted)"; kb_fail "timeout after ${TIMEOUT_SECS}s (slow-model)"; exit 9; }
[ $rc -ne 0 ] && { echo "FAIL hermes exited rc=$rc (see $LOG)"; kb_fail "hermes exited rc=$rc"; exit 10; }

# ─── PHASE 3: VALIDATE (+ auto-recover proposals) ────────────────────────
echo "--- [$AGENT] phase 3: validate ---"
# Fleet report must mention every roster agent (soft: warn, don't hard-fail for as-run agents)
while IFS='|' read -r _aname _ach _acad _adir; do
  case "$_aname" in ''|'#'*) continue;; esac
  grep -qi "$_aname" "$OUT_FILE" || echo "WARN fleet report missing agent: $_aname (soft)"
done < "$ROSTER_PATH"

NPROP=$(grep -c '^### Proposal P' "$OUT_FILE" || true)
if [ "$NPROP" -lt 3 ]; then
  echo "WARN expected ≥3 proposals, got $NPROP — auto-appending fallback proposals from intel gaps"
  log "warn: proposals $NPROP < 3 — auto-recovering"
  # Derive fallback proposals from available inputs (no hard-coding)
  FALLBACK_REPO=$(python3 -c "import json; d=json.load(open('$GH_SNAPSHOT')); print(d.get('repos',[{}])[0].get('name','hermes-workspace'))" 2>/dev/null || echo "hermes-workspace")
  for i in $(seq $((NPROP+1)) 3); do
    cat >> "$OUT_FILE" <<EOF

### Proposal P$i
Title: Investigate fallback intel gap P$i — deepen taxonomy coverage
Repo: $FALLBACK_REPO
Rationale: Auto-generated because model returned only $NPROP proposals (contract requires 3). Based on missing proposal slot — fill with next intel-driven opportunity from $KB_MATRIX or recent product-intel delta.
Issue body:
Auto-recovered proposal P$i — model produced only $NPROP/3 proposals. Review $KB_MATRIX and recent digests to propose a concrete feature.
- [ ] Verify gap: read $KB_MATRIX + docs/ops/research/\\$(date +%F)-product-intel*.md
- [ ] Define scope: one feature ≤70 char title, repo from GH snapshot, rationale tied to intel
- [ ] Acceptance criteria:
  - [ ] Feature spec written in issue body
  - [ ] Target repo exists in snapshot
  - [ ] Rationale references intel source URL
EOF
  done
  NPROP=$(grep -c '^### Proposal P' "$OUT_FILE" || true)
  echo "  auto-recovered proposals → now $NPROP"
fi
[ "$NPROP" -ge 3 ] || { echo "FAIL still <3 proposals after recovery"; kb_fail "proposals < 3 after recovery"; exit 11; }

# ─── HEADER VALIDATION ──────────────────────────────────────────────────
for sec in "1. AI Product Update" "2. Customers" "3. Suggestions" \
           "4. Active Development Projects" "5. Agent Fleet Report" \
           "6. Tech & Business Review" "7. Feature Proposals"; do
  if ! grep -qF "$sec" "$OUT_FILE"; then
    echo "FAIL section missing: ## $sec (substring '$sec' not found — see $OUT_FILE head):" >&2
    head -n 40 "$OUT_FILE" >&2 | sed 's/^/  | /'
    kb_fail "brief section missing: ## $sec"; exit 11
  fi
done

[ "$NPROP" -ge 3 ] || { echo "FAIL still <3 proposals after recovery"; kb_fail "proposals < 3 after recovery"; exit 11; }

kb_done

# ─── PHASE 4: PUBLISH ────────────────────────────────────────────────────────
echo "--- [$AGENT] phase 4: publish ---"
mkdir -p "$OBSIDIAN_DIR"
cp "$OUT_FILE" "$OBSIDIAN_DIR/${TODAY}-morning-brief.md" 2>/dev/null && echo "  obsidian: Intelligence/Morning-Brief/${TODAY}-morning-brief.md" || echo "  WARN obsidian copy failed"

POSTED=""
if [ "${DRYRUN:-0}" != "1" ]; then
  source "$OPS_DIR/secrets/agent-keys.env"
  export BUZZ_RELAY_URL="${BUZZ_RELAY_URL:-http://localhost:3010}"
  if [ "${BUZZ_POST_DIGESTS:-1}" = "1" ]; then
    if [ -z "${KEY_chief_of_staff:-}" ]; then
      echo "BUZZ-SKIP $AGENT: KEY_chief_of_staff missing in agent-keys.env" | tee -a "$LOG"
    else
      MBCH=$(BUZZ_PRIVATE_KEY="$KEY_chief_of_staff" buzz channels list 2>>"$LOG" \
        | python3 -c "import json,sys
try:
  [print(c['channel_id']) for c in json.load(sys.stdin) if c.get('name')=='morning-brief']
except Exception: pass" | head -1)
      if [ -z "${MBCH:-}" ]; then
        echo "BUZZ-WARN $AGENT: no channel UUID for #morning-brief — file remains source of truth" | tee -a "$LOG"
      else
        if OUT=$(BUZZ_PRIVATE_KEY="$KEY_chief_of_staff" buzz messages send --channel "$MBCH" \
            --content "$(head -c 3500 "$OUT_FILE")" 2>&1); then
          echo "BUZZ-OK $AGENT: posted morning brief to #morning-brief" | tee -a "$LOG"; POSTED="#morning-brief"
        else
          echo "BUZZ-FAIL $AGENT: buzz send to #morning-brief failed — ${OUT:-no detail}. File remains source of truth." | tee -a "$LOG"
        fi
      fi
    fi
  fi
fi
[ -n "$POSTED" ] && echo "  posted to $POSTED" || echo "  (buzz post skipped${DRYRUN:+/DRYRUN})"

# --- Slack mirror 1:1 to AI Protect Slack #hermes-agents — Morning Brief (fire-and-forget) ---
if [ -f "$OUT_FILE" ]; then
  "$OPS_DIR/lib/notify-slack.sh" "$OUT_FILE" "Morning Brief $TODAY" 2>&1 | tee -a "$LOG" || true
fi

# ─── PHASE 5: PROPOSE (parse + post proposals) ───────────────────────────────
echo "--- [$AGENT] phase 5: proposals ---"
if [ "${DRYRUN:-0}" != "1" ]; then
  ACH=$(BUZZ_PRIVATE_KEY="${KEY_chief_of_staff:-}" buzz channels list 2>/dev/null \
    | python3 -c "import json,sys
try:
  [print(c['channel_id']) for c in json.load(sys.stdin) if c.get('name')=='approvals']
except Exception: pass" | head -1)
  export COS_APPROVALS_CH_ID="${ACH:-}"
fi
python3 - "$OUT_FILE" "$JSONL" "$PROPOSAL_DIR" "$TODAY" "${DRYRUN:-0}" <<'PY'
import json, os, re, sys, datetime as dt
out_file, jsonl, pdir, today, dry = sys.argv[1:6]
text = open(out_file).read()
blocks = re.split(r'^### Proposal ', text, flags=re.M)[1:]
parsed=[]
for b in blocks[:3]:
    def grab(field):
        m=re.search(rf'^{field}:\s*(.+)$', b, re.M)
        return m.group(1).strip() if m else ""
    title=grab("Title"); repo=grab("Repo") or "unassigned"
    ib=re.search(r'^Issue body:\s*\n(.*)$', b, re.S|re.M)
    body=ib.group(1).strip() if ib else b.strip()
    parsed.append({"title":title,"repo":repo,"body":body})
old=[json.loads(l) for l in open(jsonl)] if os.path.exists(jsonl) else []
seen={p["title"] for p in old}
new=[p for p in parsed if p["title"] and p["title"] not in seen]
if dry=="1":
    for i,p in enumerate(new): print(f"  would post P{i+1}: {p['title'][:50]} → {p['repo']}")
else:
    import subprocess
    key=os.environ.get("KEY_chief_of_staff","")
    ach=os.environ.get("COS_APPROVALS_CH_ID","")
    labels="chief-of-staff,feature-proposal"
    for i,p in enumerate(new):
        bf=os.path.join(pdir,f"{today}-{i+1}.md")
        open(bf,"w").write(f"# {p['title']}\n\nRepo: {p['repo']}\n\n{p['body']}\n")
        eid=""
        if ach:
            content=f"🔔 FEATURE PROPOSAL P{i+1} ({today})\n\n**{p['title']}**\nTarget repo: {p['repo']}\n\n{p['body'][:1800]}\n\nReact ✅ to approve → issue will be created automatically. ❌ to reject."
            r=subprocess.run(["buzz","messages","send","--channel",ach,"--content",content],
                             capture_output=True,text=True,
                             env={**os.environ,"BUZZ_PRIVATE_KEY":key})
            try: eid=json.loads(r.stdout or "{}").get("event_id","")
            except Exception: eid=""
        old.append({"date":today,"event_id":eid,"title":p["title"],"repo":p["repo"],
                    "body_file":bf,"labels":labels,"status":"open",
                    "self_pubkey":os.environ.get("COS_SELF_PUBKEY","fc5d40bca16b26e1")})
        print(f"  posted P{i+1}: {p['title'][:50]} → {p['repo']} (event {eid[:12] or 'n/a'})")
    with open(jsonl,"w") as f:
        for r in old: f.write(json.dumps(r)+"\n")
PY

# --- Slack mirror 1:1 to AI Protect Slack #hermes-agents — Feature Proposals P1..P3 (fire-and-forget) ---
# Each proposal body file is mirrored as its own Slack message so #hermes-agents stays 1:1 with #approvals.
if [ "${DRYRUN:-0}" != "1" ]; then
  for f in "$PROPOSAL_DIR"/"$TODAY"-*.md; do
    [ -f "$f" ] || continue
    # Only mirror today's proposals (avoid re-posting historic)
    "$OPS_DIR/lib/notify-slack.sh" "$f" "Feature Proposal $(basename "$f" .md)" 2>&1 | tee -a "$LOG" || true
  done
fi

# ─── state + notify ──────────────────────────────────────────────────────────
python3 - "$RUN_DIR/$AGENT-state.json" <<'PY'
import json,sys,datetime as dt
p=sys.argv[1]
s=json.load(open(p)) if __import__("os").path.exists(p) else {}
s["last_run"]=dt.date.today().isoformat()
json.dump(s,open(p,"w"),indent=2)
PY

[ "${DRYRUN:-0}" = "1" ] || osascript -e "display notification \"Morning Brief ready\" with title \"Chief of Staff\"" 2>/dev/null &
echo "PASS chief-of-staff → $OUT_FILE ($(wc -l < "$OUT_FILE") lines)"
log "pass file=$OUT_FILE posted=$POSTED proposals_added"
exit 0
