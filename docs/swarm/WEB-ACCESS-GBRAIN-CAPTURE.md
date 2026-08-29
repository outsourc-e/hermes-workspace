# GBrain Capture Packet — Web Access Empowerment Phase 0

Status: ready-for-km-agent-ingest
Mission: web-access-empowerment-install-2026
Source plan: docs/swarm/WEB-ACCESS-EMPOWERMENT-PLAN.md
Generated: 2026-05-30T01:35+0300

## Durable facts to capture

- The swarm web-access stack is local-first and skill-native; no new MCP servers were added.
- `agent-browser` is installed globally and verified at version `0.27.0`.
- Chrome for Testing is installed under `~/.agent-browser/browsers/chrome-149.0.7827.54`.
- Persistent agent-browser profiles are per-worker under `~/.agent-browser/profiles/<worker-id>` with session names `hermes-<worker-id>`.
- Crawl4AI is running locally as Docker container `crawl4ai`, image `unclecode/crawl4ai:0.8.5`, published on `127.0.0.1:11235`.
- Researcher routing order: GBrain first, Crawl4AI breadth second, agent-browser interaction/evidence third, deep browser/browser-use gated later.
- QA routing: agent-browser for deterministic refs/snapshots/screenshots/traces/console/errors before older harness fallback.
- Builder routing: agent-browser for scoped browser execution and post-implementation evidence; destructive/account/public actions require Orchestrator greenlight.
- Maintainer owns version pinning, service health, eval drift, and quarterly hygiene.
- Cloud stealth/browserbase/agentcore/proxy escalation is not default; it requires explicit Orchestrator greenlight.

## Evidence paths

- Phase 0 report: docs/swarm/WEB-ACCESS-PHASE0-REPORT.md
- Profile strategy: docs/swarm/WEB-ACCESS-PROFILE-STRATEGY.md
- Eval matrix: docs/swarm/WEB-ACCESS-EVAL-MATRIX.md
- Greenlight: .hermes/recovery/web-access-empowerment-install-2026/phase0-greenlight.md
- Validator: scripts/validate-web-access-empowerment.py
- Smoke runner: evals/web-access/run-phase0-smoke.sh
- Smoke evidence: .hermes/evidence/web-access/phase0-smoke/

## Verification already run

```text
pnpm web-access:validate -> PASS
pnpm web-access:smoke -> PASS
docker-compose config -q -> PASS
git diff --check -> PASS
skill_view(agent-browser-core) -> available
skill_view(crawl4ai-research) -> available
skill_view(qa-dogfood-browser) -> available
```

## Direct GBrain write status

Direct GBrain write was not executed from this shell because no `gbrain` CLI/wrapper/tool was exposed in the active laptop-code toolset (`command -v gbrain`, `km`, `orchestrator:plan`, and `researcher:quick` returned empty; active Hermes profiles are `default` and `laptop-code`). This packet is the ready-to-ingest KM-agent payload and the same facts were also captured in Hermes memory.
