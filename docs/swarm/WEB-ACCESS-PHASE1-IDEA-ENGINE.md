# Web Access Phase 1: Idea Engine / Researcher Activation

Status: Phase 1 bounded activation
Owner: Researcher + Orchestrator + Reviewer
Source phase: `docs/swarm/WEB-ACCESS-PHASE0-REPORT.md`

## Active doctrine

Phase 1 turns the Phase 0 browser stack into a concrete Researcher / Idea Engine workflow. The doctrine is local-first, skill-native, evidence-backed, and gated:

1. GBrain/internal memory first for known workspace, RAZSOC, Hermes, and prior-mission context.
2. Crawl4AI breadth second for low-cost Markdown extraction, source diversity, and market maps.
3. agent-browser interaction third for JavaScript-heavy pages, screenshots, snapshots, and session-backed inspection.
4. browser-use/deep-browser escalation only after explicit Orchestrator greenlight.
5. Cloud stealth, proxies, credentialed flows, public actions, CAPTCHA handling, or bulk crawling are never default.

This is an operating surface, not a marketing surface: use short contracts, source inventories, evidence paths, and deterministic proof. Do not inflate reports with card walls, generic paragraphs, or decorative filler.

## Routing order

| Step | Tool | Use when | Evidence |
|---|---|---|---|
| 1 | GBrain | The answer may already exist in Hermes memory, recovery notes, prior missions, or profile doctrine. | cited memory/source path or explicit `not found` note |
| 2 | Crawl4AI | Need breadth, clean Markdown, competitor pages, docs pages, landing pages, source inventories, or market scans. | `crawl4ai-results.jsonl`, `markdown/*.md`, `source-inventory.json` |
| 3 | agent-browser | Need rendered state, interaction, screenshots, auth-approved state, accessibility tree refs, or visual confirmation. | `browser-snapshot.txt`, `browser-screenshot.png`, optional trace/network logs |
| 4 | browser-use/deep browser | Need multi-step autonomous execution that cannot be bounded with direct agent-browser commands. | Orchestrator greenlight plus bounded action/evidence log |

## Site-intelligence pattern

Use this pattern for one target site or a small target set. Keep the budget explicit before running.

```yaml
run_id: researcher-site-intelligence-<date-or-ticket>
question: <one sentence>
source_budget:
  max_urls: 5
  max_depth: 1
  max_runtime_minutes: 10
allowed_targets:
  - https://example.com
blocked_actions:
  - credential entry
  - CAPTCHA bypass
  - public posting
  - checkout or account mutation
evidence_dir: .hermes/evidence/web-access/researcher/<run-id>/
```

Minimum workflow:

1. Record the user question and target list.
2. Check GBrain/internal docs first when applicable.
3. Run Crawl4AI on approved targets and store raw JSONL plus Markdown.
4. Promote only high-signal pages to agent-browser for rendered snapshot or screenshot.
5. Write `source-inventory.json`.
6. Write a concise findings report with citations to evidence paths.
7. Capture durable facts using the GBrain capture contract below.

## Source inventory schema

Every Researcher web-access run must emit a source inventory:

```json
{
  "run_id": "researcher-pilot-2026-05-29",
  "created_at": "2026-05-29T22:43:54Z",
  "doctrine": "gbrain -> crawl4ai -> agent-browser -> deep-browser-gated",
  "targets": [
    {
      "url": "https://example.com",
      "accessed_at": "2026-05-29T22:43:54Z",
      "method": "crawl4ai",
      "status": "pass",
      "robots_terms_posture": "safe public example target; no account, no mutation",
      "evidence": {
        "markdown": ".hermes/evidence/web-access/researcher-pilot/markdown/example.com.md",
        "browser_snapshot": ".hermes/evidence/web-access/researcher-pilot/browser-snapshot.txt",
        "screenshot": ".hermes/evidence/web-access/researcher-pilot/browser-screenshot.png"
      },
      "quality_tier": "primary",
      "findings": ["Extracted stable title and basic page purpose."],
      "uncertainty": "Low for smoke validation; not a market signal."
    }
  ]
}
```

Required target fields:

- `url`
- `accessed_at`
- `method`: `gbrain`, `crawl4ai`, `agent-browser`, `browser-use-gated`, or `blocked`
- `status`: `pass`, `partial`, `blocked`, or `fail`
- `robots_terms_posture`
- `evidence`
- `quality_tier`: `primary`, `secondary`, `context`, or `discarded`
- `findings`
- `uncertainty`

## Market and competitive research pattern

Use `evals/web-access/contracts/market-map-breadth.yaml` when the goal is market breadth rather than a single site.

Default shape:

1. Start from a short seed list and state why each seed is allowed.
2. Limit the first pass to 5-10 public pages unless greenlit.
3. Use Crawl4AI for breadth and normalize each result into the source inventory.
4. Classify each source by role: competitor, customer voice, docs, pricing, market analyst, forum/community, or regulatory/source-of-truth.
5. Promote only the most important or ambiguous pages to agent-browser for visual/snapshot evidence.
6. Synthesize as a map of claims with evidence, not as a scraped content dump.

Recommended metrics:

- distinct source roles represented
- number of primary sources
- extraction success rate
- blocked/failure class count
- maximum evidence bytes handed to the model

## Autoresearch contracts

Phase 1 adds two concrete contracts:

- `evals/web-access/contracts/researcher-site-intelligence.yaml`
- `evals/web-access/contracts/market-map-breadth.yaml`

Both preserve the standard Autoresearch fields from `docs/swarm/AUTORESEARCH.md`:

- Goal
- Scope
- Metric
- Verify
- Guard
- Iterations
- Results log
- Rollback
- Greenlight

The contracts are safe to run only inside their stated scope. The runner/eval may not mutate the scorer or broaden the target set to improve the metric.

## GBrain capture contract

Direct GBrain writes remain worker/tool dependent. When direct write is unavailable, emit a ready-to-ingest packet.

```yaml
capture_packet:
  mission: web-access-empowerment-install-2026
  phase: phase1-idea-engine-activation
  run_id: <run id>
  durable_facts:
    - Researcher routing stayed GBrain -> Crawl4AI -> agent-browser -> deep-browser-gated.
    - Evidence was written under <evidence_dir>.
    - No cloud stealth, credentials, public actions, or Opportunity Engine mutations occurred.
  evidence_paths:
    source_inventory: <path>
    pilot_report: <path>
    markdown: <path>
    browser_snapshot: <path>
    screenshot: <path>
  promote:
    - only durable routing lessons
    - only validated source-quality findings
  do_not_promote:
    - raw page dumps
    - credentials or personal data
    - failed CAPTCHA bypass attempts
    - speculative market claims without source inventory entries
```

## Runnable safe pilot

Run:

```bash
bash evals/web-access/run-researcher-pilot.sh
```

The pilot uses:

- Crawl4AI on `http://localhost:11235`
- agent-browser against `https://example.com`
- evidence directory `.hermes/evidence/web-access/researcher-pilot/`

Expected artifacts:

- `source-inventory.json`
- `crawl4ai-health.json`
- `crawl4ai-md.json`
- `markdown/example.com.md`
- `browser-snapshot.txt`
- `browser-screenshot.png`
- `pilot-report.md`

Greenlight is required before replacing `example.com` with account, credentialed, CAPTCHA, private, public-action, or bulk targets.
