#!/usr/bin/env bash
# Hermes GitHub watcher — real-world reach for the swarm.
#
# Called by the lifecycle sweep (every 10 min). Polls the GitHub
# notifications API with the keychain token, dedupes against a state file,
# and fans out:
#   - every new notification  → Discord home channel
#   - important reasons only  → phone push (review_requested, mention,
#                                security_alert, assign)
#
# State: ~/.hermes/logs/github-watch-state.json  { "<thread id>": "<updated_at>" }
# Disable with HERMES_GITHUB_WATCH=0 in ~/.hermes/.env.
set -uo pipefail

ENV_FILE="${HERMES_ENV_FILE:-$HOME/.hermes/.env}"
STATE_FILE="$HOME/.hermes/logs/github-watch-state.json"
mkdir -p "$(dirname "$STATE_FILE")"

getenv() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' '; }
[ "$(getenv HERMES_GITHUB_WATCH)" = "0" ] && exit 0

TOKEN="$(security find-generic-password -s "GitHub - https://api.github.com" -w 2>/dev/null || true)"
[ -z "$TOKEN" ] && exit 0

NOTIFS="$(curl -sS -m 20 -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/vnd.github+json' \
  'https://api.github.com/notifications?per_page=30' 2>/dev/null || true)"
case "$NOTIFS" in "["*) ;; *) exit 0 ;; esac

BOT_TOKEN="$(getenv DISCORD_BOT_TOKEN)"
CHANNEL="$(getenv DISCORD_HOME_CHANNEL)"
NTFY_TOPIC="$(getenv HERMES_NTFY_TOPIC)"
NTFY_SERVER="$(getenv HERMES_NTFY_SERVER)"
[ -z "$NTFY_SERVER" ] && NTFY_SERVER="https://ntfy.sh"

export NOTIFS STATE_FILE
NEW="$(python3 <<'PY'
import json, os
notifs = json.loads(os.environ['NOTIFS'])
state_file = os.environ['STATE_FILE']
try:
    seen = json.load(open(state_file))
except Exception:
    seen = {}
fresh = []
for n in notifs:
    tid, updated = n.get('id', ''), n.get('updated_at', '')
    if not tid or seen.get(tid) == updated:
        continue
    seen[tid] = updated
    subj = n.get('subject') or {}
    fresh.append({
        'reason': n.get('reason', ''),
        'repo': (n.get('repository') or {}).get('full_name', ''),
        'title': subj.get('title', ''),
        'type': subj.get('type', ''),
    })
# keep state bounded
if len(seen) > 500:
    seen = dict(list(seen.items())[-300:])
json.dump(seen, open(state_file, 'w'))
print(json.dumps(fresh))
PY
)"

COUNT="$(printf '%s' "$NEW" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)))' 2>/dev/null || echo 0)"
[ "$COUNT" = "0" ] && exit 0

# Discord: everything new
if [ -n "$BOT_TOKEN" ] && [ -n "$CHANNEL" ]; then
  BODY="$(printf '%s' "$NEW" | python3 -c '
import json, sys
items = json.load(sys.stdin)
lines = ["🐙 **GitHub** — %d new notification(s):" % len(items)]
for i in items[:10]:
    lines.append("• [%s] %s — %s (%s)" % (i["reason"], i["repo"], i["title"][:120], i["type"]))
print(json.dumps({"content": "\n".join(lines)[:1900]}))')"
  curl -sS -m 10 -X POST -H "Authorization: Bot $BOT_TOKEN" \
    -H 'Content-Type: application/json' -d "$BODY" \
    "https://discord.com/api/v10/channels/$CHANNEL/messages" >/dev/null 2>&1 || true
fi

# Phone push: important reasons only
if [ -n "$NTFY_TOPIC" ]; then
  IMPORTANT="$(printf '%s' "$NEW" | python3 -c '
import json, sys
keep = {"review_requested", "mention", "security_alert", "assign"}
items = [i for i in json.load(sys.stdin) if i["reason"] in keep]
if items:
    print("\n".join("[%s] %s — %s" % (i["reason"], i["repo"], i["title"][:120]) for i in items[:6]))')"
  if [ -n "$IMPORTANT" ]; then
    printf '%s' "$IMPORTANT" | head -c 3800 | curl -sS -m 10 -X POST \
      -H 'Title: GitHub needs you' -H 'Priority: 4' -H 'Tags: octopus' \
      --data-binary @- "$NTFY_SERVER/$NTFY_TOPIC" >/dev/null 2>&1 || true
  fi
fi
exit 0
