# Etsy Market Lab — Smart Intake V2 Verification

Updated: 2026-06-22 14:05:13 IDT +0300

## Status

**PASS — Smart Intake V2 is verified as a local/mock-executable workbench.**

It is **not yet** a real autonomous source-reading agent. It is the correct workbench/contract foundation for the next Hermes worker connection.

Official surface:

`/war-room?etsyOps=1&bodyRuntime=1`

Workbench path:

`Etsy Market Lab → Odin's Ravens Nest → Smart Intake V2`

## What was verified

Codex added/extended:

- `src/lib/war-room/living-v3/smart-intake-v2.ts`
- `src/lib/war-room/living-v3/smart-intake-v2.test.ts`
- `src/lib/war-room/living-v3/workspace-tool-registry.ts`
- `src/lib/war-room/living-v3/etsy-room-contracts.ts`
- `src/screens/war-room/living-v3/LivingWarRoomV3.tsx`
- `src/screens/war-room/living-v3/living-war-room-v3.css`

Verified contract:

```text
SmartIntakeMission
→ Sources
→ Agent Tasks / Stations
→ Evidence
→ Product Matches
→ Image Sets
→ Markdown Dossiers
→ Gallery
→ Odin / ShotLab local handoff
```

Verified station model:

- `Source Intake`
- `Image Match`
- `Dossier Builder`
- `ShotLab Prep / Approval`

This matches DLV's correction: do not render many agents; represent swarm capability as stations/tools.

## Static safety scan

Targeted scan of Smart Intake V2 files found no new runtime calls to:

- `child_process`
- `execFile`
- `spawn`
- `exec`
- external `fetch`
- `googleapis`
- browser automation libraries
- live AliExpress/Alibaba/Etsy/ShotLab APIs

The only AliExpress/Drive/Sheets occurrences in the new Smart Intake path are source classifiers, sample strings, UI copy, tests, and locked-action/readback strings.

Safety state remains:

```text
usageAllowed:false
workerSpawnAllowed:false
localOnly:true
```

Locked actions remain visible:

- live Etsy upload/publish/edit
- supplier messaging/purchase
- paid ShotLab generation
- Google Sheet write/OAuth
- browser automation
- uncontrolled worker fan-out

## Tests / build

Passed:

```bash
pnpm vitest run src/lib/war-room/living-v3 src/lib/war-room/body
# 21 files / 103 tests passed

pnpm build
# client + SSR build passed
```

Build warnings were existing Vite chunk/dynamic-import warnings, not failures.

## Browser QA

Route:

`http://127.0.0.1:3000/war-room?etsyOps=1&bodyRuntime=1`

Steps verified:

1. Opened `Etsy Market Lab`.
2. Opened `Odin's Ravens Nest`.
3. Confirmed `Smart Intake V2` tab is visible.
4. Entered mixed-source QA input:
   - AliExpress product URL
   - Google Sheets URL
   - Google Drive folder URL
   - local image path
   - free-form prompt
5. Clicked `Run Smart Intake V2`.
6. Verified readback:
   - `SOURCES 5`
   - `EVIDENCE 5`
   - `MATCHES 2`
   - `DOSSIERS 2`
   - `SAFETY usageAllowed:false · workerSpawnAllowed:false`
7. Verified source detection:
   - AliExpress → `BLOCKED LIVE`
   - Google Sheets → `AUTH REQUIRED`
   - Google Drive → `AUTH REQUIRED`
   - local image → `LOCAL REFERENCE ONLY`
   - prompt → `MOCK READABLE`
8. Verified visible tasks/stations:
   - Source Intake
   - Image Match
   - Dossier Builder
   - ShotLab Prep / Approval
9. Verified product/image matching review, best image selection, dossier preview, warnings, missing evidence, and gallery actions.
10. Clicked `Choose for Odin`.
11. Clicked `Prepare ShotLab handoff`.
12. Verified pipeline state:

```text
PRODUCT Find Best Product Prep Path For A Delicate
STAGE ShotLab
NEXT create_seo_packet_local
STATUS ShotLab handoff packet staged locally...
ORIGIN smart-intake-local
```

13. Verified no external browser resources during the inspected flow: `externalCount: 0`.
14. Verified browser console errors: `0`.

## Visual QA notes

Visible workbench is functional and readable after scrolling. It shows the Smart Intake result, warnings, missing evidence, selected image candidates, and final handoff receipt.

Remaining UX limitation:

- The Smart Intake workbench is inside Odin's drawer and can require scrolling; it is usable but not yet a first-class full-screen product-prep cockpit.
- Current behavior is mock/local inference, not a real connected source-reading agent.

## Meaning

This is a **good Batch PASS** for the body/UI/contract layer.

It means the next phase can safely be:

```text
Smart Intake Hermes Worker V1
```

Purpose: connect one bounded Hermes worker behind Smart Intake to solve one messy-source task and return typed JSON/dossiers into this workbench.

Still locked in V1:

- no live marketplace/account actions;
- no supplier messages/purchases;
- no paid ShotLab;
- no Etsy draft upload/publish;
- no uncontrolled worker fan-out;
- Google private reads only after explicit auth/approval path is designed.
