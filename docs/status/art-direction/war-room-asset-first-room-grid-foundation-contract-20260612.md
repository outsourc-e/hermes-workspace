# War Room Asset-First Room-Grid Foundation Contract — 2026-06-12

Status: art-direction contract for the current asset-first BOOST redirect.
Scope: `/war-room` first visual slice only. This is not an implementation plan and does not authorize React/source changes or live connector enablement.

## Product intent

The first viewport must read immediately as a living AI-agent operations world, not a dashboard, proof page, or backend debug wall. The default view is an equal/symmetric room-grid cell world: a balanced top-down or shallow-orthographic base where each room/cell feels like a real place with depth, texture, lighting, and inhabitants. Text is minimal and secondary. The viewer should understand: "this is an active command hive of specialized agent rooms" before reading labels.

## First opened-room vertical slice

First opened room: `olympus-command`.

Reason: existing War Room direction already centers the mythology/history/Olympus command chamber, and it gives the clearest high-value anchor for the whole system. It can prove the required pipeline: room base art, station props, operator/god presence, image-made frames/plaques, safe text zones, and click/hitbox manifest coordinates without touching live shop systems.

## Required assets and textures before integration

1. First viewport room-grid base
   - One generated/image-made room-grid or tileable cell-world base, 16:9, balanced and symmetrical.
   - Equal room/cell footprints with visible wall/floor separation, not CSS boxes.
   - Ancient command-hive mood: dark marble/stone, bronze/antique-gold trim, subtle Hermes/JARVIS signal energy.
   - Empty enough to accept later room overlays, workers, status glows, and click regions.

2. `olympus-command` opened-room background
   - Empty architectural shell: mythology/history-first Greek/Hellenistic command chamber.
   - Floor/wall/background treatment must include carved stone, marble, bronze inlay, Greek-key or temple geometry.
   - No baked people, readable text, monitor walls, dashboards, charts, shop imagery, or generic sci-fi command room drift.

3. Station/tool props
   - Separate transparent or cuttable image assets for: council war table, mission board/frame, oracle signal pedestal, archive/map stand, and safe connector-lock shrine.
   - Props must look like physical tools in the room, not Tailwind cards.
   - Each prop needs intended coordinate, scale, z-index, and allowed text-overlay zone.

4. Operator/god/worker presence
   - At least one modular operator/god/worker presence asset for the first opened room, plus small worker/activity silhouettes or sprites for the room-grid viewport.
   - Presence must communicate active work without claiming real external execution.
   - Avoid readable badges, fake metrics, shop logos, or pseudo-text baked into bodies/clothing.

5. Image-made plaques, frames, and safe text zones
   - Frames/plaques must be real image-made assets, not CSS borders.
   - Text zones must be explicitly marked as empty areas where live HTML text may be placed later.
   - Default canvas may show only short human labels such as room names or mode names; raw ids stay hidden.

6. Click/hitbox manifest needs
   - Create a manifest handoff with normalized coordinates for every first-viewport cell and every opened-room interactive prop.
   - Minimum fields: `id`, `assetPath`, `roomId`, `boundsPct` or `{x,y,w,h}`, `zIndex`, `safeTextZonePct`, `clickTarget`, `disabledReason`, `statusClaimPolicy`.
   - Hitboxes may be CSS/HTML overlays, but only as invisible interaction/accessibility layers over real art.

## Negative rules

- no CSS/Tailwind rectangles as primary cells, rooms, tools, stations, machines, frames, plaques, characters, or final visual substance.
- no CSS card grid, glass dashboard, debug/proof wall, raw evidence ledger, task-id wall, source-id wall, or backend status dump in the default canvas.
- no raw ids by default: ids may exist in closed inspectors/dev tools, never as first-read product UI.
- no fake live connection claims, fake Etsy/shop/supplier/ShotLab/API execution, fake revenue metrics, or invented business status.
- no one-piece final room PNG that bakes stations, labels, characters, and UI together; large images are allowed only as reference/contact sheets, not final interactive layers.
- no mythology drift into generic neon JARVIS, generic SaaS, cyberpunk control room, or decorative temple wallpaper with no operational purpose.

## Safety Spine

All Etsy/shop/supplier/ShotLab/API/account systems remain `NOT_CONNECTED`. Credentials are absent. Live execution is disabled. This slice is dry-run/read-only/local preview only until DLV explicitly approves live enablement. Any visual element that represents a connector must show locked/local/draft/read-only state and must not imply that a real marketplace, supplier, ShotLab, API, or account action is available.

## Prompt pack draft for promptqaagent

Prompt family A — first viewport room-grid base:
Generate a 16:9 top-down or shallow-orthographic equal/symmetric room-grid cell-world base for an Olympus/Hermes AI-agent War Room. Premium strategy-game environment art, ancient Greek/Hellenistic stone and dark marble, bronze/antique-gold trim, subtle cyan signal energy, clear room boundaries, balanced cells, empty centers for later props/workers, no readable text, no UI cards, no dashboards, no people, no charts, no shop/business imagery.

Prompt family B — `olympus-command` opened-room shell:
Generate an empty 16:9 opened-room background for Olympus Command: mythological antiquity and historical strategy chamber, carved stone floor, marble wall boundary, temple geometry, subtle Greek key trim, bronze inlay, serious museum-quality strategy-room atmosphere, open center and open station zones. No people, no statues as focal subjects, no furniture baked in, no readable text, no monitor walls, no UI panels.

Prompt family C — modular props/presence/frames:
Generate separate transparent PNG-style assets matching the same Olympus Command material language: council war table, mission board frame, oracle signal pedestal, archive/map stand, connector-lock shrine, operator/god/worker idle presence, and plaque/frame assets with intentionally blank safe text zones. No baked readable text, no fake data, no shop logos, no CSS-card appearance.

## Next exact card recommendation

Create the next card for `promptqaagent`: prompt-readiness QA for this contract. It should verify that the prompt families above are specific enough to generate real modular asset files, preserve clean text-free zones, avoid baked gibberish, enforce the no CSS/debug/proof-wall rules, and keep all business connector systems `NOT_CONNECTED`.
