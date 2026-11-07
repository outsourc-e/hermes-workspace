#!/usr/bin/env bash
# ops-status.sh — one-shot system status for mobile/pocket queries.
# Called by the Hermes ops-status skill; prints a compact report.
set -u
OPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$OPS_DIR/config/net.env" 2>/dev/null || true
GW="${HERMES_GW_URL:-http://127.0.0.1:8642}"

echo "== $(date '+%F %T') =="
chk() { if eval "$2" >/dev/null 2>&1; then echo "OK   $1"; else echo "DOWN $1"; fi; }
VAL=$(grep "^API_SERVER_KEY" "$HOME/.hermes/.env" 2>/dev/null | cut -d= -f2 | tr -d '"' | tr -d "'")
chk "gateway        ($GW)"       "curl -sf -m 4 $GW/health"
chk "dashboard      (:9119)"     "curl -sf -m 4 http://127.0.0.1:9119/api/status"
chk "twenty prod    (:3000)"     "curl -sf -m 4 -X POST http://127.0.0.1:3000/graphql -H 'Content-Type: application/json' -d '{\"query\":\"{ __typename }\"}'"
chk "twenty staging (:3100)"     "curl -sf -m 4 http://127.0.0.1:3100"
# NOTE: staging containers (staging-server/db/redis-*) have been stopped since
# ~2026-09-01 and are not part of nightly ops (post-night doesn't check them).
# Start them with your staging compose project if needed; otherwise ignore DOWN.
chk "buzz relay     (:3010)"     "nc -z 127.0.0.1 3010"
chk "primary model (:8555)"    "$OPS_DIR/bin/model-check.sh http://127.0.0.1:8555/v1 ternary-bonsai-2-27b:q2_0"

echo "-- tailnet / api_server (OPTIONAL — see docs/tailscale-optional.md) --"
if [ "${TAILNET_OPTIONAL:-0}" = "1" ]; then
TS="$([ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ] && echo /Applications/Tailscale.app/Contents/MacOS/Tailscale || echo tailscale)"
LIVE_IP="$("$TS" ip -4 2>/dev/null | head -1)"
if [ -n "$LIVE_IP" ] && lsof -nP -iTCP:8642 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "OK   api_server $LIVE_IP:8642 (tailnet up)"
else
  echo "DOWN api_server :8642 via tailnet (raise Tailscale, then hermes gateway restart)"
fi
else
  echo "SKIP tailnet check (local-only mode; set TAILNET_OPTIONAL=1 to enable)"
fi

echo "-- last night jobs --"
for f in pre-night.log post-night.log twenty-backup.log scheduler.log; do
  p="$OPS_DIR/run/$f"
  [ -f "$p" ] && echo "[$f] $(stat -f '%Sm' -t '%F %T' "$p"): $(grep -E 'PASS|FAIL|OK|BACKUP' "$p" | tail -1)"
done

echo "-- latest research digests --"
ls -t "$OPS_DIR/../docs/ops/research/"*.md 2>/dev/null | head -3 | while read -r d; do
  echo "$(basename "$d") ($(head -1 "$d" | cut -c1-60))"
done

echo "-- primary model (Ollama fleet) --"
if [ -f "$OPS_DIR/config/model.env" ]; then source "$OPS_DIR/config/model.env" 2>/dev/null || true; fi
PRIMARY_BASE_URL="${PRIMARY_BASE_URL:-http://127.0.0.1:8555/v1}"
PRIMARY_MODEL_ID="${PRIMARY_MODEL_ID:-ternary-bonsai-2-27b:q2_0}"
FALLBACK_BASE_URL="${FALLBACK_BASE_URL:-http://127.0.0.1:8555/v1}"
FALLBACK_MODEL_ID="${FALLBACK_MODEL_ID:-ternary-bonsai-2-27b:q2_0}"
if "$OPS_DIR/bin/model-check.sh" "$PRIMARY_BASE_URL" "$PRIMARY_MODEL_ID" >/dev/null 2>&1; then
  echo "OK   primary $PRIMARY_MODEL_ID ($PRIMARY_BASE_URL)"
else
  if "$OPS_DIR/bin/model-check.sh" "$FALLBACK_BASE_URL" "$FALLBACK_MODEL_ID" >/dev/null 2>&1; then
    echo "WARN primary $PRIMARY_MODEL_ID DOWN — fallback $FALLBACK_MODEL_ID OK ($FALLBACK_BASE_URL)"
  else
    echo "DOWN primary $PRIMARY_MODEL_ID ($PRIMARY_BASE_URL) + fallback ($FALLBACK_BASE_URL)"
  fi
fi
# :8555 is the 24/7 PRIMARY model server (ternary-bonsai-2-27b:q2_0 via Ollama proxy)
if ! curl -sf -m 2 http://127.0.0.1:8555/v1/models >/dev/null 2>&1; then
  echo "DOWN model :8555 primary server (run ops/bin/gemma-server.sh start)"
fi

echo "-- disk --"
df -g / | awk 'NR==2{print $4" GB free"}'