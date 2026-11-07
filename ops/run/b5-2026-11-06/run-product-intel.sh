#!/usr/bin/env bash
# run-product-intel.sh — nightly product/technology intelligence agent (product-intel).
#
# LIGHT mode every night: re-fetch known targets, detect changes, update knowledge base,
#                          write delta note to docs/ops/research/, short digest to Buzz #product-intel.
# DEEP mode every 3rd day: additionally broadens research (candidate proposals), rebuilds the
#                          comparison matrix, writes the consolidated report to Obsidian
#                          (Intelligence/Product-Intel/) and posts an approval draft to #approvals
#                          if new candidates were proposed.
#
# Guarantees (mirrors run-night-agent.sh): night window only, pre-flight model check, lock file,
# hard timeout, output-format validation, macOS notification on completion.
#
# Environment overrides (for testing):
#   FORCE=1          ignore night window
#   DRYRUN=1         skip model pre-flight, skip Buzz posting, allow HERMES_BIN override
#   DEEP=1           force a deep cycle regardless of cadence
#   HERMES_BIN=path  hermes binary (or mock) to invoke
#   TIMEOUT_SECS=n   hard timeout (default 2400)
#   KB_DIR / RESEARCH_DIR / OBSIDIAN_DIR / STATE_DIR  path overrides
set -u
# launchd runs agents with a minimal PATH — ensure hermes & tooling are found.
export PATH="$HOME/.local/bin:$HOME/.hermes/hermes-agent/venv/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
HERMES_BIN="${HERMES_BIN:-$(command -v hermes 2>/dev/null || echo "$HOME/.local/bin/hermes")}"
if [ ! -x "$HERMES_BIN" ] && [ -x "$HOME/.hermes/hermes-agent/venv/bin/hermes" ]; then HERMES_BIN="$HOME/.hermes/hermes-agent/venv/bin/hermes"; fi
OPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# Model routing — locked 2026-10-11 to ternary-bonsai-2-27b:q2_0 (:8555 via Ollama proxy)
[ -f "$OPS_DIR/config/model.env" ] && source "$OPS_DIR/config/model.env"
PRIMARY_MODEL_ID="${PRIMARY_MODEL_ID:-ternary-bonsai-2-27b:q2_0}"
PRIMARY_BASE_URL="${PRIMARY_BASE_URL:-http://127.0.0.1:8555/v1}"
FALLBACK_MODEL_ID="${FALLBACK_MODEL_ID:-ternary-bonsai-2-27b:q2_0}"
FALLBACK_BASE_URL="${FALLBACK_BASE_URL:-http://127.0.0.1:8555/v1}"
# Load Buzz posting defaults (BUZZ_RELAY_URL, BUZZ_POST_DIGESTS=1).
[ -f "$OPS_DIR/config/buzz.env" ] && source "$OPS_DIR/config/buzz.env"
WS_DIR="$(cd "$OPS_DIR/.." && pwd)"
AGENT="product-intel"
PROMPT_TPL="$OPS_DIR/agents/$AGENT.md"
[ -f "$PROMPT_TPL" ] || { echo "FAIL prompt template missing: $PROMPT_TPL"; exit 64; }

RUN_DIR="${STATE_DIR:-$OPS_DIR/run}"; mkdir -p "$RUN_DIR"
LOCK="$RUN_DIR/$AGENT.lock"
KB_DIR="${KB_DIR:-$WS_DIR/docs/ops/intel/knowledge-base}"
RESEARCH="${RESEARCH_DIR:-$WS_DIR/docs/ops/research}"; mkdir -p "$RESEARCH" "$KB_DIR"
OBSIDIAN_DIR="${OBSIDIAN_DIR:-$HOME/Documents/Obsidian Vault/Intelligence/Product-Intel}"
TARGETS_CFG="${TARGETS_CFG:-$OPS_DIR/config/$AGENT-targets.txt}"
LOG="$RUN_DIR/$AGENT.log"
TIMEOUT_SECS="${TIMEOUT_SECS:-2700}"

log() { echo "[$(date +%F_%T)] $*" >>"$LOG"; }

# --- kanban lifecycle (graceful; disabled in DRYRUN to keep tests hermetic) ---
KB="$OPS_DIR/bin/kanban.sh"; CARD=""
ALL_CLEAN=0   # set 1 by kb_done; the EXIT trap must not re-block a done card (B4)
if [ -x "$KB" ] && [ "${DRYRUN:-0}" != "1" ]; then
  kb_done()   { [ -n "$CARD" ] && "$KB" done "$CARD" >/dev/null 2>&1 && ALL_CLEAN=1 || true; }
  kb_fail()   { [ -n "$CARD" ] && "$KB" fail "$CARD" "$1" >/dev/null 2>&1 || true; }
  kb_begin() { # adopt tonight's queued card or create one; sets CARD
    local t="night-run: $AGENT $(date +%F)" cid
    if [ "${CATCHUP:-0}" = "1" ]; then
      # B4 day catch-up: adopt the OLDEST ready card that is NOT today's
      # night-run (earlier failed nights are never re-adopted by the nightly
      # claim — it matches its own date only). Never create; nothing stale
      # → CARD stays empty → quiet exit without model spend.
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
      CARD=$("$KB" create --agent "$AGENT" --title "$t" --spec "nightly product-intel cycle" \
        --lane running --created-by "run-$AGENT" 2>/dev/null || true)
    fi
  }
else
  kb_done() { :; }; kb_fail() { :; }; kb_begin() { :; }
fi

# --- 1. night window ---
h=$(date +%H)
# NOW_HOUR: hermetic test hook for the window check (test-cron-gate.sh).
[ -n "${NOW_HOUR:-}" ] && h=$NOW_HOUR
if [ "${FORCE:-0}" != "1" ]; then
  if [ "${CATCHUP:-0}" = "1" ]; then
    # B4 day catch-up: day window only (09-17). Same gate/lock/pre-flight
    # chain as the nightly runner; quota = 1 stale card per invocation.
    [ $h -ge 9 ] && [ $h -le 17 ] || { echo "FAIL $AGENT outside day catch-up window (hour=$h)"; exit 5; }
  else
    [ $h -ge 0 ] && [ $h -le 6 ] || { echo "FAIL $AGENT outside night window (hour=$h)"; log "refused outside window"; exit 5; }
  fi
fi

# --- 2. lock ---
# staleness: if lock > 90 min, assume crashed previous run (slow-model overrun)
# 2026-11-06 B4: cleanup must run BEFORE the existence check — placed after
# exit-8 it was unreachable and a kill -9'd run jammed the agent.
if [ -f "$LOCK" ]; then find "$LOCK" -mmin +90 -exec rm -f {} \; 2>/dev/null || true; fi
[ -e "$LOCK" ] && { echo "FAIL $AGENT already running/stale lock"; exit 8; }
trap 'rm -f "$LOCK"; { [ "${ALL_CLEAN:-1}" = 0 ] && kb_fail "signal/early-exit after $SECONDS s (slow-model)"; } 2>/dev/null || true' EXIT ERR TERM
touch "$LOCK"

# --- 3. model pre-flight (primary → fallback) ---
if [ "${DRYRUN:-0}" != "1" ]; then
  if "$OPS_DIR/bin/model-check.sh" "$PRIMARY_BASE_URL" "$PRIMARY_MODEL_ID" >/dev/null; then
    echo "pre-flight: primary $PRIMARY_MODEL_ID PASS"
  else
    echo "WARN $AGENT primary $PRIMARY_MODEL_ID not serving — checking fallback $FALLBACK_MODEL_ID"
    if ! "$OPS_DIR/bin/model-check.sh" "$FALLBACK_BASE_URL" "$FALLBACK_MODEL_ID" >/dev/null; then
      echo "WARN $AGENT neither primary nor fallback serving — hermes profile fallback_model will be tried"; log "warn: both models down"
    else
      echo "pre-flight: fallback $FALLBACK_MODEL_ID PASS"; log "warn: primary down, fallback up"
    fi
  fi
fi

# --- 4. target list ---
[ -f "$TARGETS_CFG" ] || { echo "FAIL target config missing: $TARGETS_CFG"; exit 3; }
LIST=$(grep -v '^#' "$TARGETS_CFG" | grep -v '^$' || true)
[ -n "$LIST" ] || { echo "FAIL $AGENT empty target list ($TARGETS_CFG)"; exit 3; }

# --- 5. cadence decision ---
STATE_FILE="$RUN_DIR/$AGENT-state.json"
[ -f "$STATE_FILE" ] || printf '{"last_light":null,"last_deep":null}\n' > "$STATE_FILE"
MODE=LIGHT
if [ "${DEEP:-0}" = "1" ]; then MODE=DEEP; else
  MODE=$(python3 - "$STATE_FILE" <<'PY'
import json,sys,datetime as dt
s=json.load(open(sys.argv[1]))
d=s.get("last_deep")
today=dt.date.today()
if not d: print("DEEP"); raise SystemExit
delta=(today-dt.date.fromisoformat(d)).days
print("DEEP" if delta>=3 else "LIGHT")
PY
)
fi
echo "--- $AGENT cycle=$MODE ($(date +%F)) ---"

# --- B1 gate: cron integrity before card claim + token burn (remediation-
# --- 2026-11-04 §B1). Skipped in DRYRUN (hermetic tests use fixtures in
# --- test-cron-gate.sh); FORCE=1 (supervised re-run) bypasses; exit 4 = closed.
if [ "${DRYRUN:-0}" != "1" ] && [ "${FORCE:-0}" != "1" ]; then
  GATE_OUT=$("$OPS_DIR/bin/cron-gate.sh" 2>/dev/null) || { echo "FAIL $AGENT gate closed: $GATE_OUT (rc=4; bypass with FORCE=1)"; exit 4; }
  echo "gate: $GATE_OUT"
fi

kb_begin

# B4 catch-up: nothing stale to adopt -> done quietly before any prompt build /
# model spend (clean exit; the EXIT trap no-ops on an empty CARD).
if [ "${CATCHUP:-0}" = "1" ] && [ -z "$CARD" ]; then
  echo "PASS $AGENT catch-up: no stale ready night-run cards — nothing to do"
  exit 0
fi

# --- 6. compose prompt ---
PROMPT=$(python3 - "$PROMPT_TPL" "$MODE" "$(date +%F)" "$KB_DIR" "$LIST" <<'PY'
import sys
tpl,mode,today,kb,targets=open(sys.argv[1]).read(),*sys.argv[2:]
lst="\n".join(f"- {line}" for line in targets.splitlines() if line.strip())
print(tpl.replace("{MODE}",mode).replace("{DATE}",today)
        .replace("{KB_DIR}",kb).replace("{TARGETS_LIST}",lst or "(none)"))
PY
)
PROMPT_FILE="$RUN_DIR/$AGENT.prompt"; printf '%s' "$PROMPT" > "$PROMPT_FILE"

# --- 7. run headless via product-intel profile (primary ternary-bonsai-2-27b:q2_0 @8555 via Ollama proxy, file+web toolsets), hard timeout ---
TODAY=$(date +%F)
if [ "$MODE" = "DEEP" ]; then
  OUT_FILE="$RESEARCH/${TODAY}-${AGENT}.md"
else
  OUT_FILE="$RESEARCH/${TODAY}-${AGENT}-delta.md"
fi
_run_once() {
  "$HERMES_BIN" --profile product-intel chat --query-file "$PROMPT_FILE" -Q -t web,file \
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
    echo "WARN $AGENT timed out attempt $attempt — retrying after gateway probe"
    curl -sf -m 5 http://127.0.0.1:8642/health >/dev/null 2>&1 || echo "WARN gateway not healthy before retry"
    sleep $((attempt*10))
    continue
  fi
  if [ $rc -eq 127 ]; then
    echo "FAIL hermes binary not found at $HERMES_BIN"; kb_fail "hermes binary not found at $HERMES_BIN rc=127"; exit 10
  fi
  if [ $rc -ne 0 ] && [ $attempt -eq 1 ]; then
    echo "WARN $AGENT hermes exited rc=$rc — retrying after 20s (gateway backoff)"
    sleep 20
    continue
  fi
  break
done
[ $rc -eq 124 ] || [ $rc -eq 137 ] || [ $rc -eq 143 ] && { echo "FAIL $AGENT timed out after ${TIMEOUT_SECS}s (attempts exhausted)"; log timeout; kb_fail "timeout after ${TIMEOUT_SECS}s (slow-model)"; exit 9; }
[ $rc -ne 0 ] && { echo "FAIL $AGENT hermes exited rc=$rc (see $LOG)"; kb_fail "hermes exited rc=$rc"; exit 10; }

# --- 8. validate output format (with auto-recover for deep) ---
validate() {
  if [ "$MODE" = "DEEP" ]; then
    REPORT="$KB_DIR/report-$TODAY.md"
    # Auto-recover: if LLM printed the report to stdout (OUT_FILE) but forgot to write REPORT file,
    # promote OUT_FILE to REPORT when it has the required sections.
    if [ ! -f "$REPORT" ] && [ -f "$OUT_FILE" ]; then
      hits=0
      for sec in "## 1. Executive summary" "## 2. Changes observed" "## 7. Sources"; do
        grep -q "^$sec" "$OUT_FILE" && hits=$((hits+1))
      done
      if [ $hits -ge 3 ] && grep -q "^# Product Intel Report" "$OUT_FILE"; then
        echo "WARN deep report missing at $REPORT — auto-promoting digest $OUT_FILE (model wrote to stdout not file)"
        log "auto-recover: promoting OUT_FILE to REPORT"
        cp "$OUT_FILE" "$REPORT"
      fi
    fi
    [ -f "$REPORT" ] || { echo "FAIL deep report missing: $REPORT (agent did not write file via file tool)"; return 1; }
    for sec in "## 1. Executive summary" "## 2. Changes observed" "## 5. Needs decision" "## 6. What did we miss" "## 7. Sources"; do
      grep -q "^$sec" "$REPORT" || { echo "FAIL deep report section missing: $sec"; return 1; }
    done
    # Soft-check target names (warn, don't hard-fail if one vendor not mentioned by name)
    while IFS= read -r line; do
      case "$line" in \#*|"") continue;; esac
      NAME="${line%%|*}"
      grep -qFi "$NAME" "$REPORT" || echo "WARN report missing explicit mention of target: $NAME (soft)"
    done < <(grep -v '^#' "$TARGETS_CFG" | grep -v '^$')
    cp "$REPORT" "$OUT_FILE"
  else
    grep -q "^## Product Intel Delta — $TODAY" "$OUT_FILE" || { echo "FAIL delta header missing (see $OUT_FILE)"; return 1; }
    grep -q "^### Changes" "$OUT_FILE" || { echo "FAIL delta sections missing"; return 1; }
  fi
  return 0
}
validate || { log "validation failed"; kb_fail "output validation failed"; exit 11; }

# --- 9. publish (deep: Obsidian + Buzz; light: Buzz short digest) ---
CAND_TODAY="$KB_DIR/candidates/$TODAY-candidates.md"
POSTED=""
chan_id() { # channel NAME -> UUID (empty if unknown)
  BUZZ_PRIVATE_KEY="${!VKEY}" BUZZ_RELAY_URL="${BUZZ_RELAY_URL:-ws://localhost:3010}" \
    buzz channels list 2>/dev/null \
    | python3 -c "import json,sys
try:
  [print(c['channel_id']) for c in json.load(sys.stdin) if c.get('name')=='$1']
except Exception: pass" | head -1
}
SECRETS="$OPS_DIR/secrets/agent-keys.env"
if [ "${DRYRUN:-0}" != "1" ] && [ -f "$SECRETS" ]; then
  source "$SECRETS"
  VKEY="KEY_product_intel"
  if [ "${BUZZ_POST_DIGESTS:-0}" = "1" ]; then
    if [ -z "${!VKEY:-}" ]; then
      echo "BUZZ-SKIP $AGENT: KEY_product_intel missing in agent-keys.env" | tee -a "$LOG"
    else
      export BUZZ_RELAY_URL="${BUZZ_RELAY_URL:-ws://localhost:3010}"
      CH=$(chan_id product-intel)
      if [ -z "$CH" ]; then
        echo "BUZZ-WARN $AGENT: no channel UUID for #product-intel — file remains source of truth" | tee -a "$LOG"
      else
        if OUT=$(BUZZ_PRIVATE_KEY="${!VKEY}" buzz messages send --channel "$CH" --content "$(head -c 3500 "$OUT_FILE")" 2>&1); then
          echo "BUZZ-OK $AGENT: posted digest to #product-intel" | tee -a "$LOG"; POSTED="#product-intel"
        else
          echo "BUZZ-FAIL $AGENT: buzz send to #product-intel failed — ${OUT:-no detail}. File remains source of truth." | tee -a "$LOG"
        fi
      fi
      if [ "$MODE" = "DEEP" ] && [ -f "$CAND_TODAY" ]; then
        ACH=$(chan_id approvals)
        if [ -z "$ACH" ]; then
          echo "BUZZ-WARN $AGENT: no channel UUID for #approvals — draft not posted" | tee -a "$LOG"
        else
          APPROVAL=$(printf '🔔 APPROVAL REQUESTED — product-intel broadening %s\n\nNew candidate targets proposed (details: docs/ops/intel/knowledge-base/candidates/%s-candidates.md).\nReact ✅ to approve; register accepted rows via ops/bin/intel-add-target.sh.' "$TODAY" "$TODAY")
          if OUT=$(BUZZ_PRIVATE_KEY="${!VKEY}" buzz messages send --channel "$ACH" --content "$APPROVAL" 2>&1); then
            echo "BUZZ-OK $AGENT: posted approval draft to #approvals" | tee -a "$LOG"; POSTED="$POSTED + #approvals draft"
          else
            echo "BUZZ-FAIL $AGENT: buzz send to #approvals failed — ${OUT:-no detail}" | tee -a "$LOG"
          fi
        fi
      fi
    fi
  fi
fi
[ -n "$POSTED" ] && echo "  posted to $POSTED" || echo "  (buzz post skipped${DRYRUN:+/DRYRUN} — files remain source of truth)"

# --- Slack mirror 1:1 to AI Protect Slack #hermes-agents (fire-and-forget, never fails job) ---
# Every Buzz report is mirrored to Slack hermes-agents — single source is still the file.
# Light delta and deep report both go to the same channel; deep includes candidates file separately.
if [ -f "$OUT_FILE" ]; then
  "$OPS_DIR/lib/notify-slack.sh" "$OUT_FILE" "product-intel $MODE" 2>&1 | tee -a "$LOG" || true
fi
if [ "$MODE" = "DEEP" ] && [ -f "$CAND_TODAY" ]; then
  "$OPS_DIR/lib/notify-slack.sh" "$CAND_TODAY" "product-intel candidates $TODAY" 2>&1 | tee -a "$LOG" || true
fi

if [ "$MODE" = "DEEP" ]; then
  mkdir -p "$OBSIDIAN_DIR"
  cp "$OUT_FILE" "$OBSIDIAN_DIR/${TODAY}-product-intel.md" \
    && echo "  obsidian: $OBSIDIAN_DIR/${TODAY}-product-intel.md" \
    || echo "  WARN obsidian copy failed (vault path?)"
fi
# B4: a catch-up run consumes a stale card but leaves the LIGHT/DEEP cadence
# state machine untouched — the nightly 03:00 schedule keeps its own rhythm.
if [ "${CATCHUP:-0}" != "1" ]; then
  if [ "$MODE" = "DEEP" ]; then
    python3 - "$STATE_FILE" <<'PY'
import json,sys
p=sys.argv[1]; s=json.load(open(p)); s["last_deep"]=s["last_light"]=__import__("datetime").date.today().isoformat()
json.dump(s,open(p,"w"),indent=2)
PY
  else
    python3 - "$STATE_FILE" <<'PY'
import json,sys
p=sys.argv[1]; s=json.load(open(p)); s["last_light"]=__import__("datetime").date.today().isoformat()
json.dump(s,open(p,"w"),indent=2)
PY
  fi
else
  echo "  (catch-up: product-intel cadence state untouched per B4)"
fi

[ "${DRYRUN:-0}" = "1" ] || osascript -e "display notification \"$AGENT $MODE cycle done\" with title \"Night Ops\"" 2>/dev/null
kb_done
echo "PASS $AGENT [$MODE] → $OUT_FILE ($(wc -l < "$OUT_FILE") lines)"
log "pass mode=$MODE file=$OUT_FILE posted=$POSTED"
exit 0
