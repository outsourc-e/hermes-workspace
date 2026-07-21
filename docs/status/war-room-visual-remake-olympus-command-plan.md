# War Room Visual Remake — Olympus Command Layered Asset Plan

Task: t_11c81911
Role: Design Planner
Scope: Olympus Command only
Status: ready for Prompt Architect handoff

## Safety / scope lock

- Work remains inside `/Users/mac/hermes-workspace` and Kanban board `warroom`.
- No Etsy, shop, supplier, AliExpress/Alibaba, ShotLab paid, publish, upload, message, order, account, billing, or real API write actions.
- This is a design/planning output only: no image generation, no app-code edits, no live integrations.
- Final visuals must be ChatGPT-generated premium modular assets. CSS/React may place, mask, animate, label, and orchestrate; CSS/Pillow/SVG/procedural drawings are not final art.
- Olympus Command assets must be semantic layers, not one giant PNG.

## Room goal

Olympus Command is the first-glance control room of the War Room: a premium mythic JARVIS-style command bridge where DLV immediately understands: what mission is active, what Hermes is doing, what needs approval, what is locked, and where packets/agents are being routed.

The room should feel like a living Mount Olympus command table, not a dashboard. It needs clear empty floor/lanes for Hermes movement, a central operations table, approval/safety lock shrine, mission routing displays, and subtle command-loop energy. Dynamic text belongs in real HTML overlays or generated empty frames/plaques with safe text zones — never baked gibberish in the art.

Target feel:
- mythic Greek + futuristic JARVIS command bridge
- obsidian / marble / antique gold / cyan Hermes signal glow
- high-detail premium strategy-game room, direct overhead or shallow orthographic top-down
- serious operations center, not cartoon, not SaaS cards, not CSS rectangles
- first room in the 24h remake production line, reusable as quality bar for later rooms

## Asset families for Olympus Command

### 1. Floor / architecture base

Purpose: clean placement canvas for all other layers.

Required assets:
- `floor_base.png` — empty Olympus Command floor and walls only.
- `wall_trim_or_border.png` — optional transparent upper trim / Greek key rim / shadow vignette.
- Optional `floor_lane_markings.png` — very subtle transparent route/channel marks only if they do not clutter the walkable floor.

Rules:
- No baked gods, stations, UI panels, text, labels, table, monitors, props, sigils, carpets, dashboard cards, or action icons.
- Leave broad clear walkable areas and negative space for station placement.
- Camera must match the War Room layered-scene requirement: direct overhead or shallow orthographic; no deep 3/4 perspective that makes characters slide like stickers.

### 2. Central command table / mission routing station

Purpose: the main “what is happening now” artifact.

Required assets:
- `station_command_table.png` — transparent asset: circular/hexagonal bronze-marble war table with glowing map channels, no text.
- `overlay_command_table_pulse.png` — optional transparent cyan/gold signal glow.
- `prop_packet_routes.png` — optional separate small transparent route beads/arcs for packet motion, if creator can keep it modular.

Visible meaning:
- active mission state
- route decisions
- packet/source → target flow
- command loop heart of the room

Forbidden:
- baked labels like “active mission” inside the image
- generic sci-fi control panel without Olympus identity
- one giant table image that also contains surrounding UI cards

### 3. JARVIS / Omen Strip command loop

Purpose: readable, first-glance “Hermes is thinking / deciding / waiting for DLV” layer.

Required assets:
- `frame_omen_strip.png` — text-free generated frame/plaque with clean safe zone for HTML text.
- `icon_omen_eye_or_caduceus.png` — transparent mythic signal icon.
- `overlay_omen_signal_glow.png` — subtle animated glow layer.

Dynamic UI text to overlay later:
- current mission
- “needs DLV” / “safe mode” / “working” state
- next safe action

Prompt Architect must forbid baked text in these assets.

### 4. Approval / safety lock shrine

Purpose: all risky business actions visibly locked and routed to DLV decision.

Required assets:
- `station_approval_shrine.png` — transparent shrine/lock pedestal, no text.
- `prop_approval_seal_locked.png` — transparent lock/seal state.
- `overlay_approval_gold_cyan_glow.png` — gentle pulse for “awaiting review”.

Visible meaning:
- no Etsy/shop/supplier/ShotLab paid/live action without approval
- DLV decision gate
- review queue and blockers

Avoid:
- scary error visuals
- red destructive/admin styling unless the state is actually blocked
- fake clickable “approve” art baked into image

### 5. Gateway / session pulse station

Purpose: show that the workspace/gateway/agents are alive but safe.

Required assets:
- `station_gateway_obelisk.png` — transparent Hermes relay obelisk / signal tower.
- `prop_session_beacons.png` — 2–4 small transparent status beacons or tablets.
- `overlay_gateway_pulse.png` — subtle teal/cyan signal rings.

Visible meaning:
- gateway/session pulse
- Discord/Hermes communication status as theoretical/read-only signal
- no real outbound sends unless explicitly approved

### 6. Agent routing / assignment dais

Purpose: visually connect Olympus Command to Pantheon/agents without turning it into a roster dashboard.

Required assets:
- `station_agent_routing_dais.png` — transparent multi-seat or token routing table/dais.
- `prop_worker_tokens.png` — small transparent god/worker tokens or empty slots; no specific new character generation in this batch unless Prompt Architect splits it into a separate family.
- Optional `overlay_assignment_path.png` — thin signal lines from command table to agent dais.

Visible meaning:
- assign draft-only work
- inspect worker status
- route blockers / remediation cards

### 7. Hermes command operator

Purpose: Olympus Command needs Hermes presence, but no character remake in this first batch unless explicitly approved.

Existing reference:
- current Hermes assets appear under `/war-room/olympus-command/hermes-90frame-v1/processed` in the app.

First batch stance:
- Reuse existing Hermes as temporary operator if acceptable to Integrator.
- Do not regenerate Hermes in this batch unless a separate card is created.
- If a new Hermes layer is needed later, it must preserve approved 90-frame style/scale and include idle/walk/work strips, not one still pose.

### 8. Room title / micro plaques

Purpose: generated surfaces for labels, not CSS pills.

Required assets:
- `plaque_room_title.png` — text-free title plaque for “Olympus Command” HTML overlay.
- `plaque_station_label_small.png` — reusable text-free station label plaque.
- `frame_mission_brief_panel.png` — optional generated empty frame for short mission summary.

Rules:
- All text overlayed by React/HTML.
- Plaques must have safe text zones and not fight the room art.

## Priority order for first visual remake batch

1. Floor base candidate
   - One clean Olympus Command empty room base.
   - Must pass anti-slop before any props are created.

2. Central command table
   - Main station prop that defines the room identity.
   - Needs transparent background and operator space around it.

3. Approval / safety lock shrine
   - Required because War Room business safety must be obvious from first glance.

4. JARVIS / Omen Strip frame and icon
   - Required by 24h guardrails as the command-loop layer.
   - Must be a generated text-free frame, not CSS card.

5. Gateway/session pulse station
   - Makes the room feel connected to Hermes operations without live side effects.

6. Agent routing dais / worker token layer
   - Adds “autonomous system routing work” meaning without overcrowding.

7. Plaques / label surfaces
   - Needed before integration so labels do not become cheap CSS pills.

8. Optional overlays
   - Glow/pulse/route effects only after the base and stations pass; they must remain subtle and modular.

## Anti-slop acceptance criteria

A candidate fails if any of these are true:

- It is a single complete room PNG with baked stations, UI, labels, gods, and text all in one layer.
- It looks like CSS/Tailwind dashboard cards, generic glassmorphism, SaaS admin panel, or flat vector clipart.
- It uses baked AI gibberish text, fake UI buttons, fake charts, random ecommerce screenshots, or duplicated labels.
- The floor base contains central props/sigils/tables that block future movement and station placement.
- Perspective is too deep for top-down movement, making operators appear to slide on walls or float.
- Station props are square-card crops, thumbnails, or background slabs instead of isolated transparent objects.
- It looks childish, cheap 2002 browser-game, noisy AI mush, or generic fantasy unrelated to Hermes/Olympus/JARVIS.
- It hides safety/approval meaning or suggests live shop actions are connected.
- It cannot be named semantically as floor, station, prop, overlay, frame, or character layer.
- It cannot be verified as modular by a future manifest with coordinates, z-index, scale, and state.

Minimum pass bar:
- premium mythic/futuristic visual quality
- separate semantic file per layer
- no baked text
- clear safe zones for HTML labels/status
- visible first-glance hierarchy: command table, approval shrine, Omen strip, gateway pulse, agent routing
- read-only / locked business actions remain conceptually obvious

## Partner handoff — Prompt Architect (`chatgptheavy`)

Prompt Architect should convert this plan into a prompt pack with one prompt per semantic asset family. The first prompt must create only the `floor_base.png` candidate; do not ask for a full room or all stations at once.

Prompt pack requirements:
- Include the safety/scope lock in every prompt: no live shop/action text, no Etsy UI, no fake real dashboard screenshots.
- Use the Olympus/JARVIS style bible: premium mythic Greek command bridge, obsidian/marble/antique gold/cyan Hermes signal glow, high-detail game asset, direct overhead/shallow orthographic.
- Explicitly state: “text-free image, no labels, no UI text, no buttons, no gibberish.”
- Explicitly state: “semantic layer only; transparent background” for station/prop/overlay/frame assets.
- For floor base: “empty floor/walls only; no table, stations, gods, props, central sigil, labels, UI, rugs, or decorative clutter.”
- For each station prop: require operator standing space and clear silhouette at small in-room scale.
- Require deterministic filenames and a candidate output folder outside final app integration until QA approves.
- Require one controlled candidate first, then QA, then subsequent assets.

Suggested output path for Prompt Architect prompt pack:
- `/Users/mac/hermes-workspace/docs/status/war-room-visual-remake-olympus-command-prompt-pack.md`

## Next cards needed

1. `Prompt Architect: Olympus Command ChatGPT layered prompt pack`
   - Assignee: `chatgptheavy`
   - Depends on: this planner card.
   - Output: `/Users/mac/hermes-workspace/docs/status/war-room-visual-remake-olympus-command-prompt-pack.md`
   - Scope: prompts only; no image generation; must start with floor-base candidate prompt.

2. `Manifest Builder: Olympus Command layered asset schema`
   - Assignee: `warroomagent`
   - Depends on: this planner card.
   - Output: manifest schema/contract doc or typed manifest stub under `/Users/mac/hermes-workspace`.
   - Scope: define room manifest fields for floor, stations, overlays, plaques, Hermes operator, coordinates, z-index, scale, animation states; no final art invention.

3. `Visual QA: Olympus Command anti-slop checklist and browser QA method`
   - Assignee: `qaagent`
   - Depends on: this planner card.
   - Output: concise QA checklist/script plan for modular layered scenes.
   - Scope: fail one-giant-PNG, CSS/Pillow/SVG final art, baked gibberish text, station card crops, clipping, wrong perspective, missing safety lock.

4. `Asset Creator: Olympus Command floor-base controlled candidate`
   - Assignee: `chatgptheavy`
   - Depends on: Prompt Architect prompt pack and QA checklist.
   - Output: one downloaded ChatGPT floor-base candidate outside app integration, with visual QA evidence.
   - Scope: generate only floor/walls base; no props/stations/gods; use single ChatGPT tab pipeline.

5. `Integrator: Olympus Command layered scene vertical slice`
   - Assignee: `warroomagent`
   - Depends on: approved floor base, command table prop, approval shrine prop, Omen strip frame, and manifest schema.
   - Output: browser-visible layered Olympus Command scene using manifest-driven assets.
   - Scope: React placement only; no CSS art substitution; preserve read-only safety locks.

## Completion note

This planner card is complete when this file exists and the next cards above are present in the plan. No image generation or app-code edit is part of this card.
