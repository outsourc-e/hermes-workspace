---
name: crawl4ai-research
description: Use local Crawl4AI v0.8.5 as the primary Researcher breadth/Markdown extraction engine before browser interaction. Runs as a localhost Docker service on port 11235.
version: 1.0.0
metadata:
  hermes:
    tags: [crawl4ai, research, scraping, markdown, idea-engine, local-first]
---

# Crawl4AI Research

Use this skill for broad external research, competitor/source collection, Markdown extraction, and market/site intelligence. It is the Phase 0 primary breadth engine for Researcher before agent-browser interaction.

## Local service

Exact Phase 0 image and port:

```bash
docker pull unclecode/crawl4ai:0.8.5
docker rm -f crawl4ai 2>/dev/null || true
docker run -d -p 127.0.0.1:11235:11235 --shm-size=1g --name crawl4ai unclecode/crawl4ai:0.8.5
curl -fsS http://localhost:11235/health
```

If Docker is missing on macOS, install Docker CLI + Colima:

```bash
brew install docker docker-compose colima
colima start --cpu 4 --memory 6 --disk 30
```

## Markdown extraction smoke

```bash
curl -fsS -X POST http://localhost:11235/md   -H 'Content-Type: application/json'   -d '{"url":"https://example.com","f":"fit"}'
```

Expected: JSON with `success: true` and Markdown containing `Example Domain`.

## Research workflow

1. Start with GBrain/internal context.
2. Use Crawl4AI for breadth and clean Markdown.
3. Persist high-signal outputs in the run evidence directory:
   - `source-inventory.json`
   - `crawl4ai-results.jsonl`
   - `markdown/<safe-slug>.md`
   - `research-findings.md`
4. Escalate only selected targets to `researcher-agent-browser` for interaction or screenshots.

## API snippets

Health:

```bash
curl -fsS http://localhost:11235/health
```

Markdown:

```bash
curl -fsS -X POST http://localhost:11235/md   -H 'Content-Type: application/json'   -d '{"url":"https://example.com","f":"fit"}'
```

Multi-URL crawl:

```bash
curl -fsS -X POST http://localhost:11235/crawl   -H 'Content-Type: application/json'   -d '{"urls":["https://example.com"],"browser_config":{"headless":true},"crawler_config":{"cache_mode":"BYPASS"}}'
```

## Guards

- Respect robots.txt and site terms; do not use this for credential/account scraping without approval.
- Cloud/proxy escalation is not default. Any paid proxy/cloud stealth fallback needs Orchestrator greenlight.
- Keep source budgets bounded; broad crawls must specify max URLs/pages and a time budget.
- Do not dump raw page corpora into GBrain. Capture concise, source-linked findings and provenance.
