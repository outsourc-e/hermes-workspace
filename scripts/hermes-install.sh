#!/usr/bin/env bash
# Hermes one-command install / repair.
#
#   bash scripts/hermes-install.sh
#
# Idempotent. Checks prerequisites, builds the app, (re)generates the
# launchd fleet from the plists already in ~/Library/LaunchAgents or from
# built-in templates, and prints a checklist of anything only the operator
# can do (tokens, phone app, OAuth consents).
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$HOME/.hermes/.env"
LA="$HOME/Library/LaunchAgents"
PASS=0; WARN=0

ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
warn() { echo "  ⚠️  $1"; WARN=$((WARN+1)); }

echo "== Hermes install ($REPO) =="

echo "-- prerequisites"
command -v node >/dev/null 2>&1 && ok "node $(node --version)" || warn "node missing — install Node 20+"
command -v tmux >/dev/null 2>&1 && ok "tmux" || warn "tmux missing — brew install tmux"
command -v claude >/dev/null 2>&1 && ok "claude CLI" || warn "claude CLI missing"
[ -f "$ENV_FILE" ] && ok "~/.hermes/.env exists" || { mkdir -p "$HOME/.hermes"; touch "$ENV_FILE"; chmod 600 "$ENV_FILE"; warn "~/.hermes/.env created empty — add tokens"; }
mkdir -p "$HOME/.hermes/logs" "$HOME/.hermes/profiles" "$REPO/.runtime"

echo "-- dependencies + build"
if [ ! -d "$REPO/node_modules" ]; then
  (cd "$REPO" && npm install --no-fund --no-audit) && ok "npm install" || warn "npm install failed"
else
  ok "node_modules present"
fi
(cd "$REPO" && node_modules/.bin/vite build >/dev/null 2>&1) && ok "production build" || warn "vite build failed — run manually to see errors"

echo "-- launchd fleet"
# Core service: generate only if absent (never clobber hand-edited plists).
WS_PLIST="$LA/com.hermes.workspace.plist"
if [ ! -f "$WS_PLIST" ]; then
  cat > "$WS_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.hermes.workspace</string>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>ProgramArguments</key><array>
    <string>$(command -v node || echo /usr/local/bin/node)</string>
    <string>$REPO/server-entry.js</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/.hermes/logs/workspace.log</string>
  <key>StandardErrorPath</key><string>$HOME/.hermes/logs/workspace.err</string>
</dict></plist>
PLIST
  ok "generated $WS_PLIST"
else
  ok "workspace plist present"
fi

for SVC in workspace watchdog swarm-sweep discord-bot backup weekly-report; do
  P="$LA/com.hermes.$SVC.plist"
  if [ -f "$P" ]; then
    launchctl bootstrap "gui/$(id -u)" "$P" 2>/dev/null || true
    launchctl kickstart "gui/$(id -u)/com.hermes.$SVC" 2>/dev/null \
      && ok "com.hermes.$SVC loaded" || warn "com.hermes.$SVC failed to start"
  else
    warn "com.hermes.$SVC plist missing (optional service)"
  fi
done

echo "-- health"
sleep 2
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ | grep -q 200 \
  && ok "workspace answering on :3000" || warn "workspace not answering on :3000"

echo "-- operator checklist (cannot be automated)"
grep -q '^DISCORD_BOT_TOKEN=' "$ENV_FILE" || echo "  · add DISCORD_BOT_TOKEN to ~/.hermes/.env"
grep -q '^HERMES_NTFY_TOPIC=' "$ENV_FILE" || echo "  · add HERMES_NTFY_TOPIC + install ntfy app on phone"
[ -f "$HOME/.hermes/google-token.json" ] || echo "  · run: node scripts/hermes-gmail-auth.mjs (Gmail consent)"
security find-generic-password -s "GitHub - https://api.github.com" -w >/dev/null 2>&1 || echo "  · add GitHub token to keychain"

echo "== done: $PASS ok, $WARN warnings =="
