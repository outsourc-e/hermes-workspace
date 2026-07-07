#!/usr/bin/env bash
# Install launchd timers that give the new swarm agents recurring work:
#   - security-auditor : nightly 02:00  — dependency/secret/auth sweep
#   - quant-agent      : daily   07:00  — market + trading-pipeline brief
#   - concierge        : daily   08:00  — morning digest + greenlight queue
# Idempotent: re-running rewrites and reloads the plists.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DISPATCH="$REPO_DIR/scripts/swarm-scheduled-mission.sh"
LA_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$HOME/.hermes/logs"
mkdir -p "$LA_DIR" "$LOG_DIR"
chmod +x "$DISPATCH"

# label | hour | minute | worker | task
JOBS=(
  "com.hermes.swarm.security-nightly|2|0|security-auditor|Nightly security sweep of the hermes-workspace repo at $REPO_DIR: scan for dependency CVEs, secrets committed to the repo or logs, and missing auth/COOP/COEP headers on the workspace and gateway. Write concise, prioritized findings with file paths and a remediation for each. Do not change any files."
  "com.hermes.swarm.quant-morning|7|0|quant-agent|Produce today's market brief: check the papertrader/stocktrader/Polymarket pipelines under ~/workspace/Polymarket for health and recent P&L, summarize notable moves, and list any data-quality issues. Never execute trades. Save the brief to ~/workspace/vault/daily/."
  "com.hermes.swarm.concierge-digest|8|0|concierge|Produce the morning digest: summarize swarm activity and checkpoints from the last 24h, list any items awaiting operator greenlight, and surface anything blocked or needing input. Write it to ~/workspace/vault/daily/ as a dated note."
)

for spec in "${JOBS[@]}"; do
  IFS='|' read -r label hour minute worker task <<< "$spec"
  plist="$LA_DIR/$label.plist"
  cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$DISPATCH</string>
    <string>$worker</string>
    <string>$task</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$HOME/.local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>$hour</integer>
    <key>Minute</key><integer>$minute</integer>
  </dict>
  <key>StandardOutPath</key><string>$LOG_DIR/$label.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/$label.err</string>
</dict>
</plist>
EOF
  launchctl unload "$plist" 2>/dev/null || true
  launchctl load "$plist"
  echo "installed $label ($worker @ ${hour}:$(printf '%02d' "$minute"))"
done

# Two-way Discord bot (KeepAlive service, not a timer).
BOT_LABEL="com.hermes.discord-bot"
BOT_PLIST="$LA_DIR/$BOT_LABEL.plist"
NODE_BIN="$(command -v node || echo /opt/homebrew/bin/node)"
cat > "$BOT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$BOT_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$REPO_DIR/scripts/hermes-discord-bot.mjs</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$HOME/.local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$LOG_DIR/$BOT_LABEL.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/$BOT_LABEL.err</string>
</dict>
</plist>
EOF
launchctl unload "$BOT_PLIST" 2>/dev/null || true
launchctl load "$BOT_PLIST"
echo "installed $BOT_LABEL (KeepAlive)"

echo "Scheduled agents installed. List: launchctl list | grep com.hermes.swarm"
