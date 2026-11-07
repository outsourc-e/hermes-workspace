#!/usr/bin/env bash
# pre-night-check.sh — gatekeeper for the night batch window.
# FAIL (non-zero) must abort all night jobs and alert.
set -u
OPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_DIR="$OPS_DIR/run"; mkdir -p "$RUN_DIR"
# Single source of truth for model routing — locked 2026-10-11
# Primary: ternary-bonsai-2-27b:q2_0 (Ollama :11434, proxied to :8555) — ops/bin/gemma-server.sh
# Fallback: same model (unified fleet) — docs/ops/model-policy.md
[ -f "$OPS_DIR/config/model.env" ] && source "$OPS_DIR/config/model.env"
PRIMARY_MODEL_ID="${PRIMARY_MODEL_ID:-ternary-bonsai-2-27b:q2_0}"
PRIMARY_BASE_URL="${PRIMARY_BASE_URL:-http://127.0.0.1:8555/v1}"
FALLBACK_MODEL_ID="${FALLBACK_MODEL_ID:-ternary-bonsai-2-27b:q2_0}"
FALLBACK_BASE_URL="${FALLBACK_BASE_URL:-http://127.0.0.1:8555/v1}"
fail() { echo "PRE-NIGHT FAIL: $1"; exit 1; }

h=$(date +%H); [ "${FORCE:-0}" = "1" ] || { [ $h -ge 0 ] && [ $h -le 6 ]; } || fail "outside night window (hour=$h)"

echo "[1/5] ollama primary model present ($PRIMARY_MODEL_ID)"
if "$OPS_DIR/bin/model-check.sh" "$PRIMARY_BASE_URL" "$PRIMARY_MODEL_ID" >/dev/null; then
  echo "  primary PASS: $PRIMARY_BASE_URL serves $PRIMARY_MODEL_ID"
else
  echo "  WARN primary $PRIMARY_MODEL_ID not reachable — checking fallback $FALLBACK_MODEL_ID"
  "$OPS_DIR/bin/model-check.sh" "$FALLBACK_BASE_URL" "$FALLBACK_MODEL_ID" >/dev/null || fail "neither primary ($PRIMARY_MODEL_ID) nor fallback ($FALLBACK_MODEL_ID) reachable"
  echo "  fallback PASS: $FALLBACK_BASE_URL serves $FALLBACK_MODEL_ID (degraded)"
fi

echo "[2/5] disk space"
free_gb=$(df -g / | awk 'NR==2{print $4}')
[ "$free_gb" -ge 20 ] || fail "only ${free_gb}GB free on /"

echo "[3/5] no stale locks"
stale=$(find "$RUN_DIR" -name "*.lock" -mmin +360 2>/dev/null)
[ -z "$stale" ] || { rm -f "$RUN_DIR"/*.lock; echo "  removed stale locks: $stale"; }

echo "[4/5] primary model $PRIMARY_MODEL_ID present"
if ! "$OPS_DIR/bin/model-check.sh" "$PRIMARY_BASE_URL" "$PRIMARY_MODEL_ID" >/dev/null; then
  "$OPS_DIR/bin/model-check.sh" "$FALLBACK_BASE_URL" "$FALLBACK_MODEL_ID" >/dev/null || fail "$PRIMARY_MODEL_ID not reachable and fallback $FALLBACK_MODEL_ID also not reachable"
  echo "  WARN primary failed — fallback $FALLBACK_MODEL_ID available"
fi

echo "[5/5] completion sanity (try primary, then fallback)"
if ! "$OPS_DIR/bin/model-check.sh" "$PRIMARY_BASE_URL" "$PRIMARY_MODEL_ID" --completion >/dev/null; then
  echo "  WARN primary completion failed — trying fallback"
  "$OPS_DIR/bin/model-check.sh" "$FALLBACK_BASE_URL" "$FALLBACK_MODEL_ID" --completion || fail "both primary and fallback completion failed"
  echo "  fallback completion PASS"
fi

echo "[6/6] queue tonight's kanban cards"
KB="$OPS_DIR/bin/kanban.sh"
TODAY=$(date +%F)
if [ -x "$KB" ]; then
  for A in competitor-scout customer-watcher partner-radar product-intel chief-of-staff; do
    CID=$("$KB" latest --agent "$A" 2>/dev/null | head -1)
    if [ -n "$CID" ] && "$KB" get "$CID" 2>/dev/null | grep -q "^title=night-run: $A $TODAY\$"; then
      echo "  = already queued: $A"
    elif CID=$("$KB" create --agent "$A" --title "night-run: $A $TODAY" \
        --spec "queued by pre-night-check — run via launchd ops/bin/run-*.sh on Gemma fleet (not via Hermes gateway dispatcher). Dispatcher: ignore — status=queued until runner promotes to running." --lane backlog --created-by pre-night-check 2>/dev/null); then
      echo "  + queued: $A ($CID) — lane backlog (queued) to avoid Hermes gateway auto-dispatch race; runner will promote to running"
    else
      echo "  (kanban unavailable — $A runs without a board card)"
    fi
  done
else
  echo "  (kanban wrapper missing — skipping board queue)"
fi

date +%s > "$RUN_DIR/pre-night.ok"
echo "PRE-NIGHT PASS"