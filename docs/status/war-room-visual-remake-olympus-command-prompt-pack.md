# War Room Visual Remake — Olympus Command ChatGPT Layered Prompt Pack

Task: t_2834c91f
Role: Prompt Architect
Scope: prompt pack only; no image generation; no app-code edits
Output path: `/Users/mac/hermes-workspace/docs/status/war-room-visual-remake-olympus-command-prompt-pack.md`

## Global production lock

Use these prompts only to create candidate image assets outside final app integration. Do not connect Etsy, shops, suppliers, AliExpress, Alibaba, ShotLab paid generation, publishing, uploads, messages, orders, refunds, renewals, ads, billing, account settings, or any real API write action. The War Room may show only locked, mock, theoretical, or read-only business concepts.

Every generated asset must be a modular semantic layer with a deterministic filename. Do not generate one giant complete room PNG as the final room. CSS, Pillow, SVG, canvas, procedural drawings, screenshots, or vector/card mockups are not acceptable final art. React/CSS may later place, animate, mask, label, and orchestrate approved generated assets only.

All images must be text-free: no baked words, no labels, no UI text, no fake buttons, no fake controls, no charts with text, no ecommerce screenshots, no shop UI, no gibberish, no pseudo-letters, no watermark text, no random symbols that resemble text. Any required text must be added later as real HTML overlay inside clean safe zones.

Style bible for all assets: premium mythic Greek + futuristic JARVIS command bridge; obsidian stone, dark marble, antique gold, cyan Hermes signal glow; high-detail strategy-game environment asset; serious operations center; direct overhead or shallow orthographic top-down camera; coherent scale; crisp silhouette at in-room scale; not cartoon, not SaaS dashboard, not flat vector clipart, not generic glassmorphism.

Reference-image rule: if any reference image is uploaded during ChatGPT generation, use it only as style, quality, material, lighting, camera, and polish direction. Do not copy exact artwork, labels, UI layout, symbols, character poses, proprietary marks, or room composition from the reference. If no reference image is used, record `references: none` in the asset creator handoff.

Candidate output folder for generation/downloads before QA approval:

```text
/Users/mac/hermes-workspace/generated-candidates/war-room/olympus-command/v1/
```

Deterministic filename rule: save exactly the requested filename for the asset. If multiple candidates are made later, use `candidate-a`, `candidate-b`, etc. subfolders, but do not rename the semantic file itself.

Example:

```text
/Users/mac/hermes-workspace/generated-candidates/war-room/olympus-command/v1/candidate-a/floor_base.png
```

## Controlled generation order

1. Run Prompt 01 only first: `floor_base.png`.
2. Stop for visual QA before generating any station, prop, frame, overlay, or plaque.
3. Continue only after the floor base passes the anti-slop checklist.
4. Generate later families as separate semantic assets, not combined scenes.

## Prompt 01 — Floor / architecture base only

Target deterministic filename: `floor_base.png`

```text
Create exactly one premium layered game-environment asset named floor_base.png for the Olympus Command room of a War Room interface.

If a reference image is attached, use it only as art-quality and polish direction. Do not copy exact artwork, labels, symbols, UI layout, room layout, proprietary marks, or character poses.

This asset must be ONLY the empty floor and architectural walls/base shell of the room. Direct overhead or very shallow orthographic top-down camera. Premium mythic Greek + futuristic JARVIS command bridge style: obsidian stone floor, dark marble architecture, antique gold inlay, subtle cyan Hermes signal glow accents, refined Greek key geometry, serious command-room mood.

Strict content rules:
- Empty floor and walls only.
- No command table.
- No stations.
- No gods, humans, Hermes character, workers, silhouettes, statues, busts, decorative figures, avatars, or character-like shapes.
- No UI panels, no dashboard cards, no screens, no charts, no buttons.
- No labels, no readable text, no pseudo-text, no gibberish, no symbols that look like writing.
- No central sigil, rug, giant emblem, carpet, clutter, props, furniture, monitors, tablets, lamps, or decorative objects that block placement.
- Leave broad clean walkable space and negative space for later station placement.
- The floor must support future modular transparent layers placed on top.
- Do not make one complete finished room scene.
- Do not use CSS, Pillow, SVG, procedural art, wireframes, screenshots, UI mockups, or flat vector art as the final look.
- Do not include Etsy, shop, supplier, ShotLab, ecommerce, paid action, order, message, or publish references.

Composition requirements:
- 4K-ready 16:9 landscape PNG, ideally 3840×2160 or the highest available 16:9 output from ChatGPT; keep details readable after downscaling into the app.
- Top-down/shallow orthographic perspective suitable for 2D character movement.
- Clean outer architectural boundary, subtle wall depth, premium material detail.
- Keep center and station zones open.
- No text anywhere.

Deliver only the image asset. Save/download it as floor_base.png in the candidate folder. This is the first controlled candidate only; do not generate any other room assets in this pass.
```

QA gate before continuing: reject the candidate if it contains any props, table, screens, labels, gibberish, one-piece dashboard scene, deep 3/4 perspective, blocked walking space, CSS-looking shapes, or final-room composition instead of an empty base.

## Prompt 02 — Central command table / mission routing station

Target deterministic filenames:
- `station_command_table.png`
- optional separate follow-up only: `overlay_command_table_pulse.png`
- optional separate follow-up only: `prop_packet_routes.png`

```text
Create exactly one transparent-background semantic station asset named station_command_table.png for the Olympus Command War Room.

Asset purpose: the central mission routing station, showing the command-loop heart of the room without any baked UI text. It should be a circular or hexagonal bronze-and-marble war table with elegant Greek/JARVIS design, cyan and antique-gold glowing route channels, subtle holographic material feeling, and a premium mythic command-bridge identity.

Strict content rules:
- Transparent background only; isolated station prop, not a room scene.
- No floor base, walls, surrounding dashboard, cards, labels, UI text, buttons, charts, fake monitors, screenshots, or gibberish.
- No baked words such as mission, active, route, status, approve, Etsy, shop, supplier, orders, messages, or any pseudo-text.
- No live business/action references; only abstract locked/theoretical routing symbolism.
- No CSS, Pillow, SVG, procedural art, vector UI, screenshot, or one giant PNG as final art.

Visual requirements:
- Premium mythic Greek + futuristic JARVIS command table.
- Obsidian/dark marble, antique gold trim, cyan Hermes signal glow.
- Clear silhouette readable at in-room scale.
- Leave visual/operator standing space around edges; do not include characters.
- Direct overhead or shallow orthographic angle matching floor_base.png.
- Text-free image with clean surfaces where real HTML overlays can later align nearby, not inside the art.

Deliver only station_command_table.png with alpha transparency. Do not include overlay_command_table_pulse.png or prop_packet_routes.png in this pass unless requested as separate later assets.
```

Optional pulse prompt, after station QA passes:

```text
Create exactly one transparent overlay asset named overlay_command_table_pulse.png: subtle cyan/antique-gold circular signal glow and route energy designed to sit above station_command_table.png. Transparent background, no table body, no text, no buttons, no UI, no gibberish, no screenshots, no one-piece room, no CSS/Pillow/SVG/procedural final art. Match the premium Olympus/JARVIS style and shallow top-down perspective.
```

Optional route beads prompt, after station QA passes:

```text
Create exactly one transparent prop asset named prop_packet_routes.png: small modular cyan/gold route beads and short curved signal arcs for packet motion around the central command table. Transparent background, no floor, no table, no labels, no text, no fake UI, no shop/Etsy/supplier/action references, no CSS/Pillow/SVG/procedural final art. Keep elements separated enough for later slicing/placement.
```

## Prompt 03 — JARVIS / Omen Strip command-loop frame

Target deterministic filenames:
- `frame_omen_strip.png`
- `icon_omen_eye_or_caduceus.png`
- optional separate follow-up only: `overlay_omen_signal_glow.png`

```text
Create exactly one transparent-background UI-frame art asset named frame_omen_strip.png for the Olympus Command War Room.

Asset purpose: an empty premium mythic/JARVIS command-loop frame where real HTML text will later show current mission, needs-DLV state, safe mode, working state, and next safe action.

Strict content rules:
- Text-free image; no labels, no words, no pseudo-text, no gibberish, no fake UI text.
- No buttons, no clickable controls, no dashboard cards, no charts, no screenshots.
- No Etsy/shop/supplier/ShotLab/order/message/publish references.
- No CSS, Pillow, SVG, procedural art, flat vector card, or one giant PNG final room.
- Transparent background; frame only.

Visual requirements:
- Premium mythic Greek + futuristic JARVIS style.
- Dark obsidian/marble frame, antique gold trim, cyan Hermes signal glow.
- Long horizontal omen strip/plaque with a clean empty safe zone for real HTML overlay text.
- Crisp readable silhouette at in-room UI scale.
- Not a SaaS card; it should look like generated premium artifact art.

Deliver only frame_omen_strip.png with alpha transparency.
```

Icon prompt:

```text
Create exactly one transparent icon asset named icon_omen_eye_or_caduceus.png: a premium mythic Hermes signal icon combining an omen eye or caduceus-inspired shape with antique gold and cyan glow. No text, no letters, no labels, no buttons, no dashboard UI, no shop/Etsy/supplier references, no CSS/Pillow/SVG/procedural final art. Transparent background, crisp silhouette, suitable beside frame_omen_strip.png.
```

Optional glow prompt:

```text
Create exactly one transparent overlay asset named overlay_omen_signal_glow.png: subtle cyan signal sweep/glow designed to animate over or behind frame_omen_strip.png. No text, no letters, no UI, no buttons, no screenshots, no one-piece scene, no CSS/Pillow/SVG/procedural final art. Transparent background only.
```

## Prompt 04 — Approval / safety lock shrine

Target deterministic filenames:
- `station_approval_shrine.png`
- `prop_approval_seal_locked.png`
- optional separate follow-up only: `overlay_approval_gold_cyan_glow.png`

```text
Create exactly one transparent-background semantic station asset named station_approval_shrine.png for the Olympus Command War Room.

Asset purpose: a visible approval/safety gate showing that risky business actions are locked until DLV approves. It must communicate locked review, not live action.

Strict content rules:
- Transparent background; isolated shrine/pedestal station only.
- No words, labels, UI text, pseudo-text, gibberish, fake buttons, approve buttons, dashboards, screenshots, or charts.
- No real Etsy/shop/supplier/ShotLab/order/message/publish/billing/account UI.
- Do not imply any live store connection or paid action.
- No red destructive/admin styling unless later state-specific prompts request it; this default is calm locked review.
- No CSS, Pillow, SVG, procedural art, vector card, or one giant room PNG.

Visual requirements:
- Premium mythic Greek lock shrine or pedestal: obsidian/dark marble, antique gold, cyan Hermes signal accents.
- Lock/approval meaning must be visible through shape, seal, gate, or pedestal design, not text.
- Direct overhead or shallow orthographic angle matching the room.
- Clear silhouette at station scale and operator standing space around it.

Deliver only station_approval_shrine.png with alpha transparency.
```

Locked seal prompt:

```text
Create exactly one transparent prop asset named prop_approval_seal_locked.png: a premium antique-gold/cyan locked seal or sigil that can be placed on or near station_approval_shrine.png. No text, no letters, no labels, no fake UI, no buttons, no Etsy/shop/supplier/action references, no CSS/Pillow/SVG/procedural final art. Transparent background, crisp silhouette, calm locked-review meaning.
```

Optional approval glow prompt:

```text
Create exactly one transparent overlay asset named overlay_approval_gold_cyan_glow.png: gentle gold/cyan pulse glow for an awaiting-review approval shrine. No text, no labels, no buttons, no UI, no screenshots, no live business references, no CSS/Pillow/SVG/procedural final art. Transparent background only.
```

## Prompt 05 — Gateway / session pulse station

Target deterministic filenames:
- `station_gateway_obelisk.png`
- `prop_session_beacons.png`
- optional separate follow-up only: `overlay_gateway_pulse.png`

```text
Create exactly one transparent-background semantic station asset named station_gateway_obelisk.png for the Olympus Command War Room.

Asset purpose: a Hermes relay obelisk / signal tower showing gateway and session pulse as safe, read-only/theoretical system presence.

Strict content rules:
- Transparent background; isolated obelisk/station only.
- No text, no labels, no pseudo-text, no gibberish, no buttons, no UI controls, no charts, no screenshots.
- No Discord/Etsy/shop/supplier/ShotLab live action UI, no sends, no messages, no publish/upload/order references.
- Must not imply real outbound sends or connected stores.
- No CSS, Pillow, SVG, procedural art, vector dashboard card, or one giant room PNG.

Visual requirements:
- Premium Hermes relay obelisk: obsidian/dark marble base, antique gold trim, cyan signal core/rings.
- Mythic Greek + futuristic JARVIS command-bridge identity.
- Direct overhead or shallow orthographic perspective matching floor_base.png.
- Clear silhouette at small station scale; leave operator standing space.

Deliver only station_gateway_obelisk.png with alpha transparency.
```

Session beacons prompt:

```text
Create exactly one transparent prop asset named prop_session_beacons.png: 2 to 4 small premium Hermes session beacons/tablets/markers with cyan pulse and antique-gold/obsidian materials. No text, no labels, no screens with writing, no fake UI, no buttons, no charts, no shop/Etsy/supplier/action references, no CSS/Pillow/SVG/procedural final art. Transparent background; separated modular pieces suitable for later placement.
```

Optional pulse prompt:

```text
Create exactly one transparent overlay asset named overlay_gateway_pulse.png: subtle cyan signal rings and pulse lines for station_gateway_obelisk.png. No text, no UI, no buttons, no screenshots, no live-send implications, no CSS/Pillow/SVG/procedural final art. Transparent background only.
```

## Prompt 06 — Agent routing / assignment dais

Target deterministic filenames:
- `station_agent_routing_dais.png`
- `prop_worker_tokens.png`
- optional separate follow-up only: `overlay_assignment_path.png`

```text
Create exactly one transparent-background semantic station asset named station_agent_routing_dais.png for the Olympus Command War Room.

Asset purpose: a routing/assignment dais that suggests autonomous draft-only work assignment, blockers, remediation paths, and worker status without becoming a roster dashboard.

Strict content rules:
- Transparent background; isolated station only.
- No specific character portraits, no new gods, no humans, no avatars in this batch.
- No text, labels, pseudo-text, gibberish, buttons, fake UI controls, charts, screenshots, roster cards, or dashboards.
- No Etsy/shop/supplier/ShotLab paid/live/write action references.
- Do not imply real worker sends or live business actions; this is theoretical/safe routing symbolism.
- No CSS, Pillow, SVG, procedural art, vector card, or one giant room PNG.

Visual requirements:
- Premium multi-seat/token routing dais or assignment table.
- Obsidian/dark marble, antique gold, cyan Hermes signal accents.
- Mythic Greek + futuristic JARVIS command bridge identity.
- Direct overhead or shallow orthographic angle matching floor_base.png.
- Clear silhouette; enough negative space for operator movement.

Deliver only station_agent_routing_dais.png with alpha transparency.
```

Worker tokens prompt:

```text
Create exactly one transparent prop asset named prop_worker_tokens.png: small abstract god/worker tokens or empty assignment slots for the agent routing dais. No character portraits, no new full characters, no text, no labels, no letters, no fake UI, no buttons, no charts, no Etsy/shop/supplier/action references, no CSS/Pillow/SVG/procedural final art. Transparent background; separated modular tokens suitable for later placement.
```

Optional assignment path prompt:

```text
Create exactly one transparent overlay asset named overlay_assignment_path.png: thin cyan/gold signal paths connecting the command table area to the agent routing dais area. No stations, no floor, no text, no labels, no UI, no buttons, no screenshots, no live business references, no CSS/Pillow/SVG/procedural final art. Transparent background only.
```

## Prompt 07 — Room title and micro-plaque surfaces

Target deterministic filenames:
- `plaque_room_title.png`
- `plaque_station_label_small.png`
- optional separate follow-up only: `frame_mission_brief_panel.png`

```text
Create exactly one transparent-background generated plaque asset named plaque_room_title.png for the Olympus Command War Room.

Asset purpose: a premium empty title plaque where real HTML text will later overlay the words Olympus Command.

Strict content rules:
- No baked text at all; do not write Olympus Command or any letters.
- No pseudo-text, no gibberish, no labels, no buttons, no dashboard card, no screenshot.
- No Etsy/shop/supplier/ShotLab/order/message/publish references.
- No CSS, Pillow, SVG, procedural art, flat vector UI, or one giant room PNG.
- Transparent background; plaque only.

Visual requirements:
- Antique gold and dark marble/obsidian plaque with subtle cyan Hermes signal glow.
- Mythic Greek + futuristic JARVIS identity.
- Clean central safe zone for real HTML title overlay.
- Crisp silhouette and premium material detail.

Deliver only plaque_room_title.png with alpha transparency.
```

Small station label plaque prompt:

```text
Create exactly one transparent reusable plaque asset named plaque_station_label_small.png. It must be a small premium text-free station label surface for later HTML overlay text. Antique gold, obsidian/dark marble, subtle cyan glow, mythic Greek + JARVIS style. No text, no letters, no gibberish, no UI buttons, no screenshots, no shop/Etsy/supplier/action references, no CSS/Pillow/SVG/procedural final art. Transparent background only.
```

Optional mission brief frame prompt:

```text
Create exactly one transparent frame asset named frame_mission_brief_panel.png: an empty premium mission-brief panel frame with a clean safe zone for real HTML summary text. No baked text, no pseudo-text, no buttons, no charts, no screenshots, no shop/Etsy/supplier/action references, no CSS/Pillow/SVG/procedural final art. Transparent background, antique gold, dark marble/obsidian, subtle cyan Hermes glow, mythic Greek + futuristic JARVIS style.
```

## Prompt 08 — Wall trim / border and subtle lane markings

Target deterministic filenames:
- optional: `wall_trim_or_border.png`
- optional: `floor_lane_markings.png`

```text
Create exactly one transparent overlay asset named wall_trim_or_border.png for Olympus Command.

Asset purpose: optional upper trim, Greek key rim, corner shadows, and subtle wall accent layer to sit above floor_base.png without becoming a station or UI layer.

Strict content rules:
- Transparent background; border/trim only.
- No table, stations, props, characters, UI panels, text, labels, pseudo-text, buttons, charts, screenshots, or gibberish.
- No shop/Etsy/supplier/ShotLab/live action references.
- No CSS, Pillow, SVG, procedural art, vector UI, or one giant room PNG.

Visual requirements:
- Premium obsidian/dark marble, antique gold, subtle cyan Hermes accent.
- Direct overhead/shallow orthographic alignment with floor_base.png.
- Must not clutter or block floor placement.

Deliver only wall_trim_or_border.png with alpha transparency.
```

Optional lane marking prompt:

```text
Create exactly one transparent overlay asset named floor_lane_markings.png: very subtle cyan/gold route/channel marks for floor navigation in Olympus Command. No table, no stations, no UI, no labels, no text, no gibberish, no screenshots, no live business references, no CSS/Pillow/SVG/procedural final art. Transparent background. Keep it minimal and low-contrast so it does not clutter walkable floor space.
```

## Universal rejection checklist

Reject any candidate asset if any of these are true:

- It is one giant completed room PNG instead of the requested semantic layer.
- It contains baked text, pseudo-text, UI words, labels, buttons, fake controls, fake charts, watermarks, ecommerce screenshots, or gibberish.
- It contains Etsy/shop/supplier/ShotLab paid/live/write action cues.
- It looks like CSS/Tailwind cards, SaaS admin UI, flat vector clipart, low-effort procedural art, Pillow drawing, SVG mockup, or screenshot collage.
- It uses deep perspective that breaks top-down character movement.
- It lacks transparent background for station/prop/frame/overlay/plaque assets.
- It blocks operator walking space or has an unclear silhouette at room scale.
- It cannot be placed by a manifest with filename, coordinates, z-index, scale, state, and optional animation.

## Next partner handoff

Asset Creator should use only Prompt 01 first and produce/download one controlled `floor_base.png` candidate under the candidate folder. No other assets should be generated until Visual QA approves the floor base. Manifest Builder can use this prompt pack to align deterministic filenames with the layered scene manifest.
