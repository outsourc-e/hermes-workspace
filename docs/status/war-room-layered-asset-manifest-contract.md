# War Room layered asset manifest contract

Status: draft contract for Asset Slicer / Manifest Builder
Scope: schema and loader contract only; no live visual changes in this card
Safety: read-only/draft-only UI contract. No Etsy/shop/supplier/ShotLab paid/live connections or writes.

## Source guardrails read

- `/Users/mac/hermes-workspace/docs/war-room-visual-remake-production-line.md`
- `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_24H_AUTONOMOUS_DEV_GUARDRAILS.md`

This contract follows the production-line rule: assets must be ChatGPT-generated or approved image assets in modular semantic layers. CSS/React may place, animate, mask, label, and orchestrate assets, but final room art must not be CSS/Pillow/SVG/procedural substitutes and must not be one giant interactive PNG.

## Goal

Define one source of truth for each layered War Room room so future Asset Creator, Asset Slicer, Integrator, and QA cards can work independently without changing live visuals prematurely.

A room manifest must describe:

- Floor/base layer: empty floor/walls only; no baked text, props, gods, labels, UI controls, or gibberish.
- Optional structural overlays: wall trim, shadows, glows, atmospheric overlays, foreground occluders.
- Props: transparent modular in-world objects that are not directly interactive.
- Stations: transparent modular tool/machine/shrine assets with visible prop bounds, click/hotspot bounds, operator spot, dialog/tool binding, safety locks, and useful output contract.
- Characters: transparent model or sprite-strip assets with idle/walk/work states, anchor, scale, z-index, lanes, and current animation state.
- UI frames: generated/text-free frames for station popups or plaques, with safe text boxes and close socket mapping.
- Coordinates: normalized percentages for layout plus optional native pixel dimensions for asset QA.
- Scale/z-index: explicit per-layer render order and visual footprint.
- Animation state: declared named states only; React may animate declared assets but must not invent final art.

## File naming convention

Preferred room asset folder:

```text
public/war-room/layered/<room-id>/
  floor_base.png
  wall_trim_or_border.png
  props/
    prop_<semantic-name>.png
  stations/
    station_<semantic-name>.png
  characters/
    character_<agent-id>_idle.png
    character_<agent-id>_walk_strip.png
    character_<agent-id>_work_strip.png
  overlays/
    overlay_<semantic-name>.png
  frames/
    frame_panel_<semantic-name>.png
  room_manifest.json
```

Manifest paths are app-public URLs, e.g. `/war-room/layered/olympus-command/floor_base.png`, not absolute disk paths.

## Coordinate model

All scene placement uses normalized percentages relative to the room canvas unless explicitly stated otherwise.

- `x`, `y`: percentage position.
- `w`, `h`: percentage size or bounds.
- `anchor`: how the renderer attaches the asset to `x/y`; default is `bottom-center` for props/stations/characters and `top-left` for room-wide overlays.
- `nativeSize`: optional source image pixel dimensions; QA uses it to catch wrong downloads, tiny assets, and accidental contact sheets.
- `zIndex`: explicit layer order. Suggested ranges:
  - 0-99: floor/base/underlays
  - 100-299: floor decals and low props
  - 300-599: stations and main props
  - 600-799: characters/operators
  - 800-999: foreground occluders/effects
  - 1000+: UI frames/labels/debug overlays

## Minimum manifest shape

```json
{
  "schemaVersion": "war-room-layered-room-manifest/v1",
  "roomId": "olympus-command",
  "roomName": "Olympus Command",
  "canvas": { "w": 1600, "h": 900, "coordinateSpace": "percent" },
  "safety": {
    "externalMode": "read-only",
    "forbiddenLiveActions": ["etsy-publish", "etsy-edit", "supplier-message", "paid-shotlab-generation"],
    "notes": "Mock/theoretical UI only. No real shop connections."
  },
  "layers": [
    {
      "id": "floor-base",
      "kind": "floor-base",
      "asset": "/war-room/layered/olympus-command/floor_base.png",
      "bounds": { "x": 0, "y": 0, "w": 100, "h": 100 },
      "anchor": "top-left",
      "zIndex": 0
    }
  ],
  "props": [],
  "stations": [],
  "characters": [],
  "overlays": [],
  "uiFrames": []
}
```

## Layer types

### Floor base

Required exactly once.

Acceptance:

- Empty floor/walls/base room only.
- No baked station labels, no UI frame, no text, no god/worker, no prop that needs independent interaction.
- Can include permanent architectural features such as walls, doorways, floors, ceiling cuts, shadows, and lighting baked into the base.

### Prop

Transparent semantic in-world object, non-interactive by default.

Required fields:

- `id`, `kind: "prop"`, `asset`, `bounds`, `anchor`, `zIndex`.
- Optional `occlusion`, `description`, `qaNotes`.

### Station

Transparent interactive tool/machine/shrine asset.

Required fields:

- `id`, `name`, `kind: "station"`, `stationKind`.
- `asset`: transparent generated station/tool image.
- `bounds`: visible asset placement.
- `hotspot`: click target aligned to the actual visible tool, not to a label.
- `operatorSpot`: where the room character should stand/work.
- `zIndex`.
- `animation`: declared idle/active/work animation state.
- `toolSurface`: station-specific app/dialog id and output contract.
- `safety`: allowed draft/read-only actions and forbidden live actions.

Acceptance:

- Each station should answer source/input, concrete output, next handoff, and locked risks.
- Station click must not trigger external shop/supplier/paid actions.
- If labels/plaques are used, they must be separate layer assets or HTML text over safe plaques, not baked into station art.

### Character

Transparent agent/god/operator asset.

Required fields:

- `id`, `name`, `role`, `kind: "character"`.
- `assets.idle` and optional `assets.walkStrip`, `assets.workStrip`.
- `bounds` or `position` + `scale`.
- `state`: `idle`, `walking`, `working`, `thinking`, `needs-approval`, `blocked`, or `done`.
- `operatorTargets` or room navigation lanes if station movement is supported.

Acceptance:

- Character scale must not dominate tools/stations.
- Walk/work strips must declare `frameCount`, `frameWidth`, `frameHeight`, and direction/sequence metadata before integration.
- No random movement unless authored as patrol lanes and interruptible by station clicks.

### Overlay

Atmosphere/effects/foreground occluders that sit above or below props.

Examples: glow, fog, station pulse, foreground arch shadow, route packet effect.

Acceptance:

- Overlays must be semantic and removable.
- Decorative motion must not block station clicks (`pointer-events: none` in React unless explicitly interactive).
- If an overlay represents workflow packets, it must declare source, target, purpose, and timing.

### UI frame

Generated/text-free asset for popups, plaques, station app shells, labels, or close controls.

Required fields:

- `id`, `asset`, `bounds`, `safeTextBoxes`, optional `closeSpot`.

Acceptance:

- No baked gibberish text.
- Dynamic HTML text must stay inside safe text boxes.
- Close controls must be visually obvious and mapped to a real close socket.

## Loader/helper contract

A non-visual typed helper stub exists at:

`src/lib/war-room/layered-room-manifest.ts`

It provides:

- Manifest TypeScript types.
- `normalizeLayeredRoomManifest(manifest)` to fill default anchors/z-index and return a render-order sorted copy.
- `collectLayeredRoomAssetUrls(manifest)` to gather all asset URLs for preflight/download QA.
- `validateLayeredRoomManifest(manifest)` to catch missing floor base, duplicate ids, invalid bounds, and unsafe live action wording.

The helper is intentionally not imported by the live War Room route in this card. It is a contract stub for future Integrator cards.

## QA checklist for future generated assets

- Manifest has exactly one `floor-base` layer.
- No single full-room PNG is used as a final interactive room except floor/base architecture.
- Each station is a separate transparent asset with separate hotspot and operator spot.
- Each character is a separate transparent asset or declared sprite strip.
- All assets use app-public URLs under `/war-room/`.
- All visible layers have explicit `bounds`, `anchor`, `scale`, and `zIndex` or documented defaults.
- UI frames have safe dynamic text zones and close sockets.
- `forbiddenLiveActions` includes Etsy/shop/supplier/ShotLab paid/live operations.
- Manifest does not include credentials, tokens, account ids, or live API write endpoints.
- Build/typecheck passes after any code integration.

## Next partner handoff

Prompt Architect / Asset Creator can now produce modular assets that match this schema. Integrator can later add a manifest-driven renderer without changing the schema shape. QA can fail any room that lacks semantic layers, uses one giant PNG for final interaction, has baked text/gibberish, or omits safety locks.
