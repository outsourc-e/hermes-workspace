# Workspace Universal Action Wrapper / Operating Kernel — Source of Truth

Updated: 2026-06-23 08:01:10 IDT +0300

## Decision

DLV decided to stop scaling the War Room by connecting every room/station/action as a bespoke one-off cable.

New direction:

```text
One universal action wrapper / operating kernel first.
Rooms are views over the kernel.
Stations are adapters over blueprints/tools.
Agents/models are workers that speak the same event/packet/run language.
```

This replaces the previous implicit pattern of building Etsy station-by-station and then repeating the same work for every future room.

## Why this matters

DLV wants roughly 10 rooms with many stations, and wants to operate recurring workflows from Workspace:

- Etsy/Dolaro product discovery and draft preparation
- ShotLab/media preparation
- SEO/Alura keyword/tag work
- supplier/AliExpress/Alibaba verification
- Google Docs/Sheets/Drive/local file/image intake
- 3D print/CAD/product design
- daily business newspaper/content workflows
- Discord/remote control/readback
- project status and approvals
- multi-model workers such as ChatGPT 5.5, ChatGPT 5.3, Claude, Kimi, etc.

The only scalable way is a shared kernel:

```text
Intent → Blueprint → Run → Event → Packet/Artifact → Station UI → Approval → Result/Readback
```

## Current baseline from Codex Batch 3

Codex reported Batch 3 implemented:

- `workspace-station-action-router.ts`
- `workspace-station-action-router.test.ts`
- `station-action-router.ts`
- `-station-action-router.test.ts`
- `LivingWarRoomV3.tsx`
- `living-war-room-v3.css`

Reported result:

```text
Hermes/worker typed event
→ station-action-router
→ existing station/tool
→ prefill/stage local packet
→ receipt/readback
→ basic operator motion signal
```

Reported verification:

- living-v3 tests: 66
- body tests: 50
- station action router API tests: 5
- build passed
- browser QA on `/war-room?etsyOps=1&bodyRuntime=1`
- messy prompt routed to `Odin's Ravens Nest → Smart Intake V2`
- `odin-scout · basic_station_walk`
- console errors/warnings: 0
- external resource delta: 0
- final control: `mode:"frozen"`, `usageAllowed:false`, `workerSpawnAllowed:false`

Hermes should still independently verify before marking this as Hermes PASS, but architecture direction can use it as the immediate local baseline.

## What changes now

The next Codex task should **not** be another Etsy-only cable or just `Event-driven Natural Agent Motion V1`.

The next task should be:

```text
Universal Workspace Action Wrapper / Operating Kernel V1
```

Goal: extract the common action/run/event/packet/approval model from Etsy and Station Action Router so all future rooms can plug into the same system.

## Core kernel primitives

### 1. Blueprint

A reusable workflow template.

Fields should include:

- `blueprintId`
- `version`
- `domain`
- `roomId`
- `stationId`
- `acceptedIntents`
- `inputSchema`
- `outputSchema`
- `allowedTools`
- `allowedWorkerProfiles`
- `riskClass`
- `approvalPolicy`
- `states`
- `defaultNextSteps`

### 2. Workspace Action

A normalized request from DLV, Hermes, Codex, worker, browser, cron, UI, Discord, or a file.

Fields should include:

- `actionId`
- `source`
- `intent`
- `domain`
- `summary`
- `input`
- `targetRoomId`
- `targetStationId`
- `riskClass`
- `requiresApproval`

### 3. Durable Run

A stateful instance of a blueprint/action.

Fields should include:

- `runId`
- `blueprintId`
- `status`
- `stage`
- `ownerRoomId`
- `ownerStationId`
- `assignedWorkerProfileId`
- `createdAtMs`
- `updatedAtMs`
- `events`
- `artifacts`
- `approvals`
- `nextAction`
- `lockedActions`
- `readback`

### 4. Event

Every meaningful change in the Workspace.

Examples:

- `run.created`
- `station.focused`
- `tool.started`
- `artifact.created`
- `packet.routed`
- `approval.requested`
- `approval.approved`
- `approval.rejected`
- `run.blocked`
- `run.completed`

### 5. Packet / Artifact

The visible thing that moves through rooms.

Examples:

- `ProductCandidatePacket`
- `SelectedProductPacket`
- `ShotLabHandoffPacket`
- `SeoPacket`
- `EtsyDraftPreviewPacket`
- `SupplierProofPacket`
- `CadDesignPacket`
- `PrintPrepPacket`
- `NewsBriefPacket`
- `DiscordReplyPacket`

### 6. Approval

Any action with risk, cost, external write, private account read/write, or live publication pauses here.

Must include:

- exact action preview
- target system
- risk class
- what is allowed now
- what remains locked
- evidence
- approve/reject/edit decision
- no live side effect until explicit approval

### 7. Worker Profile

A visible/hidden worker capability, not a hardcoded agent.

Examples:

- `chatgpt-5.5-manager`
- `chatgpt-5.3-fast-worker`
- `claude-reviewer` — only when/if enabled by DLV approval
- `kimi-code-worker`
- `hermes-controlled-worker`
- `codex-ui-builder`

Every worker must speak the same run/event/artifact contract.

## Canonical 10-room operating map

This is the proposed 10-room system target. Names can be refined later, but kernel IDs should be stable.

1. `olympus-command` — manager/router, global run board, task intake, model routing.
2. `atlantis-vault` — database, evidence, source files, artifacts, memory/readback.
3. `etsy-market-lab` — Dolaro/Etsy product discovery → draft approval.
4. `shotlab-forge` / `forge-hephaestus` — media prep, image/video prompt staging, QA, asset handoff.
5. `oracle-seo-signals` — Alura/SEO keywords/tags/market signals, score evidence.
6. `merchant-harbor` — supplier verification, AliExpress/Alibaba links, risk proof, messaging approval.
7. `daedalus-workshop` — CAD, 3D print, slicer/STEP/STL/G-code prep, print QA.
8. `gateway-cockpit` — Discord/remote control, daily newspaper/content delivery, scheduled workflows.
9. `treasury-approval` — approval queue, money/risk/account/live-action gates.
10. `agent-camp` / `council-strategists` — worker profiles, assignments, model budgets, reviews.

## Safety law

Default for every kernel run:

```text
localOnly:true
usageAllowed:false
workerSpawnAllowed:false
externalRequestsAllowed:false unless blueprint explicitly allows read-only external access
liveActionsAllowed:false
requiresApproval:true for any external write/cost/account action
```

Always locked without explicit DLV approval:

- Etsy publish/upload/edit/renew/customer actions
- supplier messages or purchases
- paid generation
- Google private reads/writes unless authenticated and approved
- browser automation that clicks/acts on logged-in sites
- Discord sends outside approved delivery paths
- account/admin DB writes
- print/printer control
- worker fan-out beyond approved profiles

## Codex/Hermes split

Codex owns:

- TypeScript contracts
- local reducers/state machines
- local API routes
- UI readback surfaces
- tests/build
- adapting Living V3 to consume kernel state

Hermes owns:

- architecture and source-of-truth
- deciding approval gates
- controlled worker connection
- safety verification
- browser QA
- Obsidian updates
- final PASS/FAIL

## Immediate next implementation

Codex should implement **Kernel V1 foundation**, not a full multi-room product.

Minimum V1 deliverables:

1. `src/lib/workspace-kernel/` or `src/lib/war-room/kernel/` with typed contracts and pure reducers.
2. Registry of 8–12 blueprints covering DLV's recurring workflows.
3. Local run/event/artifact/approval state machine with no side effects.
4. Adapter that converts existing Station Action Router/Etsy flow into kernel actions/runs.
5. Command Room `Kernel Console` view showing runs by room, status, approval, worker, artifact, next step.
6. One Etsy run still works through the new kernel path.
7. A stub/demo run for 3D print and newspaper/content shows the wrapper is universal, but no live actions.
8. Tests/build/browser QA.

## Definition of done for Kernel V1

Kernel V1 is done when:

- a single action contract can represent Etsy, 3D print, newspaper, supplier, SEO, and ShotLab tasks;
- Command Room can start/stage a local run from free text;
- runs appear grouped by room/station;
- clicking a run focuses the right existing room/station;
- approvals are explicit and locked;
- artifacts/packets are visible;
- no live action occurs;
- existing Etsy Batch 3 flow still passes;
- tests/build pass;
- browser QA shows no console errors or external-resource side effects.

## Hermes Verification — 2026-06-23 12:40 IDT

Status: **Functional PASS with one UI telemetry caveat.**

Evidence:

`docs/status/workspace-kernel-v1-hermes-verification-2026-06-23.md`

Hermes verified:

- `src/lib/workspace-kernel/` exists and contains contracts, blueprints, router, reducer, Living V3 adapter, and tests.
- Required blueprints exist: Etsy intake/draft, ShotLab, SEO/Alura, supplier, CAD/3D print, daily news/content, Discord readback, generic status, approval gate.
- Safety defaults remain locked: `localOnly:true`, `usageAllowed:false`, `workerSpawnAllowed:false`, `externalRequestsAllowed:false`, `liveActionsAllowed:false`.
- Static inspection found no new `child_process`, `spawn`, `exec`, network fetch, filesystem write, or live connector call in the kernel/API files.
- Test/build gate passed:
  - `src/lib/workspace-kernel`: 15/15
  - station-action/tool-registry: 11/11
  - workspace-kernel API route: 5/5
  - living-v3: 66/66
  - body: 50/50
  - `pnpm build`: passed with existing Vite warnings.
- Browser smoke on `/war-room?etsyOps=1&bodyRuntime=1`: Kernel Console exists inside `Olympus Command → Mission Router`; Etsy/CAD/news demo cards staged; external resource delta remained 0; Etsy run opened/focused Smart Intake/Odin content.

Caveat:

- Hermes did **not** observe the claimed persistent `data-station-action-agent="odin-scout"` / `data-station-action-motion="basic_station_walk"` marker after opening an Etsy kernel run. The station opened, but station-action telemetry/result markers did not remain visible after focus transitions. Treat this as next-phase telemetry cleanup, not a kernel blocker.

## Hermes Verification — 2026-06-23 19:16 IDT

Status: **Etsy Kernel V1 migration + telemetry PASS.**

Evidence:

`docs/status/etsy-kernel-v1-migration-telemetry-hermes-verification-2026-06-23.md`

Hermes verified after Codex's next batch:

- `src/lib/workspace-kernel/adapters/etsy-market-lab.ts` maps all six local Etsy stages into Kernel V1 artifacts/approval.
- Tests/build passed:
  - `src/lib/workspace-kernel`: 20/20
  - `src/lib/war-room/living-v3`: 66/66
  - `src/lib/war-room/body`: 50/50
  - `pnpm build`: passed with existing Vite warnings.
- Static scan of `src/lib/workspace-kernel` found no new runtime process/network call sites.
- Browser smoke on `/war-room?etsyOps=1&bodyRuntime=1` verified persistent telemetry after opening an Etsy kernel run:
  - `odin-scout`
  - `basic_station_walk`
  - `etsy-market-lab`
  - `etsy-ravens-nest`
  - `product-candidate-packet`
  - `local-only-locked`
  - external request delta `0`.

Remaining limit:

- Kernel state is still UI/session-local; refresh/durable history and typed event ingress from Hermes/controlled workers are the next bottleneck.

## Next after Etsy Kernel V1

The next **large** batch is:

```text
Kernel Control Spine V2 = Durable Kernel Store + Typed Event Ingress + Event-Driven Agent Motion
```

Prompt:

`docs/prompts/codex-next-kernel-control-spine-v2-durable-events-motion-2026-06-23.md`

Roadmap now:

1. Make kernel runs/events/artifacts/approvals durable local Workspace state.
2. Add same-origin local Kernel API V2 for state/event ingress.
3. Let Hermes/controlled workers report typed events into the kernel, not mutate UI directly.
4. Drive visible agent motion/readback from kernel events.
5. Only after that, add approved bounded tool execution through the kernel approval queue.
