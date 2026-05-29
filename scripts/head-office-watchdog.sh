#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-/root/hermes-workspace}"
HERMES_HOME="${HERMES_HOME:-/root/.hermes}"
LOG_DIR="$HERMES_HOME/logs"
LOCK_FILE="/tmp/hermes-head-office-watchdog.lock"
HEALTH_SCRIPT="$ROOT/scripts/head-office-health.sh"
mkdir -p "$LOG_DIR"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

run_health() {
  cd "$ROOT"
  "$HEALTH_SCRIPT"
}

ensure_tmux_session() {
  local name="$1"
  if ! tmux has-session -t "$name" 2>/dev/null; then
    tmux new-session -d -s "$name"
  fi
}

restart_workspace_ui() {
  log "recovery: restarting Workspace UI tmux session ui"
  ensure_tmux_session ui
  tmux send-keys -t ui C-c
  sleep 1
  tmux send-keys -t ui 'cd /root/hermes-workspace && pnpm dev' Enter
}

restart_gateway() {
  log "recovery: restarting Hermes gateway in tmux session gateway"
  ensure_tmux_session gateway
  tmux send-keys -t gateway C-c
  sleep 2
  tmux send-keys -t gateway 'hermes gateway run' Enter
}

with_lock() {
  flock -n 9 || {
    log "skip: watchdog already running"
    exit 0
  }

  local health_out
  health_out="$(mktemp)"
  if run_health >"$health_out" 2>&1; then
    log "healthy: Head Office operational"
    rm -f "$health_out"
    exit 0
  fi

  log "unhealthy: initial health check failed"
  sed 's/^/[health] /' "$health_out"

  local gateway_ok=0
  if curl -fsS http://127.0.0.1:8642/health >/dev/null 2>&1; then
    gateway_ok=1
  fi

  local workspace_ok=0
  if curl -fsS http://127.0.0.1:3000/chat >/dev/null 2>&1; then
    workspace_ok=1
  fi

  if [ "$gateway_ok" -ne 1 ]; then
    restart_gateway
    sleep 25
  fi

  if [ "$workspace_ok" -ne 1 ]; then
    restart_workspace_ui
    sleep 15
  fi

  # If both ports were up but the end-to-end health failed, prefer restarting
  # Workspace first. Gateway/Telegram is the primary control channel, so touch
  # it only when its own health endpoint or completion route fails.
  if [ "$gateway_ok" -eq 1 ] && [ "$workspace_ok" -eq 1 ]; then
    local token
    token="$(grep '^HERMES_API_TOKEN=' "$ROOT/.env" 2>/dev/null | cut -d= -f2- || true)"
    if [ -n "$token" ] && timeout 45s curl -fsS -X POST http://127.0.0.1:8642/v1/chat/completions \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $token" \
      --data '{"model":"hermes-agent","messages":[{"role":"user","content":"reply exactly WATCHDOG_OK"}],"stream":false}' | grep -q WATCHDOG_OK; then
      restart_workspace_ui
      sleep 15
    else
      restart_gateway
      sleep 25
    fi
  fi

  if run_health >"$health_out" 2>&1; then
    log "recovered: Head Office operational"
    rm -f "$health_out"
    exit 0
  fi

  log "failed: recovery attempted but health still fails"
  sed 's/^/[health] /' "$health_out"
  rm -f "$health_out"
  exit 1
}

with_lock 9>"$LOCK_FILE"
