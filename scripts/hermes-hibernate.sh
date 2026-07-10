#!/usr/bin/env bash
# Hibernate / wake the Hermes background fleet.
#
#   hermes-hibernate.sh stop    — disable + stop every com.hermes.* launchd job
#                                 EXCEPT com.hermes.workspace (UI stays up so
#                                 the Wake button works), kill swarm tmux
#                                 sessions, pause automated dispatch 7 days.
#   hermes-hibernate.sh start   — re-enable + start everything, clear pause.
#   hermes-hibernate.sh status  — "hibernating" or "awake"
#
# disable/enable persists across reboots — a week away survives a restart.
set -uo pipefail

ACTION="${1:?stop|start|status required}"
UID_N=$(id -u)
STATE_FILE="$HOME/.hermes/hibernate"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
KEEP="com.hermes.workspace"

labels() {
  for P in "$HOME"/Library/LaunchAgents/com.hermes.*.plist; do
    L=$(basename "$P" .plist)
    [ "$L" = "$KEEP" ] && continue
    echo "$L"
  done
}

case "$ACTION" in
  status)
    [ -f "$STATE_FILE" ] && echo hibernating || echo awake
    ;;
  stop)
    for L in $(labels); do
      launchctl disable "gui/$UID_N/$L" 2>/dev/null || true
      launchctl bootout "gui/$UID_N/$L" 2>/dev/null || true
    done
    # Kill any live worker sessions and pause dispatch for a week.
    # Resolve tmux explicitly: launchd's PATH misses /opt/homebrew/bin.
    TMUX_BIN=$(command -v tmux || echo /opt/homebrew/bin/tmux)
    "$TMUX_BIN" ls 2>/dev/null | cut -d: -f1 | grep '^swarm-' | while read -r S; do
      "$TMUX_BIN" kill-session -t "$S" 2>/dev/null || true
    done
    mkdir -p "$REPO/.runtime"
    echo "$((($(date +%s) + 7 * 86400) * 1000))" > "$REPO/.runtime/dispatch-pause-until"
    date > "$STATE_FILE"
    echo hibernating
    ;;
  start)
    for L in $(labels); do
      launchctl enable "gui/$UID_N/$L" 2>/dev/null || true
      launchctl bootstrap "gui/$UID_N" "$HOME/Library/LaunchAgents/$L.plist" 2>/dev/null || true
    done
    rm -f "$STATE_FILE" "$REPO/.runtime/dispatch-pause-until"
    echo awake
    ;;
  *)
    echo "usage: $0 stop|start|status" >&2
    exit 1
    ;;
esac
