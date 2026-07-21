# Etsy Market Lab — Controlled Product Scout Worker V2

Updated: 2026-06-22 01:32:59 IDT +0300

## Status

**PASS — controlled Scout V2 worker output is integrated into Odin and the full local Etsy packet flow still reaches Approval.**

This is a controlled-worker integration pass, not a live marketplace/web-data approval.

## Official surface

- Route: `http://127.0.0.1:3000/war-room?etsyOps=1&bodyRuntime=1`
- UI: `Living V3 / Etsy Market Lab`
- Worker button: `Scout V2`
- Odin in-room button: `Run Scout V2`
- Controlled run id verified in browser: `scout-ui-mqo9l3li`
- Odin packet id verified in browser: `etsy-scout-gold-initial-necklace-gifts-scout-ui-mqo9l3li-mqo9lnjd`

## What changed

- Added approved controlled agent id `scout`, routed visually to `odin-scout`.
- Added `Scout V2` one-shot runner profile in `src/lib/war-room/body/controlled-athena-runner.ts`.
- Added `apply_product_scout_worker_packet_local` intent and safe packet reducer in `src/lib/war-room/living-v3/etsy-room-contracts.ts`.
- Extended the Etsy room event bridge to accept worker-produced Product Scout packets.
- Updated `controlled-agent-flow.ts` so Scout output is immediately reduced into `etsyRoomState` and shown in Odin.
- Updated `use-war-room-body.ts` / `LivingWarRoomV3.tsx` so the UI receives `etsyRoomState` from the controlled run.
- Added a `Run Scout V2` control inside Odin, not only the top HUD.
- Fixed `extractJsonObjectFromHermesOutput`: it now selects the top-level agent JSON when nested `productScout.candidates[]` objects exist, instead of accidentally parsing an inner candidate object.

## Verification performed

Targeted tests before extractor fix:

```text
pnpm vitest run src/lib/war-room/body/controlled-athena-runner.test.ts src/lib/war-room/living-v3/etsy-room-contracts.test.ts src/lib/war-room/body src/lib/war-room/living-v3 --reporter=basic
```

Result:

```text
18 test files passed
89 tests passed
```

After the JSON extractor bug fix:

```text
pnpm vitest run src/lib/war-room/body/controlled-athena-runner.test.ts src/lib/war-room/living-v3/etsy-room-contracts.test.ts src/lib/war-room/body/etsy-room-event-bridge.test.ts --reporter=basic && pnpm build
```

Result:

```text
2 test files passed
14 tests passed
pnpm build passed: client + SSR
```

Browser QA:

- Opened `/war-room?etsyOps=1&bodyRuntime=1` on port `3000`.
- Confirmed `data-living-v3-root=true`.
- Clicked `Scout V2`.
- First run exposed a real bug: the Hermes child returned `productScout`, but the extractor parsed a nested candidate object, so Odin did not receive candidates.
- Fixed extractor and added regression test.
- Re-ran `Scout V2` after clearing local browser pipeline state.
- Odin received 4 candidates:
  - `Gold-Tone Dainty Initial Pendant Necklace Gift`
  - `Small Initial Charm Necklace with Minimal Gift Card`
  - `Gold-Tone Initial Necklace for Bridesmaid or Birthday Gift`
  - `Layered Gold-Tone Initial Necklace Set`
- Verified full flow after Scout V2:
  - `Scout → Odin → Selected Product → ShotLab → SEO → Draft → Approval`
- Final stage: `approval_waiting`.
- Pipeline strip showed `Origin future-internet-scout` with missing public/source proof explicit.
- Final chips showed `BODY / FROZEN / S2✓`.
- Console errors: none.

## Safety readback

Final/fail-closed state remained:

```text
FROZEN
usageAllowed:false
workerSpawnAllowed:false
```

Still locked:

- Etsy upload/draft/publish/edit/renew
- live Alura / Etsy / AliExpress / Alibaba account calls
- supplier messages or purchases
- Google Sheets writes
- ShotLab / paid generation
- browser automation
- Kanban dispatch
- worker fan-out beyond the approved controlled runner

## Important limitation

The verified child Scout run reported that web/search tools were unavailable in that Hermes one-shot context. Therefore Scout V2 currently proves the controlled-agent → ProductScoutPacket → Odin → Approval pipeline, but it does **not** yet prove real public internet/product research.

Next phase should be `Scout V3 read-only evidence`: give only this Scout worker a real read-only research transport/toolset and require URL-backed evidence, while preserving the same FROZEN/no-live-action gates.
