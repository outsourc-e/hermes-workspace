#!/usr/bin/env bash
# mock-hermes-scout.sh — test double for `hermes chat` used by test-scout-radar.sh.
# Emits a canned digest satisfying run-night-agent.sh's validator (## .*(Digest|Research)).
# Set MOCK_BAD=1 for malformed output, MOCK_FAIL=1 for a crash (rc=7),
# MOCK_SLOW=1 to sleep past the runner timeout.
set -u
PROMPT_FILE=""
ARGS=("$@")
prev=""
for a in "${ARGS[@]}"; do
  [ "$prev" = "--query-file" ] && PROMPT_FILE="$a"
  prev="$a"
done
[ -n "$PROMPT_FILE" ] && [ -f "$PROMPT_FILE" ] || { echo "mock: no prompt file" >&2; exit 3; }

[ "${MOCK_SLOW:-0}" = "1" ] && { sleep 9999; exit 0; }
[ "${MOCK_FAIL:-0}" = "1" ] && { echo "mock: simulated hermes crash" >&2; exit 7; }
[ "${MOCK_BAD:-0}" = "1" ] && { echo "sorry, I browsed a bit, here are some thoughts with no digest"; exit 0; }

AGENT=$(grep -oE '(competitor-scout|customer-watcher|partner-radar)' "$PROMPT_FILE" | head -1)
[ -z "$AGENT" ] && AGENT="scout-test"
DATE=$(date +%F)
echo "## Mock Digest — $AGENT $DATE"
echo
echo "Targets seen in prompt:"
grep -vE '^(#|$|MODE|DATE)' "$PROMPT_FILE" | head -n 5 | sed 's/^/- /'
echo
echo "## Sources"
echo "- https://example.com/mock"
exit 0
