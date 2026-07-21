# Claude Architecture Review — War Room v1 roadmap and lifecycle sync

Status: PASS for roadmap architecture / FAIL as current product implementation
Owner: claudearchitect
Reviewed: 2026-06-12
Scope: documentation and architecture review only. No app code was edited.

## Verdict

PASS: The v1 spec and implementation roadmap correctly re-center War Room around real Kanban lifecycle state, moving strategy-map units, central command-table approvals, and anti-fake-animation gates. The Phase 1 plan is buildable because it starts with a pure lifecycle mapper, manifest-backed stations, DOM-testable state, and explicit no-live-action constraints.

FAIL if anyone claims v1 is already implemented or release-ready. Current app foundations still aggregate sessions, swarm missions, static workflow packets, and old Olympus/shrine metaphors; they do not yet prove real Kanban task lifecycle end-to-end on the map. The next implementation must treat the roadmap as a gate, not as evidence of completion.

## Evidence read

- `docs/status/vision/war-room-final-vision-live-spec.md`
  - Q5 requires work alive through unit movement, status changes, and tasks moving between stations.
  - Q10 requires full autonomous task-management lifecycle, not a visual demo.
- `docs/status/vision/war-room-v1-build-spec.md`
  - Section 6 defines the complete required lifecycle: intake, triage, assignment, ready, claimed, active work, QA/review, blocked, DLV approval, remediation, completed, superseded.
  - Section 8 requires real Kanban backing, deterministic traceable transitions, accessibility fallback, browser QA, and no live side effects.
- `docs/status/vision/war-room-v1-implementation-roadmap.md`
  - Phase 1 correctly creates a pure mapper and semantic manifest before final art.
  - Phase 2 correctly delays real Kanban data integration until the mapper and shell exist.
  - Phase 7 correctly blocks default release until a replayable end-to-end real task lifecycle is proven.
- `docs/status/automation/war-room-agent-routing-policy.md`
  - Correctly assigns lifecycle visualization/state sync to specialist implementation/review lanes, not generic supervisor work.
- Current foundations inspected for architecture context only:
  - `src/screens/war-room/war-room-screen.tsx`
  - `src/screens/war-room/game/ops-contracts.ts`
  - `src/server/war-room-ops-data.ts`
  - `src/screens/war-room/game/ops-model.ts`
  - `src/screens/war-room/game/scene-manifest.ts`

## State-sync risks

1. Real Kanban lifecycle is not yet the app's canonical state source.
   - Current ops data reads swarm missions, sessions, product-intelligence queues, and static workflow packets. That is useful operational context, but it is not the board lifecycle described by the v1 spec.
   - Gate: add a read-only Kanban adapter with explicit task/run fields: `id`, `title`, `status`, `assignee`, `priority`, `parents`, `children`, `run_id`, `started_at`, latest heartbeat, block reason, completion summary, metadata, and artifacts.

2. Existing status types are too compressed for v1.
   - Current contracts reduce health/status to broad values such as `idle`, `active`, `review`, `blocked`, `error`, or worker statuses such as `queued`, `running`, `review`, `blocked`, `done`.
   - V1 needs a richer deterministic lifecycle enum matching the build spec: intake, triage/planning, assignment, ready, claimed, active, QA/review, blocked, DLV approval, remediation, completed/archived, superseded/canceled.
   - Gate: no UI animation may be driven directly from broad health badges. Animation must be driven from the lifecycle mapper output.

3. Review-required and blocked states can collapse into one approval bucket.
   - Current helpers treat blocked/needs-input/reviewing as approval-like in places. V1 must distinguish code review, human decision, external-action approval, dependency wait, failed QA, and superseded closure.
   - Gate: separate `qa-review`, `blocked-needs-input`, `approval-required`, and `remediation` states in tests and visual stations.

4. Timing/heartbeat semantics can fake progress.
   - A session updated recently may look running even when no Kanban worker owns a task. Conversely, a real task can be stale or reclaimed if heartbeats stop.
   - Gate: claimed/active visuals must come from Kanban run claim and heartbeat fields, not just recent session timestamps or decorative loops. Stale-running should be a distinct visual warning.

5. Parent/child dependencies are core but not yet represented as routing constraints.
   - V1 must show dependency wait, remediation child links, and release/QA fan-in. A flat feed sorted by updated time cannot prove lifecycle correctness.
   - Gate: mapper tests must include parent-blocked task, child remediation task, and task unblocked after parent completion.

6. Multiple state sources may disagree.
   - Sessions, swarm missions, Kanban tasks, Product Intelligence, and static canonical packets can all describe "work". Without precedence rules, the map can present contradictory states.
   - Gate: define source precedence: Kanban task/run state is authoritative for mission lifecycle; sessions are evidence/telemetry only; product-intelligence/workflow packets are payload context; static demo packets are disabled or visibly labeled as non-live in v1.

## Automation risks

1. Fake animation risk.
   - The central product risk is units moving because a CSS loop or local UI state says so, not because a task transitioned in Kanban.
   - Gate: movement path must be a pure function of `{task.status, run.status, assignee, block/review/approval fields, parent state}` plus manifest coordinates. QA should be able to assert state via DOM attributes without trusting pixels.

2. Supervisor doing specialist work.
   - The routing policy correctly says the supervisor routes work and does not implement large code, generate assets, or approve releases by itself.
   - Gate: implementation cards for state sync/lifecycle visualization should go to `codexintegrator` or `warroomagent`; release/readiness gates should go to independent QA/review lanes.

3. Codex lane isolation risk.
   - Policy correctly says Codex may help with bounded React/TypeScript integration, but Hermes must review diffs and rerun canonical tests. This is mandatory for lifecycle/state-sync work.
   - Gate: no Codex-produced lifecycle mapper lands without Hermes-run tests, typecheck/build, and browser QA.

4. Approval-safety drift.
   - Existing files still contain `Approval Shrine` wording and station ids. The v1 docs correctly re-scope this to central command-table approval seals, but implementation could resurrect shrine-first UX.
   - Gate: any risky action must map to the central command table + approval seal, not a disconnected room/modal/shrine as the primary interaction.

5. Live-action affordance risk.
   - The current ops contract is strong on side-effect classes and locked permissions, but future UI could accidentally render enabled buttons for publish/purchase/message/paid generation/account actions.
   - Gate: browser QA must assert absence of enabled live-action controls and presence of exact locked-action copy.

6. Static/demo data contamination.
   - Current static ops model and canonical packets are useful examples but can falsely look like a working autonomous system.
   - Gate: v1 must mark placeholder/demo data as unavailable/reference-only unless real Kanban data is loaded. If Kanban is unavailable, show an honest read-only unavailable state, not fake success.

## Architecture gates before coding Phase 1

1. Create a v1-only lifecycle contract.
   - New enum/type for every required state.
   - Explicit raw-input type for Kanban task/run fields.
   - Explicit output type for mission visual state, station id, route id/path, unit id, accessibility label, risk/approval metadata, and evidence freshness.

2. Keep mapper pure and covered by tests.
   - No DOM, network, Date.now-only logic, random motion, or CSS dependency inside the mapper.
   - Fixtures must cover ready, claimed/running, stale running, review-required, blocked needs input, approval-gated risky action, completed, superseded, parent-waiting, and remediation child.

3. Define source precedence.
   - Kanban task/run state: lifecycle truth.
   - Kanban events/comments/metadata: evidence and detail.
   - Sessions/tool telemetry: supporting proof only.
   - Product Intelligence/workflow packets: payload/context, not lifecycle truth.
   - Static packets/placeholders: reference-only and visibly non-live.

4. Build from semantic manifest ids, not art assumptions.
   - Required station ids must exist even with placeholders: mission intake, planning desk, assignment dais, ready lane, active station, QA table, blocker lane, central command table, approval seal, archive ledger, gateway beacon.
   - Coordinates and routes live in a manifest or manifest-like data file, not in scattered component state.

5. DOM and accessibility are non-negotiable.
   - Every station, mission marker, unit, and lifecycle state needs deterministic `data-war-room-v1-*` attributes.
   - Text fallback must expose task id, title, status/lifecycle, assignee, block reason, approval risk, and latest verification summary where present.

6. No release by visual inspection only.
   - Minimum gates for implementation cards: focused mapper tests, `pnpm typecheck`, `pnpm build`, browser QA for `/war-room?v1=1`, no console errors, lifecycle DOM assertions, and live-action lock assertions.

## Required Phase 1 acceptance gates

Phase 1 may pass only if all are true:

- The app route is isolated behind `/war-room?v1=1` or an equally explicit non-default flag.
- A pure lifecycle mapper exists and passes focused tests.
- The map renders from mapper output and manifest station ids, not hardcoded visual-only state.
- Every build-spec lifecycle station is present in the DOM with deterministic attributes.
- At least one mission marker and one embodied agent/general/advisor unit are present and accessible.
- Claimed/running/active visual state is traceable to task/run fields.
- QA/review, blocked, DLV approval, remediation, completed, and superseded states are representable even if only fixture-backed in Phase 1.
- All risky external actions remain disabled/locked with explicit copy.
- Placeholder art is labeled placeholder/reference-only and no one-piece baked scene is treated as final interactive state.
- The primary visual read is pixel/isometric historical strategy map, not SaaS dashboard/glass cards/JARVIS bridge/Olympus temple-first shrine.

## Required Phase 2 acceptance gates

Phase 2 may pass only if all are true:

- Real Kanban task/run data can populate mission markers read-only.
- Kanban unavailable/error state is honest and does not fall back to fake live missions.
- Source precedence rules are implemented and documented in code comments or tests.
- Parent/child dependencies affect station/route state.
- Latest heartbeat/staleness affects active-work visuals.
- Review-required output does not appear completed until review gate passes.
- Blocked tasks show exact decision needed.
- Completed tasks show summary/metadata/artifacts in an archive/victory-ledger state.

## Release-blocking failures to watch for

Any of these should be an automatic FAIL for v1 release:

- Moving units not tied to Kanban task/run transitions.
- A fake/demo task presented as live without explicit labeling.
- Broad `active/review/blocked` health badges used as the only lifecycle model.
- Approval shown primarily in a disconnected shrine/modal instead of central command table.
- Enabled publish/purchase/supplier-message/paid-generation/account controls.
- Missing text fallback for task id/title/status/assignee/block or approval reason.
- No browser QA proving route load, DOM state, and no console errors.
- One baked room image or decorative scene used as the interactive product surface.

## Conclusion

The docs are architecturally aligned with DLV's requirement: War Room v1 must be a real Kanban lifecycle operating surface, not a fake animated dashboard. The roadmap should proceed to Phase 1 only with the gates above attached to the implementation card. The current app should be treated as reusable foundation and visual/context reference, not as v1-compliant lifecycle proof.
