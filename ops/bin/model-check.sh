#!/usr/bin/env bash
# model-check.sh — assert an OpenAI-compatible endpoint serves an expected model.
# Usage: model-check.sh <base_url> <model-id-substring> [--completion]
# Exit codes: 0=pass 2=unreachable 3=model-missing 4=completion-failed
set -u
URL="${1:?usage: model-check.sh <base_url> <model-substring> [--completion]}"
SUBSTR="${2:?missing model substring}"
DOCOMP="${3:-}"

raw=$(curl -sf -m 15 "${URL%/}/models" 2>/dev/null) || { echo "FAIL unreachable: $URL"; exit 2; }
mid=$(printf '%s' "$raw" | python3 -c '
import json,sys
sub=sys.argv[1]
try: d=json.load(sys.stdin)
except Exception: sys.exit(2)
ids=[m.get("id","") for m in d.get("data",[])]
hits=[i for i in ids if sub in i]
if not hits: sys.exit(3)
print(hits[0])
' "$SUBSTR"); rc=$?
[ $rc -eq 3 ] && { echo "FAIL model-missing: '$SUBSTR' not in $(printf '%s' "$raw" | head -c 200)"; exit 3; }
[ $rc -ne 0 ] && { echo "FAIL parse: $URL"; exit 2; }

if [ "$DOCOMP" = "--completion" ]; then
  cres=$(curl -sf -m 180 "${URL%/}/chat/completions" -H 'Content-Type: application/json' \
    -d "{\"model\":\"$mid\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with exactly: OK\"}],\"max_tokens\":600}" 2>/dev/null) || { echo "FAIL completion-request: $mid"; exit 4; }
  printf '%s' "$cres" | python3 -c '
import json,sys
d=json.load(sys.stdin)
c=d["choices"][0]["message"].get("content","")
sys.exit(0 if c.strip() else 4)' || { echo "FAIL completion-empty: $mid"; exit 4; }
fi
echo "PASS $URL serves $mid"
exit 0
