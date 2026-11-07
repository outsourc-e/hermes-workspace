#!/usr/bin/env bash
# tailscale-keepalive.sh — OPT-IN ONLY (disabled by default, see docs/tailscale-optional.md).
# Ensures the tailnet is up so hermes api_server is reachable on the tailnet IP.
# Run by launchd (com.ops.tailscale-alive) ONLY when multi-device access is needed.
# Local-only mode does not need this: gateway + dashboard run on 127.0.0.1.
# If Tailscale is stopped, relaunch the GUI app; the health guard (ops-status.sh /
# run-fleet-health.sh L1) then flags a still-unbound :8642 for manual recovery.
set -u
LOG="$HOME/hermes-workspace/ops/run/tailscale-alive.log"
TS="$([ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ] && echo /Applications/Tailscale.app/Contents/MacOS/Tailscale || echo tailscale)"
IP="$("$TS" ip -4 2>/dev/null | head -1 | tr -d ' ')"
if [ "$IP" = "100.85.50.87" ]; then
  echo "$(date '+%F %T') tailscale up ($IP)" >> "$LOG"
  exit 0
fi
echo "$(date '+%F %T') tailscale down (ip='${IP:-none}') — opening app" >> "$LOG"
pgrep -fl "Tailscale.app" >/dev/null 2>&1 || open -a Tailscale