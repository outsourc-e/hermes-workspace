# Etsy Market Lab — Verification Gate

Updated: 2026-06-21 22:47:32 IDT +0300

Route verified:

`http://127.0.0.1:3000/war-room?etsyOps=1&bodyRuntime=1`

## Result

Functional gate: **PASS**

Product/UX gate: **PASS with minor UX issue**

The room is ready for the next controlled phase: `Controlled One-Shot Hermes Worker V1`, as long as the worker remains one-shot, local/event-only, JSON-only, bounded, and returns to `FROZEN`.

## Source of truth used

- Project-local source: `docs/status/etsy-market-lab-current-source-of-truth.md`
- Obsidian source: `/Users/mac/Documents/Hermes Second Brain/01 Projects/War Room/Etsy Market Lab - מקור אמת נוכחי.md`

## Static safety inspection

Required files exist:

- `src/lib/war-room/living-v3/etsy-room-contracts.ts`
- `src/lib/war-room/body/etsy-room-event-bridge.ts`
- `src/lib/war-room/living-v3/bidi-text.ts`
- `src/routes/api/war-room/intents.ts`
- `src/screens/war-room/living-v3/LivingWarRoomV3.tsx`

Targeted scan of non-test files under:

- `src/lib/war-room/living-v3`
- `src/lib/war-room/body`
- `src/routes/api/war-room`
- `src/screens/war-room/living-v3`

Findings:

- No real `spawn`, `exec`, `execFile`, or `node:child_process` execution was found in the Etsy Market Lab runtime path.
- Matches found were safe names/strings such as `createDraftPayloadLocal`, `Kanban dispatch` inside `lockedActions`, and `child_process` inside blocked-action/readback text.
- Fetch calls in targeted runtime paths were relative same-origin calls only:
  - `/api/war-room/etsy-evidence`
  - `/api/war-room/oracle-alura-search`

Safety state counts exist in code:

- `usageAllowed`: present
- `workerSpawnAllowed`: present
- local-only intents present:
  - `prepare_product_scout_packet_local`
  - `select_etsy_candidate_local`
  - `create_shotlab_handoff_local`
  - `create_seo_packet_local`
  - `create_draft_payload_local`
  - `request_dlv_approval_local`

## Tests and build

Passed:

```text
pnpm vitest run src/lib/war-room/body
10 test files passed, 40 tests passed

pnpm vitest run src/lib/war-room/living-v3
8 test files passed, 45 tests passed

pnpm build
client build passed
ssr build passed
```

Warnings only:

- Existing Vite sourcemap/chunk-size/dynamic-import warnings.
- No build failure.

## Browser QA

Browser profile:

- Hermes Chrome automation profile through `hermes-browser-harness` and browser tool verification.

Verified:

- Route returned HTTP 200.
- Page loaded as `Olympus War Room — Hermes Workspace`.
- HUD showed:

```text
V3
BODY
FROZEN
```

- `Run Oracle Scout` created/updated local signal readback.
- Event readback showed local-only packet flow and `control.frozen`.
- `Odin's Ravens Nest` opened as product-finder app.
- Candidate list visible from Oracle/local Alura signal.
- `Select first candidate / Send to ShotLab` created selected product readback.
- `Vulcan ShotLab Gate` opened.
- `Create ShotLab Handoff Packet` created local ShotLab packet.
- `Thoth's Ledger` opened.
- `Create SEO Packet` created local SEO packet with missing keyword metrics explicit.
- `Mercury Draft Courier` opened.
- `Create Draft Payload` and `Create DLV Approval Packet` worked.
- Final visible state remained:

```text
FROZEN
waiting_operator
No live action can run
```

- `Upload Draft locked` button was disabled.
- `Publish locked` button was disabled.
- Browser console had no JS errors.
- Performance resource check showed `externalCount: 0`.

## Minor UX issue

The locked buttons are functionally disabled and visible after scrolling, but the bottom row in the Mercury panel is visually tight: `Upload Draft locked` / `Publish locked` slightly overlap/crowd the approval status strip near the fixed footer.

This is **not a safety blocker** for the controlled worker phase, but it should be fixed in a UI polish pass.

## Noted non-blocker

Unauthenticated direct `curl` probes to some War Room API paths returned HTTP 500 rather than a clean 401/405/404. The same-origin UI flow worked and browser console stayed clean. This should be hardened later, but it did not block the route/browser QA.

## Current decision

`Controlled Etsy Room Ready`: **PASS**

Next implementation phase:

```text
Controlled One-Shot Hermes Worker V1
```

Constraints for that phase:

- one real Hermes worker only
- one local task only
- no marketplace/live actions
- no browser automation from the app
- JSON-only worker output
- bounded timeout
- append event/readback only through typed local intents/events
- return to `FROZEN`
