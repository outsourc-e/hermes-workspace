# Workspace Kernel V1 — Hermes Verification

Verified: 2026-06-23 12:40:05 IDT +0300

## Status

**Functional PASS with one UI telemetry caveat.**

Codex's `Universal Workspace Action Wrapper / Operating Kernel V1` is present, typed, local-only, tested, and integrated into the Living V3 Command Room as a compact Kernel Console.

Hermes verified the core contract, API route, reducers, adapter, safety defaults, build gate, and a browser/DOM smoke path. I did **not** verify the exact reported persistent `data-station-action-*` marker after opening an Etsy kernel run; Smart Intake/Odin opened, but the marker was not present in the DOM after the focus transition. Treat that as a next-phase UI telemetry cleanup, not a kernel blocker.

## Files inspected

- `src/lib/workspace-kernel/contracts.ts`
- `src/lib/workspace-kernel/blueprints.ts`
- `src/lib/workspace-kernel/router.ts`
- `src/lib/workspace-kernel/reducer.ts`
- `src/lib/workspace-kernel/adapters/living-v3.ts`
- `src/routes/api/war-room/workspace-kernel/route-action.ts`
- `src/routes/api/war-room/workspace-kernel/-route-action.test.ts`
- `src/screens/war-room/living-v3/LivingWarRoomV3.tsx`
- `src/screens/war-room/living-v3/living-war-room-v3.css`

## Verified architecture

Kernel folder:

```text
src/lib/workspace-kernel/
```

Core contracts exist:

- `WorkspaceDomain`
- `WorkspaceRiskClass`
- `WorkspaceBlueprint`
- `WorkspaceAction`
- `WorkspaceRun`
- `WorkspaceEvent`
- `WorkspaceArtifact`
- `WorkspaceApproval`
- `WorkspaceWorkerProfile`

Blueprint registry includes:

- `etsy-smart-product-intake-v1`
- `etsy-draft-prep-v1`
- `shotlab-media-prep-v1`
- `seo-alura-keyword-v1`
- `supplier-proof-v1`
- `cad-3d-print-design-v1`
- `daily-news-content-v1`
- `discord-readback-v1`
- `generic-project-status-v1`
- `approval-gate-v1`

Verified routing examples in tests/source:

- mixed Dolaro/AliExpress/Drive/Sheet/local prompt → `etsy-smart-product-intake-v1`
- CAD/STL/STEP/OpenSCAD/G-code → `cad-3d-print-design-v1`
- daily news/content/video → `daily-news-content-v1`
- publish/upload/pay/purchase/live listing → `approval-gate-v1`

Reducers are pure/local-only and cover:

- create run
- append event
- attach artifact
- request approval
- complete run
- block run

## Safety verification

Static inspection found no new `child_process`, `spawn`, `exec`, network fetch, filesystem write, or live connector call in the kernel/API files.

Kernel safety defaults are locked:

```text
localOnly:true
usageAllowed:false
workerSpawnAllowed:false
externalRequestsAllowed:false
liveActionsAllowed:false
```

Locked actions are explicitly represented:

- live Etsy upload/draft/publish/edit/renew/customer action
- supplier message or purchase
- paid ShotLab/generation spend
- Google private read/write or Sheet write
- browser automation on logged-in sites
- Discord send outside approved path
- printer control/physical production
- worker fan-out/uncontrolled runner spawn

## Tests/build run by Hermes

Passed:

```bash
pnpm vitest run src/lib/workspace-kernel
# 4 files / 15 tests passed

pnpm vitest run src/lib/war-room/living-v3/workspace-station-action-router.test.ts src/lib/war-room/living-v3/workspace-tool-registry.test.ts
# 2 files / 11 tests passed

pnpm vitest run src/routes/api/war-room/workspace-kernel/-route-action.test.ts
# 1 file / 5 tests passed

pnpm vitest run src/lib/war-room/living-v3
# 12 files / 66 tests passed

pnpm vitest run src/lib/war-room/body
# 11 files / 50 tests passed

pnpm build
# passed client + SSR, existing Vite sourcemap/chunk/dynamic-import warnings only
```

## Browser/DOM smoke

Route checked:

```text
http://127.0.0.1:3000/war-room?etsyOps=1&bodyRuntime=1
```

Verified:

- Route returned HTTP 200.
- Kernel Console is visible inside `Olympus Command → Mission Router` with `data-workspace-kernel="v1"`.
- Demo buttons exist:
  - `Stage Etsy intake`
  - `Stage CAD packet`
  - `Stage news packet`
- After staging demo actions, run cards appeared with:
  - `etsy-smart-product-intake-v1` / domain `etsy` / status `running` / approval `not_required`
  - `cad-3d-print-design-v1` / domain `cad-3d-print` / status `waiting_approval` / approval `waiting_operator`
  - `daily-news-content-v1` / domain `content-news` / status `waiting_approval` / approval `waiting_operator`
- External resource delta during kernel staging/opening smoke: `0`.
- Clicking/opening an Etsy kernel run opened/focused Smart Intake/Odin content.

Caveat:

- I did not observe the claimed persistent `data-station-action-agent="odin-scout"` / `data-station-action-motion="basic_station_walk"` marker after the focus transition. The station opened, but the marker/result panel was not present when returning to Mission Router. Next phase should persist action telemetry in a small global/local readback strip or run card metadata so QA markers survive station focus changes.

## Recommendation

Next Codex phase should be:

```text
Migrate Etsy End-to-End onto Kernel V1 + persistent station-action telemetry cleanup
```

Do **not** jump straight to natural agent motion. Natural motion should be driven from kernel events after the Etsy workflow is represented end-to-end as kernel runs/artifacts/approvals.

Next phase should:

1. Convert the existing Etsy pipeline stages into kernel artifacts/events.
2. Keep existing local flow working: Smart Intake → Selected Product → ShotLab → SEO → Draft → Approval.
3. Persist station-action/result telemetry so DOM QA can always see last kernel route/action even after room focus changes.
4. Keep every live action locked.
