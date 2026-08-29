---
name: agent-browser-core
description: Use Vercel agent-browser as the default low-token browser interaction layer for Hermes swarm workers: persistent local Chrome profiles, compact accessibility snapshots, refs, screenshots, traces, and gated cloud fallback.
version: 1.0.0
metadata:
  hermes:
    tags: [web-access, browser, agent-browser, playwright, qa, research]
---

# Agent Browser Core

Use this skill whenever a worker needs to inspect or interact with a real website and does not specifically need raw Playwright code. It is the Phase 0 default browser interaction layer for the swarm.

## Install / verify

```bash
npm install -g agent-browser
agent-browser install
agent-browser --version
agent-browser skills list
agent-browser doctor --fix
```

Known-good Phase 0 version on this laptop: `agent-browser 0.27.0`.

## Default local profile strategy

Use one persistent Chrome profile directory per worker and a matching session name:

```bash
export AGENT_BROWSER_PROFILE="$HOME/.agent-browser/profiles/<worker-id>"
export AGENT_BROWSER_SESSION_NAME="hermes-<worker-id>"
mkdir -p "$AGENT_BROWSER_PROFILE"
```

Recommended worker ids:
- `researcher`
- `qa`
- `builder`
- `maintainer`

Close the daemon before switching profile/session options:

```bash
agent-browser close --all || true
agent-browser --profile "$AGENT_BROWSER_PROFILE" --session-name "$AGENT_BROWSER_SESSION_NAME" open https://example.com
```

## Core workflow

Always prefer the CLI's version-matched instructions before guessing commands:

```bash
agent-browser skills get core --full
```

Low-token page inspection (pass profile/session on the first `open` after closing; subsequent commands attach to the running daemon):

```bash
agent-browser close --all || true
agent-browser --profile "$AGENT_BROWSER_PROFILE" --session-name "$AGENT_BROWSER_SESSION_NAME" open https://example.com
agent-browser snapshot -i --compact
agent-browser get title
```

Deterministic actions use `@eN` refs from snapshots:

```bash
agent-browser click @e2
agent-browser fill @e4 "search query"
agent-browser press Enter
```

Evidence capture:

```bash
mkdir -p .hermes/evidence/web-access
agent-browser screenshot .hermes/evidence/web-access/page.png
agent-browser trace start .hermes/evidence/web-access/trace.json
# perform flow
agent-browser trace stop .hermes/evidence/web-access/trace.json
agent-browser network requests > .hermes/evidence/web-access/network.txt
```

## Governance

- Respect robots.txt and site terms.
- Prefer local Chrome/CDP. Do not enable cloud/browserbase/agentcore unless an Orchestrator greenlight explicitly approves the target and budget.
- Do not store credentials in prompts, screenshots, or docs. Use `agent-browser auth save` only for approved accounts and redact proof artifacts.
- If local profile/session options are ignored, close all agent-browser sessions and reopen with the desired profile.
- For broad content extraction, prefer `crawl4ai-research` first; use agent-browser when interaction, login state, screenshots, or JS-heavy inspection is needed.

## Phase 0 smoke

```bash
PROFILE="$HOME/.agent-browser/profiles/hermes-smoke"
mkdir -p "$PROFILE"
agent-browser close --all || true
agent-browser --profile "$PROFILE" --session-name hermes-smoke open https://example.com
agent-browser snapshot -i --compact
agent-browser screenshot /tmp/agent-browser-smoke.png
agent-browser close
```
