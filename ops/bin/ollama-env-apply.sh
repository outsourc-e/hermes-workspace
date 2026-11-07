#!/bin/bash
# ollama-env-apply.sh — R7 (remediation-2026-11-04 §3.3): raise the single decode
# lane (head-of-line blocking) by serving Ollama with OLLAMA_NUM_PARALLEL=3.
#
# Why this script: the running server is Ollama.app's GUI-spawned `ollama serve`
# (unsupervised besides the app). Env vars only take effect at server start, so
# the script is idempotent: set GUI-domain env, verify the LIVE server carries
# it (ps eww), and only if it does not — restart the app gracefully, wait for
# the port, re-verify. A login LaunchAgent (com.ops.ollama-env.plist) re-asserts
# this after every reboot.
#
# Side effect of a restart: interactive `ollama run` CLI carts are dropped (they
# reconnect trivially). Nothing scheduled depends on :11434 continuity.
#
# Usage: ollama-env-apply.sh [parallel-count]   (default 3)
# Exit 0 PASS / 1 FAIL. Log: ops/run/ollama-env.log
set -u
VAL="${1:-3}"
LOG="${OLLAMA_ENV_LOG:-$(cd "$(dirname "$0")/../run" 2>/dev/null && pwd)/ollama-env.log}"
PORT=11434
log(){ echo "[$(date +%F_%T)] $*" >> "$LOG"; }

log "--- ollama-env-apply start (target OLLAMA_NUM_PARALLEL=$VAL) ---"
launchctl setenv OLLAMA_NUM_PARALLEL "$VAL" || { log "FAIL launchctl setenv"; exit 1; }
# keep-alive default is fine (5m); not touching model lifecycle here.
log "set GUI-domain OLLAMA_NUM_PARALLEL=$VAL"

serve_pid(){ pgrep -f '/Applications/Ollama.app/Contents/Resources/ollama serve' | head -1; }
port_up(){ curl -s -m 3 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" 2>/dev/null | grep -q 404 \
  || curl -s -m 3 "http://127.0.0.1:$PORT/api/version" >/dev/null 2>&1; }
env_ok(){ local p; p=$(serve_pid); [ -n "$p" ] && ps eww -p "$p" 2>/dev/null | grep -q "OLLAMA_NUM_PARALLEL=$VAL"; }

if ! serve_pid >/dev/null; then
  log "server not running — launching Ollama.app"
  open -ga Ollama
  i=0; while [ $i -lt 30 ] && ! { serve_pid >/dev/null && port_up; }; do sleep 2; i=$((i+1)); done
fi

if serve_pid >/dev/null && env_ok; then
  log "PASS live server (pid $(serve_pid)) already carries OLLAMA_NUM_PARALLEL=$VAL"; exit 0
fi

p=$(serve_pid)
if [ -n "$p" ]; then
  log "live server pid=$p lacks the env — restarting the whole Ollama.app (interactive ollama run carts will drop)"
  osascript -e 'tell application "Ollama" to quit' >/dev/null 2>&1
  i=0; while [ $i -lt 10 ] && pgrep -f 'Ollama.app/Contents/MacOS/Ollama' >/dev/null 2>&1; do sleep 2; i=$((i+1)); done
  # Electron ignores AppleScript quit when its menu-bar app is torn: SIGTERM the main process
  pgrep -f 'Ollama.app/Contents/MacOS/Ollama' >/dev/null 2>&1 && { log "WARN AppleScript quit ignored — SIGTERM the Electron main"; pkill -TERM -f 'Ollama.app/Contents/MacOS/Ollama' 2>/dev/null; sleep 3; }
  pkill -TERM -f 'Ollama.app.*ollama serve' 2>/dev/null
  sleep 4
fi
unset p

log "launching Ollama.app"
# `open -ga` on a RUNNING app is a no-op: a pre-existing Electron process keeps
# its stale env snapshot and respawns the serve without the var — enforced by
# the full kill above.
open -ga Ollama
i=0; while [ $i -lt 30 ] && ! { serve_pid >/dev/null && port_up; }; do sleep 2; i=$((i+1)); done

p=$(serve_pid)
if [ -n "$p" ] && port_up && env_ok; then
  log "PASS restarted server pid=$p carries OLLAMA_NUM_PARALLEL=$VAL (port $PORT up)"; exit 0
fi
log "FAIL server not serving with env (pid=${p:-none}, port_up=$(port_up && echo yes || echo no), env_ok=$(env_ok && echo yes || echo no))"
exit 1
