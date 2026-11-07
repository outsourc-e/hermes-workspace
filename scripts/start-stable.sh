#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3001}"
HOST="${HOST:-127.0.0.1}"
# FOREGROUND=1: run node in the foreground via exec, so launchd owns the
# server process (no respawn loop). Default 0 keeps the cron/nohup behavior.
FOREGROUND="${FOREGROUND:-0}"
LSOF="/usr/sbin/lsof"
RUNTIME_DIR="$ROOT/.runtime"
PID_FILE="$RUNTIME_DIR/hermes-workspace.pid"
LOG_FILE="$RUNTIME_DIR/hermes-workspace.log"
BUILD_LOG_FILE="$RUNTIME_DIR/hermes-workspace.build.log"
mkdir -p "$RUNTIME_DIR"

stop_pid() {
  local pid="$1"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    for _ in {1..20}; do
      if ! kill -0 "$pid" 2>/dev/null; then
        return 0
      fi
      sleep 0.25
    done
    kill -9 "$pid" 2>/dev/null || true
  fi
}

if [[ ! -x "$LSOF" ]]; then
  echo "[stable] FATAL: $LSOF not found — refusing to guess port state" >&2
  exit 1
fi

if [[ -f "$PID_FILE" ]]; then
  old_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$old_pid" ]]; then
    stop_pid "$old_pid"
  fi
  rm -f "$PID_FILE"
fi

for pid in $("$LSOF" -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null); do
  stop_pid "$pid"
done

# Preflight: if the port is STILL busy after our own cleanup, someone else
# owns it. Never double-bind — abort loudly instead of racing a second server.
if "$LSOF" -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | grep -q .; then
  echo "[stable] FATAL: port $PORT still busy after cleanup — aborting" >&2
  "$LSOF" -nP -iTCP:"$PORT" -sTCP:LISTEN >&2 || true
  exit 1
fi

echo "[stable] building Hermes Workspace..."
# Hourly watchdog callers don't need a full rebuild if a usable bundle exists.
# SKIP_BUILD=1 (or existing dist/server entry) avoids a full build every hour.
if [[ "${SKIP_BUILD:-0}" = "1" && -f dist/server/server.js ]]; then
  echo "[stable] SKIP_BUILD=1 and dist present — skipping build"
else
  rm -rf dist
  pnpm build >"$BUILD_LOG_FILE" 2>&1 || {
    echo "[stable] FATAL: build failed, see $BUILD_LOG_FILE" >&2
    exit 1
  }
fi

echo "[stable] starting Hermes Workspace on ${HOST}:${PORT}..."

if [[ "$FOREGROUND" = "1" ]]; then
  # Foreground mode (launchd): exec replaces this shell with the server,
  # so launchd watches the actual node process and KeepAlive works correctly.
  exec env PORT="$PORT" HOST="$HOST" NODE_OPTIONS="--max-old-space-size=2048" node server-entry.js >>"$LOG_FILE" 2>&1
fi

nohup env PORT="$PORT" HOST="$HOST" NODE_OPTIONS="--max-old-space-size=2048" node server-entry.js >>"$LOG_FILE" 2>&1 &
new_pid=$!
echo "$new_pid" >"$PID_FILE"

for _ in {1..40}; do
  if curl -fsS "http://127.0.0.1:$PORT/chat/new" >/dev/null 2>&1; then
    echo "[stable] up on http://127.0.0.1:$PORT/chat/new"
    echo "[stable] pid=$new_pid"
    echo "[stable] log=$LOG_FILE"
    exit 0
  fi
  if ! kill -0 "$new_pid" 2>/dev/null; then
    echo "[stable] failed to start, see $LOG_FILE and $BUILD_LOG_FILE" >&2
    exit 1
  fi
  sleep 0.25
done

echo "[stable] timed out waiting for startup, see $LOG_FILE" >&2
exit 1
