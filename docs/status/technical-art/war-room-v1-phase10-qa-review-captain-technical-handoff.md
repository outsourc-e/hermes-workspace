# War Room v1 Phase 10 qa-agent/review-captain technical handoff

Status: FAIL — ALPHA_FAIL
Owner lane: technicalartist
Date: 2026-06-12
Scope: candidate-only technical-art inspection. No live promotion, no app integration, no public/runtime asset copy, no source edits.

## Safety statement

Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED; only mock/theoretical/read-only UI is allowed. No shop/supplier/paid/live actions and no Kanban mutations from the War Room route/UI/API.

## Reviewed candidate root

`generated-candidates/war-room/v1/agent-units/general-advisor/v1/`

Reviewed files:
- `qa-agent-review-captain-phase10-candidate-sheet.png`
- `candidate-metadata.json`
- `README.md`
- `generation-source.json`
- `technical-alpha-dimension-report.json`
- `technical-alpha-dimension-proof.png`

## Verdict

FAIL: The candidate identity and state intent are inspectable, but the raw PNG fails the required alpha / transparency gate. It is RGB with no alpha channel and a baked checkerboard-like background, so it must not be promoted, integrated, or treated as transparent.

Exact failure code for this card: `ALPHA_FAIL`.

Recommended focused remediation owner/scope: `assetcreator` should regenerate the same controlled `qa-agent/review-captain` family under the same candidate-only root with stricter real-transparent PNG/WebP requirements, or provide separated frames with verified alpha. Do not involve app integration until technical-art alpha passes.

## Candidate-only / NOT CONNECTED / no live promotion checks

- Metadata status: `candidate-only`.
- Metadata intended identity: `qa-agent/review-captain`.
- Metadata and README state NOT CONNECTED safety and forbid live/public/runtime integration.
- Candidate remained under `generated-candidates/war-room/v1/agent-units/general-advisor/v1/` only.
- No edits were made to `src/`, `public/war-room/`, runtime manifests, app/API routes, package files, build scripts, release docs, or live asset registry entries.
- This handoff does not claim final, premium, perfect, release-ready, or DLV-approved status.

## Dimensions and alpha evidence

Source image: `qa-agent-review-captain-phase10-candidate-sheet.png`

- Format: PNG
- Mode: RGB
- dimensions: 2508 × 627 px
- alpha: FAIL — no alpha channel; converted alpha extrema are `[255, 255]`, meaning fully opaque.
- Background: pale checkerboard-like pattern appears baked into the RGB pixels; it is not true transparency.
- Technical evidence file: `generated-candidates/war-room/v1/agent-units/general-advisor/v1/technical-alpha-dimension-report.json`
- Proof image: `generated-candidates/war-room/v1/agent-units/general-advisor/v1/technical-alpha-dimension-proof.png`

## State completeness and frame inspection

Expected states from metadata and README: `idle`, `walk`, `work`, `qa-review`.

The sheet contains four left-to-right character poses that are visually inspectable as:
1. `idle` — standing review-captain pose with scroll.
2. `walk` — same character in a moving step pose.
3. `work` — writing/working pose using a board or scroll.
4. `qa-review` — inspection/clipboard review pose.

Estimated per-state content boxes from `technical-alpha-dimension-report.json`:

| State | Cell size | Estimated content size | Padding note |
| --- | --- | --- | --- |
| idle | 627 × 627 | 287 × 517 | enough RGB padding, but not transparent |
| walk | 627 × 627 | 364 × 506 | enough RGB padding, but not transparent |
| work | 627 × 627 | 308 × 496 | enough RGB padding, but not transparent |
| qa-review | 627 × 627 | 304 × 501 | enough RGB padding, but not transparent |

State completeness is technically PARTIAL/PASS for a candidate proof sheet: all four requested states are represented. It is not runtime-ready because the image has no real alpha and is not sliced into verified transparent frames.

## Small War Room scale readability

Phase 9 followed unit slot from `docs/status/qa/screenshots/phase9-unit-motion-20260612T070913Z-manifest.json` is approximately 132 × 131.5 px.

The source sheet poses are roughly 496–517 px tall by detected content, so later work would need substantial crop/downscale/normalization. Visual readability likely survives because the silhouette, teal/brass officer cap, sash, scroll/clipboard, and dark outline are strong, but no scale-normalized runtime proof should proceed before the alpha failure is fixed.

## Visual contract / reject-list review

PASS as candidate-only visual direction:
- Reads as `qa-agent/review-captain`: teal/brass inspection-captain styling, scroll/clipboard, officer sash, squared review posture.
- Four requested states are visually represented.
- No baked text/UI labels, controls, task cards, badges, buttons, speech bubbles, or dashboard widgets visible.
- No one-piece War Room scene, command table, floor base, station prop, or room backdrop beyond the invalid checkerboard background.
- Not photorealistic, not 3D, not a sci-fi dashboard, not flat SaaS/glassmorphism.
- Not a generic blob/token/pawn; it is a deliberate historical strategy officer sprite.

FAIL technical contract:
- Non-transparent RGB background / baked checkerboard. This violates the transparent-background requirement and blocks technical-art PASS.

## Files created by this technical-art pass

- `generated-candidates/war-room/v1/agent-units/general-advisor/v1/technical-alpha-dimension-report.json`
- `generated-candidates/war-room/v1/agent-units/general-advisor/v1/technical-alpha-dimension-proof.png`
- `docs/status/technical-art/war-room-v1-phase10-qa-review-captain-technical-handoff.md`

## Final conclusion

FAIL — ALPHA_FAIL. The `qa-agent/review-captain` candidate is candidate-only, NOT CONNECTED, technically inspectable, and visually plausible as a later style reference, but it is not suitable for live promotion or downstream integration because alpha is absent. Regenerate or replace with real transparent candidate frames before visualqaagent or integration work.
