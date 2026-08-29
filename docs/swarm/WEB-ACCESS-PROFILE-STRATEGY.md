# Web Access Persistent Profile Strategy

Status: Phase 0 accepted
Owner: Orchestrator + Maintainer
Source plan: `docs/swarm/WEB-ACCESS-EMPOWERMENT-PLAN.md`

## Default stack order

1. GBrain/internal context first.
2. Crawl4AI local service for broad external extraction.
3. Vercel agent-browser for interaction, auth/session reuse, screenshots, and low-token snapshots.
4. browser-use/deep browser agent only for explicit, bounded escalation.
5. Cloud stealth only after explicit Orchestrator greenlight.

## Persistent local profiles

Use one agent-browser Chrome profile and session per worker:

| Worker | Profile dir | Session name | Primary use |
|---|---|---|---|
| researcher | `~/.agent-browser/profiles/researcher` | `hermes-researcher` | research snapshots, source QA, login-gated research when approved |
| qa | `~/.agent-browser/profiles/qa` | `hermes-qa` | browser smoke, dogfood evidence, reproducible flows |
| builder | `~/.agent-browser/profiles/builder` | `hermes-builder` | implementation verification and scoped web execution |
| maintainer | `~/.agent-browser/profiles/maintainer` | `hermes-maintainer` | upstream/doc/version checks |
| smoke | `~/.agent-browser/profiles/hermes-smoke` | `hermes-smoke` | install verification only |

Before switching profiles, close the daemon:

```bash
agent-browser close --all || true
```

Then launch with:

```bash
agent-browser --profile "$HOME/.agent-browser/profiles/<worker>"   --session-name "hermes-<worker>" open https://example.com
```

## Credential policy

- Do not place credentials in prompts or docs.
- Use `agent-browser auth save` only for approved accounts and non-public test credentials.
- Redact screenshots and reports that could include tokens, emails, dashboards, or account data.
- Persistent profiles are local state; do not copy them into repos or GBrain.

## Cloud stealth gate

Cloud/browserbase/agentcore/proxy escalation is not default. Required gate fields:

```yaml
target_site:
reason_local_failed:
business_value:
account_used:
allowed_actions:
max_budget:
evidence_dir:
expiry:
approved_by_orchestrator:
```
