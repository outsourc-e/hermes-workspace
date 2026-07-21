# War Room v1 Implementation Roadmap

Status: implementation roadmap / documentation-only
Owner: designagent
Last updated: 2026-06-12
Source specs:
- `docs/status/vision/war-room-final-vision-live-spec.md`
- `docs/status/vision/war-room-v1-build-spec.md`

Scope of this file: plan the small phases to reach War Room v1. This document does not edit app code, generate assets, integrate live assets, or perform any Etsy/shop/supplier/ShotLab/live business action.

## 0. Product lock

War Room v1 is a high-quality, GBA/Pokemon-readable, top-down/isometric historical pixel strategy command room where real Kanban tasks become mission markers, small general/advisor agent units move through the lifecycle, risky decisions rise to the central command table for DLV approval, and completion/release state is visible on the map.

The first vertical slice must prove the product is an end-to-end autonomous task-management system, not a pretty room or SaaS dashboard.

## 1. Current implementation reality to preserve or replace

### Usable foundations

- Route switch: `src/screens/war-room/war-room-screen.tsx` already isolates `/war-room` variants behind `overheadV1` / `overheadV2` search flags and defaults to `WarRoomGame`. This gives implementers a safe place to add a v1 pixel strategy route flag or replace the default only after QA.
- Typed ops contracts: `src/screens/war-room/game/ops-contracts.ts` already has useful concepts: worker summaries, room ops, workflow packets, approval gates, permission locks, health states, and summary/detail API shapes.
- Live/read-only ops data: `src/server/war-room-ops-data.ts` already aggregates sessions, swarm missions, product intelligence, action locks, approval gates, and room summaries. This can be extended or adapted to Kanban task lifecycle data instead of inventing another untyped state layer.
- Scene manifest pattern: `src/screens/war-room/game/scene-manifest.ts` already uses semantic rooms/stations/agents, stable ids, coordinates, hotspots, operator spots, and safety copy. Preserve the manifest-driven pattern, but re-skin/re-scope it into one central pixel/isometric mission map.
- Existing safety contract: the current UI and data model already encode external-write/paid/account actions as locked or approval-gated. Keep that behavior and move its main visual representation to the command table.
- Registry discipline: `docs/status/war-room-asset-registry.json` already tracks semantic assets, candidate status, QA evidence, manifest ids, live paths, and release gates. Use this instead of ad hoc asset references.
- Candidate floor evidence: `generated-candidates/war-room/olympus-command/v1/candidate-c/normalized/floor_base.png` is verified as candidate-only/non-live empty floor/walls with no baked UI or characters. It can be used as visual reference or temporary candidate only after a pixel-strategy re-check; it is not final v1 art.
- Existing Hermes operator reference: `/war-room/olympus-command/hermes-90frame-v1/processed/hermes-model.png` is registered as temporary/reference-only. It can guide scale/animation needs, but should not define final agent style if it does not read as small GBA-like general/advisor unit.

### Rejected or re-scoped foundations

- Flat SaaS/glass/card language is rejected as the primary surface. Existing panels may remain only as secondary inspectors; the map must carry the product state.
- Olympus/JARVIS-first framing is re-scoped. `Olympus Command` becomes an internal/symbolic room identity; the first read must be historical war room / command table / mission map.
- Approval Shrine is re-scoped into a command-table approval seal/locked dossier/wax seal. Risky actions must rise to the central command table, not sit in a disconnected shrine-only metaphor.
- JARVIS/Omen assets are re-scoped into subtle signal strips, pulses, or assistant annotations. They must not create a futuristic monitor-wall dashboard.
- God/model remake cards are paused unless they produce small readable general/advisor units with idle/walk/work states for the strategy-map lifecycle.
- Candidate-c floor/base is not approved final art. It remains candidate/reference-only until checked against the new pixel historical strategy direction, normalized/release-QA status, manifest integration, and DLV approval.
- Worker tokens are re-scoped into embodied general/advisor units. Anonymous circles, pills, roster rows, halos, or abstract tokens do not satisfy v1.
- One giant baked room PNG remains forbidden for the interactive surface. Each required station/unit/marker/overlay must be separately addressable by manifest or code data.

## 2. Phase plan to v1

### Phase 1 — Pixel strategy map shell and lifecycle data contract

Goal: create the buildable foundation for the first vertical slice without depending on final art. The app should be able to render a spatial mission map from deterministic task lifecycle data and a semantic manifest, using placeholder art only if clearly marked non-final.

Files expected to be touched by the implementer:
- `src/screens/war-room/war-room-screen.tsx` — route to the v1 slice safely, preferably behind `?v1=1` or a clearly named local flag until QA approves default use.
- `src/screens/war-room/v1/WarRoomV1.tsx` — new map shell component.
- `src/screens/war-room/v1/war-room-v1-types.ts` — lifecycle, map zone, station, unit, and mission marker types.
- `src/screens/war-room/v1/war-room-v1-state.ts` — pure mapping from Kanban/task/run fields to visual lifecycle state.
- `src/screens/war-room/v1/war-room-v1-manifest.ts` — semantic positions for intake, planning, assignment, ready queue, active work, QA/review, blocker, command-table approval, and archive/release.
- `src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts` — deterministic lifecycle mapping tests.

Implementation tasks:
1. Define `WarRoomTaskLifecycleState` with the required states from the build spec: intake, triage/planning, assignment, ready, claimed, active, QA/review, blocked, DLV approval, remediation, completed/archived, superseded/canceled.
2. Define a `WarRoomMissionVisual` type that contains task id, title, assignee, lifecycle state, station id, route path id, risk/approval fields, accessible label, and visual token type.
3. Write pure mapping tests for representative task records: ready, running with heartbeat, review-required blocked reason, approval-gated risky action, completed, superseded.
4. Implement the pure mapper with no DOM and no network dependency.
5. Create the v1 manifest with station ids and coordinates: `mission-intake-gate`, `planning-strategy-desk`, `assignment-dais`, `ready-staging-lane`, `active-work-station`, `qa-inspection-table`, `blocker-decision-lane`, `central-command-table`, `approval-seal`, `archive-victory-ledger`, `gateway-beacon`.
6. Render a single top-down/isometric pixel-strategy map shell with one mission marker and one general/advisor unit placed by the manifest and mapper.
7. Add `data-testid` / `data-war-room-v1-*` attributes for every station, mission marker, agent unit, and lifecycle state so QA can verify without relying on visual guessing.
8. Keep all external/shop/paid actions locked. Phase 1 must not add any live side-effect button.

Machine-checkable Phase 1 exit criteria:
- `pnpm typecheck` exits 0.
- A focused test command exits 0, e.g. `pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts`.
- `pnpm build` exits 0.
- Browser QA for `/war-room?v1=1` loads with no uncaught console errors.
- DOM contains exactly one primary v1 map root: `[data-war-room-v1-map]`.
- DOM contains the central command table: `[data-war-room-v1-station="central-command-table"]`.
- DOM contains every required lifecycle station id listed above as `[data-war-room-v1-station="..."]`.
- DOM contains at least one mission marker with `data-war-room-v1-task-id` and visible text fallback for task id/title/status/assignee.
- DOM contains at least one embodied agent unit with `data-war-room-v1-agent-unit` and a role label such as commander/general/advisor.
- DOM has no dominant SaaS cards: QA should fail if the primary map surface is mostly generic `card`, glassmorphism panels, KPI grid, or dashboard table markup.
- DOM exposes locked approval copy for risky/live actions and does not expose enabled controls for publish, purchase, supplier message, paid generation, refund, renewal, or shop/account edits.
- Asset references used by Phase 1 are either manifest-backed semantic ids or clearly marked placeholders/reference-only; no one-piece final PNG is used as the whole interactive state.

### Phase 2 — Kanban-backed mission intake and real task feed

Goal: replace fake/demo mission state with real Kanban task/run data while staying read-only.

Files likely touched:
- `src/server/war-room-ops-data.ts` or a new server adapter such as `src/server/war-room-kanban-data.ts`.
- `src/screens/war-room/game/ops-contracts.ts` or v1-specific contracts.
- `src/routes/api/war-room-summary.ts` / `src/routes/api/war-room-room-detail.ts` or a new `/api/war-room-v1-*` endpoint.
- `src/screens/war-room/v1/war-room-v1-state.ts` tests.

Implementation tasks:
1. Add a read-only Kanban adapter that returns a bounded list of current tasks/runs from the board source already used by Hermes, with safe fallback if unavailable.
2. Normalize task fields into the v1 lifecycle mapper: id, title, status, assignee, priority, parents, run id, started time, heartbeat, block reason, summary/metadata, children.
3. Render several mission markers on the map without clutter; use progressive disclosure for details.
4. Keep accessible text for all visible missions.
5. Add tests for status-to-station mapping and missing-data fallback.

Exit criteria:
- At least one real Kanban task appears on `/war-room?v1=1` when task data is available.
- If Kanban data is unavailable, the UI shows an explicit read-only unavailable state, not fake success.
- Network calls are read-only.
- No live marketplace/shop/supplier/ShotLab side effects are connected.

### Phase 3 — Moving general/advisor agent units

Goal: make automation visibly alive with units moving between stations as lifecycle changes.

Files likely touched:
- `src/screens/war-room/v1/WarRoomV1.tsx`
- `src/screens/war-room/v1/WarRoomV1AgentUnit.tsx`
- `src/screens/war-room/v1/war-room-v1-manifest.ts`
- Optional CSS/module file under `src/screens/war-room/v1/` for motion primitives only.

Implementation tasks:
1. Map assignees/profiles to small unit identities: commander/orchestrator, vision architect, implementer, asset creator, technical artist, QA agent, reviewer/approval sentinel, gateway watcher.
2. Place idle units near assignment/ready areas.
3. Animate a unit from assignment/ready to active work when a task is claimed/running.
4. Animate or visually route a mission marker to QA, blocker, command-table approval, remediation, archive, or superseded lane when the lifecycle state changes.
5. Add reduced-motion support so state changes remain visible without animation.

Exit criteria:
- Unit position is derived from task/assignee/lifecycle state, not random decorative motion.
- `prefers-reduced-motion` still shows deterministic station/state changes.
- QA can read current unit state from DOM attributes.

### Phase 4 — Central war table approvals and command decisions

Goal: make DLV approval spatially central and safe.

Files likely touched:
- `src/screens/war-room/v1/WarRoomV1CommandTable.tsx`
- v1 lifecycle/state mapper
- existing approval gate contracts in `ops-contracts.ts` if reused.

Implementation tasks:
1. Render the central command table as the visual anchor for active mission, routing, approvals, and safety lock summaries.
2. Convert approval-gated tasks/actions into command-table events with target, risk, requested decision, locked actions, and audit label.
3. Use diegetic scroll/seal/table overlay language rather than modal-only or dashboard-card-first UI.
4. Keep controls disabled/read-only unless explicit DLV approval exists in the data.
5. Add tests for approval-gated state mapping.

Exit criteria:
- Any task/action with external-write/paid/account risk appears at command table approval state.
- Locked actions list is visible in text and represented spatially.
- QA can verify no enabled live-action buttons are present.

### Phase 5 — QA/review, blocker, and remediation loops

Goal: visualize the non-happy paths that make the War Room trustworthy.

Files likely touched:
- v1 map/state components.
- API normalization for blocked/review-required/remediation/superseded states.
- Tests for block/review/remediation transitions.

Implementation tasks:
1. Render QA/review station with test/build/browser proof summaries when available.
2. Render blocked tasks in the blocker/decision lane with exact human decision needed.
3. Route failed QA or review-requested tasks back to the correct station/agent as remediation.
4. Show superseded/canceled tasks as stamped and removed from active movement.
5. Preserve comments/metadata links as secondary inspection detail, not primary map clutter.

Exit criteria:
- A review-required task visibly lands in QA/review or blocker state, not completed.
- Block reason is text-readable and spatially distinct.
- Remediation route is visibly different from initial assignment route.

### Phase 6 — Pixel asset manifest and art replacement pass

Goal: replace placeholders with cohesive pixel/isometric semantic assets only after the lifecycle works.

Files/docs likely touched:
- `docs/status/war-room-asset-registry.json`
- `public/war-room/manifests/...` or a v1 manifest path
- v1 manifest file(s)
- QA evidence docs under `docs/status/visual-qa/`

Implementation tasks:
1. Define v1 asset manifest ids for floor/base, command table, station props, mission markers, approval seals, unit sprites, route overlays, plaques, and archive banners.
2. Re-check existing candidate-c and registry assets against the GBA/Pokemon-readable pixel strategy requirement.
3. Use existing assets only if they pass: top-down/isometric readability, no baked text, no one-piece final PNG, no dominant Olympus/JARVIS/glass/SaaS read, enough walkable lanes.
4. Generate or request new assets one semantic layer at a time only after prompt/QA cards approve them.
5. Keep all candidate images outside live paths until registry status, QA evidence, and approval are recorded.

Exit criteria:
- Every runtime art reference has a semantic manifest id or explicit placeholder/reference-only status.
- Visual QA rejects any asset that fails pixel strategy readability or contains baked UI/gibberish text.
- No CSS/procedural/SVG placeholder is presented as final art.

### Phase 7 — Release/readiness state and v1 default gate

Goal: ship v1 only when it can demonstrate an end-to-end task lifecycle safely and clearly.

Files likely touched:
- `/war-room` route switch/default behavior.
- QA scripts or browser inspection scripts.
- Release/status docs.

Implementation tasks:
1. Create a replayable QA scenario from one real task moving through intake/ready, active, QA/review or blocker/approval, remediation if needed, and completed/superseded archive.
2. Add browser QA assertions for route load, station presence, mission marker text, agent unit presence, approval lock, and absence of enabled live-action controls.
3. Add visual QA checklist against the v1 build spec.
4. Only after passing gates, make v1 the default `/war-room` experience or document the explicit remaining gate.
5. Archive rejected/re-scoped old visual work so future agents do not resurrect it as the main product.

Exit criteria:
- Real task lifecycle can be followed end-to-end on the map.
- Build/typecheck/test/browser QA pass with recorded commands.
- DLV approval gates remain locked and visible.
- The first read is historical pixel strategy war room, not dashboard, JARVIS bridge, or temple-first Olympus chamber.

## 3. V1 station and lifecycle mapping table

| Lifecycle | Visual station/zone | Agent behavior | Required text/accessibility | Safety note |
|---|---|---|---|---|
| Intake / mission created | Mission Intake Gate | Commander notices new scroll | task id, title, assignee/unknown, status | read-only intake |
| Triage / planning | Planning / Strategy Desk | Vision/planner unit reviews | missing info, comments, parent links | block instead of guessing |
| Assignment / routing | Agent Assignment Dais | route line from command table to unit | assignee, priority, dependency status | no hidden dispatch side effects |
| Ready / queued | Ready Staging Lane | assigned unit idle/awaiting claim | queue order, ready status | read-only queue |
| Claimed / agent moving | route path to Active Work Station | unit walks to station | run id, worker profile, started time | no fake progress |
| Active work | Active Work Station | unit works/pulses | heartbeat/tool summary if available | show stale/no heartbeat honestly |
| QA / review | QA / Inspection Table | QA/reviewer unit appears | tests/build/browser status, review comment | do not auto-complete review-required work |
| Blocked / needs input | Blocker / Decision Lane | unit waits/returns to table | exact block reason | surface human decision needed |
| DLV approval | Central Command Table + Approval Seal | mission rises to table | target, risk, requested decision, locked action | live side effects locked |
| Remediation / reroute | route back to station/agent | unit returns to fix station | failing command/output or user decision | create focused remediation tasks |
| Completed / archived | Archive / Victory Ledger | unit returns idle | completion summary, artifacts, verification | resolved mission path |
| Superseded / canceled | off-table stamped marker | unit ignores/removes marker | superseding id/reason | avoid stale work |

## 4. Sequencing rules for implementers

- Build lifecycle/data/mapping before final art.
- Keep one primary map surface; inspectors are secondary.
- Every meaningful state must exist both spatially and as accessible text.
- Do not expand into multiple rooms until the central war table + moving agents + live Kanban vertical slice passes.
- Do not promote candidate assets into live paths without registry status, QA evidence, and approval.
- Do not use one giant baked scene as the interactive surface.
- Do not connect or enable Etsy/shop/supplier/ShotLab/paid/account writes.
- Block implementation cards for review when they change code; include real command output before review.

## 5. Suggested follow-up cards

1. `Warroom Agent: Phase 1 v1 pixel map shell + lifecycle mapper`
   - Assignee: `warroomagent`
   - Scope: app code for Phase 1 only, behind `/war-room?v1=1`; no final art, no live side effects.
   - Acceptance: all Phase 1 machine-checkable exit criteria pass.

2. `QA Agent: independent Phase 1 browser/typecheck gate`
   - Assignee: `qaagent`
   - Depends on Phase 1 implementation.
   - Scope: run `pnpm typecheck`, focused tests, `pnpm build`, browser QA for `/war-room?v1=1`, and verify no live-action controls.

3. `Design Agent: pixel strategy asset manifest prompt rewrite`
   - Assignee: `designagent` or `chatgptheavy` depending on board policy.
   - Depends on Phase 1 state/station ids.
   - Scope: rewrite asset prompts/registry names from Olympus/JARVIS/shrine into pixel historical strategy war room semantics.

4. `Technical Artist: v1 manifest/register existing candidate assets as usable/rejected/reference-only`
   - Assignee: `technicalartist`.
   - Depends on asset manifest rewrite.
   - Scope: registry-only/manifest-only; no live integration without QA.

5. `Warroom Agent: Phase 2 Kanban-backed task feed`
   - Assignee: `warroomagent`.
   - Depends on Phase 1 QA pass.
   - Scope: read-only Kanban adapter and real mission marker feed.

## 6. Completion definition for this roadmap

This roadmap is complete when future workers can implement the first v1 slice without guessing:
- v1 goal and forbidden drift are explicit.
- 5-8 implementation phases are ordered.
- Current usable/rejected/re-scoped assets and systems are named.
- Phase 1 has machine-checkable exit criteria.
- The plan preserves DLV safety locks and does not authorize any live business side effect.
