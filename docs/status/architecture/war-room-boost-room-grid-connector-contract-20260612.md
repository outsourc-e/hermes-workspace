# War Room BOOST room-grid + connector infrastructure contract

Status: PASS — room-grid-first architecture and disabled connector infrastructure contract is ready for follow-up implementation
Owner lane: claudearchitect
Date: 2026-06-12
Scope: documentation/spec only. This card creates no source/runtime/public asset change, performs no image generation, does not touch credentials, does not call external APIs, does not package a release, and does not mutate business systems.

Source of truth: `docs/status/automation/war-room-boost-room-grid-commerce-infra-20260612.md`.

## Safety statement

Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED. Only local disabled/dry-run/read-only infrastructure is allowed until DLV approval is explicitly granted in a later gate. No shop, supplier, paid, credential, account, publish, order, message, refund, renewal, ad, release, git push, git merge, reset, clean, or destructive DB/admin action is authorized by this document.

## Decision summary

The next War Room step should move away from proof/debug dashboard composition and toward a room-grid-first operating surface.

The main `/war-room` experience should become an equal/symmetric grid of rooms. Every room has comparable visual weight and comparable entry affordance. The grid is the product surface; proof ledgers, debug evidence, lifecycle internals, and long status text become secondary inspector/disclosure content.

Future connector infrastructure may be prepared only as local, disabled, dry-run, approval-gated scaffolding. Connector readiness can be shown in the UI, but the default state must be `NOT CONNECTED`, disabled, and unable to execute live actions without later DLV approval.

## Reviewed source decisions

From `docs/status/automation/war-room-boost-room-grid-commerce-infra-20260612.md`:

- Main screen is an equal/symmetric grid of rooms.
- Each room shows live agent status with minimal text.
- Agents appear as small units/characters moving or working inside rooms.
- Click/enter room opens a full-room view.
- Full-room view exposes chat with the agent, room tools, task context, approvals, and logs.
- Debug/proof/evidence text is hidden behind inspector/disclosure panels, not visible on the main canvas.
- Connector infrastructure may include a registry, capability model, disabled/dry-run modes, action drafts, approval queue objects, and safety-spine checks.
- UI may display connector readiness as `NOT CONNECTED` / `READY FOR APPROVAL` / `APPROVED BUT DISABLED` / `LIVE ENABLED`, but live enablement is not part of this phase.
- Tests must prove default disabled state and no live writes without DLV approval.

## Room-grid UX contract

### Product rule

The War Room main canvas must be room-grid-first.

Required user-facing behavior:

1. The primary visible surface is an equal/symmetric grid of room cells.
2. Every core room is represented by one room cell of comparable footprint.
3. Room cells expose only minimal first-read status:
   - room name;
   - current lead/active agent;
   - concise state such as live, working, needs review, blocked, sleeping, or approval queued;
   - small task/approval/lock counts if needed;
   - connector lock/readiness indicator where relevant.
4. Evidence/debug/proof details are hidden behind a room inspector, `<details>`, disclosure, or opened full-room view.
5. The main grid must not become a proof ledger, command debug table, raw task wall, lifecycle transcript, or API trace board.
6. Click/enter room must open a full-room view for that room.
7. Full-room view must show the room-specific working surface:
   - active agent identity and chat entry point;
   - room tools/actions, still locked where applicable;
   - task context;
   - approval state;
   - recent logs/evidence;
   - connector status if relevant;
   - clear back/return to grid affordance.
8. Full-room view may reveal detailed evidence and logs because the user has intentionally entered the room.
9. The grid must remain safe and read-only for external/business surfaces.

### Equal/symmetric room layout

The first implementation should prefer a stable grid over a decorative map. A reasonable initial target is:

- desktop: 2x4 or 4x2 grid for the eight core rooms;
- tablet: 2-column grid;
- small/mobile: single-column stack with equal cell heights;
- every cell uses the same base component and data contract.

Core room set:

1. Olympus Command
2. Pantheon Quarters
3. Agora of Opportunity
4. Oracle of Signals
5. Forge of Hephaestus
6. Merchant Harbor
7. Atlantis Vault
8. Treasury of Commerce

Do not privilege one room with a large proof/debug panel on the main canvas. If one room needs attention, show it through state badges, not by breaking the room-grid-first symmetry.

### Minimal room-cell data contract

Each room cell should be derived from typed state, not hard-coded visible text. Suggested shape for follow-up implementation:

```ts
type WarRoomGridCell = {
  id: WarRoomId
  label: string
  leadAgentId: string
  leadAgentLabel: string
  liveState: 'live' | 'working' | 'needs-review' | 'blocked' | 'sleeping'
  taskCount: number
  approvalCount: number
  blockerCount: number
  connectorState: ConnectorLockState
  lastActivityLabel: string
  inspectorSummary: string
}
```

The room cell should avoid raw task titles, raw evidence excerpts, full lifecycle trails, and proof paragraphs. Those belong in the inspector/full-room view.

### Full-room open state contract

Click/enter room behavior should be explicit and testable.

Required state:

```ts
type WarRoomOpenState = {
  mode: 'grid' | 'room'
  activeRoomId: WarRoomId | null
  activeStationId?: string | null
  openedFrom: 'room-cell' | 'route' | 'restored-state'
}
```

Required behavior:

- Clicking a room cell sets `mode='room'` and `activeRoomId=<room id>`.
- Back/close returns to `mode='grid'` while preserving the last selected room for focus if practical.
- Room open state must not trigger external actions.
- Room open state must not mutate Kanban, Etsy, shops, suppliers, ShotLab, account systems, or credentials.
- The first full-room view may reuse existing read-only local state, but must display it as room context rather than a raw debug feed.

## Connector / approval-gated infrastructure contract

### Connector scope

Connector infrastructure is allowed only as local architecture and disabled implementation scaffolding. It may prepare a registry and typed capability model for future shops/tools, but it must not connect to live accounts or call live APIs.

Allowed connector concepts:

- connector registry;
- connector capability model;
- connector readiness state;
- dry-run action draft objects;
- approval queue objects;
- safety-spine checks;
- read-only UI showing connector readiness;
- test fixtures proving locked behavior.

Forbidden in this phase:

- real credential loading or credential validation;
- external network calls to Etsy, shops, suppliers, AliExpress, Alibaba, ShotLab, paid generation, payment, account, listing, order, message, refund, renewal, ad, or publishing systems;
- POST/PATCH/DELETE live actions;
- live connector enablement;
- UI controls that claim an external action was executed;
- release packaging or deployment.

### Connector lock states

Use a narrow, explicit state model:

```ts
type ConnectorLockState =
  | 'NOT_CONNECTED'
  | 'READY_FOR_APPROVAL'
  | 'APPROVED_BUT_DISABLED'
  | 'LIVE_ENABLED'
```

For the next implementation cards, only these states are allowed at runtime by default:

- `NOT_CONNECTED`
- `READY_FOR_APPROVAL` for local/dry-run readiness only
- `APPROVED_BUT_DISABLED` only if a fixture/mock explicitly simulates approval while still refusing live execution

`LIVE_ENABLED` must not be reachable in production/runtime code unless a later DLV approval card explicitly authorizes it. Tests should assert that the default connector state is `NOT_CONNECTED` and disabled.

### Connector execution modes

```ts
type ConnectorExecutionMode = 'disabled' | 'dry-run' | 'read-only' | 'live'
```

Default: `disabled`.

Allowed now:

- `disabled`: no external action, no network write, no credential use.
- `dry-run`: local simulation only; produces a draft/evidence object and explicit `dry-run` label.
- `read-only`: only for later separately approved read-only adapters; not approved by this document for new live services.

Forbidden now:

- `live` execution.

Every action executor must fail closed if mode is `disabled` or if DLV approval is missing. Dry-run must return an object that says `dry-run`, `NOT CONNECTED`, and no external action executed.

### Action draft and approval queue contract

A future connector implementation may create local draft objects only:

```ts
type ConnectorActionDraft = {
  id: string
  connectorId: string
  roomId: WarRoomId
  actionKind: string
  mode: 'disabled' | 'dry-run'
  status: 'draft' | 'queued-for-approval' | 'rejected-by-lock'
  externalMutation: false
  requiresDlvApproval: true
  createdFromTaskId?: string
  evidence: string[]
}
```

Drafts must not execute. Approval queue objects are local review artifacts only. They are not DLV approval and must not flip any connector into live mode.

### Safety spine

All connector-capable code must check:

1. connector state is not `NOT_CONNECTED` before any readiness claim;
2. execution mode is not `live` unless a later explicit approval gate exists;
3. `requiresDlvApproval === true` for any external action-capable draft;
4. `externalMutation === false` in the current phase;
5. no credentials are loaded by default;
6. no network write call is reachable by default;
7. UI copy says `NOT CONNECTED`, `disabled`, and/or `dry-run` wherever relevant.

## Required DOM and data hooks

Follow-up UI implementation must add or preserve testable hooks. Exact names may be adjusted only if the implementation card documents the replacement and tests assert them.

### Room grid hooks

Required hooks:

- `data-war-room-v1-room-grid="room-grid-first"` on the main grid container.
- `data-war-room-v1-room-cell="<room-id>"` on each room cell.
- `data-war-room-v1-room-cell-layout="equal/symmetric"` or equivalent grid-level hook proving equal/symmetric intent.
- `data-war-room-v1-room-live-state="<state>"` on each cell.
- `data-war-room-v1-room-active-agent="<agent-id-or-none>"` on each cell.
- `data-war-room-v1-room-task-count="<number>"` on each cell.
- `data-war-room-v1-room-approval-count="<number>"` on each cell.
- `data-war-room-v1-room-connector-lock-state="NOT_CONNECTED|READY_FOR_APPROVAL|APPROVED_BUT_DISABLED|LIVE_ENABLED"` on each cell.
- `data-war-room-v1-room-main-text-policy="minimal"` on the grid or cells.
- `data-war-room-v1-room-inspector-hidden-by-default="true"` on the inspector/disclosure region.

### Open-room hooks

Required hooks:

- `data-war-room-v1-room-open-state="grid|room"` on the War Room root.
- `data-war-room-v1-active-room-id="<room-id-or-none>"` on the War Room root or room view.
- `data-war-room-v1-enter-room="<room-id>"` on the click/enter button.
- `data-war-room-v1-full-room-view="<room-id>"` on the opened room view.
- `data-war-room-v1-room-agent-chat="<agent-id>"` on the room chat affordance.
- `data-war-room-v1-room-tools="<room-id>"` on the room tool area.
- `data-war-room-v1-room-approvals="<room-id>"` on the room approval area.
- `data-war-room-v1-room-logs="<room-id>"` on the room log/evidence area.
- `data-war-room-v1-back-to-grid="true"` on the back/close affordance.

### Connector lock hooks

Required hooks:

- `data-war-room-v1-connector-registry="disabled-local"` on registry summary UI or test fixture root.
- `data-war-room-v1-connector="<connector-id>"` on connector rows/chips.
- `data-war-room-v1-connector-lock-state="NOT_CONNECTED"` by default.
- `data-war-room-v1-connector-execution-mode="disabled|dry-run"` by default.
- `data-war-room-v1-connector-live-enabled="false"` by default.
- `data-war-room-v1-connector-dry-run="true"` where a local simulation is shown.
- `data-war-room-v1-connector-dlv-approval-required="true"` for any external-capable connector.
- `data-war-room-v1-connector-no-credentials="true"` for this phase.
- `data-war-room-v1-connector-no-live-api-calls="true"` for this phase.

Tests must assert the default `NOT_CONNECTED` / disabled lock state.

## Exact allowed files for follow-up implementation cards

This architecture card does not edit source. The follow-up implementation cards should be bounded to these files unless a later architecture card explicitly changes scope.

### Room-grid shell implementation card

Allowed source files:

- `src/screens/war-room/v1/WarRoomV1.tsx`
- `src/screens/war-room/v1/war-room-v1-state.ts`
- `src/screens/war-room/v1/war-room-v1-types.ts`
- `src/screens/war-room/v1/war-room-v1-manifest.ts`
- New file only if needed: `src/screens/war-room/v1/WarRoomV1RoomGrid.tsx`
- New file only if needed: `src/screens/war-room/v1/WarRoomV1FullRoomView.tsx`

Allowed test/gate files:

- `src/screens/war-room/v1/__tests__/war-room-v1-visual-hierarchy.test.tsx`
- `src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts`
- `src/screens/war-room/v1/__tests__/war-room-v1-agent-motion.test.tsx`
- `scripts/war-room-v1-regression-gate.mjs` only to add stricter room-grid hooks/checks, never to weaken existing gates

Allowed documentation output:

- `docs/status/implementation/war-room-boost-room-grid-shell-20260612.md` or later dated implementation handoff if the card explicitly requires it.

Forbidden for room-grid shell card:

- connector adapter code;
- credentials;
- real API/network calls;
- image generation;
- public asset replacement;
- package/release scripts;
- unrelated routes/screens;
- git push/merge/release/reset/clean.

### Connector disabled/dry-run scaffold implementation card

Allowed source files:

- New file: `src/screens/war-room/v1/war-room-v1-connectors.ts`
- `src/screens/war-room/v1/war-room-v1-types.ts`
- `src/screens/war-room/v1/war-room-v1-state.ts` only to attach connector lock summaries to rooms
- `src/screens/war-room/v1/WarRoomV1.tsx` or `src/screens/war-room/v1/WarRoomV1RoomGrid.tsx` only to display disabled/readiness state
- New file only if needed: `src/screens/war-room/v1/WarRoomV1ConnectorLocks.tsx`

Allowed test/gate files:

- New file: `src/screens/war-room/v1/__tests__/war-room-v1-connectors.test.ts`
- `src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts`
- `src/screens/war-room/v1/__tests__/war-room-v1-visual-hierarchy.test.tsx`
- `scripts/war-room-v1-regression-gate.mjs` only to add connector lock checks, never to weaken safety checks

Allowed documentation output:

- `docs/status/implementation/war-room-boost-connector-disabled-scaffold-20260612.md` or later dated implementation handoff if the card explicitly requires it.

Forbidden for connector scaffold card:

- `.env`, secret, credential, token, keychain, browser profile, account, or provider config edits;
- external API clients that can reach live systems;
- network write calls;
- real Etsy/shop/supplier/AliExpress/Alibaba/ShotLab/account/payment actions;
- live enablement flags;
- release packaging;
- source/runtime code outside the allowed War Room v1 files unless a later contract approves it.

### Visual QA card

Allowed verification surfaces:

- `/war-room`
- `/war-room?v1=1`

Allowed QA outputs:

- screenshots or browser notes under `docs/status/qa/` if the QA card requires a file.

Required QA checks:

- main surface is room-grid-first;
- grid cells are equal/symmetric;
- main cells use minimal text;
- inspector/evidence text is hidden behind disclosure or full-room view;
- click/enter room opens full-room view;
- full-room view has agent chat/tools/task context/approvals/logs;
- connector state shows `NOT CONNECTED` / disabled / dry-run as applicable;
- no console/page errors;
- no shop/supplier/paid/live action controls are enabled.

## Acceptance criteria

A follow-up room-grid implementation may pass only if all of these are true:

1. `/war-room` and `/war-room?v1=1` render a room-grid-first main surface.
2. The grid is equal/symmetric in layout and all core rooms are present.
3. The main cells show minimal live agent/status info only.
4. Evidence/debug/proof text is hidden behind inspector/disclosure/full-room view by default.
5. Click/enter room opens a full-room view.
6. Full-room view exposes agent chat/tools/task context/approvals/logs without enabling external actions.
7. Testable room-cell, active-agent, room-open-state, and connector-lock hooks are present.
8. `NODE_ENV=test pnpm gate:war-room-v1` passes.
9. `pnpm typecheck` passes.
10. `pnpm build` passes.
11. Browser QA confirms no visible debug flood on the main canvas.
12. Safety copy and DOM state show external business/account actions remain `NOT CONNECTED`.

A follow-up connector scaffold implementation may pass only if all of these are true:

1. Default connector state is `NOT_CONNECTED`.
2. Default execution mode is `disabled`.
3. Dry-run produces local draft/evidence only and says `dry-run`.
4. No credentials are loaded.
5. No real network/API calls are made.
6. No live execution path is reachable without later DLV approval.
7. Tests prove live execution is rejected by default.
8. UI shows connector readiness as locked/disabled, not as connected.
9. `NODE_ENV=test pnpm gate:war-room-v1` passes.
10. `pnpm typecheck` passes.
11. `pnpm build` passes.

## Required verification commands for follow-up implementation

Every implementation card based on this contract must run and report real output from:

```bash
NODE_ENV=test pnpm gate:war-room-v1
pnpm typecheck
pnpm build
```

Focused tests should also be run where relevant:

```bash
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-visual-hierarchy.test.tsx
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-connectors.test.ts
```

If a test file does not exist yet, the implementation card that introduces the feature should add it. Do not weaken existing tests or gates to pass.

## Stop conditions

Stop and block instead of continuing if any of these occur:

1. The implementation requires source/runtime edits outside the allowed files.
2. The implementation needs credentials, tokens, browser login, account verification, or live API testing.
3. Any live Etsy/shop/listing/order/message/refund/renewal/publish/ad/supplier/AliExpress/Alibaba/ShotLab/payment/account action becomes necessary.
4. Any code path would make a network write by default.
5. Any UI copy implies connectors are live or approved when they are only disabled/dry-run.
6. `LIVE_ENABLED` becomes reachable without a later DLV approval gate.
7. `NODE_ENV=test pnpm gate:war-room-v1`, `pnpm typecheck`, or `pnpm build` fails and cannot be fixed within the card scope.
8. Visual QA shows the main War Room is still a proof/debug dashboard rather than an equal/symmetric room grid.
9. The room inspector/debug evidence cannot be hidden without major refactor beyond the allowed files.
10. The worker would need image generation, release packaging, git push/merge, reset/clean, or destructive cleanup.

## Recommended child chain

Recommended next chain after this architecture contract:

1. `codexintegrator` — implement the room-grid shell only.
   - Scope: `WarRoomV1.tsx`, typed state/types/manifest, optional `WarRoomV1RoomGrid.tsx` and `WarRoomV1FullRoomView.tsx`.
   - Goal: equal/symmetric room-grid-first main canvas; minimal room cells; click/enter room full-room view; no connector logic beyond displaying existing locked copy if needed.
   - Required commands: `NODE_ENV=test pnpm gate:war-room-v1`, `pnpm typecheck`, `pnpm build`.
2. `codexintegrator` — implement disabled/dry-run connector registry scaffold.
   - Parent: room-grid shell card.
   - Scope: `war-room-v1-connectors.ts`, types/state, connector lock UI, connector tests.
   - Goal: local disabled/dry-run registry and action draft model; default `NOT_CONNECTED`; no credentials and no real API calls.
   - Required commands: connector focused tests plus canonical commands.
3. `visualqaagent` — browser QA for room-grid UX.
   - Parent: room-grid shell and connector scaffold cards.
   - Verify `/war-room` and `/war-room?v1=1`, screenshots, DOM hooks, click/enter room, hidden evidence, no console errors, no debug flood.
4. `claudereviewer` — safety/no-overclaim review.
   - Parent: visual QA card.
   - Verify no live connector/action path, no credentials, no hidden mutation, no release packaging, no overclaim.
5. Blocked DLV approval gate — live connector enablement.
   - Parent: reviewer card.
   - Status should remain blocked until DLV explicitly approves a specific connector/action class. This architecture contract does not authorize that enablement.

## Explicit non-authorizations

This contract does not authorize:

- live connector enablement;
- store/shop/supplier/ShotLab/API/account connection;
- credential loading or testing;
- real API calls;
- marketplace actions;
- paid generation or purchases;
- publishing, listing edits, order handling, messages, refunds, renewals, or ads;
- destructive DB/admin operations;
- source/runtime changes from this architecture card;
- image generation;
- release packaging;
- git push/merge/reset/clean.

## Exit verdict

PASS: BOOST room-grid + connector infrastructure contract ready.

The next safe implementation is a bounded room-grid-first UI pass followed by a separate disabled/dry-run connector scaffold pass. Etsy/shops/suppliers/ShotLab/API/account systems remain NOT CONNECTED, disabled, dry-run/read-only only, and blocked from live execution until later explicit DLV approval.
