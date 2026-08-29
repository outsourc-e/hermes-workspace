---
name: researcher-agent-browser
description: Researcher-specific routing for agent-browser: GBrain first, Crawl4AI for breadth, then low-token browser interaction and evidence capture when a site needs JS/auth/clicking.
version: 1.0.0
metadata:
  hermes:
    tags: [researcher, idea-engine, web-access, agent-browser, gbrain]
---

# Researcher Agent Browser

Use for Researcher / Idea Engine external research when static fetch or Crawl4AI breadth is not enough.

## Routing order

1. Query GBrain/internal memory first when the question may already be known.
2. Use `crawl4ai-research` for breadth, Markdown extraction, market maps, competitor pages, and source diversity.
3. Use `agent-browser-core` for JS-heavy pages, login-gated pages, interaction, screenshot evidence, auth/session reuse, and low-token snapshots.
4. Use browser-use/deep agentic execution only after the above fail and the task has Orchestrator approval.

## Researcher profile

```bash
export AGENT_BROWSER_PROFILE="$HOME/.agent-browser/profiles/researcher"
export AGENT_BROWSER_SESSION_NAME="hermes-researcher"
mkdir -p "$AGENT_BROWSER_PROFILE"
```

## Site intelligence pattern

For each target site record:
- source URL and access timestamp
- robots/terms posture if relevant
- access method: gbrain | crawl4ai | agent-browser | manual-gated
- extracted Markdown/snapshot path
- screenshot path when interaction was needed
- source reliability tier
- concise findings with uncertainty

Suggested evidence directory:

```bash
.hermes/evidence/web-access/researcher/<slug>/
```

## Autoresearch contract add-on

External research loops must keep the normal autoresearch fields and add:

```yaml
access_stack: gbrain -> crawl4ai -> agent-browser -> deep-browser-gated
robots_terms_guard: respect robots.txt and site terms; no credential/account automation without greenlight
source_budget: <max URLs/pages/tokens>
evidence_dir: .hermes/evidence/web-access/researcher/<run-id>
capture: markdown, source_inventory.json, selected screenshots, failure log
metric: source quality/diversity or task-specific scalar; never raw page count alone
```

Do not start a loop that can mutate evals, bypass site terms, or require CAPTCHA solving without explicit Orchestrator approval.
