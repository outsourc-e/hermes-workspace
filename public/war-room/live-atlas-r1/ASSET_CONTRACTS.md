# Live Atlas R1 Asset Contracts

This folder is the modular visual system for the War Room live miniature hub.

## Rules

- Assets are generated/image-made, not CSS-drawn final objects.
- Images must be text-free unless explicitly marked as an exported proof/contact sheet.
- UI labels are overlaid in React/HTML for readability and localization.
- Room floors, station props, gods, feed frames, and map/cell frames are separate layers.
- Existing approved/generated assets may be referenced as temporary inputs, but new final replacements should be ChatGPT-generated through the single-tab pipeline.

## Folder contract

```text
public/war-room/live-atlas-r1/
  ASSET_CONTRACTS.md
  hub/live-atlas-board.png
  hub/room-cell-frame.png
  hub/feed-plaque.png
  hub/corridor-path-overlay.png
  rooms/<room-id>/mini-floor.png
  props/<room-id>/<station-id>.png
  packets/opportunity.png
  packets/keyword.png
  packets/supplier-proof.png
  packets/draft.png
  packets/approval.png
  packets/archive.png
  gods/<agent-id>/model.png
  gods/<agent-id>/idle-strip.png
  gods/<agent-id>/walk-strip.png
  gods/<agent-id>/work-strip.png
  gods/<agent-id>/carry-strip.png
```

## Hub board asset

- Name: `live-atlas-board.png`
- Purpose: text-free command-board background for the main War Room hub.
- Required: eight clear empty room windows/cells, one compact feed lane, dark bronze/gold Hercules-style pixel-art UI, professional game interface.
- Forbidden: baked room names, gibberish labels, ecommerce screenshots, flat dashboard cards, CSS-looking panels.
- Status: pending ChatGPT generation.

## Room cell frame asset

- Name: `room-cell-frame.png`
- Purpose: reusable generated frame around each miniature room view.
- Required: text-free, transparent or easy-to-layer, bronze/gold pixel plaque/window quality.
- Forbidden: baked text, oversized ornaments that hide the room miniature.
- Status: pending ChatGPT generation.

## Feed plaque asset

- Name: `feed-plaque.png`
- Purpose: generated text-free surface behind live feed rows.
- Required: readable empty center zones, dark parchment/bronze pixel-game surface.
- Forbidden: baked text, giant decorative border that clips rows.
- Status: pending ChatGPT generation.

## Live packet / ant-farm motion contract

V2 requires visible packet motion, not just status dots:

- `workflowPackets[].sourceRoomId` and `workflowPackets[].targetRoomId` drive global room-to-room couriers.
- `workflowPackets[].stationId` and room station manifests drive in-room packet loops.
- Packet markers must have DOM hooks: `data-live-atlas-room-packet`, `data-live-atlas-transfer`, and `data-live-atlas-route`.
- Temporary V2 packet visuals may be small HTML diamond/crate markers while final generated packet icons are pending.
- Final V3/V4 packet visuals should use the generated `packets/<artifact-type>.png` icons.
- Agent movement must be deterministic and based on authored station/operator points, not random jitter.

## Room miniature data contract

Every room cell uses the existing `scene-manifest.ts` room model:

- `room.backgroundAsset` -> floor image layer
- `room.stations[].asset` -> station prop image layers
- `room.agents[0].idleFrame` -> god/agent layer
- `liveStatus.rooms[]` -> health, worker, product intelligence, workflow packet count
- `live feed` -> latest short event text

No separate giant composite PNG is required.

## Current room list

- `olympus-command` — command routing / approvals / gateway
- `pantheon-quarters` — agents / model roster / training
- `agora` — product opportunities / research / niches
- `oracle` — SEO / keywords / trend signals
- `forge` — Forge of Hephaestus / draft tools / ShotLab station tools
- `merchant-harbor` — suppliers / trade routes / risk
- `atlantis-vault` — database / archive / snapshots / memory
- `treasury` — margins / costs / spend locks

## ChatGPT anchor prompt

```text
Create one production-ready text-free UI asset for Hermes Workspace War Room.

Asset: live-atlas-board.png
Purpose: main hub background for a modular live miniature command map.
Style: premium chunky heroic pixel-art game UI, Greek/Olympus Money OS, inspired by Hercules torch-lit bronze/gold palette, dark obsidian backdrop, marble/bronze ornaments, readable square pixel clusters, professional game interface quality.
Composition: 16:9 horizontal board. Eight empty rectangular/organic room windows arranged like a command atlas; one slim live-feed lane on the right or bottom; empty safe zones for real HTML labels and counters. No baked text.
Required: eight distinct empty cells, subtle mythic borders, status sockets/ring areas, space for tiny live room previews, space for feed rows, crisp pixel-art details, serious premium feel.
Avoid: text or letters, labels, gibberish, logos, ecommerce screenshots, giant map illustration, flat vector dashboard, CSS-looking gradients, blurry AI mush, childish cartoon.
Output: single image only.
```
