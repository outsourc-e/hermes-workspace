#!/usr/bin/env bash
# notify-slack.sh — post agent digests/reports to Slack (AI Protect Slack → #hermes-agents).
# Every Hermes night agent now posts 1:1 to Buzz AND Slack hermes-agents.
# Usage: notify-slack.sh <markdown-file> [title-prefix]
# Env (in precedence):
#   SLACK_HERMES_AGENTS_WEBHOOK_URL — channel-specific webhook for #hermes-agents (preferred)
#   SLACK_WEBHOOK_URL               — legacy/fallback webhook
#   SLACK_BOT_TOKEN + SLACK_HERMES_AGENTS_CHANNEL — bot token mode (preferred channel)
#   SLACK_BOT_TOKEN + SLACK_CHANNEL — legacy bot channel
# Secrets file: ops/secrets/slack.env (600, gitignored) — auto-sourced. Also supports
#   ops/config/slack.env and .env for local dev overrides.
# Behaviour: fire-and-forget, never fails the nightly job (exit 0 always). Mirrors
#   notify-telegram.sh retry discipline but keeps Slack block limit (3000 chars).
set -u
FILE="${1:-}"; TITLE_HINT="${2:-}"
[ -n "$FILE" ] || { echo "SLACK-SKIP: no file arg"; exit 0; }
[ -f "$FILE" ] || { echo "SLACK-SKIP: file not found $FILE"; exit 0; }

OPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WS_DIR="$(cd "$OPS_DIR/.." && pwd)"

# Load secrets in precedence: slack.env → config/slack.env → .env (do not override already-exported env)
[ -f "$OPS_DIR/secrets/slack.env" ] && source "$OPS_DIR/secrets/slack.env" 2>/dev/null || true
[ -f "$OPS_DIR/config/slack.env" ] && source "$OPS_DIR/config/slack.env" 2>/dev/null || true
[ -f "$WS_DIR/.env" ] && { set -a; source "$WS_DIR/.env" 2>/dev/null || true; set +a; } || true

# Back-compat: SLACK_WEBHOOK_URL may be defined in .env.example; secret file wins.
WEBHOOK="${SLACK_HERMES_AGENTS_WEBHOOK_URL:-${SLACK_WEBHOOK_URL:-}}"
BOT="${SLACK_BOT_TOKEN:-}"
# Channel resolution: explicit hermes-agents channel → legacy SLACK_CHANNEL → default #hermes-agents
CHANNEL="${SLACK_HERMES_AGENTS_CHANNEL:-${SLACK_CHANNEL:-#hermes-agents}}"

# Prepare payload: Slack blocks cap ~3000 chars, keep first 2900 + title hint
# Include filename as context so hermes-agents timeline stays scannable.
BASENAME="$(basename "$FILE")"

if [ -n "$WEBHOOK" ]; then
  PAYLOAD=$(python3 -c "
import json,sys
f=sys.argv[1]; hint=sys.argv[2]; base=sys.argv[3]
t=open(f,encoding='utf-8',errors='ignore').read()[:3500]
# Slack Incoming Webhook: {text, blocks}. Use blocks for formatting, text as fallback.
header = f'*{hint}*' if hint else f'*Hermes Agents* \u2014 {base}'
# Truncate for block type mrkdwn (3000 limit)
body = t[:2900]
# Escape is handled by json.dumps
payload = {'text': header + '\n' + t[:400], 'blocks': [{'type':'header','text':{'type':'plain_text','text': (hint or 'Hermes Agents')[:150]}},{'type':'section','text':{'type':'mrkdwn','text': body}}]}
# Add context block with source file + channel hint
payload['blocks'].append({'type':'context','elements':[{'type':'mrkdwn','text': f'file: \`{base}\` \u00b7 channel: #hermes-agents'}]})
print(json.dumps(payload))
" "$FILE" "$TITLE_HINT" "$BASENAME")
  if curl -sf -m 15 -X POST "$WEBHOOK" -H "Content-type: application/json" -d "$PAYLOAD" >/dev/null 2>&1; then
    echo "SLACK-OK: posted via webhook to #hermes-agents ($BASENAME)"
    exit 0
  else
    echo "SLACK-FAIL: webhook post failed to #hermes-agents"
    # fall through to bot attempt if available
  fi
fi

if [ -n "$BOT" ]; then
  PAYLOAD=$(python3 -c "
import json,sys
f=sys.argv[1]; ch=sys.argv[2]; hint=sys.argv[3]; base=sys.argv[4]
t=open(f,encoding='utf-8',errors='ignore').read()[:3000]
header = hint or 'Hermes Agents'
payload = {'channel': ch, 'text': f'{header}: {base}\n' + t[:400], 'blocks': [{'type':'header','text':{'type':'plain_text','text': header[:150]}},{'type':'section','text':{'type':'mrkdwn','text': t[:2900]}},{'type':'context','elements':[{'type':'mrkdwn','text': f'file: \`{base}\`'}]}]}
print(json.dumps(payload))
" "$FILE" "$CHANNEL" "$TITLE_HINT" "$BASENAME")
  # Retry once on 429/5xx like Telegram does
  for attempt in 1 2 3; do
    http=$(curl -s -w "\n%{http_code}" -X POST "https://slack.com/api/chat.postMessage" -H "Authorization: Bearer $BOT" -H "Content-type: application/json" -d "$PAYLOAD" 2>&1)
    body=$(printf '%s' "$http" | sed '$d')
    code=$(printf '%s' "$http" | tail -1 | tr -d ' \r\n')
    if echo "$code" | grep -q "^2"; then
      # Slack returns {"ok":true} even on 200 — verify
      if printf '%s' "$body" | python3 -c "import json,sys; d=json.loads(sys.stdin.read() or '{}'); exit(0 if d.get('ok') else 1)" 2>/dev/null; then
        echo "SLACK-OK: posted via bot to $CHANNEL ($BASENAME) attempt $attempt"
        exit 0
      fi
    fi
    if [ "$code" = "429" ]; then
      wait_s=$(printf '%s' "$body" | python3 -c "import json,sys; d=json.loads(sys.stdin.read() or '{}'); print(d.get('retry_after',2))" 2>/dev/null || echo 2)
      echo "SLACK-RETRY: 429 rate-limit, waiting ${wait_s}s (attempt $attempt)"
      sleep "$wait_s"
      continue
    fi
    if [ "$attempt" -lt 3 ] && echo "$code" | grep -qE "^(5|0)"; then
      sleep $((attempt*2))
      echo "SLACK-RETRY: http $code attempt $attempt"
      continue
    fi
    echo "SLACK-FAIL: bot post to $CHANNEL http $code body=$(printf '%s' "$body" | head -c 300)"
    break
  done
  exit 0
fi

echo "SLACK-SKIP: no Slack credentials (set SLACK_HERMES_AGENTS_WEBHOOK_URL or SLACK_BOT_TOKEN+SLACK_HERMES_AGENTS_CHANNEL in ops/secrets/slack.env) — file $BASENAME not posted"
exit 0
