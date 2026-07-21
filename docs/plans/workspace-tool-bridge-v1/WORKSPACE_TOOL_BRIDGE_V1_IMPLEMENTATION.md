# Workspace Tool Bridge V1 — Implementation Plan

> **For Hermes:** Use `subagent-driven-development` only after DLV approves an execution batch. Keep every batch small, checkpointed, and verified in browser.

Updated: 2026-07-04 20:40:44 IDT +0300

## Goal

Turn the Workspace/War Room from a good beta into the main operating surface for the same work DLV currently asks for in Discord: product search, Etsy draft prep, SEO, supplier proof, ShotLab handoff, CAD/modeling/printing, database/Obsidian lookup, Google Sheets, browser research, and Workspace development tasks.

The bridge must work only when DLV asks or clicks. No silent live automation, no external writes, no DB writes, no marketplace actions, no printer commands, and no paid/media generation may run without an explicit approval/readback path.

## Current verified state

### Atlantis fix completed in this batch

- Fixed the marked Atlantis `Stores` selected-detail area so it is a readable compact card instead of a thin clipped scroll/debug strip.
- Proof paths are collapsed behind a compact summary button.
- Raw/debug labels are removed from the primary Atlantis screen.
- Global alert stack is hidden only while Atlantis primary workspace is open.

Fresh verification from this batch:

```text
pnpm vitest run src/screens/war-room/living-v3/AtlantisVaultSurface.test.tsx src/server/atlantis-vault-data.test.ts src/lib/war-room/living-v3/living-v3-contract.test.ts src/screens/war-room/living-v3/LivingWarRoomV3.goblin-shell.test.tsx src/screens/war-room/living-v3/LivingWarRoomV3.etsy-primary-workspace-all-stations.test.tsx src/screens/war-room/living-v3/EtsyProductPrepWorkbench.test.tsx src/routes/api/war-room/-station-action-router.test.ts
=> 7 files passed, 31 tests passed

pnpm typecheck
=> passed

pnpm build
=> passed

Browser DOM QA / Atlantis
=> ok=true; selected store detail 887x115; proofOpen=false; debug=false; raw artifact kind=false; mock/fake/dummy=false; alertStackVisible=false; tiny clipped scrollers=[]
```

### Existing code foundation to reuse

Do not replace these with a new parallel system. Productize and connect them:

```text
src/lib/war-room/living-v3/workspace-tool-registry.ts
src/lib/war-room/living-v3/workspace-station-action-router.ts
src/routes/api/war-room/tool-router.ts
src/routes/api/war-room/station-action-router.ts
src/routes/api/war-room/intents.ts
src/routes/api/war-room/capabilities.ts
src/screens/war-room/living-v3/WorkspaceCoreOpsPanel.tsx
src/screens/war-room/living-v3/EtsyProductPrepWorkbench.tsx
src/screens/war-room/living-v3/GoblinAnalyticsShell.tsx
src/screens/war-room/living-v3/AtlantisVaultSurface.tsx
src/screens/war-room/living-v3/LivingWarRoomV3.tsx
src/lib/workspace-kernel/*
```

Current persistence truth:

```text
Council: local JSON, not cloud DB
Workspace Kernel: local state/events files, not cloud DB writes
Etsy room: local JSON staging, not cloud DB writes
Atlantis: read-only status surface over real local/bridge/runtime sources
Supabase: foundation/migrations exist, but runtime writes are not enabled for these screens yet
```

## Non-goals / hard stops

- Do not add mock/static product data.
- Do not call a local file store “DB connected”.
- Do not run Etsy publishing, supplier messaging, Google Sheets patching, ShotLab generation, Discord sends, printer commands, DB writes, or paid actions without explicit approval.
- Do not create new worker APIs or background automation without DLV approval.
- Do not hide proof entirely; keep proof/readback available behind drawers.
- Do not turn the UI into a debug console; primary view must show cards, actions, status, and decisions.
- Do not reset/delete unrelated dirty repo work.

## Product architecture

### 1. Workspace Action Registry

Create a single typed registry for actions the Workspace can expose. It should sit above the existing `workspace-tool-registry` and station router, not replace them.

Likely files:

```text
src/lib/workspace-actions/action-contracts.ts
src/lib/workspace-actions/action-registry.ts
src/lib/workspace-actions/action-registry.test.ts
```

Each action definition must include:

```ts
type WorkspaceActionDefinition = {
  id: string
  label: string
  primaryCtaLabel: string
  roomId: LivingV3RoomId
  stationId?: LivingV3StationId
  toolSurfaceId?: string
  ownerAgentId: LivingV3AgentId
  agentMotion: {
    homeRoomId: LivingV3RoomId
    targetRoomId: LivingV3RoomId
    targetStationId?: LivingV3StationId
    targetToolLabel: string
    motionSignal: 'standby' | 'walk-to-room' | 'work-at-tool' | 'blocked-at-gate' | 'return-with-readback'
  }
  skillOrPipeline: string
  inputSchema: 'text' | 'url' | 'file' | 'packet' | 'approval' | 'mixed'
  outputArtifact: string
  executor: 'local-read' | 'browser-readonly' | 'server-adapter' | 'controlled-worker' | 'external-write-locked'
  approvalPolicy: 'none-readonly' | 'preview-required' | 'dlv-approval-required' | 'admin-only'
  sideEffects: Array<'none' | 'db-write' | 'google-write' | 'etsy-write' | 'discord-send' | 'printer-command' | 'paid-media'>
  proofRequired: boolean
  rollbackNotes: string
}
```

Acceptance:

- Every visible button/action is backed by a registry entry.
- Every registry entry declares whether it can mutate external systems.
- Primary UI shows a human label, not internal action ids.
- Every action declares the responsible agent and the exact room/station/tool target used for visual ownership.

### 1b. Agent-to-room/tool ownership layer

DLV requirement: each agent must visibly go to the room and tool it is using. This is not decorative animation; it is a second trust/readback layer that shows what is happening in the Workspace.

Rules:

1. Every `ActionRun` has one `ownerAgentId` and one `targetRoomId`.
2. If the action is station-specific, it also has `targetStationId` and `targetToolLabel`.
3. The visible agent movement/state is derived from the `ActionRun` status, never from a fake idle loop.
4. The UI shows a compact ownership chip near the station CTA: `Agent → Tool → Status`.
5. When an action is blocked by approval/missing connector, the agent stands at the correct gate/tool and shows the blocked reason.
6. When readback completes, the agent marks the tool as done with proof available.
7. No visible swarm clutter: only the relevant owner/active helper agents should be emphasized.

Required UI readback per active station:

```text
Owner: Loki / Poseidon / Terra / Hermes / etc.
Working at: room + station + tool
Status: preparing / needs approval / running / completed / blocked
Proof: collapsed drawer
```

QA requirement:

- Triggering a station action must update `data-action-owner-agent`, `data-action-target-room`, `data-action-target-station`, and `data-action-motion-signal` markers.
- Browser QA must confirm the correct agent/tool pairing for at least Atlantis, Etsy, and Terra before a batch is called complete.

### 2. Action Run Store

Every click/request becomes an `ActionRun` with status and proof.

Likely files:

```text
src/lib/workspace-actions/action-run-store.ts
src/lib/workspace-actions/action-run-store.test.ts
src/routes/api/workspace/actions.ts
```

Statuses:

```text
prepared -> needs_approval -> running -> completed
prepared -> blocked
running -> failed
needs_approval -> rejected
```

Data stored per run:

```text
run id
user request
action id
source room/station
input packet
approval state
result artifact ids
readback summary
proof paths/URLs
created/updated timestamps
side-effect declaration
```

Initial storage should remain local until Supabase runtime is explicitly approved. Atlantis must label it as local.

### 3. Server-side Action API

Create one safe server route for UI actions:

```text
POST /api/workspace/actions/prepare
POST /api/workspace/actions/approve
POST /api/workspace/actions/run
GET  /api/workspace/actions/:runId
GET  /api/workspace/actions/recent
```

Rules:

- `prepare` can be read-only and can create a preview packet.
- `run` refuses side effects unless approval exists.
- All adapters run server-side only.
- Secrets never reach the client.
- Every response returns `ok`, `readback`, `status`, `proof`, and `nextUiStep`.

### 4. Adapter layer

One adapter interface, many connectors:

```text
src/server/workspace-actions/adapters/browser-readonly.ts
src/server/workspace-actions/adapters/obsidian.ts
src/server/workspace-actions/adapters/google-workspace.ts
src/server/workspace-actions/adapters/etsy-readonly.ts
src/server/workspace-actions/adapters/shotlab.ts
src/server/workspace-actions/adapters/cad.ts
src/server/workspace-actions/adapters/printer.ts
src/server/workspace-actions/adapters/database.ts
src/server/workspace-actions/adapters/discord.ts
```

Adapter contract:

```ts
type WorkspaceActionAdapter = {
  prepare(input): Promise<ActionPreview>
  run(input, approval): Promise<ActionResult>
  sideEffects: Array<string>
  proofMode: 'required' | 'optional'
}
```

### 5. Room UI pattern

Every station gets the same practical layout:

```text
Top: What is this station doing now?
Left/main: work artifact/cards/gallery/table/model/preview
Right: action dock with primary next action
Bottom/collapsed: proof/readback/details
```

Primary view must not show raw kernel ids, packet ids, JSON, stack traces, or long debug paragraphs.

### 5b. Universal station CTA standard

DLV requirement: every tool and station must use the same action-button structure and the same screen position. Terra, Atlantis, Etsy, and future rooms must not invent separate button wording/placement patterns.

Standard structure:

```text
Top-right of station header OR right-side action dock, same visual location per primary surface.

[Primary CTA]
  label: one short verb phrase, e.g. Search products / Refresh data / Prepare slice plan
  sublabel: one short status/reason line, e.g. Read-only / Needs approval / Source missing
  owner chip: Agent → Tool
  status chip: Ready / Needs proof / Locked / Running / Done

[Secondary action row]
  max 2 secondary actions
  no repeated disabled buttons

[Proof drawer]
  collapsed by default
```

DOM contract for QA:

```text
data-workspace-station-cta="v1"
data-primary-action-id="..."
data-primary-action-owner="..."
data-primary-action-status="ready|locked|needs-approval|running|done|blocked"
data-primary-action-position="standard-header-right|standard-dock-right"
data-proof-collapsed="true"
```

Hard rule:

- No station-specific CTA wording like “dummy”, “debug”, “raw”, “mock”, or unexplained technical labels.
- If an action cannot run, show one standard locked CTA with a reason; do not scatter multiple disabled buttons in different positions.
- Every batch must add/maintain a QA scan that fails when Atlantis/Etsy/Terra use incompatible CTA structure.

## Discord parity matrix

| Discord ask today | Workspace target | First UI action | Connector policy | Proof/readback |
|---|---|---|---|---|
| “חפש מוצר” | Etsy Market Lab / Product Inbox | Search products | Browser/read-only + local evidence first | Candidate cards + source links + missing proof badges |
| “תכין דראפט” | Etsy Draft Approval | Build draft preview | Local preview first; Etsy write locked | Title/tags/attrs/alt/video checklist + approval packet |
| “SEO/Alura tags” | SEO & Metrics | Build SEO packet | Local SEO DB/read-only Alura/browser first | Vol/Comp/Score table + tag proof |
| “תבדוק ספק” | Source Leads / Source Truth | Verify supplier match | Browser/read-only first; Google/Sheets writes locked | Supplier lead card + image/spec/price proof |
| “ShotLab” | ShotLab Prep | Create media handoff | Local handoff first; generation locked | ShotLab packet + source image truth |
| “תכניס לשיטס” | Google Workspace action | Prepare Sheet patch | Preview required; write approval required | A1 range diff + append/patch summary |
| “תמדל/תכין להדפסה” | Terra Forge | Build CAD/slice plan | Local files/read-only first; printer commands locked | Model asset, QA screenshot, slicer plan |
| “תדפיס” | Terra Printer Control | Prepare print command | Always DLV approval required | Printer status + exact command preview |
| “חפש באינטרנט” | Command / station action | Read-only browser job | Read-only, no submits unless approved | Links, snippets, screenshot/proof |
| “תפתח/תשפר workspace” | Olympus Command | Route to dev action | Local repo tools only; no destructive edits | Plan, diff, tests, browser QA |
| “מה יש בזיכרון/DB” | Atlantis Vault | Query source index | Read-only | Source cards + freshness + proof drawer |
| “שלח/פרסם בדיסקורד/אטסי” | Approval Inbox | Prepare send/publish | Locked until explicit approval | Exact outgoing content preview |

## Execution phases

### Phase 0 — Lock in Atlantis + audit baseline

Status: done for Atlantis; keep this as regression gate.

Tasks:

1. Keep `AtlantisVaultSurface.test.tsx` asserting no raw/debug labels.
2. Keep DOM QA script pattern for selected store detail.
3. Add future regression test if the `Stores` panel grows more rows.
4. Record current whole-room audit findings: 24 stations scanned; no tiny clipped scrollers found; global notification noise still needs product cleanup outside Atlantis.

Gates:

```text
pnpm vitest run src/screens/war-room/living-v3/AtlantisVaultSurface.test.tsx src/server/atlantis-vault-data.test.ts
pnpm typecheck
pnpm build
Browser DOM QA on Atlantis Source Index
```

### Phase 1 — Action Registry and Action Run Store

Objective: make every Workspace click/request a typed, trackable action.

Tasks:

1. Create `src/lib/workspace-actions/action-contracts.ts`.
2. Create `src/lib/workspace-actions/action-registry.ts` with initial actions for Etsy, Terra, Atlantis, Command, Google, Obsidian, browser search.
3. Add tests that every action has `approvalPolicy`, `sideEffects`, `proofRequired`, room/station target, and human label.
4. Add tests that every action has `ownerAgentId`, `primaryCtaLabel`, `agentMotion`, and exact room/station/tool ownership metadata.
5. Create local `ActionRun` store with append/read/update.
6. Add tests for status transitions and rejected/blocked actions.
7. Add Atlantis readback for action-run counts, still labeled local.

Acceptance:

- No UI action button is unregistered.
- No side-effect action can be `approvalPolicy: none-readonly`.
- No action can exist without a visible owner agent and target tool/station.

### Phase 2 — Safe Action API

Objective: one server API path for actions instead of scattered UI-only button logic.

Tasks:

1. Create `POST /api/workspace/actions/prepare`.
2. Create `POST /api/workspace/actions/approve`.
3. Create `POST /api/workspace/actions/run`.
4. Create `GET /api/workspace/actions/recent`.
5. Return standardized `ok/status/readback/proof/nextUiStep`.
6. Add auth checks and no-store headers.
7. Add a negative test: printer/Etsy/Google write action refuses to run without approval.
8. Add a positive test: read-only Atlantis/Obsidian/browser prepare succeeds without external write.

Acceptance:

- API can prepare read-only actions.
- API blocks side effects without approval.
- API never returns secrets.

### Phase 3 — Universal Action Dock UI

Objective: every station has practical actions without becoming a debug drawer.

Tasks:

1. Create `WorkspaceActionDock.tsx` and CSS.
2. Add `ActionRunCard.tsx` for status/proof/readback.
3. Add `StationCtaStandard` / shared CTA structure so every station uses the same button shape, sublabel, owner chip, status chip, and Proof drawer position.
4. Add collapsed `Proof` drawer component shared by Atlantis/Etsy/Terra/Goblin.
5. Mount action dock in primary workspaces first: Atlantis, Etsy, Terra, Command.
6. Hide global notification noise when a primary workbench is open; surface only station-relevant next actions.
7. Add DOM markers for QA: `data-workspace-station-cta`, `data-primary-action-id`, `data-primary-action-owner`, `data-primary-action-status`, `data-primary-action-position`, `data-proof-collapsed`.
8. Wire action run ownership markers to agent movement/readback: `data-action-owner-agent`, `data-action-target-room`, `data-action-target-station`, `data-action-motion-signal`.

Acceptance:

- User sees one primary next action per station.
- Proof/debug is available but not visually dominant.
- No raw JSON/packet ids in primary UI.
- Atlantis, Etsy, and Terra expose the same CTA DOM contract and same placement class.
- Owner agent/tool/status is visible in the CTA area and matches the station being used.

### Phase 4 — Read-only external connectors

Objective: connect “research” actions safely before any write actions.

Read-only adapters:

```text
browser internet search / page read
Obsidian search/read
local files/assets read
Google Sheets read/range preview
Etsy/Alura/browser evidence read
CAD asset list/read
printer status read
DB read/status only
```

Tasks:

1. Implement each adapter as `prepare` first.
2. Store proof links/paths/screenshots in the action run.
3. Show source freshness and missing proof in the room.
4. Add timeouts and blocked states.
5. Add browser QA for at least one success and one blocked/missing-source state per connector.

Acceptance:

- DLV can click “search/read/check” in Workspace and see real readback.
- Nothing writes externally in this phase.

### Phase 5 — Etsy Product Prep end-to-end

Objective: make Product Search -> Source Proof -> ShotLab -> SEO -> Draft Approval usable from Workspace.

Tasks:

1. Product Inbox: action dock starts read-only product search.
2. Candidate board: shortlist/reject/select with visible proof badges.
3. Source Leads: supplier match cards and missing-proof checklist.
4. Source Truth: source image/spec/price proof packet.
5. ShotLab Prep: local handoff packet, image truth, generation locked until approval.
6. SEO & Metrics: title/tags table with Vol/Comp/Score; no fake tags.
7. Draft Approval: complete local draft preview; Etsy publish locked.
8. Approval Inbox: approve/reject local packets; live Etsy write stays locked until explicit publish action is built and approved.

Acceptance:

- DLV can run a full draft-prep flow from Workspace without returning to Discord for the main steps.
- Every missing proof is visible as a badge/checklist, not hidden in logs.

### Phase 6 — Terra / CAD / printing flow

Objective: model/search/slice/QA/print-prep in Workspace with strict safety.

Tasks:

1. Modeling Studio: create CAD/design plan action from prompt.
2. Model Hunt: read-only model search and candidate staging.
3. Forge Workbench: local model asset list and QA state.
4. Printer Control: status/camera readback where available.
5. Slice Plan: local prep packet, no printer command.
6. Print Approval: exact command preview; printer command locked until DLV approval.

Acceptance:

- No dummy/inactive machine command buttons.
- Printer actions are previews until sender + approval + readback exist.
- CAD/model claims include proof or are labeled as pending QA.

### Phase 7 — DB runtime bridge

Objective: move from local stores to real DB carefully and visibly.

Tasks:

1. Server-only DB adapter with readback endpoint.
2. Migrate/seed tiny verified records only after DLV approval.
3. Implement read-only DB status in Atlantis.
4. Add write path behind approval and transaction receipt.
5. Update UI labels from “Local on this Mac” to DB only after a real read/write proof.

Acceptance:

- `DB connected` is shown only after live runtime readback proves it.
- First write test is explicit, tiny, reversible, and approved.

### Phase 8 — Write-capable connectors with approval

Only after read-only phase is proven.

Write adapters:

```text
Google Sheets append/patch
Obsidian note write
Discord send/reply
Etsy draft create/update
ShotLab generation/run
printer command
DB write
```

Rules:

1. Every write action has a preview.
2. Every write action has DLV approval.
3. Every write action has readback after execution.
4. Every write action logs proof without exposing secrets.
5. Every write action has a failure/rollback note.

### Phase 9 — Whole Workspace UI audit pass

Objective: stop every room from feeling like debug/static beta.

Audit checks per station:

```text
Does the first screen show the work artifact?
Is there one obvious next action?
Are unavailable actions aggregated instead of repeated?
Are proof/debug/raw details collapsed?
Are labels human, not internal ids?
Is scroll usable and text readable?
Does switching rooms preserve state?
Are source labels truthful: local vs DB vs live?
Does the primary CTA use the shared structure and same location?
Does the station show the correct owner agent → tool → status readback?
```

Known findings from 2026-07-04 audit:

- Atlantis marked area fixed.
- Atlantis still has long source/proof sections below fold; acceptable as data room, but keep proof collapsed.
- Global notification stack can spam other rooms; should become a focused inbox/triage surface.
- Some historical notification/readback text can include older debug phrasing; clear/normalize the notification source instead of hiding evidence globally.
- Etsy stations share structural primary workspaces but still need stronger artifact-first hierarchy for the full flow.
- Terra printer control correctly locks machine actions, but wording should stay product-like and not mention dummy/debug concepts.

## Verification gate for every phase

For code changes:

```text
pnpm vitest run <focused tests>
pnpm typecheck
pnpm build
Browser DOM QA for the exact station/action path
Visual QA if layout changed
Search changed UI files for: mock, fake, dummy, debug, raw JSON, placeholder
CTA contract scan: Atlantis/Etsy/Terra must expose `data-workspace-station-cta="v1"` in the same standard placement and no incompatible primary-action button cluster.
Agent ownership scan: active action/station must expose owner agent, target room/station/tool, and motion signal markers that match the chosen station.
Adversarial QA note: record at least one thing that still looks inconsistent/unfinished, even when tests pass; passing tests cannot be the only acceptance proof.
```

For connector changes:

```text
Positive readback test
Negative blocked/approval-required test
Proof drawer test
Secret scan / no client-side secret exposure
No side effect unless explicitly approved
```

For DB changes:

```text
Read-only proof first
One tiny approved write only after DLV approval
Read-after-write proof
Rollback/delete proof if testing row must be removed
Atlantis label update only after proof
```

## Definition of done for V1

Workspace Tool Bridge V1 is done when DLV can:

1. Open Workspace.
2. Choose a room/station.
3. Click or type a request.
4. See the routed action, assigned tool/agent, approval status, and next step.
5. Receive real readback/proof.
6. Approve or reject side effects before anything external happens.
7. Complete at least one full product draft-prep flow and one CAD/print-prep flow from the Workspace UI.
8. Trust Atlantis to say what is local, what is DB, what is read-only, and what is missing.

## Suggested immediate next batch

Do not jump straight to all connectors. Start with the smallest high-value vertical slice:

```text
Batch 1: Action Registry + Action Run Store + Action Dock in Atlantis and Olympus Command
Batch 2: Read-only browser/Obsidian/DB status adapters
Batch 3: Etsy Product Search -> Candidate -> Draft Preview vertical slice
Batch 4: Terra Model Hunt -> Slice Plan -> Print Approval preview vertical slice
Batch 5: Approval Inbox + Google Sheets preview/write approval path
```

Each batch must end with a checkpoint under:

```text
docs/plans/workspace-tool-bridge-v1/checkpoints/
```
