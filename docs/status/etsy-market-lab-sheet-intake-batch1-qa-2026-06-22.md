# Etsy Market Lab — Sheet Intake Batch 1 QA

Updated: 2026-06-22 12:02:11 IDT +0300

## Status

**PASS WITH UX FIX APPLIED** — Codex Batch 1 is functionally verified on the official Living V3 Etsy surface, after Hermes fixed two visible QA issues in the station workbench shell.

Official surface:

`/war-room?etsyOps=1&bodyRuntime=1`

Official room/tool path:

`Living V3 / Etsy Market Lab → Odin's Ravens Nest → Sheet Intake`

## What Codex added

Verified files/surfaces from the Codex report:

- `src/lib/war-room/living-v3/workspace-tool-registry.ts`
- `src/lib/war-room/living-v3/etsy-sheet-intake.ts`
- `src/server/etsy-sheet-intake.ts`
- `src/routes/api/war-room/etsy-sheet-intake.ts`
- `src/hooks/use-war-room-body.ts`
- `src/screens/war-room/living-v3/LivingWarRoomV3.tsx`
- `src/screens/war-room/living-v3/living-war-room-v3.css`
- `src/lib/war-room/living-v3/etsy-room-contracts.ts`

## Hermes QA fixes applied

1. Fixed the Sheet Intake workbench clipping issue.
   - Problem found in browser QA: the gallery/dossier existed in DOM and worked, but it rendered below the viewport because the Etsy app/shell did not expose a usable scroll area.
   - Fix: scoped CSS adjustments in `living-war-room-v3.css` for `living-v3__etsy-app--sheet-intake` and `living-v3__etsy-shell`.

2. Added a safe local placeholder image.
   - Problem found in visual QA: sample thumbnail `/war-room/placeholder.png` was missing, causing broken image icons.
   - Fix: created `public/war-room/placeholder.png` from an existing local War Room Etsy intake asset.
   - Verified in browser: `naturalWidth=2048`, `naturalHeight=192`.

## Tests / build

Passed:

```bash
pnpm vitest run src/lib/war-room/living-v3 src/lib/war-room/body
# 20 files / 99 tests passed

pnpm build
# client + SSR build passed after the CSS/placeholder fixes
```

Build warnings were existing Vite chunk/dynamic-import warnings, not failures.

## Browser QA

Browser route:

`http://127.0.0.1:3000/war-room?etsyOps=1&bodyRuntime=1`

Verified actions:

1. Opened `Etsy Market Lab`.
2. Opened `Odin's Ravens Nest`.
3. Switched from `Odin Scout` to `Sheet Intake`.
4. Pasted sample CSV:
   - `QA Gold Initial Necklace`
   - `QA Silver Charm Bracelet`
5. Clicked `Import Sheet Intake`.
6. Verified UI readback:
   - `TOTAL ROWS 2`
   - `VALID 2`
   - `REJECTED 0`
   - `DUPLICATES 0`
   - `MISSING IMAGES 1`
   - `UNSAFE 0`
   - final recommendation: `1 product ready for local Odin/ShotLab prep.`
7. Verified Product Gallery cards and markdown dossier preview are visible after the scoped scroll fix.
8. Clicked `Choose for Odin` on `QA Gold Initial Necklace`.
9. Verified packet readback:
   - request/product: `QA Gold Initial Necklace`
   - stage: `Selected Product`
   - next: `create_shotlab_handoff_local`
   - origin: `sheet-intake-local`
10. Verified console errors: none.
11. Verified no failed same-origin API calls during the inspected flow.
12. Verified no external resource entries during the packet selection check.

Latest verified run:

`data/etsy-market-lab/sheet-intake/sheet-intake-mqozhkx5/manifest.json`

Dossiers:

- `data/etsy-market-lab/sheet-intake/sheet-intake-mqozhkx5/products/qa-gold-initial-necklace.md`
- `data/etsy-market-lab/sheet-intake/sheet-intake-mqozhkx5/products/qa-silver-charm-bracelet.md`

## Safety QA

Verified intended locks remain represented in the manifest and UI copy:

- no live Etsy publish/upload/edit/renew/purchase;
- no supplier message;
- no AliExpress/Alibaba live call;
- no Alura live call;
- no Google Sheets write;
- no paid ShotLab generation;
- no Discord send;
- no uncontrolled Hermes worker fan-out;
- no Kanban dispatch;
- no browser automation.

Static review of the new Sheet Intake server/client path found no `child_process`, `spawn`, `exec`, or `execFile` addition in the new intake route/server path.

## Current limitations

- XLSX remains excluded in V1.
- Private Google Sheets are not connected; Google auth is still not configured.
- Public URL intake is HTTPS CSV-only and blocks marketplace/live-service domains.
- External image URLs are treated as evidence text; thumbnails must be local/same-origin/data or fallback local placeholder.
- Manager panel is deterministic/local-only, not an LLM manager yet.
- Sheet Intake can hand off to Odin/local ShotLab prep, but it does not run real ShotLab generation or Etsy draft upload.
- Visual quality is functional and now usable, but not final “perfect Workspace” polish: it still relies on a nested scroll in Odin and uses a generic local placeholder for missing thumbnails.

## Next connection point

Recommended next Hermes-owned connection:

`Command Manager intents V1`

Purpose:

- turn the deterministic Command Room Manager shell into a typed intent router;
- let the manager recommend `use existing tool / improve tool / create room / create hidden worker`;
- keep all routing local-only and readback-focused;
- do not add live actions.

Alternative next Codex-owned polish:

`Sheet Intake UX polish V1`

Purpose:

- make Sheet Intake feel like a first-class app surface, not a nested station tab;
- reduce double-scroll friction;
- improve thumbnails, card density, and dossier layout;
- keep all current local-only contracts unchanged.
