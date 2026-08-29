#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
EVIDENCE_DIR="$ROOT/.hermes/evidence/web-access/phase0-smoke"
mkdir -p "$EVIDENCE_DIR"

printf '== agent-browser ==
'
agent-browser --version | tee "$EVIDENCE_DIR/agent-browser-version.txt"
agent-browser skills list | tee "$EVIDENCE_DIR/agent-browser-skills.txt"
agent-browser close --all >/dev/null 2>&1 || true
PROFILE="$HOME/.agent-browser/profiles/hermes-smoke"
mkdir -p "$PROFILE"
agent-browser --profile "$PROFILE" --session-name hermes-smoke open https://example.com
agent-browser snapshot -i --compact | tee "$EVIDENCE_DIR/agent-browser-snapshot.txt"
agent-browser screenshot "$EVIDENCE_DIR/agent-browser-screenshot.png"
agent-browser close >/dev/null 2>&1 || true
grep -q 'Example Domain' "$EVIDENCE_DIR/agent-browser-snapshot.txt"

printf '
== crawl4ai ==
'
curl -fsS http://localhost:11235/health | tee "$EVIDENCE_DIR/crawl4ai-health.json"
printf '
'
curl -fsS -X POST http://localhost:11235/md   -H 'Content-Type: application/json'   -d '{"url":"https://example.com","f":"fit"}' | tee "$EVIDENCE_DIR/crawl4ai-md.json"
python3 - <<'PY'
import json, pathlib, sys
p = pathlib.Path('.hermes/evidence/web-access/phase0-smoke/crawl4ai-md.json')
d = json.loads(p.read_text())
assert d.get('success') is True, d
assert 'Example Domain' in d.get('markdown', ''), d
print('crawl4ai markdown smoke: pass')
PY

printf '
phase0 web-access smoke: PASS
'
