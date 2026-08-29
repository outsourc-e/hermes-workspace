---
name: web-access-maintenance
description: Maintainer ownership for the web-access empowerment stack: pinned versions, service health, eval drift, skill updates, and quarterly hygiene.
version: 1.0.0
metadata:
  hermes:
    tags: [maintainer, web-access, hygiene, evals, crawl4ai, agent-browser]
---

# Web Access Maintenance

Use for Maintainer / Ops Watch follow-up on the web-access stack.

## Owned surfaces

- Global `agent-browser` install and Chrome for Testing cache under `~/.agent-browser/`.
- Crawl4AI Docker image `unclecode/crawl4ai:0.8.5` and local container `crawl4ai` on port `11235`.
- Workspace docs under `docs/swarm/WEB-ACCESS-*`.
- Skills: `agent-browser-core`, `researcher-agent-browser`, `qa-dogfood-browser`, `builder-agent-browser`, `crawl4ai-research`.
- Eval matrix and governance suite under `evals/web-access/`, especially `evals/web-access/eval-suite.yaml` and `evals/web-access/run-web-access-suite.sh`.

## Monthly/quarterly hygiene

```bash
agent-browser --version
agent-browser skills list
agent-browser doctor --fix
curl -fsS http://localhost:11235/health
docker ps --filter name=crawl4ai --format '{{.Names}} {{.Image}} {{.Status}} {{.Ports}}'
python3 scripts/validate-web-access-empowerment.py
bash evals/web-access/run-web-access-suite.sh
```

After upgrades, rerun the eval suite and record a versioned report. Do not upgrade Crawl4AI or agent-browser silently if the eval pass rate drops.

## Drift guards

- No new MCP servers unless a later greenlight approves one.
- No cloud stealth default.
- Keep worker profile/session names stable.
- Capture failures as eval data, not hidden retries.
- The suite runner runs safe lanes only; gated anti-bot, auth persistence, cloud/proxy, CAPTCHA, public-action, and destructive lanes stay manual-gated unless Orchestrator greenlights them.
