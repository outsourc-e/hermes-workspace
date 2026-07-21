# War Room 10h connected rooms + control spine architecture contract

Status: PASS — architecture contract only
Owner lane: chatgptheavy
Date: 2026-06-16
Scope: documentation-only. No React/source implementation, asset generation, connector login, credential access, external API call, shop action, Kanban mutation from the War Room UI, git operation, or live business action is authorized by this document.

Source of truth read first: `docs/status/automation/2026-06-16-war-room-10h-event-driven-run-contract.md`.

## 1. Safety statement

This run may build local War Room code and local read-only/dry-run connector infrastructure under `/Users/mac/hermes-workspace` only. Etsy, shops, suppliers, ShotLab, paid generation, account, order, message, refund, renewal, publish, purchase, ad, Discord, and other external systems remain NOT CONNECTED for live mutation. Any connector exposed by the UI/API must fail closed and clearly report read-only, dry-run, draft-only, or disabled state.

Non-negotiable default safety flags:

```ts
type WarRoomSafetySpine = {
  externalActionsEnabled: false
  liveEtsyEnabled: false
  liveSupplierEnabled: false
  paidGenerationEnabled: false
  discordSideEffectsEnabled: false
  credentialsLoadedByDefault: false
  connectorLiveModeEnabled: false
  workspaceWritesAllowed: true
  kanbanUiMutationsAllowed: false
  approvalRequiredForExternalActions: true
  noAutoApproval: true
  noOverclaimFinalQuality: true
}
```

`workspaceWritesAllowed` means local repo files only. It does not authorize commits, pushes, resets, cleans, stashes, marketplace writes, account writes, or connector live mode.

## 2. Product target for this slice chain

The War Room main screen should read as a connected development factory, not a proof/debug dashboard:

1. All major rooms/cells are visible on one atlas-like board.
2. Corridors/routes connect rooms and show workflow packet movement.
3. Workers/agents move purposefully between rooms according to task state, not random decoration.
4. Clicking a room opens a full room popup with room tools, station activity, logs, artifacts, connector locks, and approval state.
5. The backend/control spine, not hard-coded UI copy, drives packets, station activity, output artifacts, review locks, connector readiness, and safety locks.
6. Assets and animations may be professionalized in later cards, but must remain labeled prototype/non-final unless visual QA and release review prove otherwise.

## 3. Room graph / corridor model

Use a typed room graph as the canonical spatial contract. UI layout may choose grid, atlas, or isometric positions, but route semantics must come from this graph.

```ts
type WarRoomId =
  | 'olympus-command'
  | 'pantheon-quarters'
  | 'agora-opportunity'
  | 'oracle-signals'
  | 'forge-hephaestus'
  | 'merchant-harbor'
  | 'atlantis-vault'
  | 'treasury-commerce'

type WarRoomStationKind =
  | 'intake'
  | 'planning'
  | 'implementation'
  | 'qa'
  | 'review'
  | 'approval'
  | 'connector'
  | 'archive'
  | 'asset-workbench'

type WarRoomStation = {
  id: string
  roomId: WarRoomId
  label: string
  kind: WarRoomStationKind
  acceptsPacketKinds: WarRoomWorkflowPacketKind[]
  externalActionCapable: boolean
  defaultLocked: true
}

type WarRoomCorridor = {
  id: string
  sourceRoomId: WarRoomId
  targetRoomId: WarRoomId
  sourceStationId?: string
  targetStationId?: string
  label: string
  allowedPacketKinds: WarRoomWorkflowPacketKind[]
  safetyBoundary: 'local-only' | 'approval-gated-external-boundary'
  direction: 'one-way' | 'two-way'
  visualPriority: 'primary' | 'secondary' | 'background'
}

type WarRoomRoomGraph = {
  rooms: Array<{
    id: WarRoomId
    label: string
    role: string
    stations: WarRoomStation[]
    popupDefaultStationId: string
  }>
  corridors: WarRoomCorridor[]
}
```

Recommended core room roles:

| Room | Role |
|---|---|
| Olympus Command | conductor, routing, approval locks, review decisions |
| Pantheon Quarters | worker roster, agent availability, profile health |
| Agora of Opportunity | product/opportunity intake and prioritization |
| Oracle of Signals | research, trend, metrics, evidence gathering |
| Forge of Hephaestus | implementation, local code/assets, integration |
| Merchant Harbor | store/tool connector readiness, read-only/dry-run drafts |
| Atlantis Vault | artifacts, knowledge records, screenshots, manifests |
| Treasury of Commerce | business metrics/status summaries, read-only only |

Minimum corridor set for the next implementation:

| Corridor | Source -> target | Purpose |
|---|---|---|
| `command-to-agora` | Olympus Command -> Agora | new opportunity packet routing |
| `agora-to-oracle` | Agora -> Oracle | research/evidence request |
| `oracle-to-command` | Oracle -> Olympus Command | evidence return and prioritization |
| `command-to-forge` | Olympus Command -> Forge | implementation assignment |
| `forge-to-atlantis` | Forge -> Atlantis | artifact/handoff storage |
| `forge-to-command` | Forge -> Olympus Command | implementation complete / review-required |
| `command-to-merchant` | Olympus Command -> Merchant Harbor | connector readiness/draft-only work |
| `merchant-to-command` | Merchant Harbor -> Olympus Command | connector lock/draft evidence return |
| `command-to-treasury` | Olympus Command -> Treasury | read-only business/status summary |
| `command-to-pantheon` | Olympus Command -> Pantheon | worker/profile routing |

## 4. Workflow packet schema

A workflow packet is the control-spine object that moves through corridors and stations. It is local/read-only state unless a later approved implementation explicitly persists local drafts.

```ts
type WarRoomWorkflowPacketKind =
  | 'task'
  | 'research-request'
  | 'implementation'
  | 'qa-review'
  | 'safety-review'
  | 'asset-request'
  | 'connector-readiness'
  | 'action-draft'
  | 'artifact-handoff'
  | 'approval-lock'

type WarRoomReviewLock = {
  required: boolean
  reason: string
  lockedActionIds: string[]
  requiredReviewerLane: 'visualqaagent' | 'chatgptheavy' | 'releaseagent' | 'DLV' | 'none'
  approvalState: 'not-required' | 'required' | 'blocked' | 'approved-by-human-only'
  externalMutationAllowed: false
}

type WarRoomArtifactRef = {
  id: string
  kind: 'doc' | 'screenshot' | 'manifest' | 'local-file' | 'api-evidence' | 'draft'
  label: string
  pathOrUrl: string
  provenance: 'local-workspace' | 'read-only-api' | 'dry-run' | 'fixture'
  finalQualityClaim: 'none' | 'prototype' | 'qa-evidence-only' | 'release-reviewed'
}

type WarRoomWorkflowPacket = {
  id: string
  kind: WarRoomWorkflowPacketKind
  sourceRoomId: WarRoomId
  targetRoomId: WarRoomId
  sourceStationId: string
  targetStationId: string
  corridorId: string
  worker: {
    id: string
    profile: string
    role: 'conductor' | 'architect' | 'implementer' | 'qa' | 'reviewer' | 'asset-worker' | 'connector-worker'
    displayName: string
  }
  station: {
    currentStationId: string
    targetStationId: string
    activity: 'queued' | 'in-progress' | 'waiting-review' | 'blocked' | 'complete' | 'archived'
  }
  artifact: WarRoomArtifactRef | null
  reviewLock: WarRoomReviewLock
  sourceTaskId?: string
  childTaskIds: string[]
  connectorId?: string
  createdAt: string
  updatedAt: string
  safety: WarRoomSafetySpine
}
```

Required derivation rules:

1. `sourceRoomId`, `targetRoomId`, and `corridorId` must match the room graph.
2. `worker.profile` must be derived from Kanban assignee/profile data or a static routing policy, not invented in the UI.
3. `station.activity` must be derived from lifecycle/status; blocked, approval, parent-waiting, stale, fixture, and fallback states must not show active progress.
4. `artifact.finalQualityClaim` must default to `prototype` or `qa-evidence-only`, never final/premium by default.
5. `reviewLock.externalMutationAllowed` is always `false` for this run.
6. Packets representing `action-draft` or connector work must include connector safety state and remain draft-only/dry-run.

## 5. Agent movement states

Agent movement is a visible projection of workflow packet state. It must be deterministic, inspectable, and reduced-motion safe.

```ts
type WarRoomAgentMovementState =
  | 'idle-at-room'
  | 'queued-at-source'
  | 'walking-corridor'
  | 'working-at-station'
  | 'waiting-review-lock'
  | 'blocked-at-gate'
  | 'returning-with-artifact'
  | 'archived-static'
  | 'degraded-static'

type WarRoomAgentMovement = {
  packetId: string
  workerId: string
  state: WarRoomAgentMovementState
  sourceRoomId: WarRoomId
  targetRoomId: WarRoomId
  corridorId: string
  currentStationId: string
  targetStationId: string
  progress: number
  motionReason: string
  reducedMotionFallback: 'station-marker-only'
}
```

Movement rules:

| Packet / lifecycle state | Movement state | Visual rule |
|---|---|---|
| queued / ready | `queued-at-source` | worker waits at source station; no progress claim |
| active implementation/research/QA | `walking-corridor` or `working-at-station` | deterministic route progress or station work loop |
| artifact handoff complete | `returning-with-artifact` | packet travels back to command/vault with artifact marker |
| review-required / approval-required | `waiting-review-lock` | worker stops at command/approval lock; no auto-complete |
| blocked | `blocked-at-gate` | lock/gate marker with exact reason available in popup |
| completed/archived | `archived-static` | static archive/vault marker |
| fixture/fallback/unavailable/stale | `degraded-static` | muted marker; no fake active motion |

`progress` must be deterministic from packet id, status timestamps, heartbeat age bucket, and route id. Do not use `Math.random` or decorative wandering unrelated to workflow need. `prefers-reduced-motion` must preserve room/station/route/status evidence while disabling travel animation.

## 6. Dry-run/read-only connector registry shape

Connector infrastructure is allowed only as local disabled/read-only/dry-run/draft-only scaffolding.

```ts
type WarRoomConnectorMode = 'disabled' | 'read-only' | 'dry-run' | 'draft-only'
type WarRoomConnectorLockState = 'NOT_CONNECTED' | 'READ_ONLY_READY' | 'DRY_RUN_ONLY' | 'DRAFT_ONLY' | 'BLOCKED_FOR_DLV_APPROVAL'

type WarRoomConnectorCapability = {
  id: string
  label: string
  actionKind: 'read-status' | 'read-metrics' | 'prepare-draft' | 'validate-local-draft'
  externalMutation: false
  requiresDlvApproval: true
  allowedModes: WarRoomConnectorMode[]
}

type WarRoomConnectorRegistryEntry = {
  id: string
  label: string
  roomId: WarRoomId
  category: 'store' | 'supplier' | 'analytics' | 'asset-tool' | 'workspace-tool'
  lockState: WarRoomConnectorLockState
  mode: WarRoomConnectorMode
  credentialsRequired: boolean
  credentialsLoaded: false
  liveApiCallsEnabled: false
  networkWritesEnabled: false
  capabilities: WarRoomConnectorCapability[]
  statusEvidence: Array<{
    label: string
    provenance: 'local-fixture' | 'local-dry-run' | 'read-only-local-cache'
    value: string
  }>
}

type WarRoomConnectorActionDraft = {
  id: string
  connectorId: string
  roomId: WarRoomId
  packetId: string
  actionKind: string
  mode: 'dry-run' | 'draft-only'
  status: 'draft' | 'queued-for-human-review' | 'rejected-by-safety-spine'
  externalMutation: false
  requiresDlvApproval: true
  evidence: string[]
}
```

Registry defaults for this run:

1. Every external business connector starts `NOT_CONNECTED`, `DRY_RUN_ONLY`, `DRAFT_ONLY`, or `BLOCKED_FOR_DLV_APPROVAL`.
2. `credentialsLoaded`, `liveApiCallsEnabled`, and `networkWritesEnabled` are always `false`.
3. Allowed capability verbs are read/inspect/prepare/validate only.
4. Drafts must say `externalMutation: false` and `requiresDlvApproval: true`.
5. The UI may show readiness state, but must not show connected/live approval unless a later explicit DLV gate exists.

## 7. Safety spine flags and gates

All backend and UI surfaces in this chain must expose enough state for QA to prove locks from DOM/API evidence.

Required API/UI safety fields:

```ts
type WarRoomSafetyEvidence = {
  externalActionsEnabled: false
  liveEtsyEnabled: false
  liveSupplierEnabled: false
  paidGenerationEnabled: false
  connectorLiveModeEnabled: false
  credentialsLoadedByDefault: false
  kanbanUiMutationsAllowed: false
  noEnabledLiveActionControls: true
  defaultConnectorLockState: 'NOT_CONNECTED' | 'DRY_RUN_ONLY' | 'DRAFT_ONLY'
  allowedConnectorModes: Array<'disabled' | 'read-only' | 'dry-run' | 'draft-only'>
  forbiddenWithoutDlvApproval: string[]
}
```

Minimum forbidden action list: publish, purchase, buy, refund, renew, message customer/supplier, edit listing, order, upload to store, paid generation, live connector enable, account setting change, ad spend, Discord side-effect, git push/merge/reset/clean/stash/checkout.

Stop/block if an implementation requires credentials, live connector login, real network mutation, paid service spend, account/shop/supplier action, enabled external action button, or a source edit outside the implementation card's allowed scope.

## 8. Room popup contract

Clicking a room opens a full room popup/overlay. This is UI behavior for a later implementation card, not implemented here.

```ts
type WarRoomOpenRoomState = {
  mode: 'atlas' | 'room-popup'
  activeRoomId: WarRoomId | null
  openedFrom: 'room-cell' | 'corridor' | 'packet' | 'restored-state'
  focusedPacketId?: string
}
```

Full room popup must show:

- room title, lead worker, station activity, and packet queue;
- worker chat/notes affordance as local UI only unless a later card approves actual messaging;
- current artifacts and local evidence;
- connector registry/lock state for relevant rooms;
- approval/review locks with exact reason;
- logs/proof in this popup, not as a main-screen debug flood;
- close/back to atlas.

Opening a room must not mutate Kanban, connector state, credentials, shop data, supplier data, or external systems.

## 9. Implementation order for backend -> UI -> assets -> QA

Recommended event-driven child sequence:

1. Backend/control spine contract implementation (`codexintegrator`):
   - add typed room graph, corridor model, workflow packet builder, safety evidence, and connector registry fixtures;
   - expose read-only API data or pure state mappers only;
   - tests prove packet derivation, safety flags, connector fail-closed defaults, no live mutation verbs.
2. UI atlas implementation (`codexintegrator`):
   - render connected rooms/corridors from typed graph;
   - render purposeful worker/packet movement states;
   - clicking a room opens full room popup;
   - main screen stays minimal, with evidence in popup/inspector;
   - no source authority changes or external actions.
3. Connector scaffold implementation (`codexintegrator` or bounded implementer):
   - show registry lock/readiness states and local action drafts;
   - default to `NOT_CONNECTED` / `DRY_RUN_ONLY` / `DRAFT_ONLY`;
   - no credentials, no live API calls, no network writes.
4. Asset/animation pass (`artdirector`, `assetcreator`, `technicalartist`, `assetlibrarian`):
   - produce professional prototype sprites/rooms/corridor frames/manifests;
   - keep provenance and frame counts explicit;
   - label assets prototype/non-final unless release-reviewed.
5. Browser/visual QA (`visualqaagent`):
   - verify `/war-room` and `/war-room?v1=1` render connected rooms, corridors, movement, popup behavior, safety locks, connector lock state, and no console errors;
   - capture screenshots/manifests under `docs/status/qa/` if required.
6. Safety/no-overclaim review (`chatgptheavy` or reviewer profile using OpenAI-Codex):
   - independently verify no live external path, no credentials, no enabled forbidden controls, build/typecheck/gates passed, and no final-quality overclaim.

## 10. Acceptance criteria for follow-up cards

A backend/control spine implementation may pass only if:

1. Room graph and corridor definitions are typed and deterministic.
2. Workflow packets include source room, target room, worker, station, artifact, review lock, and safety evidence.
3. Connector registry defaults are disabled/read-only/dry-run/draft-only with no credentials or live calls.
4. Tests prove safety flags fail closed.
5. API/write surfaces remain read-only where applicable; mutation verbs are rejected or absent.

A UI implementation may pass only if:

1. Main screen shows connected rooms/cells and corridors/routes.
2. Workers/packets move according to deterministic packet state.
3. Clicking a room opens a full room popup.
4. Evidence/debug data is not the dominant first read.
5. DOM/API evidence proves external actions remain locked.
6. Reduced-motion keeps evidence while disabling travel animation.

An asset/animation implementation may pass only if:

1. Asset provenance and frame counts are documented.
2. Assets are integrated from manifests, not hard-coded untracked guesses.
3. Prototype/non-final labeling remains until QA/release review supports stronger claims.

## 11. Explicit non-authorizations

This contract does not authorize React implementation in this card, live connector enablement, shop/store/supplier/ShotLab/API/account connection, credential loading, real API mutation, marketplace action, paid generation, purchase, publishing, listing edit, order handling, message, refund, renewal, ad spend, Discord side effect, release packaging, git push/merge/reset/clean/stash/checkout, or final premium quality claims.

## 12. Proceed verdict

PASS: the 10-hour War Room run may proceed from this architecture contract into bounded backend/control-spine, UI atlas, connector scaffold, asset, QA, and safety-review cards. All implementation must remain local, read-only/dry-run/draft-only for connectors, event-driven through Kanban, and explicit about safety locks and prototype quality.
