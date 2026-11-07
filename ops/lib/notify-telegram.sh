#!/usr/bin/env bash
# notify-telegram.sh — post fleet-health digest to Telegram via Bot API.
# Usage: notify-telegram.sh <markdown-file>
# Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (read from ops/secrets/telegram.env if not in env)
# Never logs token values; exit 0 on successor skip, non-zero only on hard config error.
set -u
FILE="${1:-}"; [ -n "$FILE" ] || { echo "TELEGRAM-SKIP: no file arg"; exit 0; }
[ -f "$FILE" ] || { echo "TELEGRAM-SKIP: file not found $FILE"; exit 0; }

OPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# Load secrets file if present (gitignored, mode 600)
if [ -f "$OPS_DIR/secrets/telegram.env" ]; then
  # shellcheck disable=SC1091
  source "$OPS_DIR/secrets/telegram.env" 2>/dev/null || true
fi
TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT="${TELEGRAM_CHAT_ID:-}"
if [ -z "$TOKEN" ] || [ -z "$CHAT" ]; then
  echo "TELEGRAM-SKIP: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set (set in ops/secrets/telegram.env)"
  exit 0
fi

# Prepare text: Telegram limit 4096, MarkdownV2 needs escaping — we use Markdown not V2 for brevity
TEXT=$(head -c 3500 "$FILE")
# Escape minimally; send as Markdown
PAYLOAD=$(python3 -c "
import json,sys
t=open(sys.argv[1],encoding='utf-8',errors='ignore').read()[:3500]
# Inline keyboard: Approve / Details
kb={'inline_keyboard':[[{'text':'\u2705 Approve','callback_data':'fleet:approve'},{'text':'\u274c Block','callback_data':'fleet:block'}],[{'text':'\U0001f50d Details','callback_data':'fleet:details'}]]}
print(json.dumps({'chat_id':sys.argv[2],'text':t,'parse_mode':'Markdown','reply_markup':kb}))
" "$FILE" "$CHAT")

# Retry with backoff: 5s,30s,120s on 429/5xx
for attempt in 1 2 3 4; do
  http=$(curl -s -w "\n%{http_code}" -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
    -H "Content-Type: application/json" -d "$PAYLOAD" 2>&1)
  body=$(printf '%s' "$http" | sed '$d')
  code=$(printf '%s' "$http" | tail -1)
  if echo "$code" | grep -q "^2"; then
    echo "TELEGRAM-OK: posted to chat $CHAT (attempt $attempt)"
    exit 0
  fi
  # 429 rate-limit: honour retry_after if present
  if [ "$code" = "429" ]; then
    wait_s=$(printf '%s' "$body" | python3 -c "import json,sys; d=json.load(sys.stdin) if sys.stdin.read().strip() else {}; print(d.get('parameters',{}).get('retry_after',30))" 2>/dev/null || echo 30)
    echo "TELEGRAM-RETRY: 429 rate-limit, waiting ${wait_s}s (attempt $attempt)"
    sleep "$wait_s"
    continue
  fi
  if [ "$attempt" -lt 4 ] && echo "$code" | grep -qE "^(5|0)"; then
    sleep $(( attempt * 10 ))
    echo "TELEGRAM-RETRY: http $code attempt $attempt"
    continue
  fi
  echo "TELEGRAM-FAIL: http $code body=$(printf '%s' "$body" | head -c 300)"
  exit 0  # never fail the nightly job on notify
done
echo "TELEGRAM-FAIL: exhausted retries"
exit 0
