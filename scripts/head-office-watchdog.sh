#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-/root/hermes-workspace}"
HERMES_HOME="${HERMES_HOME:-/root/.hermes}"
LOG_DIR="$HERMES_HOME/logs"
LOCK_FILE="/tmp/hermes-head-office-watchdog.lock"
HEALTH_SCRIPT="$ROOT/scripts/head-office-health.sh"
MODE="${1:-light}"
mkdir -p "$LOG_DIR"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

run_deep_health() {
  cd "$ROOT"
  "$HEALTH_SCRIPT"
}

run_light_health() {
  curl -fsS http://127.0.0.1:8642/health >/dev/null
  curl -fsS http://127.0.0.1:3000/chat >/dev/null
  command -v codex >/dev/null
  local codex_status
  codex_status="$(codex login status 2>&1)"
  echo "$codex_status" | grep -q "Logged in using ChatGPT"
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

  if [ "$MODE" = "deep" ]; then
    if run_deep_health >"$health_out" 2>&1; then
      log "healthy: deep Head Office health passed"
      rm -f "$health_out"
      exit 0
    fi
    log "unhealthy: deep health check failed"
  else
    if run_light_health >"$health_out" 2>&1; then
      log "healthy: light checks passed"
      rm -f "$health_out"
      exit 0
    fi
    log "unhealthy: light checks failed; starting recovery"
  fi

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

  # Only spend model usage after a failure/recovery attempt, to verify the
  # full path is truly back. Normal 5-minute checks are cheap HTTP checks.
  if run_deep_health >"$health_out" 2>&1; then
    log "recovered: deep Head Office health passed"
    rm -f "$health_out"
    exit 0
  fi

  # If ports were up but deep health failed, restart Workspace first to preserve
  # Telegram as the control channel, then verify once more.
  if [ "$gateway_ok" -eq 1 ] && [ "$workspace_ok" -eq 1 ]; then
    restart_workspace_ui
    sleep 15
    if run_deep_health >"$health_out" 2>&1; then
      log "recovered: Workspace restart restored deep health"
      rm -f "$health_out"
      exit 0
    fi
  fi

  log "failed: recovery attempted but health still fails"
  sed 's/^/[health] /' "$health_out"
  rm -f "$health_out"
  exit 1
}

with_lock 9>"$LOCK_FILE"
