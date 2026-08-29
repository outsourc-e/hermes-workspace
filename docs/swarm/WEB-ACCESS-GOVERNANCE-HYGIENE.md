# Web Access Governance and Hygiene

Status: Phase 3 governance baseline
Owner: Maintainer + Orchestrator
Source phases: `docs/swarm/WEB-ACCESS-PHASE0-REPORT.md`, `docs/swarm/WEB-ACCESS-PHASE1-IDEA-ENGINE.md`, `docs/swarm/WEB-ACCESS-PHASE2-EXECUTION-WORKERS.md`

## Ownership

Maintainer owns pinned versions, local service health, suite drift, monthly hygiene, quarterly review, and the validator. Maintainer also keeps `evals/web-access/eval-suite.yaml`, `evals/web-access/run-web-access-suite.sh`, and `skills/web-access-maintenance.md` aligned.

Researcher owns source inventories, robots/site terms posture, source-quality classification, and research breadth evidence. Researcher does not broaden targets, enable cloud stealth, enter credentials, bypass CAPTCHA, or run bulk crawls without Orchestrator greenlight.

QA owns rendered evidence bundles: snapshots, screenshots, blocker classifications, and smoke-result summaries. QA stops at credential, CAPTCHA, anti-bot, payment, public-send, admin, or destructive boundaries unless the lane is explicitly greenlit.

Builder owns action contracts for execution tasks: target, allowed actions, forbidden actions, expected end state, auth posture, and evidence directory. Builder does not mutate public, production, account, admin, purchase, posting, or send flows by default.

Orchestrator owns greenlights, scope boundaries, fan-in decisions, and escalation routing. Orchestrator is the only role that can approve gated lanes, cloud stealth fallback, credentialed test accounts, CAPTCHA-adjacent investigation, public posting, destructive actions, or bulk crawling.

## Eval Suite Shape

The canonical suite definition is `evals/web-access/eval-suite.yaml`.

Default safe lanes:

- `phase0-smoke`: validator plus agent-browser and Crawl4AI smoke against `https://example.com`.
- `researcher-pilot`: Crawl4AI breadth plus agent-browser rendered evidence against `https://example.com`.
- `qa-builder-smoke`: QA and Builder sandbox-local profile smoke against `https://example.com`.

Manual gated lanes:

- `gated-antibot-matrix`: classifies hard-site blockers without bypass unless separately approved.
- `gated-auth-persistence`: verifies approved test-account session persistence without real credentials in prompts or evidence.
- `gated-token-cost-baseline`: measures evidence size and token/cost proxy on approved targets.

The suite runner, `evals/web-access/run-web-access-suite.sh`, runs only the default safe lanes and Docker status. Gated anti-bot, login/auth persistence, cloud, proxy, CAPTCHA, and destructive lanes are defined only and are not runnable by default.

Token/cost notes:

- Prefer Crawl4AI Markdown and agent-browser compact snapshots over raw HTML.
- Record evidence byte counts and source counts in suite summaries when practical.
- Treat large raw dumps as drift unless a bounded investigation explicitly needs them.
- GBrain packets should contain durable facts and paths, not page dumps.

## Greenlight Matrix

| Action | Default | Required approval | Evidence required |
|---|---|---|---|
| Cloud stealth or hosted browser fallback | Blocked | Orchestrator greenlight plus Maintainer risk note | target, reason local failed, allowed provider, expiry, no default config change |
| Proxy escalation or rotation | Blocked | Orchestrator greenlight plus Maintainer service note | target list, legal/terms posture, rate limits, owner |
| Credentials or login | Blocked | Orchestrator greenlight plus approved test account | auth scope, credential handling path, screenshot redaction plan |
| CAPTCHA handling | Classify only | Orchestrator greenlight for investigation; bypass remains prohibited unless legal/test-owned | blocker screenshot, target owner, stop condition |
| Public posting, sending, purchase, checkout | Blocked | Orchestrator greenlight and explicit user confirmation | action contract, dry-run evidence, final confirmation |
| Destructive account/admin/data action | Blocked | Orchestrator greenlight and explicit user confirmation | rollback plan, target owner, final confirmation |
| Bulk crawls | Blocked beyond lane budget | Orchestrator greenlight plus Researcher source budget | allowed targets, robots/site terms posture, max URLs/depth/rate |

No cloud stealth default is allowed. Any future cloud, proxy, or stealth support must be opt-in, documented in the lane, and absent from default suite execution.

## Maintenance Checklist

Monthly:

- Run `bash evals/web-access/run-web-access-suite.sh`.
- Run `python3 scripts/validate-web-access-empowerment.py`.
- Run `docker ps --filter name=crawl4ai --format '{{.Names}} {{.Image}} {{.Status}} {{.Ports}}'`.
- Check `agent-browser --version`, `agent-browser skills list`, and Crawl4AI `/health`.
- Review `.hermes/evidence/web-access/suite/latest-summary.md` for drift, blockers, or evidence-size surprises.

Quarterly:

- Reconfirm owners and greenlight rules against `swarm.yaml` and active profile skills.
- Review pinned versions for `agent-browser` and `unclecode/crawl4ai:0.8.5`; upgrade only after safe lanes pass.
- Revisit the gated anti-bot, auth persistence, and token/cost lanes without running them by default.
- Sample Researcher source inventories for robots/site terms posture and source-quality consistency.
- Archive or label stale evidence while keeping the latest suite summary available.

## Incident and Blocker Report Format

Use this format in reports, fan-in files, or `JOB_STATUS.md` when a lane cannot pass:

```text
Status: PASS | REVISE | BLOCK
Lane:
Owner:
Command:
Exit code:
Started:
Finished:
Failure class: robots_terms | auth_needed | captcha | js_rendering | extraction_quality | selector_drift | network | runtime_missing | guardrail
Exact output:
Evidence paths:
Guard posture:
Decision needed:
Next safe action:
```

Blockers are data. Do not hide them behind retries, target changes, cloud fallback, proxy changes, or broader permissions.
