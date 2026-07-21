# War Room BOOST room-native command deck contract

Status: PASS — architecture contract ready for one bounded opened-room room-native command deck implementation card
Owner lane: claudearchitect
Date: 2026-06-12
Scope: documentation/spec only. This card writes no source/runtime/test/script/public asset change, performs no browser/account/API call, does not touch credentials, does not create children, and does not mutate business systems.

Source documents and local files inspected first:

- `docs/status/vision/war-room-final-vision-live-spec.md`
- `docs/status/automation/war-room-boost-room-grid-commerce-infra-20260612.md`
- `docs/status/architecture/war-room-boost-post-command-table-next-slice-contract-20260612.md`
- `docs/status/qa/war-room-boost-opened-room-decision-loop-qa-20260612/report.md`
- `docs/status/reviews/war-room-boost-opened-room-decision-loop-safety-review-20260612.md`
- `src/screens/war-room/v1/WarRoomV1FullRoomView.tsx`
- `src/screens/war-room/v1/WarRoomV1RoomAgentLayer.tsx`
- `src/screens/war-room/v1/war-room-v1-state.ts`
- `src/screens/war-room/v1/war-room-v1-types.ts`
- `src/screens/war-room/v1/__tests__/war-room-v1-opened-room-decision-loop.test.tsx`

## Safety statement

Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED; only local disabled/dry-run/read-only infrastructure is allowed until DLV explicitly approves live enablement.

This contract does not authorize Etsy, shop, supplier, ShotLab, AliExpress, Alibaba, API, account, payment, listing, order, message, refund, renewal, ad, purchase, paid generation, live generation, release, git push, git merge, reset, clean, credential, browser-profile, provider-config, route/API, connector executor, command bus, or destructive DB/admin actions. It defines only a local disabled/read-only view-model and opened-room presentation layer that consolidates already-local room controls into a compact command surface.

## 1. Chosen next smallest slice

The next implementation should do exactly one thing:

Create a room-native command deck inside the opened full-room view that consolidates the existing local chat affordance, tool surface, approval/DLV lock, recent logs, connector lock, and the already-approved opened-room decision loop into one compact strategy-room command surface.

The command deck is not a new global dashboard and not a live command console. It is a diegetic opened-room control plaque/war-table strip that replaces the current scattered flat card feel in `WarRoomV1FullRoomView.tsx` while preserving all no-live invariants and existing room-grid-first behavior.

This is the smallest safe next step because:

1. The prior opened-room decision loop implementation and QA are terminal PASS/APPROVED.
2. Current `WarRoomV1FullRoomView.tsx` already has separate local room surfaces for tool, chat, draft queue, approval lock, connector lock, logs, hidden inspector, command handoff, and decision loop.
3. Product direction requires opened rooms to expose chat/tool/approval/log controls, but the first viewport must remain equal/symmetric room-grid-first with minimal visible text and visible agent units.
4. Consolidating those local controls into a typed command deck improves the strategy-room command surface without adding a connector, executor, route/API mutation, account check, credential read, Kanban writer, or live approval mechanism.
5. The slice can be verified by DOM hooks, focused tests, browser QA, and safety review using the existing War Room v1 gate pattern.

## 2. Scope boundaries

In scope for the follow-up implementation:

1. Add a local-only typed `WarRoomV1RoomCommandDeck*` model/view-model derived from existing `WarRoomV1RoomSpecificControlState`, `WarRoomV1OpenedRoomDecisionLoop`, and the current opened room metadata.
2. Render one compact room-native command deck inside the opened full-room view.
3. Consolidate these already-local surfaces inside the deck: chat, tools, draft queue summary, approval/DLV lock, recent logs summary, connector lock, opened-room decision loop linkage, and closed-by-default inspector/source counts.
4. Preserve all existing hooks for full-room view, room-specific controls, room-agent units, command-table handoff, opened-room decision loop, connector locks, hidden inspectors, grid-first layout, and safety false flags.
5. Keep command-deck visible copy minimal and diegetic: one title, one local/no-live safety line, short chips/plaques, and counts instead of raw IDs.
6. Add focused tests and regression-gate checks for deck hooks, disabled flags, no-live invariants, closed inspectors, and preservation of grid-first hooks.

Out of scope:

1. No real chat send, tool execution, approval, rejection, publish, execute, buy, refund, renewal, supplier, ShotLab, shop, API, account, payment, paid-generation, or external action.
2. No Kanban task creation/update/completion/blocking from UI.
3. No connector adapter, command bus, route/API endpoint, provider config, credential read, browser profile, local storage queue, network call, webhook, or background executor.
4. No room-grid redesign beyond opened-room command deck composition.
5. No generated art, god/model/station asset edits, final/premium asset claim, route default change, release packaging, public asset generation, or live connector enablement.
6. No child-card creation from this architecture card.

## 3. Allowed files for the follow-up implementation card

The follow-up implementation should be assigned to `codexintegrator`. Scope must stay inside this allowlist unless a later architecture card or explicit supervisor/DLV approval widens it.

### Allowed files

- `src/screens/war-room/v1/war-room-v1-types.ts`
  - Add local-only command deck types such as `WarRoomV1RoomCommandDeck`, `WarRoomV1RoomCommandDeckSection`, and `WarRoomV1RoomCommandDeckNoLiveFlags`.
  - Reuse existing room controls, connector lock, and opened-room decision-loop types where possible.
- `src/screens/war-room/v1/war-room-v1-state.ts`
  - Add one pure selector/build helper such as `buildWarRoomV1RoomCommandDeck(controls, decisionLoop)`.
  - Helper must derive only from existing local room-control state, opened-room decision-loop state, command handoff state, room cells, missions, action requests, evidence logs, connector locks, and existing local read-only data.
  - Keep deterministic: no DOM, timers, random values, fetches, local storage, browser APIs, mutation calls, direct Kanban DB reads, account checks, credentials, or external adapters.
- `src/screens/war-room/v1/WarRoomV1FullRoomView.tsx`
  - Render the compact `WarRoomV1RoomCommandDeck` inside the opened room.
  - Prefer replacing/scoping the visual layout of the existing scattered chat/tool/approval/log panels into one deck region, while preserving their existing hooks either on sub-sections or compatibility wrappers.
  - Keep the Back-to-grid affordance and opened-room agent/station context visible.
- `src/screens/war-room/v1/WarRoomV1.tsx`
  - Only if needed to pass the already-built command handoff/decision loop into the command deck or preserve route-level hooks.
  - No route/API or external connector changes.
- `src/screens/war-room/v1/__tests__/war-room-v1-opened-room-decision-loop.test.tsx`
  - Extend only if command deck assertions naturally sit with the opened-room decision-loop render test.
- Optional focused test: `src/screens/war-room/v1/__tests__/war-room-v1-room-command-deck.test.tsx`
  - Preferred if assertions become broad or need independent state-helper coverage.
- `src/screens/war-room/v1/__tests__/war-room-v1-room-specific-controls.test.tsx`
  - Extend only for compatibility hooks moved under the deck.
- `src/screens/war-room/v1/__tests__/war-room-v1-visual-hierarchy.test.tsx`
  - Extend only to prove grid-first/equal/symmetric/minimal first viewport is preserved.
- `scripts/war-room-v1-regression-gate.mjs`
  - Add static checks for command deck hooks and required no-live/default false flags.
  - Existing checks must not be weakened or deleted.

### Forbidden files and surfaces

Forbidden:

- Source code outside the allowed War Room v1 files above.
- Route/API files, write endpoints, connector executors, command buses, provider configs, package files, build/release scripts, browser profiles, credentials, keychain, `.env`, secrets, public assets, god/model/station assets, generated art, and unrelated screens.
- Any implementation, QA, release, connector-enable, or DLV approval child creation from this architecture card.
- Git push, merge, release, reset, clean, destructive cleanup, or destructive DB/admin operations.
- Etsy/shop/listing/order/message/refund/renewal/ad/supplier/AliExpress/Alibaba/ShotLab/payment/account/live generation actions.

Stop and block with `SCOPE_CREEP` if the implementation cannot be done inside the allowed files.

## 4. Typed model/view-model contract

The implementation should add the smallest coherent local-only model. Naming can be adjusted to match project style, but the fields and invariants below are required.

Suggested additions in `war-room-v1-types.ts`:

```ts
export type WarRoomV1RoomCommandDeckSectionKind =
  | 'chat'
  | 'tool'
  | 'draft-queue'
  | 'approval'
  | 'logs'
  | 'connector-lock'
  | 'decision-loop'
  | 'hidden-inspector'

export type WarRoomV1RoomCommandDeckSection = {
  id: string
  kind: WarRoomV1RoomCommandDeckSectionKind
  label: string
  summary: string
  count: number | null
  localOnly: true
  enabled: false
  externalMutation: false
  liveEnabled: false
}

export type WarRoomV1RoomCommandDeckNoLiveFlags = {
  localOnly: true
  connectorState: 'NOT_CONNECTED'
  credentialsLoaded: false
  externalMutation: false
  liveEnabled: false
  liveApiCallsEnabled: false
  chatEnabled: false
  toolExecutionEnabled: false
  approvalMutationEnabled: false
  logsMutationEnabled: false
  inspectorHiddenByDefault: true
  dlvApprovalRequiredForLiveEnablement: true
}

export type WarRoomV1RoomCommandDeck = {
  id: string
  sourceRoomId: string
  sourceRoomLabel: string
  activeUnitId: string | null
  activeStationId: WarRoomV1StationId | null
  sourceDecisionLoopId: string | null
  sourceHandoffPacketId: string | null
  layout: 'room-native-compact-deck'
  visualTone: 'historical-command-plaque'
  copyPolicy: 'minimal-first-read'
  sections: WarRoomV1RoomCommandDeckSection[]
  chat: {
    agentId: string
    label: string
    enabled: false
    mode: 'local-placeholder-only'
    externalMutation: false
    liveEnabled: false
  }
  tool: {
    selectedToolId: string
    label: string
    mode: WarRoomV1RoomControlSurfaceMode
    allowedReadOnlyActionCount: number
    lockedActionCount: number
    executionEnabled: false
    externalMutation: false
    liveEnabled: false
  }
  approval: {
    state: WarRoomV1RoomApprovalLockSummary['state']
    dlvApprovalRequired: boolean
    lockedActionCount: number
    mutationEnabled: false
    externalMutation: false
    liveEnabled: false
  }
  logs: {
    visibleLogCount: number
    rawEvidence: 'closed-by-default'
    mutationEnabled: false
    externalMutation: false
    liveEnabled: false
  }
  connectorLock: WarRoomV1RoomConnectorLockSummary & {
    connectorState: 'NOT_CONNECTED'
  }
  noLiveFlags: WarRoomV1RoomCommandDeckNoLiveFlags
}
```

Required derivation rules:

1. Build the deck only from existing local room control state plus the current opened-room decision loop and local handoff packet ids.
2. Deck `id` must be deterministic, e.g. `room-command-deck-${roomId}`.
3. `sourceDecisionLoopId` must equal `opened-room-decision-loop-${roomId}` when the decision loop exists; otherwise `null`.
4. `sourceHandoffPacketId` must equal the active room handoff packet id when one exists; otherwise `null`.
5. `sections` must include at least `chat`, `tool`, `approval`, `logs`, `connector-lock`, and `hidden-inspector`; it should include `draft-queue` and `decision-loop` when the source data exists.
6. Every section is display-only and must have `enabled=false`, `externalMutation=false`, and `liveEnabled=false`.
7. `connectorLock.connectorState` and `noLiveFlags.connectorState` must be forced to `NOT_CONNECTED` for this slice, even if some source summary contains a future readiness label.
8. `credentialsLoaded`, `externalMutation`, `liveEnabled`, `liveApiCallsEnabled`, `chatEnabled`, `toolExecutionEnabled`, `approvalMutationEnabled`, and `logsMutationEnabled` are always `false`.
9. `localOnly` is always `true`; `inspectorHiddenByDefault` is always `true`.
10. Raw task ids, action ids, evidence ids, commands, excerpts, and artifact paths may appear only in closed-by-default inspectors or count fields, not in first-read deck copy.
11. The deck is a view model only. It cannot create a real approval mutator, chat sender, tool executor, command bus, connector queue, Kanban writer, route/API call, external adapter, browser/account check, or credential loader.

## 5. Required DOM/data hooks

The implementation must preserve existing full-room, room-specific controls, command-table handoff, opened-room decision loop, room-agent, connector, and hidden-inspector hooks.

Add the hooks below.

### 5.1 Command deck root

Required on the compact opened-room command deck root:

- `data-war-room-v1-room-command-deck-root="true"`
- `data-war-room-v1-room-command-deck-room="<room-id>"`
- `data-war-room-v1-room-command-deck-id="room-command-deck-<room-id>"`
- `data-war-room-v1-room-command-deck-layout="room-native-compact-deck"`
- `data-war-room-v1-room-command-deck-source-decision-loop="<loop-id-or-none>"`
- `data-war-room-v1-room-command-deck-source-packet="<packet-id-or-none>"`
- `data-war-room-v1-room-command-deck-local-only="true"`
- `data-war-room-v1-room-command-deck-connector-lock-state="NOT_CONNECTED"`
- `data-war-room-v1-room-command-deck-credentials-loaded="false"`
- `data-war-room-v1-room-command-deck-external-mutation="false"`
- `data-war-room-v1-room-command-deck-live-enabled="false"`
- `data-war-room-v1-room-command-deck-live-api-calls-enabled="false"`
- `data-war-room-v1-room-command-deck-dlv-approval-required-for-live="true"`

Rules:

- The deck is visible only in opened-room context, never as a new first-viewport global dashboard.
- The first `/war-room` and `/war-room?v1=1` viewport must remain the equal/symmetric room grid with visible agent units and minimal text.
- The deck should be one compact plaque/war-table strip/command console integrated into the room, not a sprawling proof wall.

### 5.2 Chat section hooks

Required on the chat subsection:

- `data-war-room-v1-room-command-deck-chat="<agent-id-or-none>"`
- `data-war-room-v1-room-command-deck-chat-enabled="false"`
- `data-war-room-v1-room-command-deck-chat-mode="local-placeholder-only"`
- `data-war-room-v1-room-command-deck-chat-external-mutation="false"`
- `data-war-room-v1-room-command-deck-chat-live-enabled="false"`

Visible copy must say placeholder/local/disabled. No send box that implies a real message can be sent.

### 5.3 Tool section hooks

Required on the tool subsection:

- `data-war-room-v1-room-command-deck-tool="<tool-id-or-none>"`
- `data-war-room-v1-room-command-deck-tool-mode="read-only|draft-only"`
- `data-war-room-v1-room-command-deck-tool-execution-enabled="false"`
- `data-war-room-v1-room-command-deck-tool-external-mutation="false"`
- `data-war-room-v1-room-command-deck-tool-live-enabled="false"`
- `data-war-room-v1-room-command-deck-tool-read-only-action-count="<number>"`
- `data-war-room-v1-room-command-deck-tool-locked-action-count="<number>"`

Visible copy must use `read-only`, `draft-only`, `locked`, or `inspect` language; no execute/publish/sync/send/buy wording unless explicitly negated as disabled/no-live.

### 5.4 Approval section hooks

Required on the approval/DLV lock subsection:

- `data-war-room-v1-room-command-deck-approval="<room-id>"`
- `data-war-room-v1-room-command-deck-approval-state="not-required|review-required|dlv-required|blocked-forbidden"`
- `data-war-room-v1-room-command-deck-approval-dlv-required="true|false"`
- `data-war-room-v1-room-command-deck-approval-mutation-enabled="false"`
- `data-war-room-v1-room-command-deck-approval-external-mutation="false"`
- `data-war-room-v1-room-command-deck-approval-live-enabled="false"`
- `data-war-room-v1-room-command-deck-approval-locked-action-count="<number>"`

No approve/reject/live-enable click handler may be added. If a disclosure toggle exists, it can only reveal local read-only text/counts.

### 5.5 Logs section hooks

Required on the logs subsection:

- `data-war-room-v1-room-command-deck-logs="<room-id>"`
- `data-war-room-v1-room-command-deck-log-count="<number>"`
- `data-war-room-v1-room-command-deck-logs-raw-evidence="closed-by-default"`
- `data-war-room-v1-room-command-deck-logs-mutation-enabled="false"`
- `data-war-room-v1-room-command-deck-logs-external-mutation="false"`
- `data-war-room-v1-room-command-deck-logs-live-enabled="false"`

First-read log copy should summarize status/counts only. Raw IDs, commands, excerpts, and paths stay in the hidden inspector.

### 5.6 Connector lock hooks

Required on the connector lock subsection:

- `data-war-room-v1-room-command-deck-connector-lock="<room-id>"`
- `data-war-room-v1-room-command-deck-connector-lock-state="NOT_CONNECTED"`
- `data-war-room-v1-room-command-deck-connector-no-credentials="true"`
- `data-war-room-v1-room-command-deck-connector-no-live-api-calls="true"`
- `data-war-room-v1-room-command-deck-connector-live-enabled="false"`
- `data-war-room-v1-room-command-deck-connector-external-mutation="false"`

### 5.7 Hidden inspector hooks

Required on a closed-by-default inspector within or immediately after the deck:

- `data-war-room-v1-room-command-deck-hidden-inspector="true"`
- `data-war-room-v1-room-command-deck-inspector-hidden-by-default="true"`
- `data-war-room-v1-room-command-deck-inspector-source-task-count="<number>"`
- `data-war-room-v1-room-command-deck-inspector-source-action-count="<number>"`
- `data-war-room-v1-room-command-deck-inspector-source-evidence-count="<number>"`
- `data-war-room-v1-room-command-deck-inspector-raw-evidence="closed-by-default"`
- `data-war-room-v1-room-command-deck-inspector-no-mutation="true"`

Inspector open/close may only toggle native `<details>` or local React UI disclosure state. It cannot fetch, POST, PATCH, DELETE, execute, approve, send, sync, write Kanban, call connector code, access credentials, or touch external state.

### 5.8 No-live flag hooks

At root or visible safety strip, assert all no-live flags:

- `data-war-room-v1-room-command-deck-no-live-flags="true"`
- `data-war-room-v1-room-command-deck-not-connected="true"`
- `data-war-room-v1-room-command-deck-credentials-loaded="false"`
- `data-war-room-v1-room-command-deck-external-mutation="false"`
- `data-war-room-v1-room-command-deck-live-enabled="false"`
- `data-war-room-v1-room-command-deck-live-api-calls-enabled="false"`
- `data-war-room-v1-room-command-deck-chat-enabled="false"`
- `data-war-room-v1-room-command-deck-tool-execution-enabled="false"`
- `data-war-room-v1-room-command-deck-approval-mutation-enabled="false"`

## 6. Visual hierarchy and UX rules

The product target remains a high-quality pixelated top-down/isometric historical war room and strategy/RPG command map, not flat SaaS cards, glassmorphism, or a debug proof wall.

### Grid-first main viewport rules

1. `/war-room` and `/war-room?v1=1` must still begin in the room-grid-first state.
2. Room cells must remain equal/symmetric and comparable in size/weight.
3. Closed room cells must show agents/units/status through visual activity, not dense text cards.
4. Minimal first-read text must be preserved through hooks such as `data-war-room-v1-room-main-text-policy="minimal"`.
5. Click-to-open full room remains the interaction model; hidden inspectors stay hidden by default.
6. The command deck must not appear as a global first-viewport dashboard or push the grid out of the first-read composition.

### Opened-room command deck presentation

The visible deck should read like a room-native command surface: a table plaque, strategy scroll, brass control strip, or similar historical command element.

Required presentation qualities:

- compact: one deck region, not seven stacked SaaS cards;
- room-native: visually attached to the opened room, station, and agent context;
- minimal copy: title, short summary, safety line, and concise chips/counts;
- agent-aware: active unit/station context remains visible nearby;
- decision-loop-aware: link to the existing local decision loop without duplicating a proof wall;
- no raw IDs in first-read view;
- no flat SaaS/glassmorphism drift where avoidable.

Allowed copy examples:

- `Room command deck locked · local only · NOT_CONNECTED`
- `Agent chat placeholder · tool surface read-only · DLV lock visible`
- `Decision loop linked · 2 locked actions · raw evidence closed`
- `Connector lock: no credentials · no live API calls`

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
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-opened-room-decision-loop.test.tsx
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-room-specific-controls.test.tsx
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-visual-hierarchy.test.tsx
```

If a new focused test is created, also run:

```bash
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-room-command-deck.test.tsx
```

Static no-live scanner required for reviewer, adjusted to actual changed files:

```bash
python3 - <<'PY'
from pathlib import Path
files = [
  'src/screens/war-room/v1/WarRoomV1.tsx',
  'src/screens/war-room/v1/WarRoomV1FullRoomView.tsx',
  'src/screens/war-room/v1/WarRoomV1CommandTable.tsx',
  'src/screens/war-room/v1/war-room-v1-types.ts',
  'src/screens/war-room/v1/war-room-v1-state.ts',
  'scripts/war-room-v1-regression-gate.mjs',
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
        'chatEnabled: true',
        'toolExecutionEnabled: true',
        'approvalMutationEnabled: true',
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

Reviewer note: this scanner is intentionally narrow and must be paired with human inspection for unsafe UI copy, event handlers, imports, route/API edits, hidden mutation paths, and overclaim language.

## 8. Browser/visual QA requirements

A later `visualqaagent` card must:

1. Start the app with the existing repo-approved dev server/test wrapper.
2. Visit `/war-room` and `/war-room?v1=1`.
3. Confirm HTTP 200, no console errors, no page errors, and no failed subresources that affect War Room.
4. Confirm initial state remains room-grid-first/equal/symmetric/minimal:
   - `data-war-room-v1-room-grid="room-grid-first"`
   - `data-war-room-v1-room-cell-layout="equal/symmetric"`
   - `data-war-room-v1-room-main-text-policy="minimal"`
5. Confirm closed room cells still show visible agents/units/status, not dense text cards.
6. Open at least `forge-hephaestus` and one decision/approval-adjacent room such as `treasury-commerce` or `olympus-command`.
7. Verify opened-room command deck exposes:
   - `data-war-room-v1-room-command-deck-root="true"`
   - `data-war-room-v1-room-command-deck-room`
   - `data-war-room-v1-room-command-deck-layout="room-native-compact-deck"`
   - `data-war-room-v1-room-command-deck-source-decision-loop`
   - `data-war-room-v1-room-command-deck-source-packet`
   - `data-war-room-v1-room-command-deck-connector-lock-state="NOT_CONNECTED"`
   - `data-war-room-v1-room-command-deck-credentials-loaded="false"`
   - `data-war-room-v1-room-command-deck-external-mutation="false"`
   - `data-war-room-v1-room-command-deck-live-enabled="false"`
   - `data-war-room-v1-room-command-deck-live-api-calls-enabled="false"`
8. Verify the deck has separate chat, tool, approval, logs, connector lock, and hidden-inspector hooks.
9. Verify chat/tool/approval/log controls are disabled/read-only/draft-only and compact, not enabled live actions.
10. Verify existing opened-room decision-loop hooks still exist and remain local-only/disabled.
11. Verify raw source ids/evidence remain closed by default.
12. Verify no visible enabled live marketplace/shop/supplier/ShotLab/API/account controls.
13. Capture screenshots for the grid and each opened room on both routes.

## 9. Required test/gate additions for implementation

The implementation card should add or extend tests to assert:

1. Command deck types include `localOnly: true`, `connectorState: 'NOT_CONNECTED'`, `credentialsLoaded: false`, `externalMutation: false`, `liveEnabled: false`, and `liveApiCallsEnabled: false`.
2. The deck deterministically maps room id, active unit/station, source decision loop id, source packet id, chat agent, tool mode, approval state, log counts, locked counts, and closed inspector counts.
3. The command deck root exposes `data-war-room-v1-room-command-deck-root="true"` and all required no-live hooks.
4. Separate chat/tool/approval/logs/connector/inspector sections expose their own hooks.
5. Every deck section is disabled/non-mutating and exposes `enabled=false`, `externalMutation=false`, and `liveEnabled=false` where applicable.
6. The opened-room decision loop keeps all prior hooks and remains visible/linked where applicable.
7. Existing room-specific controls hooks are preserved after consolidation so prior QA/review checks do not regress.
8. The grid-first hooks remain present: `data-war-room-v1-room-grid="room-grid-first"`, `data-war-room-v1-room-cell-layout="equal/symmetric"`, and `data-war-room-v1-room-main-text-policy="minimal"`.
9. Inspector/source evidence hooks are closed by default.
10. Regression gate checks are stricter after implementation, not weaker.
11. No enabled live-action buttons/links/handlers are added.

## 10. No-live/no-overclaim review checklist

The later `claudereviewer` card must answer these questions explicitly:

1. Did the implementation stay inside the allowed files?
2. Is the command deck derived only from local/read-only room controls, the existing opened-room decision loop, and local handoff packet state?
3. Is the command deck a view model/presentation only, with no executor, command bus, queue writer, Kanban write, approval mutation, chat sender, tool execution, route/API edit, or external adapter?
4. Are chat, tool, approval, log, connector, and inspector controls disabled/read-only/non-mutating?
5. Are `NOT_CONNECTED`, `localOnly=true`, `credentialsLoaded=false`, `externalMutation=false`, `liveEnabled=false`, and `liveApiCallsEnabled=false` enforced in types, state, DOM hooks, and visible copy?
6. Does connector state remain `NOT_CONNECTED`/locked, with no connected/live implication?
7. Do `/war-room` and `/war-room?v1=1` still start grid-first/equal/symmetric/minimal with visible agents/units?
8. When a room opens, is the command deck compact and diegetic, not a flat card stack or proof/debug wall?
9. Are raw task ids/source evidence/commands/artifact paths hidden in a closed inspector by default?
10. Does visible copy avoid overclaiming live, connected, approved, final, premium, release-ready, executable, chat-ready, shop-ready, supplier-ready, ShotLab-ready, API-ready, or account-ready state?
11. Did all required commands pass with real output: `NODE_ENV=test pnpm gate:war-room-v1`, `pnpm typecheck`, `pnpm build`, focused vitest, visual-hierarchy tests, and static no-live scanner?
12. Did browser QA open at least two rooms on both `/war-room` and `/war-room?v1=1` and confirm no console/page errors?
13. Did static no-live/no-credential review report `safety_hits=[]` or all flagged strings are proven negative/disabled assertions?

## 11. Stop conditions for implementation and QA

Stop and block instead of continuing if any of these occur:

1. The command deck cannot be implemented without editing files outside the allowlist.
2. The implementation needs credentials, tokens, browser login, provider config, account verification, external network access, or route/API changes.
3. Any live Etsy/shop/listing/order/message/refund/renewal/publish/ad/supplier/AliExpress/Alibaba/ShotLab/payment/account/API action becomes necessary.
4. The UI requires a live connector, live execution mode, real chat sender, real tool executor, account sync, approval mutation, or external mutation to appear useful.
5. The first viewport regresses from equal/symmetric room-grid-first into a command-deck/debug/proof dashboard.
6. Closed room cells lose visible agents/units/status or become dense text cards.
7. Raw proof/source ids/evidence cannot remain hidden by default.
8. The deck cannot maintain `NOT_CONNECTED`, `credentialsLoaded=false`, `externalMutation=false`, `liveEnabled=false`, and `liveApiCallsEnabled=false`.
9. Any disabled deck section needs a real mutating click handler.
10. `NODE_ENV=test pnpm gate:war-room-v1`, `pnpm typecheck`, or `pnpm build` fails and cannot be fixed within the allowed scope.
11. Browser QA finds console/page errors, visible enabled live controls, or shop/supplier/ShotLab/API/account action affordances.

## 12. Recommended child chain after this architecture contract

The supervisor should create the next cards after this contract PASSes; this architecture card must not create them itself.

Recommended chain:

1. `codexintegrator` — implement opened-room room-native command deck.
   - Parent: this architecture card.
   - Scope: allowed War Room v1 source/test/gate files only.
   - Goal: opened full-room view shows a compact local-only command deck consolidating chat/tool/approval/log/connector/decision-loop controls, with all controls disabled/read-only and all live/external systems locked.
   - Required commands: `NODE_ENV=test pnpm gate:war-room-v1`, `pnpm typecheck`, `pnpm build`, focused vitest, visual-hierarchy test, static no-live scanner.
   - Must report changed files, hooks added/preserved, command output, no-live static probe, and safety line.
2. `visualqaagent` — browser QA for `/war-room` and `/war-room?v1=1`.
   - Open at least `forge-hephaestus` and `treasury-commerce` or `olympus-command`.
   - Verify grid-first/equal/symmetric/minimal UI, visible room agents/units, compact opened-room command deck, preserved decision loop, closed inspectors, no console/page errors, and no live controls.
3. `claudereviewer` — no-live/no-overclaim review.
   - Run gates as appropriate and static no-live scanner.
   - Verify no credentials, live API, external mutation, approval mutation, chat send, tool execution, release packaging, enabled decision action, or overclaim.
4. DLV approval gate remains blocked for any future live connector/action enablement.

## Exit verdict

PASS: BOOST room-native command deck contract ready.

The next safe implementation is one bounded War Room v1 pass that consolidates already-local opened-room controls into a compact room-native command deck. It must preserve the first-viewport equal/symmetric room-grid-first UI, visible agents/units, hidden inspectors, minimal copy, and strict `NOT_CONNECTED`, `credentialsLoaded=false`, `externalMutation=false`, `liveEnabled=false`, `liveApiCallsEnabled=false`, disabled/dry-run/read-only invariants.
