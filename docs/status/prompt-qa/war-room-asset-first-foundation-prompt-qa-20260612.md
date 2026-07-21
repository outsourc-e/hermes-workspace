# Prompt QA — War Room asset-first foundation

Task: `t_99948bae`
Reviewed art-direction contract: `docs/status/art-direction/war-room-asset-first-foundation-20260612.md`
Remediation parent: `t_83214a25`
Status: PASS — `PROMPT_QA_PASS`

## PASS/FAIL result

PASS — the patched prompt pack now meets the asset-first generation gate for the first Olympus Command foundation slice. `assetcreator` can safely start candidate-only generation from this prompt pack, provided it writes only under `generated-candidates/war-room/asset-first-foundation/20260612/` and keeps all candidates not-integrated, not-public, not-live, and `NOT_CONNECTED`.

This QA reviewed documentation/prompt text only. I did not generate assets, did not use image/browser generation, did not edit React/source, did not copy files into public/live paths, and did not connect Etsy/shops/suppliers/ShotLab/API/account systems.

## Required checks

| Gate | Result | Evidence |
| --- | --- | --- |
| Exact candidate-only output paths per prompt | PASS | Lines 126-138 define the candidate-only root and exact local output paths for Prompt 01 world base, Prompt 02 room base, Prompt 03 station props, Prompt 04 operator, and Prompt 05 UI surfaces. Prompt text repeats exact candidate-only paths at lines 233-235, 260-262, 284-288, 316-318, and 338-341. |
| Dimensions, aspect ratios, and padding for all asset families | PASS | Lines 140-148 define 16:9 `3840x2160` guidance for world and opened-room bases, transparent `2048x2048` station props with 8-12% padding, transparent `1024x1024` or `1536x1536` operator with 10-15% padding, `1600x420` room plaque, `1100x320` station plaque, and `2400x1600` dialog frame. Prompt sections repeat these requirements. |
| Plaque/frame safe-zone percentages and close-control socket mapping | PASS | Lines 146-148 define plaque safe text zones and the dialog frame body/output/safety zones, including close-control socket x 88-96%, y 4-13%. Prompt 05 repeats these exact percentages at lines 338-341. |
| Metadata/provenance requirements for `assetcreator` | PASS | Lines 150-163 require sibling `<asset-name>.metadata.json` files with promptId, promptPackPath, exactLocalCandidatePath, generationTime, generationTool, candidateStatus, safety, and textGibberishNotes. |
| No-collage/contact-sheet/presentation-board safeguards and one-file-per-asset language | PASS | Lines 144-145 require one asset per file for transparent props. Line 165 states separate files only and forbids combined sheet, contact sheet, collage, presentation board, preview grid, proof wall, all-in-one screenshot, and final composed scene. Prompts 01-05 repeat no-collage/no-contact-sheet/no-screenshot constraints. |
| Hard rejection rules | PASS | Line 167 rejects opaque backgrounds, hidden white/black matte, cropped props, hidden matte/halo/card backgrounds, floor-assuming baked shadows, pseudo-text/gibberish/glyph spam/readable labels, CSS/debug/proof-wall visuals, browser/admin/dashboard visuals, and fake live connection claims. Lines 205-218 preserve broader exact negative rules. |
| Safety Spine | PASS | Lines 8-12 and 126-128 keep the work documentation-only/candidate-only and all external/business systems `NOT_CONNECTED`. Lines 159-160 require candidate metadata to state `candidate-only` and `not-integrated / not-public / not-live / NOT_CONNECTED`. Lines 212 and 218 prohibit fake live claims and final/release-ready overclaim. |

## Verification command

Run from `/Users/mac/hermes-workspace`:

```bash
python3 - <<'PYVERIFY'
from pathlib import Path
s=Path('docs/status/art-direction/war-room-asset-first-foundation-20260612.md').read_text()
need=['generated-candidates/war-room/asset-first-foundation/20260612','world_cell_grid_base.png','olympus_command_room_base.png','station_council_war_table.png','2048x2048','1024x1024','1600x420','1100x320','2400x1600','safe text zone','close-control socket','metadata/provenance','no collage','candidate-only','NOT_CONNECTED']
missing=[x for x in need if x not in s]
assert not missing, missing
PYVERIFY
```

Exact result: exit `0` (`PYVERIFY_EXIT:0`).

## Notes for `assetcreator`

- Generate only candidate files and sibling metadata under `generated-candidates/war-room/asset-first-foundation/20260612/...`.
- Do not integrate, promote, publish, copy into public/live app paths, or claim final/premium/release-ready status.
- Reject and report any candidate with opaque/matte backgrounds, cropped transparent assets, baked gibberish/readable labels, CSS/debug/proof-wall/dashboard visuals, or fake live business/action claims.
- If the generation tool cannot return separate files for multi-asset prompts, generate exactly one asset at a time in the listed order and stop after each candidate for review.

## Final verdict

`PROMPT_QA_PASS:` the remediated asset-first foundation prompt pack is strict enough for the next `assetcreator` lane to start candidate-only generation. Safety Spine remains intact: all Etsy/shops/suppliers/ShotLab/API/account systems are `NOT_CONNECTED`; candidates are not-integrated, not-public, and not-live.
