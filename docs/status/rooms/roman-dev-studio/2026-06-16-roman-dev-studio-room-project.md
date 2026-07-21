# Roman Dev Studio room project — living code factory

Task: `t_b9e37f24`
Date: 2026-06-16

## Scope

This is a room-specific project packet for the War Room 10h room factory run. It intentionally avoids shared hot-file integration and keeps all implementation under:

- `src/screens/war-room/v1/room-projects/roman-dev-studio/`
- `public/war-room/v42-connected-ops/roman-dev-studio/`
- `docs/status/rooms/roman-dev-studio/`

## Delivered room concept

Roman Dev Studio is modeled as a living code factory room with five visible lanes:

1. Builder lane — implementation soldier at the code forge.
2. Reviewer lane — senate reviewer at the review lock.
3. QA lane — test courier moving proof bundles to review.
4. Asset lane — asset scribe preparing local manifests/placeholders.
5. Conductor lane — room conductor sequencing local handoffs.

Every lane has an assigned agent, current station, target station, route, task packet id, motion state, speech/update text, and artifact/review-lock relationship.

## Artifact tray and review lock

The room module exposes:

- an artifact output tray with one local artifact per lane;
- a Senate review lock that locks all artifacts before claims of readiness;
- explicit `externalMutation: false` and `liveEnabled: false` on artifacts and locks.

## Safety boundaries

The module hard-codes the current run boundaries:

- workspace-only and local-module-only;
- read-only connector posture;
- dry-run/draft-only outputs;
- no credentials;
- no live API calls;
- no Etsy/shop/supplier/account/paid/Discord/external mutation.

## Integration note

This card does not edit the shared room grid/full-room hot files. A later integration card can import `RomanDevStudioFactoryRoomPanel` and wire it into the opened-room view after shared-file contention risk is low.

## Verification

Local tests were added in:

- `src/screens/war-room/v1/room-projects/roman-dev-studio/__tests__/romanDevStudioFactory.test.tsx`

Expected gates:

- targeted Vitest for the local room project;
- root TypeScript typecheck;
- root build if time allows.
