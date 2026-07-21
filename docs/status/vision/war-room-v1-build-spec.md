# War Room v1 Build Spec

Status: buildable product spec synthesized from `war-room-final-vision-live-spec.md`
Owner: visionarchitect
Last updated: 2026-06-12
Source of truth: DLV answers Q1-Q12 in `docs/status/vision/war-room-final-vision-live-spec.md`
Scope of this document: product/design/build specification only. No app code, no assets, no live marketplace/shop actions.

## 1. Final product sentence

War Room v1 is a high-quality pixelated top-down/isometric historical strategy RPG command room where small general/advisor agent units visibly move live Kanban work through a central war table from creation to assignment, active work, QA/review, blocker handling, DLV approval, and completion.

## 2. Source-answer locks

- Q1 locks the core archetype: historical war room — generals, maps, strategy, empires.
- Q2 locks the camera/composition: top-down or isometric strategy map, like a living strategy game.
- Q3 locks the world theme: a coherent mix of Rome, Greece, Napoleon, and Asia/East, not one period and not a collage.
- Q4 locks agent representation: small generals/advisors as strategy-game map units.
- Q5 locks automation visibility: work must be alive through moving units, changing statuses, and tasks moving between stations.
- Q6 locks safety: risky decisions rise spatially to the central command table for DLV approval.
- Q7 locks the first vertical slice: war table + moving agents + live Kanban tasks.
- Q8 locks quality/reference feel: premium pixel/2D strategy RPG, between readable Pokémon-style top-down world and fantasy online, with historical/mythological atmosphere.
- Q9 locks the biggest forbidden drift: flat SaaS cards and glassmorphism.
- Q10 locks v1 definition: a full autonomous task-management system, not just a visual demo.
- Q11 locks pixel substyle: GBA/Pokémon-like, small, clean, very readable at real Workspace viewport size.
- Q12 locks information hierarchy: a functional real-state tool plus game-like dashboard, with progressive disclosure and no overload/confusion.

## 3. Visual style rules

### 3.1 Camera and layout

- Primary surface is a readable top-down or shallow isometric strategy map.
- The board must have walkable lanes, station zones, central war table focus, and enough negative space for unit motion.
- Units, task markers, and stations must be spatially located on the board instead of living only in side panels.
- Side panels may exist only as secondary inspection surfaces; they must not become the product.

### 3.2 Pixel strategy-game quality

- Use premium pixel/2D strategy RPG language: crisp silhouettes, readable tiles, restrained animation loops, clear state colors, and tactile map objects.
- The vibe should be serious command culture with charm, not childish browser-game art.
- Scale must be readable at Workspace viewport sizes: agents, task markers, and stations must remain legible without zooming.
- Pixel assets should look handcrafted and cohesive; no smooth generic AI concept-art mush as final runtime art.

### 3.3 Historical empire unification

The room may borrow motifs from multiple empires, but all must share one visual system:

- Materials: stone, parchment, bronze, dark wood, brass/gold inlay, muted campaign-map colors.
- Pattern language: Roman military geometry, Greek/Hellenistic borders, Napoleonic campaign table discipline, East/Asia strategic-scroll and command-marker influence.
- Lighting: warm tactical room light with subtle signal accents, not neon sci-fi dominance.
- Typography/labels: rendered by the app inside diegetic plaques, banners, scrolls, map labels, or table overlays.

### 3.4 Mythology and JARVIS placement

- Mythology is a symbolic character/flavor layer, not the dominant architecture.
- JARVIS/futuristic intelligence appears only as subtle operational signal: small glow, routing pulse, omen strip, or assistant annotation.
- The dominant first read must remain historical command board: generals, maps, strategy, empires.

### 3.5 UI integration

- Dynamic text and controls must appear as diegetic game surfaces: command plaques, mission scrolls, table overlays, map markers, signal banners, wax seals, or ledger panels.
- HTML/CSS can place, animate, mask, label, and orchestrate assets, but must not look like a standard SaaS dashboard.
- All meaningful task state must have both a textual/accessible representation and a visible spatial representation on the map.

### 3.6 Information hierarchy and progressive disclosure

Q12 is a hard implementation lock: War Room v1 must be a real functional tool and game-like dashboard, but it must not overload or confuse the user. The base map is not allowed to show every lifecycle field with equal visual weight.

- Default map view shows only essential state: short task label/id, lifecycle status, assigned unit, current station, and urgent blocker/approval signal.
- Long metadata — run id, full title, timestamps, parent/child links, block comments, QA logs, artifacts, and detailed summaries — appears only on hover, selection, focus, or secondary inspection surfaces.
- One followed task path is visually primary in the first vertical slice. Background tasks remain quiet and lower contrast.
- Labels must be short, sparse, diegetic, and readable. Long text belongs in an inspection ledger/panel, not on the map.
- Any implementation whose first read is card-grid/KPI/panel dominance fails visual QA even if the panels are styled as parchment or plaques.

### 3.7 GBA/Pokémon readability constraints

Q11 is a hard implementation lock: War Room v1 should feel like a clean, premium GBA/Pokémon-like top-down/isometric strategy map, not a noisy HD fantasy dashboard.

- Prefer clear tile/grid structure, readable walk paths, restrained idle loops, limited palette, and strong silhouettes.
- Small general/advisor units must be readable at actual Workspace viewport size; no tiny anonymous blobs.
- Effects must be restrained. Routing pulses and signal glows can clarify state, but cannot dominate the read.
- No HD-2D bloom/smoke/particle spectacle as the dominant presentation.
- No dark low-contrast fantasy clutter.
- No oversized ornate monuments that reduce tile readability.
- No photoreal, painterly concept-art, cinematic side-view, or generic 3D runtime UI.
- No glow-heavy sci-fi/JARVIS dominance.

## 4. Forbidden drift

The following directions are explicitly rejected for v1:

- Flat SaaS cards, glassmorphism cards, admin-dashboard grids, generic Tailwind panels, floating KPI cards as the main visual language.
- Temple-first Olympus chamber where mythology overwhelms the historical war-room/strategy-board product.
- Generic futuristic JARVIS dashboard, neon monitor wall, hologram command center, or sci-fi cockpit as the dominant theme.
- Photorealistic 3D, generic 3D, cinematic side-view rooms, or purely decorative scenes with no readable task lifecycle.
- Static pretty room with no moving agents or no live Kanban state.
- One giant baked final PNG containing all room content, UI text, stations, and agents.
- CSS/procedural/Pillow/SVG shapes presented as final art assets.
- Baked gibberish text, fake UI screenshots, fake charts, ecommerce/shop imagery, or real marketplace action affordances.
- Agents shown only as chat avatars, roster rows, circles, halos, tokens, or status pills instead of embodied strategy-map units.
- Approval/safety hidden in a badge, shrine-only metaphor, or separate modal disconnected from the central command table.
- HD-2D bloom/smoke/particle spectacle, dark low-contrast fantasy clutter, oversized monuments, painterly concept-art UI, or unreadable micro-units as the dominant visual read.

## 5. V1 scope

### 5.1 In scope for v1

- One primary War Room map surface with central command table.
- Live Kanban-backed mission/task feed.
- Small agent/general units mapped to real task assignment and status.
- Task markers/cards represented diegetically on the map as mission scrolls, markers, banners, or table tokens.
- Visible state transitions for at least one real task moving through the complete lifecycle.
- Command-table approval queue for risky actions and human gates.
- Blocker lane/table state for blocked tasks.
- QA/review station or state visible on the board.
- Completion/archive state visible as a resolved mission path.
- Locked/mock treatment for Etsy/shop/supplier/ShotLab/business actions unless DLV explicitly approves live action.
- Registry/manifest-backed modular assets: floor/base, stations, overlays, units, frames/plaques, task markers.

### 5.2 Out of scope for v1

- Multiple fully polished rooms before the first vertical slice works end-to-end.
- Marketplace/shop/supplier/ShotLab writes, purchases, publishing, paid generation, messaging, or account changes.
- Broad god/model remakes that do not serve the central war-table + live Kanban vertical slice.
- Pure visual asset production without state/lifecycle integration.
- Advanced historical faction customization beyond one coherent mixed-empire style.
- Replacing the v1 product with a generic business dashboard plus decorative background.

### 5.3 Minimal vertical-slice implementation order

Implementation must be phased. The first coding pass must prove the smallest real state loop before broad polish.

1. **Map shell:** one calm top-down/isometric map surface with central command table, mission intake, active station, QA/review area, blocker/decision lane, approval seal, and archive ledger.
2. **Data proof:** one real or clearly labeled fixture Kanban task is rendered as one mission marker with real-shaped id/title/status/assignee fields.
3. **Movement proof:** one assigned general/advisor unit deterministically moves through ready → running → review/blocked/approval → completed/superseded states.
4. **Disclosure proof:** selected mission shows details; unselected/background missions stay visually quiet.
5. **Safety proof:** risky/live actions render as locked command-table approval objects; no enabled external action controls.
6. **Style pass:** only after state proof works, replace placeholders with approved pixel/diegetic assets.

### 5.4 Placeholder policy

Temporary placeholders are allowed only to prove state, layout, and lifecycle mapping.

- Placeholders must be labeled as temporary in code, screenshots, and QA notes.
- Placeholders must preserve top-down spatial layout and must not use glass/card/dashboard language.
- Placeholder visual weight must stay below the map/units/lifecycle read.
- A visual QA card must block promotion from prototype to v1 if placeholders dominate the first read.
- CSS/procedural/SVG/Pillow shapes may prove layout, but are not final runtime art unless separately approved as deliberate pixel-game assets.

## 6. End-to-end task lifecycle states

War Room v1 must map real Kanban/task state to visible spatial game state. Required lifecycle:

1. Intake / mission created
   - Trigger: task exists or is created in Kanban.
   - Visual: new mission scroll/marker appears near the intake edge or command table inbox.
   - Data: task id, title, assignee, priority, parent links.

2. Triage / planning
   - Trigger: task needs clarification/spec/planning before execution.
   - Visual: mission marker moves to planning desk/strategy chart area.
   - Data: triage status, comments, missing info.

3. Assignment / routing
   - Trigger: task gets assignee or parent dependencies are satisfied.
   - Visual: command table routes a line/path to the chosen agent/general unit.
   - Data: assignee profile, dependency state, priority.

4. Ready / queued
   - Trigger: task is ready but not claimed.
   - Visual: mission token waits in a staging lane with idle agent or station highlight.
   - Data: ready status and queue order.

5. Claimed / agent moving
   - Trigger: worker run claims task.
   - Visual: assigned unit leaves idle position and walks toward the active work station/table.
   - Data: run id, worker profile, started time.

6. Active work
   - Trigger: task is running and heartbeats/tool work occur.
   - Visual: unit works at station; task marker pulses; live status text updates on a diegetic plaque.
   - Data: latest heartbeat, run status, tool/gate summary when available.

7. QA / review
   - Trigger: implementation or output requires validation/human/code review.
   - Visual: mission token moves to review desk or inspection table; reviewer unit appears or station activates.
   - Data: tests/build/browser QA results, review comments, approval status.

8. Blocked / needs input
   - Trigger: task calls block or has unresolved dependency/human decision.
   - Visual: marker moves to blocker lane with sealed wax/locked banner; agent waits or returns to command table.
   - Data: block reason, requested decision, comments.

9. DLV approval at command table
   - Trigger: risky external action, paid/live action, marketplace/shop/supplier/ShotLab step, destructive/admin action, or explicit human gate.
   - Visual: mission rises to central command table as an approval event; no separate disconnected modal-only flow.
   - Data: requested action, safe summary, affected target, approval/denial record.
   - Implementation boundary: approval events must be locked command-table objects showing target system/channel/shop, requested action, risk level, and disabled live execution unless explicit DLV approval exists. The vertical slice must not render enabled send/publish/buy/generate controls for marketplace, supplier, ShotLab, account, paid, or destructive actions.

10. Remediation / reroute
    - Trigger: QA fails, review requests changes, or blocked task is unblocked with new requirements.
    - Visual: mission routes back from QA/blocker to the correct station/agent.
    - Data: failing command/output or user decision, child remediation task link.

11. Completed / archived
    - Trigger: task completes with verified summary/metadata.
    - Visual: mission path resolves into archive/completed banner; agent returns to idle/next assignment.
    - Data: completion summary, artifacts, changed docs/files, verification commands.

12. Superseded / canceled
    - Trigger: task is no longer relevant or is replaced by a newer card.
    - Visual: marker is stamped superseded and moved off the active table.
    - Data: superseding task id, reason, safe closure note.

## 7. Required agents and stations

### 7.1 Required agent/unit types

- Commander / Hermes Orchestrator: routes missions, decomposes work, displays current autonomous plan.
- Vision Architect: owns style/spec guardrails, prevents drift, approves visual direction before asset work.
- Implementer / Warroom Agent: builds app integration and state mapping.
- Asset Creator: generates candidate art outside live app paths only after prompt/spec approval.
- Technical Artist / Manifest Builder: slices, normalizes, registers, and positions modular assets.
- QA Agent: verifies build, browser, visual, lifecycle, and safety gates.
- Reviewer / Approval Sentinel: handles review-required tasks and DLV approval escalation.
- Gateway / Communications Watcher: shows session/gateway health and external channel lock state without implying live sends.

### 7.2 Required stations/map zones

- Central Command Table: main war table, active mission state, routing, approval escalation, and DLV decision point.
- Mission Intake Gate: new cards/tasks enter the map.
- Planning / Strategy Desk: triage, decomposition, dependency planning.
- Agent Assignment Dais: maps assignees to unit positions and task routes.
- Active Work Stations: where agents visibly work after claiming a task.
- QA / Inspection Table: validation, tests, browser proof, review gates.
- Blocker / Decision Lane: blocked missions and questions waiting for human input.
- Approval Seal at Command Table: risky actions surface here; must remain locked until approved.
- Archive / Victory Ledger: completed/superseded tasks leave the active board.
- Gateway Beacon: shows Hermes/gateway/session health as read-only operational signal.

### 7.3 Required v1 station minimum

The first vertical slice may combine or simplify zones. It does not need all named stations to be visually large or equally weighted, but it must include enough spatial zones to prove intake/ready, active work, review or blocked or approval, and completed/superseded closure:

- Central command table for active mission focus and locked approvals.
- Intake/ready edge for created/queued work.
- One active work station.
- One QA/review, blocker/decision, or approval station/area for the human gate portion of the path.
- One archive/completed/superseded ledger.

It must not attempt to render every station with equal visual emphasis. The followed mission path is primary; additional stations remain quiet/decorative landmarks until their data state becomes active.

## 8. First vertical slice acceptance criteria

The first vertical slice is accepted only when all criteria below pass:

### 8.1 Product behavior

- A real Kanban task appears as a mission marker/scroll on the War Room map.
- The task has a visible title/id/status in a diegetic surface, not a flat SaaS card.
- The assigned agent appears as a small general/advisor unit on the map.
- When the task is claimed/running, the unit visibly moves from queue/assignment area to an active work station.
- Active work state is visible through movement/animation/status change, not only text.
- QA/review/block/approval/completion states each have a distinct spatial map state.
- At least one task can be followed end-to-end from intake/ready to active work to review/blocked-or-approval to completion or superseded closure.
- Risky or live external actions do not execute; they rise to the command table as locked approval events.

### 8.2 Visual quality

- The first read is historical strategy war room, not SaaS dashboard, not temple-first, not JARVIS-first.
- The camera reads as top-down/isometric game board.
- Units are recognizable as small generals/advisors, not anonymous circles/status pills.
- UI text is embedded in plaques/scrolls/table overlays/map markers.
- No glassmorphism cards dominate the composition.
- No one-piece baked room scene is used as the final interactive surface.
- Pixel/2D art has coherent scale, palette, and material language.

### 8.3 Technical verification

- The map is backed by real Kanban/task data, not hardcoded fake-only demo data.
- State transitions are deterministic and traceable from task/run fields.
- Asset references come from a manifest/registry or equivalent semantic data structure.
- Accessibility/text fallback exists for task title, id, assignee, status, and approval/block reason.
- Build/typecheck/lint gates for touched code must pass on implementation cards.
- Browser QA must prove the War Room route loads without console errors and shows the expected state transition.

### 8.4 Safety verification

- No Etsy/shop/supplier/ShotLab/live business write happens during the vertical slice.
- Approval-gated actions show target, risk, and requested decision before any live side effect.
- Blocked tasks show the exact human decision needed.
- Review-required implementation outputs are not auto-declared done without gates.

## 9. Pre-implementation review gate

Before any `codexintegrator` or `warroomagent` implementation lane may start, the revised build spec must pass at least one independent product/visual re-review:

- `claudevision` or `artdirector` follow-up review for Q11/Q12, progressive disclosure, placeholder policy, approval UX, GBA/Pokémon readability, and visual drift.
- `claudearchitect` or `claudereviewer` review for lifecycle/state-sync and fake-lifecycle risk if the implementation scope changes.
- `artdirector` review if the coding card adds or promotes visual assets beyond placeholders.

If any review returns FAIL/BLOCKED, Codex/WarRoomAgent implementation must stay blocked and a focused remediation card must be created instead.

## 10. Existing assets/cards to re-scope because of pixel historical strategy direction

The Q1-Q12 synthesis changes the priority from Olympus/JARVIS visual remake to pixel historical strategy-game War Room. Existing work should be re-scoped as follows:

### 10.1 Re-scope Olympus Command naming and theme

- `Olympus Command` should become a symbolic/internal room identity, not the dominant product archetype.
- Future user-facing language should favor `War Room`, `Command Table`, `Mission Map`, `General Units`, and `Strategy Board` over shrine/temple-first framing.
- Existing Olympus/m mythological motifs may remain as accents only if they support the historical command-board read.

### 10.2 Re-scope JARVIS/Omen assets

- `olympus-command.jarvis-omen-strip.v001`, `omen-icon`, and signal-glow assets must be treated as subtle intelligence/signal layers.
- They must not define the main composition as a futuristic JARVIS dashboard.
- Any prompt/card that asks for a JARVIS command bridge or monitor-wall feel should be rewritten as a historical strategy table with subtle operational signal overlays.

### 10.3 Re-scope Approval Shrine assets

- `olympus-command.approval-shrine.v001` should be reinterpreted as `command-table approval seal` or `decision seal`, spatially attached to the central command table.
- Avoid shrine-first safety UX; DLV's answer requires risky decisions to rise to the central command table.
- Existing approval/lock/seal assets can survive if they read as table seals, wax seals, locked dossiers, or campaign decision markers.

### 10.4 Re-scope floor-base candidate work

- Candidate-c floor/base evidence remains useful only as a non-live candidate/reference if it supports historical command-board readability.
- It must not be promoted if it reads primarily as Olympus temple architecture, generic sci-fi, or an empty art shell without strategy-game movement affordances.
- Future floor/base prompts should explicitly require pixel/2D top-down strategy map readability, walkable lanes, command-table placement, and room for general units.

### 10.5 Re-scope station/prop asset list

The existing registry list should be renamed/reframed for v1 build planning:

- `station_command_table.png` remains central and becomes the product anchor.
- `prop_packet_routes.png` becomes task-route/path markers for live Kanban movement.
- `station_agent_routing_dais.png` and `prop_worker_tokens.png` become general/advisor assignment units, not abstract worker tokens.
- `station_gateway_obelisk.png` stays as a read-only gateway beacon, secondary to the command table.
- Plaques/frames remain valid only as diegetic pixel UI surfaces, not card replacements.

### 10.6 Re-scope prior visual-remake cards

Cards/prompts/plans under these themes should be rewritten or superseded before more asset work:

- `JARVIS bootstrap` cards: keep operational intelligence requirements, but demote JARVIS from dominant visual archetype to subtle signal layer.
- `Olympus Command` prompt/asset cards: preserve modular asset discipline, but change art direction to historical pixel strategy war room with mythology as accent.
- `Approval Shrine` cards: convert to command-table approval/seal flow.
- `God/model remake` cards: pause unless they produce small readable general/advisor units for the strategy map lifecycle.
- `Floor base / candidate-c` release cards: treat as candidate-only until checked against the new pixel historical strategy direction.
- Any card producing flat cards, glass panels, SaaS dashboards, or generic UI frames must be rejected or rewritten.

## 11. Build priorities after this spec

1. Create/rewrite the implementation plan around the first vertical slice: war table + moving agents + live Kanban task.
2. Audit current War Room route/data model for where task/run states can drive map state.
3. Define the minimal manifest schema for map zones, stations, agent units, task markers, z-index, state, and movement path.
4. Build a non-final but style-correct pixel strategy map shell only if it supports real state movement.
5. Integrate one live task lifecycle path end-to-end before expanding rooms/assets.
6. Run product QA against this spec before any further asset-generation batch.

## 12. Non-negotiable review checklist for future cards

Before a War Room card is approved, reviewers must answer yes to all:

- Does this serve the central war table + moving agents + live Kanban v1 slice?
- Does it read as historical pixel strategy game rather than SaaS/glass/JARVIS dashboard?
- Does it preserve real task lifecycle states and safety approvals?
- Is the output modular and registry/manifest-backed?
- Are live external actions locked unless explicitly approved by DLV?
- Is mythology secondary and symbolic rather than the main architecture?
- Is the implementation verifiable through build/browser/state-transition QA?
