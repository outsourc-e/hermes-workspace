# Etsy Market Lab — Smart Intake Hermes Worker V1 Verification

Updated: 2026-06-22 15:00 IDT +0300

## Status

**PASS — Smart Intake Hermes Worker V1 is connected behind Smart Intake V2 through the existing controlled runner.**

This is a real bounded Hermes one-shot connection, not a new worker system and not a live marketplace/source connector.

Official surface:

`/war-room?etsyOps=1&bodyRuntime=1`

Workbench path:

`Etsy Market Lab → Odin's Ravens Nest → Smart Intake V2 → Run Hermes Worker V1`

## What changed

Codex connected `smart-intake` as a new controlled agent id behind the existing body/agent-control runner:

- `src/lib/war-room/body/controlled-athena-runner.ts`
- `src/lib/war-room/body/controlled-agent-flow.ts`
- `src/routes/api/war-room/agent-control/run-agent.ts`
- `src/hooks/use-war-room-body.ts`
- `src/screens/war-room/living-v3/LivingWarRoomV3.tsx`
- `src/screens/war-room/living-v3/living-war-room-v3.css`
- tests under `src/lib/war-room/body` and `src/routes/api/war-room/agent-control`

Hermes QA added one small CSS fix after visual review: the Smart Intake worker result header now wraps cleanly instead of overlapping the summary text.

## Safety contract verified

`smart-intake` uses:

```text
Hermes CLI one-shot
--max-turns 1
toolsets:none
JSON-only prompt contract
controlled-athena-runner.ts only
```

Verified locked / blocked:

- no live Etsy publish/edit/upload;
- no live AliExpress / Alibaba / Alura account action;
- no supplier messages or purchases;
- no Google OAuth/private read/write;
- no paid ShotLab generation;
- no browser automation;
- no file edits from the worker;
- no commands from the worker;
- no worker fan-out.

Final control state after Browser QA:

```json
{
  "mode": "frozen",
  "frozen": true,
  "usageAllowed": false,
  "workerSpawnAllowed": false,
  "reason": "Controlled Smart Intake Hermes Worker V1 one-shot completed; agents frozen again.",
  "safetyLocks": {
    "liveExternalMutation": false,
    "autonomousLiveActionAllowed": false,
    "paidGenerationEnabled": false,
    "liveEtsyEnabled": false,
    "supplierMessagingEnabled": false,
    "purchasesEnabled": false
  }
}
```

## Tests / build

Passed:

```bash
pnpm vitest run src/lib/war-room/body src/lib/war-room/living-v3 src/routes/api/war-room/agent-control/-run-agent.test.ts
# 23 files / 112 tests passed

pnpm build
# client + SSR build passed
```

After the CSS readability fix, `pnpm build` passed again.

Build warnings were existing Vite chunk/dynamic-import warnings, not failures.

## Browser QA

Route:

`http://127.0.0.1:3000/war-room?etsyOps=1&bodyRuntime=1`

Verified flow:

1. Opened `Etsy Market Lab`.
2. Opened `Odin's Ravens Nest`.
3. Opened `Smart Intake V2`.
4. Confirmed `Run Hermes Worker V1` is disabled before a local mission exists.
5. Entered mixed-source local QA input:
   - AliExpress URL
   - Google Drive folder URL
   - local image path
   - free-form product prompt
6. Clicked `Run Smart Intake V2`.
7. Verified local mission readback:
   - sources/evidence/matches/dossiers visible
   - missing evidence visible
   - warnings visible
   - safety readback shows `usageAllowed:false · workerSpawnAllowed:false`
8. Clicked `Run Hermes Worker V1`.
9. Verified real controlled Hermes session readback.
10. Verified result panel:
    - `Status completed_local_only`
    - `Session 20260622_150004_4cb4fa`
    - `Usage actual cost not reported; one Hermes CLI model call, max-turns=1`
    - `Frozen usageAllowed:false · workerSpawnAllowed:false`
11. Clicked `Choose for Odin`.
12. Verified pipeline handoff:

```text
Scout -> Odin -> Selected Product -> ShotLab -> SEO -> Draft -> Approval
PRODUCT Qa Rerun After Css Fix: Dolaroboutique Delicate Gold
STAGE Selected Product
NEXT create_shotlab_handoff_local
STATUS Selected product packet created...
ORIGIN smart-intake-local
```

Browser safety proof:

```text
externalCount: 0
console errors: 0
```

## Product-quality note

Functional status is a real PASS: the UI can now call one bounded Hermes worker and get typed guidance back into the Smart Intake/Odin surface.

UX status is not final-product quality yet:

- Smart Intake still lives inside Odin's drawer, not a dedicated full-screen product-prep cockpit.
- The worker's output is guidance only; it does not replace canonical Smart Intake matches or persist a final dossier automatically.
- The worker does not read private Google/Drive content and does not browse marketplaces. It reasons over the local/mock mission packet only.

## Meaning

This closes **Batch 2 / Smart Intake Hermes Worker V1** as a safe controlled integration.

The next safe phase is:

```text
Typed Intent Routing V1
```

Purpose: let DLV type or paste a messy task into the same surface and route it to the correct station/workbench intent while preserving the same frozen/local-only contract.

Still blocked until explicit future approval/design:

- real Google auth/private reads;
- read-only marketplace web research;
- ShotLab paid generation;
- Etsy draft upload;
- any multi-worker fan-out.
