#!/usr/bin/env bash
# cos-feature-to-github.sh — create a GitHub issue for an approved chief-of-staff feature proposal.
# Usage: cos-feature-to-github.sh <repo-name> <title> <body-file> [labels-comma]
# Safety: repo must be in the CURRENT active snapshot (ops/run/cos-github-snapshot.json);
# duplicate guard: returns existing open issue URL if same title already exists.
set -euo pipefail
WS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SNAPSHOT="${COS_SNAPSHOT:-$WS_DIR/run/cos-github-snapshot.json}"

[ $# -ge 3 ] || { echo "usage: $0 <repo-name> <title> <body-file> [labels]"; exit 64; }
REPO="$1"; TITLE="$2"; BODY_FILE="$3"; LABELS="${4:-}"
[ -f "$BODY_FILE" ] || { echo "FAIL body file missing: $BODY_FILE"; exit 1; }
command -v gh >/dev/null || { echo "FAIL gh CLI missing"; exit 2; }

# repo must be active in the latest snapshot (auto-discovery boundary)
python3 - "$REPO" "$SNAPSHOT" <<'PY' || { echo "FAIL repo not in active snapshot: $REPO"; exit 5; }
import json, sys
repo, snap = sys.argv[1], sys.argv[2]
names = [r["name"] for r in json.load(open(snap)).get("repos", [])]
raise SystemExit(0 if repo in names else 1)
PY

FULL=$(gh api "repos/andreasnahrgang/$REPO" --jq '.full_name' 2>/dev/null || echo "andreasnahrgang/$REPO")

# duplicate guard
Q=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote('\"'+sys.argv[1]+'\"'))" "$TITLE")
EXISTING=$(gh api "search/issues?q=repo:$FULL+state:open+$Q+in:title" --jq '.items[0].html_url' 2>/dev/null || true)
if [ -n "${EXISTING:-}" ]; then echo "EXISTS $EXISTING"; exit 0; fi

ARGS=(gh issue create -R "$FULL" --title "$TITLE" --body-file "$BODY_FILE")
if [ -n "$LABELS" ]; then
  IFS=',' read -ra LS <<< "$LABELS"
  for l in "${LS[@]}"; do ARGS+=(--label "$l"); done
fi
OUT=$("${ARGS[@]}" 2>&1) || { echo "FAIL issue creation failed: $OUT"; exit 3; }
URL=$(echo "$OUT" | grep -oE 'https://github\.com/[^ ]*/issues/[0-9]+' | head -1)
[ -n "$URL" ] || { echo "FAIL no issue URL in output: $OUT"; exit 3; }
echo "CREATED $URL"
