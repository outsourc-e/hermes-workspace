#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3002}"
RUNTIME_DIR="$ROOT/.runtime"
PID_FILE="$RUNTIME_DIR/claude-workspace.pid"
LOG_FILE="$RUNTIME_DIR/claude-workspace.log"
BUILD_LOG_FILE="$RUNTIME_DIR/claude-workspace.build.log"
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

if [[ -f "$PID_FILE" ]]; then
  old_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$old_pid" ]]; then
    stop_pid "$old_pid"
  fi
  rm -f "$PID_FILE"
fi

for pid in $(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true); do
  stop_pid "$pid"
done

echo "[stable] building Claude Workspace..."
rm -rf dist
pnpm build >"$BUILD_LOG_FILE" 2>&1

echo "[stable] starting Claude Workspace on port $PORT..."
nohup env PORT="$PORT" NODE_OPTIONS="--max-old-space-size=2048" node server-entry.js >>"$LOG_FILE" 2>&1 &
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
