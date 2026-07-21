# Olympus Command layered asset manifest contract

Task: `t_fd4fbfed`
Status: draft contract for Manifest Builder handoff
Scope: Olympus Command only; schema/manifest planning only; no image generation, no final CSS/Pillow/SVG art, no live integrations.
Safety: all business/shop/supplier/ShotLab actions are read-only, mock-only, draft-only, or disabled until explicit DLV approval.

## Source guardrails read

- `/Users/mac/hermes-workspace/docs/status/war-room-visual-remake-olympus-command-plan.md`
- `/Users/mac/hermes-workspace/docs/war-room-visual-remake-production-line.md`
- `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_24H_AUTONOMOUS_DEV_GUARDRAILS.md`

This contract specializes the existing generic helper at `src/lib/war-room/layered-room-manifest.ts` for Olympus Command. It is intentionally not wired into the live War Room route in this card.

## Output artifacts

- Concrete JSON stub: `docs/status/olympus-command-layered-manifest.stub.json`
- This contract doc: `docs/status/war-room-visual-remake-olympus-command-manifest-contract.md`

## Coordinate and render model

Use one normalized percent coordinate space over a 16:9 room canvas:

- `canvas`: `{ "w": 1600, "h": 900, "coordinateSpace": "percent" }`
- `bounds`: `{ "x", "y", "w", "h" }` in percent of the canvas.
- `anchor`: `top-left` for full-canvas layers/frames, `center` or `bottom-center` for stations, props, and Hermes.
- `scale`: multiplier, default `1`; must be explicit for important stations/character assets before integration.
- `zIndex`: explicit order. Suggested Olympus Command bands:
  - `0-99`: floor and architecture (`floor_base`, wall trim)
  - `100-299`: floor lanes, packet route underlays, low props
  - `300-599`: stations and main props
  - `600-799`: Hermes command operator and worker tokens
  - `800-999`: glow/packet overlays and foreground occlusion
  - `1000+`: generated frames/plaques with HTML text in safe zones

## Required layer families

### 1. Floor / architecture

Exactly one `floor-base` layer:

- planned asset URL: `/war-room/layered/olympus-command/floor_base.png`
- full canvas bounds `{ x: 0, y: 0, w: 100, h: 100 }`
- empty floor/walls only; no stations, props, gods, labels, UI cards, fake charts, or text.

Optional architecture trim:

- `/war-room/layered/olympus-command/wall_trim_or_border.png`
- full canvas, transparent, no text.

### 2. Stations

Each station is a separate transparent generated asset with separate `bounds`, `hotspot`, `operatorSpot`, safety contract, and tool-surface handoff.

Required Olympus Command stations:

1. `station-command-table`
   - Purpose: active mission / routing heart.
   - Asset: `/war-room/layered/olympus-command/stations/station_command_table.png`
   - Safe behavior: route/display draft work only; no external writes.
2. `station-approval-shrine`
   - Purpose: DLV approval and safety lock gate.
   - Asset: `/war-room/layered/olympus-command/stations/station_approval_shrine.png`
   - Safe behavior: review/approval surface only; no direct publish/edit/purchase action.
3. `station-gateway-obelisk`
   - Purpose: gateway/session pulse status.
   - Asset: `/war-room/layered/olympus-command/stations/station_gateway_obelisk.png`
   - Safe behavior: read-only/mock communications status; no outbound sends.
4. `station-agent-routing-dais`
   - Purpose: route work to agents/workers.
   - Asset: `/war-room/layered/olympus-command/stations/station_agent_routing_dais.png`
   - Safe behavior: draft assignment visualization only; Kanban writes require explicit future integration contract.

### 3. Props

Props are non-interactive transparent semantic objects:

- `prop-packet-routes`: packet beads/arcs between command table and stations.
- `prop-worker-tokens`: small worker/god tokens or empty slots, no new character generation in this batch.
- `prop-approval-seal-locked`: visible locked seal for risky actions.
- `icon-omen-caduceus`: text-free Hermes/Omen icon.

Props may have `occlusion`, but should not intercept clicks unless promoted to a station in a future manifest revision.

### 4. Overlays

Overlays are removable atmosphere/effect layers. Default `pointerEvents` must be `none`.

Required or allowed overlays:

- `overlay-command-table-pulse`: subtle table glow; state `thinking` or `working`.
- `overlay-approval-awaiting-review`: gold/cyan lock pulse; state `needs-approval`.
- `overlay-gateway-pulse`: theoretical session pulse; state `idle`/`thinking`.
- `overlay-assignment-path`: route line from command table to agent dais; must declare `workflowRoute` with `sourceId`, `targetId`, and `purpose`.

### 5. Frames / plaques and safe text zones

Generated frames/plaques are text-free art surfaces; React/HTML owns all readable text.

Required `uiFrames`:

- `frame-omen-strip`
  - Asset: `/war-room/layered/olympus-command/frames/frame_omen_strip.png`
  - Safe text boxes: `mission`, `state`, `nextAction`.
- `plaque-room-title`
  - Asset: `/war-room/layered/olympus-command/frames/plaque_room_title.png`
  - Safe text box: `title`.
- `frame-mission-brief`
  - Asset: `/war-room/layered/olympus-command/frames/frame_mission_brief_panel.png`
  - Safe text boxes: `summary`, `lockedNotice`.
- `plaque-station-label-small`
  - Reusable label surface; only use if the station label needs generated plaque art instead of plain HTML.

Safe text zones must stay inside generated empty surfaces and may not depend on baked AI text.

### 6. Hermes operator

Use existing Hermes command operator as temporary character layer unless a separate Hermes generation card is approved:

- `character-hermes-operator`
- Idle asset: `/war-room/olympus-command/hermes-90frame-v1/processed/hermes-model.png`
- Optional strips:
  - `/war-room/olympus-command/hermes-90frame-v1/processed/hermes-walk-strip.png`
  - `/war-room/olympus-command/hermes-90frame-v1/processed/hermes-work-strip.png`
- Must declare `state`, `bounds`, `scale`, `zIndex`, `operatorTargets`, and optional `patrolPoints`.
- Must not be regenerated in this batch.

## Animation state contract

Allowed states from the generic helper:

- `idle`: no urgent work; station overlays may breathe subtly.
- `walking`: Hermes moving to a station target.
- `working`: Hermes actively working at command table/gateway/agent dais.
- `thinking`: Omen/JARVIS command loop processing.
- `needs-approval`: approval shrine / Omen strip awaiting DLV.
- `blocked`: safety lock or missing human decision.
- `done`: completed handoff/result display.

Sprite strips must declare `frameCount`, `frameWidth`, `frameHeight`, `playback`, optional `framesPerSecond`, and directions. Do not fake sprite animation by sliding a static image.

## Safety / read-only locks

Every station and the room-level manifest must include:

- `externalMode`: `read-only`, `mock-only`, `draft-only`, or `disabled`.
- `forbiddenLiveActions`: explicit Etsy/shop/supplier/ShotLab paid/live actions.
- `allowedActions`: only safe local inspection, mock display, draft preparation, or explicit approval-request surfaces.
- `notes`: clear text that the manifest is not connected to real shops, messages, suppliers, purchases, billing, publishing, or paid generation.

No manifest field should store credentials, tokens, customer PII, account secrets, or live write endpoints.

## Handoff to future partners

- Prompt Architect can use the filenames and semantic layer list here to write one prompt per asset family.
- Asset Creator should start with only `floor_base.png` and stop for QA before stations/props.
- Integrator can later convert the JSON stub to an imported manifest or room-specific renderer, but this card does not wire it.
- QA can fail any candidate that is one giant PNG, has baked gibberish/text, uses CSS/Pillow/SVG as final art, lacks safe text zones, omits locked safety actions, or misaligns station hotspots/operator spots.
