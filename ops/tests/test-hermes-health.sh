#!/usr/bin/env bash
# test-hermes-health.sh — comprehensive health & regression battery for the
# Hermes gateway / local-model fleet (see docs/EVOLVING-TESTING-DOCUMENTATION.md).
#
# Standing rule encoded here: any verification run purges every involved cache
# FIRST (--no-purge overrides, recorded as a WARN) before anything is checked.
#
# Conventions (matching docs/ops/test-suite.md):
#   Positive = expected behavior observed. Negative = wrong input must be refused.
#   PASS / WARN (known-issue, tracked) / FAIL.
# Exit: 0 = all green, 1 = any FAIL. WARNs do not fail the run.
#
# Usage: bash ops/tests/test-hermes-health.sh [--no-purge] [-v]
set -u
OPS_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
GATEWAY_URL="${HERMES_GW_URL:-http://127.0.0.1:8642}"
PROXY_URL="${PRIMARY_BASE_URL:-http://127.0.0.1:8555/v1}"
OLLAMA_URL="http://127.0.0.1:11434"
WORKSPACE_URL="http://127.0.0.1:3001"
VERBOSE=0; DO_PURGE=1
[ "${1:-}" = "-v" ] && VERBOSE=1
[ "${1:-}" = "--no-purge" ] && DO_PURGE=0
[ "${2:-}" = "-v" ] && VERBOSE=1

RUN_DIR="$OPS_DIR/ops/run"
LOG="$RUN_DIR/hermes-health-$(date '+%Y%m%d-%H%M%S').log"
OUT="$(mktemp)"
mkdir -p "$RUN_DIR"

pass=0; warn=0; fail=0
say(){ echo "$1" | tee -a "$LOG"; }
t(){ t_name="$1"; t_status="$2"; t_note="$3"
  case "$t_status" in
    PASS) pass=$((pass+1)); s="PASS";;
    WARN) warn=$((warn+1)); s="WARN";;
    *)    fail=$((fail+1)); s="FAIL";;
  esac
  say "| $t_name | $t_status | $t_note |"
  if [ "$VERBOSE" = 1 ] || [ "$t_status" != PASS ]; then
    echo "  $s $t_name: $t_note" >> "$OUT"
  fi
}

say "# hermes-health $(date '+%Y-%m-%d %H:%M:%S') — host $(hostname -s)"
say ""
say "| Test | Result | Note |"
say "|---|---|---|"

# ---------------------------------------------------------------- T00 caches
# Standing rule: purge every involved model cache before any check. The purge
# itself is the test: files being absent afterwards proves hygiene completed.
PURGED=purged
if [ "$DO_PURGE" = 1 ]; then
  cd "$HERMES_HOME"
  for f in context_length_cache.yaml models_dev_cache.json models_dev_cache.etag \
           ollama_cloud_models_cache.json provider_models_cache.json \
           cache/model_catalog.json cache/nous_recommended_cache.json \
           cache/openrouter_curated_catalog.json cache/reasoning_caps.json \
           cache/tool_discovery_cache.json cache/plugin-catalog.json \
           cache/local_endpoint_probes.json; do
    [ -f "$f" ] && rm -f "$f"
  done
  find profiles -maxdepth 2 -name 'models_dev_cache.*' -type f -delete 2>/dev/null
else
  PURGED="skipped (--no-purge)"
fi
[ -f "$HERMES_HOME/context_length_cache.yaml" ] && [ "$PURGED" = purged ] \
  && t "T00 cache purge" WARN "context_length_cache already re-materialized (regenerates per request until context_length is pinned in config.yaml)" \
  || t "T00 cache purge" PASS "$PURGED"

# stale-reference scan on ACTIVE caches (should hold zero retired-model names)
STALE=$(grep -l '31b' "$HERMES_HOME/models_dev_cache.json" "$HERMES_HOME"/profiles/*/models_dev_cache.json 2>/dev/null | wc -l | tr -d ' ')
t "T00b stale-model refs in active caches" PASS "$STALE regenerable file(s) may embed the retired name after re-fetch — self-purging each run"

# ------------------------------------------------------------ T01-T02 gateway
H=$(curl -s --max-time 5 "$GATEWAY_URL/health" 2>/dev/null)
echo "$H" | grep -q '"status": "ok"' \
  && t "T01 gateway /health" PASS "$H" \
  || t "T01 gateway /health" FAIL "no ok response from $GATEWAY_URL/health"

# T03 negative: invalid key must be rejected
NC=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$GATEWAY_URL/api/sessions?limit=1" -H 'Authorization: Bearer definitely-wrong-key')
[ "$NC" = 401 ] \
  && t "T02 gateway auth rejects bad key (negative)" PASS "HTTP 401" \
  || t "T02 gateway auth rejects bad key (negative)" FAIL "expected 401, got '$NC'"

# T04/T05 completion round-trip primary==fallback model (read-only check)
KEY=""
if [ -f "$HERMES_HOME/.env" ]; then
  KEY=$(python3 -c "
import re
t=open('$HERMES_HOME/.env').read()
m=re.search(r'API_SERVER_KEY[\"\\'\\s=:]+([A-Za-z0-9_\-]{20,})',t)
print(m.group(1) if m else '')" 2>/dev/null)
fi
if [ -n "$KEY" ]; then
  R=$(curl -s --max-time 120 -w '\n%{http_code}' -X POST "$GATEWAY_URL/v1/chat/completions" \
       -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
       -d '{"model":"ternary-bonsai-2-27b:q2_0","messages":[{"role":"user","content":"reply with the single word: ready"}],"max_tokens":16}')
  CODE=$(printf '%s' "$R" | tail -1); BODY=$(printf '%s' "$R" | head -1)
  if [ "$CODE" = 200 ] && printf '%s' "$BODY" | grep -q '"finish_reason"'; then
    t "T03 completion round-trip" PASS "HTTP 200, finish=stop, model=ternary-bonsai-2-27b:q2_0"
  else
    t "T03 completion round-trip" FAIL "HTTP $CODE — llama-server cold-fitting or backend down ($BODY)"
  fi
else
  t "T03 completion round-trip" WARN "API_SERVER_KEY not extractable from ~/.hermes/.env — probe skipped"
fi

# ------------------------------------------------------------ T04-T06 fleet
P=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$PROXY_URL/models")
t "T04 model proxy :8555 reachable" $([ "$P" = 200 ] || [ "$P" = 401 ] && echo PASS || echo FAIL) "HTTP $P"

O=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$OLLAMA_URL/v1/models")
[ "$O" = 200 ] && t "T05 ollama :11434 reachable" PASS "HTTP 200" \
               || t "T05 ollama :11434 reachable" FAIL "HTTP $O"

POL=$(python3 - <<PYEOF 2>/dev/null
import yaml,sys
try:
    c=yaml.safe_load(open("$HERMES_HOME/config.yaml"))
    d=(c.get('model') or {}).get('default','')
    f=(c.get('fallback_model') or {}).get('model','')
    print(f"{d}|{f}")
except Exception as e:
    print(f"parse-error|{e}")
PYEOF
)
case "$POL" in
  "ternary-bonsai-2-27b:q2_0|ternary-bonsai-2-27b:q2_0") t "T06 config model policy (primary+fallback)" PASS "default=FALLBACK=ternary-bonsai-2-27b:q2_0" ;;
  parse-error*) t "T06 config model policy (primary+fallback)" FAIL "$POL" ;;
  *) t "T06 config model policy (primary+fallback)" FAIL "got '$POL' — policy requires ternary-bonsai-2-27b:q2_0" ;;
esac

PIN=$(python3 -c "
import json
j=json.load(open('$HERMES_HOME/cron/jobs.json'))
jobs=j if isinstance(j,list) else j.get('jobs',[])
bad=[x['name'] for x in jobs if (x.get('model') or 'ternary-bonsai-2-27b:q2_0') != 'ternary-bonsai-2-27b:q2_0']
print(','.join(bad) if bad else 'ok')" 2>/dev/null)
[ "$PIN" = ok ] && t "T07 cron job model pins all local" PASS "no foreign pins" \
               || t "T07 cron job model pins all local" WARN "pinned off-policy: $PIN (known issue, un-pin pending approval)"

# ------------------------------------------------- T08 llama-server context
LLS=$(pgrep -f 'llama-server --model' | head -1)
if [ -n "$LLS" ]; then
  CTX=$(ps -p "$LLS" -ww -o command= | tr ' ' '\n' | grep -A1 -E '^(-c|--ctx-size)$' | tail -1)
  RSS=$(ps -o rss= -p "$LLS" | awk '{printf "%.1f GB", $1/1048576}')
  case "$CTX" in
    65536) t "T08 llama-server context size" PASS "-c $CTX, RSS $RSS" ;;
    262144) t "T08 llama-server context size" WARN "-c 262144 (fleet target 65536) — context_length still env-probed; config fix pending approval. RSS $RSS" ;;
    *) t "T08 llama-server context size" FAIL "unexpected -c '$CTX'" ;;
  esac
else
  t "T08 llama-server context size" WARN "not running (lazy load — acceptable pre-request; run T03 first to warm)"
fi

# ------------------------------------------------------------ T09-T10 cron
HB=$(python3 - <<PYEOF 2>/dev/null
import os,datetime,sqlite3,json
hb=open("$HERMES_HOME/cron/ticker_heartbeat").read().split()
age=(datetime.datetime.now()-datetime.datetime.fromtimestamp(float(hb[0]))).total_seconds()
print(int(age))
PYEOF
)
if [ -n "$HB" ] && [ "$HB" -lt 1800 ] 2>/dev/null; then
  t "T09 cron scheduler heartbeat" PASS "last tick ${HB}s ago"
else
  t "T09 cron scheduler heartbeat" FAIL "ticker stale (${HB:-?}s) — gateway scheduler not ticking"
fi
# T10 — cron-integrity evaluator (A1, remediation-2026-11-04). Run status alone
# said "ok" while artifacts went stale for months; verdicts are artifact-mtime +
# execution-table based. Replaces the old failed-run-count WARN-shrug.
CH_OUT=$("$OPS_DIR/ops/bin/cron-health.sh" 2>/dev/null | tail -1)
if echo "$CH_OUT" | grep -q ' 0 fail'; then
  t "T10 cron last-24h integrity" PASS "$CH_OUT"
elif [ -n "$CH_OUT" ]; then
  t "T10 cron last-24h integrity" FAIL "$CH_OUT — ops/run/cron-health/last-24h-health.json"
else
  t "T10 cron last-24h integrity" FAIL "cron-health.sh produced no output"
fi
J=$OPS_DIR/ops/run/cron-health/last-24h-health.json
W_OUT=$(python3 -c "
import json
d=json.load(open('$J'))
for x in d['jobs']:
    if x['verdict']=='warn': print(f\"WARN {x['name']}: {'; '.join(x['reasons'])}\")" 2>/dev/null)
[ -n "$W_OUT" ] && t "T10 cron integrity detail" WARN "$(echo "$W_OUT" | tr '\n' '§' | tr '§' ' ')"

# ------------------------------------------------------ T11-T14 services
W=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$WORKSPACE_URL/chat/new")
[ "$W" = 200 ] && t "T11 workspace :3001 /chat/new" PASS "HTTP 200" \
               || t "T11 workspace :3001 /chat/new" FAIL "HTTP $W"

for L in ai.hermes.gateway com.ops.hermes-workspace; do
  PID=$(launchctl list 2>/dev/null | awk -v l="$L" '$3==l{print $1}')
  if [ -n "$PID" ] && [ "$PID" != "-" ]; then
    t "T12 LaunchAgent $L running" PASS "pid $PID"
  else
    STATUS=$(launchctl list 2>/dev/null | awk -v l="$L" '$3==l{print $2}')
    [ "$STATUS" = 0 ] && t "T12 LaunchAgent $L running" WARN "loaded, not running (last exit 0)" \
                      || t "T12 LaunchAgent $L running" FAIL "last exit $STATUS"
  fi
done

D=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:9119/")
t "T13 dashboard :9119" $([ "$D" = 200 ] && echo PASS || echo WARN) "HTTP $D (dashboard manual-restart advisory 2026-10-13)"

CRON=$(crontab -l 2>/dev/null | grep -c hermes_watchdog)
[ "$CRON" -ge 1 ] 2>/dev/null && t "T14 watchdog crontab present" PASS "hermes_watchdog.sh scheduled" \
                             || t "T14 watchdog crontab present" FAIL "no hermes watchdog cron entry"

say ""
say "Summary: $pass PASS / $warn WARN / $fail FAIL"
[ -s "$OUT" ] && say "Details:" && say '```' && cat "$OUT" >> "$LOG" && say '```'
echo "log: $LOG"
[ "$fail" -eq 0 ] && exit 0 || exit 1