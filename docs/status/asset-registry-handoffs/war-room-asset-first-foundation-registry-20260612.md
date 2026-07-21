# Asset Registry Handoff — War Room asset-first foundation Candidate A

Task: `t_bc91e8bb`
Parent asset generation task: `t_bb9678e5`
Updated: 2026-06-12T16:57:44Z
Role: Asset Librarian
Workspace boundary: `/Users/mac/hermes-workspace`

## Scope and safety state

This handoff registers provenance/state for the local Candidate A asset set only. No assets were generated, edited, normalized, integrated, promoted, copied to public/live paths, or connected to runtime UI by this asset-librarian pass.

Safety line: Etsy/shops/suppliers/ShotLab/API/account systems are `NOT_CONNECTED`; only local disabled/dry-run/read-only infrastructure is allowed until DLV explicitly approves live enablement.

Candidate root:

`/Users/mac/hermes-workspace/generated-candidates/war-room/asset-first-foundation/20260612`

Primary provenance inputs read:

- `docs/status/automation/war-room-asset-first-sprint-contract-20260612.md`
- `docs/status/automation/war-room-agent-routing-policy.md`
- `docs/status/art-direction/war-room-asset-first-foundation-20260612.md`
- `generated-candidates/war-room/asset-first-foundation/20260612/PROVENANCE_NOTE.md`
- `generated-candidates/war-room/asset-first-foundation/20260612/generation_manifest.json`
- `generated-candidates/war-room/asset-first-foundation/20260612/asset_dimensions_alpha_audit.json`
- Sibling `*.metadata.json` files beside each candidate image

## Overall candidate-set state

- Candidate state: `candidate-only`
- Approved-preview state: `not-approved-preview`
- Live-local state: `not-live-local`
- Integration state: `not-integrated / not-public / not-live / NOT_CONNECTED`
- Generation tool/provenance: ChatGPT web in an existing local Chrome/CDP tab on `localhost:9222`, direct websocket CDP. Built-in `image_generate` route was unavailable because `FAL_KEY` / managed FAL was not configured.
- Prompt pack: `docs/status/art-direction/war-room-asset-first-foundation-20260612.md`
- Source/license note: generated local candidate assets from ChatGPT authenticated generated image URLs or existing local downloaded files recorded in metadata. No stock/supplier/Etsy/shop source or live business system is involved in this candidate set.
- Human/product status: raw generated candidate package only; do not claim premium/final/release-ready.

## Registry rows — candidate image files

| Candidate file | Intended use | Dimensions / mode | Provenance | State | Next technicalartist action |
| --- | --- | --- | --- | --- | --- |
| `generated-candidates/war-room/asset-first-foundation/20260612/world-cell-grid/candidate-a/world_cell_grid_base.png` | First viewport world/cell base for `/war-room`; full-canvas Olympus room/cell map foundation. | `1672x941`, RGB, no alpha. | Prompt `prompt-01-world-cell-grid-base`; metadata `world-cell-grid/candidate-a/world_cell_grid_base.png.metadata.json`; source URL kind `existing local file`; generated/downloaded via ChatGPT web/CDP. | candidate `candidate-only`; approved-preview `no`; live-local `no`; public/live `no`. | Inspect full-canvas visual fit; normalize/regenerate toward required 16:9 high-res target, preferably `3840x2160`; define percent hitbox/cell coordinate manifest; verify no baked text/proof-wall/dashboard look. |
| `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-room-base/candidate-a/olympus_command_room_base.png` | Opened Olympus Command room background; full-canvas architectural shell for later station/operator placement. | `1672x941`, RGB, no alpha. | Prompt `prompt-02-olympus-command-room-base`; metadata `olympus-command-room-base/candidate-a/olympus_command_room_base.png.metadata.json`; source URL kind `existing local file`; generated/downloaded via ChatGPT web/CDP. | candidate `candidate-only`; approved-preview `no`; live-local `no`; public/live `no`. | Inspect whether it is truly empty architecture with no baked stations/figures; normalize/regenerate to high-res 16:9; create placement manifest for station slots, safe zones, thresholds, and operator slots. |
| `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-station-props/candidate-a/station_council_war_table.png` | Central mission/campaign planning table prop for Olympus Command. | `1536x1024`, RGB, no alpha. | Prompt `prompt-03-station-council-war-table`; metadata `olympus-command-station-props/candidate-a/station_council_war_table.png.metadata.json`; source URL kind `ChatGPT authenticated generated image URL`. | candidate `candidate-only`; approved-preview `no`; live-local `no`; public/live `no`; alpha state `failed/risk` for transparent-family use because file is RGB. | Do not promote as transparent prop. Remove/regenerate opaque/matte/background; target transparent square `2048x2048` with 8-12% padding; verify no readable map labels or pseudo-text; set alpha bounds. |
| `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-station-props/candidate-a/station_mission_board.png` | Raised historical mission/state board or stela with empty plaque areas. | `1536x1024`, RGB, no alpha. | Prompt `prompt-03-station-mission-board`; metadata `olympus-command-station-props/candidate-a/station_mission_board.png.metadata.json`; source URL kind `ChatGPT authenticated generated image URL`. | candidate `candidate-only`; approved-preview `no`; live-local `no`; public/live `no`; alpha state `failed/risk` for transparent-family use because file is RGB. | Do not promote as transparent prop. Regenerate or cut out to transparent `2048x2048`; ensure empty plaques stay text-free; reject if it reads as UI board/card or contains pseudo-text. |
| `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-station-props/candidate-a/station_jarvis_omen_beacon.png` | Mythic oracle/signal beacon for recommendations, not a chat UI or robot face. | `1536x1024`, RGB, no alpha. | Prompt `prompt-03-station-jarvis-omen-beacon`; metadata `olympus-command-station-props/candidate-a/station_jarvis_omen_beacon.png.metadata.json`; source URL kind `ChatGPT authenticated generated image URL`. | candidate `candidate-only`; approved-preview `no`; live-local `no`; public/live `no`; alpha state `failed/risk` for transparent-family use because file is RGB. | Do not promote as transparent prop. Regenerate/cut to transparent `2048x2048`; inspect for UI/screen/dashboard cues; keep cyan energy as in-world material only. |
| `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-station-props/candidate-a/station_approval_seal_shrine.png` | DLV approval / locked-action shrine prop for gated decisions. | `1536x1024`, RGBA, alpha extrema `[0, 255]`. | Prompt `prompt-03-station-approval-seal-shrine`; metadata `olympus-command-station-props/candidate-a/station_approval_seal_shrine.png.metadata.json`; source URL kind `ChatGPT authenticated generated image URL`. | candidate `candidate-only`; approved-preview `no`; live-local `no`; public/live `no`; alpha state `present but unapproved`. | Verify alpha cleanliness, matte/halo, crop, and semantic fit; normalize to transparent square `2048x2048`; define focus/hitbox anchor and locked-action state semantics; reject any readable approval text or button look. |
| `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-station-props/candidate-a/station_gateway_dispatch_console.png` | Hermes messenger dispatch altar/portal for worker routing. | `1536x1024`, RGB, no alpha. | Prompt `prompt-03-station-gateway-dispatch-console`; metadata `olympus-command-station-props/candidate-a/station_gateway_dispatch_console.png.metadata.json`; source URL kind `ChatGPT authenticated generated image URL`. | candidate `candidate-only`; approved-preview `no`; live-local `no`; public/live `no`; alpha state `failed/risk` for transparent-family use because file is RGB. | Do not promote as transparent prop. Regenerate/cut to transparent `2048x2048`; reject server rack, terminal log, browser/dashboard, or fake connected-state appearance; define dispatch portal hitbox. |
| `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-station-props/candidate-a/station_safe_autonomy_mode_pedestal.png` | Bounded autonomy mode pedestal with unlabeled sockets/tiers. | `1536x1024`, RGBA, alpha extrema `[0, 255]`. | Prompt `prompt-03-station-safe-autonomy-mode-pedestal`; metadata `olympus-command-station-props/candidate-a/station_safe_autonomy_mode_pedestal.png.metadata.json`; source URL kind `ChatGPT authenticated generated image URL`. | candidate `candidate-only`; approved-preview `no`; live-local `no`; public/live `no`; alpha state `present but unapproved`. | Verify alpha cleanliness, matte/halo, crop, text-free sockets, and no fake autonomy/live claim; normalize to transparent square `2048x2048`; define bounded-autonomy hitbox/state. |
| `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-operator/candidate-a/operator_hermes_command_presence_idle.png` | First Hermes/Olympus command operator presence, idle state only. | `1536x1024`, RGB, no alpha. | Prompt `prompt-04-operator-hermes-command-presence-idle`; metadata `olympus-command-operator/candidate-a/operator_hermes_command_presence_idle.png.metadata.json`; source URL kind `ChatGPT authenticated generated image URL`. | candidate `candidate-only`; approved-preview `no`; live-local `no`; public/live `no`; alpha state `failed/risk` for transparent-family use because file is RGB; animation states `not-generated`. | Do not promote as operator sprite. Regenerate/cut to transparent square `1024x1024` or `1536x1536`; verify not portrait/card/avatar/blob; keep claim to idle only until walk/work/approval-required states exist. |
| `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-ui-surfaces/candidate-a/plaque_room_title_empty.png` | Text-free Olympus room title plaque for HTML overlay. | `1536x1024`, RGBA, alpha extrema `[0, 255]`. | Prompt `prompt-05-plaque-room-title-empty`; metadata `olympus-command-ui-surfaces/candidate-a/plaque_room_title_empty.png.metadata.json`; source URL kind `ChatGPT authenticated generated image URL`. | candidate `candidate-only`; approved-preview `no`; live-local `no`; public/live `no`; alpha state `present but unapproved`; dimension mismatch with target. | Verify clean central safe text zone and no ornament intrusion; normalize/regenerate to transparent `1600x420`; record safe text zone approx `x18-82% y28-70%`; inspect for pseudo-text/gibberish. |
| `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-ui-surfaces/candidate-a/plaque_station_label_empty.png` | Text-free station hover/focus label plaque for HTML overlay. | `1536x1024`, RGB, no alpha. | Prompt `prompt-05-plaque-station-label-empty`; metadata `olympus-command-ui-surfaces/candidate-a/plaque_station_label_empty.png.metadata.json`; source URL kind `ChatGPT authenticated generated image URL`. | candidate `candidate-only`; approved-preview `no`; live-local `no`; public/live `no`; alpha state `failed/risk` for transparent-family use because file is RGB; dimension mismatch with target. | Do not promote. Regenerate/cut to transparent `1100x320`; verify central safe zone `x16-84% y28-72%`; remove matte/background and reject baked labels/pseudo-text. |
| `generated-candidates/war-room/asset-first-foundation/20260612/olympus-command-ui-surfaces/candidate-a/frame_station_dialog_empty.png` | Text-free station/dialog frame with HTML overlay safe zones. | `1536x1024`, RGB, no alpha. | Prompt `prompt-05-frame-station-dialog-empty`; metadata `olympus-command-ui-surfaces/candidate-a/frame_station_dialog_empty.png.metadata.json`; source URL kind `ChatGPT authenticated generated image URL`. | candidate `candidate-only`; approved-preview `no`; live-local `no`; public/live `no`; alpha state `failed/risk` for transparent-family use because file is RGB; dimension mismatch with target. | Do not promote. Regenerate/cut to transparent `2400x1600`; verify body/output/safety-lock/close-control safe zones; reject if it resembles SaaS/glass card/browser window or contains pseudo-text. |

## Supporting generated files / audit artifacts

| File | Role | State / note |
| --- | --- | --- |
| `generated-candidates/war-room/asset-first-foundation/20260612/generation_manifest.json` | Candidate set manifest | Records 12 candidate image files, generation tool, candidate-only status, and safety line. |
| `generated-candidates/war-room/asset-first-foundation/20260612/PROVENANCE_NOTE.md` | Human provenance note | Records generation task `t_bb9678e5`, prompt pack, ChatGPT/CDP generation route, candidate-only safety, and QA risks. |
| `generated-candidates/war-room/asset-first-foundation/20260612/asset_dimensions_alpha_audit.json` | Dimensions/alpha audit | Confirms dimensions/modes above; highlights transparent-family RGB/alpha risks. |
| `generated-candidates/war-room/asset-first-foundation/20260612/contact_sheet_candidate_a.png` | Contact sheet / quick proof artifact | Candidate-only visual proof sheet; not an asset to integrate. |
| `generated-candidates/war-room/asset-first-foundation/20260612/direct-cdp-generation-run.log` | Generation run log | Provenance support only. |
| `generated-candidates/war-room/asset-first-foundation/20260612/generation-run.log` | Prior/alternate generation log | Provenance support only; do not treat as runtime artifact. |
| `generated-candidates/war-room/asset-first-foundation/20260612/direct_cdp_generate.py` | Local generation helper script | Provenance/tooling support left in candidate root; not a product asset. |
| `generated-candidates/war-room/asset-first-foundation/20260612/generate_chatgpt_candidates.py` | Local generation helper script | Provenance/tooling support left in candidate root; not a product asset. |
| Sibling `*.metadata.json` files | Per-image provenance | Required provenance sidecars for each candidate image; do not strip before technical-art handoff. |

## Known risks / non-promotion reasons

1. Most transparent-family files are not alpha-clean candidates. RGB/no-alpha files include `station_council_war_table.png`, `station_mission_board.png`, `station_jarvis_omen_beacon.png`, `station_gateway_dispatch_console.png`, `operator_hermes_command_presence_idle.png`, `plaque_station_label_empty.png`, and `frame_station_dialog_empty.png`.
2. Alpha-present files still need technical-art inspection for hidden matte/halo/crop/background issues before any approved-preview state: `station_approval_seal_shrine.png`, `station_safe_autonomy_mode_pedestal.png`, and `plaque_room_title_empty.png`.
3. Candidate dimensions are ChatGPT output sizes, not the target normalized sizes from the art-direction contract. Full-canvas backgrounds are `1672x941`; transparent-family outputs are currently `1536x1024` rather than square or specified plaque/frame dimensions.
4. The proof/provenance note says no obvious readable baked text was visible in the contact sheet, but individual file visual QA is still required for tiny pseudo-text/glyph artifacts.
5. Some station/UI candidates may be semantically weak or mismatched in the contact sheet. Keep them raw candidate-only until technicalartist and visual QA accept or reject each file.

## Required next lane

Next owner: `technicalartist`.

Recommended next actions:

1. Preserve the candidate root and sibling metadata as provenance.
2. Produce normalized transparent PNG/WebP outputs only in a new technical-art candidate/preview path; do not overwrite raw candidate files unless explicitly tasked.
3. For each prop/operator/plaque/frame, either regenerate or cut out to required target dimensions with clean alpha, padding, alpha bounds, and no matte/checker/background.
4. Create a normalized proof sheet plus a manifest with percent-based hitboxes, safe text zones, operator slots, alpha bounds, and forbidden live-claim guardrails.
5. Keep states as `candidate-only` until technical-art normalization and visual QA pass. Only a later approved integration card may copy to app/public/live-local paths.

## Release / integration gate

Do not promote this package to approved-preview or live-local from this handoff. Required future gates remain:

1. Technical-art normalization/proof/manifest.
2. Visual QA of individual normalized files and composed local preview.
3. Product/vision critique.
4. No-overclaim and release safety review.
5. Explicit integration card before any app/public path use.
