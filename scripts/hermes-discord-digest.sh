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

message=$(python3 - "$missions" "$health" "$usage" <<'PY'
import sys, json
def load(i):
    try: return json.loads(sys.argv[i])
    except Exception: return {}
m, h, u = load(1), load(2), load(3)
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

lines = ["🐝 **Hermes Swarm — Daily Digest**"]
lines.append(f"• Active: {active}  ·  Blocked: {blocked}  ·  Awaiting greenlight: {len(greenlight)}")
if greenlight:
    lines.append("• 🔴 Greenlight queue: " + ", ".join(sorted(set(greenlight))))
lines.append(f"• Tokens today: {today:,}" + (f" / {cap.get('capTokens'):,} cap" if cap.get('enabled') else ""))
if warns:
    lines.append("• ⚠️ " + "  ".join(warns[:4]))
if not warns and not blocked and not greenlight:
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
