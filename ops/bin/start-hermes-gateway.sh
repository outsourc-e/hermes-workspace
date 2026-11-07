#!/usr/bin/env bash
# start-hermes-gateway.sh — Local-only gateway launcher (no Tailscale)
# Waits for model server on :8555, then starts Hermes gateway on :8642
set -euo pipefail

LOG="${LOG:-/Users/andreasnahrgang/.hermes/logs/gateway-launch.log}"
HERMES_HOME="/Users/andreasnahrgang/.hermes"
PYTHON="${PYTHON:-$HERMES_HOME/hermes-agent/venv/bin/python}"
MODULE="${MODULE:-hermes_cli.main}"

log() { printf '%s [gateway-launch] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG"; }

wait_for_model() {
  log "Waiting for model server on :8555..."
  for i in $(seq 1 60); do
    if curl -sf -m 5 "http://127.0.0.1:8555/v1/models" 2>/dev/null | grep -qi "ternary-bonsai"; then
      log "Model server ready."
      return 0
    fi
    sleep 2
  done
  log "ERROR: Model server not ready after 120s"
  return 1
}

# Ensure HERMES_HOME is set
export HERMES_HOME

# Wait for model server
wait_for_model

# Launch gateway (bind to localhost only - no Tailscale needed)
log "Launching Hermes gateway: $PYTHON -m $MODULE gateway run --external-supervisor"
exec "$PYTHON" -m "$MODULE" gateway run --external-supervisor