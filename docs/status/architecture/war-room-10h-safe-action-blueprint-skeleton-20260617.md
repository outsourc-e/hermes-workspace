# War Room 10h Safe Action Blueprint Skeleton — 2026-06-17

Scope: local implementation/documentation only under `/Users/mac/hermes-workspace`.

This skeleton models the reference-video operating-system flow without enabling live actions. It is represented in code by `createWarRoom10hActionBlueprintRegistry()` and exposed on the War Room control-spine state as `actionBlueprintRegistry`.

## Safety law

- Autonomous live Etsy/store/supplier/customer/account/paid-generation/Discord actions remain disabled.
- Every blueprint has `liveExecutionEnabled: false` and `externalMutation: false`.
- Each blueprint requires payload preview, risk/evidence summary, and a local audit log.
- Future live execution is only modeled as `lockedLive` / manual-confirm-required, not implemented as an executable connector.

## Pipeline shape

Every blueprint follows:

`trigger -> router -> packet -> room/station -> output/artifact -> approval -> archive -> feedback`

Code fields:

- `trigger`: event that starts the operation.
- `router`: room that routes the operation, currently Olympus Command.
- `packetKind`: workflow packet class carried through corridors.
- `roomId` / `stationId`: execution room and station.
- `connectorId`: optional local/read-only/dry-run connector reference.
- `outputArtifactKind`: local output shape (`draft`, `doc`, `manifest`, `api-evidence`, etc.).
- `approvalGate`: DLV/manual/review lock wording.
- `archiveRoomId`: Atlantis Vault by default for retained evidence.
- `feedbackLoop`: room receiving analytics/learning signal.

## Action classes

- `allowedLocalDraft`: may prepare local drafts, previews, manifests, or audit records only.
- `allowedReadOnly`: may summarize read-only/local-cache evidence only.
- `lockedLive`: represents future manual-confirmed live actions, but execution stays disabled now.

## Seed examples implemented

1. `etsy-listing-draft-prep`
   - Class: `allowedLocalDraft`
   - Flow: opportunity-approved -> Olympus router -> action-draft packet -> Merchant Harbor / Draft Hold -> local draft -> DLV manual confirm required -> Atlantis archive -> Oracle feedback.
   - Locked: no Etsy create/edit/publish/renew calls.

2. `product-research-readonly`
   - Class: `allowedReadOnly`
   - Flow: research-needed -> Oracle Signals -> API evidence packet -> DLV business review -> Atlantis archive -> Agora feedback.

3. `supplier-proof-readonly`
   - Class: `allowedReadOnly`
   - Flow: supplier-validation-needed -> Merchant Harbor connector dock -> local/read-only proof doc -> DLV supplier decision -> Atlantis archive -> Agora feedback.
   - Locked: no supplier messages/orders/purchases/account actions.

4. `shotlab-forge-local-draft`
   - Class: `allowedLocalDraft`
   - Flow: asset-production-needed -> Forge asset bench -> local manifest/creative brief -> DLV manual confirm -> Atlantis archive -> Oracle feedback.
   - Locked: no paid generation.

5. `seo-local-draft`
   - Class: `allowedLocalDraft`
   - Flow: seo-optimization-needed -> Oracle metrics -> local SEO draft -> DLV review before shop use -> Atlantis archive -> Agora feedback.
   - Locked: no listing edits.

6. `discord-cockpit-dry-run`
   - Class: `allowedLocalDraft`
   - Flow: remote-command-preview-requested -> Pantheon roster -> local command preview -> DLV manual confirm -> Atlantis archive -> Olympus feedback.
   - Locked: no Discord side effects.

7. `discord-cockpit-live-send`
   - Class: `lockedLive`
   - Flow: manual-live-send-requested -> Olympus approval -> approval-lock packet -> blocked until future DLV live-enable phase.
   - Locked: no live send execution.

8. `approval-gate-audit-log`
   - Class: `allowedLocalDraft`
   - Flow: approval-decision-needed -> Olympus approval -> local audit doc -> DLV manual confirm -> Atlantis archive -> Treasury feedback.

## Verification

Targeted RED/GREEN tests were added in `src/server/__tests__/war-room-10h-control-spine.test.ts` to assert:

- control-spine state includes `actionBlueprintRegistry`;
- the registry covers the safe pipeline fields and classifications;
- all blueprint entries keep live execution and external mutation disabled;
- all entries require payload preview and local audit logging.

Commands run:

- `pnpm vitest run src/server/__tests__/war-room-10h-control-spine.test.ts`
- `pnpm vitest run src/server/__tests__/war-room-10h-control-spine.test.ts src/routes/api/__tests__/-war-room-10h-control-spine.test.ts`
- `pnpm exec eslint src/server/war-room-10h-types.ts src/server/war-room-10h-control-spine.ts src/server/__tests__/war-room-10h-control-spine.test.ts`

Known unrelated blocker observed during full project typecheck:

- `pnpm typecheck` currently fails in `src/screens/war-room/v1/WarRoomV1FullRoomView.tsx` because `rest-lounge-sanctuary` is missing from a `Record<WarRoomV1StationId, WarRoomV1WorkingStationKind>`. This was not introduced by the safe action blueprint skeleton changes.
