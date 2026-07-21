# Etsy Market Lab — Current Source of Truth

Updated: 2026-07-11 19:31 IDT +0300

This file is the project-local source of truth for the current Etsy Market Lab workstream.
The matching long-form Obsidian note is:

`/Users/mac/Documents/Hermes Second Brain/01 Projects/War Room/Etsy Market Lab - מקור אמת נוכחי.md`

## Official surface

- Repo: `/Users/mac/hermes-workspace`
- Route: `/war-room?etsyOps=1&bodyRuntime=1`
- UI: `Living V3 / Etsy Market Lab`
- Main screen file: `src/screens/war-room/living-v3/LivingWarRoomV3.tsx`

## Deprecated as source of truth

Do not restart from these unless explicitly asked:

- old `WarRoomGame`
- old `overhead` variants
- old station/god arrangements from abandoned War Room experiments
- any non-`Living V3` Etsy mock that is not wired into the packet flow below

## Official local packet flow

```text
Scout → Odin → Selected Product → ShotLab → SEO → Draft → Approval
```

Goal: prepare the Etsy room body for future Hermes connection via typed intents/events only.

## Current reported implementation

Latest Codex report says these were added or updated:

- `src/lib/war-room/living-v3/etsy-room-contracts.ts`
- `src/lib/war-room/body/etsy-room-event-bridge.ts`
- `src/routes/api/war-room/intents.ts`
- `src/screens/war-room/living-v3/LivingWarRoomV3.tsx`
- scoped RTL/Hebrew text support without flipping the whole app
- local flow through: Scout → Odin → Selected Product → ShotLab → SEO → Draft → Approval

Important: new worker capabilities must still pass a verification gate before being treated as usable automation. Approved controlled worker buttons so far: `Hermes V1`, `Scout V2`, and `Smart Intake Hermes Worker V1` behind Smart Intake only.

## Professional War Room Reset Batch 1 — 2026-07-11

Status: **STRUCTURAL PASS — ownership separated, duplicate navigation removed, and desktop/mobile Browser QA passed.**

Current ownership:

- Goblin/Opportunity owns discovery, comparative ranking, and `ResearchAtlasSurface.tsx`.
- Oracle owns local evidence/provenance verification through the extracted `OracleWorkbench.tsx`.
- Etsy Market Lab is execution-only: Product Inbox, source truth, variants, SEO, draft, QA, and the existing DLV approval gate.
- Council is advisory/decision-only and is not a second Etsy approval system.
- ShotLab remains the exclusive media-production and asset-state owner.

Important supersession:

- Research Lab is no longer a permanent Etsy rail tool or an Etsy primary canvas.
- Etsy can display a reviewed `researchMissionPacket`, but discovery/research starts from Goblin.
- The earlier verified Etsy Research Lab implementation remains historical evidence for the surface and packet, not its current room ownership.

Verified implementation and browser evidence:

- Goblin renders exactly two primary tabs: Opportunity Radar and Research Atlas. Embedded Atlas has no duplicate inner header.
- Oracle uses a dedicated evidence-only primary workbench and does not render the generic station drawer.
- Etsy exposes seven execution tools, mounts no Research Atlas surface, and labels Research ownership as moved to Goblin.
- Council mounts as the sole decision-only canvas; deep visual hierarchy redesign remains a later batch.
- Internal `Switch War Room from …` controls were removed. The single global room picker remains.
- Desktop `1440 × 900`: no page-level horizontal overflow, no overlapping Workspace/Map/room-picker controls after the shared-HUD fix, and no alerts in Goblin, Oracle, Etsy, or Council.
- Mobile `390 × 844`: document width `390 / 390`; Goblin tabs are `157 × 48`; Etsy tool targets are at least `76.5 × 59`; Council visible actions are at least `44px` high; no room mounts a competing owner canvas.
- Focused verification: TypeScript PASS; 4 files / 14 tests PASS; targeted ESLint has `0` errors; `git diff --check` PASS.
- Full Workspace quality command exited `0`: diff PASS, lint budget PASS/WARN (`0` errors, `1174/1178` warnings; reduction candidate only), TypeScript PASS, full tests PASS, and production build PASS. Artifact: `/Users/mac/.hermes/workspace-health/hermes-workspace/runs/2026-07-11T185551-771Z/quality-run.json`.
- Corrected MoA review: session `20260711_212246_c74ddd`; substantive reference responses from `openai-codex:gpt-5.6-luna`, `openai-codex:gpt-5.6-terra`, and `kimi-coding:kimi-k2.7-code`; aggregated by `openai-codex:gpt-5.6-sol`. Kimi's proposal to move ShotLab ownership into Etsy was rejected as incompatible with the protected contract.

## Earlier Research Lab primary workspace verification — 2026-07-11 (ownership superseded)

Status: **PASS — first-class inline Research Lab, local mission handoff, desktop/mobile browser QA, and full Workspace quality gate verified.**

Verified implementation:

- Research Lab is a permanent first-class tool in the Etsy Market Lab rail. It switches the primary canvas between `station` and `research` without replacing the protected War Room map, rooms, station IDs, or agent visuals.
- `ResearchAtlasSurface.tsx` presents the three existing shop reports before aggregate KPIs, makes the reusable workbook the primary artifact action, preserves the original interactive report, and supports product/shop/market target types with Quick/Standard/Deep/Meta depth presets.
- Research mission staging writes one local JSON packet only. The packet now enters `EtsyRoomState.researchMissionPacket`, updates the local readback receipt, and is shown as a staged handoff at the top of Product Inbox after returning from Research Lab.
- The old embedded Research Lab inside Product Prep was removed. The rail is the single Research Lab entry point.
- Toggle state is exposed with `aria-pressed`; mixed Hebrew/URL input uses `dir="auto"`; IDs and paths use isolated LTR rendering.
- Agent Workbench and Station Workbench Header keep truthful local/runtime/readback labels. Pointer-only drag/resize handles no longer claim unsupported keyboard operation, and narrow station-state badges wrap instead of compressing.
- Mobile Etsy workspace uses a visible 4 × 2 tool rail. The rail occupies a real `max-content` grid row and no longer overlaps the primary canvas.

Safety meaning:

- Mission staging does **not** run browser research, contact suppliers, call Alura, write Etsy, write Google Sheets, invoke ShotLab, or spawn a worker.
- The visible handoff explicitly says external research has not started and requires review before any external run.

Verification evidence:

- Focused component gate: 5 files / 16 tests passed.
- Browser desktop `1440 × 900`: document width `1440 / 1440`, Research Atlas ready, 8 rail tools visible, 0 clipped controls, 0 QA errors.
- Browser mobile `390 × 844`: document width `390 / 390`, 4 × 2 rail visible, rail/canvas overlap `0`, 0 QA errors.
- Browser mission flow: `מחקר חדש` → local mission `research-shop-20260711T162522Z-ffec70bccf` → `חזרה למוצרים` → staged Product Inbox handoff; no duplicate embedded Research Lab.
- Full `WORKSPACE_AUTOSTART_LOCAL_SERVICES=0 pnpm qa:workspace`: diff PASS, lint budget PASS/WARN (`0` errors, `1175` grandfathered warnings within baseline `1178`), TypeScript PASS, full tests PASS, production build PASS.
- Quality artifact: `/Users/mac/.hermes/workspace-health/hermes-workspace/runs/2026-07-11T163101-417Z/quality-run.json`.

## Verified earlier baseline

Previously verified before the latest Codex batch:

- Oracle local Alura search exists.
- Default Oracle source mode is `alura_only`.
- Oracle can create `OracleSignalPacket`.
- Etsy Market Lab / Odin can consume Oracle signal.
- Local Agent Event Bridge V1 works for `run_oracle_scout_local`.
- Final state returns to `FROZEN`.
- `usageAllowed:false` and `workerSpawnAllowed:false` remain required.

## Hard safety rules

Default/final state:

```text
FROZEN
usageAllowed:false
workerSpawnAllowed:false
```

Blocked unless DLV explicitly approves a later phase:

- live Etsy upload/draft/publish/edit/renew
- supplier messages or purchases
- live Alura/AliExpress/Alibaba calls
- Google Sheets writes
- ShotLab or paid generation
- browser automation
- additional Hermes worker spawn/fan-out outside the approved controlled runner
- Kanban dispatch
- `child_process` / `spawn` outside `src/lib/war-room/body/controlled-athena-runner.ts`

## Responsibility split

Codex owns the body:

- React/TypeScript/CSS
- local routes and contracts
- local event scaffolding
- tests and build fixes
- UI packet/readback surfaces

Hermes owns the brain and gate:

- source-of-truth updates
- safety inspection
- tests/build/browser verification
- one controlled worker connection only after DLV approval
- freeze/usage/process hygiene

## Definition of done for current phase

`Controlled Etsy Room Ready` is done when:

- full local flow works from Oracle/Scout to Approval
- every live action is disabled
- packets/events are visible and typed
- no external requests occur in browser QA
- no console errors
- body/living-v3 tests pass
- `pnpm build` passes
- Obsidian and this file are updated

## Typed Intent Routing V1 Verification — 2026-06-23 07:15 IDT

Status: **PASS — Command Room Manager routes messy tasks into existing local stations/tools.**

Evidence file:

`docs/status/etsy-market-lab-typed-intent-routing-v1-verification-2026-06-23.md`

Verified:

- Added `routeWorkspaceToolIntent()` and typed `WorkspaceToolRoute` contract in `workspace-tool-registry.ts`.
- Added same-origin local API: `/api/war-room/tool-router`.
- `Command Room Manager` now has `Route typed intent locally`.
- Browser QA: messy Dolaro/AliExpress/Drive/Sheet/images/freeform prompt routed from `Mission Router` into `Odin's Ravens Nest → Smart Intake V2`.
- Local Smart Intake mission was staged: `smart-intake-mqq4ree2`.
- Agent-control stayed `mode:frozen`, `usageAllowed:false`, `workerSpawnAllowed:false`.
- External browser resources: 0.
- Browser console errors: 0.
- Tests/build passed: registry test 6/6, living-v3 61/61, `pnpm build` client + SSR.

Meaning:

- This turns the manager from a passive recommendation panel into a local station router.
- It does **not** add live marketplace/source reading or uncontrolled agents.
- Future Hermes/worker events should enter through this typed router/event bridge rather than direct UI mutation.

Next phase originally planned:

```text
Typed Hermes Event Bridge V2 / Station Action Router
```

Purpose: route typed Hermes/controlled-worker station events into existing tools while keeping max 3–4 visible operators and all live actions approval-locked.

## Station Action Router V2 — Codex reported implementation 2026-06-23

Status: **Codex reported PASS — pending independent Hermes verification before treating it as a final gate.**

Codex reported:

- `Hermes/controlled-worker typed event` enters a local station-action router.
- UI actions include `focus_station`, `set_tool_surface`, `prefill_tool`, `stage_packet`, `request_approval_local`, `record_receipt`, and `queue_basic_agent_motion`.
- Browser QA: a messy Dolaro/AliExpress/Drive/Sheet/local/freeform prompt routed to `Odin's Ravens Nest → Smart Intake V2`.
- `odin-scout` received `basic_station_walk`; Julius was not used for Etsy station work.
- Console errors/warnings: 0.
- External resource delta: 0.
- Control remained `mode:"frozen"`, `usageAllowed:false`, `workerSpawnAllowed:false`.

Architecture implication:

- This is enough to stop building Etsy-only cables.
- DLV requested a pivot to a universal plug for all rooms.
- Next Codex task is now `Universal Workspace Action Wrapper / Operating Kernel V1`, not another Etsy-only station cable and not animation polish first.

New source of truth:

`docs/status/workspace-universal-action-wrapper-source-of-truth-2026-06-23.md`

Mega prompt:

`docs/prompts/codex-mega-prompt-universal-workspace-action-wrapper-v1-2026-06-23.md`

## Smart Intake Hermes Worker V1 Verification — 2026-06-22 15:00 IDT

Status: **PASS — one real bounded Hermes worker is connected behind Smart Intake V2.**

Evidence file:

`docs/status/etsy-market-lab-smart-intake-hermes-worker-v1-verification-2026-06-22.md`

Verified:

- New controlled agent id: `smart-intake`.
- Uses the existing controlled runner only; no new worker system and no fan-out.
- Execution is one Hermes CLI one-shot, `--max-turns 1`, `toolsets:none`.
- `Run Hermes Worker V1` is disabled until a local Smart Intake mission exists.
- Browser QA passed: mixed local input → `Run Smart Intake V2` → `Run Hermes Worker V1` → readable result panel → `Choose for Odin`.
- Final session/readback: `20260622_150004_4cb4fa`, status `completed_local_only`.
- Pipeline reached `STAGE Selected Product`, `NEXT create_shotlab_handoff_local`, `ORIGIN smart-intake-local`.
- Final control stayed `FROZEN`, `usageAllowed:false`, `workerSpawnAllowed:false`, and all live safety locks false.
- Browser console errors: 0.
- External browser resources during inspected flow: 0.
- Tests/build passed: targeted vitest = 23 files / 112 tests; `pnpm build` passed client + SSR.
- Hermes QA patched a small CSS overlap in the worker result header and rebuilt successfully.

Meaning:

- This is a real controlled Hermes-worker integration into the workbench.
- It is still **not** live Google/Drive/AliExpress/Etsy/ShotLab integration and not an autonomous source reader; the worker reasons over the local/mock mission packet only.

Next phase:

```text
Typed Intent Routing V1
```

Purpose: route one messy DLV task to the right station/tool inside the same frozen/local-only contract.

## Smart Intake V2 Verification — 2026-06-22 14:05 IDT

Status: **PASS — local/mock-executable workbench verified.**

Evidence file:

`docs/status/etsy-market-lab-smart-intake-v2-verification-2026-06-22.md`

Verified:

- Smart Intake V2 exists inside `Odin's Ravens Nest`.
- Mixed input supports AliExpress link, Google Sheet link, Google Drive folder, local image path, and free-form prompt.
- Run output showed `SOURCES 5`, `EVIDENCE 5`, `MATCHES 2`, `DOSSIERS 2`.
- Source states are correctly gated: AliExpress = `BLOCKED LIVE`, Google Sheets/Drive = `AUTH REQUIRED`, local image = `LOCAL REFERENCE ONLY`, prompt = `MOCK READABLE`.
- Station model is correct: `Source Intake`, `Image Match`, `Dossier Builder`, `ShotLab Prep / Approval`.
- `Choose for Odin` and `Prepare ShotLab handoff` worked locally; pipeline reached `STAGE ShotLab`, `NEXT create_seo_packet_local`, `ORIGIN smart-intake-local`.
- Browser console errors: 0.
- External browser resources during inspected flow: 0.
- Tests/build passed: `pnpm vitest run src/lib/war-room/living-v3 src/lib/war-room/body` = 21 files / 103 tests; `pnpm build` passed client + SSR.

Meaning:

- This is a good Codex body/UI/contract pass.
- It is **not yet** a real source-reading agent; it is the right workbench/contract foundation.

Next phase:

```text
Smart Intake Hermes Worker V1
```

Purpose: connect one bounded Hermes worker behind Smart Intake to solve one messy-source task and return typed JSON/dossiers into the workbench, while keeping all live actions locked.

## Sheet Intake Batch 1 QA — 2026-06-22 12:02 IDT

Status: **PASS WITH UX FIX APPLIED**.

Evidence file:

`docs/status/etsy-market-lab-sheet-intake-batch1-qa-2026-06-22.md`

Verified on `/war-room?etsyOps=1&bodyRuntime=1`:

- Codex Batch 1 added the tools-first registry/manager shell plus `Odin → Sheet Intake` parser, artifact writer, API, gallery, dossier preview, and selected-product handoff.
- Hermes QA reproduced the flow with a sample CSV: two products imported, two markdown dossiers created, gallery rendered, `Choose for Odin` created a selected product packet, and the flow advanced to `Selected Product / create_shotlab_handoff_local`.
- Latest verified run: `data/etsy-market-lab/sheet-intake/sheet-intake-mqozhkx5/manifest.json`.
- Tests/build passed: `pnpm vitest run src/lib/war-room/living-v3 src/lib/war-room/body` = 20 files / 99 tests; `pnpm build` passed client + SSR.
- Safety gate stayed local-only: no live Etsy, supplier messages, paid ShotLab, Google writes, browser automation, Kanban dispatch, or uncontrolled workers.

Hermes QA fixes applied after Codex:

- Fixed a real visual clipping bug where the Sheet Intake gallery/dossier existed in DOM but rendered below the viewport inside the Odin drawer.
- Added `public/war-room/placeholder.png` so local sample thumbnails no longer show broken image icons.

Remaining limitation:

- This is usable and safe, but not final “perfect Workspace” polish yet: Sheet Intake still lives inside Odin with nested scroll, XLSX/private Google Sheets are excluded, and the manager is deterministic/local-only.

Recommended next connection point:

```text
Command Manager intents V1
```

Alternative Codex polish lane:

```text
Sheet Intake UX polish V1
```

## Sheet Intake / Product Gallery Target — 2026-06-22 01:47 IDT

DLV's target:

```text
Google Sheet / local CSV-XLSX-TSV-JSON
→ Sheet Intake Agent
→ normalized products + one markdown dossier per product
→ scrollable Product Gallery with images/titles/scores/warnings
→ DLV selects a product
→ Odin / ProductScoutPacket / SelectedProductPacket
→ ShotLab prep agent
→ SEO / Draft preview / Approval
```

Evidence/target file:

`docs/status/etsy-market-lab-sheet-intake-target-2026-06-22.md`

Current capability:

- The downstream Etsy room packet flow exists locally.
- `Scout V2` proves controlled worker → `ProductScoutPacket` → Odin → Approval.
- `etsy-pipeline.ts` has local sheet-row staging concepts, but no real sheet intake connector yet.
- Google Sheets API is currently not authenticated: `NOT_AUTHENTICATED: No token at /Users/mac/.hermes/google_token.json`.

Missing before this target works:

- sheet/local file ingestion route;
- product normalization/dedupe/scoring;
- markdown dossier writer;
- scrollable gallery UI;
- selected-product handoff into Odin;
- QA auditor / room-manager layer;
- ShotLab handoff agent gate.

Recommended first phase:

```text
Sheet Intake V1 — local file only
```

Rules:

- support CSV/XLSX/TSV/local JSON first;
- do not require Google OAuth in V1;
- do not write back to the sheet;
- do not run live ShotLab/Etsy;
- produce local markdown dossiers + gallery + selected-product packet only.

## Controlled Product Scout Worker V2 — 2026-06-22 01:32 IDT

Status: **PASS — one controlled Scout V2 worker writes ProductScoutPacket candidates into Odin.**

Evidence file:

`docs/status/etsy-market-lab-controlled-scout-v2-2026-06-22.md`

Verified:

- Added one `Scout V2` controlled worker profile and one `Run Scout V2` control in Odin.
- Scout V2 returns through the same controlled runner, with no marketplace/live/admin side effects.
- Output is reduced via `apply_product_scout_worker_packet_local` into `EtsyRoomState` and shown in Odin before ShotLab/SEO.
- Browser run id: `scout-ui-mqo9l3li`.
- Odin packet id: `etsy-scout-gold-initial-necklace-gifts-scout-ui-mqo9l3li-mqo9lnjd`.
- Odin showed 4 candidates and explicit missing proof fields.
- Full flow passed after Scout V2: Scout → Odin → Selected Product → ShotLab → SEO → Draft → Approval.
- Final browser stage: `approval_waiting`.
- Final control state stayed `FROZEN / usageAllowed:false / workerSpawnAllowed:false`.
- Console errors: none.
- Tests/build passed after fixing the JSON extractor regression.

Important limitation:

- The verified child Scout run reported that web/search tools were unavailable. This phase proves controlled worker → packet → Odin → local approval flow, not real URL-backed product research yet.

Next phase:

```text
Scout V3 read-only evidence
```

Rules for V3:

- only the Scout worker gets a read-only research transport/toolset;
- URL/source-backed evidence is required;
- still no Etsy/Ali/Alura account calls, supplier messages, purchases, paid generation, browser automation, Kanban dispatch, or worker fan-out;
- output must still become a typed `ProductScoutPacket` inside Odin;
- final state must still return to `FROZEN`.

## Controlled One-Shot Hermes Worker V1 — 2026-06-21 23:11 IDT

Status: **PASS — one real Hermes child worker connected.**

Evidence file:

`docs/status/etsy-market-lab-controlled-worker-v1-2026-06-21.md`

Verified:

- Added one `Hermes V1` button in the Living V3 HUD.
- Clicking it runs one bounded Hermes child worker through `src/lib/war-room/body/controlled-athena-runner.ts`.
- Runner uses `execFile` without a shell, timeout clamp, `--ignore-rules`, `--max-turns 1`, `-t none`, JSON-only prompt, and `--source war-room-controlled-hermes`.
- Static scan confirms no `child_process`/`execFile`/`spawn` in `src/routes/api/war-room/**` or `src/screens/war-room/living-v3/**`; the only new process site is the controlled runner.
- Real browser run id: `hermes-ui-mqo80h97`.
- Browser HUD showed `BODY / FROZEN / H1✓` after the run.
- Events showed Hermes moved to `etsy-market-lab / etsy-ravens-nest`, spoke a local-only result, requested local approval, and froze again.
- Final control state stayed `FROZEN / usageAllowed:false / workerSpawnAllowed:false`.
- Console errors: none.
- External browser resources: `externalCount=0`.
- Full local Etsy packet flow still passed through same-origin browser API: Scout → Odin → Selected Product → ShotLab → SEO → Draft → Approval.
- Tests/build passed after the change.

Usage note:

- Actual numeric model cost is recorded if the Hermes CLI prints a cost/usage line.
- The verified browser run did not expose a numeric cost line, so the event/UI now states that explicitly and records the hard budget: `one Hermes CLI model call, max-turns=1`.

## Next phase after Controlled Worker V1

Only after this worker V1 gate:

```text
Controlled Product Scout Worker V2
```

Rules for that next phase:

- one worker only
- one task only
- bounded timeout and JSON output
- explicit usage/cost readback, or explicit `cost not reported` readback
- optional read-only web/product research only if DLV approves that exact capability
- output becomes a `ProductScoutPacket` with candidates/evidence/missing fields
- results appear inside Odin/Scout workbench before ShotLab/SEO
- no live marketplace actions
- return to `FROZEN`

## Verification Gate — 2026-06-21 22:47 IDT

Status: **PASS — Controlled Etsy Room Ready**

Evidence file:

`docs/status/etsy-market-lab-verification-gate-2026-06-21.md`

Verified:

- Required Etsy Market Lab files exist.
- Static scan found no real `spawn`, `exec`, `execFile`, or `node:child_process` execution in the targeted Etsy runtime path.
- Unsafe-string matches were local-only names/locked-action labels, not live connectors.
- Same-origin fetches only for Oracle/etsy-evidence adapters.
- `pnpm vitest run src/lib/war-room/body`: 10 files / 40 tests passed.
- `pnpm vitest run src/lib/war-room/living-v3`: 8 files / 45 tests passed.
- `pnpm build`: client + SSR passed.
- Browser QA route loaded and stayed `BODY / FROZEN`.
- Oracle Scout → Odin → Selected Product → ShotLab → SEO → Draft → Approval worked locally.
- Upload Draft / Publish buttons remained disabled.
- Browser console had no JS errors.
- Browser performance resource check found `externalCount: 0`.

Minor non-blocker:

- Mercury bottom lock row is visually crowded/overlapping near the approval strip after scrolling. Safety is fine; UI polish should fix spacing.

Noted non-blocker:

- Direct unauthenticated `curl` probes to some War Room API paths returned HTTP 500 rather than clean 401/405/404, while same-origin UI flow worked.

## Verification gate checklist

- [ ] Static search for unsafe `spawn`, `child_process`, live connectors, `kanban dispatch` on the new Etsy path.
- [ ] `pnpm vitest run src/lib/war-room/body`
- [ ] `pnpm vitest run src/lib/war-room/living-v3`
- [ ] `pnpm build`
- [ ] Browser route: `http://127.0.0.1:3000/war-room?etsyOps=1&bodyRuntime=1`
- [ ] Starts `FROZEN`.
- [ ] `Run Oracle Scout` works.
- [ ] Oracle packet reaches Odin.
- [ ] Selected Product packet is created.
- [ ] ShotLab handoff packet is created locally.
- [ ] SEO packet is created locally.
- [ ] Draft payload preview appears.
- [ ] DLV approval packet appears.
- [ ] Upload/Publish buttons remain disabled.
- [ ] Final control state is `FROZEN / usageAllowed:false / workerSpawnAllowed:false`.
- [ ] No console errors.
- [ ] No failed requests.
- [ ] No external requests.
