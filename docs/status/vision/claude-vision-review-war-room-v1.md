# Claude Vision Review — War Room v1 Build Spec

Status: FAIL for direct implementation until the required spec changes below are applied
Reviewer: claudevision
Date: 2026-06-12
Scope: Vision/product-coherence review only. No app code edited. No assets generated.

## Sources reviewed

- `docs/status/vision/war-room-final-vision-live-spec.md`
- `docs/status/vision/war-room-v1-build-spec.md`
- `docs/status/automation/war-room-agent-routing-policy.md`

## Executive verdict

The v1 build spec is directionally strong and mostly aligned with DLV's target: a clean GBA/Pokemon-like top-down/isometric historical strategy War Room with real Kanban/task lifecycle, moving general/advisor units, central command-table approval, and no flat SaaS/glassmorphism.

However, it should not go directly to implementation yet. It still needs a small but important revision pass before coding, because it under-locks DLV's later Q11/Q12 answers, risks becoming too information-dense, and leaves enough visual ambiguity for implementers to slide into either ornate dark fantasy clutter or SaaS-like task panels wrapped in decorative skins.

## PASS findings

1. Core archetype is correct.
   - The spec centers a historical war room with generals, maps, strategy, empires, and a central command table.
   - This matches DLV Q1 and the routing policy's first v1 direction.

2. Camera/composition is correct.
   - The spec repeatedly requires top-down or shallow isometric strategy-map readability.
   - It rejects side-view rooms, monitor walls, generic dashboards, and static decorative scenes.

3. Agent representation is correct.
   - Agents are required to be small general/advisor units on the map, not only rows, avatars, pills, or cards.

4. Real lifecycle is correctly treated as product core.
   - The spec requires Kanban-backed task state, assignment, running, review, blocked, approval, remediation, completed, and canceled/superseded states.
   - It also requires deterministic state transitions and accessibility/text fallback.

5. The biggest forbidden drift is named.
   - Flat SaaS cards, glassmorphism, generic Tailwind panels, KPI grids, JARVIS-first sci-fi, and temple-first Olympus are explicitly rejected.

6. Safety/approval is aligned.
   - Risky/live/external actions rise to the central command table as locked approval events.
   - This matches DLV Q6 and existing shop/ShotLab/business safety constraints.

7. Routing policy supports the right lanes.
   - Vision/design judgement is separated from code integration, asset generation, QA, and release.
   - Codex is correctly limited to bounded implementation input, not vision ownership or direct lifecycle authority.

## FAIL / not-ready findings

### 1. Q11 and Q12 are not promoted into the build-spec source locks

`war-room-final-vision-live-spec.md` now includes:

- Q11: GBA/Pokemon-like — small, clean, very readable.
- Q12: Functional tool + game-like dashboard, with every unit/station representing real state, but no overload/confusion.

But `war-room-v1-build-spec.md` still says its source of truth is Q1-Q10 and its source-answer locks only list Q1-Q10. The spec contains some Pokemon/readability language, but it does not treat Q11/Q12 as hard locks.

Risk: implementation can overbuild a visually impressive but too dark/noisy/HD fantasy interface, or can represent too much state at once because Q12's "not overloaded or confusing" constraint is not treated as binding.

Required change: update the build spec to say it is synthesized from Q1-Q12 and add hard locks for Q11 and Q12.

### 2. Information hierarchy is under-specified

The build spec requires many states, zones, agents, stations, text fallbacks, movement, approval, blockers, gateway health, QA, archive, and routing. This is product-correct, but it can easily produce an overloaded single screen.

Risk: the first vertical slice becomes a busy board full of labels, paths, seals, stations, tokens, banners, hover text, and status plaques. That would violate DLV Q12 even if every element is individually diegetic.

Required change: add an explicit information hierarchy contract:

- Default map view shows only essential state: task id/title short label, status, assigned unit, current station, and urgent blocker/approval signal.
- Secondary details appear only on hover/selection/focus panel.
- At any one time, the vertical slice should visually emphasize one followed task path plus ambient background tasks, not every lifecycle detail equally.
- Labels must be short and sparse; long metadata belongs in inspection/details surfaces.

### 3. "Pokemon-like" needs a stronger negative definition

The spec says premium pixel/2D strategy RPG and readable Pokemon-style top-down world, but it also mentions fantasy online, mythology, empires, warm tactical light, signal accents, and many station types.

Risk: implementers can drift toward HD-2D spectacle, dark fantasy MMO clutter, ornate temple assets, glow-heavy JARVIS effects, or high-detail concept-art backgrounds. These may feel premium but not GBA/Pokemon-like clean and readable.

Required change: add explicit visual negatives:

- No HD-2D bloom/smoke/particle spectacle as the dominant read.
- No dark low-contrast fantasy clutter.
- No oversized ornate monuments that reduce tile readability.
- No tiny unreadable unit silhouettes.
- No photoreal or painterly concept art as runtime UI.
- Prefer clean tile grid, readable silhouettes, limited palette, restrained idle loops, clear walk paths.

### 4. The first vertical slice is too broad unless phased

The acceptance criteria require QA/review/block/approval/completion states each to have a distinct spatial map state, and at least one task followed end-to-end. That is correct for the target, but it needs a minimal implementation slice definition so coding starts with the smallest real proof.

Risk: implementation tries to build all stations, all states, all agents, and full visual polish before proving the core loop. This increases drift and makes QA harder.

Required change: define an implementation order:

1. Shell: one map surface, central table, intake, active station, review/blocked/approval area, archive.
2. Data proof: one real Kanban task rendered as one mission marker with real id/title/status/assignee.
3. Movement proof: one assigned general unit moves through ready -> running -> review/blocked/approval -> completed/superseded.
4. Disclosure proof: selected mission shows details; unselected missions stay visually quiet.
5. Style pass: replace temporary visuals with approved pixel/diegetic assets only after state proof works.

### 5. Approval UX is conceptually right but needs implementation boundaries

The spec says risky actions rise to the command table and no live external side effects occur without approval. It does not yet specify the visible locked state enough for implementation.

Risk: implementers may create a modal, badge, or panel that technically contains approval text but is not spatially integrated; or they may accidentally expose action buttons that imply live marketplace/shop/ShotLab execution.

Required change: specify that approval events must be rendered as locked command-table objects with:

- target system/channel/shop clearly named,
- requested action summarized,
- risk level shown,
- live execution disabled unless explicit DLV approval exists,
- no fake "send/publish/buy/generate" affordance in the vertical slice unless it is visibly locked/mock.

### 6. Asset strategy is correct but still permits placeholder drift

The spec rejects one giant baked PNG and CSS/procedural/Pillow/SVG shapes as final art assets. That is good. But the implementation phase will still need placeholders.

Risk: temporary CSS boxes/cards become permanent, or placeholder dashboard panels get accepted because they are functional.

Required change: add a placeholder policy:

- Temporary placeholders are allowed only for state proof.
- They must be labeled as temporary in code/docs/screenshots.
- They must preserve top-down spatial layout and not use glass/card dashboard language.
- A visual QA card must block promotion from prototype to v1 if placeholders dominate the first read.

## Visual drift risks to watch during implementation

1. Flat SaaS dashboard in disguise
   - Decorative parchment cards or translucent panels can still read as SaaS cards if they dominate the screen.
   - Fix: the map and units must be the primary read; panels only inspect selected map objects.

2. Glassmorphism returning through status overlays
   - Blurred panels, floating KPI tiles, soft neon borders, and generic Tailwind grids are explicitly off-target.
   - Fix: use plaques, scrolls, markers, table tokens, seals, and ledgers with pixel-game styling.

3. JARVIS/sci-fi becoming dominant
   - Routing pulses and signal accents are allowed, but neon HUDs, monitor walls, hologram UI, or cockpit aesthetics are not.
   - Fix: keep intelligence effects small and subordinate to the historical command table.

4. Olympus/temple-first relapse
   - Mythology can enrich symbols and characters, but a shrine/temple chamber is not the product.
   - Fix: first read must be strategy map, war table, generals, routes, and missions.

5. Over-ornate empire collage
   - Rome + Greece + Napoleon + Asia/East can become a random museum collage.
   - Fix: unify everything through one tile scale, shared palette, shared material rules, and one icon language.

6. Pixel art becoming noisy or unreadable
   - GBA/Pokemon-like means small, clean, and legible, not dark MMO detail density.
   - Fix: test at actual Workspace viewport size before adding detail.

7. Tokenized agents instead of embodied units
   - Circles, initials, pills, icons, or roster rows fail DLV Q4.
   - Fix: every active worker must have a small readable general/advisor unit with role identity and map position.

8. Fake lifecycle theater
   - Animated tasks that are not tied to real Kanban/run fields will fail the v1 target.
   - Fix: every visible state must trace back to task/run/comment/heartbeat/block/completion data.

## Information overload risks

1. Too many lifecycle states visible at once
   - The spec lists 12 lifecycle states. Showing all as equal-weight stations will overwhelm the screen.
   - Mitigation: show one followed mission path prominently; collapse non-active states into quiet zones or small map markers.

2. Too many labels
   - Task id, title, assignee, priority, parent links, run id, heartbeat, QA results, block reason, approval target, and artifacts cannot all be visible on the base map.
   - Mitigation: base marker shows short title/status; details appear on selection.

3. Too many agent roles
   - Eight required unit types can become a crowded character roster.
   - Mitigation: v1 should instantiate only the units needed by the visible lifecycle path; other roles can be represented as inactive station inhabitants or omitted until their state appears.

4. Too many station zones
   - Intake, planning, assignment, active, QA, blocker, approval, archive, gateway can crowd a single map.
   - Mitigation: combine early v1 zones where possible without losing state clarity, e.g. command table can cover routing + approval, one inspection desk can cover QA/review, one side lane can cover blocked.

5. Motion noise
   - If routes, pulses, idle animations, status changes, and hover effects all run constantly, the screen will feel chaotic.
   - Mitigation: only the selected/followed task has strong motion; background motion should be sparse and low amplitude.

## Exact changes needed before implementation

Apply these changes to `docs/status/vision/war-room-v1-build-spec.md` before assigning implementation cards:

1. Change the source line from Q1-Q10 to Q1-Q12.

2. Add source-answer locks:
   - Q11 locks pixel substyle: GBA/Pokemon-like, small, clean, very readable.
   - Q12 locks information hierarchy: functional real-state tool plus game-like dashboard, with no overload/confusion; use progressive disclosure.

3. Add a section named `Information hierarchy and progressive disclosure` with the following requirements:
   - Default map view shows only essential state.
   - Long metadata is hidden until hover/selection/focus.
   - One followed task path is visually primary.
   - Background tasks remain quiet.
   - Labels are short, sparse, and diegetic.
   - Any implementation with card-grid dominance fails visual QA.

4. Add a section named `GBA/Pokemon readability constraints`:
   - Clean tile readability at actual Workspace viewport size.
   - Small readable general/advisor silhouettes.
   - Limited palette and restrained effects.
   - No HD-2D spectacle, dark fantasy clutter, painterly concept-art UI, or glow-heavy sci-fi dominance.

5. Add a section named `Minimal vertical-slice implementation order`:
   - map shell,
   - one real Kanban task marker,
   - one moving assigned unit,
   - one end-to-end lifecycle path,
   - selection/details disclosure,
   - then style/asset polish.

6. Clarify required v1 station minimum:
   - Do not require all named stations to be visually large or equally weighted in the first implementation.
   - Require only enough zones to prove intake/ready, active, review or blocked or approval, and completed/superseded.
   - Additional stations can be decorative/quiet until their data state is active.

7. Add approval object requirements:
   - locked command-table object,
   - target/action/risk visible,
   - live action disabled without DLV approval,
   - no fake live marketplace/shop/ShotLab execution affordance.

8. Add placeholder policy:
   - placeholders may prove state only,
   - placeholders must not use SaaS/glass/card-grid language,
   - placeholders must be clearly marked temporary,
   - visual QA must reject promotion if placeholders dominate.

9. Add a pre-implementation review gate:
   - After the build spec revision, claudevision or artdirector must re-read the revised spec before codexintegrator/warroomagent starts implementation.

## Bottom line

The current v1 build spec is a strong foundation and captures the core DLV direction. It fails only as an implementation handoff because it needs Q11/Q12 promoted to hard locks and needs stricter information-hierarchy/readability constraints. After the exact changes above, it should be safe to route a bounded implementation plan without drifting back into flat SaaS, glassmorphism, JARVIS dashboard, Olympus shrine, or overloaded strategy-board clutter.
