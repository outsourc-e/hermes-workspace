#!/usr/bin/env bash
# Hermes watchdog — the agent that watches the watchers.
#
# Runs every 5 minutes via launchd (com.hermes.watchdog). Checks:
#   1. workspace HTTP (:3000)           — auto-restart via launchctl kickstart
#   2. gateway HTTP (:8642)             — auto-restart
#   3. dashboard HTTP (:9119)           — auto-restart
#   4. discord-bot process              — auto-restart
#   5. disk space on $HOME volume       — alert < 10 GB free
#   6. wedged workers                   — runtime.json executing > 2h with no
#                                         output — alert (never auto-kill work)
#
# Every failure/restart posts to the Discord home channel. A restart is only
# attempted once per check cycle; if the service is still down on the NEXT
# cycle, the alert escalates (mentions repeated failure). State lives in
# ~/.hermes/logs/watchdog-state.json. All checks best-effort — the watchdog
# must never crash out early because one probe failed.
set -uo pipefail

ENV_FILE="${HERMES_ENV_FILE:-$HOME/.hermes/.env}"
LOG_DIR="$HOME/.hermes/logs"
STATE_FILE="$LOG_DIR/watchdog-state.json"
PROFILES_DIR="$HOME/.hermes/profiles"
mkdir -p "$LOG_DIR"

getenv() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' '; }
BOT_TOKEN="$(getenv DISCORD_BOT_TOKEN)"
CHANNEL="$(getenv DISCORD_HOME_CHANNEL)"

ALERTS=()

alert() { ALERTS+=("$1"); echo "[watchdog] $1"; }

flush_alerts() {
  [ ${#ALERTS[@]} -eq 0 ] && return 0
  [ -z "$BOT_TOKEN" ] || [ -z "$CHANNEL" ] && return 0
  local body
  body=$(printf '%s\n' "${ALERTS[@]}" | python3 -c 'import json,sys;print(json.dumps({"content":"🐕 **Watchdog**\n"+sys.stdin.read()[:1800]}))')
  curl -sS -m 10 -X POST \
    -H "Authorization: Bot $BOT_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$body" \
    "https://discord.com/api/v10/channels/$CHANNEL/messages" >/dev/null 2>&1 || true
}

# ---- state (tracks consecutive failures per check) ---------------------------
get_fails() {
  python3 -c "
import json,sys
try: d=json.load(open('$STATE_FILE'))
except Exception: d={}
print(d.get('$1',0))" 2>/dev/null || echo 0
}
set_fails() {
  python3 -c "
import json
try: d=json.load(open('$STATE_FILE'))
except Exception: d={}
d['$1']='$2'
json.dump(d,open('$STATE_FILE','w'))" 2>/dev/null || true
}

# ---- HTTP service checks ------------------------------------------------------
# any HTTP status counts as alive; only connection failure is down.
check_http_service() {
  local name="$1" url="$2" label="$3"
  if curl -s -o /dev/null -m 8 "$url" 2>/dev/null; then
    set_fails "$name" 0
    return 0
  fi
  local fails
  fails=$(( $(get_fails "$name") + 1 ))
  set_fails "$name" "$fails"
  if [ "$fails" -ge 2 ]; then
    alert "❌ $name still DOWN after restart attempt (check $fails cycles) — needs a human. \`launchctl list | grep ${label}\`"
  else
    alert "⚠️ $name down — restarting via launchctl kickstart $label"
    launchctl kickstart -k "gui/$(id -u)/$label" 2>/dev/null || alert "❌ kickstart $label failed"
  fi
}

check_http_service workspace "http://127.0.0.1:3000/api/ping" com.hermes.workspace
check_http_service gateway "http://127.0.0.1:8642/" com.hermes.gateway
check_http_service dashboard "http://127.0.0.1:9119/" com.hermes.dashboard

# ---- discord bot process ------------------------------------------------------
if pgrep -f "hermes-discord-bot.mjs" >/dev/null 2>&1; then
  set_fails discord-bot 0
else
  fails=$(( $(get_fails discord-bot) + 1 ))
  set_fails discord-bot "$fails"
  if [ "$fails" -ge 2 ]; then
    alert "❌ discord-bot still down after restart (cycle $fails) — check ~/.hermes/logs/com.hermes.discord-bot.err"
  else
    alert "⚠️ discord-bot process missing — restarting"
    launchctl kickstart -k "gui/$(id -u)/com.hermes.discord-bot" 2>/dev/null || true
  fi
fi

# ---- disk space ---------------------------------------------------------------
free_gb=$(df -g "$HOME" 2>/dev/null | awk 'NR==2 {print $4}')
if [ -n "${free_gb:-}" ] && [ "$free_gb" -lt 10 ]; then
  # Alert at most once per day (compare stamp).
  today=$(date +%Y%m%d)
  if [ "$(get_fails disk_stamp)" != "$today" ]; then
    set_fails disk_stamp "$today"
    alert "💾 Low disk: ${free_gb}GB free on $HOME volume."
  fi
fi

# ---- wedged workers -----------------------------------------------------------
# runtime.json state=executing with lastOutputAt older than 2h = wedged.
if [ -d "$PROFILES_DIR" ]; then
  wedged=$(python3 - "$PROFILES_DIR" <<'PY'
import json, os, sys, time
profiles = sys.argv[1]
now_ms = time.time() * 1000
rows = []
for worker in sorted(os.listdir(profiles)):
    rt = os.path.join(profiles, worker, 'runtime.json')
    try:
        d = json.load(open(rt))
    except Exception:
        continue
    if d.get('state') != 'executing':
        continue
    last = d.get('lastOutputAt') or d.get('lastDispatchAt') or 0
    if last and now_ms - last > 2 * 3600 * 1000:
        hours = (now_ms - last) / 3600000
        rows.append(f"{worker} ({hours:.1f}h silent)")
print(', '.join(rows))
PY
)
  if [ -n "$wedged" ]; then
    today_w="wedged_$(date +%Y%m%d%H)"  # at most one alert per hour
    if [ "$(get_fails wedge_stamp)" != "$today_w" ]; then
      set_fails wedge_stamp "$today_w"
      alert "🧊 Wedged workers (executing >2h, no output): $wedged — check the swarm board; \`!blocked\` or Clear All if stuck."
    fi
  fi
fi

flush_alerts
exit 0
