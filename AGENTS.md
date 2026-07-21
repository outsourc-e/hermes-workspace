# Hermes Workspace Agent Contract

## Project-local War Room contract

## Current Focus

This repo contains the active Living War Room V3 work for Hermes Workspace.
The current usable route is:

- `/war-room?etsyOps=1`
- `/war-room?etsyOps=1&bodyRuntime=1`

The current product focus is Etsy Market Lab for `DolaroBoutique`.

## Current Source of Truth — 2026-06-29

- Etsy Market Lab operator IDs are now fully renamed in active source code:
  - `loki` = product hunt + source leads
  - `thor` = SEO, source truth, ShotLab prep, QA
  - `odin` = draft approval king / DLV gate
- Active Etsy station IDs are now `etsy-loki-product-hunt`, `etsy-thor-seo-metrics`, `etsy-loki-source-leads`, `etsy-thor-source-truth`, `etsy-thor-shotlab-prep`, `etsy-thor-qa-review`, and `etsy-odin-draft-approval`.
- Historical docs/prompts may still mention older cast/station names. Treat those as archived history only, not source of truth.
- Council of Strategists is currently a local scripted persona surface, not six live AI agents. It must stay dormant/roaming until DLV writes to it. Connecting real AI generals requires explicit approval and bounded controlled one-shot execution.

## Non-Negotiable Safety Rules

- Do not connect additional/uncontrolled Hermes, Kanban, Codex, Claude, or browser workers. Current approved exceptions are the bounded controlled runner profiles already verified for Etsy Market Lab: `Hermes V1` and `Scout V2`.
- Do not spawn processes from the app except through the approved bounded controlled runner in `src/lib/war-room/body/controlled-athena-runner.ts`.
- Do not use `child_process` in the War Room runtime outside `src/lib/war-room/body/controlled-athena-runner.ts`.
- Do not call live Etsy, Alura, AliExpress, Alibaba, Google Sheets, ShotLab, Discord, supplier messaging, paid generation, purchases, publishing, account APIs, or browser automation.
- All marketplace actions must remain local-only, draft-only, and approval-gated.
- Default/final agent control state must remain:
  - `mode: "frozen"`
  - `frozen: true`
  - `usageAllowed: false`
  - `workerSpawnAllowed: false`
- Hermes should later connect through typed intents/events only. It must not directly mutate React layout, CSS, assets, or room geometry.

## Architecture Principle

Build the body contract and runtime, not the brain.

The UI/body owns:

- map layout
- rooms/stations
- assets and animation display
- camera/pan/zoom
- packet visualization
- approval gates

Hermes/future agents should only send:

- typed intents
- typed events
- local packet updates
- approval requests

## Active Living V3 Areas

Important paths:

- `src/screens/war-room/living-v3/LivingWarRoomV3.tsx`
- `src/screens/war-room/living-v3/living-war-room-v3.css`
- `src/lib/war-room/living-v3/living-v3-contract.ts`
- `src/lib/war-room/living-v3/etsy-pipeline.ts`
- `src/lib/war-room/living-v3/etsy-room-contracts.ts`
- `src/lib/war-room/living-v3/bidi-text.ts`
- `src/lib/war-room/body/`
- `src/routes/api/war-room/`

## Current Room Model

Living V3 currently has an 11-room direction:

- `olympus-command`
- `agora-opportunity`
- `oracle-signals`
- `forge-hephaestus`
- `merchant-harbor`
- `atlantis-vault`
- `treasury-commerce`
- `pantheon-quarters`
- `daedalus-workshop`
- `gateway-cockpit`
- `council-strategists`

Etsy Market Lab is the active operating surface inside the War Room flow. Do not add more rooms for the current task unless the user explicitly asks.

## Active Etsy Market Lab Operators

Local visual/runtime agents added for Etsy Market Lab:

- `loki`
  - Product discovery
  - Home: `etsy-market-lab`
  - Primary stations: `etsy-loki-product-hunt`, `etsy-thor-seo-metrics`
- `thor`
  - Metrics, ledgers, keywords, sheet readiness
  - Home: `etsy-market-lab`
  - Primary stations: `etsy-thor-seo-metrics`, `etsy-thor-source-truth`
- `odin`
  - Draft-only handoff/readback
  - Home: `etsy-market-lab`
  - Primary stations: `etsy-odin-draft-approval`, `etsy-thor-qa-review`

Julius must remain reserved for the Council/Generals direction. Do not route Etsy station work to Julius.

## Current Etsy Room Flow

The Etsy room now has a local-only event-driven flow:

`Loki -> Selected Product -> ShotLab -> SEO -> Draft -> Approval`

Implemented local intents:

- `prepare_product_scout_packet_local`
- `apply_product_scout_worker_packet_local`
- `select_etsy_candidate_local`
- `create_shotlab_handoff_local`
- `create_seo_packet_local`
- `create_draft_payload_local`
- `request_dlv_approval_local`

Implemented local events:

- `etsy.scout.request.created`
- `etsy.candidates.ready`
- `etsy.candidate.selected`
- `etsy.shotlab.packet.created`
- `etsy.seo.packet.created`
- `etsy.draft.payload.created`
- `etsy.approval.requested`
- `etsy.pipeline.frozen`

Every packet must remain local-only and include stable technical fields:

- `packetId`
- `runId`
- `createdAtMs`
- `sourceStationId`
- `targetStationId`
- `status`
- `dataOrigin`
- `sourceRecordIds`
- `evidenceIds`
- `missingFields`
- `lockedActions`
- `nextHandoff`
- `humanApprovalRequired`

## Oracle / Alura Local Search

Oracle has a local-only Alura cache search path.

Important rule:

- Default `sourceMode` must remain `alura_only`.
- Do not treat the mixed Product Intelligence SQLite DB as product truth.
- If Product Intelligence is used as fallback, label it as mixed local archive, not Oracle/Alura signal.

The Oracle Scout bridge can create a local `OracleSignalPacket` and send it into Etsy Market Lab, still without live Alura calls.

## RTL / Hebrew Support

RTL support is intentionally scoped.

- Do not flip the whole app to RTL.
- Hebrew/Arabic text containers can use RTL.
- English labels, code, paths, IDs, JSON, commands, packet IDs, and URLs must stay LTR.

Current helper:

- `src/lib/war-room/living-v3/bidi-text.ts`

## Tests To Run

Focused checks:

```bash
pnpm vitest run src/lib/war-room/body
pnpm vitest run src/lib/war-room/living-v3
pnpm build
```

Useful narrower checks:

```bash
pnpm vitest run src/lib/war-room/living-v3/etsy-room-contracts.test.ts src/lib/war-room/living-v3/bidi-text.test.ts
pnpm vitest run src/lib/war-room/body/oracle-scout-event-bridge.test.ts
```

Browser QA route:

```text
http://127.0.0.1:3000/war-room?etsyOps=1&bodyRuntime=1
```

Expected QA:

- starts FROZEN
- `usageAllowed:false`
- `workerSpawnAllowed:false`
- Oracle Scout still works
- Oracle packet reaches Loki/Etsy Market Lab
- selected candidate creates selected product packet
- ShotLab packet can be staged locally
- SEO packet can be staged locally
- draft payload preview appears
- DLV approval packet appears
- upload/publish stay disabled
- Hebrew text appears RTL in notes/readback
- English/code/packet IDs remain LTR
- no console errors
- no failed requests
- no external requests

## Known UX Gap

The current Workspace/Etsy room is functionally advancing, but the primary UI still feels too heavy, static, text-dense, and debug-console-like for DLV. This is now a product-direction issue, not just a polish issue.

DLV's target is a practical AI workspace that replaces manual Hermes chat/image/text/voice workflows. Every tool/agent needs a purpose-built work surface:

- Product Search: searchable cards, filters, source proof, score, risk, shortlist, choose.
- Source Truth: compact product facts, variants, missing evidence, unsupported claims.
- ShotLab: gallery/production board, approved/rejected media, handoff state.
- SEO: title/tags/metrics workbench with Vol/Comp/Score and paste-ready output.
- Approval: clean decision console, not a raw log.

Technical kernel events, safety readbacks, raw JSON, long explanations, and QA markers must stay available but move into collapsible `Proof / Debug / Details`, not the main work area.

A good next improvement is not only an internal "Open next station" drawer control; it is a practical Product Prep workbench that makes the next action obvious and removes irrelevant static text from the primary view.

## Current State Statement

`Etsy Product Prep Workbench V1` is implemented and wired into Loki Product Hunt / `etsy-loki-product-hunt` on `/war-room?etsyOps=1&bodyRuntime=1`.

Implemented user-facing surfaces:

- Product Search
- Candidate Sorting
- Product Dossier
- ShotLab Prep
- SEO Workbench
- Preview / Approval

Stable QA markers include:

- `data-product-prep-workbench="v1"`
- `data-workbench-mode="practical"`
- `data-live-actions-locked="true"`
- `data-debug-proof-collapsed="true"`

Codex reported PASS for focused tests/build/browser QA: living-v3 72 tests, body 50 tests, etsy-live scout 4 tests, `pnpm build`, browser QA with no console errors, no failed requests, no external requests, and no forbidden requests. Hermes spot-check confirmed the workbench file/test/wiring markers exist.

Only the approved bounded controlled workers `Hermes V1` and `Scout V2` are connected.
No external/live marketplace actions are connected.
Live read-only scout remains blocked safely unless/ until an approved connector is configured.
Further Hermes capabilities must still connect through typed intents/events only and return to `FROZEN`.

---

## Upstream semantic worker contract

This workspace uses semantic Hermes swarm workers, not numbered-only lanes. The source of truth for routing is `swarm.yaml`; each worker also has a matching profile under `~/.hermes/profiles/<worker-id>/`, a role skill `<worker-id>-core`, and a wrapper in `~/.local/bin/`.

## Current semantic roster

| Worker | Wrapper | Tools | Skills | MCP | Plugins |
|---|---|---|---|---|---|
| `orchestrator` | `orchestrator:plan` | todo, kanban, delegation, terminal, file, gbrain, session_search, cronjob, skills, clarify, web | orchestrator-core, gstack-for-hermes, gbrain, kanban-orchestrator, subagent-driven-development, writing-plans, requesting-code-review, workspace-dispatch | gbrain | none |
| `km-agent` | `km:health` | gbrain, file, terminal, session_search, skills, todo, cronjob, web | km-agent-core, gbrain, obsidian-markdown, obsidian-cli, obsidian-bases, json-canvas, gstack-for-hermes | gbrain | none |
| `builder` | `builder:task` | terminal, file, browser, web, gbrain, session_search, skills, todo | builder-core, gstack-for-hermes, test-driven-development, systematic-debugging, github-pr-workflow, requesting-code-review, codebase-inspection | gbrain | none |
| `reviewer` | `reviewer:gate` | terminal, file, web, gbrain, session_search, skills | reviewer-core, requesting-code-review, github-code-review, systematic-debugging, gstack-for-hermes, gbrain, codebase-inspection | gbrain | none |
| `qa` | `qa:smoke` | browser, terminal, file, vision, gbrain, session_search, skills, web | qa-core, browser-harness-power-use, dogfood, gstack-for-hermes | gbrain | none |
| `researcher` | `researcher:quick` | gbrain, web, browser, terminal, file, vision, session_search, skills, todo | researcher-core, gbrain, autoresearch, browser-harness-power-use, gstack-for-hermes, researcher-quick, researcher-autoresearch, arxiv, youtube-content, polymarket | gbrain | none |
| `ops-watch` | `ops:health` | terminal, cronjob, file, gbrain, skills, session_search, web | ops-watch-core, gbrain, hermes-agent, systematic-debugging, webhook-subscriptions | gbrain | none |
| `maintainer` | `maintainer:check` | terminal, file, web, browser, gbrain, session_search, skills | maintainer-core, github-repo-management, github-pr-workflow, github-issues, github-code-review, gbrain, gstack-for-hermes, hermes-agent | gbrain | none |
| `strategist` | `strategist:review` | gbrain, web, session_search, file, skills, todo, clarify | strategist-core, gstack-for-hermes, gbrain, writing-plans, polymarket | gbrain | none |
| `inbox-triage` | `inbox:triage` | gbrain, web, file, session_search, todo, skills, terminal | inbox-triage-core, gbrain, obsidian-markdown, gstack-for-hermes, defuddle, youtube-content | gbrain | none |

## Operating rules

- Keep `swarm.yaml`, profile `config.yaml`, profile core skills, and wrappers aligned when changing a worker.
- Prefer GBrain-first lookup for context-sensitive RAZSOC/Hermes/workflow decisions.
- Builder implements; Reviewer gates; QA verifies behavior; Orchestrator routes and enforces greenlight.
- Do not enable optional Hermes plugins globally unless the task explicitly needs them; record plugin/toolset alignment in `swarm.yaml` first.
- For local Workspace pairing/debugging, treat **one gateway + one dashboard** as canonical: `hermes gateway run` on `:8642` and `hermes dashboard` on `:9119`. Before starting another gateway, verify `curl http://127.0.0.1:3000/api/sessions` (or the active workspace port) first. If Sessions already returns data, refresh/reprobe the UI instead of spawning a duplicate gateway.
- If the default model is `gpt-5.4` / `openai-codex`, remember that chat depends on a live local Codex CLI login (`codex login`).

## Windows-specific notes (2026-06-01)

- **Three services required**: Gateway (:8642) + Dashboard (:9119) + Workspace (:3000). All must be running for full functionality.
  - Gateway: `hermes gateway run`
  - Dashboard: `hermes dashboard --port 9119 --host 127.0.0.1 --no-open`
  - Workspace: `pnpm dev`
  - Or use the Electron desktop app: `pnpm electron:dev` (auto-starts all three)
- **Desktop app**: Full Electron app (`electron/main.cjs`). Double-click to launch — no terminal needed. Auto-detects and spawns gateway (or dashboard if configured).
- **Build**: `electron:build:win` produces NSIS installer in `release/`.
- **Dev mode**: `electron:dev` launches Electron in dev mode (builds Vite client first, hot-reloads on change).
- **Running build output**: `release/win-unpacked/hermes-workspace.exe` (test builds).
- **Electron:dev fix**: `NODE_ENV=development` prefix doesn't work on Windows — script stripped to just `electron .`.
- **Windows spawn fixes** (in `electron/main.cjs`): `spawnDetached()` uses `cmd /c` on Windows (not `bash -lc`), log paths use `%TEMP%` (not `/tmp`), `isHermesInstalled()` uses `where hermes`, `installHermesInBackground()` uses `pip install` (not `curl|bash`).
- **Two `.env` files**: Gateway reads `C:\\Users\\<you>\\AppData\\Local\\hermes\\.env`; CLI reads `C:\\Users\\<you>\\.hermes\\.env`; workspace reads `hermes-workspace\\.env`. Keep API keys in sync across all three.
- **Gateway API server**: Requires `API_SERVER_ENABLED=true` + `API_SERVER_KEY` in the gateway's `.env`. Without these, the gateway starts with no connected platforms.
- **Workspace env vars**: Runtime reads `CLAUDE_API_URL` / `CLAUDE_API_TOKEN` / `CLAUDE_DASHBOARD_URL` (not `HERMES_*` variants).
- **sqlite3 CLI**: Not bundled on Windows. Install via `winget install SQLite.SQLite`, then copy `sqlite3.exe` to a Git Bash PATH directory (winget installs to a long path not in PATH).
- **claude CLI**: Required for Claude Tasks / Conductor features. Install via `npm install -g @anthropic-ai/claude-code`.
- **Port conflicts**: Use `netstat -ano | findstr :<port>` + `Stop-Process -Id <PID> -Force` (PowerShell) — `lsof` not available in Git Bash on Windows.
- **PWA install**: Dashboard at `http://127.0.0.1:3000` can be installed as PWA via Chrome/Edge address bar install icon. Prefer Electron build for production.
- **Slack invalid_auth**: Expected if Slack tokens aren't configured — ignore, doesn't affect core functionality.
- **Node version**: Requires Node.js 22+. Check with `node --version`.
- **`NODE_OPTIONS` stripped**: Windows doesn't support env var prefix in npm scripts — removed from `build` and `electron:dev` scripts.
