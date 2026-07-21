# War Room v1 Phase 8 visual hierarchy cleanup

Status: implemented locally; review-required before done.
Date: 2026-06-12
Task: t_31f39ada

## Changed files
- `src/screens/war-room/v1/WarRoomV1.tsx`
- `src/screens/war-room/v1/WarRoomV1CommandTable.tsx`
- `src/screens/war-room/v1/WarRoomV1ReviewLoop.tsx`
- `src/screens/war-room/v1/__tests__/war-room-v1-visual-hierarchy.test.tsx`
- `scripts/war-room-v1-regression-gate.mjs`
- `docs/status/implementation/war-room-v1-phase8-visual-hierarchy-cleanup-20260612.md`

## What changed
- Moved the strategy map to first visual order and enlarged/highlighted it so the central war table reads before proof/debug ledgers.
- Added a diegetic central war table plaque and stable hook: `data-war-room-v1-central-war-table-plaque`.
- Promoted one deterministic followed mission path from the real lifecycle trail, using `local-hermes-kanban` source truth when available.
- Added stable followed/background hooks: `data-war-room-v1-followed-mission` and `data-war-room-v1-route-priority="followed|background-quiet"`.
- Quieted background task markers and moved lifecycle proof/source evidence into collapsed secondary ledgers while preserving existing source/proof DOM hooks.
- Shrank command-table/review overlays so they behave as in-world packets instead of proof walls, and removed enabled-control false positives for archive/approval wording.
- Preserved read-only/no-write API/UI semantics, command-table locks, default gate, and visible NOT CONNECTED safety copy.

## Verification commands run
- `pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-visual-hierarchy.test.tsx src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts` → exit 0. 39 tests passed.
- `pnpm gate:war-room-v1` → exit 0. War Room v1 regression gate PASS, including state, command-table, review-loop, and visual-hierarchy focused tests.
- `pnpm typecheck` → exit 0.
- `pnpm build` → exit 0. Vite client and SSR builds completed; only pre-existing Vite sourcemap/dynamic-import/chunk-size warnings were reported.
- HTTP/API probe `/api/war-room-v1-kanban-lifecycle?board=warroom&limit=8` → `ok=true`, `source=local-hermes-kanban`, `live=true`, `degraded=false`, `task_count=8`.
- Mutation probes POST/PATCH/DELETE `/api/war-room-v1-kanban-lifecycle?board=warroom` → HTTP 405 for each with read-only method-not-allowed response.
- HTTP smoke `/war-room` → 200; `/war-room?v1=1` → 200.
- Browser DOM/console smoke `/war-room` and `/war-room?v1=1` → required hooks present (`map=1`, `central-command-table=1`, `central-war-table-plaque=1`, `followed=1`, `background-quiet>0`, `local-hermes-kanban=1`, `no-enabled-live-action-check=1`), visible `NOT CONNECTED` copy, zero console/page errors observed, and static/browser safety scan found no enabled forbidden live/Kanban mutation controls.
- Browser visual inspection after cleanup: map/central table now reads more prominently than the proof-wall baseline; remaining visual gap is that this is still a CSS/prototype pixel shell, not final product-quality asset art.

## Safety statement
Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED; only mock/theoretical/read-only UI is allowed. This slice only changes local War Room v1 presentation and static/focused tests; it does not create, dispatch, complete, unblock, archive, approve, or otherwise mutate Kanban tasks, and it does not connect shop/supplier/paid/live actions.
