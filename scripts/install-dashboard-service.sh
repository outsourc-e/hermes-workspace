#!/usr/bin/env bash
set -euo pipefail

# Install Hermes Workspace as a user-level service.
# macOS: launchd user agent
# Linux: systemd --user unit

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="hermes-workspace"
PORT="${PORT:-3000}"
HOST="${HOST:-127.0.0.1}"
NODE_ENV="${NODE_ENV:-production}"
PNPM_BIN="${PNPM_BIN:-$(command -v pnpm || true)}"

if [[ -z "$PNPM_BIN" ]]; then
  echo "pnpm not found on PATH. Set PNPM_BIN=/path/to/pnpm and retry." >&2
  exit 1
fi

if [[ "${1:-install}" == "uninstall" ]]; then
  case "$(uname -s)" in
    Darwin)
      plist="$HOME/Library/LaunchAgents/com.hermes.workspace.plist"
      launchctl bootout "gui/$(id -u)" "$plist" 2>/dev/null || true
      rm -f "$plist"
      echo "Removed launchd user agent: $plist"
      ;;
    Linux)
      systemctl --user disable --now "$SERVICE_NAME.service" 2>/dev/null || true
      rm -f "$HOME/.config/systemd/user/$SERVICE_NAME.service"
      systemctl --user daemon-reload
      echo "Removed systemd user service: $SERVICE_NAME.service"
      ;;
    *)
      echo "Unsupported OS: $(uname -s)" >&2
      exit 1
      ;;
  esac
  exit 0
fi

case "$(uname -s)" in
  Darwin)
    mkdir -p "$HOME/Library/LaunchAgents" "$ROOT_DIR/logs"
    plist="$HOME/Library/LaunchAgents/com.hermes.workspace.plist"
    cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.hermes.workspace</string>
  <key>WorkingDirectory</key><string>$ROOT_DIR</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PNPM_BIN</string>
    <string>start</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key><string>$NODE_ENV</string>
    <key>HOST</key><string>$HOST</string>
    <key>PORT</key><string>$PORT</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$ROOT_DIR/logs/hermes-workspace.out.log</string>
  <key>StandardErrorPath</key><string>$ROOT_DIR/logs/hermes-workspace.err.log</string>
</dict>
</plist>
EOF
    launchctl bootout "gui/$(id -u)" "$plist" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$plist"
    launchctl kickstart -k "gui/$(id -u)/com.hermes.workspace"
    echo "Installed launchd user agent: $plist"
    ;;
  Linux)
    mkdir -p "$HOME/.config/systemd/user" "$ROOT_DIR/logs"
    unit="$HOME/.config/systemd/user/$SERVICE_NAME.service"
    cat > "$unit" <<EOF
[Unit]
Description=Hermes Workspace dashboard
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT_DIR
Environment=NODE_ENV=$NODE_ENV
Environment=HOST=$HOST
Environment=PORT=$PORT
ExecStart=$PNPM_BIN start
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable --now "$SERVICE_NAME.service"
    echo "Installed systemd user service: $SERVICE_NAME.service"
    ;;
  *)
    echo "Unsupported OS: $(uname -s)" >&2
    exit 1
    ;;
esac
