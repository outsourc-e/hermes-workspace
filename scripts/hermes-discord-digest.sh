#!/usr/bin/env bash
# Post a swarm digest + greenlight queue to Discord.
# Pulls live state from the workspace API and posts a formatted summary via the
# Hermes Discord bot. Intended for a daily launchd timer (and reusable ad-hoc).
#
# Token + channel come from ~/.hermes/.env (DISCORD_BOT_TOKEN, and channel from
# DISCORD_DIGEST_CHANNEL || DISCORD_HOME_CHANNEL). If that channel is
# unreachable, auto-discovers the first text channel the bot can post to.
# Secrets are never printed.
set -euo pipefail

ENV_FILE="${HERMES_ENV_FILE:-$HOME/.hermes/.env}"
BASE_URL="${SWARM_BASE_URL:-http://localhost:3000}"
SESSIONS_FILE="${SWARM_SESSIONS_FILE:-$HOME/.hermes/workspace-sessions.json}"

getenv() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' '; }

BOT_TOKEN="$(getenv DISCORD_BOT_TOKEN)"
[ -n "$BOT_TOKEN" ] || { echo "no DISCORD_BOT_TOKEN" >&2; exit 1; }
CHANNEL="${DISCORD_DIGEST_CHANNEL:-$(getenv DISCORD_HOME_CHANNEL)}"

# Workspace auth cookie.
TOK="${SWARM_AUTH_TOKEN:-}"
if [ -z "$TOK" ] && [ -f "$SESSIONS_FILE" ]; then
  TOK=$(python3 -c "import json,sys,time;d=json.load(open(sys.argv[1]));now=time.time()*1000;print(next((t for t,e in d.get('tokens',{}).items() if e>now),''))" "$SESSIONS_FILE")
fi

missions=$(curl -s -m 15 -H "Cookie: claude-auth=$TOK" "$BASE_URL/api/swarm-missions" || echo '{}')
health=$(curl -s -m 15 -H "Cookie: claude-auth=$TOK" "$BASE_URL/api/swarm-health" || echo '{}')
usage=$(curl -s -m 15 -H "Cookie: claude-auth=$TOK" "$BASE_URL/api/swarm-usage" || echo '{}')
timeline=$(curl -s -m 15 -H "Cookie: claude-auth=$TOK" "$BASE_URL/api/swarm-timeline?limit=500" || echo '{}')
queue=$(curl -s -m 15 -H "Cookie: claude-auth=$TOK" "$BASE_URL/api/swarm-queue" || echo '{}')
scoreboard=$(curl -s -m 15 -H "Cookie: claude-auth=$TOK" "$BASE_URL/api/swarm-scoreboard" || echo '{}')

# Watchdog incidents in the last 24h (log lines carry no timestamps, so use
# file mtime as "recent" proxy plus today's alert lines).
watchdog_recent=""
WLOG="$HOME/.hermes/logs/com.hermes.watchdog.log"
if [ -f "$WLOG" ]; then
  watchdog_recent=$(grep '\[watchdog\]' "$WLOG" 2>/dev/null | tail -5 || true)
fi

# Today's calendar events (best-effort; empty when Calendar has none or
# automation permission is missing — never blocks the briefing).
calendar_today=$(perl -e 'alarm 20; exec @ARGV' osascript -e '
set out to ""
tell application "Calendar"
  set today to current date
  set startOfDay to today - (time of today)
  set endOfDay to startOfDay + 1 * days
  repeat with cal in calendars
    repeat with ev in (every event of cal whose start date ≥ startOfDay and start date < endOfDay)
      set out to out & (start date of ev as string) & " — " & (summary of ev) & "\n"
    end repeat
  end repeat
end tell
return out' 2>/dev/null | head -6 || true)

disk_free=$(df -g "$HOME" 2>/dev/null | awk 'NR==2 {print $4}')

message=$(WATCHDOG_RECENT="$watchdog_recent" CALENDAR_TODAY="$calendar_today" DISK_FREE="$disk_free" \
  python3 - "$missions" "$health" "$usage" "$timeline" "$queue" "$scoreboard" <<'PY'
import sys, json, os, time
def load(i):
    try: return json.loads(sys.argv[i])
    except Exception: return {}
m, h, u, tl, q, sb = (load(i) for i in range(1, 7))
missions = m.get('missions', []) if isinstance(m, dict) else []
blocked, active, greenlight = 0, 0, []
for mi in missions:
    for a in mi.get('assignments', []):
        st = a.get('state')
        if st in ('blocked', 'needs_input'): blocked += 1
        if st in ('dispatched', 'queued', 'executing'): active += 1
        if a.get('reviewedBy') == 'ready-for-eric':
            greenlight.append(a.get('workerId', '?'))
warns = (h.get('summary', {}) or {}).get('warnings', []) if isinstance(h, dict) else []
today = 0
for w in (u.get('workers', []) if isinstance(u, dict) else []):
    today += (w.get('today', {}) or {}).get('total', 0) or 0
cap = (u.get('spendCap') or {}) if isinstance(u, dict) else {}

# Overnight timeline: last 24h event counts + failures.
now_ms = time.time() * 1000
day_ago = now_ms - 24 * 3600 * 1000
entries = [e for e in (tl.get('entries', []) if isinstance(tl, dict) else []) if e.get('at', 0) >= day_ago]
done = sum(1 for e in entries if e.get('type') == 'completed')
failed = [e for e in entries if e.get('type') in ('blocked', 'failed')]
guards = [e for e in entries if e.get('type') == 'branch_guard']

# Queue state.
qitems = q.get('items', []) if isinstance(q, dict) else []
q_open = [i for i in qitems if i.get('status') in ('queued', 'dispatched')]

# Scoreboard: workers under 60% success with ≥3 attempts.
weak = []
for w in (sb.get('workers', []) if isinstance(sb, dict) else []):
    total = w.get('total', 0) or 0
    ok = w.get('ok', 0) or 0
    if total >= 3 and ok / total < 0.6:
        weak.append(f"{w.get('workerId','?')} ({round(100*ok/total)}%)")

lines = ["☀️ **Hermes Morning Briefing**"]
lines.append(f"• Overnight: {done} tasks done, {len(failed)} blocked/failed" + (f", {len(guards)} branch-guard events" if guards else ""))
lines.append(f"• Now: {active} active · {blocked} blocked · {len(greenlight)} awaiting greenlight · {len(q_open)} in queue")
if greenlight:
    lines.append("• 🔴 Greenlight: " + ", ".join(sorted(set(greenlight))))
if failed:
    for e in failed[:3]:
        lines.append(f"  ↳ {e.get('workerId','?')}: {str(e.get('message',''))[:110]}")
if weak:
    lines.append("• 📉 Underperforming: " + ", ".join(weak[:4]))
lines.append(f"• Tokens today: {today:,}" + (f" / {cap.get('capTokens'):,} cap" if cap.get('enabled') else ""))
disk = os.environ.get('DISK_FREE', '')
if disk:
    lines.append(f"• 💾 Disk free: {disk} GB")
wd = os.environ.get('WATCHDOG_RECENT', '').strip()
if wd:
    lines.append("• 🐕 Watchdog (recent): " + " | ".join(l.replace('[watchdog] ', '') for l in wd.splitlines()[-3:])[:300])
cal = os.environ.get('CALENDAR_TODAY', '').strip()
if cal:
    lines.append("• 📅 Today:")
    for l in cal.splitlines()[:5]:
        lines.append(f"  ↳ {l[:110]}")
if warns:
    lines.append("• ⚠️ " + "  ".join(warns[:4]))
if not warns and not blocked and not greenlight and not failed:
    lines.append("• ✅ All clear — nothing needs you.")
print("\n".join(lines))
PY
)

post() {
  curl -s -o /dev/null -w "%{http_code}" -X POST \
    "https://discord.com/api/v10/channels/$1/messages" \
    -H "Authorization: Bot $BOT_TOKEN" -H "Content-Type: application/json" \
    -d "$(python3 -c 'import json,sys;print(json.dumps({"content":sys.argv[1]}))' "$2")"
}

code=$(post "$CHANNEL" "$message" || echo 000)
if [ "$code" != "200" ]; then
  # Auto-discover first postable text channel in the bot's first guild.
  gid=$(curl -s "https://discord.com/api/v10/users/@me/guilds" -H "Authorization: Bot $BOT_TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')")
  if [ -n "$gid" ]; then
    CHANNEL=$(curl -s "https://discord.com/api/v10/guilds/$gid/channels" -H "Authorization: Bot $BOT_TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(next((c['id'] for c in d if c.get('type')==0), ''))")
    [ -n "$CHANNEL" ] && code=$(post "$CHANNEL" "$message" || echo 000)
  fi
fi
echo "discord digest post: HTTP $code"
[ "$code" = "200" ]
