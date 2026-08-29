#!/usr/bin/env bash
# Hermes Swarm Web & Browser Access Empowerment — Phase 0 Quickstart
# Source plan: docs/swarm/WEB-ACCESS-EMPOWERMENT-PLAN.md

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

printf '=== Hermes Web Empowerment Phase 0 Setup ===\n'
printf 'Local-first, skill-native: agent-browser + Crawl4AI; no new MCP servers.\n\n'

printf '→ Installing / verifying Vercel agent-browser...\n'
npm install -g agent-browser
agent-browser install
agent-browser --version
agent-browser skills list

printf '\n→ Smoke-testing agent-browser with persistent smoke profile...\n'
PROFILE="$HOME/.agent-browser/profiles/hermes-smoke"
mkdir -p "$PROFILE" .hermes/evidence/web-access/phase0-setup
agent-browser close --all >/dev/null 2>&1 || true
agent-browser --profile "$PROFILE" --session-name hermes-smoke open https://example.com
agent-browser snapshot -i --compact | tee .hermes/evidence/web-access/phase0-setup/agent-browser-snapshot.txt
agent-browser screenshot .hermes/evidence/web-access/phase0-setup/agent-browser-screenshot.png
agent-browser close >/dev/null 2>&1 || true
grep -q 'Example Domain' .hermes/evidence/web-access/phase0-setup/agent-browser-snapshot.txt

printf '\n→ Ensuring Docker runtime for Crawl4AI...\n'
if ! command -v docker >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install docker docker-compose colima
  else
    printf 'BLOCK: docker missing and Homebrew unavailable. Install Docker/Colima, then rerun.\n' >&2
    exit 1
  fi
fi
if command -v colima >/dev/null 2>&1; then
  colima status >/dev/null 2>&1 || colima start --cpu 4 --memory 6 --disk 30
fi

printf '\n→ Starting Crawl4AI local service...\n'
docker pull unclecode/crawl4ai:0.8.5
docker rm -f crawl4ai >/dev/null 2>&1 || true
docker run -d --name crawl4ai -p 127.0.0.1:11235:11235 --shm-size=1g unclecode/crawl4ai:0.8.5 >/dev/null
for i in {1..60}; do
  status="$(docker inspect --format='{{.State.Health.Status}}' crawl4ai 2>/dev/null || true)"
  [ "$status" = healthy ] && break
  sleep 2
done
curl -fsS http://localhost:11235/health | tee .hermes/evidence/web-access/phase0-setup/crawl4ai-health.json
printf '\n'
curl -fsS -X POST http://localhost:11235/md \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","f":"fit"}' | tee .hermes/evidence/web-access/phase0-setup/crawl4ai-md.json
python3 - <<'PY'
import json, pathlib
p = pathlib.Path('.hermes/evidence/web-access/phase0-setup/crawl4ai-md.json')
d = json.loads(p.read_text())
assert d.get('success') is True and 'Example Domain' in d.get('markdown', ''), d
PY

printf '\n→ Running integration validator...\n'
python3 scripts/validate-web-access-empowerment.py

printf '\nPhase 0 setup PASS. Evidence: .hermes/evidence/web-access/phase0-setup/\n'
