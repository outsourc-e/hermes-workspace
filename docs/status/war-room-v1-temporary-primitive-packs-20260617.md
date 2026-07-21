# War Room v1 temporary primitive packs — 2026-06-17

Status: partial/prototype visual upgrade, not final premium art.

Scope: default `/war-room` v1 horizontal mini-room main screen only. No external/live/store/supplier/customer/paid actions were enabled.

## What changed

Added a temporary primitive pack registry for every visible horizontal room:

- floors/walls/threshold material labels
- room-specific floor pattern family
- physical station prop slots
- packet icon state slots
- agent marker family + 96-frame path/motion contract metadata
- explicit disclosure that these are temporary primitive packs, not final premium art

Primary code paths:

- `src/screens/war-room/v1/war-room-v1-primitive-packs.ts`
- `src/screens/war-room/v1/WarRoomV1HorizontalMiniRooms.tsx`
- `src/screens/war-room/v1/__tests__/war-room-v1-visual-hierarchy.test.tsx`

## Integrator hooks

Each room button now exposes:

- `data-war-room-v1-temporary-primitive-pack`
- `data-war-room-v1-temporary-art-disclosure`
- `data-war-room-v1-primitive-floor-material`
- `data-war-room-v1-primitive-wall-material`
- `data-war-room-v1-primitive-agent-path-contract`
- `data-war-room-v1-primitive-agent-frame-target`

Each primitive station exposes:

- `data-war-room-v1-primitive-station`
- `data-war-room-v1-primitive-station-kind`
- `data-war-room-v1-primitive-station-label`

Each primitive packet exposes:

- `data-war-room-v1-primitive-packet`
- `data-war-room-v1-primitive-packet-state`

The primitive agent marker exposes:

- `data-war-room-v1-primitive-agent-marker`
- `data-war-room-v1-primitive-agent-family`
- `data-war-room-v1-primitive-agent-path-contract`
- `data-war-room-v1-primitive-agent-frame-target`

## Honest quality note

This is an incremental reduction of the CSS-card feel by adding physical room-surface/station/packet/agent primitives. It is not premium final art. It should be treated as an integrator-ready temporary visual primitive layer while ChatGPT/OpenAI-generated premium assets and visual QA remain separate future work.
