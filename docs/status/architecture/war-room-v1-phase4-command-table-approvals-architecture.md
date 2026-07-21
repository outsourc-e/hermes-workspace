# War Room v1 Phase 4 — Command Table Approvals Architecture

Status: PASS for a bounded implementation card
Date: 2026-06-12
Owner lane: claudearchitect
Scope: architecture contract only. No app code was edited by this task.

## 1. Verdict

Phase 4 is implementation-ready only as a small read-only command-table approval and decision layer on the existing explicit `/war-room?v1=1` Phase 3 slice.

PASS conditions:

- Command-table events are derived only from read-only Kanban/lifecycle/task fields already normalized for War Room v1 plus static safety policy in code.
- The central command table becomes the spatial anchor for risky decisions, review-required handoffs, blocked tasks, and externally risky action summaries.
- Every command-table event is an audit/visibility object, not an enabled approval, dispatch, mutation, marketplace, paid, shop, or account action.
- The implementation preserves Phase 1/2/3 hooks, live read-only Kanban adapter behavior, deterministic moving units, degraded/non-live honesty, and explicit-only `/war-room?v1=1` routing.
- The implementation touches only the files listed in this contract.

BLOCK conditions for the next card:

- Any request to add task writes, dispatch, approval mutation, status mutation, POST/PATCH/DELETE behavior, direct SQLite writes, or “approve from UI” actions.
- Any request to connect Etsy/shop/supplier/ShotLab/paid/account systems, even behind a disabled-looking UI.
- Any request to promote v1 to default `/war-room`.
- Any request to replace gods/models/assets, integrate new public art, or present CSS/procedural placeholders as final art.
- Any proposal that fabricates decisions, approval state, source evidence, QA output, or DLV approval that is not present in read-only task/lifecycle data.

Safety statement: Etsy/shops are not connected; only mock/theoretical UI is allowed.

## 2. Inputs read

- `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_24H_AUTONOMOUS_DEV_GUARDRAILS.md`
- `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_JARVIS_DEFINITION_OF_PERFECT.md`
- `docs/status/automation/war-room-agent-routing-policy.md`
- `docs/status/vision/war-room-final-vision-live-spec.md`
- `docs/status/vision/war-room-v1-implementation-roadmap.md`
- `docs/status/architecture/war-room-v1-phase3-moving-agent-units-architecture.md`
- Phase 3 implementation / QA / release tasks: `t_66741927`, `t_bebe9c2c`, `t_5efabd69`
- Current v1 files under `src/screens/war-room/v1/`

## 3. Current implementation facts

Phase 3 already provides:

- Explicit-only route: `/war-room?v1=1`.
- Read-only Kanban endpoint: `/api/war-room-v1-kanban-lifecycle?board=warroom&limit=12`.
- GET-only adapter behavior, with POST returning 405 / read-only.
- Honest feed states: `hermes-dashboard-kanban`, `workspace-kanban-fallback`, `unavailable`, `fixture`.
- Pure lifecycle mapper: `mapWarRoomV1Mission()` in `src/screens/war-room/v1/war-room-v1-state.ts`.
- Existing lifecycle, station, route, mission, approval-lock, unit identity, and motion types in `war-room-v1-types.ts`.
- Manifest stations and routes, including `central-command-table`, `approval-seal`, and `blocker-decision-lane`.
- `WarRoomV1AgentUnit.tsx` with deterministic motion DOM hooks and reduced-motion CSS.
- `WarRoomV1.tsx` already renders one primary command-table approval object, but it is still a single generic safety block rather than a typed list of command-table events.
- Phase 3 QA passed focused tests, regression gate, typecheck, build, read-only API checks, browser DOM checks, screenshot evidence, no enabled external write controls, and product/safety review.
- Phase 3 release review says the slice is DLV-review-ready only, not final v1, not default `/war-room`, and not final GBA/Pokemon historical strategy art.

Phase 4 must therefore add a typed command-table event contract and diegetic central table rendering, not new authority.

## 4. Exact allowed files for the next implementation card

Allowed new/modified files:

- `src/screens/war-room/v1/war-room-v1-types.ts`
  - Add command-table event, risk type, requested decision, locked-action, read-only action, audit label, source evidence, and lifecycle route types only.
  - Do not add write/mutation command types.
- `src/screens/war-room/v1/war-room-v1-state.ts`
  - Extend the pure mapper so `WarRoomV1MissionVisual` exposes one or more deterministic command-table events derived from existing task/lifecycle/approval/block/review fields and static policy.
  - Keep mapper pure and testable; no DOM, timers, random values, fetches, local storage, browser APIs, mutation calls, or direct Kanban DB reads.
- `src/screens/war-room/v1/war-room-v1-manifest.ts`
  - Add command-table visual offsets or labels only if needed to place event scrolls/seals around the existing central command table.
  - Do not change existing station ids or route ids from Phase 1/2/3.
- `src/screens/war-room/v1/WarRoomV1CommandTable.tsx`
  - New presentational component for central table events, approval seal, locked-action chips, requested-decision text, evidence labels, and read-only action hints.
  - Emits the DOM hooks specified in this contract.
  - May use diegetic scroll/seal/table/plaque styling, but must not own lifecycle truth.
- `src/screens/war-room/v1/WarRoomV1.tsx`
  - Replace the current generic command-table approval aside with `WarRoomV1CommandTable` or wire typed command-table events into it.
  - Preserve the map root, stations, mission markers, feed source banner, non-live disclosure, moving unit, route line, and existing approval lock copy.
- `src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts`
  - Extend mapper tests for command-table event derivation from approval-required, review-required, blocked, external-write, paid, account-risk, and normal low-risk tasks.
- `src/screens/war-room/v1/__tests__/war-room-v1-command-table.test.tsx`
  - New component/DOM tests for the command table if React Testing Library/jsdom remains practical.
  - If component testing proves brittle, compensate with mapper tests plus regression/browser assertions and state why in the handoff.
- `scripts/war-room-v1-regression-gate.mjs`
  - Add static checks for required Phase 4 command-table hooks and unsafe live-action controls.
- `scripts/war-room-v1-screenshot-evidence.mjs`
  - Add browser assertions for command-table root, event card count, approval seal, locked-action chips, requested decision, source task/action evidence, audit label, and no enabled live action controls.
- `docs/status/implementation/war-room-v1-phase4-command-table-approvals-handoff.md`
  - Optional implementation evidence artifact only if the implementation card is asked to write one.

Forbidden files/areas:

- No `src/routes/api/**` changes for Phase 4 unless an existing read-only response field is proven insufficient; if touched, only GET/read-only normalization is allowed and the handoff must justify it.
- No `src/routeTree.gen.ts` changes are expected for Phase 4.
- No `package.json`, lockfile, dependency, Electron, Vite, Tailwind, global style, or config changes unless an existing gate proves a missing dependency and reviewer explicitly approves scope.
- No `public/war-room/**`, generated candidates, asset registry, god/model/asset-family replacement, or final art promotion.
- No Hermes config, credentials, profile memory/skills/cron, `.env`, gateway runtime config, or direct Kanban DB write code.
- No `/api/swarm-kanban` write expansion, task mutation endpoints, approval endpoints, or POST/PATCH/DELETE behavior from the War Room v1 UI.

## 5. Phase 4 data contract

Add or extend the visual contract so each mission can expose command-table event objects. The naming may be adjusted to fit project style, but the fields below are required.

```ts
type WarRoomV1CommandRiskType =
  | 'none'
  | 'external-write'
  | 'paid-action'
  | 'account-risk'
  | 'review-required'
  | 'blocked-needs-input'
  | 'shop-boundary'
  | 'supplier-boundary'
  | 'shotlab-boundary'
  | 'destructive-operation'

type WarRoomV1LockedAction = {
  id: string
  label: string
  reason: string
  riskType: WarRoomV1CommandRiskType
}

type WarRoomV1ReadOnlyAction = {
  id: string
  label: string
  description: string
}

type WarRoomV1SourceEvidence = {
  taskId: string
  taskTitle: string
  status: string
  assignee: string
  lifecycle: WarRoomV1Lifecycle
  stationId: WarRoomV1StationId
  routeId: WarRoomV1RouteId
  field: 'approvalLock' | 'blockReason' | 'reviewRequired' | 'status' | 'staticSafetyPolicy'
  excerpt: string
}

type WarRoomV1LifecycleRoute = {
  fromStationId: WarRoomV1StationId
  commandStationId: 'central-command-table'
  sealStationId: 'approval-seal'
  routeId: WarRoomV1RouteId
  routeLabel: string
}

type WarRoomV1CommandTableEvent = {
  id: string
  targetTaskId: string
  targetAction: string
  riskType: WarRoomV1CommandRiskType
  riskLevel: WarRoomV1ApprovalRisk
  requestedDecision: string
  lockedActions: WarRoomV1LockedAction[]
  allowedReadOnlyActions: WarRoomV1ReadOnlyAction[]
  auditLabel: string
  sourceEvidence: WarRoomV1SourceEvidence[]
  lifecycleRoute: WarRoomV1LifecycleRoute
  approvalSealLabel: string
  status: 'locked' | 'needs-review' | 'needs-decision' | 'read-only-info'
}
```

`WarRoomV1MissionVisual.commandTableEvents` should expose:

- `id`: stable deterministic id, e.g. `command-event-${task.id}-${riskType}`.
- `targetTaskId`: source task id.
- `targetAction`: the action being represented, e.g. `publish listing`, `review implementation evidence`, `answer blocker`, or `inspect read-only task state`.
- `riskType`: one of the explicit risk types above.
- `riskLevel`: existing approval risk level or a deterministic default from risk type.
- `requestedDecision`: one concise human-readable decision prompt. It must never imply approval has happened.
- `lockedActions`: live or risky actions that remain disabled/not connected.
- `allowedReadOnlyActions`: safe visibility actions only, e.g. view evidence, inspect board, read source task, copy task id.
- `auditLabel`: deterministic audit label suitable for QA and screenshots, e.g. `DLV-LOCKED external-write t_123`.
- `sourceEvidence`: exact read-only fields that caused the event.
- `lifecycleRoute`: route from the mission state to `central-command-table` and `approval-seal`.
- `approvalSealLabel`: short diegetic label such as `SEALED UNTIL DLV APPROVES`.
- `status`: locked/review/decision/info state for styling only; not a permission authority.

If the implementation chooses a single event per mission for Phase 4, it must still use an array shape or a future-safe equivalent so later phases can render several events without another contract rewrite.

## 6. Required command-table event derivation rules

Rules are deterministic and first-match only where noted. Do not infer live approval from missing data.

### 6.1 External-write / paid / account / shop / supplier / ShotLab risk

A task/action maps to `riskType='external-write'`, `paid-action`, `account-risk`, `shop-boundary`, `supplier-boundary`, or `shotlab-boundary` when any of these read-only clues are present:

- `task.approvalRequired === true`.
- `task.approvalTargetSystem` or `task.approvalRequestedAction` mentions Etsy, shop, listing, order, refund, renewal, ad, account, supplier, AliExpress, Alibaba, ShotLab, paid generation, publish, purchase, message, upload, or live external action.
- `task.title`, `task.blockReason`, or approval copy clearly mentions the same high-risk boundary.
- Static safety policy says the action class is forbidden without explicit DLV approval.

Required output:

- Station/route: central command table + approval seal; `lifecycleRoute.commandStationId='central-command-table'`, `sealStationId='approval-seal'`, preferred route `command-to-approval`.
- Requested decision: `DLV explicit approval required before any live external/paid/account action. UI remains read-only.`
- Locked actions must include the concrete action label if available and at least one generic boundary lock, e.g. `No Etsy/shop/supplier/ShotLab paid/live action`.
- Allowed read-only actions may include `View source task`, `Inspect evidence`, `Read safety policy`, and `Copy task id` only.
- Audit label must include `DLV-LOCKED`, risk type, and task id.

### 6.2 Review-required state

A task maps to `riskType='review-required'` when:

- `task.reviewRequired === true`.
- status or block reason contains `review-required`.
- lifecycle is `qa-review` because of review-required, QA, or release review wording.

Required output:

- Station/route: central command table with review scroll; approval seal may show `REVIEW SEAL`, but no approval mutation is enabled.
- Requested decision: `Review evidence and decide whether this work is accepted, needs remediation, or stays blocked.`
- Locked actions: `No auto-complete`, `No release claim without QA/release evidence`, and any external/live locks inherited from safety policy.
- Allowed read-only actions: `Read implementation handoff`, `Read QA evidence`, `Read release review`, `Inspect DOM/test evidence`.
- Audit label: `REVIEW-REQUIRED ${task.id}`.

### 6.3 Blocked / needs input state

A task maps to `riskType='blocked-needs-input'` when:

- `task.blockReason` exists.
- status is `blocked`.
- lifecycle is `blocked-needs-input`.

Required output:

- Station/route: central command table + blocker decision lane; preferred route `command-to-blocker`.
- Requested decision must include the exact block reason or the clearest available excerpt. Do not summarize away the actual decision needed.
- Locked actions: `No guessing`, `No blind remediation`, and any risky action named in the blocker.
- Allowed read-only actions: `Read blocker`, `Inspect source task`, `Read parent handoff`.
- Audit label: `HUMAN-DECISION ${task.id}`.

### 6.4 Normal low-risk / read-only tasks

Tasks with no approval, review, blocker, external-write, paid, account, shop, supplier, ShotLab, or destructive clues may produce either no command-table event or a `read-only-info` event.

If rendered:

- Risk type: `none`.
- Status: `read-only-info`.
- Requested decision: `No DLV decision required; read-only lifecycle visibility only.`
- Locked actions must still include global external/live action locks.
- Allowed read-only actions are view/inspect-only.
- Audit label: `READ-ONLY ${task.id}`.

### 6.5 Lifecycle route precedence

- `approval-required` lifecycle routes to `central-command-table` + `approval-seal` using `command-to-approval`.
- `blocked-needs-input` routes to `central-command-table` + `blocker-decision-lane` using `command-to-blocker`.
- `qa-review` / `review-required` routes from `qa-inspection-table` to `central-command-table` using `qa-to-command` if supported, otherwise show the table event without changing the unit route.
- Active/running tasks with risky approval metadata may show a table event without moving the unit away from active work unless the lifecycle itself is approval-required.
- Completed/archived tasks can show only read-only audit history; they must not look like pending approval.

## 7. Approval seal and central table UI rules

The central command table must feel like a diegetic strategy-game object, not a generic SaaS card stack.

Required behavior:

1. Render the command-table root near or on the existing `central-command-table` station.
2. Render high-risk events as sealed scrolls / wax seals / command dossiers on the table or connected approval seal.
3. Render review-required events as review scrolls/dossiers, not as successful completion badges.
4. Render blocked events as decision scrolls with the exact human question/block reason.
5. Show locked actions as visible chips/stamps; every chip is disabled/read-only and has no mutation handler.
6. Show allowed actions as read-only inspection hints only. If any element is a `<button>` or `<a>`, it must not dispatch, approve, publish, buy, send, refund, renew, generate, upload, or mutate. Prefer non-interactive text for Phase 4.
7. Keep DLV decisions spatially central: do not move the primary approval/readiness information into a side-panel-only dashboard.
8. Preserve progressive disclosure. The map/table should show the decision and lock; long source metadata can remain in the ledger/secondary inspector.
9. Keep placeholder/non-final copy visible. Phase 4 still does not claim final premium art.

## 8. Required stable selectors / DOM hooks

Preserve all Phase 1/2/3 hooks:

- `[data-war-room-v1-map]`
- `[data-war-room-v1-feed-source]`
- `[data-war-room-v1-station="..."]`
- `[data-war-room-v1-task-id="t_..."]`
- `[data-war-room-v1-lifecycle="..."]`
- `[data-war-room-v1-agent-unit="..."]`
- `[data-war-room-v1-unit-id="..."]`
- `[data-war-room-v1-unit-role="..."]`
- `[data-war-room-v1-unit-sprite="..."]`
- `[data-war-room-v1-route-id="..."]`
- `[data-war-room-v1-source-station="..."]`
- `[data-war-room-v1-current-station="..."]`
- `[data-war-room-v1-target-station="..."]`
- `[data-war-room-v1-motion-state="active|static|degraded"]`
- `[data-war-room-v1-motion-reason="..."]`
- `[data-war-room-v1-approval-lock]`
- `[data-war-room-v1-block-reason]`
- `[data-war-room-v1-review-required]`
- `[data-war-room-v1-remediation-child]`
- `[data-war-room-v1-non-live-disclosure]`

Add Phase 4 hooks on the command-table component and event elements:

- `[data-war-room-v1-command-table-root]`
- `[data-war-room-v1-command-table-event="command-event-..."]`
- `[data-war-room-v1-command-event-task-id="t_..."]`
- `[data-war-room-v1-command-event-risk-type="external-write|paid-action|account-risk|review-required|blocked-needs-input|..."]`
- `[data-war-room-v1-command-event-risk-level="low|medium|high|critical"]`
- `[data-war-room-v1-command-event-status="locked|needs-review|needs-decision|read-only-info"]`
- `[data-war-room-v1-command-event-target-action="..."]`
- `[data-war-room-v1-requested-decision]`
- `[data-war-room-v1-approval-seal]`
- `[data-war-room-v1-approval-seal-label="..."]`
- `[data-war-room-v1-locked-action-chip="..."]`
- `[data-war-room-v1-allowed-read-only-action="..."]`
- `[data-war-room-v1-audit-label="..."]`
- `[data-war-room-v1-source-evidence]`
- `[data-war-room-v1-source-evidence-field="approvalLock|blockReason|reviewRequired|status|staticSafetyPolicy"]`
- `[data-war-room-v1-lifecycle-route="command-to-approval|command-to-blocker|qa-to-command|..."]`
- `[data-war-room-v1-no-enabled-live-action-check="true"]`

QA must be able to determine from DOM alone:

- which task/action each command event represents;
- risk type and risk level;
- requested DLV decision;
- exact locked actions;
- allowed read-only actions;
- audit label;
- source evidence field/excerpt;
- lifecycle route to the command table / approval seal;
- that no enabled live action exists.

## 9. Acceptance tests

Minimum mapper tests in `war-room-v1-state.test.ts`:

1. Approval-required Etsy/shop/publish task maps to a command-table event with `riskType='shop-boundary'` or `external-write`, `riskLevel='critical'` or `high`, route `command-to-approval`, approval seal label, locked publish/shop action, and no write authority.
2. Paid generation / ShotLab task maps to `paid-action` or `shotlab-boundary`, includes locked paid generation action, and requests explicit DLV approval.
3. Supplier/AliExpress/Alibaba message or purchase task maps to `supplier-boundary` or `external-write`, includes locked supplier message/purchase action.
4. Account/settings/refund/renewal/order task maps to `account-risk`, includes locked account/order action.
5. Review-required task maps to `review-required`, requested decision says accept/remediate/stay blocked, locked actions include no auto-complete/release claim.
6. Blocked task preserves the exact `blockReason` in requested decision/source evidence and maps to `blocked-needs-input` / `command-to-blocker`.
7. Normal ready/active low-risk task either has no event or a `read-only-info` event, and never exposes a live action.
8. Fixture/degraded/unavailable feed does not change a locked event into an approved/active permission.
9. Same task/options mapped twice returns identical command-table event ids, audit labels, risk type, route, and locked actions.

Minimum component/static assertions:

1. `WarRoomV1CommandTable` emits all required Phase 4 data hooks.
2. Locked action chips render as disabled/read-only text with no live mutation handlers.
3. Requested decision and source evidence are visible/accessibility-readable.
4. Regression gate fails if command-table hooks are missing.
5. Regression gate fails if unsafe live-action controls or mutation words appear in enabled button/link/handler patterns.

## 10. Verification commands for the implementation card

Run from `/Users/mac/hermes-workspace` and include real outputs in the Kanban handoff.

Focused tests:

```bash
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-live-kanban.test.ts
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-agent-motion.test.tsx
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-command-table.test.tsx
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

Additional browser DOM assertions to add to the screenshot/probe script:

```js
await page.goto(`${baseUrl}/war-room?v1=1`)
await expect(page.locator('[data-war-room-v1-command-table-root]')).toHaveCount(1)
await expect(page.locator('[data-war-room-v1-command-table-event]').first()).toBeVisible()
await expect(page.locator('[data-war-room-v1-approval-seal]').first()).toBeVisible()
await expect(page.locator('[data-war-room-v1-locked-action-chip]').first()).toBeVisible()
await expect(page.locator('[data-war-room-v1-requested-decision]').first()).toContainText(/DLV|review|decision|approval|blocked/i)
await expect(page.locator('[data-war-room-v1-audit-label]').first()).toContainText(/LOCKED|REVIEW|DECISION|READ-ONLY/i)
await expect(page.locator('[data-war-room-v1-no-enabled-live-action-check="true"]')).toBeVisible()
const forbidden = await page.locator('button:not([disabled]), a[href]').evaluateAll((els) =>
  els.filter((el) => /publish|buy|purchase|send|refund|renew|paid|generate|upload|approve|dispatch/i.test(el.textContent || '')).map((el) => el.textContent?.trim()),
)
expect(forbidden).toEqual([])
```

Safety assertions:

```bash
node -e "const fs=require('fs'); const files=['src/screens/war-room/v1/WarRoomV1.tsx','src/screens/war-room/v1/WarRoomV1CommandTable.tsx','src/screens/war-room/v1/war-room-v1-state.ts','src/screens/war-room/v1/war-room-v1-types.ts']; const s=files.filter(fs.existsSync).map(p=>fs.readFileSync(p,'utf8')).join('\n'); if(/Math\.random|random\(|POST|PATCH|DELETE|createKanbanCard|updateKanbanCard|approveTask|dispatchTask|publish|purchase|refund|renew|supplier message|paid generation/i.test(s)) process.exit(1); console.log('phase4 command-table read-only safety PASS')"
node -e "const fs=require('fs'); const files=['src/screens/war-room/v1/WarRoomV1.tsx','src/screens/war-room/v1/WarRoomV1CommandTable.tsx']; const s=files.filter(fs.existsSync).map(p=>fs.readFileSync(p,'utf8')).join('\n'); if(/<button[^>]*(publish|buy|purchase|send|refund|renew|paid|generate|upload|approve|dispatch)|onClick[^\n]*(publish|buy|purchase|send|refund|renew|paid|generate|upload|approve|dispatch)/i.test(s)) process.exit(1); console.log('no enabled command-table live action controls PASS')"
```

## 11. Product / visual QA criteria

Phase 4 passes product QA if:

- The first read remains a clean GBA/Pokemon-like top-down/isometric historical strategy war-room map, not flat SaaS/glassmorphism.
- The central war table is visually and spatially the decision anchor.
- Risky actions rise to the command table / approval seal as sealed scrolls, dossiers, chips, or plaques rather than side-panel-only dashboard rows.
- Review-required and blocked states are distinguishable from completed/archived states.
- Moving general/advisor units remain tied to lifecycle state; Phase 4 does not introduce random decorative motion.
- Dense command-table events do not clutter the map. If necessary, render only the primary/followed event prominently and summarize background events quietly.
- External shop/supplier/paid/account actions remain visibly NOT CONNECTED.

Phase 4 must not claim:

- final premium GBA/Pokemon-like art;
- final autonomous end-to-end task management;
- task creation, dispatch, approval, or status mutation from the UI;
- any real marketplace/shop/supplier/ShotLab/account connectivity;
- v1 default route readiness;
- that a locked event is an approved action.

## 12. Sequencing rules for implementers

1. Add command-table event types first.
2. Add pure mapper derivation and tests before UI rendering.
3. Add the presentational command-table component with hooks and no mutation handlers.
4. Replace or augment the existing generic approval aside without removing Phase 1/2/3 hooks.
5. Extend static regression and browser screenshot probes.
6. Run focused tests, regression, typecheck, build, API GET/POST checks, browser QA, and static safety assertions.
7. If code changed and gates pass, block/hand off as `review-required:` for independent QA/release review rather than claiming final product readiness.

## 13. Recommended implementation card

Existing child card: `t_94711dc0` — `Codex Integrator: Phase 4 central command-table approvals`.

Assignee: `codexintegrator`.

Scope:

- Implement read-only command-table event derivation and central table rendering for `/war-room?v1=1`.
- Add `WarRoomV1CommandTable.tsx` only if useful; otherwise keep equivalent presentational code bounded in `WarRoomV1.tsx` while still exposing all required hooks.
- Extend mapper/component/regression/browser tests.
- Preserve explicit route, read-only API behavior, Phase 3 deterministic motion, degraded/non-live honesty, and all safety locks.

Required handoff:

- Changed files list.
- Exact test/typecheck/build/browser/API outputs.
- DOM evidence for command-table root, event card, risk type, requested decision, approval seal, locked action chips, audit label, source evidence, lifecycle route, and no enabled live action controls.
- Safety statement: Etsy/shops not connected; only mock/theoretical UI allowed.
- If code changed, finish as `review-required:` for independent QA/release review rather than self-completing final readiness.

## 14. Final architecture verdict

Status: PASS.

Phase 4 can proceed as a bounded implementation of central command-table approvals and decision visibility on the existing `/war-room?v1=1` read-only Kanban lifecycle map. The next implementation must not expand authority, data sources, routes, assets, or side effects. It should only make the current approval/blocker/review safety state explicit, typed, testable, accessible, spatially central, visually diegetic, and honest about all locked external/shop/supplier/ShotLab/paid/account boundaries.
