# War Room v1 Phase 7 — Lifecycle Readiness and Default Gate Contract

Status: PASS for one bounded `codexintegrator` implementation card
Date: 2026-06-12
Owner lane: claudearchitect
Scope: architecture contract only. Do not edit app code in this architecture card.

Safety statement: Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED; only mock/theoretical/read-only UI is allowed. No live business action, no external account/API action, no Kanban mutation, no task creation/dispatch/completion, no shop/supplier/ShotLab/API action, no asset/god/model change, no release packaging, and no route-default change is authorized by this contract.

## 1. Verdict

PASS.

The next implementation card is ready if it is limited to the smallest read-only in-app proof that War Room v1 can show one replayable lifecycle from the real local `warroom` Kanban board on the central war table. The implementation must use the now-reliable `local-hermes-kanban` source, derive evidence from existing task rows, relationships, comments, and runs, and render the proof without mutating Kanban or any external system.

This phase is not release packaging. It is the missing lifecycle readiness/default gate: prove that `/war-room` and `/war-room?v1=1` can honestly show creation/intake, assignment/ready, active work, QA/review, blocked/remediation/approval, and done/archive as a coherent read-only mission trail.

## 2. Inputs read

- `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_24H_AUTONOMOUS_DEV_GUARDRAILS.md`
- `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_JARVIS_DEFINITION_OF_PERFECT.md`
- `docs/status/automation/war-room-agent-routing-policy.md`
- `docs/status/vision/war-room-final-vision-live-spec.md`
- `docs/status/vision/war-room-v1-implementation-roadmap.md`
- `docs/status/architecture/war-room-v1-phase6-live-kanban-source-remediation.md`
- `docs/status/release/war-room-morning-approval-20260612.md`
- `src/screens/war-room/war-room-screen.tsx`
- `src/screens/war-room/v1/WarRoomV1.tsx`
- `src/screens/war-room/v1/war-room-v1-types.ts`
- `src/screens/war-room/v1/war-room-v1-state.ts`
- `src/screens/war-room/v1/war-room-v1-manifest.ts`
- `src/screens/war-room/v1/war-room-v1-live-kanban.ts`
- `src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts`
- `src/screens/war-room/v1/__tests__/war-room-v1-live-kanban.test.ts`
- `src/screens/war-room/v1/__tests__/war-room-v1-command-table.test.tsx`
- `src/screens/war-room/v1/__tests__/war-room-v1-review-loop.test.tsx`
- `src/routes/api/war-room-v1-kanban-lifecycle.ts`
- `src/server/war-room-local-kanban-read.ts`
- `scripts/war-room-v1-regression-gate.mjs`

## 3. Current implementation facts to preserve

- `/war-room` is already defaulting to `WarRoomV1` in `src/screens/war-room/war-room-screen.tsx`; `?v1=1` also returns `WarRoomV1`, while `?game=1`, `?overheadV2=1`, and `?overheadV1=1` remain explicit older variants.
- `/api/war-room-v1-kanban-lifecycle?board=warroom` is GET-first, keeps POST/PATCH/DELETE method-not-allowed handlers, and enforces `board=warroom` with `limit` 1-25.
- Phase 6 added `local-hermes-kanban` as a live, non-degraded local board source after dashboard fetch failure and before `workspace-kanban-fallback`.
- `src/server/war-room-local-kanban-read.ts` already reads task fields, parent/child links, current/latest runs, latest comment excerpt, status, assignee, priority, timestamps, result, error, summary, and metadata from the local board with a timeout.
- `war-room-v1-state.ts` already maps individual tasks into stations, command-table events, review loops, remediation routes, archive ledger entries, and unit motion.
- `scripts/war-room-v1-regression-gate.mjs` already checks stable v1 file presence, station ids, DOM hooks, local source semantics, command table hooks, review/remediation hooks, and no enabled live-action patterns.

The missing Phase 7 behavior is not a new source and not a new visual language. It is a deterministic mission/thread selection plus replay/trail layer that can prove an end-to-end lifecycle from real read-only Kanban evidence instead of only rendering the current top N task markers independently.

## 4. Minimal implementation goal

Add a read-only lifecycle readiness proof that selects or derives one real `warroom` mission/thread from local Kanban evidence and renders a replayable lifecycle trail on the v1 strategy map.

The proof must:

1. Prefer real local `warroom` tasks from `local-hermes-kanban` when dashboard is unavailable and local board is readable.
2. Use only read-only data already exposed or safely exposable from the local adapter: tasks, parent links, child links, comments, task runs, run summaries, run metadata, status/timestamps, block reasons, and completion summaries.
3. Derive a bounded ordered trail of lifecycle steps; do not create, edit, dispatch, unblock, complete, archive, approve, or mutate any task.
4. Render the trail using the existing v1 stations and visual concepts: mission marker, small general/advisor unit, route path, QA/review table, blocker/remediation lane, central command table, approval seal, and archive victory ledger.
5. Expose stable DOM hooks and machine-readable text so QA can verify without visual guessing.
6. Fall back honestly if no full real lifecycle chain exists.

## 5. Mission/thread selection contract

### 5.1 Source priority

Use the existing API source semantics:

1. `hermes-dashboard-kanban` if the dashboard source returns valid `warroom` tasks.
2. `local-hermes-kanban` if local read-only board access succeeds.
3. `workspace-kanban-fallback` only as degraded state after both real sources fail.
4. `unavailable` when no source can return a valid shape.

Phase 7 acceptance should be proven specifically with `source=local-hermes-kanban`, `live=true`, and `degraded=false`, because Phase 6 established that as the reliable local automation source.

### 5.2 Candidate thread scoring

Select exactly one primary lifecycle proof thread from the bounded returned tasks. The selection must be deterministic and explainable in the API/UI.

Preferred algorithm:

1. Build a graph from returned real tasks using `parents` and `children` arrays.
2. For each candidate root/thread component, score available lifecycle coverage:
   - +3 for any completed/done/archive evidence.
   - +3 for QA/review evidence (`reviewRequired`, QA status, gate evidence, `pnpm gate:war-room-v1`, browser/build/typecheck evidence, visual/release review summaries).
   - +2 for blocked/human-decision/remediation evidence.
   - +2 for command-table/approval-risk evidence.
   - +2 for active/running/current run evidence.
   - +1 for ready/assignment/planning/intake evidence.
   - +1 for explicit parent/child links.
   - +1 for comment excerpts or run summaries that contain handoff/review/remediation language.
3. Prefer a component containing both an implementation-like task and QA/review or release/architecture task.
4. Prefer non-fixture, non-placeholder, live local tasks.
5. Tie-break by most recent meaningful timestamp: current run heartbeat, started_at, completed_at, created_at, then highest priority, then lexical task id.
6. Bound the final trail to 3-9 steps so the first viewport stays readable.

If the returned API limit does not include enough linked tasks, the implementation may increase the API request limit up to the existing max 25, or add a read-only `thread`/`relationships` projection to the API response. It must not perform extra Kanban CLI mutations or broad unbounded DB reads.

### 5.3 Trail derivation

The selected thread should produce a normalized `WarRoomV1LifecycleTrail` or equivalent shape with ordered steps:

- `intake` / mission created: task id, title, createdAt if available.
- `assignment` / ready: assignee, priority, parent wait if applicable.
- `active`: run id/status, startedAt, lastHeartbeatAt, current/latest run summary if available.
- `qa-review`: review-required flag, gate evidence, reviewer/QA task or comment excerpts.
- `blocked-needs-input`: exact block reason when available.
- `approval-required`: only when real task text or metadata indicates DLV approval / external-write / paid / account / destructive risk.
- `remediation`: failed gate summary, remediation child id or reroute reason when available.
- `completed-archived`: completion summary/result/run summary, superseded/canceled reason if applicable.

The trail may combine multiple tasks in one parent/child thread. Each step must identify its source task id and source field(s). Do not collapse all steps into one fake task narrative if the data only supports separate current states.

## 6. Required data fields

The future implementation should add a small explicit trail shape rather than overloading the existing marker fields.

Recommended types in `war-room-v1-types.ts`:

```ts
export type WarRoomV1LifecycleTrailStep = {
  id: string
  lifecycle: WarRoomV1Lifecycle
  stationId: WarRoomV1StationId
  routeId: WarRoomV1Phase5RouteId
  sourceTaskId: string
  sourceTaskTitle: string
  sourceStatus: string | null
  assignee: string | null
  sourceField: 'status' | 'run' | 'comment' | 'metadata' | 'parent' | 'child' | 'blockReason' | 'completionSummary' | 'staticFallback'
  evidenceExcerpt: string
  timestamp: string | number | null
  confidence: 'real' | 'partial' | 'fallback'
}

export type WarRoomV1LifecycleTrail = {
  id: string
  source: WarRoomV1KanbanFeedSource
  live: boolean
  degraded: boolean
  selectedRootTaskId: string | null
  selectedTaskIds: string[]
  selectionReason: string
  completeness: 'full-real-chain' | 'partial-real-chain' | 'single-task-current-state' | 'unavailable'
  missingStates: WarRoomV1Lifecycle[]
  steps: WarRoomV1LifecycleTrailStep[]
  warnings: string[]
}
```

Required evidence fields, if present in the source:

- task id/title/status/assignee/priority
- parents/children
- current/latest run id/status/startedAt/lastHeartbeatAt/completedAt
- current/latest run summary/metadata/error
- latest comment excerpt
- block reason
- review-required signal
- gate evidence signal, including `pnpm gate:war-room-v1`, typecheck, build, browser QA, screenshot, and exit code text when present
- approval risk/target/requested action only when truly indicated by source text/metadata
- completion summary/result
- remediation/superseded/canceled reason

Do not fabricate timestamps, reviewers, assignees, child ids, passing gates, approvals, or archive status. Missing fields must become `null`, `[]`, and visible fallback warnings.

## 7. Honest fallback contract

If a complete real thread cannot be derived from the bounded local Kanban data, the UI must still be useful and honest:

- `full-real-chain`: 5+ lifecycle steps with real evidence spanning active/review/block-or-approval/remediation-or-archive.
- `partial-real-chain`: 2-4 real linked or evidence-backed steps; show missing states as quiet locked gaps.
- `single-task-current-state`: one real task can be mapped, but no linked lifecycle chain is available; show one followed mission marker and a “thread incomplete” banner.
- `unavailable`: no real source; show no fake trail and keep existing fixture/non-live disclosure.

Fallback copy must explicitly say which lifecycle states are missing. Example:

`Partial real lifecycle: local-hermes-kanban exposed active work and QA/review evidence, but no completion/archive step was found in the bounded read-only feed.`

Do not use fixture data to satisfy the default-readiness gate. Fixtures can keep the route non-empty, but they must fail lifecycle readiness.

## 8. Rendering contract on the v1 war table/map

Render the replayable lifecycle as a primary diegetic layer on the existing v1 map, not as a SaaS table.

Required visual behavior:

1. Keep the existing central command table as the anchor.
2. Draw or list the ordered lifecycle trail along existing stations:
   - mission intake gate
   - planning strategy desk
   - assignment dais
   - ready staging lane
   - active work station
   - QA inspection table
   - blocker decision lane
   - central command table
   - approval seal
   - archive victory ledger
   - gateway beacon for parent-wait/stale/unavailable evidence
3. Show the selected mission marker and unit at the latest/current step, while earlier steps appear as small route stamps, ledger entries, or scroll markers.
4. Use the existing `WarRoomV1AgentUnit`, `WarRoomV1CommandTable`, `WarRoomV1ReviewLoop`, station manifest, and map surface. Add a small `WarRoomV1LifecycleTrail` component only if it keeps the route readable.
5. Preserve progressive disclosure: first viewport shows the path and current state; details live in map plaques/ledger/cockpit text, not dense dashboard cards.
6. Keep all external/shop/account/paid actions locked. Approval events are read-only evidence at the central command table, not executable controls.
7. Support reduced motion. Replay can be automatic, manual, or static, but every state must remain visible through DOM/text when animation is disabled.

Suggested display names:

- Header: `Replayable lifecycle · local-hermes-kanban · read-only`
- Trail completeness badge: `full real chain`, `partial real chain`, `single real state`, or `unavailable`
- Current step label: `${step.lifecycle} · ${step.sourceTaskId}`
- Missing state label: `Missing real evidence: completed-archived` or similar.

## 9. Stable DOM hooks for QA

Add or preserve machine-checkable hooks. Required new hooks:

- `[data-war-room-v1-lifecycle-trail-root]`
- `[data-war-room-v1-lifecycle-trail-source="local-hermes-kanban"]`
- `[data-war-room-v1-lifecycle-trail-completeness="full-real-chain|partial-real-chain|single-task-current-state|unavailable"]`
- `[data-war-room-v1-lifecycle-trail-selected-task-id="..."]`
- `[data-war-room-v1-lifecycle-trail-step]`
- `[data-war-room-v1-lifecycle-trail-step-index="0"]`
- `[data-war-room-v1-lifecycle-trail-step-lifecycle="active"]`
- `[data-war-room-v1-lifecycle-trail-step-task-id="t_..."]`
- `[data-war-room-v1-lifecycle-trail-step-station="active-work-station"]`
- `[data-war-room-v1-lifecycle-trail-step-route="ready-to-active"]`
- `[data-war-room-v1-lifecycle-trail-step-confidence="real|partial|fallback"]`
- `[data-war-room-v1-lifecycle-trail-evidence-field="run|comment|metadata|status|..."]`
- `[data-war-room-v1-lifecycle-trail-missing-state="completed-archived"]`
- `[data-war-room-v1-lifecycle-trail-no-mutation-check="true"]`
- `[data-war-room-v1-default-gate="pass|blocked"]`
- `[data-war-room-v1-default-gate-reason]`

Existing hooks that must remain present:

- `[data-war-room-v1-map]`
- `[data-war-room-v1-feed-source]`
- `[data-war-room-v1-station="central-command-table"]`
- `[data-war-room-v1-station="approval-seal"]`
- `[data-war-room-v1-task-id]`
- `[data-war-room-v1-lifecycle]`
- `[data-war-room-v1-agent-unit]`
- `[data-war-room-v1-command-table-root]`
- `[data-war-room-v1-command-table-event]`
- `[data-war-room-v1-review-loop-root]`
- `[data-war-room-v1-no-enabled-live-action-check="true"]`

QA must be able to assert the trail without inspecting pixels manually.

## 10. Default `/war-room` gate

Current fact: `/war-room` already returns `WarRoomV1` by default; `/war-room?v1=1` also returns `WarRoomV1`; the old game variant is behind `/war-room?game=1`.

Therefore Phase 7 must not authorize another route-default change by default. The implementation should add a default-readiness gate indicator inside v1, not change routing, unless all of these exact acceptance gates pass:

1. `/war-room` and `/war-room?v1=1` both load HTTP 200 with `[data-war-room-v1-map]` present.
2. Both routes expose `[data-war-room-v1-feed-source="local-hermes-kanban"]` when dashboard is unavailable and local board is readable.
3. Both routes expose `[data-war-room-v1-lifecycle-trail-root]` and at least one real `[data-war-room-v1-lifecycle-trail-step-confidence="real"]`.
4. The default gate hook reports pass only when `source=local-hermes-kanban`, `live=true`, `degraded=false`, no fixture tasks are used for readiness, and no enabled live-action controls are present.
5. `pnpm gate:war-room-v1`, focused v1 tests, `pnpm typecheck`, `pnpm build`, and browser QA pass.
6. The first viewport remains a historical/GBA strategy war table with moving/positioned units, not a flat SaaS/glass dashboard.
7. DLV/release review has explicitly accepted that `/war-room` may remain v1 default.

If any gate fails, keep `/war-room` as the current v1 local checkpoint but label default readiness as blocked/partial inside the UI and do not perform routing changes.

## 11. No-write safety contract

Forbidden in the implementation card:

- No Kanban mutation: no task creation, update, dispatch, unblock, block, complete, archive, run creation, approval mutation, SQLite writes, or CLI commands that write board state.
- No POST/PATCH/DELETE expansion for `/api/war-room-v1-kanban-lifecycle`.
- No Etsy listing edits, renewals, orders, messages, refunds, shop/account settings, ads, purchases, supplier outreach, AliExpress/Alibaba actions, ShotLab paid generation/publish/upload, or external business API actions.
- No assets, god/model replacements, visual asset generation, registry promotion, or live art swap.
- No release packaging, Git commit, push, merge, reset, clean, destructive checkout, broad delete, credential change, or workspace cleanup.
- No route-default change unless the implementation first passes every default gate above and a separate release/review card authorizes it.

Allowed:

- Read-only local Kanban/SQLite reads through the existing bounded local adapter.
- Read-only GET API behavior.
- Pure mapper/type additions.
- React rendering of the derived trail.
- Static/focused tests and browser/HTTP QA.
- Updating `scripts/war-room-v1-regression-gate.mjs` to verify the lifecycle trail hooks and no-write contract.

## 12. Exact implementation files likely in scope

Primary files:

- `src/screens/war-room/v1/war-room-v1-types.ts`
  - Add lifecycle trail types or equivalent explicit shape.

- `src/screens/war-room/v1/war-room-v1-state.ts`
  - Add pure deterministic derivation, e.g. `buildWarRoomV1LifecycleTrail(tasks, feed)`.
  - Keep no DOM/network in the mapper.
  - Add scoring, completeness classification, missing-state calculation, and no-fabrication fallbacks.

- `src/screens/war-room/v1/WarRoomV1.tsx`
  - Render the selected replayable lifecycle trail using existing map/station/unit/command-table language.
  - Expose the new DOM hooks and default gate indicator.

- Optional new component: `src/screens/war-room/v1/WarRoomV1LifecycleTrail.tsx`
  - Only if this keeps `WarRoomV1.tsx` small.
  - Must render read-only text/hooks only; no mutation controls.

- `src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts`
  - Add pure tests for thread selection, completeness, fallback, missing states, and local source live readiness.

- Optional new test: `src/screens/war-room/v1/__tests__/war-room-v1-lifecycle-trail.test.tsx`
  - Add DOM hook tests if a separate component is created.

- `src/screens/war-room/v1/__tests__/war-room-v1-live-kanban.test.ts`
  - Only if response normalization needs a small update for the new trail fields.

- `src/routes/api/war-room-v1-kanban-lifecycle.ts`
  - Only if local response needs to expose additional already-read fields from relationships/comments/runs. Keep GET-only and read-only.

- `src/server/war-room-local-kanban-read.ts`
  - Only if a bounded existing read field is missing. SELECT-only, timeout-bound, board-scoped. Do not export mutation helpers.

- `scripts/war-room-v1-regression-gate.mjs`
  - Add static checks for lifecycle trail hooks, `local-hermes-kanban`, default gate hook, GET-only/no mutation, and no enabled live actions.

Files intentionally out of scope:

- `package.json` / lockfiles unless an existing script already exists and no dependency is added.
- `src/screens/war-room/war-room-screen.tsx` unless a later release/default gate explicitly authorizes route work. Current default already returns v1.
- Public/generated assets, asset registry, god/unit art, CSS redesign, release packaging docs, marketplace adapters, Hermes profile/config/credentials.

## 13. Exact implementation card

Create one focused follow-up card for `codexintegrator`:

Title: `Codex: Phase 7 read-only War Room lifecycle trail/default gate`

Scope:

- Build a deterministic read-only lifecycle trail from real `local-hermes-kanban` task/run/comment/relationship data already exposed by the v1 feed.
- Render the replayable lifecycle on the existing v1 war table/map using existing stations, mission marker, unit, central command table, QA/review, remediation/blocker, and archive zones.
- Add stable DOM hooks and regression/static tests for the lifecycle trail and default gate.
- Keep `/war-room` route behavior unchanged unless a separate release gate later approves default routing changes.

Do not broaden into:

- Kanban writes or task lifecycle mutations.
- Assets, god/unit models, visual redesign, route migration, release packaging, Git cleanup, marketplace/shop/supplier/ShotLab/API integrations, or external actions.

## 14. Required commands for implementer

Run from `/Users/mac/hermes-workspace`:

```bash
hermes kanban --board warroom stats
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-live-kanban.test.ts
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-command-table.test.tsx
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-review-loop.test.tsx
pnpm gate:war-room-v1
pnpm typecheck
pnpm build
```

If a lifecycle trail component test is added, also run:

```bash
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-lifecycle-trail.test.tsx
```

With a local dev server running, run read-only probes:

```bash
curl -fsS 'http://127.0.0.1:3001/api/war-room-v1-kanban-lifecycle?board=warroom&limit=25'
curl -fsS -X POST 'http://127.0.0.1:3001/api/war-room-v1-kanban-lifecycle?board=warroom' && exit 1 || true
curl -fsS -X PATCH 'http://127.0.0.1:3001/api/war-room-v1-kanban-lifecycle?board=warroom' && exit 1 || true
curl -fsS -X DELETE 'http://127.0.0.1:3001/api/war-room-v1-kanban-lifecycle?board=warroom' && exit 1 || true
```

Browser QA should check:

```bash
pnpm qa:war-room-v1:screenshot -- --base-url=http://127.0.0.1:3001
```

or equivalent Playwright/browser-harness inspection for both `/war-room` and `/war-room?v1=1`.

## 15. Acceptance criteria for the implementation card

A reviewer may pass the `codexintegrator` implementation only if all are true:

1. The lifecycle trail derives from real dashboard/local Kanban tasks when available and specifically passes with `local-hermes-kanban`, `live=true`, `degraded=false` on the local `warroom` board.
2. The trail builder is deterministic and pure, with tests covering full-real-chain, partial-real-chain, single-task-current-state, and unavailable fallback.
3. The selected thread uses task relationships, comments, runs, summaries, metadata, blockers, completion evidence, and source task ids without fabricating missing data.
4. The UI renders a replayable lifecycle on the existing v1 map/war table with station path, mission marker, unit, central command table, QA/review, blocker/remediation, approval seal, and archive zones.
5. Missing lifecycle states are visible as honest missing evidence, not silently filled with fixtures.
6. New DOM hooks listed in section 9 are present and stable.
7. Existing v1 hooks and Phase 6 `local-hermes-kanban` behavior remain intact.
8. `/war-room` and `/war-room?v1=1` both load with the lifecycle trail and no relevant console/page errors.
9. POST/PATCH/DELETE remain method-not-allowed/read-only for the lifecycle API.
10. `pnpm gate:war-room-v1`, focused v1 tests, `pnpm typecheck`, and `pnpm build` pass, or the implementation card blocks with exact command output.
11. No enabled publish/buy/refund/renew/supplier-message/paid-generation/shop/account/external action controls exist.
12. No app code outside the files listed in section 12 is changed without a clear reason in the handoff.
13. No route-default change, release packaging, Git operation, asset/god/model work, or marketplace/business integration is performed.

## 16. Acceptance criteria for the future QA card

Create one independent QA/review card after implementation. QA should pass only if it records real evidence for all items below:

1. `hermes kanban --board warroom stats` exits 0.
2. API probe for `/api/war-room-v1-kanban-lifecycle?board=warroom&limit=25` returns HTTP 200, `ok=true`, and either `source=local-hermes-kanban` or a documented dashboard-live source. For Phase 7 local readiness, `local-hermes-kanban`, `live=true`, `degraded=false` must be observed at least once.
3. `/war-room` and `/war-room?v1=1` return HTTP 200.
4. Both routes expose `[data-war-room-v1-map]`, `[data-war-room-v1-feed-source="local-hermes-kanban"]`, `[data-war-room-v1-station="central-command-table"]`, `[data-war-room-v1-command-table-root]`, and `[data-war-room-v1-lifecycle-trail-root]`.
5. The lifecycle trail exposes at least one `[data-war-room-v1-lifecycle-trail-step-confidence="real"]` and no fixture step counts toward default readiness.
6. QA records the trail completeness value. If it is not `full-real-chain`, QA can still pass implementation only if the UI clearly labels missing states and the default gate remains `blocked` or `partial` rather than claiming full readiness.
7. The trail includes source task ids and source evidence fields for every step.
8. The central command table remains visible and read-only; approval/locked-action events contain no executable business controls.
9. Browser console/page errors are zero or documented as unrelated/pre-existing.
10. `pnpm gate:war-room-v1`, focused tests, `pnpm typecheck`, and `pnpm build` pass with real output.
11. Static safety scan finds no new create/update/dispatch/complete/approve Kanban calls and no enabled external/shop/supplier/ShotLab/account/paid controls.
12. QA screenshot/evidence artifact is saved under `docs/status/qa/` or the established War Room QA path.
13. QA handoff states explicitly: Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED; only mock/theoretical/read-only UI is allowed.

## 17. Release review expectations after implementation and QA

After implementation and QA, route/default/release claims still require a separate `releaseagent` or reviewer gate. Release review must decide:

- whether the lifecycle trail is strong enough to describe v1 as a local read-only end-to-end task lifecycle proof;
- whether `/war-room` being v1 by default is acceptable as-is or needs a visible blocked/partial default gate label;
- whether unrelated dirty workspace files, upstream divergence, and large untracked assets still block packaging;
- whether visual/product quality still falls short of the premium GBA/Pokemon historical strategy target.

No Git packaging, push, merge, cleanup, release note, or default route migration is authorized by this architecture contract.

## 18. Notes for reviewers

Request changes immediately if the implementation tries to satisfy Phase 7 by:

- fabricating a happy-path lifecycle fixture as real readiness;
- mutating Kanban to manufacture a lifecycle chain;
- enabling any live external/shop/paid/account action;
- changing `/war-room` routing without the default gates and separate review;
- replacing assets/gods/models or doing broad visual redesign;
- claiming release readiness without QA/release review.

The correct bounded outcome is a truthful read-only, replayable lifecycle proof on the central command table and map, backed by real `local-hermes-kanban` evidence and clear fallbacks when the local board does not expose a complete chain.
