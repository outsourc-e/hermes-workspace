# War Room v1 Phase 10 qa-review-captain integration contract

Status: PASS — bounded read-only candidate integration is safe now
Owner lane: claudearchitect
Date: 2026-06-12
Scope: documentation/spec only. This card creates no app/source/runtime/public asset change, performs no image generation, does not copy candidate files, does not promote a live asset, does not package a release, and does not mutate Kanban except this worker handoff.

## Safety statement

Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED. Only local documentation and a future explicitly bounded read-only `/war-room?v1=1` candidate-preview integration are allowed. No shop/supplier/paid/live actions, no account/API writes, no War Room route/UI/API Kanban mutations, no release packaging, and no live/public promotion are authorized by this document.

## Reviewed evidence

- `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_24H_AUTONOMOUS_DEV_GUARDRAILS.md`
- `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_JARVIS_DEFINITION_OF_PERFECT.md`
- `docs/status/automation/war-room-agent-routing-policy.md`
- `docs/status/vision/war-room-final-vision-live-spec.md`
- `docs/war-room-visual-studio-operating-system.md`
- `docs/war-room-visual-remake-production-line.md`
- `docs/status/vision/war-room-v1-phase10-next-slice-contract.md`
- `docs/status/art-direction/war-room-v1-phase10-general-advisor-unit-asset-contract.md`
- `docs/status/prompt-qa/war-room-v1-phase10-general-advisor-unit-prompt-qa.md`
- `docs/status/qa/war-room-v1-phase10-chatgpt-regeneration-v2-visual-provenance-qa.md`
- `docs/status/technical-art/war-room-v1-phase10-chatgpt-regeneration-v2-normalized-proof-handoff.md`
- `docs/status/qa/war-room-v1-phase10-chatgpt-regeneration-v2-proof-sheet-alpha-rerun-qa.md`
- `docs/status/asset-librarian/war-room-v1-phase10-chatgpt-v2-qa-review-captain-registry.md`
- `docs/status/war-room-asset-registry.json`
- Context-only source/test files under `src/screens/war-room/v1/` and `scripts/war-room-v1-regression-gate.mjs`

## Candidate evidence summary

Asset id: `agent-units.qa-agent-review-captain.chatgpt-v2-normalized-proof.v001`.

Candidate root: `generated-candidates/war-room/v1/agent-units/general-advisor/chatgpt-regeneration-v2/`.

Normalized proof root: `generated-candidates/war-room/v1/agent-units/general-advisor/chatgpt-regeneration-v2/normalized-proof/`.

Registry state in `docs/status/war-room-asset-registry.json`:

- `status`: `candidate_pass_qa_not_live`
- `candidateStatus`: `candidate-only / PASS QA / NOT CONNECTED / no live promotion`
- `live`: `false`
- `livePath`: absent / not set
- `approvedPath`: absent / not set
- `nextOwner`: `claudearchitect`
- `releaseGate`: not final, not approved, not premium, not release-ready, and not live until separate architecture/integration, implementation, browser QA, and release review gates pass

Normalized candidate files available for a future integrator:

- `generated-candidates/war-room/v1/agent-units/general-advisor/chatgpt-regeneration-v2/normalized-proof/qa-agent-review-captain-v2-idle.png`
- `generated-candidates/war-room/v1/agent-units/general-advisor/chatgpt-regeneration-v2/normalized-proof/qa-agent-review-captain-v2-walk.png`
- `generated-candidates/war-room/v1/agent-units/general-advisor/chatgpt-regeneration-v2/normalized-proof/qa-agent-review-captain-v2-work.png`
- `generated-candidates/war-room/v1/agent-units/general-advisor/chatgpt-regeneration-v2/normalized-proof/qa-agent-review-captain-v2-qa-review.png`
- `generated-candidates/war-room/v1/agent-units/general-advisor/chatgpt-regeneration-v2/normalized-proof/qa-agent-review-captain-v2-normalized-proof-sheet.png`
- `generated-candidates/war-room/v1/agent-units/general-advisor/chatgpt-regeneration-v2/normalized-proof/normalization-metadata.json`

The visual/provenance, normalized technical handoff, alpha rerun QA, and registry handoff all say the candidate remains candidate-only, NOT CONNECTED, outside live/public/runtime paths, and not final/release-ready.

## Decision

PASS: a bounded read-only candidate-preview integration is safe now, with strict limits.

The safe scope is not a final/live art promotion. It is a local `/war-room?v1=1` read-only preview that replaces or augments only the temporary Phase 9 followed `visualqaagent` CSS/block `review-captain` unit with this candidate family, while preserving all existing lifecycle, route, source, and safety hooks. The integration must visibly disclose that the sprite is a candidate asset and must not change the registry to `live`, must not set `livePath`, must not set `approvedPath`, and must not claim DLV approval.

This is safe because:

1. The candidate has passed the required Phase 10 visual/provenance, technical normalization, alpha rerun QA, and candidate registry gates.
2. The normalized proof provides state-specific transparent PNGs for `idle`, `walk`, `work`, and `qa-review`.
3. The future integration can be limited to local read-only display paths and existing `/war-room?v1=1` hooks.
4. The registry explicitly records `candidate_pass_qa_not_live`, `live=false`, no `livePath`, and no `approvedPath`; the implementation must preserve that state.
5. Existing War Room safety architecture already uses read-only local Kanban source labels such as `local-hermes-kanban`, non-live disclosure hooks, blocked external actions, and mutation guards.

## Smallest exact Codex scope

Assign the next implementation, if created, to `codexintegrator`. The Codex task must implement only the following candidate-preview scope:

1. Copy the four normalized candidate pose PNGs from the normalized proof root into a new explicitly non-live candidate-preview public subtree:
   - From: `generated-candidates/war-room/v1/agent-units/general-advisor/chatgpt-regeneration-v2/normalized-proof/qa-agent-review-captain-v2-idle.png`
   - From: `generated-candidates/war-room/v1/agent-units/general-advisor/chatgpt-regeneration-v2/normalized-proof/qa-agent-review-captain-v2-walk.png`
   - From: `generated-candidates/war-room/v1/agent-units/general-advisor/chatgpt-regeneration-v2/normalized-proof/qa-agent-review-captain-v2-work.png`
   - From: `generated-candidates/war-room/v1/agent-units/general-advisor/chatgpt-regeneration-v2/normalized-proof/qa-agent-review-captain-v2-qa-review.png`
   - To: `public/war-room/v1/candidate-previews/agent-units/qa-review-captain/chatgpt-v2-normalized-proof/v001/idle.png`
   - To: `public/war-room/v1/candidate-previews/agent-units/qa-review-captain/chatgpt-v2-normalized-proof/v001/walk.png`
   - To: `public/war-room/v1/candidate-previews/agent-units/qa-review-captain/chatgpt-v2-normalized-proof/v001/work.png`
   - To: `public/war-room/v1/candidate-previews/agent-units/qa-review-captain/chatgpt-v2-normalized-proof/v001/qa-review.png`

2. Add the smallest data/manifest hook needed to let `WarRoomV1AgentUnit` select a candidate sprite only when the mission maps to the Phase 9 followed `visualqaagent` / `qa-agent` / `review-captain` path or to lifecycle `qa-review` with `spriteKind === 'review-captain'`.

3. Replace or augment only the visible temporary Phase 9 CSS/block unit for that followed `visualqaagent` review-captain family. Do not replace general/advisor/gate-warden units. Do not touch unrelated rooms, stations, command-table events, lifecycle routing, live Kanban adapter behavior, or business surfaces.

4. Preserve the current CSS/block fallback. If the candidate image fails to load, if a non-qa review-captain unit is rendered, or if the feed is fixture/unavailable/degraded and the implementation cannot safely select a state, the component must continue rendering the existing prototype fallback with its non-final disclosure.

5. Keep all changes behind existing `/war-room?v1=1` read-only route behavior. Do not add POST, PATCH, DELETE, dispatch, create, complete, approve, unblock, archive, marketplace, account, ShotLab, paid, purchase, publish, message, refund, renewal, or ad controls.

## Exact allowed source/test/public asset paths for the next implementation card

Allowed source paths:

- `src/screens/war-room/v1/WarRoomV1AgentUnit.tsx`
- `src/screens/war-room/v1/war-room-v1-state.ts`
- `src/screens/war-room/v1/war-room-v1-types.ts`
- `src/screens/war-room/v1/war-room-v1-manifest.ts` only if a tiny candidate-asset constant or data hook is cleaner than hard-coding URLs in the component

Allowed test/gate paths:

- `src/screens/war-room/v1/__tests__/war-room-v1-agent-motion.test.tsx`
- `src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts`
- `src/screens/war-room/v1/__tests__/war-room-v1-visual-hierarchy.test.tsx`
- `scripts/war-room-v1-regression-gate.mjs` only to add candidate-preview hooks/checks, never to weaken existing safety checks

Allowed public candidate-preview asset paths:

- `public/war-room/v1/candidate-previews/agent-units/qa-review-captain/chatgpt-v2-normalized-proof/v001/idle.png`
- `public/war-room/v1/candidate-previews/agent-units/qa-review-captain/chatgpt-v2-normalized-proof/v001/walk.png`
- `public/war-room/v1/candidate-previews/agent-units/qa-review-captain/chatgpt-v2-normalized-proof/v001/work.png`
- `public/war-room/v1/candidate-previews/agent-units/qa-review-captain/chatgpt-v2-normalized-proof/v001/qa-review.png`

Allowed documentation output from the next implementation card:

- A focused implementation handoff under `docs/status/technical-art/` or `docs/status/implementation/` only if the card explicitly requires it. The implementation should not edit release docs.

Forbidden paths for the next implementation card unless a separate later contract overrides this one:

- `docs/status/war-room-asset-registry.json` except read-only verification; do not set `livePath`, `approvedPath`, `approvedBy`, `live=true`, `approved`, `integrated`, or `release-ready`.
- Existing live/public manifest paths such as `public/war-room/manifests/` and non-candidate `public/war-room/layered/` destinations.
- Package scripts, release notes, generated images, source candidates under `generated-candidates/`, business adapters, API write routes, real Etsy/shop/supplier/AliExpress/Alibaba/ShotLab/account code, and unrelated UI routes.

## Candidate disclosure wording

The future UI must expose clear non-final candidate wording in DOM and visible/screen-reader copy. Exact required wording:

`Candidate qa-agent/review-captain sprite preview; candidate_pass_qa_not_live; NOT CONNECTED; read-only; not final, not approved, not live.`

This wording may appear as visible microcopy, `aria-label` text, and/or a `sr-only` disclosure, but it must be machine-checkable in the rendered component or tests. The current `Temporary prototype CSS/block sprite; non-final art disclosure` text may remain for fallback, but the candidate path must add the candidate-specific disclosure above.

Required candidate DOM hooks for future tests/gate:

- `data-war-room-v1-unit-art-status="candidate_pass_qa_not_live"` when the candidate sprite is used
- `data-war-room-v1-candidate-asset-id="agent-units.qa-agent-review-captain.chatgpt-v2-normalized-proof.v001"`
- `data-war-room-v1-candidate-disclosure="candidate_pass_qa_not_live NOT CONNECTED read-only not final not approved not live"`
- Existing hooks such as `data-war-room-v1-agent-unit`, `data-war-room-v1-unit-role`, `data-war-room-v1-unit-sprite`, `data-war-room-v1-lifecycle`, `data-war-room-v1-route-id`, `data-war-room-v1-motion-state`, and `data-war-room-v1-prototype-art-disclosure` must not be removed or weakened.

## Manifest/data hook changes

The next implementation should prefer a tiny typed candidate asset map over broad manifest refactors. Acceptable shape:

- A constant keyed by `agent-units.qa-agent-review-captain.chatgpt-v2-normalized-proof.v001`.
- State-to-URL mapping for `idle`, `walk`, `work`, and `qa-review` only.
- Source/provenance fields pointing back to the candidate root, normalized proof root, `normalization-metadata.json`, and `docs/status/war-room-asset-registry.json`.
- Runtime status fields: `candidateStatus: 'candidate_pass_qa_not_live'`, `live: false`, `approved: false`, `readOnly: true`.

State selection must be deterministic and bounded:

- lifecycle `qa-review` -> `qa-review.png`
- active review-captain route/motion -> `walk.png` when `motionState === 'active'`
- active or claimed review-captain station work -> `work.png` only if the mapper already identifies active/work state without inventing progress
- otherwise -> `idle.png`

Do not add random movement, generated runtime art, CSS/Pillow/SVG substitutes, new backend asset loaders, or runtime registry mutation.

## Safety preservation requirements

The next implementation must preserve all of these behaviors:

- `/war-room?v1=1` remains read-only.
- `local-hermes-kanban` remains a read-only source label; no UI/API mutation path is introduced.
- Existing `NOT CONNECTED` and no-enabled-live-action disclosures remain visible and machine-checkable.
- Existing blocked external actions remain locked: Etsy/shop/supplier/AliExpress/Alibaba/ShotLab/API/account systems, paid generation, purchases, publishing, listing edits, messages, refunds, renewals, ads, destructive DB/admin operations, and release packaging.
- The candidate remains `candidate_pass_qa_not_live`; the registry remains `live=false` with no `livePath` and no `approvedPath`.
- The implementation must not claim the candidate is final, premium, perfect, DLV-approved, released, or live.
- No flat SaaS/glassmorphism drift: the candidate unit must remain a small readable GBA/Pokemon-like historical strategy map unit, not a dashboard avatar/card/pill/token.

## Visual guardrails

- The sprite must sit within the same Phase 9 followed unit footprint and not clip labels, station markers, route labels, command-table events, or safety locks.
- Keep reduced-motion behavior: `prefers-reduced-motion: reduce` must stop animation while leaving the unit and disclosure readable.
- Do not add excessive glow, particles, glass panels, KPI cards, flat SaaS cards, or sci-fi dashboard effects.
- Do not hide the route/motion evidence that Phase 9 proved: lifecycle, current station, target station, route id, route progress/cue, source task id, and read-only source evidence must remain inspectable.
- Candidate image rendering should use normal `<img>` or CSS background with explicit `alt`/`aria` support and fixed dimensions to avoid layout shift.
- The CSS/block fallback may stay below/behind the image only if it does not visually compete with the candidate and only if tests still prove non-final disclosure.

## Required implementation verification commands

The next implementation card must run and report real output from:

```bash
NODE_ENV=test pnpm gate:war-room-v1
pnpm typecheck
pnpm build
```

It should also run the focused tests touched by the diff, at minimum:

```bash
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-agent-motion.test.tsx
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-visual-hierarchy.test.tsx
```

If any required command fails, the implementation must block with evidence instead of claiming done.

## Follow-up gates after implementation

After Codex implementation and Hermes rerun of the commands above, create or require these gates before any release or broader asset use:

1. `visualqaagent`: browser/visual QA for `/war-room?v1=1` only. It must verify the followed `visualqaagent` / `qa-agent/review-captain` unit appears as the candidate sprite, remains readable at War Room scale, does not clip, preserves candidate disclosure, preserves `NOT CONNECTED`, preserves `local-hermes-kanban` read-only source evidence, and avoids no flat SaaS/glassmorphism drift.
2. `claudereviewer`: independent review for overclaim/safety regression. It must verify no live registry promotion, no `livePath`, no `approvedPath`, no package/release edit, no external/business action path, and no weakened regression gate.
3. `releaseagent`: remains blocked by `t_124c7b12` until DLV approval. No release packaging, Git packaging, live promotion, or final readiness claim may proceed before that approval gate is explicitly resolved.

## Explicit non-authorizations

This contract does not authorize:

- Integrating every agent identity or every lifecycle state.
- Promoting the candidate to approved/live/final/release-ready.
- Editing `docs/status/war-room-asset-registry.json` to set `livePath`, `approvedPath`, `approvedBy`, or `live=true`.
- Copying assets into non-candidate public live paths.
- Editing release docs or package scripts.
- Connecting, writing, purchasing, publishing, messaging, refunding, renewing, advertising, or otherwise acting against Etsy/shops/suppliers/AliExpress/Alibaba/ShotLab/API/account systems.
- Replacing the whole War Room visual language, command table, route system, live Kanban adapter, or approval/safety model.

## Exit verdict

PASS: Phase 10 qa-review-captain integration contract ready.

A future bounded Codex implementation is safe only as a candidate-preview, read-only, non-live `/war-room?v1=1` integration of `agent-units.qa-agent-review-captain.chatgpt-v2-normalized-proof.v001` for the followed `visualqaagent` / `qa-agent/review-captain` CSS/block prototype unit, with all safety, disclosure, test, visual QA, claudereviewer, and `t_124c7b12` release-block gates preserved.
