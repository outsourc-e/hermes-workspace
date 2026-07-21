# War Room v1 Phase 10 ChatGPT regeneration v2 normalized proof handoff

Status: PASS — candidate-only normalized proof ready
Owner lane: technicalartist
Date: 2026-06-12
Scope: candidate-only slicing, alpha extraction, normalization, proof-sheet generation, and technical handoff for the Phase 10 `qa-agent/review-captain` ChatGPT/browser regenerated candidate v2. No app/source/public/runtime integration, no asset registry update, no release packaging, and no live promotion was performed.

## Safety statement

Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED; only candidate-only local technical-art proof work was performed. No shop/supplier/paid/live actions were performed. No app/public/runtime promotion was performed. No files were copied into `public/war-room`, no runtime manifest or live asset registry was changed, and no War Room route/UI/API Kanban mutation was performed.

## Reviewed inputs

- `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_24H_AUTONOMOUS_DEV_GUARDRAILS.md`
- `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_JARVIS_DEFINITION_OF_PERFECT.md`
- `docs/status/automation/war-room-agent-routing-policy.md`
- `docs/status/vision/war-room-final-vision-live-spec.md`
- `docs/status/vision/war-room-v1-phase10-next-slice-contract.md`
- `docs/status/art-direction/war-room-v1-phase10-general-advisor-unit-asset-contract.md`
- `docs/status/prompt-qa/war-room-v1-phase10-general-advisor-unit-prompt-qa.md`
- `docs/status/technical-art/war-room-v1-phase10-chatgpt-regeneration-v2-technical-handoff.md`
- `docs/status/qa/war-room-v1-phase10-chatgpt-regeneration-v2-visual-provenance-qa.md`
- Source sheet: `generated-candidates/war-room/v1/agent-units/general-advisor/chatgpt-regeneration-v2/qa-agent-review-captain-chatgpt-regeneration-v2-salvaged.png`

## Source SHA and metadata verification

PASS: source SHA and metadata/provenance still match the accepted v2 candidate.

- Expected SHA-256: `175e1776a9085c6bce8b9545b8cb37a495d509be5485b9d75582e941d65c68bb`
- Actual SHA-256: `175e1776a9085c6bce8b9545b8cb37a495d509be5485b9d75582e941d65c68bb`
- Source format/mode/dimensions: PNG, RGB, `2508 x 627`
- Provenance: ChatGPT/browser/CDP generated art per v2 metadata, technical handoff, and visual/provenance QA.
- Raw technical caveat retained: source is opaque RGB with a baked checker-style background and no native alpha channel.

## Pose mapping

Four equal-width horizontal source slices of `627 x 627` pixels were preserved left to right:

1. `idle` — source box `[0, 0, 627, 627]`
2. `walk` — source box `[627, 0, 1254, 627]`
3. `work` — source box `[1254, 0, 1881, 627]`
4. `qa-review` — source box `[1881, 0, 2508, 627]`

## Alpha extraction and normalization method

PASS with caveats: candidate-only technical alpha extraction was completed without redrawing or replacing the generated art.

Method audit trail:

- Sliced the RGB sheet into four equal `627 x 627` pose regions.
- Treated very light, low-saturation checker pixels connected to each slice border as baked background.
- Flood-filled only that connected background region and converted it to alpha.
- Applied a minimal 1-pixel mask clean-up to reduce checker fringe while preserving the dark character outline and enclosed white/scroll interior details.
- Cropped extracted visible content, then normalized all poses onto a shared transparent `256 x 256` canvas.
- Used one shared downscale factor and bottom alignment so all poses keep a consistent silhouette/scale relationship.
- No redraw, repaint, local substitute art, CSS/SVG/Pillow-drawn replacement, procedural sprite, or generated-art claim was introduced by this pass.

Canvas choice: `256 x 256` was chosen as a QA-friendly transparent proof canvas. It is large enough to preserve the source character detail and edge evidence while still being suitable for later reduced-scale War Room map-unit QA.

Known limitations:

- Alpha is extracted from an opaque RGB source, not native ChatGPT transparency.
- Minor edge halo/fringe or small loss of very light anti-aliased pixels may remain, especially around light clothing/scroll edges.
- These outputs are normalized proof assets only; they are not final/live sprites and are not approved for runtime integration.

## Files created

Under `generated-candidates/war-room/v1/agent-units/general-advisor/chatgpt-regeneration-v2/normalized-proof/`:

- `qa-agent-review-captain-v2-idle.png`
- `qa-agent-review-captain-v2-walk.png`
- `qa-agent-review-captain-v2-work.png`
- `qa-agent-review-captain-v2-qa-review.png`
- `qa-agent-review-captain-v2-normalized-proof-sheet.png`
- `normalization-metadata.json`

## Dimensions, alpha extrema, and content bboxes

| Pose | Output dimensions | Alpha extrema | Source content bbox after alpha | Normalized content bbox | Normalized sprite size |
| --- | --- | --- | --- | --- | --- |
| `idle` | `256 x 256` | `[0, 255]` | `[222, 41, 509, 558]` | `[67, 18, 189, 238]` | `[122, 220]` |
| `walk` | `256 x 256` | `[0, 255]` | `[123, 52, 487, 558]` | `[50, 23, 205, 238]` | `[155, 215]` |
| `work` | `256 x 256` | `[0, 255]` | `[158, 52, 465, 548]` | `[62, 27, 193, 238]` | `[131, 211]` |
| `qa-review` | `256 x 256` | `[0, 255]` | `[122, 45, 426, 546]` | `[63, 25, 192, 238]` | `[129, 213]` |

Proof sheet:

- File: `generated-candidates/war-room/v1/agent-units/general-advisor/chatgpt-regeneration-v2/normalized-proof/qa-agent-review-captain-v2-normalized-proof-sheet.png`
- Dimensions: `1024 x 798`
- Rows: checker proof, dark proof, light proof.

Metadata report:

- File: `generated-candidates/war-room/v1/agent-units/general-advisor/chatgpt-regeneration-v2/normalized-proof/normalization-metadata.json`
- Contains source SHA verification, pose mapping, extraction method, limitations, per-output dimensions, bboxes, alpha extrema, and file SHA-256 values.

## Visual proof check

PASS: direct proof-sheet inspection shows the four poses remain the same `qa-agent/review-captain` ChatGPT candidate character, are visibly separated, and render on checker/dark/light proof backgrounds with real transparent alpha. No major baked checker background panels remain around the character silhouettes. Minor edge halo/fringe risk is retained as a caveat because the source was not native-alpha.

## Candidate-only containment

PASS: this pass wrote only inside the allowed candidate normalized-proof directory and this allowed handoff document. It did not edit `src/`, `public/war-room/`, app/API routes, runtime manifests, package files, build scripts, release docs, or live asset registry entries. It did not copy any candidate into `public/war-room` and did not perform live registry/runtime promotion.

## Verdict

PASS: Phase 10 ChatGPT v2 normalized proof ready.

The source SHA is preserved, the outputs are candidate-only transparent proof assets, the four pose mappings are retained, and no forbidden path or connected system was modified. The outputs are suitable for the next visual QA gate, not for direct integration.

## Exact next recommended owner/scope

Next owner: `visualqaagent`.

Scope: visually QA only the normalized-proof outputs under `generated-candidates/war-room/v1/agent-units/general-advisor/chatgpt-regeneration-v2/normalized-proof/` against the Phase 10 contract, scale/readability goals, and alpha caveats. No integration, no public/runtime copy, no live promotion, and no asset registry update until separate visual QA, architecture/integration, implementation, and release gates pass.
