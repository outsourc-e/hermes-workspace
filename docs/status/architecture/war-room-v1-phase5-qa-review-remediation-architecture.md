# War Room v1 Phase 5 — QA / Review / Blocker / Remediation Architecture

Status: PASS for a bounded implementation card
Date: 2026-06-12
Owner lane: claudearchitect
Scope: architecture contract only. No app code, assets, routes, package config, Hermes config, credentials, marketplace/business integrations, or live systems are edited by this task.

Safety statement: Etsy/shops are not connected; only mock/theoretical UI is allowed. No shop/supplier/ShotLab paid/live actions.

## 1. Verdict

Phase 5 is implementation-ready only as a read-only visibility layer on the existing explicit `/war-room?v1=1` War Room v1 slice.

PASS conditions for implementation readiness:

- QA/review/blocker/remediation state is derived only from read-only Kanban task, run, comment, event, and handoff metadata already available to the War Room v1 lifecycle adapter or added through a GET-only normalization path.
- Review-required work is never displayed as completed just because an auto-review or supervisor helper later closed a card. The UI must expose the review loop evidence and the final resolved/approved state separately.
- Failed gates, block reasons, remediation target task ids, source evidence, superseded/canceled stamps, and routes back to responsible station/agent are visible as trustworthy strategy-map state.
- The Phase 5 UI remains a clean GBA/Pokemon-like top-down/isometric historical strategy War Room: QA inspection table, blocker decision lane, remediation route, central command table, and archive/victory ledger must read as diegetic map/table/scroll/ledger objects, not generic SaaS cards or glass panels.
- No task write, dispatch, approval mutation, status mutation, POST/PATCH/DELETE action, direct SQLite write, marketplace/shop/supplier/ShotLab/paid/account connection, asset replacement, or default `/war-room` promotion is introduced.

BLOCK conditions for the next implementation card:

- Any request to create, edit, dispatch, approve, complete, unblock, archive, or mutate tasks from the War Room v1 UI.
- Any request to connect Etsy, shops, supplier systems, AliExpress/Alibaba, ShotLab, paid generation, account settings, orders, messages, refunds, renewals, ads, uploads, purchases, or live external APIs.
- Any request to replace gods/models/assets, promote generated candidates/public assets, or present placeholder/CSS art as final GBA/Pokemon-quality art.
- Any request to promote v1 to default `/war-room` before Phase 7 release gates.
- Any proposal that fabricates QA results, command outputs, comments, block reasons, remediation ids, source evidence, DLV approval, or completion progress.

## 2. Inputs read

- `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_24H_AUTONOMOUS_DEV_GUARDRAILS.md`
- `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_JARVIS_DEFINITION_OF_PERFECT.md`
- `docs/status/automation/war-room-agent-routing-policy.md`
- `docs/status/vision/war-room-final-vision-live-spec.md`
- `docs/status/vision/war-room-v1-implementation-roadmap.md`
- `docs/status/architecture/war-room-v1-phase4-command-table-approvals-architecture.md`
- Phase 4 cards/evidence: `t_20c944e6`, `t_94711dc0`, `t_149c4228`, `t_6e1b7741`
- Current v1 files under `src/screens/war-room/v1/`
- Current read-only lifecycle API route: `src/routes/api/war-room-v1-kanban-lifecycle.ts`

## 3. Current implementation facts Phase 5 must preserve

Existing Phase 1-4 implementation already provides:

- Explicit-only route: `/war-room?v1=1`.
- Read-only lifecycle API endpoint: `/api/war-room-v1-kanban-lifecycle?board=warroom&limit=12`.
- POST/PATCH/DELETE handlers return 405/read-only for the lifecycle endpoint.
- `WarRoomV1RawTask`, `WarRoomV1RawRun`, `WarRoomV1MissionVisual`, lifecycle/station/route/unit/command-table types in `src/screens/war-room/v1/war-room-v1-types.ts`.
- Pure mapper `mapWarRoomV1Mission()` in `src/screens/war-room/v1/war-room-v1-state.ts`.
- Current lifecycle states already include `qa-review`, `blocked-needs-input`, `remediation`, `completed-archived`, `superseded-canceled`, `parent-waiting`, and `stale-running`.
- Current required station ids already include `qa-inspection-table`, `blocker-decision-lane`, `central-command-table`, `approval-seal`, and `archive-victory-ledger`.
- Phase 4 command-table events expose risk type, requested decision, locked actions, allowed read-only actions, audit label, source evidence, lifecycle route, approval seal, and no-enabled-live-action checks.
- Phase 4 implementation evidence: `t_94711dc0` first blocked as `review-required` with focused tests/gates/typecheck/build/browser/safety evidence, then a supervisor helper auto-approved local gates. Phase 5 must represent both the review-required state and later resolution without pretending the original review never existed.
- Phase 4 QA evidence: `t_149c4228` found a required regression gate failure (`React.act is not a function`) while browser/API/screenshot checks mostly passed; it recommended a focused `codexintegrator` remediation lane.
- Phase 4 remediation evidence: `t_6e1b7741` verified the command-table gate, JSON regression gate, package gate, typecheck, and build all exited 0, with no additional edits. Phase 5 must be able to show this as a remediation route resolving a failed gate, not as an unrelated done card.

## 4. Exact allowed files for the next Codex implementation card

Allowed new/modified files:

- `src/screens/war-room/v1/war-room-v1-types.ts`
  - Add Phase 5 read-only types for QA gate evidence, review loop state, blocker decision, remediation route, source task references, superseded/canceled stamp, and archive/victory ledger entries.
  - Extend `WarRoomV1RawTask` only with normalized read-only metadata fields; do not add mutation/write/approval command types.
- `src/screens/war-room/v1/war-room-v1-state.ts`
  - Extend pure mapper logic for review-required, failed gate, blocked, remediation, superseded/canceled, and archive visibility.
  - Keep mapper pure: no DOM, timers except injected `nowMs`, random values, fetches, local storage, browser APIs, mutation calls, or direct Kanban DB writes.
- `src/screens/war-room/v1/war-room-v1-manifest.ts`
  - Add only Phase 5 route labels/visual offsets if necessary for QA table, blocker lane, remediation return route, and archive ledger placement.
  - Preserve all existing station ids and route ids.
- `src/screens/war-room/v1/WarRoomV1.tsx`
  - Wire Phase 5 visual data into the map while preserving map root, feed source banner, stations, mission markers, moving agent unit, command table, non-live disclosure, and Phase 1-4 hooks.
- `src/screens/war-room/v1/WarRoomV1ReviewLoop.tsx`
  - New presentational component if useful. It may render QA inspection table evidence chips, blocker lane scrolls, remediation route plaques, source task id links-as-text, superseded/canceled stamps, no-auto-complete lock, and archive/victory ledger entries.
  - It must not own lifecycle truth and must not emit enabled live controls.
- `src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts`
  - Extend mapper tests for Phase 5 review-required, failed gate, block reason, remediation child/target, superseded/canceled, and archive behavior.
- `src/screens/war-room/v1/__tests__/war-room-v1-review-loop.test.tsx`
  - New component/DOM tests for Phase 5 hooks if React Testing Library remains stable. If brittle, compensate with mapper tests plus regression/browser assertions and state why in the handoff.
- `src/routes/api/war-room-v1-kanban-lifecycle.ts`
  - Allowed only to normalize additional read-only fields already exposed by the dashboard/fallback task source: block reason, run status/summary/metadata, comments/handoff excerpts, children/remediation ids, parent ids, superseded/canceled clues, and latest failed gate summaries.
  - Must remain GET/read-only. Existing POST/PATCH/DELETE 405 behavior must remain.
- `src/server/kanban-dashboard-proxy.ts` and/or `src/server/kanban-backend.ts`
  - Allowed only if the existing read-only dashboard/fallback wrapper has the metadata but does not expose it to the API route. No write methods may be added or broadened for Phase 5.
- `scripts/war-room-v1-regression-gate.mjs`
  - Add static checks for required Phase 5 hooks, review loop contract, failed-gate evidence, no-auto-complete lock, superseded stamp, remediation route, and unsafe live-action controls.
- `scripts/war-room-v1-screenshot-evidence.mjs`
  - Add browser assertions for Phase 5 DOM hooks and the absence of enabled live actions.
- `docs/status/implementation/war-room-v1-phase5-qa-review-remediation-handoff.md`
  - Optional implementation evidence artifact only if the implementation card is asked to write one.

Forbidden files/areas:

- No public assets, generated candidates, live asset manifests, god/model/asset-family replacement, or final art promotion.
- No `package.json`, lockfile, dependency, Electron, Vite, Tailwind, global style, or config changes unless a gate proves they are strictly necessary and the implementation card blocks for review before doing so.
- No `src/routeTree.gen.ts` changes are expected unless route generation is automatically produced by a route file already in scope; do not promote v1 to default.
- No Hermes config, credentials, `.env`, profile memory/skills/cron, gateway runtime config, or direct Kanban DB write code.
- No task write/dispatch/approval/status mutation endpoints or UI controls.

## 5. Phase 5 data contract

Add or extend the read-only visual contract with the following fields. Names may be adjusted to match project style, but the semantics are required.

```ts
type WarRoomV1GateEvidenceStatus = 'pass' | 'fail' | 'warning' | 'unknown' | 'not-run'

type WarRoomV1GateEvidence = {
  id: string
  label: string
  command?: string | null
  status: WarRoomV1GateEvidenceStatus
  exitCode?: number | null
  summary: string
  sourceTaskId: string
  sourceRunId?: string | number | null
  artifactPath?: string | null
  observedAt?: string | number | null
}

type WarRoomV1ReviewLoopState = {
  sourceTaskId: string
  reviewRequired: boolean
  reviewReason: string
  reviewStatus: 'pending-review' | 'blocked-by-gate' | 'remediation-created' | 'remediation-verified' | 'accepted' | 'archived'
  latestReviewer?: string | null
  latestReviewSummary?: string | null
  gateEvidence: WarRoomV1GateEvidence[]
  noAutoCompleteLock: boolean
  sourceEvidence: WarRoomV1SourceEvidence[]
}

type WarRoomV1BlockerDecision = {
  sourceTaskId: string
  blockReason: string
  decisionNeeded: string
  responsibleLane: 'DLV' | 'claudearchitect' | 'codexintegrator' | 'visualqaagent' | 'releaseagent' | 'claudevision' | 'boardjanitor' | 'unknown'
  sourceEvidence: WarRoomV1SourceEvidence[]
}

type WarRoomV1RemediationRoute = {
  sourceTaskId: string
  remediationTaskId?: string | null
  targetStationId: WarRoomV1StationId
  responsibleAgent: string
  remediationReason: string
  failedGateSummary?: string | null
  routeId: WarRoomV1RouteId | 'qa-to-remediation' | 'blocker-to-remediation' | 'remediation-to-qa'
  sourceEvidence: WarRoomV1SourceEvidence[]
}

type WarRoomV1ArchiveLedgerEntry = {
  sourceTaskId: string
  status: 'completed' | 'accepted' | 'superseded' | 'canceled' | 'auto-reviewed' | 'remediated'
  stampLabel: string
  summary: string
  supersededByTaskId?: string | null
  verificationSummary?: string | null
  sourceEvidence: WarRoomV1SourceEvidence[]
}

type WarRoomV1Phase5LoopVisual = {
  reviewLoop?: WarRoomV1ReviewLoopState
  blockerDecision?: WarRoomV1BlockerDecision
  remediationRoute?: WarRoomV1RemediationRoute
  archiveLedgerEntry?: WarRoomV1ArchiveLedgerEntry
  sourceTaskIds: string[]
  supersededCanceledStamp?: string | null
  noAutoCompleteLock: boolean
}
```

`WarRoomV1MissionVisual` should expose a `phase5Loop` field or equivalent containing this read-only data.

Required source fields for `WarRoomV1RawTask` normalization, when available:

- `id`, `title`, `status`, `assignee`, `priority`, `parents`, `children`.
- `run.id`, `run.status`, `run.startedAt`, `run.lastHeartbeatAt`, `run.completedAt`.
- `blockReason` and exact block reason text.
- `reviewRequired` boolean and review-required clue text.
- `completionSummary`, latest run summary/result, latest run metadata, and latest error/failure excerpt.
- Comment/handoff excerpts containing `review-required:`, `Phase X QA evidence`, `BLOCK`, failed command names, exit codes, artifact paths, remediation recommendation, or safety statement.
- `remediation`, `remediationReason`, `remediationTaskId`, `supersededReason`, and `supersededByTaskId` when known.

If any source field is unavailable, the UI must say `evidence unavailable` or `not exposed by read-only feed`; it must not invent it.

## 6. Mapping rules into War Room v1 stations

### 6.1 `qa-inspection-table`

A task maps to QA/review visibility when any read-only clue is present:

- `task.reviewRequired === true`.
- `status`, `blockReason`, run summary, result, metadata, or comment text contains `review-required`, `needs independent QA`, `visual QA`, `release review`, `gate`, `typecheck`, `build`, `browser QA`, `screenshot`, or `evidence`.
- The lifecycle is already `qa-review`.

Required display:

- Show review loop root and QA evidence chips.
- Show exact source task id and any parent/remediation ids.
- Show test/build/browser command summaries only if present in source evidence.
- Show `No auto-complete` lock when review is pending or failed.
- Do not render pending review as a completed/victory state.

### 6.2 `blocker-decision-lane`

A task maps to blocker lane when:

- `task.blockReason` exists.
- status is `blocked`.
- comment/run summary says `BLOCK`, `QA BLOCK`, `blocked by`, `needs DLV`, or `human decision needed`.

Required display:

- Preserve exact block reason text.
- Show the responsible lane inferred from the blocker text and routing policy: code/hook failures to `codexintegrator`, visual direction ambiguity to `claudevision`, architecture/lifecycle ambiguity to `claudearchitect`, visual/browser QA to `visualqaagent`, release gates to `releaseagent`, DLV-only decisions to `DLV`.
- Show locked chips: `No guessing`, `No blind remediation`, `No auto-complete`, and inherited shop/supplier/ShotLab/paid/account locks.
- If blocker recommends a remediation task, show the remediation target id if available; otherwise show `remediation target not yet exposed`.

### 6.3 `central-command-table`

The command table remains the central decision anchor. Phase 5 adds review/block/remediation summaries to the table but does not replace Phase 4 approvals.

Mapping:

- Review-required tasks emit a command event with `riskType='review-required'`, `status='needs-review'`, `lifecycleRoute.routeId='qa-to-command'`, and requested decision `Review evidence and decide accepted / remediate / stay blocked`.
- Blocked tasks emit `riskType='blocked-needs-input'`, `status='needs-decision'`, route `command-to-blocker`, and exact block reason.
- Failed gates emit a review loop with `reviewStatus='blocked-by-gate'` and a remediation route back to the responsible station.
- Remediated tasks may emit a read-only info event only after evidence shows the remediation gates passed. They must not imply DLV approved live actions.

### 6.4 `remediation-route`

Phase 5 should render remediation as a visibly different return path, not the same initial assignment route.

Mapping:

- Failed test/typecheck/build/regression/browser/static safety gate in QA evidence routes from `qa-inspection-table` to the responsible station/agent.
- Code/hook/test failures route to `active-work-station` with `responsibleAgent='codexintegrator'` or the assignee named in evidence.
- Visual drift routes to `qa-inspection-table` or a `claudevision` review marker; do not assign visual ambiguity to Codex unless the failure is a DOM/style hook defect.
- Architecture ambiguity routes to `planning-strategy-desk` / `claudearchitect`.
- Human blocker routes to `blocker-decision-lane` / `DLV`.
- Superseded duplicate cards route to `archive-victory-ledger` with a superseded stamp, not to active work.

Required example from Phase 4 evidence:

- `t_149c4228` failed `pnpm gate:war-room-v1` and JSON regression gate because `war-room-v1-command-table.test.tsx` errored with `React.act is not a function`.
- The route must show QA inspection table -> remediation route -> `codexintegrator` / active work station -> evidence verified by `t_6e1b7741`.
- It must not say Phase 4 was always green; it should show the fail and the later remediation proof.

### 6.5 `archive-victory-ledger`

Completed, accepted, superseded, canceled, auto-reviewed, and remediated tasks map to archive only when source status/summary supports that state.

Rules:

- `done` / `completed` with a verification summary becomes archive/victory ledger.
- `review-required` that was later auto-reviewed may show `AUTO-REVIEWED` only if the source run/comment says auto-review approved and gates passed.
- Superseded/canceled tasks must show a stamp and be removed from active movement.
- Completed tasks with earlier failed QA should show both the final pass and the prior failure/remediation chain if source evidence is available.
- Never convert pending blockers into archive entries.

## 7. Phase 5 stable selectors / DOM hooks

Preserve all Phase 1-4 hooks, including:

- `[data-war-room-v1-map]`
- `[data-war-room-v1-feed-source]`
- `[data-war-room-v1-station="..."]`
- `[data-war-room-v1-task-id="t_..."]`
- `[data-war-room-v1-lifecycle="..."]`
- `[data-war-room-v1-agent-unit="..."]`
- `[data-war-room-v1-route-id="..."]`
- `[data-war-room-v1-approval-lock]`
- `[data-war-room-v1-block-reason]`
- `[data-war-room-v1-review-required]`
- `[data-war-room-v1-remediation-child]`
- `[data-war-room-v1-command-table-root]`
- `[data-war-room-v1-command-table-event="command-event-..."]`
- `[data-war-room-v1-requested-decision]`
- `[data-war-room-v1-approval-seal]`
- `[data-war-room-v1-locked-action-chip="..."]`
- `[data-war-room-v1-source-evidence]`
- `[data-war-room-v1-lifecycle-route="..."]`
- `[data-war-room-v1-no-enabled-live-action-check="true"]`

Add Phase 5 hooks:

- `[data-war-room-v1-review-loop-root]`
- `[data-war-room-v1-review-loop-task-id="t_..."]`
- `[data-war-room-v1-review-status="pending-review|blocked-by-gate|remediation-created|remediation-verified|accepted|archived"]`
- `[data-war-room-v1-gate-evidence-chip="..."]`
- `[data-war-room-v1-gate-evidence-status="pass|fail|warning|unknown|not-run"]`
- `[data-war-room-v1-gate-command="..."]`
- `[data-war-room-v1-gate-exit-code="0|1|..."]`
- `[data-war-room-v1-blocker-decision-lane]`
- `[data-war-room-v1-blocker-source-task-id="t_..."]`
- `[data-war-room-v1-blocker-reason]`
- `[data-war-room-v1-responsible-lane="DLV|claudearchitect|codexintegrator|visualqaagent|releaseagent|claudevision|boardjanitor|unknown"]`
- `[data-war-room-v1-remediation-route]`
- `[data-war-room-v1-remediation-source-task-id="t_..."]`
- `[data-war-room-v1-remediation-target-task-id="t_..."]`
- `[data-war-room-v1-remediation-target-agent="..."]`
- `[data-war-room-v1-remediation-failed-gate]`
- `[data-war-room-v1-source-task-id="t_..."]`
- `[data-war-room-v1-superseded-stamp]`
- `[data-war-room-v1-superseded-by-task-id="t_..."]`
- `[data-war-room-v1-archive-ledger-entry]`
- `[data-war-room-v1-archive-stamp="completed|accepted|superseded|canceled|auto-reviewed|remediated"]`
- `[data-war-room-v1-no-auto-complete-lock="true"]`
- `[data-war-room-v1-no-enabled-live-action-check="true"]` must remain exactly one or otherwise be unambiguous in browser QA.

QA must be able to determine from DOM alone:

- source task ids for review/blocker/remediation/archive states;
- gate command/status/exit summary when available;
- exact block reason;
- remediation route and responsible station/agent;
- superseded/canceled stamp;
- no-auto-complete lock;
- no enabled live action controls.

## 8. Required tests and regression/browser QA commands

Run from `/Users/mac/hermes-workspace` and include real outputs in the implementation handoff.

Focused tests:

```bash
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-live-kanban.test.ts
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-agent-motion.test.tsx
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-command-table.test.tsx
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-review-loop.test.tsx
```

Regression, typecheck, build:

```bash
pnpm gate:war-room-v1
node scripts/war-room-v1-regression-gate.mjs --json
pnpm typecheck
pnpm build
```

Read-only API checks with dev server running on port 3001:

```bash
PORT=3001 pnpm dev
curl -fsS 'http://127.0.0.1:3001/api/war-room-v1-kanban-lifecycle?board=warroom&limit=12'
curl -fsS -X POST 'http://127.0.0.1:3001/api/war-room-v1-kanban-lifecycle?board=warroom' && exit 1 || true
curl -fsS -X PATCH 'http://127.0.0.1:3001/api/war-room-v1-kanban-lifecycle?board=warroom' && exit 1 || true
curl -fsS -X DELETE 'http://127.0.0.1:3001/api/war-room-v1-kanban-lifecycle?board=warroom' && exit 1 || true
pnpm qa:war-room-v1:screenshot -- --base-url=http://127.0.0.1:3001 --out-dir=docs/status/qa/screenshots
```

Static safety assertions:

```bash
node -e "const fs=require('fs'); const files=['src/screens/war-room/v1/WarRoomV1.tsx','src/screens/war-room/v1/WarRoomV1CommandTable.tsx','src/screens/war-room/v1/WarRoomV1ReviewLoop.tsx','src/screens/war-room/v1/war-room-v1-state.ts','src/screens/war-room/v1/war-room-v1-types.ts','src/routes/api/war-room-v1-kanban-lifecycle.ts']; const s=files.filter(fs.existsSync).map(p=>fs.readFileSync(p,'utf8')).join('\n'); if(/Math\.random|random\(|createKanbanCard|updateKanbanCard|approveTask|dispatchTask|completeTask|unblockTask|publish|purchase|refund|renew|supplier message|paid generation/i.test(s)) process.exit(1); console.log('phase5 review loop read-only safety PASS')"
node -e "const fs=require('fs'); const files=['src/screens/war-room/v1/WarRoomV1.tsx','src/screens/war-room/v1/WarRoomV1CommandTable.tsx','src/screens/war-room/v1/WarRoomV1ReviewLoop.tsx']; const s=files.filter(fs.existsSync).map(p=>fs.readFileSync(p,'utf8')).join('\n'); if(/<button[^>]*(publish|buy|purchase|send|refund|renew|paid|generate|upload|approve|dispatch|complete|unblock)|onClick[^\n]*(publish|buy|purchase|send|refund|renew|paid|generate|upload|approve|dispatch|complete|unblock)/i.test(s)) process.exit(1); console.log('no enabled phase5 live/task mutation controls PASS')"
```

Minimum mapper tests:

1. `review-required` task maps to `qa-review`, exposes `reviewLoop.reviewRequired=true`, `reviewStatus='pending-review'`, source task id, no-auto-complete lock, and review command-table event.
2. QA failure summary containing `pnpm gate:war-room-v1 -> exit 1` maps to failed gate chip, `reviewStatus='blocked-by-gate'`, and remediation route to `codexintegrator` when the failure is a code/hook/test failure.
3. Blocked task preserves exact `blockReason`, maps to blocker lane, and exposes responsible lane from routing policy without summarizing away the human decision.
4. Remediation child/target task id maps from source failed QA task to remediation route and back to QA/review after verification.
5. Superseded/canceled task maps to archive ledger with superseded stamp and does not animate as active work.
6. Completed auto-reviewed task with prior review-required evidence shows archive ledger `auto-reviewed` plus source evidence, not a fake never-blocked pass.
7. Normal ready/active low-risk task does not create fake gate evidence and still inherits global live-action locks.
8. Fixture/fallback/unavailable/degraded feed does not turn missing evidence into PASS.
9. Same task/options mapped twice returns identical Phase 5 ids, statuses, route, and locks.

Minimum component/browser assertions:

1. Review loop root exists when review/gate/block/remediation evidence exists.
2. Gate evidence chips expose command/status/exit hooks and visible text.
3. Block reason is visible and exact.
4. Remediation route exposes source task, target task if available, target agent/station, and failed gate summary.
5. Superseded/canceled tasks show stamp and archive ledger entry.
6. No-auto-complete lock is visible for review-required / failed gate states.
7. No enabled live-action or task-mutation controls exist.

## 9. Product / visual QA criteria

Phase 5 passes product QA if:

- The first read remains a clean small readable GBA/Pokemon-like historical strategy war-room map, not flat SaaS cards/glassmorphism.
- QA/review appears as a map/table inspection station, e.g. inspection table, stamped evidence chips, scrolls, or ledger tabs.
- Blocked tasks are spatially distinct in a blocker/decision lane and expose the exact human decision needed.
- Remediation looks like a return route to the responsible station/agent, not a generic status row.
- Completed/remediated/superseded outcomes are archived as a victory ledger/history stamp, not mixed into active movement.
- Moving general/advisor units remain tied to lifecycle state and do not fake progress when the feed is fallback/unavailable/degraded.
- Dense evidence remains progressively disclosed. The map shows the decision route and evidence status; long command output stays in secondary detail or artifacts.
- External shop/supplier/ShotLab/paid/account actions remain visibly NOT CONNECTED.

Phase 5 must not claim:

- final premium art;
- final end-to-end autonomous task management;
- task creation, dispatch, approval, completion, unblock, or status mutation from the UI;
- any live marketplace/shop/supplier/ShotLab/account connectivity;
- default `/war-room` readiness;
- that a failed gate passed unless later source evidence explicitly shows remediation verification.

## 10. Recommended next Codex implementation card

Title: `Codex Integrator: Phase 5 QA/review blocker remediation loops`

Assignee: `codexintegrator`

Parent: this architecture card `t_6ae86e85`.

Scope:

- Implement the smallest read-only Phase 5 visibility layer for `/war-room?v1=1`.
- Add normalized read-only metadata only as needed for review-required, failed gates, block reasons, remediation routes, source task ids, superseded/canceled stamps, no-auto-complete lock, and archive ledger.
- Add `WarRoomV1ReviewLoop.tsx` only if useful; otherwise keep equivalent presentational code bounded and still expose all required hooks.
- Extend mapper/component/regression/browser tests.
- Preserve explicit-only route, GET-only API behavior, Phase 1-4 hooks, deterministic motion, command-table approvals, degraded/non-live honesty, and safety locks.

Required handoff:

- Changed files list.
- Exact outputs for focused tests, regression gate, JSON regression, typecheck, build, read-only GET/POST/PATCH/DELETE API checks, screenshot/browser QA, and static safety assertions.
- DOM evidence for review loop root, gate evidence chips, block reason, remediation route, source task ids, superseded stamp, archive ledger, no-auto-complete lock, and no enabled live action controls.
- Product-drift note: whether the screen still reads as a clean GBA/Pokemon-like historical strategy War Room.
- Safety statement: Etsy/shops are not connected; only mock/theoretical UI is allowed. No shop/supplier/ShotLab paid/live actions.
- If code changed and gates pass, block/hand off as `review-required:` for independent visual/browser QA/release review rather than self-completing final product readiness.

## 11. Final architecture verdict

Status: PASS.

Phase 5 can proceed as a bounded, read-only implementation of QA/review, blocker, and remediation loop visibility on the existing explicit `/war-room?v1=1` War Room v1 slice. The next implementation must make failed gates, review-required handoffs, blockers, remediation routes, source evidence, superseded/canceled stamps, no-auto-complete locks, and archive/victory history visible without adding any new authority, live business connection, task mutation, asset replacement, or route promotion.
