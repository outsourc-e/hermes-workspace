# War Room v1 Phase 9 deterministic unit-motion contract

Status: PASS / architecture contract only
Owner lane: claudearchitect
Date: 2026-06-12
Scope: documentation-only. This contract does not implement code, generate assets, promote public assets, package a release, mutate Kanban, or authorize live/external actions.

## Safety statement

Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED; only mock/theoretical/read-only UI is allowed. No shop/supplier/paid/live actions and no Kanban mutations from the War Room route/UI/API.

## 1. Product goal for this slice

Phase 9 should make the existing War Room v1 general/advisor unit motion more deterministic, inspectable, and product-quality while preserving Phase 8 PASS conditions:

- central war table / strategy map remains the dominant first read;
- one followed real `local-hermes-kanban` mission path is primary;
- background tasks stay quiet markers;
- source semantics remain read-only `local-hermes-kanban` when the local board is readable;
- POST/PATCH/DELETE on `/api/war-room-v1-kanban-lifecycle` keep method-not-allowed / 405 semantics;
- NOT CONNECTED safety copy remains visible and unambiguous;
- all art is temporary/prototype unless a later asset card explicitly approves final art.

This is not an asset pass. It is a small UI/code motion-contract pass over current files under `src/screens/war-room/v1/`.

## 2. Deterministic source-to-unit mapping

Existing source baseline:

- API route: `src/routes/api/war-room-v1-kanban-lifecycle.ts` returns normalized read-only `WarRoomV1RawTask[]` from dashboard Kanban first, then `local-hermes-kanban`, then degraded workspace fallback.
- State mapper: `src/screens/war-room/v1/war-room-v1-state.ts` maps `WarRoomV1RawTask` to `WarRoomV1MissionVisual`.
- Current unit surface: `WarRoomV1AgentUnit.tsx` renders only the followed mission unit and already emits identity/station/motion hooks.

Phase 9 must keep the mapping pure and repeatable. For identical task input plus identical mapper options, identity, station, route id, motion state, and position must be identical. No `Math.random`, clock-only wandering, decorative unrelated animation, or task-order side effects are allowed except the already explicit followed-task selection ranking in `buildWarRoomV1LifecycleTrail`.

### 2.1 Task lifecycle to station

Use the existing station contract unless a future architecture card changes it:

| Normalized lifecycle | Current station | Motion purpose |
|---|---|---|
| `intake` | `mission-intake-gate` | new sealed scroll / no strong motion |
| `triage-planning` | `planning-strategy-desk` | advisor scopes the mission |
| `assignment` | `assignment-dais` | unit moves from planning into assignment |
| `ready` | `ready-staging-lane` | quiet waiting marker |
| `claimed` / `active` | `active-work-station` | followed/selected unit gets active work motion |
| `qa-review` | `qa-inspection-table` | reviewer unit escorts mission into QA |
| `blocked-needs-input` | `blocker-decision-lane` | gate-warden/static stop ribbon; no fake progress |
| `approval-required` | `approval-seal` and central table event | locked packet; DLV approval required; no live action |
| `remediation` | `planning-strategy-desk` | route back into scoped remediation planning |
| `completed-archived` / `superseded-canceled` | `archive-victory-ledger` | static archive stamp |
| `parent-waiting` / `stale-running` | `gateway-beacon` | degraded/waiting signal; no active motion claim |

### 2.2 Assignee/profile to unit identity

Use `profileIdentityFor` as the source of truth and keep role mapping deterministic:

- `codexintegrator`, `warroomagent`, implementers -> implementer/general unit.
- `visualqaagent`, QA/tester -> QA agent/review-captain unit.
- `claudereviewer`, reviewer, release -> reviewer/review-captain unit.
- `claudearchitect`, architect, vision -> vision-architect/advisor unit.
- `artdirector`, asset/design/prompt/technicalartist -> advisor-style art/technical units.
- `gateway`, cron, watcher, stale/blocked/parent-waiting states -> gate-warden unit.
- unknown assignee -> advisor/general fallback, but still labeled as derived from assignee, not invented lore.

Unit id format should remain stable: `unit-${task.id}-${normalizedProfile}`. If additional background units are added, they must use the same identity derivation and must not collide with the followed unit.

### 2.3 Route and motion state

Route id must be derived from lifecycle, not from visual layout whims. Keep current route ids from `war-room-v1-manifest.ts`:

- `intake-to-planning`
- `planning-to-assignment`
- `assignment-to-ready`
- `ready-to-active`
- `active-to-qa`
- `qa-to-command`
- `command-to-approval`
- `command-to-blocker`
- `command-to-archive`
- `gateway-to-ready`

Motion state contract:

| Motion state | When allowed | Visual behavior |
|---|---|---|
| `active` | live, non-degraded, non-fixture task in assignment/claimed/active/QA/remediation lifecycle | followed or selected unit may step/pulse along or at the route target |
| `static` | ready/intake/blocked/approval/completed/superseded/parent-waiting normal states | station placement and seal/status remain visible; no travel claim |
| `degraded` | fixture, fallback, unavailable, stale-running, non-live, or degraded feed | muted static signal; no fake active work animation |

Phase 9 implementation may refine the display so a followed active unit appears on a route segment instead of exactly on the target station, but only if the interpolation is deterministic from source fields such as lifecycle, route id, run heartbeat age bucket, task id hash, and followed/selected state. It must not imply writes or execution beyond read-only lifecycle visibility.

### 2.4 Followed vs background units

Default visible priority must remain:

1. one followed mission path with the strongest route and one primary unit;
2. selected station/mission detail if the user selects a station;
3. quiet background task markers.

Phase 9 may add tiny background advisor/general markers only if they are visually quieter than the followed unit and machine-identifiable as background. A safe implementation can also leave background tasks as markers only; this contract does not require rendering every background unit.

Background active tasks may show a subtle station pulse, but not route-travel animation competing with the followed mission. Completed, blocked, approval, parent-waiting, stale, fixture, fallback, and unavailable tasks must remain static/degraded.

### 2.5 Reduced-motion fallback

`prefers-reduced-motion: reduce` must disable stepping/travel animation, CSS transitions that imply movement, and decorative pulses. It must preserve:

- deterministic station placement;
- route line and route id;
- unit identity, role, and sprite/prototype disclosure;
- current station and target station;
- motion state/reason text;
- followed/background priority;
- safety and source evidence.

Reduced-motion cannot hide the unit or remove lifecycle proof hooks.

## 3. Required stable DOM/data hooks

The next implementation must preserve existing hooks and add/fill any missing hook values without breaking the regression gate. Required hooks for this slice:

### Map/source/selection

- `[data-war-room-v1-map]` exactly once.
- `[data-war-room-v1-feed-source]` with source value.
- `[data-war-room-v1-lifecycle-trail-source="local-hermes-kanban"]` when local board data is readable.
- `[data-war-room-v1-followed-mission="true"]` on the followed mission marker.
- `[data-war-room-v1-route-priority="followed"]` on followed route/marker.
- `[data-war-room-v1-route-priority="background-quiet"]` on background markers/routes.
- `[data-war-room-v1-source-evidence]` available in secondary/collapsed proof surfaces, not as the dominant default view.

### Task/route/station

Every visible mission marker/unit must expose:

- `[data-war-room-v1-task-id]`
- `[data-war-room-v1-lifecycle]`
- `[data-war-room-v1-route-id]`
- `[data-war-room-v1-lifecycle-route]`
- `[data-war-room-v1-station]` for station surfaces
- accessible text or `aria-label` containing task id, title, status/lifecycle, assignee, current station, and whether it is followed or background.

### Unit identity/motion

Every visible unit must expose:

- `[data-war-room-v1-agent-unit]`
- `[data-war-room-v1-unit-id]`
- `[data-war-room-v1-unit-role]`
- `[data-war-room-v1-unit-sprite]`
- `[data-war-room-v1-source-station]`
- `[data-war-room-v1-current-station]`
- `[data-war-room-v1-target-station]`
- `[data-war-room-v1-motion-state]`
- `[data-war-room-v1-motion-reason]`
- an accessible label that repeats role, lifecycle, route id, current station, target station, and motion reason.

If temporary CSS/block sprites remain in use, expose a prototype/final-art disclosure via either visible copy near the map or a stable hook such as `[data-war-room-v1-prototype-art-disclosure]`. The copy must say temporary/prototype/non-final, not final art.

### Command table, approval, blocker, remediation, archive

The Phase 9 slice must not remove or weaken:

- `[data-war-room-v1-command-table-event]`
- `[data-war-room-v1-command-event-task-id]`
- `[data-war-room-v1-command-event-risk-type]`
- `[data-war-room-v1-command-event-risk-level]`
- `[data-war-room-v1-command-event-status]`
- `[data-war-room-v1-command-event-target-action]`
- `[data-war-room-v1-requested-decision]`
- `[data-war-room-v1-approval-lock]`
- `[data-war-room-v1-approval-seal]`
- `[data-war-room-v1-locked-action-chip]`
- `[data-war-room-v1-no-enabled-live-action-check]`
- `[data-war-room-v1-no-auto-complete-lock]`
- `[data-war-room-v1-blocker-decision-lane]`
- `[data-war-room-v1-blocker-source-task-id]`
- `[data-war-room-v1-remediation-route]`
- `[data-war-room-v1-remediation-source-task-id]`
- `[data-war-room-v1-remediation-target-agent]`
- `[data-war-room-v1-archive-ledger-entry]`
- `[data-war-room-v1-archive-stamp]`

Approval/blocker table events must continue to be read-only evidence and locked decision packets, not clickable mutation controls.

## 4. Phase 8 PASS preservation requirements

A Phase 9 implementation is invalid if it regresses any Phase 8 PASS item:

1. Central war table/map remains visually dominant before proof/debug ledgers.
2. One followed `local-hermes-kanban` mission path remains visually primary and machine-identifiable.
3. Background lifecycle markers remain quiet and secondary.
4. Source labels and lifecycle proof remain honest: `local-hermes-kanban`, `live=true`, `degraded=false` only when actually readable.
5. Fixture/fallback/unavailable states remain labeled non-live/degraded; no fake live claim.
6. `/api/war-room-v1-kanban-lifecycle` remains read-only; POST/PATCH/DELETE return method-not-allowed/405.
7. Visible safety copy contains NOT CONNECTED and says external business/account systems are locked/read-only.
8. No enabled controls for publish, purchase, supplier message, paid generation, refund, renewal, shop/account edits, external live actions, or War Room Kanban mutation actions.
9. Temporary unit/block/CSS art is disclosed as prototype/non-final; no final-art or release claim.
10. Existing regression hook coverage in `scripts/war-room-v1-regression-gate.mjs` continues to pass.

## 5. Bounded implementation plan: exactly one UI/code slice

Recommended child lane: `codexintegrator`.

Reason: the routing policy assigns `codexintegrator` to Kanban lifecycle visualization integration, state synchronization between real Kanban data and map/unit UI, and bounded React/TypeScript integration that benefits from Codex CLI. This slice touches mapper/component/tests and should be isolated, reviewed, and rerun by Hermes. It is not vision judgement, asset generation, marketplace work, or release packaging.

### Allowed file scope

Modify only these files unless the child finds a direct compile/test need and documents it:

- `src/screens/war-room/v1/war-room-v1-types.ts`
- `src/screens/war-room/v1/war-room-v1-state.ts`
- `src/screens/war-room/v1/WarRoomV1.tsx`
- `src/screens/war-room/v1/WarRoomV1AgentUnit.tsx`
- `src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts`
- `src/screens/war-room/v1/__tests__/war-room-v1-agent-motion.test.tsx`
- `src/screens/war-room/v1/__tests__/war-room-v1-visual-hierarchy.test.tsx`
- `scripts/war-room-v1-regression-gate.mjs` only if a new required hook is added and must be gated.

Do not edit API source semantics, server Kanban readers, public assets, asset registries, package scripts, or release files for this slice.

### Implementation steps

1. Add/finalize a deterministic unit-motion metadata shape only if current `WarRoomV1UnitMotion` cannot express route segment/reason/prototype disclosure cleanly. Keep it serializable and derived from task/lifecycle/feed options.
2. Update `motionFor`/`mapWarRoomV1Mission` to expose any missing station/route/reason fields needed by DOM hooks; preserve current lifecycle mapping and degraded/static/active rules.
3. Update `WarRoomV1AgentUnit` to expose complete accessible labels and prototype disclosure, while preserving reduced-motion CSS.
4. If background units are added, cap them to a small quiet count and mark them `background-quiet`; otherwise explicitly preserve background markers only.
5. Keep visual hierarchy map-first; do not expand proof ledgers by default.
6. Add/update tests for deterministic repeatability, local-vs-fallback motion state, reduced-motion CSS, DOM hooks, prototype disclosure, followed/background priority, and no random movement.
7. Update regression gate only for stable hook requirements that should become non-negotiable.

### Required test/verification commands for child

Run from `/Users/mac/hermes-workspace` and record exact exit codes:

- `pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts src/screens/war-room/v1/__tests__/war-room-v1-agent-motion.test.tsx src/screens/war-room/v1/__tests__/war-room-v1-visual-hierarchy.test.tsx`
- `NODE_ENV=test pnpm gate:war-room-v1`
- `pnpm typecheck`
- `pnpm build`

If the app server is available in the QA lane, later `visualqaagent` should additionally rerun browser evidence for `/war-room` and `/war-room?v1=1`; the implementation child should not mutate Kanban/UI/API to create evidence.

### Screenshot/manifest expectations for downstream QA

The child implementation should hand off enough detail for `visualqaagent` to capture:

- `/war-room` viewport and full-page screenshots;
- `/war-room?v1=1` viewport and full-page screenshots;
- JSON manifest under `docs/status/qa/screenshots/` containing route, timestamp, HTTP status, console/page errors, API source probe, POST/PATCH/DELETE probe statuses, selector counts, sampled unit attributes, followed/background route priority, reduced-motion/prototype disclosure check, and PASS/FAIL verdict.

The child itself does not need to create final assets or final-art screenshots. Any screenshot with CSS/block units must be labeled prototype/non-final.

## 6. Smallest acceptance criteria for the child implementation

The dependent implementation card may proceed if and only if it accepts these minimum criteria:

1. No API/source semantics change: GET remains read-only; POST/PATCH/DELETE remain 405/method-not-allowed.
2. For identical task/options, mapper output for lifecycle, unit id, unit role, station, route id, motion state, and motion reason is identical.
3. `local-hermes-kanban` live tasks may show active motion only for allowed active lifecycles; fixture/fallback/degraded/stale states are degraded/static and visibly honest.
4. Followed mission path remains primary; background tasks are quiet and do not create competing motion.
5. Required unit hooks and accessible labels are present for every visible unit.
6. Reduced-motion disables movement but preserves station/route/status/source/identity evidence.
7. Prototype/non-final disclosure exists for temporary unit art; no final asset claim.
8. Phase 8 visual hierarchy and safety checks are preserved, including NOT CONNECTED copy and no enabled live/Kanban mutation controls.
9. Required commands above pass or the task blocks with exact output and a remediation owner.
10. Handoff includes changed files, command outputs, and any screenshot/manifest paths if created.

## 7. Proceed verdict

PASS: the dependent implementation card can proceed in the `codexintegrator` lane as one bounded UI/code slice under the file scope above.

Do not assign this child to assetcreator, artdirector, releaseagent, or a marketplace/business lane. Asset/final-art work, release packaging, Git push/merge/reset/clean/checkout/rollback, DB/admin commands, War Room UI/API Kanban mutations, and external shop/supplier/ShotLab/API/account writes remain forbidden.
