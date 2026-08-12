#!/usr/bin/env bash
set -euo pipefail

# Install the worktree cleanup sweep as a user-level systemd timer.
#
# Runs scripts/swarm-worktree-sweep.sh every 6 hours (configurable).
# By default runs in dry-run mode. Set SWEEP_REMOVE=true in the service
# environment to actually remove worktrees.
#
# Usage:
#   ./install-worktree-sweep.sh           # install
#   ./install-worktree-sweep.sh uninstall # remove
#
# Environment:
#   SWEEP_INTERVAL      systemd OnCalendar spec (default: *-*-* 00/6:00:00)
#   SWEEP_REMOVE        Set to "true" to actually remove (default: false)
#   SWARM_BASE_URL      Workspace base URL (default: http://localhost:3000)
#   SWEEP_MAX_AGE_HOURS Max age in hours (default: 168)
#   SWEEP_LEASE_HOURS   Lease expiry in hours (default: 0 = disabled)
#   SWEEP_AUTH_COOKIE   Auth cookie for non-local deployments (default: none)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="hermes-worktree-sweep"
INTERVAL="${SWEEP_INTERVAL:-*-*-* 00/6:00:00}"

if [[ "${1:-install}" == "uninstall" ]]; then
  systemctl --user disable --now "${SERVICE_NAME}.timer" 2>/dev/null || true
  rm -f "$HOME/.config/systemd/user/${SERVICE_NAME}.service"
  rm -f "$HOME/.config/systemd/user/${SERVICE_NAME}.timer"
  systemctl --user daemon-reload
  echo "Removed systemd user units: ${SERVICE_NAME}.service + ${SERVICE_NAME}.timer"
  exit 0
fi

mkdir -p "$HOME/.config/systemd/user"

# --- Service unit ---
cat > "$HOME/.config/systemd/user/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Hermes Workspace worktree cleanup sweep

[Service]
Type=oneshot
WorkingDirectory=${ROOT_DIR}
Environment=SWEEP_REMOVE=${SWEEP_REMOVE:-false}
Environment=SWARM_BASE_URL=${SWARM_BASE_URL:-http://localhost:3000}
Environment=SWEEP_MAX_AGE_HOURS=${SWEEP_MAX_AGE_HOURS:-168}
Environment=SWEEP_LEASE_HOURS=${SWEEP_LEASE_HOURS:-0}
Environment=SWEEP_AUTH_COOKIE=${SWEEP_AUTH_COOKIE:-}
ExecStart=${ROOT_DIR}/scripts/swarm-worktree-sweep.sh
EOF

# --- Timer unit ---
cat > "$HOME/.config/systemd/user/${SERVICE_NAME}.timer" <<EOF
[Unit]
Description=Run Hermes worktree cleanup sweep every ${INTERVAL}

[Timer]
OnCalendar=${INTERVAL}
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now "${SERVICE_NAME}.timer"

echo "Installed systemd user timer: ${SERVICE_NAME}.timer (interval: ${INTERVAL})"
echo "  Service: ${SERVICE_NAME}.service"
echo "  Sweep script: ${ROOT_DIR}/scripts/swarm-worktree-sweep.sh"
echo "  Remove mode: ${SWEEP_REMOVE:-false}"
echo ""
echo "Check status:  systemctl --user status ${SERVICE_NAME}.timer"
echo "Run manually:  systemctl --user start ${SERVICE_NAME}.service"
echo "View logs:     journalctl --user -u ${SERVICE_NAME}.service"
