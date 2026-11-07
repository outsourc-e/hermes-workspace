#!/usr/bin/env bash
# mock-hermes.sh — test double for `hermes chat` used by test-product-intel.sh.
# Reads the query file, detects MODE=LIGHT|DEEP and the KB dir, then emits a canned
# response with the exact section contract run-product-intel.sh validates.
# For DEEP it also writes the artifacts the runner expects (report + candidates).
# Set MOCK_BAD=1 to emit malformed output (negative tests). Set MOCK_SLOW=1 to sleep
# past the runner timeout (timeout-path test).
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

MODE=$(grep -oE '^MODE: (LIGHT|DEEP)' "$PROMPT_FILE" | awk '{print $2}')
DATE=$(grep -oE '^DATE: [0-9-]+' "$PROMPT_FILE" | awk '{print $2}')
KB=$(grep -E '^  Registry:' "$PROMPT_FILE" | head -1 \
     | sed -E 's#^  Registry:[[:space:]]+##; s#/targets\.json.*$##')
[ -n "$KB" ] && [ -d "$KB" ] || { echo "mock: cannot resolve KB dir" >&2; exit 4; }

if [ "${MOCK_BAD:-0}" = "1" ]; then
  echo "sorry, I looked at some websites, here are my thoughts:"; exit 0
fi

TARGET_NAMES=$(awk '/^ACTIVE TARGETS/{f=1;next} /^$/{f=0} f&&/^- /{sub(/^- /,"");print}' "$PROMPT_FILE" | cut -d'|' -f1)

if [ "$MODE" = "DEEP" ]; then
  mkdir -p "$KB/candidates"
  {
    echo "# Product Intel Report — $DATE (deep cycle)"
    echo
    echo "## 1. Executive summary"
    echo "Mock deep-cycle report for testing."
    echo
    echo "## 2. Changes observed this cycle"
    echo "- none in mock"
    echo
    echo "## 3. Feature comparison snapshot"
    echo "| target | status |"
    echo "|---|---|"
    while IFS= read -r t; do [ -n "$t" ] && echo "| $t | unchanged |"; done <<< "$TARGET_NAMES"
    echo
    echo "## 4. Opportunities spotted"
    echo "- mock opportunity"
    echo
    echo "## 5. Needs decision (approval requested)"
    echo "- MockCandidate — https://example.com/mockcandidate — competitor"
    echo
    echo "## 6. What did we miss?"
    echo "- mock gap"
    echo
    echo "## 7. Sources"
    echo "- https://example.com/"
  } > "$KB/report-$DATE.md"
  printf '# Candidate Targets — Broadening Proposals %s\n\n| # | Candidate | URL |\n|---|---|---|\n| 1 | MockCandidate | https://example.com/mockcandidate |\n' "$DATE" > "$KB/candidates/$DATE-candidates.md"
  cat "$KB/report-$DATE.md"
else
  echo "## Product Intel Delta — $DATE"
  echo
  echo "### Changes"
  echo "- none (mock)"
  echo
  echo "### No-change targets"
  echo "$TARGET_NAMES" | paste -sd, -
  echo
  echo "### Anomalies"
  echo "- none"
fi
exit 0
