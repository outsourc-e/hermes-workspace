#!/usr/bin/env bash
# mock-hermes-fleet.sh — test double for `hermes chat` used by test-fleet-health.sh.
# Reads --query-file, then emits either a valid fleet-health digest (L2 accept
# path) or garbage (L2 degrade path). MOCK_BAD=1 → garbage. MOCK_SLOW=1 → hang.
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
[ "${MOCK_BAD:-0}" = "1" ] && { echo "looks fine to me, all good, no further details"; exit 0; }

DATE=$(date +%F)
echo "# Fleet Health — $DATE"
echo
echo "## Health matrix"
echo
echo "| gateway | PASS | mock |"
echo
echo "## Night jobs"
echo
echo "| mock-agent | done | mock |"
echo
echo "Fleet-health note: mock L2 synthesis for testing"
exit 0
