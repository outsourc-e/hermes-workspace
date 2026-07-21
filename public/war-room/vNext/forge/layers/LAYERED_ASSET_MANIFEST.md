# Forge of Hephaestus professional layered-room contract

This pass follows a real game-scene pipeline. The room is no longer treated as one giant baked illustration with CSS labels on top. The scene must be assembled as layers:

1. **Base floor/walls image** — one text-free room base with clear walkable floor.
2. **Separate transparent station props** — each tool/machine is its own PNG placed on the prop layer.
3. **Character layer** — Hephaestus is a separate asset with floor-plane movement only.
4. **Interaction layer** — invisible/organic prop-shaped buttons; no visible square hover boxes.
5. **FX layer** — active glow/shadow only, anchored to prop footprint.
6. **Dialog layer** — centered generated frame with real mapped close X and text zones.

## Base / floor layer

- Preferred production candidate:
  - `/war-room/vNext/forge/layers/forge-floor-base-pro-v1.png`
  - Generated via ChatGPT web fallback because the configured image API has no `FAL_KEY`.
  - Required: clean Olympus forge floor/walls only; no tools, no labels, no characters, no UI.
- Previous base fallback:
  - `/war-room/vNext/forge/layers/forge-floor-base.png`
  - Issue: still reads like a finished baked forge arena with architectural machinery/lava baked in.
- Rejected live background:
  - `/war-room/vNext/forge/layers/forge-of-hephaestus-living-room-v33.png`
  - Reason: giant baked room picture; violates DLV’s layered-room requirement.

## Separate station props

Current station props are separate transparent PNGs and must remain separate from the base:

- `/war-room/vNext/forge/stations/layered/approval-shrine-pro.png`
- `/war-room/vNext/forge/stations/layered/prompt-anvil-pro.png`
- `/war-room/vNext/forge/stations/layered/model-bellows-pro.png`
- `/war-room/vNext/forge/stations/layered/sorting-rack-pro.png`
- `/war-room/vNext/forge/stations/layered/listing-easel-pro.png`
- `/war-room/vNext/forge/stations/layered/skills-forge-pro.png`

Final-production note: these were extracted from a prop sheet and may have matte fringe. If QA still reads them as weak, regenerate each station as a native transparent individual prop. Do **not** replace them with CSS drawings.

## Hit areas / interaction

- Button rectangles may exist for accessibility but must be invisible.
- No visible square/rounded-square hover boxes.
- Visible hover feedback must be prop-shaped: image lift, soft footprint ellipse, outline/glow clipped near the prop.
- Station title may appear on hover/active in a small professional label, but it cannot be used as the primary visual object.

## Movement

- No random patrol or timer chains.
- Hephaestus starts stable in the open floor.
- On station click, he follows authored waypoints at constant speed.
- Movement ends cleanly before opening the station dialog.
- No CSS transition duration that disagrees with JS timing.

## Popup / station panel frame

- `/war-room/vNext/forge/layers/forge-popup-frame-clean.png`
- Generated text-free frame.
- HTML overlays provide real readable text in mapped safe zones.
- The close X is a real control centered in the frame’s close socket.
- The close shape must consume the manifest radius/shape values; no arbitrary nudge hacks.

## QA requirements

Before reporting this pass:

- Build passes with `pnpm build`.
- Browser QA validates main map → Forge room → station hover/click → centered dialog → close.
- Vision QA confirms:
  - no giant baked room with all tools merged in
  - no ugly square hover boxes
  - no glitchy character motion
  - X is visually in the designed close socket
  - Forge floor reads as a stable floor plane with props layered on top
