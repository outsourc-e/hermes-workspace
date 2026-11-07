#!/usr/bin/env bash
# run-night-agent.sh — run one nightly research agent headlessly.
# Usage: run-night-agent.sh <competitor-scout|customer-watcher|partner-radar>
# Guarantees: night window only, pre-flight model check, lock file, timeout,
# digest written to docs/ops/research/, macOS notification on completion.
set -u
# launchd runs agents with a minimal PATH — ensure hermes & tooling are found.
export PATH="$HOME/.local/bin:$HOME/.hermes/hermes-agent/venv/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
# Resolve hermes binary robustly (pipx vs venv vs local)
HERMES_BIN="${HERMES_BIN:-$(command -v hermes 2>/dev/null || echo "$HOME/.local/bin/hermes")}"
if [ ! -x "$HERMES_BIN" ] && [ -x "$HOME/.hermes/hermes-agent/venv/bin/hermes" ]; then HERMES_BIN="$HOME/.hermes/hermes-agent/venv/bin/hermes"; fi
OPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# Model routing single source of truth — locked 2026-10-11 to ternary-bonsai-2-27b:q2_0 (:8555 via Ollama proxy)
[ -f "$OPS_DIR/config/model.env" ] && source "$OPS_DIR/config/model.env"
PRIMARY_MODEL_ID="${PRIMARY_MODEL_ID:-ternary-bonsai-2-27b:q2_0}"
PRIMARY_BASE_URL="${PRIMARY_BASE_URL:-http://127.0.0.1:8555/v1}"
FALLBACK_MODEL_ID="${FALLBACK_MODEL_ID:-ternary-bonsai-2-27b:q2_0}"
FALLBACK_BASE_URL="${FALLBACK_BASE_URL:-http://127.0.0.1:8555/v1}"
# Load Buzz posting defaults (BUZZ_RELAY_URL, BUZZ_POST_DIGESTS=1).
[ -f "$OPS_DIR/config/buzz.env" ] && source "$OPS_DIR/config/buzz.env"
WS_DIR="$(cd "$OPS_DIR/.." && pwd)"
AGENT="${1:?usage: run-night-agent.sh <agent-name>}"
PROMPT_TPL="$OPS_DIR/agents/$AGENT.md"
[ -f "$PROMPT_TPL" ] || { echo "unknown agent: $AGENT"; exit 64; }

RUN_DIR="${RUN_DIR_OVERRIDE:-$OPS_DIR/run}"; mkdir -p "$RUN_DIR"
LOCK="$RUN_DIR/$AGENT.lock"
RESEARCH="${RESEARCH_DIR:-$WS_DIR/docs/ops/research}"; mkdir -p "$RESEARCH"
LOG="$RUN_DIR/$AGENT.log"

# --- kanban lifecycle (graceful: never breaks the run) ---
KB="$OPS_DIR/bin/kanban.sh"
CARD=""
ALL_CLEAN=0   # set 1 by kb_done; the EXIT trap must not re-block a done card
if [ -x "$KB" ]; then
  kb_done()   { [ -n "$CARD" ] && "$KB" done "$CARD" >/dev/null 2>&1 && ALL_CLEAN=1 || true; }
  kb_fail()   { [ -n "$CARD" ] && "$KB" fail "$CARD" "$1" >/dev/null 2>&1 || true; }
  kb_begin() { # adopt tonight's queued card or create one; sets CARD
    local t="night-run: $AGENT $(date +%F)" cid
    if [ "${CATCHUP:-0}" = "1" ]; then
      # B4 day catch-up: adopt the OLDEST ready card that is NOT today's
      # night-run (those are the failures earlier nights never re-adopt: the
      # nightly claim matches its own date only). Never create; nothing stale
      # → CARD stays empty → exit quietly without model spend.
      cid=$("$KB" list --agent "$AGENT" --lane ready 2>/dev/null \
            | awk -F'\t' '$3=="ready" && $4 != "'"night-run: $AGENT $(date +%F)"'"' \
            | tail -1 | cut -f1)
      if [ -n "$cid" ]; then
        CARD="$cid"; "$KB" set "$CARD" --lane running >/dev/null 2>&1 || true
      fi
      return
    fi
    cid=$("$KB" latest --agent "$AGENT" 2>/dev/null || true)
    if [ -n "$cid" ] && "$KB" get "$cid" 2>/dev/null | grep -q "^title=$t\$"; then
      CARD="$cid"; "$KB" set "$CARD" --lane running >/dev/null 2>&1 || true
    else
      CARD=$("$KB" create --agent "$AGENT" --title "$t" --spec "nightly $AGENT run" \
        --lane running --created-by "run-$AGENT" 2>/dev/null || true)
    fi
  }
else
  kb_done() { :; }; kb_fail() { :; }; kb_begin() { :; }
fi

# --- window + locks ---
h=$(date +%H)
# NOW_HOUR: hermetic test hook for the window check (test-cron-gate.sh).
[ -n "${NOW_HOUR:-}" ] && h=$NOW_HOUR
if [ "${FORCE:-0}" != "1" ]; then
  if [ "${CATCHUP:-0}" = "1" ]; then
    # B4 day catch-up: day window only (09-17). Same gate/locks/pre-flight
    # chain as the nightly runner; quota = 1 stale card per invocation.
    [ $h -ge 9 ] && [ $h -le 17 ] || { echo "FAIL $AGENT outside day catch-up window (hour=$h)"; exit 5; }
  else
    [ $h -ge 0 ] && [ $h -le 6 ] || { echo "FAIL $AGENT outside night window (hour=$h)"; exit 5; }
  fi
fi
# staleness: if lock > 90 min, assume crashed previous run (slow-model overrun)
# 2026-11-06 B4: this branch was originally AFTER the exit-8 check above, i.e.
# unreachable — a kill -9'd run jammed the agent until a manual cleanup.
if [ -f "$LOCK" ]; then find "$LOCK" -mmin +90 -exec rm -f {} \; 2>/dev/null || true; fi
[ -e "$LOCK" ] && { echo "FAIL $AGENT already running/stale lock"; exit 8; }
trap 'rm -f "$LOCK"; { [ "${ALL_CLEAN:-1}" = 0 ] && kb_fail "signal/early-exit after $SECONDS s"; } 2>/dev/null || true' EXIT ERR TERM
touch "$LOCK"

# --- B1 gate: cron integrity before any card claim or token burn (remediation-
# --- 2026-11-04 §B1). Fail-closed on acute cron breakage within the last 24h;
# chronic artifact debt (tracked in last-24h-health.json) does NOT close it.
# FORCE=1 (supervised re-run) bypasses; exit 4 = gate closed.
if [ "${FORCE:-0}" != "1" ]; then
  GATE_OUT=$("$OPS_DIR/bin/cron-gate.sh" 2>/dev/null) || { echo "FAIL $AGENT gate closed: $GATE_OUT (rc=4; bypass with FORCE=1)"; exit 4; }
  echo "gate: $GATE_OUT"
fi

# --- pre-flight: primary (ternary-bonsai-2-27b:q2_0 @8555 via Ollama proxy) → fallback (same) ---
if "$OPS_DIR/bin/model-check.sh" "$PRIMARY_BASE_URL" "$PRIMARY_MODEL_ID" >/dev/null 2>&1; then
  echo "pre-flight: primary $PRIMARY_MODEL_ID PASS ($PRIMARY_BASE_URL)"
else
  echo "WARN $AGENT primary $PRIMARY_MODEL_ID not serving on $PRIMARY_BASE_URL — checking fallback $FALLBACK_MODEL_ID ($FALLBACK_BASE_URL)"
  if ! "$OPS_DIR/bin/model-check.sh" "$FALLBACK_BASE_URL" "$FALLBACK_MODEL_ID" >/dev/null 2>&1; then
    echo "WARN $AGENT neither primary nor fallback serving — hermes will try profile fallback_model automatically"
  else
    echo "pre-flight: fallback $FALLBACK_MODEL_ID PASS — will degrade if primary fails"
  fi
fi

kb_begin

# B4 catch-up: nothing stale to adopt -> done quietly before any list fetch /
# model spend (clean exit; the EXIT trap no-ops on an empty CARD).
if [ "${CATCHUP:-0}" = "1" ] && [ -z "$CARD" ]; then
  echo "PASS $AGENT catch-up: no stale ready night-run cards — nothing to do"
  exit 0
fi

# --- build the list payload ---
LIST=""
case "$AGENT" in
  customer-watcher)
    KEY=$(grep -E "^TWENTY_API_KEY=" "$WS_DIR/.env" | cut -d= -f2)
    # Filter CRM by tag (idealCustomerProfile) / last-interaction (updatedAt).
    # Caps to 20 companies to avoid prompt bloat (ternary-bonsai-2-27b:q2_0). Prioritizes ICP then recency.
    CW_LIMIT="${CUSTOMER_LIMIT:-20}"
    CW_DAYS="${CUSTOMER_DAYS:-60}"
    TMP_JSON=$(mktemp)
    if ! curl -sf -m 15 -X POST http://127.0.0.1:3000/graphql \
      -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
      -d '{"query":"{ companies(first: 500) { edges { node { name idealCustomerProfile updatedAt } } } }"}' > "$TMP_JSON" 2>/dev/null; then
      rm -f "$TMP_JSON"
      echo "FAIL $AGENT could not fetch company list from Twenty"; kb_fail "crm company list unavailable"; exit 3
    fi
    LIST=$(python3 - "$TMP_JSON" "$CW_LIMIT" "$CW_DAYS" <<'PY' 2>/dev/null
import json, sys, datetime
jpath=sys.argv[1]; limit=int(sys.argv[2]); days=int(sys.argv[3])
data=json.load(open(jpath))
edges=data.get("data",{}).get("companies",{}).get("edges",[])
now=datetime.datetime.now(datetime.timezone.utc)
cutoff=now - datetime.timedelta(days=days)
def parse_dt(s):
    try:
        if s.endswith("Z"): s=s.replace("Z","+00:00")
        return datetime.datetime.fromisoformat(s)
    except: return None
rows=[]
for e in edges:
    n=e.get("node") or {}
    name=(n.get("name") or "").strip()
    if not name: continue
    icp=bool(n.get("idealCustomerProfile"))
    dt=parse_dt(n.get("updatedAt") or n.get("createdAt") or "")
    rows.append((name, icp, dt))
def score(r):
    _, icp, dt = r
    ts = dt.timestamp() if dt else 0
    return (1 if icp else 0, ts)
rows.sort(key=score, reverse=True)
filtered=[r for r in rows if r[1] or (r[2] and r[2] >= cutoff)]
if len(filtered) < 10:
    filtered = rows[:limit]
else:
    filtered = filtered[:limit]
for name,_,_ in filtered:
    print(name)
PY
)
    rm -f "$TMP_JSON"
    [ -n "$LIST" ] || { echo "FAIL $AGENT empty filtered list"; kb_fail "empty filtered list"; exit 3; }
    ;;
  competitor-scout) LIST=$(cat "$OPS_DIR/config/competitors.txt" | grep -v "^#" | grep -v "^$" || true) ;;
  partner-radar)    LIST=$(cat "$OPS_DIR/config/partners.txt" | grep -v "^#" | grep -v "^$" || true) ;;
esac
[ -n "$LIST" ] || { echo "FAIL $AGENT empty target list (populate ops/config or CRM)"; kb_fail "empty target list"; exit 3; }
echo "--- target list for $AGENT ---"; echo "$LIST" | sed 's/^/  /'; echo "---"

# --- compose prompt ---
TODAY=$(date +%F)
PROMPT=$(python3 - "$PROMPT_TPL" "$LIST" <<'PY'
import sys
tpl=open(sys.argv[1]).read()
print(tpl.replace("{LIST}", sys.argv[2]))
PY
)
PROMPT_FILE="$RUN_DIR/$AGENT.prompt"; printf '%s' "$PROMPT" > "$PROMPT_FILE"

# --- run headless via agent's own profile ---
# Primary: ternary-bonsai-2-27b:q2_0 (Ollama @11434, proxied to :8555) — fallback same via profile fallback_model
# All agents use the unified Gemma fleet (web,file toolsets).
# browser toolset requires browser.backend=true which conflicts with hermes-browser daemon; fleet uses web+file (fetch/search) instead.
# Resource-aware: timeout 2700s (45 min) to accommodate prompt-eval + decode
OUT_FILE="$RESEARCH/${TODAY}-${AGENT}.md"
TIMEOUT_SECS="${TIMEOUT_SECS:-2700}"
_run_once() {
  "$HERMES_BIN" --profile "$AGENT" chat --query-file "$PROMPT_FILE" -Q -t web,file > "$OUT_FILE" 2>>"$LOG" &
  H_PID=$!
  ( sleep "$TIMEOUT_SECS" && kill -TERM "$H_PID" 2>/dev/null; sleep 30; kill -9 "$H_PID" 2>/dev/null ) & WATCHDOG=$!
  set +e
  wait "$H_PID"; rc=$?
  kill "$WATCHDOG" 2>/dev/null; wait "$WATCHDOG" 2>/dev/null
  # NOTE: stay non-errexit here — the retry loop below maps rc explicitly
  # (timeout→9, missing binary→10, crash→retry→10). A trailing `set -e` would
  # exit the shell with the raw hermes rc and skip the mapping entirely.
  set +e
  return $rc
}
rc=0
for attempt in 1 2; do
  _run_once; rc=$?
  [ $rc -eq 0 ] && break
  if [ $rc -eq 124 ] || [ $rc -eq 137 ] || [ $rc -eq 143 ]; then
    echo "WARN $AGENT timed out attempt $attempt/$((TIMEOUT_SECS/60))min — retrying after gateway probe"
    curl -sf -m 5 http://127.0.0.1:8642/health >/dev/null 2>&1 || echo "WARN gateway not healthy before retry"
    sleep $((attempt*10))
    continue
  fi
  if [ $rc -eq 127 ]; then
    echo "FAIL $AGENT hermes binary not found at $HERMES_BIN (attempt $attempt) — check PATH/install"
    kb_fail "hermes binary not found at $HERMES_BIN rc=127"; exit 10
  fi
  # rc=1 (gateway connection error) → wait for gateway to recover, then retry once
  if [ $rc -ne 0 ] && [ $attempt -eq 1 ]; then
    echo "WARN $AGENT hermes exited rc=$rc — retrying after 20s (gateway backoff)"
    sleep 20
    continue
  fi
  break
done
[ $rc -eq 124 ] || [ $rc -eq 137 ] || [ $rc -eq 143 ] && { echo "FAIL $AGENT timed out after ${TIMEOUT_SECS}s (attempts exhausted)"; kb_fail "timeout after ${TIMEOUT_SECS}s (slow-model)"; exit 9; }
[ $rc -ne 0 ] && { echo "FAIL $AGENT hermes exited rc=$rc (see $LOG)"; kb_fail "hermes exited rc=$rc"; exit 10; }
grep -qE "## .*(Digest|Research)" "$OUT_FILE" || { echo "FAIL $AGENT digest format missing (see $OUT_FILE)"; kb_fail "digest format missing"; exit 11; }

kb_done
echo "PASS $AGENT → $OUT_FILE ($(wc -l < "$OUT_FILE") lines)"

# --- optional: post digest into its Buzz channel (loud; file remains source of truth) ---
SECRETS="$OPS_DIR/secrets/agent-keys.env"
if [ "${BUZZ_POST_DIGESTS:-0}" = "1" ] && [ -f "$SECRETS" ]; then
  source "$SECRETS"
  VKEY="KEY_${AGENT//-/_}"
  if [ -z "${!VKEY:-}" ]; then
    echo "BUZZ-SKIP $AGENT: KEY_${AGENT//-/_} missing in agent-keys.env" | tee -a "$LOG"
  else
    export BUZZ_RELAY_URL="${BUZZ_RELAY_URL:-http://localhost:3010}"
    # Resolve channel UUID from name (fleet bug fixed 2026-08-26).
    CH=$(BUZZ_PRIVATE_KEY="${!VKEY}" buzz channels list 2>>"$LOG" \
      | python3 -c "import json,sys
try:
    [print(c['channel_id']) for c in json.load(sys.stdin) if c.get('name')=='$AGENT']
except Exception: pass" | head -1)
    if [ -z "$CH" ]; then
      echo "BUZZ-WARN $AGENT: no channel UUID found for #$AGENT — file remains source of truth" | tee -a "$LOG"
    else
      if OUT=$(BUZZ_PRIVATE_KEY="${!VKEY}" buzz messages send --channel "$CH" \
          --content "$(head -c 3500 "$OUT_FILE")" 2>&1); then
        echo "BUZZ-OK $AGENT: posted digest to #$AGENT ($(wc -c < "$OUT_FILE") bytes)" | tee -a "$LOG"
      else
        echo "BUZZ-FAIL $AGENT: buzz send to #$AGENT failed — ${OUT:-no detail}. File remains source of truth." | tee -a "$LOG"
      fi
    fi
  fi
fi

# --- Slack mirror 1:1 to AI Protect Slack #hermes-agents (fire-and-forget, never fails job) ---
# Every Buzz report is mirrored to Slack hermes-agents — single source is still the file.
"$OPS_DIR/lib/notify-slack.sh" "$OUT_FILE" "$AGENT" 2>&1 | tee -a "$LOG" || true

osascript -e "display notification \"$AGENT digest ready\" with title \"Night Ops\"" 2>/dev/null
exit 0
