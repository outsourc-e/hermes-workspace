# War Room Final Vision — Live Spec

Status: Draft / DLV interview in progress
Owner: visionarchitect
Last updated: 2026-06-12

## Purpose
This file is the single source of truth for the final desired War Room experience. Agents must use it to prevent drifting into generic dashboards, generic sci-fi UI, or disconnected asset work.

## Locked principles so far
- The War Room should become a living autonomous operating system, not just a dashboard.
- Visual direction should prioritize mythology/history/Olympus and serious command culture.
- JARVIS/futuristic elements are allowed as subtle operational intelligence layers, not the dominant theme.
- Business/shop/Etsy/ShotLab/supplier actions remain mock/theoretical/locked unless DLV explicitly approves a live action.
- Assets must be modular, registry-backed, QA-gated, and not one giant final PNG.

## DLV answers

### Q1 — Core archetype
Answer: Historical war room — generals, maps, strategy, empires.
Implication: Mythology can exist as symbolic/character layer, but the room itself should primarily feel like a serious historical command room, not a temple-first Olympus chamber and not a generic futuristic JARVIS dashboard.


## Interview Protocol
DLV's multiple-choice answers are the source of truth for this live spec. Agents must record those answers here before converting them into visual archetype, production priorities, forbidden drift, v1 vertical slice, or acceptance criteria; if an answer conflicts with prior assumptions, DLV's latest answer wins and the conflict should be noted instead of guessed around.


### Q2 — Main composition / camera
Answer: Top-down / isometric strategy map — like a living strategy game.
Implication: The main War Room should prioritize readable spatial strategy, map-like movement, stations/agents placed on a board, and clear command geography over cinematic side-view rooms or flat dashboards.


### Q3 — Historical world / theme scope
Answer: Mix of empires — Rome + Greece + Napoleon + Asia/East, but unified in one coherent style.
Implication: The War Room should feel like a timeless imperial strategy command board, not a single-period reconstruction and not a random collage. Visual system must unify materials, scale, lighting, and icon language across cultures.


### Q4 — Agent representation
Answer: Small generals/advisors as map units, like units in a strategy game.
Implication: Agents should be spatial entities in the room/map with movement/status/role identity. Side panels can exist, but the core experience should show agents living on the strategy board.


### Q5 — Visibility of automation
Answer: Show the work alive: units move, statuses change, tasks move between stations.
Implication: The War Room should visualize autonomous work as living operational movement on the strategy map, not only as static status cards. Animation/state systems are core to the product, not optional decoration.


### Q6 — Approval / safety mechanism
Answer: Command table approval — risky decisions rise to the central command table.
Implication: Safety should be spatially and narratively integrated into the main war table, not a separate shrine-first metaphor and not just a tiny badge. Dangerous actions become central table events requiring DLV approval.


### Q7 — First vertical slice
Answer: War table + moving agents + live Kanban tasks.
Implication: The first “this is it” milestone is not just a pretty room. It must show task cards/mission states moving through the war table with agent units visibly working on the map.


### Q8 — Quality/reference feel
Answer: High-quality pixelated game; a mix between Pokémon-style readable top-down world and fantasy online, while mythologically and historically themed.
Implication: The target is not photorealistic, not generic 3D, and not SaaS UI. It should feel like a premium pixel/2D strategy RPG world: readable tiles, charming but serious units, animated map life, historical/mythological command atmosphere.


### Q9 — Most important forbidden drift
Answer: Flat SaaS cards / glassmorphism.
Implication: UI must avoid looking like a standard dashboard with cards. Even when HTML overlays are needed, they should be integrated into the pixel/strategy-game war room language: plaques, banners, table overlays, map markers, mission scrolls, or diegetic command elements.


### Q10 — Definition of v1 “real War Room”
Answer: A full autonomous system that truly manages tasks end-to-end.
Implication: v1 cannot be only a visual demo. It must combine the pixel/strategy war-room map with real Kanban/task lifecycle: creation, assignment, active work, QA/review, blocker handling, approval gates, completion, and visible agent movement/state transitions.


## Current distilled direction
A high-quality pixelated top-down/isometric historical war room that feels like a strategy/RPG game world: a mix of Pokémon-like readable map movement and fantasy online atmosphere, themed around a unified mix of empires — Rome, Greece, Napoleon, and Asia/East. The core room is a living strategy map with a central war table, small general/advisor units representing agents, visible movement of work between stations, and real Kanban/task lifecycle automation. The dominant theme is historical command/imperial strategy; mythology may enrich symbols/characters, while JARVIS appears only as a subtle intelligence layer. Avoid flat SaaS cards/glassmorphism above all.

## V1 target
War table + moving agent units + live Kanban/task lifecycle end-to-end: task creation, assignment, active work, QA/review, blockers, approval at the command table, completion, and visible state transitions.


### Q11 — Pixel art substyle
Answer: GBA/Pokémon-like — small, clean, very readable.
Implication: Prioritize clarity, tile readability, clean silhouettes, restrained effects, and small animated units over HD-2D spectacle or dark clutter. The War Room should be premium through coherence and polish, not through noisy lighting.


### Q12 — Game feel vs functional tool
Answer: Mix of functional tool and game-like dashboard: every unit/station should represent real state, but the screen must not be overloaded or confusing.
Implication: Use progressive disclosure. The map shows essential state visually; details appear on hover/selection/panels. Avoid dense labels and clutter. Functionality must be real, but information hierarchy must stay calm and readable.

## Open decisions
1. Core visual archetype
2. Camera / layout style
3. Main room purpose
4. Agent/god representation style
5. Level of automation visible in UI
6. Approval / safety mechanism style
7. First vertical slice definition
8. Quality bar / reference standard
9. What must be forbidden
10. What “done enough” means for v1

## Agent instructions
Before creating new visual, UI, animation, or integration work, agents must read this file plus the relevant guardrails. If this spec conflicts with older docs, create a clarification card instead of guessing.
