# War Room asset-first visual foundation contract — 2026-06-12

Status: PASS / art-direction contract only
Owner lane: artdirector
Task: `t_edbe73d9`
Workspace boundary: `/Users/mac/hermes-workspace` only

## Safety and scope

This document authorizes art direction and prompt QA only. It does not generate assets, copy assets to live/public paths, edit React/source, connect external services, or approve release.

All Etsy/shop/supplier/ShotLab/API/account systems remain `NOT_CONNECTED`, local/read-only/draft-only. No purchases, messages, listing edits, publishing, refunds, renewals, paid generation, supplier contact, or account action are implied.

## First slice choice

First slice: `olympus-command`.

Reason: it is the current command-center anchor for the War Room, existing work already names Olympus Command floor/station concepts, and it can prove the asset-first reset without inventing a new room. The first slice must replace the rejected CSS/debug/proof-wall direction with a real asset world: first viewport cell/world base plus one opened Olympus Command room vertical slice.

## Product target in one sentence

Create an asset-first Olympus AI-agent operating environment: an equal/symmetric room-cell world in the first viewport, minimal text, visible command-world depth, and one opened Olympus Command room built from real image assets/textures, not CSS rectangles.

## Required visual language

- Ancient Greek / Hellenistic / Olympus command architecture first.
- Serious strategy-game / museum-quality material treatment.
- Direct overhead or very shallow orthographic top-down camera suitable for agents, stations, hitboxes, and room-to-room workflow packets.
- Materials: dark marble, carved limestone, aged bronze, antique-gold inlay, Greek-key/meander borders, stone slabs, parchment/campaign-map surfaces, restrained cyan Hermes/JARVIS signal energy.
- Mood: calm command authority, living AI operations, mythic but useful.
- Text: minimal and intentional. Any necessary dynamic text must sit in safe HTML overlay zones, never baked into generated assets.

## Required asset set for the first foundation

Prompt QA should evaluate whether the prompts below can produce these assets as candidate-only files.

### A. First viewport cell/world base

Purpose: the `/war-room` first viewport before opening a room.

Required output:
- `world_cell_grid_base.png` or equivalent 16:9 world/cell foundation.
- Equal/symmetric room-grid or cell-world composition.
- Cells must feel like connected rooms/departments in an AI-agent operating environment, not SaaS cards.
- Minimal or no baked text. Prefer empty plaques/sign surfaces for later HTML labels.
- Visible corridors/paths/thresholds for future packet movement.
- Space for small room status glows, operators, and click hitboxes.

Visual requirements:
- Top-down or shallow orthographic Olympus command-world map.
- Room cells arranged with disciplined symmetry and hierarchy.
- Center can imply Olympus Command / command table zone, but no complete UI dashboard.
- Materials match Olympus: marble, bronze, antique gold, dark stone, restrained cyan signal channels.

Reject if it looks like: CSS grid, dashboard cards, browser UI, flowchart, monitor wall, proof board, generic sci-fi base, neon cyberpunk layout, or a single pasted infographic.

### B. Opened-room background — Olympus Command

Required output:
- `olympus_command_room_base.png`, 16:9 landscape, preferably 3840x2160 or highest available 16:9.
- Empty architectural room shell only: floor, shallow walls/boundaries, thresholds, and negative space for modular props.
- Must support later placement of separate transparent station/tool props and operator/god sprites.

Required anchors:
- Ancient Greek command hall from Olympus.
- Empty open center and side station zones.
- Greek-key/meander border discipline.
- Dark marble/stone floor with bronze/gold inlay channels.
- Subtle Hermes/JARVIS cyan energy only in seams/channels, not as screens.

Reject if it includes baked stations, command tables, screens, labels, figures, statues, cards, charts, dashboards, or deep perspective that prevents top-down placement.

### C. Station/tool props for Olympus Command

Generate as separate transparent PNG/WebP props, not as a room scene.

Initial required props:
1. `station_council_war_table` — central mission/campaign planning table.
2. `station_mission_board` — raised historical mission/state board with empty plaques only.
3. `station_jarvis_omen_beacon` — mythic oracle/signal beacon for recommendations.
4. `station_approval_seal_shrine` — explicit DLV approval/locked action shrine.
5. `station_gateway_dispatch_console` — Hermes messenger dispatch altar/portal for worker routing.
6. `station_safe_autonomy_mode_pedestal` — bounded autonomy mode pedestal.

Universal prop requirements:
- Transparent alpha background.
- Direct-overhead or shallow orthographic perspective compatible with room base.
- No baked text, pseudo-text, UI labels, screens, charts, buttons, status bars, dashboards, fake task cards, or raw ids.
- Clear visual click/focus anchor.
- Nearby empty operator/god standing space.
- Cohesive material palette with the room base.
- Each prop must read as an in-world object/machine/tool, not a UI card.

### D. Operator/god presence

Required first presence direction:
- One small Hermes/Olympus command operator presence suitable for Olympus Command.
- It may be a polished portrait-token/operator marker if full-body animation is not ready, but it must not be a CSS circle/blob/avatar.
- Prefer a small readable mythic command operator: Hermes messenger-advisor / command steward / general-advisor presence.
- It must have transparent background and no baked room, no text, no UI.
- It must be scaled for room operation, not a giant portrait.

Minimum state vocabulary for later assets:
- `idle`: standing/ready, calm.
- `walk`: moving along room/corridor path.
- `work`: interacting with a station/tool.
- `approval-required`: directed toward Approval Shrine / locked decision.

Prompt QA may PASS a first generation pack that only creates `idle` if it clearly states later states are required before runtime animation claims.

### E. Plaques, frames, and UI surfaces

Required image-made surfaces:
- `plaque_room_title_empty.png` — text-free Olympus title plaque for room name overlay.
- `plaque_station_label_empty.png` — text-free station label plaque for hover/focus/active labels.
- `frame_station_dialog_empty.png` — text-free generated station/dialog frame with safe text zones.
- Optional: `frame_inspector_closed_empty.png` — closed/compact inspector frame for debug/provenance data hidden by default.

Requirements:
- Image-made/generative surfaces, not CSS border cards.
- Empty clean zones for HTML text overlays.
- No baked readable text or pseudo-text.
- Ornate details must not invade text safe zones.
- Close-control area must be visually obvious and separable from decorative elements.

## Candidate-only output path, dimensions, and provenance contract

Every prompt in this pack is candidate-only. `assetcreator` must write only under `generated-candidates/war-room/asset-first-foundation/20260612/` and must not copy, promote, integrate, publish, or move files into app/public/live paths.

Exact required candidate output paths for the first acceptable candidate set:

| Prompt | Asset family | Exact candidate-only local output path(s) |
| --- | --- | --- |
| Prompt 01 | first viewport world/cell base | `generated-candidates/war-room/asset-first-foundation/20260612/world-cell-grid/candidate-a/world_cell_grid_base.png` |
| Prompt 02 | opened Olympus Command room base | `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-room-base/candidate-a/olympus_command_room_base.png` |
| Prompt 03 | station/tool transparent props | `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-station-props/candidate-a/station_council_war_table.png`; `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-station-props/candidate-a/station_mission_board.png`; `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-station-props/candidate-a/station_jarvis_omen_beacon.png`; `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-station-props/candidate-a/station_approval_seal_shrine.png`; `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-station-props/candidate-a/station_gateway_dispatch_console.png`; `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-station-props/candidate-a/station_safe_autonomy_mode_pedestal.png` |
| Prompt 04 | operator/god presence idle | `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-operator/candidate-a/operator_hermes_command_presence_idle.png` |
| Prompt 05 | plaques and station dialog frame | `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-ui-surfaces/candidate-a/plaque_room_title_empty.png`; `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-ui-surfaces/candidate-a/plaque_station_label_empty.png`; `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-ui-surfaces/candidate-a/frame_station_dialog_empty.png` |

Required dimensions, aspect ratios, and padding by asset family:

- First viewport world/cell base: 16:9 landscape, preferably `3840x2160`; no transparent padding requirement because it is a full-canvas background.
- Opened Olympus Command room base: 16:9 landscape, preferably `3840x2160`; no transparent padding requirement because it is a full-canvas background.
- Station/tool props: transparent `2048x2048` PNG/WebP square canvas; one asset per file; object centered with 8-12% transparent padding on every edge; no floor, wall, background, contact sheet, collage, presentation board, or combined room composition. `station_council_war_table` should occupy roughly 70-82% of canvas width; smaller stations/pedestals/boards should occupy roughly 55-75% of canvas width/height with clear click anchors.
- Operator presence: transparent `1024x1024` or `1536x1536` square PNG; idle-only candidate; 10-15% transparent padding on every edge; no opaque halo, card, circle, floor, room, portrait background, or animation claim. Do not claim walk/work/approval-required animation exists until separate state assets are generated later.
- Plaque room title: transparent `1600x420` PNG; safe text zone approximately x 18-82%, y 28-70%; ornament must stay outside that central safe text zone.
- Plaque station label: transparent `1100x320` PNG; safe text zone approximately x 16-84%, y 28-72%; ornament must stay outside that central safe text zone.
- Station dialog frame: transparent `2400x1600` PNG, 3:2/near-4:3 frame suitable for scaled HTML overlay; body safe text zone approximately x 16-84%, y 14-58%; output/artifact safe zone x 18-68%, y 62-84%; safety-lock zone x 70-88%, y 64-84%; close-control socket x 88-96%, y 4-13%. All zones are approximate percentages and must remain visually clean.

For every generated file, `assetcreator` must write a sibling metadata/provenance file, for example `<asset-name>.metadata.json`, containing these fields:

```json
{
  "promptId": "prompt-01-world-cell-grid-base",
  "promptPackPath": "docs/status/art-direction/war-room-asset-first-foundation-20260612.md",
  "exactLocalCandidatePath": "generated-candidates/war-room/asset-first-foundation/20260612/world-cell-grid/candidate-a/world_cell_grid_base.png",
  "generationTime": "ISO-8601 timestamp from the generating tool/session",
  "generationTool": "tool or browser used by assetcreator",
  "candidateStatus": "candidate-only",
  "safety": "not-integrated / not-public / not-live / NOT_CONNECTED",
  "textGibberishNotes": "state whether readable text, pseudo-text, glyph spam, or gibberish appeared; reject if present"
}
```

Multi-file safeguards: return/download each asset as a separate file. Explicit `no collage` rule: do not create a combined sheet, contact sheet, collage, presentation board, preview grid, proof wall, all-in-one screenshot, or final composed scene. If the generation tool cannot return separate files, generate exactly one asset per prompt in the listed order and stop after each candidate for review.

Hard rejection rules for candidates and prompt QA: reject opaque backgrounds on transparent-family assets, transparent files with hidden white/black matte, cropped props, hidden matte/halo/card backgrounds, baked shadows that assume a floor, pseudo-text/gibberish/glyph spam/readable labels, CSS/debug/proof-wall visuals, browser/admin/dashboard visuals, and fake live connection claims such as connected/published/purchased/messaged/approved-live. Prompt QA must also reject any pack that weakens the `candidate-only` status or the `NOT_CONNECTED` safety line.

## Safe text zones and manifest needs

Every generated candidate family must include, or be compatible with, a later manifest containing:

```json
{
  "assetId": "olympus_command_room_base",
  "candidateStatus": "candidate-only",
  "intendedUse": "opened-room-background",
  "dimensions": { "width": 3840, "height": 2160 },
  "coordinateSystem": "percent",
  "safeTextZones": [
    { "id": "room_title", "x": 38, "y": 4, "w": 24, "h": 8 },
    { "id": "station_dialog_body", "x": 22, "y": 20, "w": 56, "h": 55 },
    { "id": "safety_lock", "x": 28, "y": 77, "w": 44, "h": 10 }
  ],
  "hitboxes": [
    { "id": "station_council_war_table", "x": 50, "y": 52, "w": 18, "h": 14, "shape": "ellipse" },
    { "id": "station_mission_board", "x": 24, "y": 34, "w": 14, "h": 18, "shape": "rounded-rect" },
    { "id": "station_approval_seal_shrine", "x": 78, "y": 32, "w": 12, "h": 14, "shape": "circle" }
  ],
  "operatorSlots": [
    { "id": "primary_operator_idle", "x": 50, "y": 70, "radius": 5 },
    { "id": "approval_operator", "x": 74, "y": 44, "radius": 4 }
  ],
  "forbiddenLiveClaims": ["connected", "published", "purchased", "messaged", "approved-live"]
}
```

Manifest acceptance criteria:
- Coordinates use percentages so integration can scale.
- Hitboxes follow visible objects, not arbitrary card regions.
- Safe text zones avoid ornate frame details and generated object faces.
- Raw task ids, source ledgers, proof keys, evidence ids, and debug strings are not visible by default; they can exist only inside a closed inspector.
- All external/business states must remain `NOT_CONNECTED`, `read-only`, `draft-only`, or `locked until DLV approval`.

## Exact negative rules

These are non-negotiable. Prompt QA must fail any prompt pack or candidate that permits them.

- No CSS/Tailwind rectangles/cards as primary cells, rooms, stations, tools, machines, plaques, frames, or operators.
- No SaaS dashboard, glassmorphism, KPI panels, proof wall, debug wall, monitor wall, admin grid, Trello-like cards, browser screenshot, or terminal/log screen as the visual foundation.
- No raw ids by default: no task ids, source keys, file hashes, evidence ids, internal worker ids, endpoint names, or ledger rows in the first viewport or opened room.
- No fake live connection claims: do not show connected Etsy/shop/supplier/ShotLab/API/account state; do not show publish/purchase/message/refund/renewal/paid-generation as available.
- No baked readable text, pseudo-text, gibberish, fake UI labels, fake charts, fake buttons, or fake status bars inside generated assets.
- No all-in-one final screenshot/room PNG that bakes stations, labels, dialogs, and characters together.
- No generic cyberpunk command center, spaceship bridge, robot control room, or neon JARVIS dashboard as the dominant style.
- No ecommerce, jewelry, supplier, AliExpress/Alibaba, Etsy listing, order, shipping, marketplace, ad, or account imagery.
- No giant god portraits or static stickers dominating the room.
- No claiming final/premium/release-ready without prompt QA, asset creation, registry, technical art normalization, visual QA, product critique, and release/no-overclaim review.

## Prompt pack draft for promptqaagent

The following prompt drafts are intentionally strict. `promptqaagent` should QA them for text-free zones, candidate-only outputs, asset separation, and rejection coverage before any asset generation.

### Prompt 01 — first viewport world/cell base

```text
Create exactly one premium image asset named world_cell_grid_base.png for the first viewport of a War Room AI-agent operating environment.

It must be an asset-first Olympus command world, not a UI mockup. The image should show an equal, symmetric room-grid / cell-world foundation: connected command cells, corridors, thresholds, and departmental chambers arranged like a living operations map. It should feel like a top-down or very shallow orthographic strategy-game environment from ancient Olympus, prepared for later clickable room hitboxes and small worker/operator overlays.

Theme priority: ancient Greek / Hellenistic Olympus command architecture first, serious strategy-game material craft second, subtle Hermes/JARVIS cyan signal energy third. Use dark marble, carved limestone, aged bronze, antique-gold inlay, Greek-key/meander discipline, stone slab seams, and restrained cyan signal channels integrated into the floor/corridor materials.

Output path and composition requirements:
- Write candidate-only output to `generated-candidates/war-room/asset-first-foundation/20260612/world-cell-grid/candidate-a/world_cell_grid_base.png`.
- 16:9 landscape, preferably 3840x2160 or highest available 16:9.
- Full-canvas background; no contact sheet, collage, preview grid, presentation board, or combined app screenshot.
- Equal/symmetric room-cell layout with clear room areas and corridors.
- Minimal empty plaque/sign areas only; no baked text.
- Leave space for later small room status glows, operators, packet trails, and accessible HTML labels.
- First 5-second read must be: Olympus AI-agent operating world / command cells, not dashboard.

Strict prohibitions:
- No CSS grid, no SaaS dashboard, no cards, no proof/debug wall, no monitor wall, no browser UI, no terminal/log screen.
- No readable text, pseudo-text, gibberish, labels, charts, buttons, status bars, ids, task keys, endpoint names, or ledger rows.
- No ecommerce, Etsy, suppliers, AliExpress/Alibaba, ShotLab, accounts, orders, shipping, ads, or marketplace imagery.
- No complete app screenshot or infographic.
- No live connection states or claims.

Output only the image asset as a candidate. Do not generate opened rooms, station props, characters, dialogs, or contact sheets in this prompt.
```

### Prompt 02 — opened Olympus Command room base

```text
Create exactly one premium image asset named olympus_command_room_base.png.

It must be the empty opened-room background for Olympus Command in a War Room AI-agent operating environment. It is only the room's architectural shell: floor, shallow walls/boundaries, thresholds, and negative space for later separate transparent station props, operator sprites, hitboxes, plaques, and dialog overlays.

Visual direction:
- Write candidate-only output to `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-room-base/candidate-a/olympus_command_room_base.png`.
- 16:9 landscape, preferably 3840x2160 or highest available 16:9.
- Full-canvas opened-room background; no contact sheet, collage, preview grid, presentation board, or combined app screenshot.
- Direct overhead or very shallow orthographic top-down camera.
- Ancient Greek / Hellenistic command hall from Olympus.
- Dark marble and carved stone floor, bronze and antique-gold inlay, Greek-key/meander borders, ceremonial thresholds, serious strategy-game finish.
- Subtle Hermes/JARVIS cyan signal accents only in stone seams or thin inlay channels.
- Clear open center and side zones for modular station/tool props and one small operator.

Strict prohibitions:
- Empty room base only: no station props, no command table, no boards, no furniture, no monitors, no lamps, no rugs, no central emblem blocking placement.
- No gods, people, statues, busts, avatars, silhouettes, or character-like shapes.
- No UI panels, dashboard cards, screens, charts, buttons, labels, readable text, pseudo-text, glyph spam, raw ids, or fake status strips.
- No ecommerce/shop/supplier/ShotLab/API/account imagery or live-action claims.
- Do not make it a spaceship bridge, cyberpunk room, SaaS dashboard, glass cockpit, or generic JARVIS monitor room.

Output only the image asset as a candidate. Do not generate station props, characters, frames, dialogs, or contact sheets in this prompt.
```

### Prompt 03 — station prop family, transparent layers

```text
Create separate transparent PNG/WebP candidate assets for Olympus Command station/tool props. Each asset must be its own file on transparent alpha, not a room scene and not a contact sheet.

Canvas and path requirements:
- Each prop must be a transparent `2048x2048` square PNG/WebP with the object centered and 8-12% transparent padding on every edge.
- One asset per file only. Return/download separate files. Do not create a combined sheet, contact sheet, collage, presentation board, preview grid, proof wall, final composed scene, or room screenshot.
- Write candidate-only files under `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-station-props/candidate-a/` with exact filenames listed below.
- If the generation tool cannot return separate files, generate exactly one prop at a time in the order below and stop after each candidate for review.

Shared style: ancient Greek / Hellenistic Olympus command tools, dark marble, carved limestone, aged bronze, antique-gold inlay, Greek-key/meander ornament, restrained cyan Hermes/JARVIS signal energy as a secondary accent. Direct-overhead or very shallow orthographic perspective compatible with a 16:9 top-down room base.

Required separate props and exact candidate filenames:
1. `station_council_war_table.png` — central mythic campaign/mission table, no readable map labels; object footprint roughly 70-82% of canvas width.
2. `station_mission_board.png` — raised historical mission board/stela with empty plaque shapes only; object footprint roughly 55-75% of canvas width/height.
3. `station_jarvis_omen_beacon.png` — oracle/signal beacon, no robot face or chat UI; object footprint roughly 55-75% of canvas width/height.
4. `station_approval_seal_shrine.png` — solemn DLV approval/locked-action shrine, no modern approval button; object footprint roughly 55-75% of canvas width/height.
5. `station_gateway_dispatch_console.png` — Hermes messenger dispatch altar/portal, no server rack or terminal logs; object footprint roughly 55-75% of canvas width/height.
6. `station_safe_autonomy_mode_pedestal.png` — bounded autonomy mode pedestal with unlabeled sockets/tiers; object footprint roughly 55-75% of canvas width/height.

For every prop:
- Transparent background required.
- No baked room floor/wall/background.
- No people, gods, avatars, statues, silhouettes, hands, faces, or character-like figures.
- No readable text, pseudo-text, labels, buttons, charts, dashboards, monitor screens, UI cards, task cards, ids, endpoint names, or status strips.
- Include a clear visual click/focus anchor and nearby empty space for a small operator sprite.
- Avoid heavy cast shadows that assume one exact floor position.

Output only these separate transparent candidate files. Do not integrate them into a room and do not create a final screenshot.
```

### Prompt 04 — operator/god presence, transparent candidate

```text
Create one transparent-background candidate asset for the first Olympus Command operator/god presence.

Asset name: operator_hermes_command_presence_idle.png.
Candidate-only output path: `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-operator/candidate-a/operator_hermes_command_presence_idle.png`.
Canvas: transparent `1024x1024` or `1536x1536` square PNG, idle-only, full marker/figure visible with 10-15% transparent padding on every edge.

Visual target: a small readable Hermes/Olympus command operator presence suitable for a top-down or shallow-orthographic strategy room. It should feel like a mythic messenger-advisor / command steward, scaled for in-room operation, not a giant portrait. Premium through silhouette, material discipline, and readability at small size.

Style: ancient Olympus / Hellenistic command world, bronze/cream/navy/gold accents, subtle Hermes wing/caduceus cues as costume/shape hints, no modern corporate avatar. Transparent alpha required.

Strict prohibitions:
- No opaque background, no floor, no room scene, no UI frame, no circular CSS-avatar look.
- No baked text, labels, icons, status badges, task ids, speech bubbles, or dashboards.
- No giant portrait, no bust-only sticker, no photorealistic statue, no generic robot, no emoji/blob/pawn.
- No ecommerce/shop/supplier/ShotLab/API/account references.

Output only the single transparent idle candidate. Do not claim walk/work animation exists unless separate states are generated later.
```

### Prompt 05 — plaques and station dialog frame, text-free

```text
Create text-free generated UI-surface assets for the Olympus Command War Room. These must be image-made plaques/frames for later HTML text overlays, not CSS cards and not a full app screenshot.

Required separate assets, exact candidate-only paths, dimensions, and safe zones:
1. `plaque_room_title_empty.png` — transparent `1600x420` PNG at `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-ui-surfaces/candidate-a/plaque_room_title_empty.png`; ornate text-free Olympus room-title plaque with clean central safe text zone approximately x 18-82%, y 28-70%.
2. `plaque_station_label_empty.png` — transparent `1100x320` PNG at `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-ui-surfaces/candidate-a/plaque_station_label_empty.png`; smaller text-free station hover/focus label plaque with clean central safe text zone approximately x 16-84%, y 28-72%.
3. `frame_station_dialog_empty.png` — transparent `2400x1600` PNG at `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-ui-surfaces/candidate-a/frame_station_dialog_empty.png`; larger text-free station/dialog frame with body safe text zone approximately x 16-84%, y 14-58%, output/artifact safe zone x 18-68%, y 62-84%, safety-lock zone x 70-88%, y 64-84%, and visually obvious close-control socket x 88-96%, y 4-13%.

Each UI-surface asset must be returned/downloaded as a separate file only. Do not create a combined sheet, contact sheet, collage, presentation board, preview grid, proof wall, full app screenshot, or composed scene.

Style: dark marble, antique gold/bronze, Greek-key/meander trim, carved stone, restrained cyan Hermes signal accents. Premium strategy-game interface artifact, but no baked content.

Strict prohibitions:
- No readable text, pseudo-text, fake labels, glyph spam, charts, buttons, status text, ids, endpoint names, task keys, or fake app data.
- No dashboard card layout, no glassmorphism SaaS rectangle, no browser window, no terminal/log frame.
- No shop/Etsy/supplier/ShotLab/API/account imagery or live connection states.
- Ornamental details must not invade the clean safe text zones.

Output only the separate text-free image assets. Do not create a screenshot or integrate into an app.
```

## Prompt QA checklist

`promptqaagent` can start from this file and should mark PASS only if:

1. The prompt pack is strict enough to keep assets separate: world base, room base, transparent props, operator, plaques/frames.
2. Prompts explicitly forbid baked text, pseudo-text, raw ids, debug/proof UI, and fake live connection claims.
3. Prompts keep all business/external systems local/read-only/NOT_CONNECTED.
4. Prompts produce candidate-only assets, not app integration or public/live paths.
5. Safe text zones and later hitbox manifest needs are defined clearly enough for technicalartist/codexintegrator.
6. The selected first slice is unambiguous: `olympus-command`.

## Downstream handoff

- `promptqaagent`: QA this file and write a prompt-readiness report. Do not generate assets.
- `assetcreator`: only after prompt QA PASS, generate candidates under a task-specific `generated-candidates/war-room/asset-first-foundation/20260612/` folder. Do not integrate.
- `assetlibrarian`: register candidate/provenance states; no generation or integration.
- `technicalartist`: normalize/proof/manifest candidates; no source integration unless separately authorized.
- `codexintegrator` / `warroomagent`: integrate only after candidates pass registry, technical art, visual QA, and explicit integration card.
- `visualqaagent`: fail the result if it still reads as CSS/debug/SaaS/proof-wall even if it builds.

## Exit verdict

PASS: The first-slice asset-first visual foundation contract is ready for `promptqaagent` without follow-up questions.
