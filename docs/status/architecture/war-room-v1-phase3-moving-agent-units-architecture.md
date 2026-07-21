# War Room v1 Phase 3 — Moving Agent Units Architecture

Status: PASS for a bounded implementation card
Date: 2026-06-12
Owner lane: claudearchitect
Scope: architecture contract only. No app code was edited by this task.

## 1. Verdict

Phase 3 is implementation-ready only as a small deterministic motion layer on the existing explicit `/war-room?v1=1` Phase 2 slice.

PASS conditions:

- Movement is derived only from read-only Kanban lifecycle data already normalized by Phase 2.
- Unit identity, role, station, route, and motion state are pure deterministic outputs of task + assignee/profile + feed metadata.
- Stale, unavailable, fixture, fallback, or degraded feeds render honest static/degraded units. They must not animate to imply real progress.
- Reduced-motion users still see exact station/state changes through text, position, and DOM hooks without animated travel.
- The implementation touches only the files listed in this contract.

BLOCK conditions for the next card:

- Any request to add task writes, dispatch, approval, status mutation, marketplace/shop/supplier/ShotLab/paid/account actions, or direct SQLite write paths.
- Any request to promote v1 to default `/war-room`.
- Any request to replace gods/models/assets, integrate new public art, or present CSS/procedural placeholders as final art.
- Any motion proposal based on random wandering, decorative idle loops, fake progress percentages, or invented task/run/QA evidence.

Safety statement: Etsy/shops are not connected; only mock/theoretical UI is allowed.

## 2. Inputs read

- `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_24H_AUTONOMOUS_DEV_GUARDRAILS.md`
- `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_JARVIS_DEFINITION_OF_PERFECT.md`
- `docs/status/automation/war-room-agent-routing-policy.md`
- `docs/status/vision/war-room-final-vision-live-spec.md`
- `docs/status/vision/war-room-v1-implementation-roadmap.md`
- `docs/status/architecture/war-room-v1-phase2-live-kanban-lifecycle-architecture.md`
- Current v1 files under `src/screens/war-room/v1/`
- Phase 2 implementation / QA / release task results: `t_44294b17`, `t_7093fc91`, `t_29b466a8`

## 3. Current implementation facts

Phase 2 already provides:

- Explicit-only route: `/war-room?v1=1`.
- Read-only Kanban endpoint: `/api/war-room-v1-kanban-lifecycle?board=warroom&limit=12`.
- Honest feed states: `hermes-dashboard-kanban`, `workspace-kanban-fallback`, `unavailable`, `fixture`.
- Pure mapper: `mapWarRoomV1Mission()` in `src/screens/war-room/v1/war-room-v1-state.ts`.
- Existing lifecycle, station, route, mission, unit role, and feed types in `war-room-v1-types.ts`.
- Manifest stations and routes in `war-room-v1-manifest.ts`.
- `WarRoomV1.tsx` renders mission markers and exactly one embodied unit for the primary mission, but the unit is currently static and lacks a dedicated motion contract.
- Phase 2 QA passed with 12 real read-only task markers, 1 map root, lifecycle hooks, 1 agent unit, 2 approval locks, no enabled external write controls, and no relevant browser console/network failures.
- Phase 2 release review warns that the slice is DLV-review-ready only, not final v1 or visual perfection.

Phase 3 must therefore add motion semantics, not new data authority.

## 4. Exact allowed files for the next implementation card

Allowed new/modified files:

- `src/screens/war-room/v1/war-room-v1-types.ts`
  - Add motion, unit identity, unit station, unit route, and unit DOM hook types only.
- `src/screens/war-room/v1/war-room-v1-state.ts`
  - Extend pure mapping so `WarRoomV1MissionVisual.unit` includes deterministic identity, current station, target station, source station, route id, and motion state.
  - Keep mapper pure and testable; no DOM, timers, random values, fetches, or browser APIs.
- `src/screens/war-room/v1/war-room-v1-manifest.ts`
  - Add route start/end metadata or station offsets only if needed to place units without overlap.
  - Do not change station ids from Phase 1/2.
- `src/screens/war-room/v1/WarRoomV1AgentUnit.tsx`
  - New presentational component for one small general/advisor/reviewer/gate unit.
  - Reads the mapped unit contract and emits stable DOM hooks.
  - May use CSS transitions/classes, but must not own lifecycle truth.
- `src/screens/war-room/v1/WarRoomV1.tsx`
  - Replace inline primary unit markup with `WarRoomV1AgentUnit`.
  - Render active/static/degraded motion state from mapper output.
  - Preserve existing map, feed source, stations, mission markers, approval locks, non-live disclosures, and read-only copy.
- `src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts`
  - Extend mapper tests for unit identity and motion state.
- `src/screens/war-room/v1/__tests__/war-room-v1-agent-motion.test.tsx`
  - New component/DOM tests if React Testing Library/jsdom is practical in this repo.
  - If component testing proves brittle, keep assertions in the mapper test and static regression gate instead.
- `scripts/war-room-v1-regression-gate.mjs`
  - Add static checks for required Phase 3 motion hooks and reduced-motion/degraded selectors.
- `scripts/war-room-v1-screenshot-evidence.mjs`
  - Add browser assertions for unit role, lifecycle, route id, current station, target station, and motion state when available.
- `docs/status/implementation/war-room-v1-phase3-moving-agent-units-handoff.md`
  - Optional implementation evidence artifact only if the implementation card is asked to write one.

Forbidden files/areas:

- No `src/routes/api/**` changes for Phase 3.
- No `src/routeTree.gen.ts` changes are expected for Phase 3.
- No `package.json`, lockfile, dependency, Electron, Vite, Tailwind, global style, or config changes unless an existing gate proves a missing dependency and reviewer explicitly approves scope.
- No `public/war-room/**`, generated candidates, asset registry, god/model/asset-family replacement, or final art promotion.
- No Hermes config, credentials, profile memory/skills/cron, `.env`, gateway runtime config, or direct Kanban DB write code.
- No `/api/swarm-kanban` write expansion and no POST/PATCH/DELETE behavior from the War Room v1 UI.

## 5. Phase 3 data contract

Add or extend the existing visual contract so each mission has one deterministic moving unit description:

```ts
type WarRoomV1UnitIdentity = {
  id: string
  profile: string
  displayName: string
  role: 'commander' | 'vision-architect' | 'implementer' | 'asset-creator' | 'technical-artist' | 'qa-agent' | 'reviewer' | 'gateway-watcher' | 'advisor' | 'general'
  spriteKind: 'general' | 'advisor' | 'review-captain' | 'gate-warden'
}

type WarRoomV1MotionState = 'active' | 'static' | 'degraded'

type WarRoomV1UnitMotion = {
  sourceStationId: WarRoomV1StationId
  currentStationId: WarRoomV1StationId
  targetStationId: WarRoomV1StationId
  routeId: WarRoomV1RouteId
  motionState: WarRoomV1MotionState
  reducedMotionLabel: string
  reason: string
}
```

`WarRoomV1MissionVisual.unit` should expose:

- `id`: stable deterministic id, e.g. `unit-${task.id}-${normalizedProfile}` or `unit-${task.id}` if the task id is enough.
- `identity.profile`: original assignee/profile string or `unassigned`.
- `identity.displayName`: readable label, e.g. `codexintegrator implementer`.
- `identity.role`: small semantic role derived from assignee/profile and lifecycle.
- `identity.spriteKind`: maps role to current placeholder shape; not final art.
- `position`: deterministic map coordinate for the current lifecycle state.
- `motion.sourceStationId`: previous/source station for route semantics.
- `motion.currentStationId`: station represented by current rendered position.
- `motion.targetStationId`: destination station for current lifecycle.
- `motion.routeId`: route id from manifest.
- `motion.motionState`: `active`, `static`, or `degraded`.
- `motion.reason`: short honest explanation used in DOM/ARIA/debug text.

### Profile/assignee to unit identity mapping

Use normalized lowercase profile/assignee text. The first matching rule wins:

| Assignee/profile contains | Unit role | Sprite kind | Default station behavior |
| --- | --- | --- | --- |
| `supervisor`, `orchestrator`, `planner`, `boardjanitor` | `commander` | `general` | command/planning/assignment |
| `vision`, `architect`, `claudearchitect` | `vision-architect` | `advisor` | planning/command |
| `warroomagent`, `codex`, `integrator`, `implementer` | `implementer` | `general` | ready/active/remediation |
| `asset`, `art`, `design`, `technicalartist` | `asset-creator` or `technical-artist` | `advisor` | planning/active/QA depending lifecycle |
| `qa`, `visualqa`, `tester` | `qa-agent` | `review-captain` | QA inspection table |
| `review`, `claudereviewer`, `release` | `reviewer` | `review-captain` | QA/command/archive |
| `gateway`, `watcher`, `cron` | `gateway-watcher` | `gate-warden` | gateway/stale/parent waiting |
| empty/unknown | `advisor` | `advisor` | assignment or lifecycle station |

Lifecycle can override sprite kind:

- `qa-review` -> `review-captain`
- `blocked-needs-input`, `parent-waiting`, `stale-running` -> `gate-warden`
- `approval-required` -> `advisor`
- `active`, `claimed`, `ready`, `assignment` -> profile-derived role/sprite

## 6. Lifecycle to route/motion contract

| Lifecycle | Source station | Target/current station | Route id | Motion state when feed live/fresh | Motion state when stale/degraded/unavailable | Required behavior |
| --- | --- | --- | --- | --- | --- | --- |
| `intake` | `mission-intake-gate` | `mission-intake-gate` | `intake-to-planning` | `static` | `degraded` if non-live | New scroll/unit waits; no progress implied. |
| `triage-planning` | `mission-intake-gate` | `planning-strategy-desk` | `intake-to-planning` | `active` only if task changed from intake in observed data | `degraded` or `static` | Advisor appears at planning desk. |
| `assignment` | `planning-strategy-desk` | `assignment-dais` | `planning-to-assignment` | `active` | `degraded`/`static` | Route line from planning to assignment. |
| `ready` | `assignment-dais` | `ready-staging-lane` | `assignment-to-ready` | `static` | `degraded`/`static` | Assigned unit idles in ready lane; no fake work. |
| `claimed` | `ready-staging-lane` | `active-work-station` | `ready-to-active` | `active` | `degraded`/`static` | Unit travels to active station. |
| `active` | `ready-staging-lane` | `active-work-station` | `ready-to-active` | `active` only when heartbeat is fresh/known | `degraded` for stale/unknown/non-live | Unit stands/works at active station; pulse may represent watching only if live/fresh. |
| `stale-running` | `active-work-station` | `gateway-beacon` | `gateway-to-ready` | not allowed | `degraded` | Freeze/degrade at gateway with stale label; do not animate active work. |
| `qa-review` | `active-work-station` | `qa-inspection-table` | `active-to-qa` | `active` | `degraded`/`static` | Reviewer/review-captain appears at QA. |
| `blocked-needs-input` | `central-command-table` | `blocker-decision-lane` | `command-to-blocker` | `static` | `degraded`/`static` | Wait state; exact block reason visible. |
| `approval-required` | `central-command-table` | `approval-seal` | `command-to-approval` | `static` | `degraded`/`static` | Locked command-table/approval seal; no enabled action. |
| `remediation` | `qa-inspection-table` or `blocker-decision-lane` | `planning-strategy-desk` | `planning-to-assignment` | `active` | `degraded`/`static` | Reroute back to planning/fix station; mark as remediation. |
| `completed-archived` | `central-command-table` | `archive-victory-ledger` | `command-to-archive` | `static` | `static` | Mission rests in archive; no ongoing progress animation. |
| `superseded-canceled` | `central-command-table` | `archive-victory-ledger` | `command-to-archive` | `static` | `static` | Stamped/quiet; unit should not keep moving. |
| `parent-waiting` | `gateway-beacon` | `gateway-beacon` | `gateway-to-ready` | `static` | `degraded`/`static` | Dependency wait at gateway; no fake queue movement. |

Implementation note: without persisted previous snapshots, Phase 3 does not need to interpolate true historical transitions. It may use CSS transition from the previous React-rendered position to the newly mapped position when the live feed changes. The truth remains the current mapped lifecycle/station/route. Do not invent a transition history from unavailable data.

## 7. Deterministic motion rules

1. No random movement. No `Math.random()`, random CSS delays, random waypoint selection, decorative wandering, or autonomous idle patrols.
2. No fake progress. Do not show progress percentages, walking loops, heartbeat pulses, QA success, or completion movement unless sourced from task/run/feed fields.
3. Same input produces same output. Given the same task/feed/options, unit identity, role, route, stations, coordinates, and motion state must be identical.
4. Motion is a renderer effect only. The mapper decides source/current/target route semantics; CSS/React only visualizes them.
5. Live/fresh gate:
   - `active` motion is allowed only when `feed.live === true`, `feed.degraded === false`, task is not fixture/placeholder, and the lifecycle is one of the active transition states.
   - Running tasks with stale heartbeat map to `stale-running` and `motionState='degraded'`.
   - Unknown heartbeat should show `unknown freshness` or `watching`, not `active verified`.
6. Fallback/unavailable/fixture gate:
   - `feed.source !== 'hermes-dashboard-kanban'`, `feed.degraded`, `!feed.live`, no tasks, fixture tasks, or endpoint failure must render `motionState='degraded'` or `static` with `data-war-room-v1-non-live-disclosure` still visible.
7. Completed/superseded/archive states are static. Do not keep moving archived work.
8. Approval/blocker states are static or degraded. They represent waiting for human review, not work progress.
9. Route line follows the primary mission route and must expose route id in DOM.
10. Dense multi-task rendering must stay quiet. Phase 3 may animate only the primary/followed mission unit; background units should be static/de-emphasized unless the implementation explicitly proves readability.

## 8. Reduced-motion behavior

The UI must support users with `prefers-reduced-motion: reduce`.

Required behavior:

- Unit appears directly at the deterministic current/target station.
- No travel, pulsing, bobbing, or looping animation.
- State change remains visible through text and DOM hooks:
  - lifecycle label
  - route id
  - current station
  - target station
  - motion state
  - source/freshness label
- The component should include CSS resembling:

```css
@media (prefers-reduced-motion: reduce) {
  [data-war-room-v1-agent-unit] {
    transition: none !important;
    animation: none !important;
  }
}
```

Do not add global CSS unless approved; prefer component-scoped `<style>` in `WarRoomV1AgentUnit.tsx` or Tailwind/class usage already present in the v1 files.

## 9. Required stable selectors / DOM hooks

Preserve all Phase 2 hooks:

- `[data-war-room-v1-map]`
- `[data-war-room-v1-feed-source]`
- `[data-war-room-v1-station="..."]`
- `[data-war-room-v1-task-id="t_..."]`
- `[data-war-room-v1-lifecycle="..."]`
- `[data-war-room-v1-agent-unit="..."]`
- `[data-war-room-v1-approval-lock]`
- `[data-war-room-v1-block-reason]`
- `[data-war-room-v1-review-required]`
- `[data-war-room-v1-remediation-child]`
- `[data-war-room-v1-non-live-disclosure]`

Add Phase 3 hooks on the unit element or immediate child elements:

- `[data-war-room-v1-agent-unit="unit-..."]`
- `[data-war-room-v1-unit-id="unit-..."]`
- `[data-war-room-v1-unit-role="implementer|qa-agent|reviewer|advisor|..."]`
- `[data-war-room-v1-unit-sprite="general|advisor|review-captain|gate-warden"]`
- `[data-war-room-v1-lifecycle="active|qa-review|..."]`
- `[data-war-room-v1-route-id="ready-to-active|active-to-qa|..."]`
- `[data-war-room-v1-source-station="..."]`
- `[data-war-room-v1-current-station="..."]`
- `[data-war-room-v1-target-station="..."]`
- `[data-war-room-v1-motion-state="active|static|degraded"]`
- `[data-war-room-v1-motion-reason="..."]`

QA must be able to determine from DOM alone:

- which task the unit represents
- which profile/role it represents
- lifecycle state
- route id
- current station
- target station
- whether motion is active, static, or degraded
- whether the feed is live or non-live/degraded

## 10. Acceptance tests

Minimum mapper tests in `war-room-v1-state.test.ts`:

1. `codexintegrator`/`warroomagent` running task maps to implementer/general unit at `active-work-station`, route `ready-to-active`, `motionState='active'` when feed/live options allow it.
2. `visualqaagent` or `qaagent` review-required task maps to `qa-agent` or review-captain at `qa-inspection-table`, route `active-to-qa`, no fake completed state.
3. `claudereviewer` done task maps to reviewer/review-captain or advisor at `archive-victory-ledger`, `motionState='static'`.
4. `claudearchitect` planning/architecture task maps to `vision-architect`/advisor at planning or assignment station.
5. Blocked task with block reason maps to `gate-warden`, `blocker-decision-lane`, `motionState='static'`, and preserves the exact block reason.
6. Stale running task maps to `stale-running`, `gateway-beacon`, `motionState='degraded'`, and does not claim active verified work.
7. Fixture/degraded/unavailable feed options force `motionState='degraded'` or `static`, never `active`.
8. Same task/options mapped twice returns identical identity/station/route/motion output.

Minimum component/static assertions:

1. `WarRoomV1AgentUnit` emits all required Phase 3 data hooks.
2. Reduced-motion CSS/media handling is present.
3. Regression gate fails if any required motion hook is missing.
4. Regression gate fails if unsafe live-action button/link/click handler patterns appear.

## 11. Verification commands for the implementation card

Run from `/Users/mac/hermes-workspace` and include real outputs in the Kanban handoff.

Focused tests:

```bash
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-live-kanban.test.ts
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-agent-motion.test.tsx
```

If the new component test is not created, the implementer must state why and compensate with mapper tests plus regression/browser assertions.

Regression gate:

```bash
pnpm gate:war-room-v1
node scripts/war-room-v1-regression-gate.mjs --json
```

Typecheck/build:

```bash
pnpm typecheck
pnpm build
```

Browser route check with dev server running on port 3001:

```bash
PORT=3001 pnpm dev
curl -fsS 'http://127.0.0.1:3001/api/war-room-v1-kanban-lifecycle?board=warroom&limit=12'
curl -fsS -X POST 'http://127.0.0.1:3001/api/war-room-v1-kanban-lifecycle?board=warroom' && exit 1 || true
pnpm qa:war-room-v1:screenshot -- --base-url=http://127.0.0.1:3001 --out-dir=docs/status/qa/screenshots
```

Additional browser DOM assertion to add to the screenshot/probe script:

```js
await page.goto(`${baseUrl}/war-room?v1=1`)
const unit = page.locator('[data-war-room-v1-agent-unit]').first()
await expect(unit).toHaveAttribute('data-war-room-v1-unit-role', /.+/)
await expect(unit).toHaveAttribute('data-war-room-v1-lifecycle', /.+/)
await expect(unit).toHaveAttribute('data-war-room-v1-route-id', /.+/)
await expect(unit).toHaveAttribute('data-war-room-v1-current-station', /.+/)
await expect(unit).toHaveAttribute('data-war-room-v1-target-station', /.+/)
await expect(unit).toHaveAttribute('data-war-room-v1-motion-state', /^(active|static|degraded)$/)
```

Safety assertions:

```bash
node -e "const fs=require('fs'); const files=['src/screens/war-room/v1/WarRoomV1.tsx','src/screens/war-room/v1/WarRoomV1AgentUnit.tsx','src/screens/war-room/v1/war-room-v1-state.ts']; const s=files.filter(fs.existsSync).map(p=>fs.readFileSync(p,'utf8')).join('\n'); if(/Math\.random|random\(|POST|PATCH|DELETE|createKanbanCard|updateKanbanCard|publish|purchase|refund|renew|supplier message|paid generation/i.test(s)) process.exit(1); console.log('phase3 deterministic read-only motion safety PASS')"
node -e "const fs=require('fs'); const s=fs.readFileSync('src/screens/war-room/v1/WarRoomV1.tsx','utf8') + (fs.existsSync('src/screens/war-room/v1/WarRoomV1AgentUnit.tsx') ? fs.readFileSync('src/screens/war-room/v1/WarRoomV1AgentUnit.tsx','utf8') : ''); if(/<button[^>]*(publish|buy|send|refund|renew|paid|generate)|onClick[^\n]*(publish|buy|send|refund|renew|paid|generate)/i.test(s)) process.exit(1); console.log('no enabled live action controls PASS')"
```

## 12. Product / visual QA criteria

Phase 3 passes product QA if:

- The first read remains a clean pixel/tile historical strategy war-room map, not flat SaaS/glassmorphism.
- The unit reads as a small general/advisor/reviewer/gate character on the map, even if still placeholder/procedural.
- Movement is purposeful and tied to the followed task lifecycle route.
- Central command-table approval remains visually central and locked.
- Dense task marker overlap does not get worse; if necessary, only the primary followed mission moves and background missions stay quiet.
- The UI continues to state that external shop/supplier/paid/account actions are NOT CONNECTED.

Phase 3 must not claim:

- final premium GBA/Pokemon-like art
- final autonomous end-to-end task management
- task creation/dispatch/approval from the UI
- any real marketplace/shop/supplier/ShotLab/account connectivity
- v1 default route readiness

## 13. Recommended implementation card

Title: `Codex Integrator: Phase 3 deterministic moving agent units`

Assignee: `codexintegrator`

Parent: this architecture task.

Scope:

- Implement deterministic unit identity and motion state mapping for `/war-room?v1=1`.
- Add `WarRoomV1AgentUnit.tsx` and required data hooks.
- Wire the existing primary/followed mission unit through the new contract.
- Add/extend tests and regression/browser hooks.
- Keep the feed read-only, explicit route only, and all external actions locked.

Required handoff:

- Changed files list.
- Exact test/typecheck/build/browser outputs.
- DOM evidence for unit role, lifecycle, route id, current station, target station, and motion state.
- Safety statement: Etsy/shops not connected; only mock/theoretical UI allowed.
- If code changed, finish as `review-required:` for independent QA/release review rather than self-completing final readiness.

## 14. Final architecture verdict

Status: PASS.

Phase 3 can proceed as a bounded implementation of deterministic moving general/advisor units on the existing `/war-room?v1=1` read-only Kanban lifecycle map. The next implementation must not expand authority, data sources, routes, assets, or side effects. It should only make the current embodied unit contract explicit, testable, accessible, reduced-motion-safe, and honest about live/static/degraded state.
