---
name: builder-agent-browser
description: "Builder-specific web task execution with agent-browser: form flows, GitHub/admin UI checks, authenticated smoke, and deterministic evidence without raw browser-token bloat."
version: 1.0.0
metadata:
  hermes:
    tags: [builder, web-execution, agent-browser, evidence]
---

# Builder Agent Browser

Use when Builder needs to execute or verify a real website/application flow, especially forms, admin UIs, GitHub/Notion-style interfaces, or post-implementation browser checks.

## Profile

```bash
export AGENT_BROWSER_PROFILE="$HOME/.agent-browser/profiles/builder"
export AGENT_BROWSER_SESSION_NAME="hermes-builder"
mkdir -p "$AGENT_BROWSER_PROFILE"
```

For bounded eval runners, prefer sandbox-local state instead of the global default:

```bash
export AGENT_BROWSER_PROFILE="$PWD/.agent-browser-profiles/builder"
export AGENT_BROWSER_SESSION_NAME="hermes-builder-phase2"
mkdir -p "$AGENT_BROWSER_PROFILE"
```

## Builder flow contract

Before acting, define:
- target URL
- allowed actions and forbidden destructive actions
- auth profile/session to use
- expected end state
- evidence directory

Evidence bundle:

```text
.hermes/evidence/web-access/builder/<run-id>/
  actions.md
  before.snapshot.txt
  after.snapshot.txt
  before.png
  after.png
  console.txt
  network.txt
```

Allowed default actions are navigation, snapshot, screenshot, hover/click on non-mutating controls, and local/test form fill without submit. Public posting, purchases, credential changes, destructive admin actions, external sends, CAPTCHA bypass, cloud stealth, and production mutation require Orchestrator greenlight.

Phase 2 route: use agent-browser first for bounded execution evidence, Crawl4AI only for source/context preflight, Playwright/browser-harness only for app-owned or trace-level debugging, and deep-browser only after greenlight.
