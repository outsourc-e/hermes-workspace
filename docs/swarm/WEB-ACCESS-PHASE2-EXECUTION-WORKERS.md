# Web Access Phase 2: Execution Workers Upgrade

Status: Phase 2 bounded execution-worker upgrade
Owner: QA + Builder + Orchestrator
Source phase: `docs/swarm/WEB-ACCESS-PHASE1-IDEA-ENGINE.md`

## Active doctrine

Phase 2 upgrades QA and Builder use of the web-access stack without broadening into unbounded browser automation. The default remains local-first, evidence-backed, and gated:

1. agent-browser first for rendered snapshots, deterministic `@eN` actions, screenshots, and session-backed inspection.
2. Crawl4AI only for preflight/source context before an execution flow, not as a substitute for rendered QA evidence.
3. Playwright/browser-harness only when the target is app-owned, local, or trace-level debugging requires the existing harness.
4. browser-use/deep-browser gated escalation only after explicit Orchestrator greenlight.
5. No cloud stealth, proxy escalation, credentials, public actions, destructive actions, CAPTCHA handling, or external sends by default.

## QA routing doctrine

QA uses agent-browser as the first execution surface for smoke tests and bug reproduction because it produces compact snapshots, stable refs, and screenshot proof without raw browser-token bloat.

| Step | Tool | Use when | Evidence |
|---|---|---|---|
| 1 | agent-browser | Need snapshot, click/type action, screenshot, rendered state, or session posture. | `snapshot-before.txt`, `snapshot-after.txt`, screenshots, QA report |
| 2 | Crawl4AI | Need source/context preflight for a public page before rendered inspection. | Markdown JSON or normalized Markdown linked from report |
| 3 | Playwright/browser-harness | Need app-owned local flow, trace viewer artifact, console/network deep debugging, or existing regression harness integration. | Playwright trace path, console/errors/network logs, screenshots |
| 4 | browser-use/deep-browser | Need autonomous multi-step execution that cannot be bounded with direct refs. | Orchestrator greenlight plus action/evidence log |

QA must classify blockers rather than bypassing them. CAPTCHA, account walls, anti-bot blocks, credential prompts, public posting forms, purchase flows, and admin mutation screens stop the run unless Orchestrator greenlight explicitly approves a bounded test account and action list.

## Builder routing doctrine

Builder may use agent-browser to verify implementation behavior, inspect GitHub/admin-style UIs, and execute scoped web flows. Builder must state the flow contract before acting:

- Target URL and target owner: public safe page, local app, app-owned staging, or approved third-party.
- Allowed actions: navigation, snapshot, screenshot, hover/click on non-mutating controls, form fill on local/test targets, and explicit submit only when approved.
- Forbidden destructive actions: credential entry, purchase/checkout, posting/sending, account mutation, permission changes, data deletion, production admin changes, CAPTCHA bypass, and cloud stealth without greenlight.
- Expected end state: the observable state that proves the task is complete.
- Evidence directory: where all action logs, snapshots, screenshots, traces, and reports are written.
- Auth/session posture: unauthenticated by default; approved local or test profiles only; no credentials in prompts, docs, screenshots, or GBrain packets.

Builder should stop at the first unexpected permission, credential, payment, public-send, destructive, or CAPTCHA boundary and record `BLOCK` with the page state and evidence path.

## Evidence standards

Every QA or Builder execution-worker run should produce a compact evidence bundle under `.hermes/evidence/web-access/`.

Minimum QA bundle:

```text
.hermes/evidence/web-access/qa/<run-id>/
  snapshot-before.txt
  screenshot-before.png
  qa-report.md
```

Minimum Builder bundle:

```text
.hermes/evidence/web-access/builder/<run-id>/
  before.snapshot.txt
  before.png
  actions.md
```

When available and relevant, add:

- `snapshot-after.txt` and `screenshot-after.png` after the action.
- `console.txt`, `errors.txt`, and `network.txt` for browser/runtime issues.
- `trace.zip`, `trace.json`, or a Playwright trace path when produced by browser-harness.
- A summary JSON with target, worker, profile path, session name, checks, status, and guard posture.

Reports must say what was attempted, what was not attempted, why the route was chosen, which guards were active, and whether the result is `PASS`, `REVISE`, or `BLOCK`.

## Sandbox-local profile strategy

Runnable evals must not rely on global profile defaults. For sandbox smoke tests use:

```bash
export AGENT_BROWSER_QA_PROFILE="$PWD/.agent-browser-profiles/qa"
export AGENT_BROWSER_BUILDER_PROFILE="$PWD/.agent-browser-profiles/builder"
export AGENT_BROWSER_QA_SESSION_NAME="hermes-qa-phase2"
export AGENT_BROWSER_BUILDER_SESSION_NAME="hermes-builder-phase2"
```

Long-lived worker profiles may still use `~/.agent-browser/profiles/<worker-id>` after approval, but bounded eval runners should keep state under the sandbox so reruns are reproducible and do not leak into unrelated profile state.

## Governance

- GBrain/internal context remains first for Hermes/workspace decisions, but execution evidence must come from the browser/source tools.
- Do not mutate Opportunity Engine paths, unrelated `src/` app files, credentials, MCP server config, or cloud stealth defaults.
- Do not enable optional Hermes plugins globally for Phase 2.
- Do not broaden smoke targets beyond `https://example.com`.
- Do not perform credential entry, public posting, purchase, external send, account mutation, admin mutation, destructive flow, CAPTCHA bypass, cloud stealth, or proxy escalation without Orchestrator greenlight.
- browser-use/deep-browser remains gated and documented as fallback, not default.
