# Rest Room / Agent Lounge / Sanctuary — Implementation Notes

Date: 2026-06-17
Task: t_1f3a8bae
Scope: modular room project + Agent OS integration, read-only/dry-run, no live actions.

## What was added

### 1. Shared station and route graph

- New station: `rest-lounge-sanctuary` (x: 92, y: 50, `quiet: true`)
  - File: `src/screens/war-room/v1/war-room-v1-manifest.ts`
- New route IDs: `command-to-rest`, `archive-to-rest`
  - Connects Olympus Command → Rest Room and Atlantis Vault → Rest Room.
  - File: `src/screens/war-room/v1/war-room-v1-types.ts`, `war-room-v1-manifest.ts`

### 2. Agent OS integration

- New Agent OS room: `agent-lounge` bound to `rest-lounge-sanctuary`
  - File: `src/screens/war-room/v1/room-projects/agent-os/war-room-v1-agent-os-rooms.ts`
- New movement state: `resting`
  - File: `src/screens/war-room/v1/room-projects/agent-os/war-room-v1-agent-os-types.ts`
- New sample agent: `agent-os-restwarden`
  - Home room = `agent-lounge`; starts in `resting` state.
  - File: `src/screens/war-room/v1/room-projects/agent-os/war-room-v1-agent-os-registry.ts`
- Arrival logic updated so agents walking to the lounge land in `resting` instead of `idle`
  - Files: `war-room-v1-agent-os-movement.ts`, `war-room-v1-agent-os-state.ts`

### 3. Modular rest-room project

Location: `src/screens/war-room/v1/room-projects/rest-room/`

| File | Purpose |
|------|---------|
| `index.ts` | Public barrel export |
| `war-room-v1-rest-room-types.ts` | Rest-room-specific types: snapshot, activity states, route requests |
| `war-room-v1-rest-room-state.ts` | `routeAgentToRestRoom`, `routeIdleAgentsToRestRoom`, `buildRestRoomSnapshot`, activity/speech pickers |
| `war-room-v1-rest-room-assets.ts` | Themed asset direction/manifest (background, props, animations) |

Key behaviors:

- Rest is explicit: idle agents route to `agent-lounge` and switch to `resting`.
- Rest activities are `resting | talking | recharging` — no fake work.
- `routeIdleAgentsToRestRoom` only moves agents that are `idle`, unassigned, and not carrying a packet.
- Each role gets a rest-specific speech line so the lounge feels alive.

### 4. Atlas / full-room visibility

- Added `agent-lounge` cell to `WarRoomV1ConnectedAtlas.tsx`
  - Positioned at the right edge (x: 88, y: 42, w: 11, h: 22) with emerald tone.
  - Connected via `command-to-rest` and `archive-to-rest` corridors.
- Added `rest-lounge-sanctuary` to `ROOM_BY_STATION` so agents/packets map to the lounge room.
- Added `rest-lounge-sanctuary` station kind mapping in `WarRoomV1FullRoomView.tsx`.

### 5. Tests

- Updated `src/screens/war-room/v1/room-projects/agent-os/__tests__/war-room-v1-agent-os.test.ts`
  - Sample agent count: 6 → 7
  - Added rest room binding test
  - Added 4 new rest-room tests:
    1. route an idle agent to the lounge and land in `resting`
    2. bulk-route idle agents
    3. build a rest-room snapshot with ambient speech
    4. do NOT route agents carrying packets

## Verification

```bash
cd /Users/mac/hermes-workspace
pnpm typecheck                 # PASS
pnpm build                     # PASS
pnpm vitest run src/screens/war-room/v1/room-projects/agent-os/__tests__/war-room-v1-agent-os.test.ts  # 18 PASS
pnpm test:war-room-v1          # 37 PASS
```

## Safety / scope

- No live shop/supplier/customer/account/Discord actions.
- No credentials, no real API mutations, no git operations.
- Rest room is read-only/dry-run local state only.
- Asset manifest is direction-only / temporary-placeholder; no paid generation.

## Integration notes for the next worker

1. **Mini-room sprite**: use `WAR_ROOM_V1_REST_ROOM_ASSETS['rest-room-bg']` and the listed prop/animation assets.
2. **Agent rendering**: agents with `movementState === 'resting'` should use the `agent-resting-idle` loop, `agent-talking-loop` when `activity === 'talking'`, or `agent-recharge-loop` when `activity === 'recharging'`.
3. **Conductor integration**: call `routeIdleAgentsToRestRoom(registry)` after each lifecycle tick to sweep idle agents into the lounge.
4. **Full room popup**: `roomControlKind` for `agent-lounge` currently falls back to `generic-local-inspection`; add a dedicated `rest-lounge` control kind if DLV wants lounge-specific inspect UI.
5. **Clickable atlas cell**: already present; `onEnterRoom('agent-lounge')` works.

## Changed files

- `src/screens/war-room/v1/war-room-v1-types.ts`
- `src/screens/war-room/v1/war-room-v1-manifest.ts`
- `src/screens/war-room/v1/WarRoomV1ConnectedAtlas.tsx`
- `src/screens/war-room/v1/WarRoomV1FullRoomView.tsx`
- `src/screens/war-room/v1/room-projects/agent-os/war-room-v1-agent-os-types.ts`
- `src/screens/war-room/v1/room-projects/agent-os/war-room-v1-agent-os-rooms.ts`
- `src/screens/war-room/v1/room-projects/agent-os/war-room-v1-agent-os-registry.ts`
- `src/screens/war-room/v1/room-projects/agent-os/war-room-v1-agent-os-state.ts`
- `src/screens/war-room/v1/room-projects/agent-os/war-room-v1-agent-os-movement.ts`
- `src/screens/war-room/v1/room-projects/agent-os/__tests__/war-room-v1-agent-os.test.ts`
- `src/screens/war-room/v1/room-projects/rest-room/index.ts`
- `src/screens/war-room/v1/room-projects/rest-room/war-room-v1-rest-room-types.ts`
- `src/screens/war-room/v1/room-projects/rest-room/war-room-v1-rest-room-state.ts`
- `src/screens/war-room/v1/room-projects/rest-room/war-room-v1-rest-room-assets.ts`
- `docs/status/rooms/agent-lounge/2026-06-17-rest-room-agent-lounge-implementation.md`
