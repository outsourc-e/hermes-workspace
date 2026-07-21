# Agent OS foundation — War Room v1

Produced during the 2026-06-16 War Room 10h room-factory run.
Status: **prototype / non-final** — local-only, read-only/dry-run, no live shop/supplier/Discord actions.

## What this is

A typed, modular Agent OS that backs visible War Room workers with live state:

- agent id, role, model, provider;
- home room, current room, target room;
- walking / working / reviewing / blocked / idle / carrying movement states;
- route path and progress between rooms/cells;
- current speech/update;
- carried packet/artifact with review-lock flag.

## Files

| File                                                                                    | Purpose                                                                                       |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/screens/war-room/v1/room-projects/agent-os/war-room-v1-agent-os-types.ts`          | Core Agent OS types (agents, packets, route legs, movement states, safety flags).             |
| `src/screens/war-room/v1/room-projects/agent-os/war-room-v1-agent-os-rooms.ts`          | Room-to-station bindings for the nine target rooms.                                           |
| `src/screens/war-room/v1/room-projects/agent-os/war-room-v1-agent-os-registry.ts`       | Factory + six sample agents: Kimi, Codex, ChatGPT, QA, Asset, Conductor.                      |
| `src/screens/war-room/v1/room-projects/agent-os/war-room-v1-agent-os-movement.ts`       | BFS pathfinding over the station graph, route progress ticking, position interpolation.       |
| `src/screens/war-room/v1/room-projects/agent-os/war-room-v1-agent-os-state.ts`          | Pure selectors and updaters (move, set state, assign/clear packet, tick).                     |
| `src/screens/war-room/v1/room-projects/agent-os/war-room-v1-agent-os-hooks.ts`          | React hooks: `useAgentOSRegistryState`, `useAgentById`, `useAgentsInRoom`, `useAgentsByRole`. |
| `src/screens/war-room/v1/room-projects/agent-os/__tests__/war-room-v1-agent-os.test.ts` | 13 passing tests covering registry, movement, selectors, packets, room bindings.              |

## Safety posture

- `localOnly: true`, `externalMutation: false`, `liveEnabled: false` on every agent and the registry.
- All connector/system boundaries remain locked; this is a local state scaffold.
- No Etsy/shop/supplier/ShotLab/Discord/paid actions are invoked.

## Sample agents

| ID                   | Role          | Model / provider                | Home room           |
| -------------------- | ------------- | ------------------------------- | ------------------- |
| `agent-os-kimi`      | implementer   | `kimi-k2` / `kimi`              | Roman Dev Studio    |
| `agent-os-codex`     | implementer   | `openai-codex` / `openai-codex` | Roman Dev Studio    |
| `agent-os-chatgpt`   | reviewer      | `openai-chatgpt` / `openai`     | Olympus Command     |
| `agent-os-qa`        | qa-agent      | `openai-o3` / `openai`          | Forge of Hephaestus |
| `agent-os-asset`     | asset-creator | `kimi-k2` / `kimi`              | Forge of Hephaestus |
| `agent-os-conductor` | conductor     | `openai-chatgpt` / `openai`     | Olympus Command     |

## Movement model

`findAgentRouteLegs(sourceRoomId, targetRoomId)` uses the existing `WAR_ROOM_V1_ROUTES` graph to compute a shortest station-to-station path, then emits route legs tagged with `WarRoomV1RouteId`. `tickAgentRoute` advances per-leg progress; when the last leg completes the agent lands in the target room, station updates, and the route clears.

## Verification

- `pnpm vitest run src/screens/war-room/v1/room-projects/agent-os/__tests__/war-room-v1-agent-os.test.ts` → 13/13 passed.
- `pnpm exec tsc --noEmit --pretty false 2>&1 | grep agent-os` → no type errors in the new modules.

## Next steps / blockers

- Integrate Agent OS agents into `WarRoomV1RoomAgentLayer` and `WarRoomV1AgentUnit` behind a feature flag.
- Drive agent motion from real Kanban lifecycle events (conductor listens, dispatches agents).
- Add sprite/asset manifests per role and animate movement states.
- Keep all external connectors read-only/dry-run until explicit DLV approval.
