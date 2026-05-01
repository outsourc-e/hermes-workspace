#!/usr/bin/env bash
set -euo pipefail

CANONICAL_REPO="/Users/aurora/hermes-workspace"
FORBIDDEN_REPO="/Users/aurora/hermes-workspace"

CURRENT_DIR="$(pwd -P)"

if [[ "$CURRENT_DIR" == "$FORBIDDEN_REPO" ]] || [[ "$CURRENT_DIR" == "$FORBIDDEN_REPO"/* ]]; then
  echo "ERROR: wrong repo: $CURRENT_DIR"
  echo "Use: $CANONICAL_REPO"
  exit 1
fi

if [[ "$CURRENT_DIR" != "$CANONICAL_REPO" ]] && [[ "$CURRENT_DIR" != "$CANONICAL_REPO"/* ]]; then
  echo "ERROR: non-canonical cwd: $CURRENT_DIR"
  echo "Use: $CANONICAL_REPO"
  exit 1
fi

if [[ ! -f "$CANONICAL_REPO/package.json" ]]; then
  echo "ERROR: package.json missing in canonical repo"
  exit 1
fi

REPO_NAME="$(python3 - <<'PY'
import json
from pathlib import Path
pkg = json.loads(Path('/Users/aurora/hermes-workspace/package.json').read_text())
print(pkg.get('name', ''))
PY
)"

if [[ "$REPO_NAME" != "hermes-workspace" ]]; then
  echo "ERROR: unexpected package name: $REPO_NAME"
  exit 1
fi

echo "OK: canonical Swarm repo"
echo "cwd=$CURRENT_DIR"
echo "package=$REPO_NAME"
