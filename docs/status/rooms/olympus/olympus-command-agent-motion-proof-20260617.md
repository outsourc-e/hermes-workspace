# Olympus Command agent motion runtime proof — prototype/non-final art

Status: runtime proof only; no final sprite sheet or premium art is claimed.

Changed surface:
- Main War Room horizontal mini-room: `Olympus Command` (`olympus-command`).
- Runtime agent: `agent-hermes-conductor` / Hermes conductor.
- Reusable hook: `src/lib/war-room/horizontal-mini-rooms-room-agent-motion.ts`.
- Visible consumer: `src/screens/war-room/v1/WarRoomV1HorizontalMiniRooms.tsx`.

Proof contract:
- Full-motion path publishes 96 deterministic runtime frames (50+ requirement satisfied) over slow 18s timing.
- Reduced-motion fallback publishes one still checkpoint frame with `direction=STILL` and travel disabled.
- Target path: home perch → command war table/work → review lock table/talk → rest balcony → home perch.
- State hooks exposed per frame: `rest`, `work`, `talk`.
- Direction hooks exposed per frame via `N/S/E/W/NE/NW/SE/SW/STILL` labels.

Machine-checkable DOM hooks:
- `data-war-room-v1-olympus-command-runtime-proof`
- `data-war-room-v1-olympus-command-agent-runtime-total-frames`
- `data-war-room-v1-olympus-command-agent-marker`
- `data-war-room-v1-olympus-command-agent-frame`
- `data-war-room-v1-olympus-command-agent-state`
- `data-war-room-v1-room-agent-runtime-final-art-claim="false"`

Safety:
- External/store/shop/supplier/customer/paid actions remain disabled/manual-only.
- This does not claim final art; it is a browser/runtime motion proof until premium sprite sheets pass visual QA.
