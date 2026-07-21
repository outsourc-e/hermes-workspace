# War Room BOOST room-specific full-room controls contract

Status: PASS — architecture contract ready for a bounded room-specific full-room controls implementation card
Owner lane: claudearchitect
Date: 2026-06-12
Scope: documentation/spec only. This card creates no source/runtime/test/script/public asset change, performs no image generation, does not touch credentials, does not call external APIs, does not package a release, and does not mutate business systems.

Source documents and files inspected first:

- `docs/status/architecture/war-room-boost-room-agent-activity-contract-20260612.md`
- `docs/status/implementation/war-room-boost-room-agent-activity-20260612.md`
- `docs/status/qa/war-room-boost-room-agent-activity-rerun-t_4037b5f2-20260612.md`
- `src/screens/war-room/v1/WarRoomV1.tsx`
- `src/screens/war-room/v1/WarRoomV1FullRoomView.tsx`
- `src/screens/war-room/v1/WarRoomV1RoomAgentLayer.tsx`
- `src/screens/war-room/v1/war-room-v1-types.ts`
- `src/screens/war-room/v1/war-room-v1-state.ts`
- `src/screens/war-room/v1/__tests__/war-room-v1-room-agent-activity.test.tsx`
- `scripts/war-room-v1-regression-gate.mjs`

## Safety statement

Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED; only local disabled/dry-run/read-only infrastructure is allowed until DLV explicitly approves live enablement.

This contract does not authorize Etsy, shops, suppliers, ShotLab, AliExpress, Alibaba, API, account, payment, listing, order, message, refund, renewal, ad, purchase, live generation, release, git push, git merge, reset, clean, credential, browser-profile, provider-config, or destructive DB/admin actions. It defines only a local React room-specific controls layer for an already opened War Room v1 room.

The follow-up implementation must preserve the existing Safety Spine:

- connector lock state defaults to `NOT_CONNECTED`;
- connector execution is disabled or draft-only local UI, never live;
- credentials are not loaded;
- live API calls are not enabled;
- `externalMutation=false` for the draft action queue and room control state;
- DLV approval is required before any non-local action can become executable.

## 1. Current-state gap summary

The previous BOOST chain passed the room-grid + room-agent activity checkpoint:

1. `/war-room` and `/war-room?v1=1` render a clean equal/symmetric room-grid-first main surface.
2. The grid has deterministic small room-agent units rather than bare letter markers.
3. Clicking a room opens a compact read-only full-room panel with active unit, station, disabled chat placeholder, tools/locks, approvals, logs, and hidden inspector hooks.
4. Browser QA opened multiple rooms and verified no console/page errors, hidden inspector closed by default, read-only tooling, connector locks, and no live-write controls.

Remaining product gap for the next BOOST sprint:

1. `WarRoomV1FullRoomView.tsx` is still mostly a generic proof/debug panel made from repeated text cards: working station, agent chat, tools/locks, approvals, logs. It is safe, but not yet room-native.
2. The opened room should feel different per room: Olympus Command should emphasize routing/mission controls; Pantheon Quarters should emphasize roster/assignment; Forge should emphasize draft workbench; Atlantis Vault should emphasize archive/evidence; Treasury should emphasize approvals/locks.
3. The controls must answer at first glance: who is active, which station/tool is selected, what can be inspected locally, what draft-only action is queued, what is locked, what needs DLV, and where raw evidence lives.
4. The UI must not regress into a command console or proof wall. Raw task ids, raw evidence excerpts, lifecycle trails, source ids, and debug scanner output belong in the hidden inspector/disclosure only.
5. The new controls must remain local and draft-only. Room-specific does not mean live connected.

## 2. Allowed files for the follow-up implementation card

The follow-up implementation should be assigned to `codexintegrator`. Scope must stay inside the allowlist below unless a later architecture card or explicit supervisor/DLV approval widens it.

### Allowed files

- `src/screens/war-room/v1/WarRoomV1FullRoomView.tsx`
  - Primary implementation surface. Replace the four generic text panels with a compact room-specific controls composition.
  - Add/preserve full-room root hooks, active room hooks, room-specific controls root, tool surface, draft queue, approval lock, connector lock, logs, and hidden inspector references.
- `src/screens/war-room/v1/WarRoomV1RoomAgentLayer.tsx` only if opened-room active unit selection needs alignment with the grid unit selection.
  - Do not add new live feed behavior; keep deterministic read-only activity mapping.
- `src/screens/war-room/v1/war-room-v1-types.ts`
  - Add typed local-only control models described in this contract.
- `src/screens/war-room/v1/war-room-v1-state.ts` only for typed local/draft-only control state or selectors derived from existing `WarRoomV1MissionVisual`, `WarRoomV1RoomCell`, action requests, evidence logs, and connector lock summaries.
  - Do not create a live command executor or external mutation state.
- `src/screens/war-room/v1/__tests__/war-room-v1-room-agent-activity.test.tsx`
  - May be extended only if the existing focused test is the smallest place to assert the stricter hooks.
- New focused test only if useful: `src/screens/war-room/v1/__tests__/war-room-v1-room-specific-controls.test.tsx`
  - Preferred if adding enough coverage would make the existing activity test too broad.
- `scripts/war-room-v1-regression-gate.mjs` only to add stricter room-specific controls hooks/checks.
  - Existing checks must not be weakened or deleted.

### Forbidden files and surfaces

Forbidden:

- Source code outside the allowed War Room v1 files above.
- Route/API files, external adapters, connector executors, provider configs, package files, build/release scripts, browser profiles, credentials, keychain, `.env`, secrets, public assets, god/model/station assets, and unrelated screens.
- Any implementation, QA, release, or connector-enable child creation from this architecture card.
- Git push, merge, release, reset, clean, destructive cleanup, or destructive DB/admin operations.
- Etsy/shop/listing/order/message/refund/renewal/ad/supplier/AliExpress/Alibaba/ShotLab/payment/account/live generation actions.

Stop and block if the implementation needs any forbidden file or live/external action.

## 3. Typed model contract

The implementation should add the smallest coherent model that keeps room-specific controls local, typed, and testable.

Suggested type additions in `war-room-v1-types.ts`:

```ts
export type WarRoomV1RoomControlSurfaceMode = 'read-only' | 'draft-only'

export type WarRoomV1RoomControlKind =
  | 'mission-routing'
  | 'roster-assignment'
  | 'opportunity-planning'
  | 'signal-inspection'
  | 'draft-workbench'
  | 'supplier-harbor-read-only'
  | 'archive-evidence'
  | 'approval-lock'
  | 'generic-local-inspection'

export type WarRoomV1RoomDraftActionStatus = 'empty' | 'drafted-local' | 'needs-review' | 'dlv-approval-required' | 'blocked-forbidden'

export type WarRoomV1RoomDraftAction = {
  id: string
  label: string
  targetSystem: 'local-war-room-ui'
  status: WarRoomV1RoomDraftActionStatus
  sourceTaskId: string | null
  sourceActionRequestId: string | null
  externalMutation: false
  liveEnabled: false
  dlvApprovalRequired: boolean
}

export type WarRoomV1RoomApprovalLockSummary = {
  state: 'not-required' | 'review-required' | 'dlv-required' | 'blocked-forbidden'
  dlvApprovalRequired: boolean
  reason: string
  lockedActionCount: number
  sourceActionRequestIds: string[]
}

export type WarRoomV1RoomConnectorLockSummary = {
  connectorState: 'NOT_CONNECTED' | 'READY_FOR_APPROVAL' | 'APPROVED_BUT_DISABLED'
  credentialsLoaded: false
  liveApiCallsEnabled: false
  liveEnabled: false
  externalMutation: false
  summaryLabel: string
}

export type WarRoomV1RoomSpecificControlState = {
  roomId: string
  roomLabel: string
  controlKind: WarRoomV1RoomControlKind
  activeUnitId: string | null
  activeUnitLabel: string
  activeStationId: WarRoomV1StationId | null
  activeStationLabel: string
  localChat: {
    agentId: string
    enabled: false
    placeholderOnly: true
    mode: 'local-placeholder-only'
  }
  toolSurface: {
    selectedToolId: string
    label: string
    mode: WarRoomV1RoomControlSurfaceMode
    allowedReadOnlyActionIds: string[]
    lockedActionIds: string[]
    liveEnabled: false
  }
  draftActionQueue: {
    count: number
    externalMutation: false
    liveEnabled: false
    actions: WarRoomV1RoomDraftAction[]
  }
  approvalLock: WarRoomV1RoomApprovalLockSummary
  recentLogs: WarRoomV1EvidenceLogEntry[]
  connectorLock: WarRoomV1RoomConnectorLockSummary
  inspector: {
    hiddenByDefault: true
    sourceTaskIds: string[]
    sourceActionRequestIds: string[]
    sourceEvidenceIds: string[]
  }
}
```

Mapping rules:

1. Build `WarRoomV1RoomSpecificControlState` from the existing `WarRoomV1FullRoomActivityView`, active room, room cells, active missions, action requests, evidence logs, and connector lock summary.
2. `controlKind` maps by room id:
   - `olympus-command` -> `mission-routing`
   - `pantheon-quarters` -> `roster-assignment`
   - `agora-opportunity` -> `opportunity-planning`
   - `oracle-signals` -> `signal-inspection`
   - `forge-hephaestus` -> `draft-workbench`
   - `merchant-harbor` -> `supplier-harbor-read-only`
   - `atlantis-vault` -> `archive-evidence`
   - `treasury-commerce` -> `approval-lock`
   - unknown fallback -> `generic-local-inspection`
3. `localChat.enabled` is always `false`; it is a visual/local placeholder only.
4. `toolSurface.mode` may be only `read-only` or `draft-only`. Use `draft-only` only for local UI drafts with no external side effect; otherwise use `read-only`.
5. `draftActionQueue.externalMutation` is always `false`. Every queued item must include `externalMutation: false` and `liveEnabled: false`.
6. Approval locks are summaries of existing action request risk/permission state; they do not grant execution.
7. Connector lock summary must normalize any unsafe or unexpected state back to NOT_CONNECTED/disabled in the UI.
8. Hidden inspector source ids can include task ids, action request ids, gate evidence ids, and source evidence ids, but those ids are not shown in the first-read controls.

## 4. Stable DOM/data hooks contract

The implementation must preserve existing hooks and add the stricter room-specific hooks below.

### 4.1 Full-room root and active room id

Required:

- `data-war-room-v1-full-room-view="<room-id>"`
- `data-war-room-v1-active-room-id="<room-id>"`
- `data-war-room-v1-full-room-active-unit="<unit-id-or-none>"`
- `data-war-room-v1-full-room-active-station="<station-id-or-none>"`
- `data-war-room-v1-room-specific-controls="<room-id>"`
- `data-war-room-v1-room-specific-controls-kind="mission-routing|roster-assignment|opportunity-planning|signal-inspection|draft-workbench|supplier-harbor-read-only|archive-evidence|approval-lock|generic-local-inspection"`

### 4.2 Active unit and active station

Required:

- `data-war-room-v1-room-active-unit="<unit-id-or-none>"`
- `data-war-room-v1-room-active-unit-role="<role-or-none>"`
- `data-war-room-v1-room-active-station="<station-id-or-none>"`
- `data-war-room-v1-room-active-station-label="<short-label-or-none>"`

Rules:

- These hooks must match the active unit/station shown in the first-read controls.
- Do not expose raw task title or raw evidence excerpt in these hooks.

### 4.3 Local chat placeholder

Required:

- `data-war-room-v1-room-chat="<agent-id-or-none>"`
- `data-war-room-v1-room-chat-enabled="false"`
- `data-war-room-v1-room-chat-mode="local-placeholder-only"`
- Existing `data-war-room-v1-full-room-chat-enabled="false"` must remain.

Rules:

- Chat copy must say disabled/local placeholder only.
- No model call, messaging platform call, agent spawn, or external account connection is implied.

### 4.4 Room tool/station control surface

Required:

- `data-war-room-v1-room-tool-surface="<room-id>"`
- `data-war-room-v1-room-tool-surface-kind="<control-kind>"`
- `data-war-room-v1-room-tool-surface-mode="read-only|draft-only"`
- `data-war-room-v1-room-tool-surface-active-station="<station-id-or-none>"`
- `data-war-room-v1-room-tool-surface-live-enabled="false"`
- Preserve `data-war-room-v1-working-station`, `data-war-room-v1-working-station-state`, `data-war-room-v1-working-station-active-unit`, `data-war-room-v1-working-station-active-task`, `data-war-room-v1-working-station-execution-mode`, and `data-war-room-v1-working-station-live-enabled="false"`.

Rules:

- The tool surface is a compact local control strip, not a table of raw evidence.
- Valid modes are only `read-only` and `draft-only`.
- No button may use copy such as publish, buy, send, refund, renew, paid, generate, execute live, connect, sync account, or approve live.

### 4.5 Draft action queue

Required:

- `data-war-room-v1-room-draft-action-queue="<room-id>"`
- `data-war-room-v1-room-draft-action-queue-count="<number>"`
- `data-war-room-v1-room-draft-action-queue-external-mutation="false"`
- `data-war-room-v1-room-draft-action-queue-live-enabled="false"`
- `data-war-room-v1-room-draft-action="<draft-id>"` on each visible draft chip/item, if any.
- Each visible draft item must expose either `data-war-room-v1-room-draft-action-status="empty|drafted-local|needs-review|dlv-approval-required|blocked-forbidden"` or be absent when the queue is empty.

Rules:

- The queue represents local draft-only intent, not executable commands.
- Empty queue is acceptable; the root still needs count `0`.
- The required invariant is `externalMutation=false`.
- The implementation must not introduce external mutation, write, connector, or account code paths.

### 4.6 Approval / decision lock

Required:

- `data-war-room-v1-room-approval-lock="<room-id>"`
- `data-war-room-v1-room-approval-lock-state="not-required|review-required|dlv-required|blocked-forbidden"`
- `data-war-room-v1-room-approval-dlv-required="true|false"`
- `data-war-room-v1-room-approval-locked-action-count="<number>"`
- Existing approval count hook `data-war-room-v1-full-room-approval-count="<number>"` must remain.

Rules:

- If any action request has a red/black risk, permission `dlv-approval-required`, or blocked-forbidden verdict, set `data-war-room-v1-room-approval-dlv-required="true"`.
- Copy must clearly say DLV approval is required before any external/live/business action.
- UI must not say approval has been granted unless a later explicit approval contract exists.

### 4.7 Recent logs

Required:

- `data-war-room-v1-room-recent-logs="<room-id>"`
- `data-war-room-v1-room-recent-log-count="<number>"`
- Existing `data-war-room-v1-full-room-log-count="<number>"` must remain.

Rules:

- First-read logs are short status summaries only.
- Raw commands, raw evidence excerpts, task ledgers, source ids, and lifecycle trails stay in the hidden inspector.

### 4.8 Connector lock summary

Required:

- `data-war-room-v1-room-connector-lock-summary="<room-id>"`
- `data-war-room-v1-room-connector-lock-state="NOT_CONNECTED|READY_FOR_APPROVAL|APPROVED_BUT_DISABLED"`
- `data-war-room-v1-room-connector-no-credentials="true"`
- `data-war-room-v1-room-connector-no-live-api-calls="true"`
- `data-war-room-v1-room-connector-live-enabled="false"`
- `data-war-room-v1-room-connector-external-mutation="false"`
- Preserve root connector hooks: `data-war-room-v1-connector-lock-state="NOT_CONNECTED"`, `data-war-room-v1-connector-no-credentials="true"`, `data-war-room-v1-connector-no-live-api-calls="true"`, and `data-war-room-v1-connector-live-enabled="false"`.

Rules:

- Default visual/copy state must say `NOT_CONNECTED`.
- No credentials, no live API calls, no live enabled controls, and no external mutation are allowed.

### 4.9 Hidden inspector source ids

Required:

- Existing `data-war-room-v1-room-inspector-hidden-by-default="true"` must remain.
- Existing `data-war-room-v1-hidden-inspector="room-agent-activity"` may remain, or the component may add a nested `data-war-room-v1-hidden-inspector="room-specific-controls"` if it is clearer.
- `data-war-room-v1-room-specific-inspector-hidden-by-default="true"`
- `data-war-room-v1-room-specific-inspector-source-task-count="<number>"`
- `data-war-room-v1-room-specific-inspector-source-action-count="<number>"`
- `data-war-room-v1-room-specific-inspector-raw-evidence="closed-by-default"`
- `data-war-room-v1-room-specific-inspector-no-mutation="true"`

Rules:

- Inspector is closed by default.
- Opening the inspector may only toggle local React UI state.
- No fetch, post, connector call, external write, account check, or credential access can be attached to inspector open/close.

## 5. UX requirements

The follow-up implementation must keep the room-grid-first product direction intact.

### Main viewport and grid preservation

1. `/war-room` and `/war-room?v1=1` must still start with the equal/symmetric room grid as the dominant surface.
2. Room cells must remain comparable in size and weight.
3. Room-agent units remain compact and secondary inside cells.
4. The opened room must not permanently replace or resize the grid unless the existing open-state interaction intentionally hides the grid and provides a clear Back-to-grid button.
5. No raw proof/task/evidence wall should appear above the grid.

### Opened full-room controls

The opened full-room view should be compact and room-specific, not a generic proof/debug wall. It should read like a room-native control bench with these first-read zones:

1. Header: room label, active unit, active station/tool, safety badge.
2. Room-specific control strip: room-native selected tool/station, mode `read-only|draft-only`, and what can be inspected locally.
3. Local agent chat placeholder: visible affordance, disabled, local-only, `enabled=false`.
4. Draft action queue: count, local draft chips if any, `externalMutation=false`, live disabled.
5. Approval/decision lock: DLV approval requirement and locked action count.
6. Recent logs: short status/gate summaries only.
7. Connector lock summary: NOT_CONNECTED, no credentials, no live API calls, live enabled false.
8. Hidden inspector: raw source ids/evidence hidden by default.

At first glance, the user must know:

- who is active;
- what station/tool is selected;
- what can be inspected locally;
- what is locked;
- what needs DLV;
- that no live connector/business/API/account action is implied.

### Room-native copy examples

These are examples, not mandatory exact copy:

- Olympus Command: "Route board state locally" / "Mission routing inspection".
- Pantheon Quarters: "Roster assignment view" / "Agent role and station only".
- Agora of Opportunity: "Planning lens" / "Opportunity notes are local drafts only".
- Oracle of Signals: "Signal inspection" / "Read-only signals; no external watch action".
- Forge of Hephaestus: "Draft workbench" / "Local draft queue; no publish/generate".
- Merchant Harbor: "Supplier harbor locked" / "Supplier/shop systems NOT_CONNECTED".
- Atlantis Vault: "Evidence vault" / "Recent proofs summarized; raw ids in inspector".
- Treasury of Commerce: "Approval lock" / "DLV required before any commerce/account action".

Forbidden copy in visible controls unless explicitly negated as disabled/locked: live enabled, connected, execute, publish, buy, send, refund, renew, paid, generate, sync account, approve now, supplier action, shop write, ShotLab run.

## 6. Verification stack for later implementation and QA cards

Every implementation based on this contract must run and report real output from:

```bash
NODE_ENV=test pnpm gate:war-room-v1
pnpm typecheck
pnpm build
```

Focused tests:

```bash
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-room-agent-activity.test.tsx
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-room-specific-controls.test.tsx
```

If the new focused room-specific controls test is not created, the implementation handoff must say which existing test and gate assert the same hooks.

Browser QA for the later `visualqaagent` card:

1. Start the app locally with the existing webapp-testing server wrapper or equivalent repo-approved command.
2. Visit `/war-room` and `/war-room?v1=1`.
3. Confirm HTTP 200, no console errors, no page errors, and no failed subresources that affect the War Room view.
4. Confirm the initial viewport remains the equal/symmetric room-grid-first surface.
5. Open at least two different rooms, including one room with an active unit if available and one commerce/approval-adjacent room such as `treasury-commerce` or `merchant-harbor`.
6. Verify required hooks:
   - `data-war-room-v1-room-specific-controls`
   - `data-war-room-v1-room-tool-surface`
   - `data-war-room-v1-room-draft-action-queue`
   - `data-war-room-v1-room-chat-enabled="false"`
   - `data-war-room-v1-room-approval-dlv-required`
   - `data-war-room-v1-room-connector-lock-state`
   - `data-war-room-v1-room-specific-inspector-hidden-by-default="true"`
7. Verify no visible enabled live/shop/supplier/ShotLab/API/account controls.
8. Verify raw proof/source ids remain hidden by default.

## 7. Required test/gate additions for the implementation card

The Codex implementation should add or extend tests to assert:

1. The contract hooks exist in source and/or rendered output:
   - `data-war-room-v1-room-specific-controls`
   - `data-war-room-v1-room-tool-surface`
   - `data-war-room-v1-room-draft-action-queue`
   - `data-war-room-v1-room-chat-enabled="false"`
   - `data-war-room-v1-room-draft-action-queue-external-mutation="false"`
   - `data-war-room-v1-room-connector-no-credentials="true"`
   - `data-war-room-v1-room-connector-no-live-api-calls="true"`
   - `data-war-room-v1-room-connector-live-enabled="false"`
2. The typed state never emits `externalMutation: true`, `liveEnabled: true`, `credentialsLoaded: true`, or `liveApiCallsEnabled: true`.
3. `toolSurface.mode` is limited to `read-only|draft-only`.
4. At least two room ids map to distinct `controlKind` values.
5. The hidden inspector is closed by default and exposes no mutation hook.
6. Existing room-agent activity hooks remain intact.
7. Existing `scripts/war-room-v1-regression-gate.mjs` checks are stricter after the implementation, not weaker.

## 8. Safety review questions for the later claudereviewer card

The later safety review must answer these questions explicitly:

1. Did the implementation stay inside the allowed files?
2. Does the opened full-room view now expose compact room-specific controls rather than four generic text/proof panels?
3. Does it preserve the equal/symmetric room-grid-first main viewport on `/war-room` and `/war-room?v1=1`?
4. Are local chat hooks present with `data-war-room-v1-room-chat-enabled="false"` and no model/messaging/external call?
5. Is `data-war-room-v1-room-tool-surface-mode` limited to `read-only|draft-only`?
6. Is the draft action queue local only, with count hook and `externalMutation=false`?
7. Does the approval lock state require DLV before any external/business/account action?
8. Are connector hooks still `NOT_CONNECTED`, no credentials, no live API calls, and live enabled false?
9. Are raw task ids/source evidence/commands hidden in the inspector by default?
10. Do visible controls avoid overclaiming that the system is live, connected, approved, final, premium, or executable?
11. Did all required commands pass with real output: `NODE_ENV=test pnpm gate:war-room-v1`, `pnpm typecheck`, `pnpm build`, and focused vitest?
12. Did browser QA open at least two rooms with no console/page errors?

Mandatory no-live scanner for reviewer:

- Scan only the scoped implementation files unless the implementation explicitly documents extra allowed files.
- Expect no credential/live/mutation literals that imply executable external behavior.
- Safer naming is allowed only when explicitly disabled/negated in the same model/hook/copy, e.g. `liveEnabled: false`, `data-...-live-enabled="false"`, `externalMutation: false`, `NOT_CONNECTED`, `noCredentials: true`, `noLiveApiCalls: true`.
- Flag any of these as blockers if reachable as enabled/executable behavior: `liveEnabled: true`, `externalMutation: true`, `credentialsLoaded: true`, `liveApiCallsEnabled: true`, connector live mode, POST/PATCH/DELETE/fetch mutation, publish/buy/send/refund/renew/paid/generate controls, account sync, shop/supplier/ShotLab execution, release packaging, git push/merge/reset/clean.

Suggested scanner command for review, adjusted to the exact changed file list:

```bash
python3 - <<'PY'
from pathlib import Path
files = [
  'src/screens/war-room/v1/WarRoomV1FullRoomView.tsx',
  'src/screens/war-room/v1/WarRoomV1RoomAgentLayer.tsx',
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
print('unsafe=', unsafe)
raise SystemExit(1 if unsafe else 0)
PY
```

Reviewer note: this scanner is intentionally narrow. It should be paired with human inspection for unsafe UI copy and any newly introduced event handler that implies live execution.

## 9. Stop conditions for implementation and QA

Stop and block instead of continuing if any of these occur:

1. The controls cannot be implemented without editing files outside the allowlist.
2. The implementation needs credentials, tokens, browser login, provider config, account verification, or external network access.
3. Any live Etsy/shop/listing/order/message/refund/renewal/publish/ad/supplier/AliExpress/Alibaba/ShotLab/payment/account/API action becomes necessary.
4. The UI requires a live connector, live execution mode, account sync, or external mutation to appear useful.
5. The first viewport regresses from equal/symmetric room-grid-first into a debug/proof dashboard.
6. Raw proof/source ids/evidence cannot remain hidden by default.
7. The draft queue cannot maintain `externalMutation=false`.
8. The local chat affordance cannot remain `enabled=false`.
9. `NODE_ENV=test pnpm gate:war-room-v1`, `pnpm typecheck`, or `pnpm build` fails and cannot be fixed within the allowed scope.
10. Browser QA finds console/page errors, visible enabled live controls, or shop/supplier/ShotLab/API/account action affordances.

## 10. Recommended child chain after this architecture contract

The supervisor should create the next cards after this contract PASSes; this architecture card must not create them itself.

Recommended chain:

1. `codexintegrator` — implement room-specific full-room controls.
   - Parent: this architecture card.
   - Scope: allowed War Room v1 source/test/gate files only.
   - Goal: opened room becomes compact and room-native with active agent, station/tool, local chat disabled, draft queue, approval lock, recent logs, connector lock summary, and hidden inspector.
   - Required commands: `NODE_ENV=test pnpm gate:war-room-v1`, `pnpm typecheck`, `pnpm build`, focused vitest.
   - Must report changed files, hooks added/preserved, command output, and safety line.
2. `visualqaagent` — browser QA for `/war-room` and `/war-room?v1=1`.
   - Open at least two rooms.
   - Verify room-specific controls, no debug wall, hidden inspector, no console/page errors, no live controls.
3. `claudereviewer` — safety/no-overclaim review.
   - Run gate/typecheck/build as appropriate and mandatory no-live scanner.
   - Verify no credentials, live API, external mutation, release packaging, or overclaim.
4. DLV approval gate remains blocked for any future live connector/action enablement.

## Exit verdict

PASS: BOOST room-specific full-room controls contract ready.

The next safe implementation is a bounded War Room v1 room-specific full-room controls pass centered on `WarRoomV1FullRoomView.tsx`, with typed local/draft-only control state, stable DOM hooks for active room/unit/station/chat/tool/draft queue/approval/connector/inspector, strict `NOT_CONNECTED` and `externalMutation=false` invariants, and no live Etsy/shop/supplier/ShotLab/API/account actions.
