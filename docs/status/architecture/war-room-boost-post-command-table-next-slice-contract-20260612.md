# War Room BOOST post-command-table next-slice contract

Status: PASS — architecture contract ready for one bounded opened-room decision/approval loop implementation card
Owner lane: claudearchitect
Date: 2026-06-12
Scope: documentation/spec only. This card writes no source/runtime/test/script/public asset change, performs no browser/account/API call, does not touch credentials, does not create children, and does not mutate business systems.

Source documents and local files inspected first:

- `docs/status/architecture/war-room-boost-command-table-draft-handoff-contract-20260612.md`
- `docs/status/qa/war-room-boost-command-table-safety-reqa-v2-20260612/report.md`
- `docs/status/reviews/war-room-boost-command-table-safety-review-v3-20260612.md`
- `docs/status/vision/war-room-final-vision-live-spec.md`
- `docs/status/automation/war-room-boost-room-grid-commerce-infra-20260612.md`
- `src/screens/war-room/v1/WarRoomV1.tsx`
- `src/screens/war-room/v1/WarRoomV1CommandTable.tsx`
- `src/screens/war-room/v1/WarRoomV1ReviewLoop.tsx`
- `src/screens/war-room/v1/war-room-v1-state.ts`
- `src/screens/war-room/v1/war-room-v1-types.ts`

## Safety statement

Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED; only local disabled/dry-run/read-only infrastructure is allowed until DLV explicitly approves live enablement.

This contract does not authorize Etsy, shop, supplier, ShotLab, AliExpress, Alibaba, API, account, payment, listing, order, message, refund, renewal, ad, purchase, live generation, release, git push, git merge, reset, clean, credential, browser-profile, provider-config, or destructive DB/admin actions. It defines only a local, disabled, read-only/draft-only view-model bridge from an already sealed command-table room handoff packet into an opened-room decision/approval loop.

## 1. Chosen next smallest slice

The next implementation should do exactly one thing:

Turn the existing sealed command-table room handoff packet into a compact opened-room decision/approval loop panel that shows the local decision state, locked approval choices, required evidence counts, and DLV gate posture inside the opened room without enabling any action.

This is the smallest safe next step because:

1. The prior command-table slice already creates a local `WarRoomV1CommandTableHandoffState` and visible sealed packet from the opened room.
2. Product direction says risky decisions rise to the central command table, then the user should be able to open a room and see chat/tools/approval controls; the missing loop is the return path from sealed packet to room-native decision context.
3. Existing `WarRoomV1ReviewLoop` is a collapsed global proof drawer, not a room-native opened-room decision loop tied to the sealed handoff packet.
4. The slice can be implemented as pure view-model derivation and compact UI only; it needs no connector, executor, write endpoint, account check, live API, Kanban mutation, or broad redesign.
5. It advances the primary room-grid-first interface while keeping raw debug/evidence hidden in inspectors.

## 2. Scope boundaries

In scope for the follow-up implementation:

1. Add a local-only typed decision/approval loop view model derived from the existing opened room controls and existing `WarRoomV1CommandTableHandoffState.activePacket`.
2. Render one compact opened-room decision loop when a room is open and a handoff packet exists.
3. Show the loop as disabled/read-only controls: decision state, DLV requirement, locked action count, local draft count, no-live connector posture, and closed evidence inspector.
4. Link the opened-room loop to the command-table packet through deterministic ids and DOM hooks.
5. Preserve all existing command-table handoff packet hooks, room-specific controls hooks, review-loop hooks, grid-first hooks, and safety hooks.
6. Add focused tests and regression-gate static checks for hooks, typed false flags, hidden inspectors, and no-live/no-mutation invariants.

Out of scope:

1. No real approval, rejection, publish, execute, send, buy, refund, renewal, supplier, ShotLab, shop, API, account, or paid-generation action.
2. No Kanban task creation/update/completion/blocking from UI.
3. No command bus, executor, connector adapter, route/API endpoint, provider config, credential read, browser profile, local storage queue, or network call.
4. No multi-room approval dashboard, drag/drop workflow, animation overhaul, final/premium art claim, route default change, release packaging, or public asset generation.
5. No child-card creation from this architecture card.

## 3. Allowed files for the follow-up implementation card

The follow-up implementation should be assigned to `codexintegrator`. Scope must stay inside this allowlist unless a later architecture card or explicit supervisor/DLV approval widens it.

### Allowed files

- `src/screens/war-room/v1/war-room-v1-types.ts`
  - Add local-only opened-room decision/approval loop types.
  - Extend existing handoff packet/room-control types only as needed for a disabled/read-only decision loop.
- `src/screens/war-room/v1/war-room-v1-state.ts`
  - Add pure selector/build helper for the decision loop.
  - Helper must derive only from room-specific controls, command-table handoff state, room cells, missions, action requests, evidence logs, connector locks, and existing local read-only data.
  - Keep deterministic: no DOM, timers, random values, fetches, local storage, browser APIs, mutation calls, direct Kanban DB reads, or credentials.
- `src/screens/war-room/v1/WarRoomV1FullRoomView.tsx`
  - Render the compact room-native decision/approval loop or accept it as a prop and attach source/linkage hooks near existing room controls.
  - Preserve room-specific controls, local chat disabled state, tool surface, draft queue, approval lock, connector lock, logs, and closed inspectors.
- `src/screens/war-room/v1/WarRoomV1CommandTable.tsx`
  - Preserve the sealed packet hooks.
  - Add only minimal reciprocal linkage hook(s) if needed to prove the packet feeds the opened-room loop.
- `src/screens/war-room/v1/WarRoomV1.tsx`
  - Wire the existing `roomCommandHandoff` into the full-room decision loop.
  - Preserve equal/symmetric grid, open-room behavior, active room id hook, connector root safety hooks, hidden inspector behavior, and command-table visible region.
- `src/screens/war-room/v1/__tests__/war-room-v1-command-table-handoff.test.tsx`
  - Extend only for linkage between handoff packet and opened-room decision loop if this remains focused.
- Optional focused test: `src/screens/war-room/v1/__tests__/war-room-v1-opened-room-decision-loop.test.tsx`
  - Preferred if the new assertions would make existing tests too broad.
- `src/screens/war-room/v1/__tests__/war-room-v1-room-specific-controls.test.tsx`
  - Extend only if the loop is rendered inside the existing full-room control surface.
- `scripts/war-room-v1-regression-gate.mjs`
  - Add static checks for decision-loop hooks and required disabled/default false flags.
  - Existing checks must not be weakened or deleted.

### Forbidden files and surfaces

Forbidden:

- Source code outside the allowed War Room v1 files above.
- Route/API files, write endpoints, connector executors, command buses, provider configs, package files, build/release scripts, browser profiles, credentials, keychain, `.env`, secrets, public assets, god/model/station assets, generated art, and unrelated screens.
- Any implementation, QA, release, or connector-enable child creation from this architecture card.
- Git push, merge, release, reset, clean, destructive cleanup, or destructive DB/admin operations.
- Etsy/shop/listing/order/message/refund/renewal/ad/supplier/AliExpress/Alibaba/ShotLab/payment/account/live generation actions.

Stop and block with `SCOPE_CREEP` if the implementation cannot be done inside the allowed files.

## 4. Typed model/view-model contract

The implementation should add the smallest coherent local-only model. Naming can be adjusted to match project style, but the fields and invariants below are required.

Suggested additions in `war-room-v1-types.ts`:

```ts
export type WarRoomV1OpenedRoomDecisionLoopStatus =
  | 'empty'
  | 'local-draft-review'
  | 'dlv-approval-required'
  | 'blocked-forbidden'
  | 'read-only-inspection'

export type WarRoomV1OpenedRoomDecisionChoiceState =
  | 'locked-no-live-action'
  | 'locked-dlv-required'
  | 'locked-review-required'
  | 'read-only-evidence'

export type WarRoomV1OpenedRoomDecisionChoice = {
  id: string
  label: string
  state: WarRoomV1OpenedRoomDecisionChoiceState
  reason: string
  localOnly: true
  enabled: false
  externalMutation: false
  liveEnabled: false
  requiresDlvApproval: boolean
}

export type WarRoomV1OpenedRoomDecisionLoop = {
  id: string
  sourceRoomId: string
  sourceRoomLabel: string
  sourceHandoffPacketId: string | null
  sourceHandoffStatus: WarRoomV1CommandHandoffPacketStatus | 'empty'
  status: WarRoomV1OpenedRoomDecisionLoopStatus
  displayLabel: string
  summary: string
  activeUnitId: string | null
  activeStationId: WarRoomV1StationId | null
  targetCommandTableStationId: 'central-command-table'
  targetApprovalStationId: 'approval-seal'
  draftActionCount: number
  lockedActionCount: number
  decisionChoiceCount: number
  choices: WarRoomV1OpenedRoomDecisionChoice[]
  evidenceTaskCount: number
  evidenceActionCount: number
  evidenceLogCount: number
  localOnly: true
  externalMutation: false
  liveEnabled: false
  credentialsLoaded: false
  liveApiCallsEnabled: false
  connectorState: WarRoomV1RoomConnectorLockSummary['connectorState']
  dlvApprovalRequired: boolean
  inspectorHiddenByDefault: true
}
```

Required derivation rules:

1. Build the loop only from existing local room control state plus the current `WarRoomV1CommandTableHandoffState.activePacket`.
2. Loop `id` must be deterministic, e.g. `opened-room-decision-loop-${roomId}`.
3. `sourceHandoffPacketId` must equal the active packet id when one exists; otherwise it is `null` and the loop status is `empty` or no loop is rendered.
4. Status mapping:
   - no room or no active packet -> `empty`;
   - active packet `sealed-local-draft` -> `local-draft-review`;
   - active packet `sealed-review-required` -> `read-only-inspection` or `local-draft-review`, depending on existing approval state;
   - active packet `sealed-dlv-required` -> `dlv-approval-required`;
   - active packet `sealed-blocked-forbidden` -> `blocked-forbidden`.
5. Choice rows are disabled view-model rows only. They may label actions such as `Inspect packet`, `Review local draft`, `DLV approval required`, or `Keep locked`, but every choice must have `enabled=false`, `externalMutation=false`, and `liveEnabled=false`.
6. `targetCommandTableStationId` is always `central-command-table`; `targetApprovalStationId` is always `approval-seal`.
7. `localOnly` is always `true`.
8. `externalMutation`, `liveEnabled`, `credentialsLoaded`, and `liveApiCallsEnabled` are always `false`.
9. Connector state must remain `NOT_CONNECTED` for this slice unless existing stricter source policy already forces a safer equivalent. Unsafe or unexpected connector states must not become live/connected copy.
10. Evidence/task/action ids and raw excerpts may exist only in closed-by-default inspectors or counts, not in first-read loop copy.
11. The loop is a view model only; it cannot create a real approval mutator, executor, command bus, connector queue, Kanban writer, route/API call, or external adapter.

## 5. Required DOM/data hooks

The implementation must preserve all existing command-table handoff and room-specific controls hooks, including:

- `data-war-room-v1-command-table-room-handoff-root="true"`
- `data-war-room-v1-command-table-room-handoff-packet`
- `data-war-room-v1-command-table-room-handoff-status`
- `data-war-room-v1-command-table-room-handoff-external-mutation="false"`
- `data-war-room-v1-command-table-room-handoff-live-enabled="false"`
- `data-war-room-v1-room-specific-controls="<room-id>"`
- `data-war-room-v1-room-tool-surface="<room-id>"`
- `data-war-room-v1-room-draft-action-queue="<room-id>"`
- `data-war-room-v1-room-approval-lock="<room-id>"`
- `data-war-room-v1-room-connector-lock-state="NOT_CONNECTED|READY_FOR_APPROVAL|APPROVED_BUT_DISABLED"`
- `data-war-room-v1-room-connector-no-credentials="true"`
- `data-war-room-v1-room-connector-no-live-api-calls="true"`
- `data-war-room-v1-room-connector-live-enabled="false"`

Add the hooks below.

### 5.1 Opened-room decision loop root

Required on the compact opened-room decision loop root:

- `data-war-room-v1-opened-room-decision-loop-root="true"`
- `data-war-room-v1-opened-room-decision-loop-room="<room-id>"`
- `data-war-room-v1-opened-room-decision-loop-source-packet="<packet-id-or-none>"`
- `data-war-room-v1-opened-room-decision-loop-source-status="<handoff-status-or-empty>"`
- `data-war-room-v1-opened-room-decision-loop-status="empty|local-draft-review|dlv-approval-required|blocked-forbidden|read-only-inspection"`
- `data-war-room-v1-opened-room-decision-loop-target-station="central-command-table"`
- `data-war-room-v1-opened-room-decision-loop-approval-station="approval-seal"`
- `data-war-room-v1-opened-room-decision-loop-local-only="true"`
- `data-war-room-v1-opened-room-decision-loop-external-mutation="false"`
- `data-war-room-v1-opened-room-decision-loop-live-enabled="false"`
- `data-war-room-v1-opened-room-decision-loop-credentials-loaded="false"`
- `data-war-room-v1-opened-room-decision-loop-live-api-calls-enabled="false"`
- `data-war-room-v1-opened-room-decision-loop-connector-lock-state="NOT_CONNECTED"`

Rules:

- The loop should be visible only in opened-room context, not as a new first-viewport global dashboard.
- It must be compact and room-native: one plaque/scroll/control strip, not a sprawling proof wall.
- If rendered when no packet exists, it must clearly say local-only empty state and expose `source-packet="none"`.

### 5.2 Disabled decision choices

Required on each disabled decision choice row/chip/button-like plaque:

- `data-war-room-v1-opened-room-decision-choice="<choice-id>"`
- `data-war-room-v1-opened-room-decision-choice-state="locked-no-live-action|locked-dlv-required|locked-review-required|read-only-evidence"`
- `data-war-room-v1-opened-room-decision-choice-enabled="false"`
- `data-war-room-v1-opened-room-decision-choice-external-mutation="false"`
- `data-war-room-v1-opened-room-decision-choice-live-enabled="false"`
- `data-war-room-v1-opened-room-decision-choice-dlv-required="true|false"`

Rules:

- These may be rendered as disabled buttons, chips, seals, or plaques, but they cannot have `onClick` handlers that mutate state or call external systems.
- If an `onClick` is used only for local inspector toggle, it must be on the inspector control, not on an action choice, and must not touch external state.
- Visible copy must use locked/read-only/local language, not execute/approve/send/publish language.

### 5.3 Handoff reciprocal linkage

Required on either the command-table packet or opened-room loop:

- `data-war-room-v1-command-table-room-handoff-opened-room-loop="<loop-id-or-none>"`
- `data-war-room-v1-opened-room-decision-loop-command-table-linked="true"`
- `data-war-room-v1-opened-room-decision-loop-command-table-packet-count="<number>"`

### 5.4 Closed inspector/source counts

Required on a closed-by-default details/inspector area:

- `data-war-room-v1-opened-room-decision-loop-inspector-hidden-by-default="true"`
- `data-war-room-v1-opened-room-decision-loop-source-task-count="<number>"`
- `data-war-room-v1-opened-room-decision-loop-source-action-count="<number>"`
- `data-war-room-v1-opened-room-decision-loop-source-evidence-count="<number>"`
- `data-war-room-v1-opened-room-decision-loop-raw-evidence="closed-by-default"`
- `data-war-room-v1-opened-room-decision-loop-no-mutation="true"`

Rules:

- Inspector open/close may only toggle native `<details>` or local React UI disclosure state.
- No fetch, POST, PATCH, DELETE, connector call, external write, account check, credential access, or Kanban mutation can be attached to inspector open/close.

## 6. Visual hierarchy and UX rules

The product target remains a high-quality pixelated top-down/isometric historical war room and strategy/RPG command map, not flat SaaS cards, glassmorphism, or a debug proof wall.

### Grid-first rules

1. `/war-room` and `/war-room?v1=1` must still begin in the equal/symmetric room-grid-first state.
2. Room cells must remain comparable in size/weight; no selected-room dashboard can dominate the closed grid.
3. Opening a room can reveal the decision loop, but must keep a clear Back-to-grid path and compact full-room controls.
4. The command table remains central/symbolic; the opened-room loop is the room-native reflection of the sealed packet, not a separate admin dashboard.
5. Debug/proof/evidence/source ids remain hidden in inspectors/disclosures by default.

### Opened-room decision loop presentation

The visible loop should read like a sealed room command/control strip:

- title: `Decision loop locked`, `Room decision seal`, or room-native equivalent;
- room label and source packet status;
- one-line local summary with draft/locked counts;
- disabled/read-only choice chips, e.g. `Inspect local draft`, `DLV required`, `Keep locked`;
- one no-live safety line such as `local-only decision loop · no live connector`;
- hidden inspector for task/action/evidence counts.

Allowed copy examples:

- `Forge decision loop locked · 2 local draft items · no live connector`
- `Treasury packet needs DLV approval before any commerce/account action`
- `Command-table packet linked · read-only evidence · externalMutation=false`
- `Harbor supplier controls locked · shops/suppliers NOT_CONNECTED`

Forbidden visible first-read copy unless explicitly negated as disabled/locked/no-live:

- live enabled
- connected
- execute
- publish
- buy
- send
- refund
- renew
- paid
- generate
- sync account
- approve now
- supplier action
- shop write
- ShotLab run
- API call
- release-ready
- final product

## 7. Implementation gates

Every implementation based on this contract must run and report real output from:

```bash
NODE_ENV=test pnpm gate:war-room-v1
pnpm typecheck
pnpm build
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-command-table-handoff.test.tsx
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-room-specific-controls.test.tsx
```

If a new focused test is created, also run:

```bash
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-opened-room-decision-loop.test.tsx
```

Static no-live scanner required for reviewer, adjusted to actual changed files:

```bash
python3 - <<'PY'
from pathlib import Path
files = [
  'src/screens/war-room/v1/WarRoomV1.tsx',
  'src/screens/war-room/v1/WarRoomV1FullRoomView.tsx',
  'src/screens/war-room/v1/WarRoomV1CommandTable.tsx',
  'src/screens/war-room/v1/WarRoomV1ReviewLoop.tsx',
  'src/screens/war-room/v1/war-room-v1-types.ts',
  'src/screens/war-room/v1/war-room-v1-state.ts',
]
unsafe = []
for file in files:
    p = Path(file)
    if not p.exists():
        continue
    s = p.read_text()
    needles = [
        'liveEnabled: true',
        'externalMutation: true',
        'credentialsLoaded: true',
        'liveApiCallsEnabled: true',
        "executionMode: 'live'",
        'fetch(',
        'POST',
        'PATCH',
        'DELETE',
    ]
    for needle in needles:
        if needle in s:
            unsafe.append((file, needle))
print('safety_hits=', unsafe)
raise SystemExit(1 if unsafe else 0)
PY
```

Reviewer note: this scanner is intentionally narrow and must be paired with human inspection for unsafe UI copy, event handlers, imports, route/API edits, and overclaim language.

## 8. Browser/visual QA requirements

A later `visualqaagent` card must:

1. Start the app with the existing repo-approved dev server/test wrapper.
2. Visit `/war-room` and `/war-room?v1=1`.
3. Confirm HTTP 200, no console errors, no page errors, and no failed subresources that affect War Room.
4. Confirm initial state remains room-grid-first/equal/symmetric/minimal:
   - `data-war-room-v1-room-grid="room-grid-first"`
   - `data-war-room-v1-room-cell-layout="equal/symmetric"`
   - `data-war-room-v1-room-main-text-policy="minimal"`
5. Open at least `forge-hephaestus` and one decision/approval-adjacent room such as `treasury-commerce` or `olympus-command`.
6. Verify opened-room controls remain compact and room-native: local chat disabled, room tools read-only/draft-only, approval lock visible, connector lock `NOT_CONNECTED`, and inspectors closed by default.
7. Verify the command-table handoff packet still appears and remains compact.
8. Verify the opened-room decision loop exposes:
   - `data-war-room-v1-opened-room-decision-loop-root="true"`
   - `data-war-room-v1-opened-room-decision-loop-room`
   - `data-war-room-v1-opened-room-decision-loop-source-packet`
   - `data-war-room-v1-opened-room-decision-loop-status`
   - `data-war-room-v1-opened-room-decision-loop-target-station="central-command-table"`
   - `data-war-room-v1-opened-room-decision-loop-approval-station="approval-seal"`
   - `data-war-room-v1-opened-room-decision-loop-external-mutation="false"`
   - `data-war-room-v1-opened-room-decision-loop-live-enabled="false"`
   - `data-war-room-v1-opened-room-decision-choice-enabled="false"`
9. Verify raw source ids/evidence remain closed by default.
10. Verify no visible enabled live marketplace/shop/supplier/ShotLab/API/account controls.
11. Capture screenshots for the grid and each opened room on both routes.

## 9. Required test/gate additions for implementation

The implementation card should add or extend tests to assert:

1. Decision-loop types include `localOnly: true`, `externalMutation: false`, `liveEnabled: false`, `credentialsLoaded: false`, and `liveApiCallsEnabled: false`.
2. The opened-room decision loop deterministically maps room id, handoff packet id/status, approval station, command-table station, draft count, locked count, and evidence counts.
3. Status maps correctly for at least:
   - empty/no active packet;
   - local draft packet;
   - DLV-required packet;
   - blocked-forbidden packet;
   - connector lock `NOT_CONNECTED`.
4. Every decision choice is disabled and exposes `enabled=false`, `externalMutation=false`, and `liveEnabled=false` hooks.
5. The command-table handoff packet retains all required hooks from the previous contract.
6. The opened-room source exposes reciprocal linkage hooks to the command-table packet.
7. The grid-first hooks remain present: `data-war-room-v1-room-grid="room-grid-first"`, `data-war-room-v1-room-cell-layout="equal/symmetric"`, and `data-war-room-v1-room-main-text-policy="minimal"`.
8. Inspector/source evidence hooks are closed by default.
9. Regression gate checks are stricter after implementation, not weaker.
10. No enabled live-action buttons/links/handlers are added.

## 10. No-live/no-overclaim review checklist

The later `claudereviewer` card must answer these questions explicitly:

1. Did the implementation stay inside the allowed files?
2. Is the decision loop derived only from local/read-only room controls and the existing local handoff packet state?
3. Is the decision loop a view model only, with no executor, command bus, queue writer, Kanban write, approval mutation, route/API edit, or external adapter?
4. Are every decision choice/control disabled and non-mutating?
5. Are `localOnly=true`, `externalMutation=false`, `liveEnabled=false`, `credentialsLoaded=false`, and `liveApiCallsEnabled=false` enforced in types, state, DOM hooks, and visible copy?
6. Does connector state remain `NOT_CONNECTED`/locked, with no connected/live implication?
7. Do `/war-room` and `/war-room?v1=1` still start grid-first/equal/symmetric/minimal?
8. When a room opens, is the decision loop compact and diegetic, not a proof/debug wall?
9. Are raw task ids/source evidence/commands hidden in a closed inspector by default?
10. Does visible copy avoid overclaiming live, connected, approved, final, premium, release-ready, executable, or shop/supplier/ShotLab/API/account-ready state?
11. Did all required commands pass with real output: `NODE_ENV=test pnpm gate:war-room-v1`, `pnpm typecheck`, `pnpm build`, focused vitest, and static no-live scanner?
12. Did browser QA open at least two rooms on both `/war-room` and `/war-room?v1=1` and confirm no console/page errors?
13. Did static no-live/no-credential review report `safety_hits=[]` or all flagged strings are proven negative/disabled assertions?

## 11. Stop conditions for implementation and QA

Stop and block instead of continuing if any of these occur:

1. The decision loop cannot be implemented without editing files outside the allowlist.
2. The implementation needs credentials, tokens, browser login, provider config, account verification, or external network access.
3. Any live Etsy/shop/listing/order/message/refund/renewal/publish/ad/supplier/AliExpress/Alibaba/ShotLab/payment/account/API action becomes necessary.
4. The UI requires a live connector, live execution mode, account sync, approval mutation, or external mutation to appear useful.
5. The first viewport regresses from equal/symmetric room-grid-first into a debug/proof dashboard.
6. Raw proof/source ids/evidence cannot remain hidden by default.
7. The loop cannot maintain `externalMutation=false` and `liveEnabled=false`.
8. The local chat affordance cannot remain `enabled=false`.
9. Any disabled decision choice needs a real mutating click handler.
10. `NODE_ENV=test pnpm gate:war-room-v1`, `pnpm typecheck`, or `pnpm build` fails and cannot be fixed within the allowed scope.
11. Browser QA finds console/page errors, visible enabled live controls, or shop/supplier/ShotLab/API/account action affordances.

## 12. Recommended child chain after this architecture contract

The supervisor should create the next cards after this contract PASSes; this architecture card must not create them itself.

Recommended chain:

1. `codexintegrator` — implement opened-room decision/approval loop from sealed command-table packet.
   - Parent: this architecture card.
   - Scope: allowed War Room v1 source/test/gate files only.
   - Goal: the opened room shows a compact local-only decision loop linked to the sealed command-table packet, with all choices disabled/read-only and all live/external systems locked.
   - Required commands: `NODE_ENV=test pnpm gate:war-room-v1`, `pnpm typecheck`, `pnpm build`, focused vitest, static no-live scanner.
   - Must report changed files, hooks added/preserved, command output, no-live static probe, and safety line.
2. `visualqaagent` — browser QA for `/war-room` and `/war-room?v1=1`.
   - Open at least `forge-hephaestus` and `treasury-commerce` or `olympus-command`.
   - Verify grid-first/equal/symmetric/minimal UI, compact handoff packet, compact opened-room decision loop, closed inspectors, no console/page errors, and no live controls.
3. `claudereviewer` — no-live/no-overclaim review.
   - Run gates as appropriate and static no-live scanner.
   - Verify no credentials, live API, external mutation, approval mutation, release packaging, enabled decision action, or overclaim.
4. DLV approval gate remains blocked for any future live connector/action enablement.

## Exit verdict

PASS: BOOST post-command-table next-slice contract ready.

The next safe implementation is one bounded War Room v1 pass that reflects the existing sealed command-table room handoff packet back into the opened room as a compact disabled/read-only decision/approval loop. It must preserve equal/symmetric room-grid-first UI, keep raw evidence behind inspectors, add typed local-only loop state and DOM hooks, and maintain strict `NOT_CONNECTED`, `externalMutation=false`, `liveEnabled=false`, no credentials, and no live API invariants.
