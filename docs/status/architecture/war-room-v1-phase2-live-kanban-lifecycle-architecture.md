# War Room v1 Phase 2 — Live Kanban Lifecycle Architecture

Status: PASS
Date: 2026-06-12
Owner lane: claudearchitect
Scope: architecture contract only. No app code was edited.

## 1. Decision

Phase 2 is safe for a bounded Codex implementation card if it remains read-only, keeps `/war-room?v1=1` explicit-only, and connects the existing Phase 1 mapper to real Kanban board state without creating, updating, dispatching, approving, or completing tasks from the War Room UI.

Safety statement: Etsy/shops are not connected; only mock/theoretical UI is allowed. Supplier, ShotLab, paid-generation, account, marketplace, purchase, publish, refund, renewal, message, and destructive/admin actions must remain locked read-only command-table approval objects.

## 2. Inputs read

- `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_24H_AUTONOMOUS_DEV_GUARDRAILS.md`
- `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_JARVIS_DEFINITION_OF_PERFECT.md`
- `docs/status/automation/war-room-agent-routing-policy.md`
- `docs/status/vision/war-room-final-vision-live-spec.md`
- `docs/status/vision/war-room-v1-build-spec.md`
- `docs/status/implementation/war-room-v1-codex-lane-plan.md`
- `docs/status/qa/war-room-v1-phase1-qa.md`
- `docs/status/release/claude-opus-war-room-v1-phase1-release-review.md`
- Current Phase 1 files under `src/screens/war-room/v1/`
- Existing Kanban proxy/backend files: `src/server/kanban-dashboard-proxy.ts`, `src/server/kanban-backend.ts`, `src/routes/api/swarm-kanban.ts`
- Current regression/screenshot gates: `scripts/war-room-v1-regression-gate.mjs`, `scripts/war-room-v1-screenshot-evidence.mjs`

## 3. Smallest safe data path

Use the existing Hermes Dashboard kanban plugin proxy as the first source of truth because it is already dispatcher-aware and avoids direct SQLite writes from the browser/runtime.

Minimum read path:

1. Browser loads `/war-room?v1=1`.
2. `WarRoomV1.tsx` calls a new read-only Workspace route, e.g. `GET /api/war-room-v1-kanban-lifecycle?board=warroom&limit=12`.
3. The route calls `fetchDashboardKanbanBoard('warroom')` from `src/server/kanban-dashboard-proxy.ts` when `caps.kanban` is available.
4. If the dashboard plugin is unavailable, the route may fall back to `listKanbanCards()` only as an explicitly labeled fallback source. It must return `source: "fallback"` and `live: false` or `degraded: true`; the UI must not call this full live automation.
5. The route normalizes read-only task rows into `WarRoomV1RawTask[]` plus feed metadata.
6. `WarRoomV1.tsx` passes those raw tasks into the existing pure mapper in `war-room-v1-state.ts`.
7. The map renders mission markers, route/station states, and unit positions from mapper output plus `war-room-v1-manifest.ts`.

The route must support only `GET`. Do not add POST/PATCH/DELETE in Phase 2. Do not reuse `/api/swarm-kanban` from the v1 map because that API currently exposes writes; Phase 2 needs a narrow read-only adapter with a smaller response shape and stricter safety semantics.

Recommended response shape:

```ts
type WarRoomV1KanbanLifecycleResponse = {
  ok: boolean
  board: 'warroom'
  source: 'hermes-dashboard-kanban' | 'workspace-kanban-fallback' | 'unavailable'
  live: boolean
  degraded: boolean
  generatedAt: string
  tasks: WarRoomV1RawTask[]
  warnings: string[]
}
```

## 4. Allowed implementation files for the next Codex card

Allowed new/modified files:

- `src/routes/api/war-room-v1-kanban-lifecycle.ts`
  - New read-only GET route. If TanStack file-route naming requires a different generated path, keep the route under `src/routes/api/` and document the actual URL in the implementation handoff.
  - Must validate query params: `board` only `warroom`, optional bounded `limit` default 12 max 25.
  - Must return normalized `WarRoomV1RawTask[]` and source/degraded metadata.
- `src/screens/war-room/v1/war-room-v1-live-kanban.ts`
  - New client helper for fetching the read-only endpoint and converting unavailable/degraded responses into honest UI state.
- `src/screens/war-room/v1/war-room-v1-types.ts`
  - Add feed/source/degraded types only if needed.
- `src/screens/war-room/v1/war-room-v1-state.ts`
  - Small mapper additions only for real board fields: review-required reason parsing, block reason, parent-waiting, remediation child link, completion summary, source/freshness flags.
- `src/screens/war-room/v1/WarRoomV1.tsx`
  - Replace the single fixture mission with read-only live feed rendering when `live=true`; preserve honest placeholder/unavailable state when the feed fails.
  - Keep one followed mission primary and background tasks quiet.
- `src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts`
  - Extend mapper tests for real normalized statuses/fields.
- `src/screens/war-room/v1/__tests__/war-room-v1-live-kanban.test.ts`
  - New tests for endpoint response normalization/client helper if practical without a server harness.
- `scripts/war-room-v1-regression-gate.mjs`
  - Add static assertions for read-only route, `board=warroom`, no unsafe methods, live/unavailable labels, stable data hooks, and no forbidden controls.
- `scripts/war-room-v1-screenshot-evidence.mjs`
  - Add browser assertions for live/degraded/unavailable source label and multiple lifecycle hooks if the route returns tasks.
- `docs/status/implementation/war-room-v1-phase2-live-kanban-lifecycle-handoff.md`
  - Optional implementation evidence artifact only if the implementation card is asked to write one.

Forbidden files/areas for the next Codex card:

- No `package.json`, lockfile, dependency, Electron, Vite, or global config changes unless an existing command proves a missing dependency and a reviewer approves scope.
- No Hermes config, credentials, gateway runtime config, profile memory/skills/cron, or `.env` files.
- No direct marketplace/shop/supplier/ShotLab/payment/account files or integrations.
- No `public/war-room/**`, generated candidates, asset registry, or god/model/asset-family replacement.
- No default route promotion: do not make v1 the default `/war-room` experience.
- No write expansion to `/api/swarm-kanban`; do not add POST/PATCH/DELETE to the Phase 2 adapter.
- No direct SQLite write path. Direct read fallback is discouraged; prefer dashboard plugin/proxy. If used at all, it must be isolated server-side, read-only, board-scoped, and labeled degraded.

## 5. Stable data hooks and visual transitions

Required stable DOM/data hooks:

- `[data-war-room-v1-map]` — exactly one map root.
- `[data-war-room-v1-feed-source]` — visible source label: live, degraded fallback, or unavailable.
- `[data-war-room-v1-task-id="t_..."]` — every rendered mission marker.
- `[data-war-room-v1-lifecycle="..."]` — marker and unit lifecycle state.
- `[data-war-room-v1-station="..."]` — all manifest station ids remain present.
- `[data-war-room-v1-agent-unit="..."]` — embodied general/advisor/reviewer/gate unit.
- `[data-war-room-v1-approval-lock]` — locked command-table approval object.
- `[data-war-room-v1-block-reason]` — blocked tasks expose the exact human decision when available.
- `[data-war-room-v1-review-required]` — review-required tasks expose review evidence/summary, not a fake pass.
- `[data-war-room-v1-remediation-child]` — remediation child links are visible when parent/child data exists.
- `[data-war-room-v1-non-live-disclosure]` — present whenever fixture, fallback, unavailable, or mock/theoretical data is rendered.

Task lifecycle to visual state contract:

| Lifecycle | Data trigger | Station / visual transition |
| --- | --- | --- |
| creation/intake | task exists in `todo`/`triage` or new card appears in feed | Mission scroll appears at `mission-intake-gate`; no movement claim until assigned/ready. |
| assignment | `assignee` is set and task is not running/done/blocked | Route line from `central-command-table` to `assignment-dais`; assigned general/advisor appears. |
| running | task status `running` or latest run status running/claimed | Unit moves to `active-work-station`; marker pulses; source label must say real Kanban read-only. |
| review-required | task reason/summary/comment/status includes review-required or QA/review lane | Mission moves to `qa-inspection-table`; `data-war-room-v1-review-required` shows exact evidence source. |
| blocked | status `blocked` or block reason exists | Marker moves to `blocker-decision-lane`; wax/lock banner shows exact block reason. |
| approval-gated | task metadata/body/comment indicates risky/live/human approval, or adapter marks approvalRequired | Mission rises to central table/`approval-seal`; no enabled live action control; target/action/risk displayed. |
| done | status `done`/completed or completion summary exists | Mission routes to `archive-victory-ledger`; unit returns idle/next assignment; summary visible in inspection ledger. |
| remediation child | child task exists because QA/review failed or title/body indicates remediation | Parent shows reroute from QA/blocker to planning; child marker carries `data-war-room-v1-remediation-child`. |

The mapper must remain deterministic: same input task/feed metadata produces the same lifecycle, station, route, unit role, and accessible labels. No random movement may be used to imply real progress.

## 6. Approval table and fake-lifecycle prevention

Central command-table approval stays locked/read-only by these rules:

- The Phase 2 adapter only reads Kanban state. It never writes approval, denial, task status, marketplace action, or dispatch commands.
- Approval objects are rendered as locked table/seal objects with target system, requested action, risk level, and disabled/no-live-control copy.
- Marketplace/shop/supplier/ShotLab/paid/account/destructive actions may appear only as locked theoretical approvals. They must include: `NOT CONNECTED`, `requires explicit DLV approval`, and `no live control enabled`.
- If the feed fails, is empty, uses fallback, or has only fixture data, the UI must render an honest unavailable/degraded/placeholder state and must not label it live automation.
- Each live mission marker must trace to a task id from the read-only response. The UI must not fabricate task ids, run ids, completion summaries, QA results, or block reasons.
- Stale running detection must be based on timestamps/heartbeats when available; if unavailable, show `unknown freshness`, not `active verified`.
- Review-required and remediation states must be sourced from explicit task status/body/comment/child evidence or clear normalized fields; do not infer a pass from the presence of a QA station.

## 7. Exact verification commands for implementation card

Run from `/Users/mac/hermes-workspace` after implementation, using real outputs in the Kanban handoff.

Focused tests:

```bash
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-live-kanban.test.ts
```

Regression gate:

```bash
pnpm gate:war-room-v1
```

Typecheck/build:

```bash
pnpm typecheck
pnpm build
```

HTTP route checks with dev server running on port 3001:

```bash
PORT=3001 pnpm dev
curl -fsS 'http://127.0.0.1:3001/api/war-room-v1-kanban-lifecycle?board=warroom&limit=12'
curl -fsS -X POST 'http://127.0.0.1:3001/api/war-room-v1-kanban-lifecycle?board=warroom' && exit 1 || true
```

Browser route check:

```bash
pnpm qa:war-room-v1:screenshot -- --base-url=http://127.0.0.1:3001 --out-dir=docs/status/qa/screenshots
```

Safety assertions to run/record:

```bash
node -e "const fs=require('fs'); const p='src/routes/api/war-room-v1-kanban-lifecycle.ts'; const s=fs.readFileSync(p,'utf8'); if(/POST|PATCH|DELETE|createKanbanCard|updateKanbanCard|publish|purchase|refund|renew|supplier message|paid generation/i.test(s)) process.exit(1); console.log('read-only adapter safety PASS')"
node -e "const fs=require('fs'); const s=fs.readFileSync('src/screens/war-room/v1/WarRoomV1.tsx','utf8'); if(/<button[^>]*(publish|buy|send|refund|renew|paid|generate)|onClick[^\n]*(publish|buy|send|refund|renew|paid|generate)/i.test(s)) process.exit(1); console.log('no enabled live action controls PASS')"
```

If route naming differs, update the command paths in the implementation handoff and screenshot script, but keep the same assertions: GET works, unsafe methods do not, source label is visible, and live-action controls remain absent.

## 8. Codex implementation card size

One bounded Codex card is sufficient if it implements only:

1. Read-only API adapter for `board=warroom`.
2. Normalization into existing `WarRoomV1RawTask` shape.
3. Client fetch helper with honest live/degraded/unavailable labels.
4. Map rendering of at most 12 tasks with one followed mission primary.
5. Mapper/client tests and regression-gate additions.
6. No writes, no default-route promotion, no asset work.

Do not combine Phase 2 with visual asset replacement, marketplace approvals, task creation/dispatch, or full multi-room JARVIS automation.

## 9. Final architecture verdict

Status: PASS

Phase 2 is safe for Codex implementation as a read-only live Kanban lifecycle adapter. The next card must stay machine-actionable, app-scoped, and bounded to the allowed files above; any request to create/update tasks, approve actions, connect Etsy/shops, promote v1 to default, or replace art/assets should be rejected or split into a separate reviewed card.
