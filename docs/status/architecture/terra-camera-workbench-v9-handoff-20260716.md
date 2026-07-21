# Terra Camera Workbench V9 — Handoff

- Status: **implemented and verified with an honest offline camera state**
- Date: `2026-07-16 20:04 IDT`
- Scope: Terra Forge / Modeling Studio only
- Route: `http://127.0.0.1:3000/war-room?etsyOps=1&bodyRuntime=1`
- Rollback checkpoint: `/Users/mac/hermes-artifacts/terra-3d-room/checkpoints/pre-terra-rework-20260716-185829-+0300`
- Final visual proof: `/Users/mac/hermes-artifacts/terra-3d-room/final-camera-workbench-v9.png`
- Proof SHA-256: `3b99cc86c17774be65ac78b4725f7773a41386e103a5a7a74b1c69171ce98378`

## Product result

The Terra primary surface is now a flat, professional camera-first print cockpit instead of a decorative CSS/asset dashboard.

- One dominant real-camera viewport.
- One compact machine/model/material/profile inspector.
- Exactly four prominent actions: Connect camera, Refresh status, Build dry-run, Approval gate.
- One compact workflow strip.
- One outer Advanced / proof drawer, closed by default.
- No fake printer hero, fake live feed, automatic polling, or automatic camera request.
- Camera empty/error states stay explicit and truthful.

Stable markers:

- `data-terra-primary-ui="camera-workbench-v9"`
- `data-terra-primary-action-count="4"`
- `data-terra-no-auto-polling="true"`
- `data-terra-live-writes="locked"`
- `data-terra-advanced-default="closed"`

## Camera contract

The static `http://<printer>:8080/?action=stream` guess was removed from ElegooSlicer discovery. Status now reports one of:

- `configured-url`
- `elegoo-mqtt-on-demand`
- `unavailable`

For the local Elegoo printer, camera access is `elegoo-mqtt-on-demand`. A frame request can happen only after the user presses Connect camera. The backend then requests `StartVideoStream`, consumes the living `VideoUrl` returned by the printer, and retries the returned media source up to three bounded attempts. No URL, stream, or frame is invented.

## Honest live-frame boundary

Earlier direct probing reached a printer-returned living video URL, but fetching a valid image failed. The final V9 browser QA intentionally did **not** contact the printer or press Connect camera. Therefore:

- the real on-demand path is implemented and unit/API tested;
- the final UI offline/idle state is verified;
- a successfully decoded current live frame is **not claimed**.

## Safety

- No print start, heat, movement, upload, pause, resume, cancel, or slicer execution.
- No automatic `StartVideoStream`.
- Status refresh is read-only and does not open the camera.
- Approval gate stages a local request only.
- Browser QA observed zero `terra-printer-frame` requests and zero external resources.
- No map, room picker, navigation, station IDs, or War Room geometry changed.

## Changed source

- `src/screens/war-room/living-v3/TerraModelPrintStudio.tsx`
- `src/screens/war-room/living-v3/terra-model-print-studio.css`
- `src/screens/war-room/living-v3/TerraModelPrintStudio.test.tsx`
- `src/screens/war-room/living-v3/LivingWarRoomV3.tsx` — target-room wiring only
- `src/lib/war-room/terra/terra-local-assets.ts`
- `src/lib/war-room/terra/terra-local-assets.test.ts`

The repository was already heavily dirty. No reset, clean, stage, commit, push, deletion, or unrelated refactor was performed.

## Verification

- Focused Vitest: `4 files / 20 tests` passed.
- Full TypeScript: `pnpm run typecheck` passed.
- Targeted `git diff --check` passed.
- Production build: `pnpm run build` passed; only existing Vite sourcemap/chunk warnings remained.
- Browser DOM: action count `4`, camera state `idle`, Advanced closed, writes locked, no auto polling.
- Browser network: no external resources, no camera frame request before explicit action.
- Browser console: `0` JavaScript errors / `0` console errors.
- Visual QA: compact Terra header, dominant camera viewport, usable inspector, single Advanced row, no clipping or theme blocker.

## Next safe step

When the printer and camera are reachable, DLV can press **Connect camera** once. Verify that the returned response decodes to a real JPEG/MJPEG frame. If it still fails, inspect only the returned media protocol/port; do not reintroduce guessed static camera URLs.
