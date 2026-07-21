# Room Workbench Visual Audit — 2026-07-05

Scope: War Room / Workspace Living V3 room surfaces. This audit turns DLV's requirement into an implementation gate: every room must look and behave like the domain it represents, not like a generic text/status wall.

## Contract now enforced in code

- File: `src/lib/war-room/living-v3/room-workbench-contract.ts`
- Test: `src/lib/war-room/living-v3/room-workbench-contract.test.ts`
- Every `LivingV3RoomId` must define:
  - visual metaphor
  - one-line job
  - primary artifact
  - must-show data
  - must-control actions
  - visual requirements
  - forbidden primary UI patterns

Forbidden primary UI patterns include raw JSON, permanent debug/event text, generic equal cards, long paragraphs instead of controls/results, and fake/mock/demo metrics.

## Reusable visual primitives

- Files:
  - `src/screens/war-room/living-v3/RoomWorkbenchPrimitives.tsx`
  - `src/screens/war-room/living-v3/room-workbench-primitives.css`
  - `src/screens/war-room/living-v3/RoomWorkbenchPrimitives.test.tsx`
- Provides:
  - KPI cards
  - visual gauge
  - command table
  - status/lock pill row
  - collapsed proof details

## Room status

| Room / Surface | Current visual status | Notes | Next action |
| --- | --- | --- | --- |
| Atlantis Vault | Upgraded slice complete | Added vault command map, sonar nodes, pipeline command table, DB/readback truth, shared primitives, stronger hierarchy. | Browser visual QA and then use as pattern for other rooms. |
| Goblin Analytics | Strong workbench already | Has charts, product images, proof strip, selected dossier, DB strip. | Keep; align with shared primitives later. |
| Etsy Market Lab | Partial workbench | Has pipeline stages, assets, candidate cards and actions; needs stronger charts and clearer "next control" hierarchy per stage. | Next candidate for visual polish after Atlantis QA. |
| Terra Forge | Functional but mixed | Has model/printer/search structures and machine controls; needs more visual hierarchy for model preview/print flow and live locks. | Add model/print control board using contract. |
| Council of Strategists | Good personality, needs board polish | Has advisor personas/votes/recommendation logic; needs clearer strategy table, vote chart, final recommendation panel. | Add strategy-table layout and compact vote graph. |
| Workspace Core Ops | Approval drawer, not full room | Good as side drawer: DB provider/readback, approvals, OK/Cancel. It is intentionally not the full cockpit. | Keep as drawer; Gateway/Olympus should host full approval bridge view. |

## QA gate for future room UI

Before calling a room "ready", it must pass:

1. Contract exists in `ROOM_WORKBENCH_CONTRACTS`.
2. Primary surface includes at least 3 of: visual map/image/gallery, chart/gauge, table/board, KPI cards, action controls.
3. Proof/raw/readback is collapsed or secondary, never the main view.
4. Live/external actions show locked/readback state until executor QA exists.
5. Focused test + `pnpm typecheck` + browser/visual QA pass.
