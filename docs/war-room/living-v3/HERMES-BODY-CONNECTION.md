# Hermes War Room Body Contract

Build the body contract and runtime, not the brain.

Living V3 owns the map, rooms, layout, CSS, assets, animation rendering, and click interactions. Hermes must never mutate React layout, CSS, assets, or room geometry directly. Hermes connects later by sending typed intents and reading typed events/state.

## Runtime Layers

- `Domain Model`: `src/lib/war-room/body/domain.ts`
- `Intent API`: `POST /api/war-room/intents`
- `Event Store`: memory by default, optional JSONL file mode via `WAR_ROOM_EVENT_STORE=file`
- `Body Runtime`: `src/lib/war-room/body/runtime.ts`
- `Living V3 Adapter`: `src/lib/war-room/body/living-v3-body-adapter.ts`
- `Task Dispatcher`: `src/lib/war-room/body/task-dispatcher.ts`
- `Agent Connection Control`: `src/lib/war-room/body/agent-connection-control.ts`
- `Usage Guard`: `src/lib/war-room/body/usage-guard.ts`
- `Hermes Worker Connector`: `src/lib/war-room/body/hermes-worker-connector.ts` dry-run only
- `Capability Registry`: role-specific and local-only
- `Station Manifest`: `src/lib/war-room/body/station-manifest.ts`

The current UI remains on `local-adapter` by default. Use `/war-room?livingV3=1&bodyRuntime=1` or `/war-room?etsyOps=1&bodyRuntime=1` to test Body Runtime as source of truth. If the Body API fails, Living V3 falls back to the local adapter.

## Endpoints

- `GET /api/war-room/state`
- `GET /api/war-room/events`
- `GET /api/war-room/capabilities`
- `POST /api/war-room/intents`
- `POST /api/war-room/tasks`
- `POST /api/war-room/approvals`
- `GET /api/war-room/agent-control`
- `POST /api/war-room/agent-control/freeze`
- `POST /api/war-room/agent-control/local-only`
- `POST /api/war-room/agent-control/arm`
- `POST /api/war-room/agent-control/disconnect`

All endpoints are local-safe. They do not call Etsy, suppliers, Discord sends, paid generation, purchases, publishing, account APIs, or external mutation APIs.

There is no `connect` endpoint and no worker-spawn endpoint.

## Agent Connection Control

Default state is fail-closed:

```json
{
  "mode": "frozen",
  "frozen": true,
  "usageAllowed": false,
  "reason": "Agents are frozen by default."
}
```

Modes:

- `frozen`: all worker usage is blocked. Local body movement/chat still works through `POST /api/war-room/intents`.
- `local_only`: the UI/body connection can be prepared, but worker usage remains blocked.
- `armed_manual`: an operator-controlled future testing state. It still does not allow usage in this scaffold.
- `connected`: reserved type only. No route sets this mode in the current implementation.

Agent connection state is memory-backed by default. Optional file-backed state can be enabled with `WAR_ROOM_AGENT_CONTROL_STORE=file`, using `.war-room/agent-connection-state.json` unless `WAR_ROOM_AGENT_CONTROL_FILE` is set. Missing, invalid, or unwritable state fails closed to `frozen`.

## Worker Connector Dry Run

`prepareHermesWorkerDispatch()` and `recordHermesWorkerDryRun()` are scaffolds only. They never start Hermes, never start Kanban workers, never shell out, and never call external models.

Example future request shape:

```json
{
  "agentId": "athena",
  "label": "Review opportunity queue",
  "roomId": "agora-opportunity",
  "stationId": "agora-intake",
  "requestedAction": "run Athena worker",
  "runId": "run-20260620-usage-001",
  "correlationId": "opportunity-queue-001",
  "source": "dispatcher",
  "explicitOperatorApproval": true
}
```

In this scaffold, the request is blocked and recorded locally as `agent.connection.blocked` unless a future connector explicitly adds safe usage support. Real workers are still not connected and cannot burn usage yet.

## Usage Guard Requirements

Future usage-consuming dispatch must pass all of these checks:

- agent connection is not frozen
- `usageAllowed` is true
- `runId` and `correlationId` are present
- requested action does not contain live/external keywords
- required role capability exists
- explicit local operator approval exists

Live/external keywords such as Etsy, supplier, paid generation, Discord sends, purchase, publish, delete, account mutation, or live message sending are blocked.

## Intent Examples

```json
{
  "type": "move_to_station",
  "agentId": "athena",
  "roomId": "agora-opportunity",
  "stationId": "agora-intake",
  "runId": "run-20260620-001",
  "correlationId": "opportunity-review-001",
  "source": "hermes"
}
```

```json
{
  "type": "say",
  "agentId": "hermes",
  "text": "Routing this as a local-only packet.",
  "roomId": "olympus-command",
  "source": "hermes"
}
```

```json
{
  "type": "request_approval",
  "agentId": "julius",
  "taskId": "council-release-gate-001",
  "reason": "Council review required before any external action.",
  "correlationId": "release-gate-001",
  "source": "hermes"
}
```

Supported intent types are `say`, `move_to_room`, `move_to_station`, `work_at_station`, `carry_packet`, `request_approval`, `raise_alert`, and `rest`.

## Event Metadata

Events may include:

- `runId`
- `correlationId`
- `source`: `ui`, `hermes`, `dispatcher`, or `test`
- `status`
- `error`
- `outputArtifactId`

Example:

```json
{
  "eventId": "war-room-event-12",
  "type": "agent.started_work",
  "agentId": "hephaestus",
  "roomId": "forge-hephaestus",
  "stationId": "forge-workbench",
  "taskId": "shotlab-brief-001",
  "runId": "run-20260620-001",
  "correlationId": "shotlab-brief-001",
  "source": "hermes",
  "status": "in_progress",
  "createdAtMs": 1780000000000
}
```

## Approvals

Approvals are local-only records. `approved_local_only` means the operator accepted a local decision packet; it does not execute any live action.

Approval records include `approvalId`, `taskId`, `agentId`, `roomId`, `stationId`, `reason`, `evidence[]`, `riskLevel`, `requestedAction`, `allowedAction`, `lockedAction`, `status`, timestamps, and optional `operatorNote`.

Locked actions stay locked:

- live Etsy publish/edit
- supplier messaging
- paid generation
- purchases
- Discord sends
- account mutation
- destructive external actions

## Worker Mapping

Hermes/Kanban workers should map to `WAR_ROOM_WORKER_PROFILES`:

- `hermes` -> router / dispatcher
- `athena` -> strategy / product review
- `oracle` -> research / SEO signals
- `hephaestus` -> build / Forge / ShotLab prep
- `merchant-scout` -> merchant / supplier evidence
- `atlantis-archivist` -> archive / memory
- `treasury-guardian` -> cost / approval locks
- `roster-keeper` -> roster / rest state
- `daedalus` -> engineering / QA automation
- `signal-runner` -> gateway / remote command handoff
- `julius` -> council / release gate

Workers should send intents only. They should not edit UI files, CSS, assets, map layout, or room definitions.

The exact current answer for Hermes: connect later through `Intent API + Event Store + Agent Adapter`. Do not start real workers yet. Do not burn usage. Do not mutate React/UI/assets directly.

## Station Manifests

Use `WAR_ROOM_STATION_MANIFESTS` to discover tool/station behavior. Each station declares:

- `stationId`
- `roomId`
- `purpose`
- `inputKinds`
- `outputKinds`
- `allowedIntents`
- `lockedActions`
- `approvalRequired`
- `defaultAgentId`
- `cockpitType`

This is the scaffold for future tool cockpits. It is not a live service connector.

## UI Integration

React helpers live in `src/hooks/use-war-room-body.ts`:

- `useWarRoomState()`
- `useWarRoomEvents()`
- `sendWarRoomIntent(intent)`
- `createWarRoomTask(task)`
- `requestWarRoomApproval(payload)`

Living V3 remains visually unchanged in default mode. The opt-in Body Runtime path reads state/events, converts them through `livingV3AdapterStateFromBodyRuntime`, and renders the same existing map body.
