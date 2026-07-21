# War Room BOOST room-agent activity contract

Status: PASS — architecture contract ready for a bounded room-agent activity implementation card
Owner lane: claudearchitect
Date: 2026-06-12
Scope: documentation/spec only. This card creates no source/runtime/public asset change, performs no image generation, does not touch credentials, does not call external APIs, does not package a release, and does not mutate business systems.

Source documents read first:

- `docs/status/automation/war-room-boost-room-grid-commerce-infra-20260612.md`
- `docs/status/architecture/war-room-boost-room-grid-connector-contract-20260612.md`
- `docs/status/qa/war-room-boost-room-grid-first-visual-qa-20260612.md`
- `src/screens/war-room/v1/WarRoomV1.tsx`
- `src/screens/war-room/v1/WarRoomV1AgentUnit.tsx`
- `src/screens/war-room/v1/war-room-v1-state.ts`
- `src/screens/war-room/v1/war-room-v1-types.ts`
- `src/screens/war-room/v1/__tests__/war-room-v1-agent-motion.test.tsx`

## Safety statement

Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED. Only local disabled/dry-run/read-only infrastructure is allowed until DLV approval is explicitly granted in a later gate. No shop, supplier, paid, credential, account, publish, order, message, refund, renewal, ad, release, git push, git merge, reset, clean, or destructive DB/admin action is authorized by this document.

This contract is specifically for room-agent activity. It does not authorize live connector enablement, external network calls, credential loading, account verification, or business/API/account actions.

## 1. Current-state gap summary

The current BOOST room-grid + connector chain is a safe passed checkpoint, not the final operating world.

What already passed:

1. `/war-room` and `/war-room?v1=1` render an equal/symmetric grid-first main surface.
2. The first viewport is dominated by eight comparable room cells.
3. Connector and business safety indicators are visible without becoming the dominant UI.
4. Debug/evidence ledgers are hidden by default in a closed inspector/disclosure.
5. Clicking a room opens a larger/full-room panel with tools, chat, approvals, and logs.
6. Connector infrastructure remains locked: default states are NOT_CONNECTED, disabled, no credentials, no live API calls, and no external mutation path.
7. The visual QA report passed the room-grid-first checkpoint and found no enabled shop/supplier/ShotLab/API/live action controls.

Remaining product gap:

1. The main grid still uses static letter markers for agent presence. The markers prove hooks and safety, but they do not yet feel like small readable agent units moving/working inside room cells.
2. `WarRoomV1.tsx` currently renders inline room markers directly inside the grid cell as simple absolute `<span>` elements. Follow-up work should move this into a typed room-cell agent layer rather than adding more ad hoc letter badges.
3. `WarRoomV1AgentUnit.tsx` already exposes deterministic motion hooks and prototype unit rendering, but it is mostly used in the hidden/secondary route proof area rather than as the primary room-cell activity layer.
4. `war-room-v1-state.ts` already maps read-only Kanban/task state into lifecycle, station, route, unit identity, motion, action requests, evidence logs, approval locks, and connector lock summaries. The next implementation should reuse that state and not invent live/action state.
5. `war-room-v1-types.ts` has the base motion and room-cell types, but it lacks a specific typed contract for room-level agent activity, a working station surface, and a compact opened full-room work view.
6. The opened full-room view is safe and useful as a first pass, but it is still a placeholder panel. It needs a clearer work surface showing the active unit, current station/tool, chat affordance, approvals, logs, and connector locks without becoming a debug wall.
7. Proof/evidence is correctly hidden by default, but the follow-up needs to preserve that progressive disclosure as agent activity becomes richer. The main canvas must not regress into raw task titles, source evidence, lifecycle trails, or command debug text.

Design direction for the next card:

- Keep the equal room grid.
- Replace static letter markers with a bounded, readable unit layer derived from existing read-only task/Kanban state.
- When a room is opened, show one active working context first; put secondary evidence behind a hidden inspector.
- Preserve the Safety Spine: external systems NOT CONNECTED, connector execution disabled/dry-run only, no live business/API/account actions.

## 2. Exact allowed files for the follow-up codexintegrator implementation card

The follow-up implementation card should be assigned to `codexintegrator` and must be bounded to the files below. Do not widen scope without a new architecture card or explicit DLV/supervisor approval.

### Allowed source files

- `src/screens/war-room/v1/WarRoomV1.tsx`
- `src/screens/war-room/v1/WarRoomV1AgentUnit.tsx`
- `src/screens/war-room/v1/war-room-v1-state.ts`
- `src/screens/war-room/v1/war-room-v1-types.ts`
- `src/screens/war-room/v1/war-room-v1-manifest.ts` only if station labels/room station grouping need existing-manifest alignment
- `src/screens/war-room/v1/war-room-v1-connectors.ts` only to read existing connector lock summaries; do not add live connectors

### Allowed new source files

Create only if they keep `WarRoomV1.tsx` smaller and reuse existing state/types:

- `src/screens/war-room/v1/WarRoomV1RoomAgentLayer.tsx`
- `src/screens/war-room/v1/WarRoomV1FullRoomView.tsx`
- `src/screens/war-room/v1/WarRoomV1HiddenInspector.tsx`

### Allowed test/gate files

- `src/screens/war-room/v1/__tests__/war-room-v1-agent-motion.test.tsx`
- `src/screens/war-room/v1/__tests__/war-room-v1-visual-hierarchy.test.tsx`
- `src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts`
- `src/screens/war-room/v1/__tests__/war-room-v1-connectors.test.ts`
- New file only if needed: `src/screens/war-room/v1/__tests__/war-room-v1-room-agent-activity.test.tsx`
- `scripts/war-room-v1-regression-gate.mjs` only to add stricter room-agent activity hooks/checks, never to weaken existing gates

### Allowed documentation output for the implementation card

- `docs/status/implementation/war-room-boost-room-agent-activity-20260612.md` or a later dated implementation handoff if the card explicitly requires it.

### Forbidden implementation files/surfaces

- `.env`, credentials, tokens, keychain, browser profiles, provider configs, shop/account configs.
- External API clients, network write modules, live connector adapters, or account validation scripts.
- Public image/assets unless a separate visual asset card explicitly authorizes it.
- Package/release/deployment scripts.
- Unrelated routes/screens outside War Room v1.
- Git push, merge, release, reset, clean, destructive cleanup.

## 3. Typed data and DOM hook contract

The follow-up card should implement the smallest coherent room-agent activity layer using these contracts. Names may be adjusted only if the implementation report documents the replacement and tests assert equivalent behavior.

### 3.1 Room-cell agent motion contract

Extend from existing `WarRoomV1MissionVisual.unit` and `WarRoomV1RoomCell` instead of creating a separate live feed.

Suggested type additions:

```ts
type WarRoomV1RoomAgentActivityState = 'sleeping' | 'queued' | 'moving' | 'working' | 'needs-review' | 'approval-locked' | 'degraded'

type WarRoomV1RoomAgentActivity = {
  unitId: string
  taskId: string
  roomId: string
  stationId: WarRoomV1StationId
  sourceStationId: WarRoomV1StationId
  targetStationId: WarRoomV1StationId
  displayName: string
  role: WarRoomV1UnitRole
  spriteKind: WarRoomV1UnitSpriteKind
  activityState: WarRoomV1RoomAgentActivityState
  position: WarRoomV1Point
  progressPercent: number
  stationLabel: string
  shortStatus: string
  evidenceFreshness: WarRoomV1EvidenceFreshness
  safety: {
    readOnly: true
    externalSystemsConnected: false
    connectorLockState: 'NOT_CONNECTED' | 'READY_FOR_APPROVAL' | 'APPROVED_BUT_DISABLED'
    executionMode: 'disabled' | 'dry-run'
  }
}
```

Mapping rules:

- `active`, `claimed`, `assignment`, `qa-review`, and `remediation` lifecycles may map to `moving` or `working` only when the feed is real read-only and not degraded.
- `approval-required` maps to `approval-locked`.
- `blocked-needs-input` and review-gated items map to `needs-review`.
- `sleeping` rooms show no active unit or a quiet placeholder only.
- Fixture, fallback, stale, unavailable, or degraded feeds map to `degraded`; no fake live work animation.
- Never derive movement from timers that imply real execution. Deterministic position/progress from existing read-only task state is allowed.

Required DOM hooks in room cells:

- `data-war-room-v1-room-agent-layer="<room-id>"` on the unit layer inside each room cell.
- `data-war-room-v1-room-agent-count="<number>"` on the room cell or layer.
- `data-war-room-v1-room-agent-unit="<unit-id>"` on each visible small unit.
- `data-war-room-v1-room-agent-task-id="<task-id>"` on each visible small unit.
- `data-war-room-v1-room-agent-activity-state="sleeping|queued|moving|working|needs-review|approval-locked|degraded"` on each visible small unit.
- `data-war-room-v1-room-agent-station="<station-id>"` on each visible small unit.
- `data-war-room-v1-room-agent-progress="<0-100>"` on each visible small unit.
- `data-war-room-v1-room-agent-read-only="true"` on the unit or layer.
- `data-war-room-v1-room-agent-external-connected="false"` on the unit or layer.

Visual rules:

- Units must be small, readable, and secondary to the room cell; they must not cover room labels, connector lock copy, or counts.
- Main canvas unit labels should be one short role/name token at most. No raw task title, raw block reason, raw evidence excerpt, lifecycle ledger, or full route explanation in the room grid.
- Static letter markers may remain only as fallback text inside a richer `WarRoomV1RoomAgentLayer`; the follow-up should visibly move past bare static letter markers.
- Reduced motion must remain readable; when `prefers-reduced-motion` is active, units can snap to the same computed position while retaining station/state hooks.

### 3.2 Working station contract

The next implementation should show which station/tool the unit is working at without enabling the tool.

Suggested type:

```ts
type WarRoomV1WorkingStationSurface = {
  roomId: string
  stationId: WarRoomV1StationId
  stationLabel: string
  stationKind: 'intake' | 'planning' | 'assignment' | 'ready' | 'active-work' | 'qa' | 'blocker' | 'approval' | 'archive' | 'gateway'
  activeUnitId: string | null
  activeTaskId: string | null
  state: 'idle' | 'watching' | 'working' | 'needs-review' | 'approval-locked' | 'disabled'
  allowedNow: WarRoomV1ReadOnlyAction[]
  lockedActions: WarRoomV1LockedAction[]
  connectorLockState: 'NOT_CONNECTED' | 'READY_FOR_APPROVAL' | 'APPROVED_BUT_DISABLED'
  executionMode: 'disabled' | 'dry-run'
}
```

Required DOM hooks:

- `data-war-room-v1-working-station="<station-id>"`
- `data-war-room-v1-working-station-state="idle|watching|working|needs-review|approval-locked|disabled"`
- `data-war-room-v1-working-station-active-unit="<unit-id-or-none>"`
- `data-war-room-v1-working-station-active-task="<task-id-or-none>"`
- `data-war-room-v1-working-station-execution-mode="disabled|dry-run"`
- `data-war-room-v1-working-station-live-enabled="false"`

Rules:

- Station state may summarize current task lifecycle, approval, or review state only.
- Station/tool buttons in the opened room are allowed only as read-only inspection or draft-only controls.
- No station/tool can trigger Etsy/shop/supplier/ShotLab/API/account execution.

### 3.3 Opened full-room view contract

The opened full-room view should become the primary progressive disclosure surface for room details, while staying compact and not becoming a debug wall.

Suggested type:

```ts
type WarRoomV1FullRoomActivityView = {
  roomId: string
  roomLabel: string
  activeUnit: WarRoomV1RoomAgentActivity | null
  workingStation: WarRoomV1WorkingStationSurface | null
  chatAffordance: {
    agentId: string
    label: string
    enabled: false
    mode: 'placeholder-local-only'
  }
  approvals: WarRoomV1ActionRequest[]
  recentLogs: WarRoomV1EvidenceLogEntry[]
  connectorLocks: WarRoomV1RoomCell['connectorLock']
  inspector: {
    hiddenByDefault: true
    sourceTaskIds: string[]
  }
}
```

Required opened-room DOM hooks:

- `data-war-room-v1-full-room-view="<room-id>"` already exists and must be preserved.
- `data-war-room-v1-full-room-active-unit="<unit-id-or-none>"`
- `data-war-room-v1-full-room-active-station="<station-id-or-none>"`
- `data-war-room-v1-full-room-chat-affordance="<agent-id-or-none>"`
- `data-war-room-v1-full-room-chat-enabled="false"`
- `data-war-room-v1-full-room-tools-mode="read-only|draft-only"`
- `data-war-room-v1-full-room-approval-count="<number>"`
- `data-war-room-v1-full-room-log-count="<number>"`
- `data-war-room-v1-full-room-connector-lock-state="NOT_CONNECTED|READY_FOR_APPROVAL|APPROVED_BUT_DISABLED"`
- `data-war-room-v1-full-room-live-enabled="false"`
- `data-war-room-v1-full-room-inspector-hidden-by-default="true"`

User-facing content rules:

- First read should answer: who is active, what station/tool is being worked, whether DLV review/approval is needed, and whether connectors are locked.
- Chat affordance is a local placeholder only unless a separate chat implementation card exists. It must not call external models/accounts or imply the agent is contacted live through another system.
- Logs and approvals should show concise summaries first; raw evidence should sit inside a hidden inspector/disclosure.
- No dominant raw task/debug text on the main canvas or first view of the opened room.

### 3.4 Hidden inspector contract

The hidden inspector is the only place for raw proof/evidence details by default.

Required DOM hooks:

- Preserve `data-war-room-v1-room-inspector-hidden-by-default="true"`.
- Add `data-war-room-v1-hidden-inspector="room-agent-activity"` on the inspector root if split into a new component.
- Add `data-war-room-v1-hidden-inspector-source-task-count="<number>"`.
- Add `data-war-room-v1-hidden-inspector-raw-evidence="closed-by-default"`.
- Add `data-war-room-v1-hidden-inspector-no-mutation="true"`.

Rules:

- The inspector can contain lifecycle trails, source evidence, raw task ids, route cues, test/proof labels, and safety matrices.
- It must be closed by default and below the main first-read surface.
- Opening it must not mutate state outside React UI state and must not call external APIs.

### 3.5 Connector lock state contract

Connector locks must remain inherited from the existing disabled/dry-run connector infrastructure.

Required lock state constraints:

```ts
type WarRoomV1RoomAgentConnectorSafety = {
  lockState: 'NOT_CONNECTED' | 'READY_FOR_APPROVAL' | 'APPROVED_BUT_DISABLED'
  executionMode: 'disabled' | 'dry-run'
  credentialsLoaded: false
  liveApiCallsEnabled: false
  externalMutationEnabled: false
  dryRunOnly: true
  dlvApprovalRequired: true
}
```

Required DOM hooks:

- Existing root connector hooks must be preserved:
  - `data-war-room-v1-connector-registry="disabled-local"`
  - `data-war-room-v1-connector-lock-state="NOT_CONNECTED"` by default
  - `data-war-room-v1-connector-execution-mode="disabled"` by default
  - `data-war-room-v1-connector-live-enabled="false"`
  - `data-war-room-v1-connector-no-credentials="true"`
  - `data-war-room-v1-connector-no-live-api-calls="true"`
- Add/maintain room activity hooks:
  - `data-war-room-v1-room-agent-connector-lock-state="NOT_CONNECTED|READY_FOR_APPROVAL|APPROVED_BUT_DISABLED"`
  - `data-war-room-v1-room-agent-connector-execution-mode="disabled|dry-run"`
  - `data-war-room-v1-room-agent-dry-run-only="true"`
  - `data-war-room-v1-room-agent-external-mutation="false"`

Forbidden connector states in this next implementation:

- `LIVE_ENABLED` must not be emitted by default from the room-agent activity implementation.
- `live` execution mode must not be used.
- No UI control may say or imply that Etsy, shops, suppliers, ShotLab, APIs, account systems, payments, messages, publishing, listings, orders, refunds, renewals, ads, purchases, or live generation are connected or executed.

## 4. Acceptance criteria and required commands

The follow-up implementation may pass only if all acceptance criteria are true.

### Product acceptance criteria

1. `/war-room` and `/war-room?v1=1` still render the equal room-grid-first main surface.
2. The eight core rooms remain present and comparable in layout/weight.
3. Static letter markers are replaced or wrapped by a room-agent activity layer that shows small readable units moving/working inside room cells from existing read-only Kanban/task state.
4. The main room cells stay minimal: room name, active/quiet state, compact agent/unit activity, task/approval counts, and lock status only.
5. No dominant raw task/debug text appears on the main canvas.
6. Clicking a room opens a full-room view with the active unit, current station/tool, chat affordance, approvals, logs, and connector locks.
7. The opened full-room view uses progressive disclosure for proof/evidence; raw source evidence and lifecycle internals stay in a hidden inspector by default.
8. Unit movement/working state is deterministic/read-only and does not imply live external execution.
9. Reduced-motion users still get readable station/state hooks without motion-dependent meaning.
10. Safety Spine is preserved: external systems NOT CONNECTED, connector execution disabled/dry-run only, no live business/API/account actions.

### Test/DOM acceptance criteria

1. `data-war-room-v1-room-agent-layer` exists for room cells.
2. `data-war-room-v1-room-agent-unit` exists for visible units when tasks are present.
3. `data-war-room-v1-room-agent-activity-state` distinguishes moving/working/needs-review/approval-locked/degraded states.
4. `data-war-room-v1-working-station` and related active unit/task hooks exist in the opened room view.
5. `data-war-room-v1-full-room-active-unit`, `data-war-room-v1-full-room-active-station`, `data-war-room-v1-full-room-chat-affordance`, `data-war-room-v1-full-room-chat-enabled="false"`, and connector lock hooks exist.
6. Hidden inspector hooks prove raw evidence is closed by default.
7. Connector hooks prove NOT_CONNECTED/disabled/no-credentials/no-live-api/no-external-mutation remains true.
8. Existing tests are not weakened. Any changed tests must assert stricter behavior.

### Required commands

Every implementation card based on this contract must run and report real output from:

```bash
NODE_ENV=test pnpm gate:war-room-v1
pnpm typecheck
pnpm build
```

Focused tests should also be run where relevant:

```bash
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-agent-motion.test.tsx
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-visual-hierarchy.test.tsx
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-connectors.test.ts
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-room-agent-activity.test.tsx
```

If the new room-agent test file is not created, the implementation report must say which existing test/gate proves the same hooks instead. Do not weaken `scripts/war-room-v1-regression-gate.mjs` to pass.

### Browser/visual QA expectations for the child visual QA card

The visual QA card must verify:

- `/war-room` HTTP 200.
- `/war-room?v1=1` HTTP 200.
- No console/page errors.
- Equal grid remains dominant.
- Unit layer is visible and more readable than static letter markers.
- Opened full-room view shows active unit/station/chat/tools/approvals/logs/locks without becoming a debug wall.
- Inspector/evidence is hidden by default.
- No enabled live/shop/supplier/ShotLab/API/account controls are visible.

## 5. Stop conditions and forbidden actions

Stop and block instead of continuing if any of these occur:

1. The implementation needs source/runtime edits outside the allowed files.
2. The implementation needs credentials, tokens, browser login, account verification, live API testing, or external network access.
3. Any live Etsy/shop/listing/order/message/refund/renewal/publish/ad/supplier/AliExpress/Alibaba/ShotLab/payment/account action becomes necessary.
4. Any code path would make a network write by default.
5. UI copy implies connectors are live, approved, connected, or executable when they are only NOT_CONNECTED/disabled/dry-run.
6. `LIVE_ENABLED` or `live` execution becomes reachable without a later explicit DLV approval gate.
7. Main room-cell activity requires raw task/debug text to be visible on the main canvas.
8. The hidden inspector cannot remain hidden by default.
9. Unit animation requires timers or fake state that makes non-live/fallback data look live.
10. `NODE_ENV=test pnpm gate:war-room-v1`, `pnpm typecheck`, or `pnpm build` fails and cannot be fixed within the allowed scope.
11. Visual QA shows the War Room regressed from room-grid-first into proof/debug dashboard composition.
12. The worker would need image generation, public asset replacement, release packaging, git push/merge, reset/clean, or destructive cleanup.

Explicitly forbidden:

- Source edits from this architecture card.
- Image generation.
- Credential or secret access.
- External network/API calls.
- Connector enablement.
- Etsy/shop/listing/order/message/refund/renewal/publish/ad/money actions.
- Supplier, AliExpress, Alibaba, ShotLab, API, browser-profile, or account actions.
- Git push, merge, release, reset, clean, or destructive cleanup.

## 6. Recommended child chain

Recommended next chain after this architecture contract:

1. `codexintegrator` — implement the room-agent activity layer.
   - Parent: this architecture card.
   - Scope: allowed War Room v1 source/test files only.
   - Goal: small readable agent units moving/working inside room cells from existing read-only Kanban/task state; opened full-room view shows active unit, station/tool, chat affordance, approvals, logs, connector locks, and hidden inspector.
   - Required commands: `NODE_ENV=test pnpm gate:war-room-v1`, `pnpm typecheck`, `pnpm build`, plus focused tests.
   - Must report: changed files, hooks added/preserved, test output, and safety line.

2. `visualqaagent` — visual QA for room-agent activity.
   - Parent: implementation card.
   - Verify `/war-room` and `/war-room?v1=1`, screenshots/DOM hooks, room-cell units, full-room view, hidden inspector, no console errors, no debug wall, no enabled live controls.
   - Output: QA report under `docs/status/qa/` if the card requires a file.

3. `claudereviewer` — safety/no-overclaim review.
   - Parent: visual QA card.
   - Verify no live connector/action path, no credentials, no hidden mutation, no network write, no release packaging, no overclaim that the non-final unit layer is premium/final/live.
   - Must run `NODE_ENV=test pnpm gate:war-room-v1` and inspect scoped source changes.

4. Blocked DLV approval gate — live connector enablement.
   - Parent: safety/no-overclaim review.
   - Status remains blocked until DLV explicitly approves a specific connector/action class in a later card. This architecture contract does not authorize that enablement.

## Exit verdict

PASS: BOOST room-agent activity contract ready.

The next safe implementation is a bounded War Room v1 room-agent activity pass that replaces bare static letter markers with small readable unit activity, keeps raw evidence in a hidden inspector, opens a compact full-room view for agent/station/tools/approvals/logs, and preserves NOT CONNECTED / disabled / dry-run connector safety with no live business/API/account actions.
