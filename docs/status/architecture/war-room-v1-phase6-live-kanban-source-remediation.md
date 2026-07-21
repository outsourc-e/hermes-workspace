# War Room v1 Phase 6 — Reliable Live Kanban Source Remediation Contract

Status: PASS for one bounded Codex implementation card
Date: 2026-06-12
Owner lane: claudearchitect
Scope: architecture contract only. Do not edit app code in this architecture card.

Safety statement: Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED; only mock/theoretical/read-only UI is allowed. No live business action, no external account/API action, no Kanban mutation, no Git/destructive command, and no marketplace/shop/supplier/ShotLab connection is authorized by this contract.

## 1. Verdict

PASS.

The next `codexintegrator` card is ready if it is limited to the smallest read-only remediation that makes `GET /api/war-room-v1-kanban-lifecycle?board=warroom` use reliable local `warroom` Kanban data when the Hermes dashboard Kanban feed is unavailable.

The existing degraded response:

```json
{
  "ok": true,
  "source": "workspace-kanban-fallback",
  "live": false,
  "degraded": true,
  "warnings": [
    "Hermes dashboard Kanban feed unavailable: fetch failed",
    "Using workspace Kanban fallback as degraded read-only state; not labeled full live automation."
  ],
  "task_count": 8
}
```

must not remain the final behavior when the local board is readable and `hermes kanban --board warroom stats` exits 0. In that case the UI should show local read-only Kanban lifecycle state as live local automation, not a degraded workspace/demo fallback.

## 2. Inputs read

- `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_24H_AUTONOMOUS_DEV_GUARDRAILS.md`
- `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_JARVIS_DEFINITION_OF_PERFECT.md`
- `docs/status/automation/war-room-agent-routing-policy.md`
- `docs/status/vision/war-room-final-vision-live-spec.md`
- `docs/status/vision/war-room-v1-implementation-roadmap.md`
- `docs/status/release/war-room-morning-approval-20260612.md`
- `src/routes/api/war-room-v1-kanban-lifecycle.ts`
- `src/screens/war-room/v1/war-room-v1-live-kanban.ts`
- `src/screens/war-room/v1/war-room-v1-types.ts`
- `src/screens/war-room/v1/war-room-v1-state.ts`
- `src/server/kanban-dashboard-proxy.ts`
- `src/server/kanban-backend.ts`
- `src/screens/war-room/v1/__tests__/war-room-v1-live-kanban.test.ts`
- `scripts/war-room-v1-regression-gate.mjs`

Read-only local evidence: `hermes kanban --board warroom stats` exited 0 and showed the `warroom` board has readable task counts.

## 3. Current implementation facts

Current route facts:

- `src/routes/api/war-room-v1-kanban-lifecycle.ts` is already GET-first and explicitly returns 405 for POST/PATCH/DELETE.
- The route first calls `fetchDashboardKanbanBoard(board)` from `src/server/kanban-dashboard-proxy.ts`.
- On dashboard failure, it currently calls `listKanbanCards()` from `src/server/kanban-backend.ts`.
- That fallback is labeled `source: 'workspace-kanban-fallback'`, `live: false`, `degraded: true` even when the local Hermes `warroom` board is readable.
- `listKanbanCards()` resolves a generic Workspace/Kanban backend and does not prove that it read the explicit `warroom` board requested by the API query.
- `war-room-v1-live-kanban.ts` currently treats only `source: 'hermes-dashboard-kanban'` as live. It treats `workspace-kanban-fallback` as non-live/degraded.
- `war-room-v1-state.ts` currently degrades motion when `feedSource === 'workspace-kanban-fallback'`, `feedLive === false`, or `feedDegraded === true`.

Therefore the smallest bug class is not visual. It is a source contract problem: a readable local `warroom` board is being represented as a degraded workspace fallback instead of as a reliable local read-only Kanban source.

## 4. Source priority and failure semantics

Implement this exact source priority order:

1. `hermes-dashboard-kanban`
   - Source: Hermes dashboard plugin HTTP feed.
   - Read-only operation: `GET /api/plugins/kanban/board?board=warroom` through `fetchDashboardKanbanBoard('warroom')`.
   - Success condition: HTTP response parses and returns board columns/tasks for the requested `warroom` board within timeout.
   - API labels on success: `source: 'hermes-dashboard-kanban'`, `live: true`, `degraded: false`.
   - Warning policy: no warning unless the response is empty or missing optional fields. Empty board is not an error; it is live but sleeping.

2. Local Hermes Kanban read adapter
   - Source: local read-only adapter for the requested `warroom` board.
   - Preferred safe implementation: a new board-scoped read adapter that either:
     - calls a CLI-safe read command such as `hermes kanban --board warroom ...` with a hard timeout and JSON/stat parsing where available, or
     - reads the board-scoped Hermes SQLite DB directly in read-only mode if the project already has a stable path resolver for board DBs.
   - This adapter must prove it is reading `board=warroom`, not the Workspace swarm board or unscoped default board.
   - Success condition: adapter returns task rows for the requested board, or an empty but valid board state, within timeout.
   - API labels on success: `source: 'local-hermes-kanban'`, `live: true`, `degraded: false`.
   - Warning policy: include the dashboard failure warning, plus a short note such as `Hermes dashboard Kanban feed unavailable; using local read-only Hermes warroom board.` This warning explains source substitution but must not mark the UI degraded.
   - This source is live local automation because it reflects the real local `warroom` board used by the dispatcher, while remaining read-only.

3. Explicit workspace/demo fallback only if both previous sources fail
   - Source: existing generic `listKanbanCards()` / workspace fallback or fixture/demo state.
   - Success condition: returns bounded tasks for UI shape only after both dashboard and local `warroom` reads fail.
   - API labels: `source: 'workspace-kanban-fallback'`, `live: false`, `degraded: true`.
   - Warning policy: must include both upstream/local failure reasons and the existing honest message that this is degraded read-only fallback, not full live automation.

4. Unavailable
   - If no source returns a valid shape, return `ok: false`, `source: 'unavailable'`, `live: false`, `degraded: true`, `tasks: []`, HTTP 503, and warnings with the bounded failure reasons.

Do not use `workspace-kanban-fallback` for a successful local read of the requested `warroom` board. That label is reserved for generic fallback/demo/workspace state.

## 5. Timeout and error handling so the UI never hangs

The implementation must make all source attempts bounded:

- Dashboard source: keep or reduce the existing `AbortSignal.timeout(PROXY_TIMEOUT_MS)` behavior in `kanban-dashboard-proxy.ts`; the API route must catch failures and continue.
- Local source: add a shorter hard timeout, recommended 2,000-5,000 ms. If using `execFile`/`execFileSync`, pass a timeout and avoid shell interpolation. If using SQLite, use read-only access and bounded queries with `limit`.
- Total route behavior: dashboard failure plus local fallback must still return quickly enough for `/war-room` and `/war-room?v1=1` to load without user-visible hanging. Target total route budget: <= 8 seconds worst case; preferred <= 3 seconds when local board is available.
- Never let a failed JSON parse, missing CLI, missing sqlite3, missing DB path, or malformed row crash the route. Convert it to a warning and try the next source.
- Bound warnings to concise strings. Do not dump raw stack traces, tokens, env vars, or full paths that expose secrets.
- Limit task count to the query `limit` after normalization, with route schema max still 25.

## 6. Normalization fields required by the v1 lifecycle mapper

The successful dashboard and local source paths must normalize into the same `WarRoomV1RawTask` shape consumed by `mapWarRoomV1Lifecycle()` and `mapWarRoomV1Mission()`.

Required fields, when present in the source:

- `id`: task id, stable and text-readable.
- `title`: task title.
- `status`: raw Hermes task status, preserving values such as `triage`, `todo`, `ready`, `running`, `blocked`, `done`, plus known synonyms.
- `assignee`: worker/profile name or null.
- `priority`: numeric priority or null.
- `parents`: parent task ids, empty array if unavailable.
- `children`: child task ids, empty array if unavailable.
- `waitingOnParents`: true when parent dependencies prevent readiness, if available.
- `run`: normalized latest/current run object when available:
  - `id`
  - `status`
  - `startedAt`
  - `lastHeartbeatAt`
  - `completedAt`
  - `summary`
  - `metadata`
- `blockReason`: exact blocked/review-required/human-decision text when available.
- `reviewRequired`: true for `review-required:` block reasons, QA review requests, release review gates, or explicit review status.
- `approvalRequired`: true only for DLV approval / external-write / paid / account / destructive-risk gates, not for normal local code review.
- `approvalRisk`, `approvalTargetSystem`, `approvalRequestedAction`: only when the source text really indicates a risk gate.
- `completionSummary`: completion handoff summary when status is done/completed/archived.
- `latestRunSummary`: latest run summary or gate evidence excerpt.
- `commentExcerpts`: bounded comment/handoff excerpts for UI inspection, not full transcript dumps.
- `remediationReason`: failed gate/remediation text when available.
- `supersededReason`: canceled/superseded text when available.
- `placeholder: false` and `fixture: false` for dashboard/local real Kanban rows.

Do not fabricate any field. Missing source data should normalize to null/empty/defaults and remain honest in source evidence.

## 7. `source`, `live`, `degraded`, and `warnings` labeling contract

Allowed API `source` values after this remediation:

- `hermes-dashboard-kanban`: dashboard plugin read succeeded for `board=warroom`.
- `local-hermes-kanban`: local read-only Hermes `warroom` board adapter succeeded.
- `workspace-kanban-fallback`: generic workspace/swarm/demo fallback, used only after dashboard and local board fail.
- `unavailable`: no readable source.

Required type update:

- Add `'local-hermes-kanban'` to `WarRoomV1KanbanFeedSource` and to response normalization in `war-room-v1-types.ts` / `war-room-v1-live-kanban.ts`.

Label truth table:

| Situation | source | live | degraded | warnings |
|---|---|---:|---:|---|
| Dashboard board read succeeds | `hermes-dashboard-kanban` | true | false | none or non-degrading info |
| Dashboard fails, local `warroom` board read succeeds | `local-hermes-kanban` | true | false | dashboard failure + local read-only substitution note |
| Dashboard and local board fail, generic fallback returns shape | `workspace-kanban-fallback` | false | true | all failure reasons + explicit degraded fallback note |
| All sources fail | `unavailable` | false | true | all bounded failure reasons |

Client labeling requirements:

- `normalizeWarRoomV1KanbanResponse()` must treat `local-hermes-kanban` as live when `ok === true`, `live === true`, and `degraded === false`.
- The War Room banner must not say `Degraded fallback · not full live automation` for `local-hermes-kanban`.
- `war-room-v1-state.ts` must not degrade motion merely because the source is local. It may still degrade for stale task/run evidence, explicit `feedLive === false`, explicit `feedDegraded === true`, fixtures, placeholders, or unavailable feeds.
- Warnings may be visible, but a dashboard-fetch warning alone must not disable live local lifecycle visualization when the local board is valid.

## 8. No-write safety

The implementation card must remain read-only.

Forbidden:

- No Kanban mutation from UI or API.
- No `createKanbanCard`, `updateKanbanCard`, task status writes, task completion, unblock, dispatch, archive, approval mutation, or direct SQLite write.
- No POST/PATCH/DELETE expansion on `/api/war-room-v1-kanban-lifecycle`.
- No Git `reset`, `clean`, destructive checkout, broad delete, commit, push, merge, or release packaging.
- No external Etsy/shop/supplier/ShotLab/API/account connection or action.
- No assets, god models, visual redesign, route default changes, release packaging, or unrelated War Room polish.

Allowed:

- Read-only dashboard HTTP GET.
- Read-only local Hermes `warroom` board adapter.
- Read-only browser/HTTP QA.
- Focused tests/static regression updates required to verify the source contract.

## 9. Exact implementation files likely in scope

Primary files:

- `src/routes/api/war-room-v1-kanban-lifecycle.ts`
  - Add the new local source attempt between dashboard and generic workspace fallback.
  - Normalize local task rows into `WarRoomV1RawTask`.
  - Preserve POST/PATCH/DELETE 405 handlers.
  - Preserve `board=warroom` schema and `limit` bounds.

- `src/screens/war-room/v1/war-room-v1-types.ts`
  - Add `local-hermes-kanban` to `WarRoomV1KanbanFeedSource`.
  - Add any optional read-only fields needed for normalized local rows if not already present.

- `src/screens/war-room/v1/war-room-v1-live-kanban.ts`
  - Accept and preserve `local-hermes-kanban` as a valid source.
  - Mark it live/non-degraded when the API response says so.
  - Keep `workspace-kanban-fallback` non-live/degraded.

- `src/screens/war-room/v1/war-room-v1-state.ts`
  - Remove any source-specific degradation for the new local source.
  - Keep degradation for fixture/unavailable/workspace fallback/stale/explicitly degraded feeds.

- `src/screens/war-room/v1/WarRoomV1.tsx`
  - Update source banner/copy only if needed so local source is labeled as local live read-only Kanban, not degraded fallback.

- `src/screens/war-room/v1/__tests__/war-room-v1-live-kanban.test.ts`
  - Add response normalization tests for `local-hermes-kanban`.

- `src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts`
  - Add/adjust mapper tests proving local feed does not force degraded motion while workspace fallback still does.

- `src/routes/api/__tests__/...` or the nearest existing route/server test location, if the project has a pattern for API route tests.
  - Add unit coverage for source priority if practical. If route tests are not set up, add equivalent focused tests around extracted adapter/normalization helpers.

- `scripts/war-room-v1-regression-gate.mjs`
  - Add static checks that the route knows `local-hermes-kanban`, still contains `workspace-kanban-fallback`, still blocks POST/PATCH/DELETE, and keeps `board=warroom`.

Optional helper file if it keeps the route small:

- `src/server/war-room-local-kanban-read.ts`
  - New read-only board-scoped adapter for local Hermes Kanban.
  - Must expose only read/list functions. Do not export create/update/dispatch helpers.
  - Must use a hard timeout and explicit `board` parameter.

Files intentionally out of scope:

- `package.json` / lockfile unless an existing test script already requires no dependency change.
- `src/routeTree.gen.ts` unless route tooling regenerates it as part of normal project workflow.
- Public/generated assets, asset registry, god/unit art, CSS redesign, release docs, marketplace adapters, Hermes profile/config/credentials.

## 10. Implementation card scope for Codex

Create exactly one focused `codexintegrator` card:

Title: `Codex: Phase 6 reliable local War Room Kanban source`

Scope:

- Implement `local-hermes-kanban` as the second source for `/api/war-room-v1-kanban-lifecycle?board=warroom`.
- Preserve dashboard-first behavior.
- Preserve workspace fallback as degraded only after dashboard and local board fail.
- Keep all operations read-only.
- Add tests and static gate updates for the source contract.

Do not broaden into:

- assets or god/unit models,
- visual redesign,
- route default changes,
- task creation/dispatch/approval controls,
- release packaging,
- Etsy/shop/supplier/ShotLab/API integrations,
- Git cleanup or commits.

## 11. Required tests and gates for implementation

The implementer must run from `/Users/mac/hermes-workspace`:

```bash
hermes kanban --board warroom stats
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-live-kanban.test.ts
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts
pnpm gate:war-room-v1
pnpm typecheck
pnpm build
```

If an API route/server test is added, also run its focused command, for example:

```bash
pnpm vitest run src/routes/api/__tests__/war-room-v1-kanban-lifecycle.test.ts
```

Read-only API probes, with the dev server already running:

```bash
curl -fsS 'http://127.0.0.1:3001/api/war-room-v1-kanban-lifecycle?board=warroom&limit=12'
curl -fsS -X POST 'http://127.0.0.1:3001/api/war-room-v1-kanban-lifecycle?board=warroom' && exit 1 || true
curl -fsS -X PATCH 'http://127.0.0.1:3001/api/war-room-v1-kanban-lifecycle?board=warroom' && exit 1 || true
curl -fsS -X DELETE 'http://127.0.0.1:3001/api/war-room-v1-kanban-lifecycle?board=warroom' && exit 1 || true
```

Expected API behavior when dashboard feed is unavailable but local board works:

- HTTP 200.
- `ok: true`.
- `board: "warroom"`.
- `source: "local-hermes-kanban"`.
- `live: true`.
- `degraded: false`.
- `tasks` is an array bounded by `limit`.
- `warnings` may mention dashboard failure and local read-only substitution, but must not say `workspace-kanban-fallback` unless the local adapter also failed.

Safety static check to keep or add inside the implementation handoff:

```bash
node -e "const fs=require('fs'); const files=['src/routes/api/war-room-v1-kanban-lifecycle.ts','src/server/war-room-local-kanban-read.ts'].filter(fs.existsSync); const s=files.map(p=>fs.readFileSync(p,'utf8')).join('\n'); if(/createKanbanCard|updateKanbanCard|approveTask|dispatchTask|refund|renew|purchase|publish|supplier message|paid generation/i.test(s)) process.exit(1); console.log('read-only local kanban source safety PASS')"
```

## 12. Browser / HTTP QA expectations

With a local server running, QA must check both routes:

- `/war-room`
- `/war-room?v1=1`

Expected:

- HTTP 200 for both routes.
- No uncaught page errors.
- No relevant console errors from the Kanban lifecycle fetch.
- DOM still contains `[data-war-room-v1-map]`.
- DOM exposes the feed source, ideally through existing `[data-war-room-v1-feed-source]`, as `local-hermes-kanban` when dashboard is unavailable and local board is readable.
- UI copy must not describe the local board source as `Degraded fallback · not full live automation`.
- Mission markers/tasks render from real local read-only `warroom` board data when available.
- Moving/lifecycle state is allowed for non-stale local tasks because `live: true` and `degraded: false`.
- Locked action copy remains visible.
- No enabled publish/buy/refund/renew/supplier-message/paid-generation/shop/account buttons appear.

Suggested screenshot/evidence command if the project server is already on port 3001:

```bash
pnpm qa:war-room-v1:screenshot -- --base-url=http://127.0.0.1:3001
```

## 13. Acceptance criteria for the Codex implementation card

A reviewer may pass the implementation only if all are true:

1. `/api/war-room-v1-kanban-lifecycle?board=warroom` uses source priority exactly as specified: dashboard, local Hermes Kanban/SQLite/CLI-safe read adapter, then explicit demo/fallback only if both fail.
2. `workspace-kanban-fallback` remains present for honest fallback semantics but is no longer used when the local `warroom` board is readable.
3. `local-hermes-kanban` is typed, normalized, and treated as live/non-degraded in client code when the route returns it as such.
4. Timeouts prevent the route and UI from hanging.
5. Normalized local rows include the fields required by the v1 lifecycle mapper without fabricating data.
6. POST/PATCH/DELETE still return method-not-allowed/read-only responses.
7. `pnpm gate:war-room-v1`, focused tests, `pnpm typecheck`, and `pnpm build` pass or the card blocks with exact command output.
8. Browser/HTTP QA proves `/war-room` and `/war-room?v1=1` load and do not show the local board as degraded fallback.
9. No external shop/supplier/ShotLab/API/account action is connected or enabled.
10. No app scope outside this source contract is changed.

## 14. Notes for reviewers

This is a source reliability remediation, not a product-polish phase. The goal is to remove a false-degraded state when a real local `warroom` Kanban board is readable. If implementation attempts to redesign the map, replace assets, create tasks from the UI, dispatch agents, perform release packaging, or connect business systems, request changes immediately.

## 15. Implementation status — 2026-06-12 06:50 IDT

Implemented the smallest read-only remediation:

- Added `src/server/war-room-local-kanban-read.ts` as a bounded local Hermes `warroom` board reader using `sqlite3 -json` with a 3s timeout and SELECT-only query.
- Updated `src/routes/api/war-room-v1-kanban-lifecycle.ts` source priority to dashboard → `local-hermes-kanban` → `workspace-kanban-fallback` → unavailable.
- Added `local-hermes-kanban` to v1 feed typing/normalization and War Room source copy so local board reads are live/non-degraded when returned by the API.
- Added tests proving local responses stay live and local feed motion is not degraded while workspace fallback still is.
- Updated `scripts/war-room-v1-regression-gate.mjs` static checks for `local-hermes-kanban` source priority.

Commands run from `/Users/mac/hermes-workspace`:

- `pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-live-kanban.test.ts src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts` → exit 0; 2 files / 39 tests passed.
- `pnpm gate:war-room-v1` → exit 0; War Room v1 regression gate PASS.
- `pnpm typecheck` → exit 0.
- `pnpm build` → exit 0; Vite client and SSR builds completed with pre-existing chunk/dynamic-import warnings only.
- `GET http://127.0.0.1:3002/api/war-room-v1-kanban-lifecycle?board=warroom&limit=8` → `ok=true`, `source=local-hermes-kanban`, `live=true`, `degraded=false`, 8 tasks, first task `t_e23f98a4` running.
- Browser smoke for `http://127.0.0.1:3002/war-room` and `/war-room?v1=1` → page title `Olympus War Room — Hermes Workspace`, `[data-war-room-v1-map]` present, `[data-war-room-v1-feed-source="local-hermes-kanban"]` present, no console or JS errors observed.
- Static/browser safety check found no enabled controls for publish, purchase, supplier message, paid generation, refund, renewal, or shop/account edits.

Safety statement: Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED; only mock/theoretical/read-only UI is allowed. No shop/supplier/paid/live actions and no Kanban mutations from the route.
