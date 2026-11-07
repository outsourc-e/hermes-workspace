#!/usr/bin/env bash
# run-fleet-health.sh — nightly fleet-health digest (06:15) with two layers:
#   L1 deterministic health matrix (always succeeds, no LLM)
#   L2 LLM synthesis via fleet-health-monitor profile (optional, 15 min, degrades to L1 on timeout)
# Guarantees: lock file, TERM→KILL watchdog, never silent, Telegram/Slack fire-and-forget, daily research file.
set -u
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
[ -f "$OPS_DIR/config/buzz.env" ] && source "$OPS_DIR/config/buzz.env"
WS_DIR="$(cd "$OPS_DIR/.." && pwd)"
AGENT="fleet-health-monitor"
TPL="$OPS_DIR/agents/$AGENT.md"
[ -f "$TPL" ] || { echo "FAIL template missing: $TPL"; exit 64; }

RUN_DIR="${STATE_DIR:-$OPS_DIR/run}"; mkdir -p "$RUN_DIR"
LOCK="$RUN_DIR/$AGENT.lock"
LOG="$RUN_DIR/$AGENT.log"
TODAY=$(date +%F)
INPUTS_TMP="$RUN_DIR/fleet-inputs-$TODAY"; mkdir -p "$INPUTS_TMP"
RESEARCH="${RESEARCH_DIR:-$WS_DIR/docs/ops/research}"; mkdir -p "$RESEARCH"
KB="$OPS_DIR/bin/kanban.sh"
HERMES_BIN_FALLBACK="$HERMES_BIN"
TIMEOUT_SECS="${TIMEOUT_SECS:-900}"
# we run at 06:15 by default, but allow FORCE outside window for testing
h=$(date +%H)
if [ "${FORCE:-0}" != "1" ]; then
  [ $h -ge 5 ] && [ $h -le 8 ] || { echo "FAIL outside window (hour=$h) need 05-08 or FORCE=1"; exit 5; }
fi
[ -e "$LOCK" ] && { echo "FAIL $AGENT already running/stale lock"; exit 8; }
if [ -f "$LOCK" ]; then find "$LOCK" -mmin +30 -exec rm -f {} \; 2>/dev/null || true; fi
trap 'rm -f "$LOCK"' EXIT
touch "$LOCK"

CARD=""
if [ -x "$KB" ] && [ "${DRYRUN:-0}" != "1" ]; then
  kb_done() { [ -n "$CARD" ] && "$KB" done "$CARD" >/dev/null 2>&1 || true; }
  kb_fail() { [ -n "$CARD" ] && "$KB" fail "$CARD" "$1" >/dev/null 2>&1 || true; }
  kb_begin() {
    local t="night-run: $AGENT $(date +%F)" cid
    cid=$("$KB" latest --agent "$AGENT" 2>/dev/null || true)
    if [ -n "$cid" ] && "$KB" get "$cid" 2>/dev/null | grep -q "^title=$t\$"; then
      CARD="$cid"; "$KB" set "$CARD" --lane running >/dev/null 2>&1 || true
    else
      CARD=$("$KB" create --agent "$AGENT" --title "$t" --spec "fleet health digest" --lane running --created-by "run-$AGENT" 2>/dev/null || true)
    fi
  }
else
  kb_done() { :; }; kb_fail() { :; }; kb_begin() { :; }
fi
kb_begin
log() { echo "[$(date +%F_%T)] $*" >>"$LOG"; }

# ── L1: deterministic probe ─────────────────────────────────────────────
echo "--- [$AGENT] L1 deterministic probe ---"
HEALTH_JSON="$INPUTS_TMP/health.json"
probe_one() {
  local name="$1" cmd="$2" start end ms out rc
  start=$(python3 -c "import time; print(int(time.time()*1000))")
  if out=$(eval "$cmd" 2>&1); then rc=0; else rc=$?; fi
  end=$(python3 -c "import time; print(int(time.time()*1000))")
  ms=$((end-start))
  if [ $rc -eq 0 ]; then echo "$name PASS ${ms}ms"; else echo "$name FAIL ${ms}ms"; fi
  printf '%s' "$out" | head -c 500 | tr '\n' ' ' | sed 's/"/ /g'
}
# Use ops/config/net.env for GW_URL
source "$OPS_DIR/config/net.env" 2>/dev/null || true
GW_URL="${HERMES_GW_URL:-http://127.0.0.1:8642}"

primary_state="FAIL"
# Primary: ternary-bonsai-2-27b:q2_0 (Ollama @11434, proxied to :8555) — unified fleet
if "$OPS_DIR/bin/model-check.sh" "$PRIMARY_BASE_URL" "$PRIMARY_MODEL_ID" >/dev/null 2>&1; then primary_state="PASS"; fi
fallback="no"
# Fallback detection: if primary fails but fallback serves, mark degraded — Hermes retries same unified model
if [ "$primary_state" = "FAIL" ]; then
  if "$OPS_DIR/bin/model-check.sh" "$FALLBACK_BASE_URL" "$FALLBACK_MODEL_ID" >/dev/null 2>&1; then
    primary_state="FAIL"
    fallback="yes — using $FALLBACK_MODEL_ID @ $FALLBACK_BASE_URL"
  else
    fallback="no — both primary and fallback down"
  fi
fi
# Legacy alias for docs that still check health.json:qwen — keep compat for one release, points at primary_state
qwen_state="$primary_state"

# Run probes sequentially (avoid thunder)
gw_rc=1; curl -sf -m 5 "$GW_URL/health" >/dev/null 2>&1 && gw_rc=0
dash_rc=1; curl -sf -m 5 http://127.0.0.1:9119/api/status >/dev/null 2>&1 && dash_rc=0
twenty_rc=1; curl -sf -m 5 -X POST http://127.0.0.1:3000/graphql -H 'Content-Type: application/json' -d '{"query":"{ __typename }"}' >/dev/null 2>&1 && twenty_rc=0
buzz_rc=1; nc -z 127.0.0.1 3010 2>/dev/null && buzz_rc=0 || buzz_rc=1
ollama_rc=1; "$OPS_DIR/bin/model-check.sh" "$PRIMARY_BASE_URL" "$PRIMARY_MODEL_ID" >/dev/null 2>&1 && ollama_rc=0
# Tailnet check is OPTIONAL (local-only by default, see docs/tailscale-optional.md).
# tail_rc: 0=PASS, 1=FAIL, 2=SKIP. Only probed when TAILNET_OPTIONAL=1.
tail_rc=2
if [ "${TAILNET_OPTIONAL:-0}" = "1" ]; then
  tail_rc=1
  TS="$([ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ] && echo /Applications/Tailscale.app/Contents/MacOS/Tailscale || echo tailscale)"
  LIVE_IP="$("$TS" ip -4 2>/dev/null | head -1)"
  if [ -n "$LIVE_IP" ] && lsof -nP -iTCP:8642 -sTCP:LISTEN >/dev/null 2>&1; then tail_rc=0; fi
fi

python3 - "$HEALTH_JSON" "$gw_rc" "$dash_rc" "$twenty_rc" "$buzz_rc" "$ollama_rc" "$primary_state" "$fallback" "$tail_rc" <<'PY'
import json,sys
out, gw, dash, tw, buzz, ollama, primary, fb, tail = sys.argv[1], *sys.argv[2:]
import datetime as dt
def tri(v): return "SKIP" if v=="2" else ("PASS" if v=="0" else "FAIL")
data={
  "date": dt.date.today().isoformat(),
  "gateway": "PASS" if gw=="0" else "FAIL",
  "dashboard": "PASS" if dash=="0" else "FAIL",
  "twenty": "PASS" if tw=="0" else "FAIL",
  "buzz": "PASS" if buzz=="0" else "FAIL",
  "ollama": "PASS" if ollama=="0" else "FAIL",
  "tailnet": tri(tail),
  "primary": primary,
  # qwen retained as alias for one release (2026-09-04 → 2026-10-04) — same as primary (deprecated)
  "qwen": primary,
  "fallback": fb,
  "generated_at": dt.datetime.now().isoformat(timespec="seconds")
}
open(out,"w").write(json.dumps(data,indent=2))
print(json.dumps(data,indent=2))
PY
cat "$HEALTH_JSON" >>"$LOG"

# Kanban snapshot
KANBAN_FILE="$INPUTS_TMP/kanban.txt"
if [ -x "$KB" ]; then "$KB" list > "$KANBAN_FILE" 2>/dev/null || echo "(kanban unavailable)" > "$KANBAN_FILE"; else echo "(kanban unavailable)" > "$KANBAN_FILE"; fi

# Scheduler / pre-post / primary tails
for src in scheduler.log pre-night.log post-night.log; do
  tail -n 80 "$RUN_DIR/$src" 2>/dev/null | tail -n 60 > "$INPUTS_TMP/${src%.log}.tail.txt" || echo "(no $src yet)" > "$INPUTS_TMP/${src%.log}.tail.txt"
done
# Primary model health tail — alias for fleet-health template
"$OPS_DIR/bin/model-check.sh" "$PRIMARY_BASE_URL" "$PRIMARY_MODEL_ID" > "$INPUTS_TMP/primary.tail.txt" 2>&1 || echo "FAIL primary $PRIMARY_MODEL_ID not serving" > "$INPUTS_TMP/primary.tail.txt"
# ternary-bonsai-2-27b:q2_0 :8555 is the PRIMARY — tail the live Ollama proxy log
if [ -f "$RUN_DIR/gemma-8555.log" ]; then
  tail -n 60 "$RUN_DIR/gemma-8555.log" > "$INPUTS_TMP/gemma-8555.tail.txt" 2>/dev/null || true
  cp "$INPUTS_TMP/gemma-8555.tail.txt" "$INPUTS_TMP/gemma.tail.txt" 2>/dev/null || true
else
  echo "(server log not written yet — run ops/bin/gemma-server.sh start)" > "$INPUTS_TMP/gemma.tail.txt"
  echo "(server log not written yet — run ops/bin/gemma-server.sh start)" > "$INPUTS_TMP/gemma-8555.tail.txt"
fi
# Digests inventory
ls -lh "$RESEARCH"/"$TODAY"-*.md 2>/dev/null | awk '{print $9, $5}' > "$INPUTS_TMP/digests.txt" || echo "(no digests for $TODAY yet)" > "$INPUTS_TMP/digests.txt"
echo "$fallback" > "$INPUTS_TMP/fallback.txt"
# Previous health for delta
PREV_HEALTH=$(ls -t "$RUN_DIR"/fleet-inputs-*/health.json 2>/dev/null | head -1 || echo "")
if [ -z "$PREV_HEALTH" ] || [ "$PREV_HEALTH" = "$HEALTH_JSON" ]; then PREV_HEALTH="(none)"; fi

# ── Render L1 markdown immediately (always posted) ───────────────
L1_FILE="$RESEARCH/${TODAY}-fleet-health.md"
{
  echo "# Fleet Health — $TODAY"
  echo ""
  if [ "$fallback" != "no" ]; then echo "> \u26a0\ufe0f Deterministic fallback — primary unavailable ($fallback)"; echo ""; fi
  echo "## Health matrix"
  echo ""
  echo "| Service | Status | Source |"
  echo "|---|---|---|"
  python3 - "$HEALTH_JSON" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
for k in ["gateway","dashboard","twenty","buzz","ollama","tailnet","primary"]:
    print(f"| {k} | {d.get(k, d.get('qwen','?'))} | health.json:{k} |")
PY
  echo ""
  echo "## Night jobs"
  echo ""
  echo "| Agent | Status | Title |"
  echo "|---|---|---|"
  cat "$KANBAN_FILE" 2>/dev/null | head -n 30 | awk -F'\t' '{printf "| %s | %s | %s |\n",$2,$3,$4}' | head -n 15
  echo ""
  echo "## Raw evidence (L1)"
  echo ""
  echo "- health.json: \`$HEALTH_JSON\`"
  for f in scheduler.tail.txt pre-night.tail.txt post-night.tail.txt primary.tail.txt gemma.tail.txt digests.txt; do
    echo "- $f: $(wc -l < "$INPUTS_TMP/$f" 2>/dev/null | tr -d ' ') lines"
  done
  echo ""
  echo "Fleet-health note: L1 deterministic — L2 LLM synthesis follows if available"
} > "$L1_FILE"
echo "L1 written: $L1_FILE ($(wc -l < "$L1_FILE") lines)"

# ── L2: LLM synthesis (optional, bounded) ─────────────────────────
OUT_FILE="$L1_FILE"
PROMPT_FILE="$RUN_DIR/$AGENT.prompt"
if [ "${SKIP_LLM:-0}" != "1" ]; then
  python3 - "$TPL" "$PROMPT_FILE" "$TODAY" "$INPUTS_TMP" "$KANBAN_FILE" "$HEALTH_JSON" <<'PY'
import sys
tpl_path,out,today,indir,kanban,health = sys.argv[1:7]
tpl=open(tpl_path).read()
txt=tpl.replace("{DATE}",today).replace("{INPUT_DIR}",indir).replace("{KANBAN_FILE}",kanban).replace("{HEALTH_JSON}",health)
open(out,"w").write(txt)
PY
  if [ -s "$PROMPT_FILE" ]; then
    LLM_OUT="$RUN_DIR/${AGENT}.llm.md"
    echo "--- [$AGENT] L2 LLM synthesis (${TIMEOUT_SECS}s budget) ---"
    "$HERMES_BIN" --profile "$AGENT" chat --query-file "$PROMPT_FILE" -Q -t web,file > "$LLM_OUT" 2>>"$LOG" &
    H_PID=$!
    ( sleep "$TIMEOUT_SECS" && kill -TERM "$H_PID" 2>/dev/null; sleep 30; kill -9 "$H_PID" 2>/dev/null ) >/dev/null 2>&1 & WATCHDOG=$!
    set +e
    wait "$H_PID"; rc=$?
    kill "$WATCHDOG" 2>/dev/null; wait "$WATCHDOG" 2>/dev/null
    set -e
    if [ $rc -eq 0 ] && grep -q "^# Fleet Health" "$LLM_OUT" 2>/dev/null; then
      # Validate LLM output has required sections
      if grep -q "## Health matrix" "$LLM_OUT" && grep -q "## Night jobs" "$LLM_OUT"; then
        cp "$LLM_OUT" "$OUT_FILE"
        echo "L2 LLM synthesis accepted → $OUT_FILE"
        log "L2 accepted"
      else
        echo "WARN L2 output missing required sections — keeping L1"
        echo "" >> "$OUT_FILE"; echo "> \u26a0\ufe0f LLM output incomplete — see $LLM_OUT" >> "$OUT_FILE"
      fi
    else
      echo "WARN L2 hermes rc=$rc or missing header — keeping L1 (slow-model degrade)"
      echo "" >> "$OUT_FILE"; echo "> \u26a0\ufe0f LLM synthesis timed out / unavailable (rc=$rc, budget ${TIMEOUT_SECS}s) — matrix above is authoritative" >> "$OUT_FILE"
      log "L2 degraded rc=$rc"
    fi
  else
    echo "WARN prompt composition empty — keeping L1"
  fi
else
  echo "SKIP_LLM=1 — keeping L1 only"
fi

# ── Publish: Buzz + Telegram + Slack ─────────────────────────────────
echo "--- [$AGENT] publish ---"
# Kanban done
kb_done

# Buzz #night-runs (or fleet-health if exists)
SECRETS="$OPS_DIR/secrets/agent-keys.env"
if [ "${DRYRUN:-0}" != "1" ] && [ -f "$SECRETS" ] && [ "${BUZZ_POST_DIGESTS:-1}" = "1" ]; then
  source "$SECRETS" 2>/dev/null || true
  VKEY="KEY_fleet_health_monitor"
  # fallback to watchdog key if fleet key not yet registered
  if [ -z "${!VKEY:-}" ]; then VKEY="KEY_watchdog"; fi
  if [ -n "${!VKEY:-}" ]; then
    export BUZZ_RELAY_URL="${BUZZ_RELAY_URL:-http://localhost:3010}"
    CH_NAME="fleet-health"
    CH=$(BUZZ_PRIVATE_KEY="${!VKEY}" buzz channels list 2>/dev/null | python3 -c "import json,sys; [print(c['channel_id']) for c in json.load(sys.stdin) if c.get('name')=='$CH_NAME']" 2>/dev/null | head -1)
    [ -z "$CH" ] && CH=$(BUZZ_PRIVATE_KEY="${!VKEY}" buzz channels list 2>/dev/null | python3 -c "import json,sys; [print(c['channel_id']) for c in json.load(sys.stdin) if c.get('name')=='night-runs']" 2>/dev/null | head -1)
    if [ -n "$CH" ]; then
      if OUT=$(BUZZ_PRIVATE_KEY="${!VKEY}" buzz messages send --channel "$CH" --content "$(head -c 3500 "$OUT_FILE")" 2>&1); then
        echo "BUZZ-OK fleet-health: posted digest ($(wc -c < "$OUT_FILE") bytes)" | tee -a "$LOG"
      else
        echo "BUZZ-FAIL fleet-health: $OUT" | tee -a "$LOG"
      fi
    else
      echo "BUZZ-WARN fleet-health: no channel UUID — file remains source of truth" | tee -a "$LOG"
    fi
  fi
fi

# Telegram + Slack 1:1 to AI Protect Slack #hermes-agents (fire-and-forget, never fail job)
"$OPS_DIR/lib/notify-telegram.sh" "$OUT_FILE" 2>&1 | tee -a "$LOG" || true
"$OPS_DIR/lib/notify-slack.sh" "$OUT_FILE" "Fleet Health $TODAY" 2>&1 | tee -a "$LOG" || true

echo "PASS $AGENT → $OUT_FILE ($(wc -l < "$OUT_FILE") lines)"
log "pass file=$OUT_FILE"
exit 0
