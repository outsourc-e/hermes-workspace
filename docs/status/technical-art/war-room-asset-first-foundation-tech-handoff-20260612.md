# War Room asset-first foundation — technical art handoff

Task: `t_276c111a`
Date: 2026-06-12
Lane: technicalartist
Candidate root: `/Users/mac/hermes-workspace/generated-candidates/war-room/asset-first-foundation/20260612`
State: `candidate-only / not-integrated / not-public / not-live / NOT_CONNECTED`

## Verdict

VISUAL_FOUNDATION_FAIL.

The candidate package is not ready for integration. The two full-canvas RGB backgrounds are plausible candidate foundations, but the prop, operator, plaque, and dialog-frame layers are too weak to integrate without CSS substitution, matte masking, or misleading opaque-background assets. Integration should not proceed until the failed transparent-family assets are regenerated or cleaned into true transparent, semantically correct layers.

No React/source/public/live paths were edited. No Etsy/shop/supplier/ShotLab/API/account systems were connected or touched.

## Proof artifacts produced

- Technical-art JSON manifest: `generated-candidates/war-room/asset-first-foundation/20260612/technical-art-proof/candidate-a/war_room_foundation_candidate_a_technical_art_manifest.json`
- Annotated technical-art proof sheet: `generated-candidates/war-room/asset-first-foundation/20260612/technical-art-proof/candidate-a/war_room_foundation_candidate_a_technical_art_proof_sheet.png`
- Inspection helper script: `generated-candidates/war-room/asset-first-foundation/20260612/technical_art_inspect_candidate_a.py`
- Original contact sheet: `generated-candidates/war-room/asset-first-foundation/20260612/contact_sheet_candidate_a.png`

The annotated proof sheet labels all 12 candidates as `WARN` or `FAIL`; it contains no approved/final/live state claim. Long file labels are visually tight on the sheet, but the JSON manifest and table below contain the exact full paths and verdicts.

## Asset inspection table

| Asset | Intended use | Actual dimensions / mode | Alpha bounds | Gate | Suggested candidate/proof path if regenerated or cleaned |
| --- | --- | --- | --- | --- | --- |
| `world_cell_grid_base` | First viewport world/cell base | `1672x941 RGB` | none required; full-canvas RGB | WARN: visually plausible, below preferred `3840x2160` | `generated-candidates/war-room/asset-first-foundation/20260612/technical-art-proof/candidate-a/normalized/world_cell_grid_base.png` |
| `olympus_command_room_base` | Opened Olympus Command room base | `1672x941 RGB` | none required; full-canvas RGB | WARN: visually plausible, below preferred `3840x2160` | `generated-candidates/war-room/asset-first-foundation/20260612/technical-art-proof/candidate-a/normalized/olympus_command_room_base.png` |
| `station_council_war_table` | Central mission/campaign planning table | `1536x1024 RGB` | no alpha | FAIL: RGB/no-alpha with checker/matte/room-like background | `generated-candidates/war-room/asset-first-foundation/20260612/technical-art-proof/candidate-a/normalized/station_council_war_table.png` |
| `station_mission_board` | Historical mission/state board | `1536x1024 RGB` | no alpha | FAIL: RGB/no-alpha with baked checker/matte and broad shadow | `generated-candidates/war-room/asset-first-foundation/20260612/technical-art-proof/candidate-a/normalized/station_mission_board.png` |
| `station_jarvis_omen_beacon` | Oracle/signal beacon | `1536x1024 RGB` | no alpha | FAIL: RGB/no-alpha, blurry, baked checker/matte field | `generated-candidates/war-room/asset-first-foundation/20260612/technical-art-proof/candidate-a/normalized/station_jarvis_omen_beacon.png` |
| `station_approval_seal_shrine` | DLV approval / locked-action shrine | `1536x1024 RGBA` | px `[12,1,1536,1023]`; percent `x0.78 y0.10 w99.22 h99.80`; alpha edge-touch `true` | FAIL: has alpha but wrong semantic; reads as war/map table with matte/glow backdrop | `generated-candidates/war-room/asset-first-foundation/20260612/technical-art-proof/candidate-a/normalized/station_approval_seal_shrine.png` |
| `station_gateway_dispatch_console` | Hermes dispatch altar/portal | `1536x1024 RGB` | no alpha | FAIL: RGB/no-alpha; blurred map/table variation, not dispatch portal | `generated-candidates/war-room/asset-first-foundation/20260612/technical-art-proof/candidate-a/normalized/station_gateway_dispatch_console.png` |
| `station_safe_autonomy_mode_pedestal` | Bounded autonomy pedestal | `1536x1024 RGBA` | px `[12,0,1504,1023]`; percent `x0.78 y0.00 w97.14 h99.90`; alpha edge-touch `true` | WARN/technical fail: best station silhouette, but glow/matte footprint touches edges and needs cleanup | `generated-candidates/war-room/asset-first-foundation/20260612/technical-art-proof/candidate-a/normalized/station_safe_autonomy_mode_pedestal.png` |
| `operator_hermes_command_presence_idle` | Hermes/Olympus operator idle | `1536x1024 RGB` | no alpha | FAIL: RGB/no-alpha, blurry checker/matte-backed sprite | `generated-candidates/war-room/asset-first-foundation/20260612/technical-art-proof/candidate-a/normalized/operator_hermes_command_presence_idle.png` |
| `plaque_room_title_empty` | Empty room-title plaque | `1536x1024 RGBA` | px `[12,0,1512,1023]`; percent `x0.78 y0.00 w97.66 h99.90`; alpha edge-touch `true` | FAIL: wrong content; shows Hermes/operator figure instead of empty plaque | `generated-candidates/war-room/asset-first-foundation/20260612/technical-art-proof/candidate-a/normalized/plaque_room_title_empty.png` |
| `plaque_station_label_empty` | Empty station label plaque | `1536x1024 RGB` | no alpha | FAIL: RGB/no-alpha with baked checker/matte | `generated-candidates/war-room/asset-first-foundation/20260612/technical-art-proof/candidate-a/normalized/plaque_station_label_empty.png` |
| `frame_station_dialog_empty` | Empty station/dialog frame | `1536x1024 RGB` | no alpha | FAIL: RGB/no-alpha with baked checker/matte | `generated-candidates/war-room/asset-first-foundation/20260612/technical-art-proof/candidate-a/normalized/frame_station_dialog_empty.png` |

## Safe text zones

Coordinate system: percent of opened room/frame canvas. These are draft placement zones only; do not integrate them until replacement UI surfaces pass alpha/content QA.

| Zone | x | y | w | h | Depends on | State |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| `room_title_plaque_overlay` | 38 | 4 | 24 | 8 | `plaque_room_title_empty` | BLOCKED: current file is an operator, not a plaque |
| `station_dialog_body` | 22 | 20 | 56 | 38 | `frame_station_dialog_empty` | BLOCKED: current frame has no clean alpha |
| `station_dialog_output_artifact` | 18 | 62 | 50 | 22 | `frame_station_dialog_empty` | BLOCKED: current frame has no clean alpha |
| `safety_lock_zone` | 70 | 64 | 18 | 20 | `frame_station_dialog_empty` | BLOCKED: current frame has no clean alpha |
| `close_control_socket` | 88 | 4 | 8 | 9 | `frame_station_dialog_empty` | BLOCKED: current frame has no clean alpha |

Original target safe zones from the art-direction contract remain the desired regeneration targets:

- Room title plaque: transparent `1600x420`, safe text zone `x18-82% y28-70%`.
- Station label plaque: transparent `1100x320`, safe text zone `x16-84% y28-72%`.
- Station dialog frame: transparent `2400x1600`, body `x16-84% y14-58%`, output/artifact `x18-68% y62-84%`, safety-lock `x70-88% y64-84%`, close-control `x88-96% y4-13%`.

## Station/tool hitbox coordinates

Coordinate system: percent of `olympus_command_room_base`; draft only. These describe the intended future layout, not approved current assets.

| Hitbox | x | y | w | h | Shape | State |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| `station_council_war_table` | 50 | 52 | 18 | 14 | ellipse | BLOCKED: current prop is RGB/no-alpha |
| `station_mission_board` | 24 | 34 | 14 | 18 | rounded-rect | BLOCKED: current prop is RGB/no-alpha |
| `station_jarvis_omen_beacon` | 38 | 34 | 12 | 14 | circle | BLOCKED: current prop is RGB/no-alpha/blurry |
| `station_approval_seal_shrine` | 78 | 32 | 12 | 14 | circle | BLOCKED: current asset has wrong semantic/matte risk |
| `station_gateway_dispatch_console` | 24 | 66 | 14 | 14 | rounded-rect | BLOCKED: current prop is RGB/no-alpha |
| `station_safe_autonomy_mode_pedestal` | 75 | 66 | 12 | 14 | circle | Candidate-warning only; alpha present but glow/matte needs cleanup |

Operator slots:

| Slot | x | y | Radius | State |
| --- | ---: | ---: | ---: | --- |
| `primary_operator_idle` | 50 | 70 | 5 | BLOCKED: current operator is RGB/no-alpha |
| `approval_operator` | 74 | 44 | 4 | BLOCKED until approval shrine and operator transparent assets pass |

## Required regeneration / cleanup before integration

1. Keep the two background candidates as visual references or low-resolution placeholders only; regenerate/upscale to `3840x2160` before approved-preview use.
2. Regenerate or manually cut out all station props as true transparent `2048x2048` assets with 8-12% padding and no baked checker/matte/floor/card.
3. Regenerate `station_approval_seal_shrine` to actually read as a locked-action approval shrine, not a map/table.
4. Clean or regenerate `station_safe_autonomy_mode_pedestal`; it is the only station candidate with promising silhouette, but its alpha bounds touch nearly the full canvas and it has a large glow/matte footprint.
5. Regenerate the operator as a square transparent `1024x1024` or `1536x1536` idle layer; do not claim walk/work/approval-required states yet.
6. Regenerate all UI surfaces with exact target dimensions and clean transparent safe text zones. The current room-title plaque is the wrong asset family.
7. Keep forbidden live claims out of all assets and overlays: `connected`, `published`, `purchased`, `messaged`, `approved-live`.

## Integration gate

Do not copy these assets to `public/`, do not wire them into `/war-room`, and do not replace missing art with CSS cards/rectangles. The current package should go back to asset generation / cleanup rather than codex integration.
