# War Room Technical Artist Workflow

Status: draft workflow for slicing, alpha cleanup, proof sheets, sprite normalization, naming, and registry handoff
Created: 2026-06-11T22:23:02+03:00
Owner role: Technical Artist (`technicalartist` future profile, currently `warroomagent`)
Scope: documentation + safe QA script stub only; no live visual changes
Safety: no Etsy/shop/supplier/ShotLab paid/live connections or writes; no image generation in this workflow card

## Source guardrails read

- `/Users/mac/hermes-workspace/docs/war-room-visual-studio-operating-system.md`
- `/Users/mac/hermes-workspace/docs/war-room-visual-remake-production-line.md`
- `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_24H_AUTONOMOUS_DEV_GUARDRAILS.md`
- Existing contract: `/Users/mac/hermes-workspace/docs/status/war-room-layered-asset-manifest-contract.md`
- Existing registry: `/Users/mac/hermes-workspace/docs/status/war-room-asset-registry.json`

## Non-negotiable rules

1. Final War Room art must be premium generated/approved image assets. CSS, SVG, Pillow, canvas, or procedural drawing may be used only for QA/proofs/layout/debugging, never as final art.
2. Assets stay modular: floor base, wall trim, stations, props, characters, overlays, UI frames, and manifests are separate semantic files.
3. No one giant PNG is accepted as the final interactive room except a floor/base architecture layer or a `reference_only` contact sheet.
4. Transparent assets must be technically verified, not visually assumed.
5. Slicing may not invent missing art. If a source sheet lacks a clean object/frame, block or request regeneration.
6. Registry and manifest updates must truthfully distinguish `generated_candidate`, `asset_qa_passed`, `approved`, `sliced`, `manifested`, `integrated`, and `live`.
7. No real shop, supplier, Etsy, Alura, or ShotLab paid/live actions are allowed in this workflow.

## Inputs expected from upstream Asset Creator

Each source candidate should arrive outside live UI paths first, typically under:

```text
artifacts/war-room/candidates/<room-id>/<asset-id>/
```

Required handoff metadata:

- `assetId`: registry id such as `olympus-command.command-table.v001`.
- `roomId`: e.g. `olympus-command`.
- `sourcePath`: absolute or workspace-relative path to downloaded ChatGPT candidate.
- `sourceKind`: `single_asset`, `prop_sheet`, `sprite_sheet`, `floor_base`, `ui_frame`, or `reference_sheet`.
- `promptPackPath` or prompt id.
- generation time and local filename.
- expected transparency: `none`, `required`, or `optional`.
- expected frame grid for sprite sheets, if any.
- QA notes: known defects, intended crops, forbidden use.

Reject or block immediately if:

- the source is a CSS/Pillow/SVG/procedural drawing presented as final art.
- the file is an uploaded reference accidentally downloaded instead of a generated candidate.
- the source contains baked gibberish labels that cannot be safely cropped out.
- a transparent prop/station/character is delivered only as a square card/background plate.
- a room background contains props/stations/characters that should be independent layers.

## Destination layout and naming

Live-ready sliced assets use app-public paths under `public/war-room/layered/<room-id>/`:

```text
public/war-room/layered/<room-id>/
  floor_base.png
  wall_trim_or_border.png
  props/
    prop_<semantic-name>.png
  stations/
    station_<semantic-name>.png
  characters/
    character_<agent-id>_idle.png
    character_<agent-id>_walk_strip.png
    character_<agent-id>_work_strip.png
  overlays/
    overlay_<semantic-name>.png
  frames/
    frame_panel_<semantic-name>.png
  room_manifest.json
```

Candidate/proof artifacts stay out of live runtime paths:

```text
artifacts/war-room/processed/<room-id>/<asset-id>/
  source.png
  slices/
  proofs/
  metadata.json
```

Use deterministic names:

```text
<room-id>.<semantic-name>.<kind>.vNNN.source.png
<kind>_<semantic-name>.png
<kind>_<semantic-name>__dark-light-proof.png
character_<agent-id>_<state>_strip.png
character_<agent-id>_<state>_strip__proof.png
```

Examples:

```text
olympus-command.command-table.station.v001.source.png
station_command_table.png
station_command_table__dark-light-proof.png
character_hermes_operator_walk_strip.png
character_hermes_operator_walk_strip__proof.png
```

## Slicing workflow

1. Copy source candidate into `artifacts/war-room/processed/<room-id>/<asset-id>/source.png` before edits.
2. Record immutable source metadata in `metadata.json`:
   - source path
   - source dimensions
   - mode/colorspace
   - upstream card/prompt references
   - expected crop list or frame grid
   - checksum if available
3. Inspect source manually/visually before slicing:
   - confirm it is generated output, not uploaded reference.
   - confirm semantic identity matches the asset id.
   - confirm no critical defects are being hidden by crop.
4. Crop only semantic objects or declared frames:
   - props/stations: tight crop around visible object plus small breathing margin.
   - floor base: full image or safe crop; do not crop away walls/room boundary.
   - UI frame: preserve safe text boxes and close-control space.
   - sprite sheet: crop rows/cells using exact grid; do not hand-wave inconsistent cells.
5. Save raw slice(s) under `slices/raw/` before alpha cleanup.
6. Alpha-clean copies into `slices/clean/`.
7. Create dark/light proof sheets for every transparent slice or strip.
8. Run technical checks and write `technical_qa.json`.
9. Only after QA pass, copy selected clean assets into `public/war-room/layered/<room-id>/...` or leave them in processed artifacts for approval.
10. Update registry and manifest with truthful status and paths.

## Alpha cleanup standard

Transparent prop/station/character/overlay/frame assets must be RGBA and include real transparent pixels.

Minimum checks:

- file opens successfully.
- mode is `RGBA`.
- alpha extrema include transparency: minimum alpha `< 255` and maximum alpha `255` or near-opaque for core object.
- no baked checkerboard remains.
- no square/card background remains unless the asset is explicitly a UI frame.
- no light halo on dark proof and no dark halo on light proof.
- no stray islands/fragments outside intended object bounds.
- object silhouette remains readable at intended UI scale.

Cleanup rules:

- Prefer mask/threshold cleanup only when the background is clearly removable.
- Do not erase valid semi-transparent glows unless the asset contract forbids glows.
- Do not fake missing transparent art by drawing a new object procedurally.
- If cleanup destroys edges, creates holes, removes important detail, or leaves baked background, reject and request regeneration.

## Dark/light proof sheet requirements

Every transparent candidate must get a proof sheet before registry advancement beyond `sliced`.

Proof sheet should show:

- source thumbnail.
- cleaned asset over dark background (`#0b0d12`).
- cleaned asset over light background (`#f3efe4`).
- optional checkerboard panel for alpha edges.
- caption with asset id, file name, dimensions, mode, alpha extrema, and pass/fail notes.

Fail conditions:

- visible checkerboard baked into the pixels.
- square/rectangular slab behind a supposed transparent object.
- halos/fringes unacceptable at app scale.
- cropped object cut off at edges.
- visible gibberish labels in art layer.
- too tiny, blurry, or inconsistent with approved style.

## Sprite strip normalization

Character strips must not be integrated until metadata declares frame geometry.

Required metadata:

```json
{
  "assetId": "olympus-command.hermes-operator.walk.v001",
  "state": "walk",
  "directionModel": "8dir" ,
  "frameWidth": 160,
  "frameHeight": 160,
  "frameCount": 48,
  "rows": 8,
  "cols": 6,
  "directions": ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
  "fps": 8,
  "anchor": "bottom-center",
  "feetY": 0.88,
  "scaleTarget": "room-character-small"
}
```

Normalization steps:

1. Confirm sheet grid dimensions divide cleanly by rows/cols.
2. Crop every cell exactly; save debug contact sheet with cell numbers.
3. Normalize each frame to the declared canvas size without changing character scale between frames.
4. Align feet/baseline across frames; record `feetY`/anchor.
5. Remove stray fragments and baked background from each frame.
6. Rebuild strip in consistent row-major order.
7. Generate proof sheet:
   - full strip preview.
   - per-direction row preview.
   - dark/light background preview.
   - first/middle/last frame enlarged.
8. Reject if identity, scale, lighting, or silhouette jumps between frames.

For War Room god/operator assets, do not claim all-direction parity unless true N/NE/E/SE/S/SW/W/NW are present and readable. Mirroring one readable loop is a temporary fallback only if registry status says `temporary`.

## Registry update workflow

Update `/Users/mac/hermes-workspace/docs/status/war-room-asset-registry.json` only after technical evidence exists.

Suggested status transitions:

- `generated_candidate`: source downloaded; no slicing pass yet.
- `asset_qa_passed`: upstream visual QA accepted the candidate.
- `sliced`: clean modular outputs exist in processed or public path and technical QA proof exists.
- `manifested`: manifest references the sliced app-public paths and validates.
- `integrated`: React/browser route uses the manifest path.
- `browser_qa_passed`: browser QA evidence exists for actual UI.
- `live`: release reviewer approved; not a default worker status.
- `rejected`: source/slice failed; keep reason and proof path.
- `reference_only`: useful style/reference sheet, not runtime art.
- `temporary`: allowed scaffold/fallback, not final.

Each asset record should include or preserve:

```json
{
  "roomId": "olympus-command",
  "type": "station",
  "status": "sliced",
  "source": {
    "kind": "chatgpt-web",
    "promptPackPath": "docs/status/...",
    "candidatePath": "artifacts/war-room/candidates/.../source.png"
  },
  "candidatePath": "artifacts/war-room/processed/.../source.png",
  "approvedPath": null,
  "slicedPath": "public/war-room/layered/olympus-command/stations/station_command_table.png",
  "proofPath": "artifacts/war-room/processed/.../proofs/station_command_table__dark-light-proof.png",
  "technicalQa": {
    "alphaVerified": true,
    "mode": "RGBA",
    "alphaExtrema": [0, 255],
    "dimensions": [1024, 1024],
    "sprite": null,
    "notes": "No baked text; no square-card background."
  },
  "owner": "warroomagent",
  "nextOwner": "qaagent"
}
```

Do not set `approvedPath`, `integrated`, `browser_qa_passed`, or `live` from technical slicing alone unless the card explicitly includes those approvals and verifications.

## Manifest update workflow

For every runtime-ready slice, add or update the room manifest:

- asset URL must be app-public, e.g. `/war-room/layered/olympus-command/stations/station_command_table.png`.
- `id` must match semantic asset id without version suffix where practical.
- `kind` must be one of the manifest contract kinds.
- `bounds`, `anchor`, `zIndex`, and optional `nativeSize` must be explicit.
- stations must include `hotspot`, `operatorSpot`, `animation`, `toolSurface`, and safety locks.
- characters with strips must include `frameCount`, `frameWidth`, `frameHeight`, `directions`, and `fps`.
- overlays should default to non-interactive/pointer-events-none in integration.
- UI frames must include `safeTextBoxes` and optional `closeSpot`.

Manifest QA must catch:

- missing floor base.
- duplicate ids.
- missing asset files.
- absolute disk paths in manifest instead of `/war-room/...` URLs.
- unsafe live action wording.
- station hotspots that do not align with visible station bounds.

## Command checklist for future cards

From `/Users/mac/hermes-workspace`:

```bash
# Registry + current alpha scan if paths exist
python3 scripts/war-room-visual-studio-qa.py --json

# Technical artist stub; no assets required for dry-run contract check
python3 scripts/war-room-alpha-proof-stub.py --json

# Future actual transparent asset proof
python3 scripts/war-room-alpha-proof-stub.py \
  --asset public/war-room/layered/olympus-command/stations/station_command_table.png \
  --asset-id olympus-command.command-table.v001 \
  --out docs/status/technical-artist-proofs
```

If code integration happens in a later card, run the relevant typecheck/build/browser QA from that card. This card does not integrate or alter live visuals.

## Technical Artist done checklist

- [ ] Source guardrails read.
- [ ] Source candidate copied into processed artifact folder.
- [ ] Source metadata recorded.
- [ ] Slices are semantic, modular, and not a one-piece final scene.
- [ ] Transparent assets are RGBA with verified alpha extrema.
- [ ] Dark/light proof sheets created.
- [ ] Sprite strips declare frame geometry and pass row/frame proof.
- [ ] Registry updated truthfully with proof paths and status.
- [ ] Manifest updated only for app-public approved/sliced paths.
- [ ] No CSS/Pillow/SVG/procedural final art introduced.
- [ ] No Etsy/shop/supplier/ShotLab paid/live connections or writes.

## Next partner handoff

Asset Creator can hand ChatGPT candidates to this workflow with metadata. Technical Artist can then slice and proof assets without touching live visuals until approval. QA can use the generated proof paths plus registry/manifest records to pass or fail the asset before integration.
