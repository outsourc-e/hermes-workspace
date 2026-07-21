# War Room BOOST command-table draft handoff contract

Status: PASS — architecture contract ready for one bounded command-table draft handoff implementation card
Owner lane: claudearchitect
Date: 2026-06-12
Scope: documentation/spec only. This card writes no source/runtime/test/script/public asset change, performs no browser/account/API call, does not touch credentials, does not create children, and does not mutate business systems.

Source documents, Kanban evidence, and files inspected first:

- `docs/status/vision/war-room-final-vision-live-spec.md`
- `docs/status/automation/war-room-boost-room-grid-commerce-infra-20260612.md`
- `docs/status/architecture/war-room-boost-room-specific-controls-contract-20260612.md`
- `docs/status/architecture/war-room-v1-phase4-command-table-approvals-architecture.md`
- Kanban task `t_54e5af1f`: BOOST room-specific full-room controls implementation, completed/auto-reviewed; added local room controls and hooks.
- Kanban task `t_0607f50c`: fresh re-QA PASS on `/war-room` and `/war-room?v1=1`; opened `olympus-command` and `forge-hephaestus`; verified grid-first/equal/symmetric/minimal UI, closed inspectors, `NOT_CONNECTED`, no credentials, no live API calls, live enabled false, draft `externalMutation=false`, no console/page errors, and no enabled live/business controls.
- Kanban task `t_2a7e04da`: no-live/no-overclaim review APPROVED; bounded BOOST remediation only, not final/premium/release-ready product quality, no live connector/account/shop/API path.
- `src/screens/war-room/v1/WarRoomV1.tsx`
- `src/screens/war-room/v1/WarRoomV1FullRoomView.tsx`
- `src/screens/war-room/v1/WarRoomV1CommandTable.tsx`
- `src/screens/war-room/v1/war-room-v1-state.ts`
- `src/screens/war-room/v1/war-room-v1-types.ts`
- `src/screens/war-room/v1/__tests__/war-room-v1-command-table.test.tsx`
- `src/screens/war-room/v1/__tests__/war-room-v1-room-specific-controls.test.tsx`
- `scripts/war-room-v1-regression-gate.mjs`

## Safety statement

Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED; only local disabled/dry-run/read-only infrastructure is allowed until DLV explicitly approves live enablement.

This contract does not authorize Etsy, shop, supplier, ShotLab, AliExpress, Alibaba, API, account, payment, listing, order, message, refund, renewal, ad, purchase, live generation, release, git push, git merge, reset, clean, credential, browser-profile, provider-config, or destructive DB/admin actions. It defines only a local, disabled, read-only/draft-only UI bridge between opened room state and the central command table.

## 1. Current-state gap summary

The current BOOST chain already proves:

1. `/war-room` and `/war-room?v1=1` start from an equal/symmetric room-grid-first surface.
2. Opening a room shows compact room-specific local controls instead of a generic proof wall.
3. Room-local controls expose active room/unit/station, disabled local chat, read-only or draft-only tool surface, draft queue, approval lock, recent log summaries, connector lock, and a closed inspector.
4. Connector state normalizes to `NOT_CONNECTED`; credentials are absent; live API calls and live enabled state remain false; draft queues keep `externalMutation=false`.
5. Prior visual QA and safety review approved only the bounded local slice, not final product quality or live connector readiness.

Remaining product gap for the next BOOST slice:

1. The opened room's local draft/tool/approval state is not yet reflected as a sealed packet at the central command table.
2. `WarRoomV1CommandTable` currently renders command-table events derived from mission risk/review/blocker state, but it does not receive a compact room-local handoff packet from `WarRoomV1FullRoomView` / room-specific controls.
3. The user should feel that a room-local workbench creates a sealed command-room handoff: the packet rises to the central table as a compact, game/strategy-board flavored dossier, while raw source ids/evidence remain in closed inspectors.
4. The grid must remain the primary product surface. The command-table packet must be compact and diegetic, not a second dashboard, proof wall, or full-width command console.
5. The slice must stay local and disabled. Handoff does not mean send, execute, approve, publish, connect, dispatch, mutate, or call any external system.

## 2. Smallest bounded implementation slice

The next implementation should do exactly one thing:

Create a local-only `roomCommandHandoffPacket` model from the currently opened room's local controls and render one compact sealed packet on the central command table, proving that room draft/tool/approval state can hand off to the table without changing authority or connecting live systems.

In scope:

1. Add typed local handoff packet state derived from existing room-specific controls, action requests, connector locks, and command-table events.
2. Wire the active/opened room packet from `WarRoomV1` / `WarRoomV1FullRoomView` into `WarRoomV1CommandTable` or an adjacent command-table packet renderer.
3. Render at most one primary room handoff packet for this slice: the active/opened room, or an explicit empty/closed state when no room is open.
4. Preserve existing command-table mission events and existing hooks; add new hooks for room-handoff packet coverage.
5. Add focused tests/static gate checks for the packet model, hooks, and safety invariants.

Out of scope:

1. No multi-packet queue UI beyond a count/summary; no drag/drop; no animations that imply live dispatch.
2. No room-to-room routing, task creation, task completion, approval mutation, kanban write, connector execution, or external API call.
3. No source of truth beyond existing local read-only Kanban feed, room-specific controls, and current typed mission/action/request objects.
4. No visual redesign of the whole War Room, no public asset work, no final art claim, and no route/default-route/release work.
5. No creation of implementation, QA, release, or connector-enable child cards from this architecture card.

## 3. Allowed files for the follow-up implementation card

The follow-up implementation should be assigned to `codexintegrator`. Scope must stay inside this allowlist unless a later architecture card or explicit supervisor/DLV approval widens it.

### Allowed files

- `src/screens/war-room/v1/war-room-v1-types.ts`
  - Add local-only room command handoff packet types.
  - Extend existing command-table/room-control types only as needed for a disabled/read-only packet.
- `src/screens/war-room/v1/war-room-v1-state.ts`
  - Add pure selector/build helper only if packet derivation fits better near existing action request / command-table derivation.
  - Keep pure and deterministic: no DOM, timers, random values, fetches, local storage, browser APIs, mutation calls, direct Kanban DB reads, or credentials.
- `src/screens/war-room/v1/WarRoomV1FullRoomView.tsx`
  - Expose or build the opened room's local handoff packet from existing room-specific control state.
  - Preserve all room-specific controls hooks from the prior contract.
- `src/screens/war-room/v1/WarRoomV1CommandTable.tsx`
  - Accept and render compact local room handoff packet(s), preferably alongside existing command-table events.
  - Preserve existing command-table event hooks and read-only behavior.
- `src/screens/war-room/v1/WarRoomV1.tsx`
  - Wire active room/cells/missions to the handoff packet and pass it to the command table.
  - Preserve the equal/symmetric room grid, open-room behavior, active room id hook, connector root safety hooks, and hidden inspector behavior.
- `src/screens/war-room/v1/__tests__/war-room-v1-command-table.test.tsx`
  - Extend or add tests for room-handoff packet rendering, hooks, and no enabled live actions.
- `src/screens/war-room/v1/__tests__/war-room-v1-room-specific-controls.test.tsx`
  - Extend only if the packet state is sourced from full-room local controls and the existing static test remains the smallest useful coverage.
- Optional focused test: `src/screens/war-room/v1/__tests__/war-room-v1-command-table-handoff.test.tsx`
  - Preferred if combined tests become too broad.
- `scripts/war-room-v1-regression-gate.mjs`
  - Add static required-hook checks for command-table room handoff packet hooks and disabled/default false flags.
  - Existing checks must not be weakened or deleted.

### Forbidden files and surfaces

Forbidden:

- Source code outside the allowed War Room v1 files above.
- Route/API files, write endpoints, external adapters, connector executors, provider configs, package files, build/release scripts, browser profiles, credentials, keychain, `.env`, secrets, public assets, god/model/station assets, generated art, and unrelated screens.
- Any implementation, QA, release, or connector-enable child creation from this architecture card.
- Git push, merge, release, reset, clean, destructive cleanup, or destructive DB/admin operations.
- Etsy/shop/listing/order/message/refund/renewal/ad/supplier/AliExpress/Alibaba/ShotLab/payment/account/live generation actions.

Stop and block with `SCOPE_CREEP` if the implementation cannot be done inside the allowed files.

## 4. Typed model contract

The implementation should add the smallest coherent local-only model. Naming can be adjusted to match project style, but the fields and invariants below are required.

Suggested additions in `war-room-v1-types.ts`:

```ts
export type WarRoomV1CommandHandoffPacketStatus =
  | 'empty'
  | 'sealed-local-draft'
  | 'sealed-review-required'
  | 'sealed-dlv-required'
  | 'sealed-blocked-forbidden'

export type WarRoomV1CommandHandoffPacketKind =
  | 'room-draft-queue'
  | 'room-tool-surface'
  | 'room-approval-lock'
  | 'room-connector-lock'
  | 'room-log-summary'

export type WarRoomV1RoomCommandHandoffPacket = {
  id: string
  sourceRoomId: string
  sourceRoomLabel: string
  sourceControlKind: WarRoomV1RoomControlKind
  packetKind: WarRoomV1CommandHandoffPacketKind
  status: WarRoomV1CommandHandoffPacketStatus
  displayLabel: string
  summary: string
  activeUnitId: string | null
  activeStationId: WarRoomV1StationId | null
  draftActionCount: number
  lockedActionCount: number
  approvalState: WarRoomV1RoomApprovalLockSummary['state']
  connectorState: WarRoomV1RoomConnectorLockSummary['connectorState']
  targetCommandTableStationId: 'central-command-table'
  targetApprovalStationId: 'approval-seal'
  localOnly: true
  externalMutation: false
  liveEnabled: false
  credentialsLoaded: false
  liveApiCallsEnabled: false
  dlvApprovalRequired: boolean
  sourceTaskIds: string[]
  sourceActionRequestIds: string[]
  sourceEvidenceIds: string[]
  inspectorHiddenByDefault: true
}
```

Suggested containing shape if needed:

```ts
export type WarRoomV1CommandTableHandoffState = {
  activeRoomId: string | null
  activePacket: WarRoomV1RoomCommandHandoffPacket | null
  packetCount: number
  emptyReason: string | null
  localOnly: true
  externalMutation: false
  liveEnabled: false
}
```

Required derivation rules:

1. Build the packet only from existing local room control state, room cells, missions, action requests, evidence logs, connector lock summaries, and command-table events already present in the read-only UI.
2. Packet `id` must be deterministic, e.g. `room-command-handoff-${roomId}-${packetKind}` or include a stable source action id suffix.
3. Packet status maps from room approval/draft/connector state:
   - no room open or no draft/action/log/approval context -> `empty` state or no packet with an empty-root hook;
   - local draft queue exists with no DLV requirement -> `sealed-local-draft`;
   - review-required approval state -> `sealed-review-required`;
   - DLV-required approval state or red/high risk action request -> `sealed-dlv-required`;
   - blocked-forbidden approval state -> `sealed-blocked-forbidden`.
4. Packet `packetKind` should prefer the most important visible local room state in this order: approval lock, draft queue, tool surface, connector lock, log summary.
5. Packet target station is always `central-command-table`; approval target is always `approval-seal` when `dlvApprovalRequired=true`, otherwise still present as a locked seal reference, not an approval grant.
6. `localOnly` is always `true`.
7. `externalMutation`, `liveEnabled`, `credentialsLoaded`, and `liveApiCallsEnabled` are always `false`.
8. `connectorState` must normalize unsafe or unexpected states back to `NOT_CONNECTED` using the same strict policy as the current full-room connector summary.
9. Source ids can exist in data attributes/counts and hidden inspector details, but raw task ids/evidence excerpts must not become first-read packet copy.
10. The packet is a view model only; it cannot create an executor, command bus, queue writer, Kanban writer, approval mutation, or external adapter.

## 5. Required DOM/data hooks

The implementation must preserve all existing hooks from the command-table and room-specific controls contracts, and add the hooks below.

### 5.1 Command-table handoff root

Required on the command-table or adjacent central-table packet root:

- `data-war-room-v1-command-table-room-handoff-root="true"`
- `data-war-room-v1-command-table-room-handoff-active-room="<room-id-or-none>"`
- `data-war-room-v1-command-table-room-handoff-packet-count="<number>"`
- `data-war-room-v1-command-table-room-handoff-local-only="true"`
- `data-war-room-v1-command-table-room-handoff-external-mutation="false"`
- `data-war-room-v1-command-table-room-handoff-live-enabled="false"`

Rules:

- When no room is open, the root should still expose active room `none` and count `0`, or the test must prove the no-room closed state through an explicit equivalent hook.
- The root must not be hidden inside the raw evidence inspector if a room is open. It can be compact, but the active packet should be visible as a central command-table element.

### 5.2 Sealed room handoff packet

Required on each visible packet, if any:

- `data-war-room-v1-command-table-room-handoff-packet="<packet-id>"`
- `data-war-room-v1-command-table-room-handoff-source-room="<room-id>"`
- `data-war-room-v1-command-table-room-handoff-kind="room-draft-queue|room-tool-surface|room-approval-lock|room-connector-lock|room-log-summary"`
- `data-war-room-v1-command-table-room-handoff-status="empty|sealed-local-draft|sealed-review-required|sealed-dlv-required|sealed-blocked-forbidden"`
- `data-war-room-v1-command-table-room-handoff-target-station="central-command-table"`
- `data-war-room-v1-command-table-room-handoff-approval-station="approval-seal"`
- `data-war-room-v1-command-table-room-handoff-dlv-required="true|false"`
- `data-war-room-v1-command-table-room-handoff-local-only="true"`
- `data-war-room-v1-command-table-room-handoff-external-mutation="false"`
- `data-war-room-v1-command-table-room-handoff-live-enabled="false"`

Rules:

- Render as a sealed scroll/dossier/chip/plaque, not a raw table row.
- Copy must be short: room label, packet state, draft/lock count, and locked/no-live line.
- Do not show raw task ids, raw command output, raw evidence excerpts, or source ids in first-read packet copy.

### 5.3 Room-local source hooks preserved and linked

Required existing source hooks remain:

- `data-war-room-v1-room-specific-controls="<room-id>"`
- `data-war-room-v1-room-tool-surface="<room-id>"`
- `data-war-room-v1-room-draft-action-queue="<room-id>"`
- `data-war-room-v1-room-draft-action-queue-external-mutation="false"`
- `data-war-room-v1-room-approval-lock="<room-id>"`
- `data-war-room-v1-room-approval-dlv-required="true|false"`
- `data-war-room-v1-room-connector-lock-state="NOT_CONNECTED|READY_FOR_APPROVAL|APPROVED_BUT_DISABLED"`
- `data-war-room-v1-room-connector-no-credentials="true"`
- `data-war-room-v1-room-connector-no-live-api-calls="true"`
- `data-war-room-v1-room-connector-live-enabled="false"`

Required new linkage hooks, either on the full-room root or handoff packet:

- `data-war-room-v1-room-command-handoff-source="<room-id>"`
- `data-war-room-v1-room-command-handoff-packet-id="<packet-id-or-none>"`
- `data-war-room-v1-room-command-handoff-status="<status-or-empty>"`
- `data-war-room-v1-room-command-handoff-target="central-command-table"`
- `data-war-room-v1-room-command-handoff-local-only="true"`
- `data-war-room-v1-room-command-handoff-external-mutation="false"`

### 5.4 Handoff inspector/source counts

Required on a closed-by-default inspector/details area:

- `data-war-room-v1-command-table-room-handoff-inspector-hidden-by-default="true"`
- `data-war-room-v1-command-table-room-handoff-source-task-count="<number>"`
- `data-war-room-v1-command-table-room-handoff-source-action-count="<number>"`
- `data-war-room-v1-command-table-room-handoff-source-evidence-count="<number>"`
- `data-war-room-v1-command-table-room-handoff-raw-evidence="closed-by-default"`
- `data-war-room-v1-command-table-room-handoff-no-mutation="true"`

Rules:

- Inspector open/close may only toggle local React details state.
- No fetch, POST, PATCH, DELETE, connector call, external write, account check, or credential access can be attached to inspector open/close.

## 6. Visual hierarchy and UX rules

The product target is a serious, historical/pixel-strategy command room, not flat SaaS cards, glassmorphism, or a debug proof wall.

### Grid preservation

1. `/war-room` and `/war-room?v1=1` must still begin in the equal/symmetric room-grid-first state.
2. Room cells remain comparable size and weight; no room becomes a giant selected dashboard card in the closed grid state.
3. Opening a room can reveal full-room controls, but must keep a clear Back-to-grid path and must not permanently replace the War Room with a command-table console.
4. The command-table handoff packet is secondary to the grid and full-room context: compact, diegetic, and visually central, not sprawling.
5. No raw proof/task/evidence wall should appear above the grid or in the first-read command-table packet.

### Packet presentation

The visible packet should read like a sealed command-table handoff:

- title: `Room handoff sealed` or room-native equivalent;
- short room label and status;
- draft/locked counts;
- one no-live safety line such as `local packet only · no live connector`;
- compact seal/stamp for `DLV required` only when the room approval state requires it;
- hidden inspector for source ids/evidence counts.

Allowed copy examples:

- `Forge draft sealed to command table · 2 local draft items · externalMutation=false`
- `Treasury approval packet sealed · DLV required before any commerce/account action`
- `Olympus routing packet · read-only mission flow · no live execution`
- `Harbor lock packet · suppliers/shops NOT_CONNECTED`

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

## 7. Verification commands for the implementation card

Every implementation based on this contract must run and report real output from:

```bash
NODE_ENV=test pnpm gate:war-room-v1
pnpm typecheck
pnpm build
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-command-table.test.tsx
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-room-specific-controls.test.tsx
```

If a new focused test is created, also run:

```bash
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-command-table-handoff.test.tsx
```

Browser QA for a later `visualqaagent` card:

1. Start the app with the existing repo-approved dev server/test wrapper.
2. Visit `/war-room` and `/war-room?v1=1`.
3. Confirm HTTP 200, no console errors, no page errors, and no failed subresources that affect War Room.
4. Confirm initial state remains room-grid-first/equal/symmetric/minimal.
5. Open at least `forge-hephaestus` and `treasury-commerce` or `olympus-command`.
6. Verify the opened room still exposes room-specific controls.
7. Verify the central command table exposes:
   - `data-war-room-v1-command-table-room-handoff-root="true"`
   - `data-war-room-v1-command-table-room-handoff-active-room`
   - `data-war-room-v1-command-table-room-handoff-packet`
   - `data-war-room-v1-command-table-room-handoff-source-room`
   - `data-war-room-v1-command-table-room-handoff-status`
   - `data-war-room-v1-command-table-room-handoff-target-station="central-command-table"`
   - `data-war-room-v1-command-table-room-handoff-external-mutation="false"`
   - `data-war-room-v1-command-table-room-handoff-live-enabled="false"`
8. Verify raw source ids/evidence remain closed by default.
9. Verify no visible enabled live/shop/supplier/ShotLab/API/account controls.

Suggested static no-live probe for reviewer, adjusted to actual changed files:

```bash
python3 - <<'PY'
from pathlib import Path
files = [
  'src/screens/war-room/v1/WarRoomV1.tsx',
  'src/screens/war-room/v1/WarRoomV1FullRoomView.tsx',
  'src/screens/war-room/v1/WarRoomV1CommandTable.tsx',
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

Reviewer note: this scanner is intentionally narrow and must be paired with human inspection for unsafe UI copy or event handlers.

## 8. Required test/gate additions for implementation

The implementation card should add or extend tests to assert:

1. Handoff packet types include `localOnly: true`, `externalMutation: false`, `liveEnabled: false`, `credentialsLoaded: false`, and `liveApiCallsEnabled: false`.
2. The active room packet deterministically maps source room id, control kind, approval state, connector state, draft count, locked count, and target `central-command-table`.
3. Packet status maps correctly for at least:
   - empty/no active room;
   - local draft queue;
   - DLV-required approval lock;
   - connector lock `NOT_CONNECTED`.
4. `WarRoomV1CommandTable` preserves existing event hooks and also emits the new room-handoff hooks.
5. The full-room source exposes linkage hooks to the command table packet.
6. The grid-first hooks remain present: `data-war-room-v1-room-grid="room-grid-first"`, `data-war-room-v1-room-cell-layout="equal/symmetric"`, and `data-war-room-v1-room-main-text-policy="minimal"`.
7. Inspector/source evidence hooks are closed by default.
8. Regression gate checks are stricter after the implementation, not weaker.
9. No enabled live-action buttons/links/handlers are added.

## 9. Safety/no-overclaim review checklist

The later `claudereviewer` card must answer these questions explicitly:

1. Did the implementation stay inside the allowed files?
2. Does the packet source derive only from local/read-only room controls, cells, missions, action requests, logs, connector locks, and command-table events?
3. Is the packet a view model only, with no executor, command bus, queue writer, Kanban write, approval mutation, route/API edit, or external adapter?
4. Are `localOnly=true`, `externalMutation=false`, `liveEnabled=false`, `credentialsLoaded=false`, and `liveApiCallsEnabled=false` enforced in types, state, DOM hooks, and visible copy?
5. Does connector state normalize to `NOT_CONNECTED` when credentials/no-live/execution locks require it?
6. Does `/war-room` and `/war-room?v1=1` still start grid-first/equal/symmetric/minimal?
7. When a room opens, is the command-table packet compact and diegetic, not a proof/debug wall?
8. Are raw task ids/source evidence/commands hidden in a closed inspector by default?
9. Does the visible packet avoid overclaiming live, connected, approved, final, premium, release-ready, executable, or shop/supplier/ShotLab/API/account-ready state?
10. Did all required commands pass with real output: `NODE_ENV=test pnpm gate:war-room-v1`, `pnpm typecheck`, `pnpm build`, focused vitest, and browser QA?
11. Did browser QA open at least two rooms and confirm no console/page errors?
12. Did static no-live/no-credential review report `safety_hits=[]` or all flagged strings are proven negative/disabled assertions?

## 10. Stop conditions for implementation and QA

Stop and block instead of continuing if any of these occur:

1. The handoff cannot be implemented without editing files outside the allowlist.
2. The implementation needs credentials, tokens, browser login, provider config, account verification, or external network access.
3. Any live Etsy/shop/listing/order/message/refund/renewal/publish/ad/supplier/AliExpress/Alibaba/ShotLab/payment/account/API action becomes necessary.
4. The UI requires a live connector, live execution mode, account sync, approval mutation, or external mutation to appear useful.
5. The first viewport regresses from equal/symmetric room-grid-first into a debug/proof dashboard.
6. Raw proof/source ids/evidence cannot remain hidden by default.
7. The packet cannot maintain `externalMutation=false` and `liveEnabled=false`.
8. The local chat affordance cannot remain `enabled=false`.
9. `NODE_ENV=test pnpm gate:war-room-v1`, `pnpm typecheck`, or `pnpm build` fails and cannot be fixed within the allowed scope.
10. Browser QA finds console/page errors, visible enabled live controls, or shop/supplier/ShotLab/API/account action affordances.

## 11. Recommended child chain after this architecture contract

The supervisor should create the next cards after this contract PASSes; this architecture card must not create them itself.

Recommended chain:

1. `codexintegrator` — implement command-table draft handoff packet.
   - Parent: this architecture card.
   - Scope: allowed War Room v1 source/test/gate files only.
   - Goal: active/opened room local draft/tool/approval state appears as a compact sealed command-table handoff packet, while room grid stays first and all live/external systems remain disabled.
   - Required commands: `NODE_ENV=test pnpm gate:war-room-v1`, `pnpm typecheck`, `pnpm build`, focused vitest.
   - Must report changed files, hooks added/preserved, command output, no-live static probe, and safety line.
2. `visualqaagent` — browser QA for `/war-room` and `/war-room?v1=1`.
   - Open at least two rooms, including one draft-heavy room such as `forge-hephaestus` and one approval/commerce-adjacent room such as `treasury-commerce` or `olympus-command`.
   - Verify grid-first/equal/symmetric/minimal UI, compact handoff packet, closed inspector, no console/page errors, and no live controls.
3. `claudereviewer` — no-live/no-overclaim review.
   - Run gates as appropriate and static no-live scanner.
   - Verify no credentials, live API, external mutation, approval mutation, release packaging, or overclaim.
4. DLV approval gate remains blocked for any future live connector/action enablement.

## Exit verdict

PASS: BOOST command-table draft handoff contract ready.

The next safe implementation is one bounded War Room v1 pass that turns the currently opened room's local draft/tool/approval state into a compact sealed command-table handoff packet. It must preserve equal/symmetric room-grid-first UI, keep raw evidence behind inspectors, add typed local-only packet state and DOM hooks, and maintain strict `NOT_CONNECTED`, `externalMutation=false`, `liveEnabled=false`, no credentials, and no live API invariants.
