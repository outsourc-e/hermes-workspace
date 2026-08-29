# Web Access Eval Matrix

Status: Phase 0 initial matrix
Owner: QA + Researcher + Maintainer

## Metrics

- `success`: task completed with required evidence.
- `method`: gbrain | crawl4ai | agent-browser | browser-use-gated | blocked.
- `time_seconds`: wall-clock runtime.
- `tokens_proxy`: size of Markdown/snapshot/evidence handed to the model, not raw HTML bytes.
- `failure_class`: robots_terms | auth_needed | captcha | js_rendering | extraction_quality | selector_drift | network | runtime_missing.
- `evidence`: paths to Markdown, snapshots, screenshots, traces, and report.

## Phase 0 pilot cases

| ID | Category | Target | Worker | Tool order | Metric | Verify | Guard |
|---|---|---|---|---|---|---|---|
| web-smoke-001 | basic extraction | https://example.com | researcher | Crawl4AI -> agent-browser | Markdown contains `Example Domain`; snapshot contains heading/link | `curl /md`; `agent-browser snapshot` | no external account |
| web-smoke-002 | JS/static app | local workspace route after dev server | qa | agent-browser | route title + no console errors + screenshot | snapshot/screenshot/console | local-only |
| web-smoke-003 | docs site | official docs URL selected per task | researcher | Crawl4AI breadth | clean Markdown with source URL and title | `/md` success true | respect robots/terms |
| web-smoke-004 | login flow fixture | approved local/test auth target | qa | agent-browser | auth state persists across close/open | session reuse + screenshot | no real account mutation |
| web-smoke-005 | source diversity | 5 approved competitor/docs pages | researcher | Crawl4AI | 5 source records with method + quality tier | source-inventory.json | max 5 URLs |
| web-smoke-006 | hard-site classification | one known anti-bot target | qa/researcher | Crawl4AI -> agent-browser | classify blocker without bypassing CAPTCHA | failure log + screenshot if allowed | no cloud fallback |

## Autoresearch pilot contract

```yaml
goal: Increase successful clean Markdown/source extraction on the Phase 0 web-smoke pilot set.
scope:
  - skills/crawl4ai-research.md
  - skills/researcher-agent-browser.md
  - evals/web-access/**
mutable_target: routing guidance and eval runner only
locked_eval:
  - docs/swarm/WEB-ACCESS-EVAL-MATRIX.md
metric: pass count across pilot cases
direction: higher
verify: python3 scripts/validate-web-access-empowerment.py && bash evals/web-access/run-phase0-smoke.sh
guard: git diff --check && python3 scripts/validate-web-access-empowerment.py
iterations: 3
time_budget: 45m
results_log: evals/web-access/results/phase0-results.tsv
rollback: revert worse/crashing/unparseable changes
greenlight: required for cloud fallback, credentials, public actions, bulk crawling, or service changes
```
