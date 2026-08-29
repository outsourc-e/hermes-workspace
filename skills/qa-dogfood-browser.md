---
name: qa-dogfood-browser
description: QA-specific browser smoke and dogfood harness using agent-browser snapshots, screenshots, traces, console/errors, and repeatable evidence capture.
version: 1.0.0
metadata:
  hermes:
    tags: [qa, dogfood, browser, smoke, evidence, agent-browser]
---

# QA Dogfood Browser

Use for QA smoke tests, regression reproduction, exploratory dogfooding, and browser evidence capture.

## Profile

```bash
export AGENT_BROWSER_PROFILE="$HOME/.agent-browser/profiles/qa"
export AGENT_BROWSER_SESSION_NAME="hermes-qa"
mkdir -p "$AGENT_BROWSER_PROFILE"
```

For bounded eval runners, prefer sandbox-local state instead of the global default:

```bash
export AGENT_BROWSER_PROFILE="$PWD/.agent-browser-profiles/qa"
export AGENT_BROWSER_SESSION_NAME="hermes-qa-phase2"
mkdir -p "$AGENT_BROWSER_PROFILE"
```

Load the upstream dogfood instructions when exploring an app:

```bash
agent-browser skills get dogfood --full
```

## Required evidence bundle

For every QA flow create:

```text
.hermes/evidence/web-access/qa/<run-id>/
  snapshot-before.txt
  snapshot-after.txt
  screenshot-before.png
  screenshot-after.png
  console.txt
  errors.txt
  network.txt
  qa-report.md
```

Minimum smoke:

```bash
agent-browser open <url>
agent-browser snapshot -i --compact > snapshot-before.txt
agent-browser screenshot screenshot-before.png
# perform the flow with refs
agent-browser console --clear > console.txt
agent-browser errors --clear > errors.txt
agent-browser network requests > network.txt
agent-browser snapshot -i --compact > snapshot-after.txt
agent-browser screenshot screenshot-after.png
```

## Report shape

```text
Flow:
URL(s):
Profile/session:
Expected:
Actual:
Evidence files:
Console/errors summary:
Pass | Fail | Block:
Primary blocker if blocked:
```

Cloud stealth, CAPTCHA solving, public posting, account mutation, and destructive flows require Orchestrator greenlight.

Phase 2 route: use agent-browser first for snapshot/action/screenshot evidence, Crawl4AI only for source preflight, Playwright/browser-harness only for app-owned or trace-level debugging, and deep-browser only after greenlight.
