# War Room V40 local visual kit v2 — assetcreator handoff
Created UTC: 2026-06-12T23:37:16.017121+00:00
Task: `t_1a2a2830`
Status: candidate-only, local-only, not integrated into React.

## Output paths
- Candidate root: `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2`
- Manifest: `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/manifests/v40_local_visual_kit_manifest.json`
- Contact sheet: `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/contact-sheets/v40_local_visual_kit_contact_sheet.png`

## What was created
- 9 text-free 16:9 cell backgrounds for Olympus, Pantheon, Agora, Oracle, Forge, Merchant Harbor, Atlantis, Treasury, and optional Dev Studio.
- 1 transparent centered popup machine frame with visible close socket and lower station rail sockets.
- 12 transparent station/tool props/icons aligned to the V40 motifs.
- 7 transparent worker/operator tokens.
- 6 transparent packet/action glyphs and 8 route animation frames for source-to-target packet motion.
- 1 optional Dev Studio/self-working team room background.

## Safety/provenance
- Generated locally by a Python/Pillow script; no web/API/image-generation provider used.
- Assets contain no baked readable UI copy except the proof/contact-sheet labels.
- No Etsy/shop/supplier/publishing/paid/account/message/order/refund/purchase/Discord/live external action.
- Connectors remain `NOT_CONNECTED`, local-only, draft-only, read-only, approval-gated.
- No git commit/push/reset/clean/stash/checkout.

## Integration notes for downstream technical artist/integrator
- Use `cell-backgrounds/*.png` as main-board image surfaces under compact external hover/status plaques. Keep main `/war-room` cells-only.
- Use `popup-frame/centered_popup_machine_frame_close_socket.png` as transparent frame overlay above a room crop; suggested room viewport x=155 y=165 w=1290 h=640; close socket bbox x=1428 y=82 w=80 h=80.
- Use station props as distinct station-specific surfaces; do not reuse one generic cockpit.
- Use packet route frames only for explicit source-to-target action; avoid random decorative motion.

## Verification performed
- Generation script completed with `ok: true` and wrote 45 PNG-backed candidate/proof assets.
- Pillow validation re-opened every manifest PNG and confirmed manifest dimensions; missing/bad-dimension list was empty.
- SHA check found `duplicate_non_contact_sha_count: 0` after fixing the asset-table/council-table collision.
- Contact sheet visual inspection confirmed non-blank/non-corrupt rendering across cell backgrounds, popup frame, station props, worker tokens, packet effects, route frames, and Dev Studio motif.
- No React/source integration performed.

## Asset index
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/cell-backgrounds/olympus_command_cell_bg.png` — cell-background — 960x540 — sha256 `588d182d6c3b…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/cell-backgrounds/pantheon_quarters_cell_bg.png` — cell-background — 960x540 — sha256 `6b9d1065701e…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/cell-backgrounds/agora_opportunity_cell_bg.png` — cell-background — 960x540 — sha256 `84ea2e416daf…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/cell-backgrounds/oracle_signals_cell_bg.png` — cell-background — 960x540 — sha256 `985a797dc299…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/cell-backgrounds/forge_hephaestus_cell_bg.png` — cell-background — 960x540 — sha256 `9726140fffcb…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/cell-backgrounds/merchant_harbor_cell_bg.png` — cell-background — 960x540 — sha256 `fddf35b8be55…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/cell-backgrounds/atlantis_vault_cell_bg.png` — cell-background — 960x540 — sha256 `1bf588f14087…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/cell-backgrounds/treasury_commerce_cell_bg.png` — cell-background — 960x540 — sha256 `40572bc3502a…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/cell-backgrounds/dev_studio_cell_bg.png` — cell-background — 960x540 — sha256 `36fd19aa918c…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/popup-frame/centered_popup_machine_frame_close_socket.png` — popup-frame — 1600x1000 — sha256 `d6b186fd713a…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/station-props/council_war_table_prop.png` — station-prop — 256x256 — sha256 `684af2056290…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/station-props/hermes_dispatch_beacon_prop.png` — station-prop — 256x256 — sha256 `08477aec550b…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/station-props/aegis_approval_seal_prop.png` — station-prop — 256x256 — sha256 `654ef7337363…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/station-props/prompt_anvil_prop.png` — station-prop — 256x256 — sha256 `7dcd6b764476…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/station-props/sorting_rack_prop.png` — station-prop — 256x256 — sha256 `2954f0cf7602…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/station-props/signal_pool_prop.png` — station-prop — 256x256 — sha256 `f80c09ab272d…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/station-props/keyword_crystal_prop.png` — station-prop — 256x256 — sha256 `59a2d8f63e18…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/station-props/qa_lens_prop.png` — station-prop — 256x256 — sha256 `ab335ec9633d…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/station-props/code_bench_prop.png` — station-prop — 256x256 — sha256 `2fc0b3c32ae1…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/station-props/asset_table_prop.png` — station-prop — 256x256 — sha256 `defc9423319c…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/station-props/review_gate_prop.png` — station-prop — 256x256 — sha256 `bead65d1aa18…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/station-props/release_handoff_shrine_prop.png` — station-prop — 256x256 — sha256 `1f93d6fb38f1…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/worker-tokens/worker_planner_token.png` — worker-token — 160x220 — sha256 `b1f473aab7e3…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/worker-tokens/worker_coder_token.png` — worker-token — 160x220 — sha256 `a96379d3c233…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/worker-tokens/worker_asset_token.png` — worker-token — 160x220 — sha256 `58c71bde1bec…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/worker-tokens/worker_qa_token.png` — worker-token — 160x220 — sha256 `f6067b404fdf…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/worker-tokens/worker_reviewer_token.png` — worker-token — 160x220 — sha256 `c1e1074db283…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/worker-tokens/worker_release_guard_token.png` — worker-token — 160x220 — sha256 `8e28b77af2fe…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/worker-tokens/worker_hermes_operator_token.png` — worker-token — 160x220 — sha256 `e3de6735bdb0…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/packet-effects/packet_artifact_diamond.png` — packet-effect — 192x192 — sha256 `61c3009f6306…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/packet-effects/packet_route_node.png` — packet-effect — 192x192 — sha256 `227d1f50192d…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/packet-effects/approval_lock_seal.png` — packet-effect — 192x192 — sha256 `61cf7c0067a6…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/packet-effects/draft_only_scroll_glyph.png` — packet-effect — 192x192 — sha256 `1a593898cb92…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/packet-effects/read_only_evidence_crate.png` — packet-effect — 192x192 — sha256 `da67750f92cc…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/packet-effects/not_connected_gate_glyph.png` — packet-effect — 192x192 — sha256 `54d85c529148…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/packet-effects/packet_route_animation_frame_00.png` — packet-route-animation-frame — 320x120 — sha256 `7743b2dc5cf6…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/packet-effects/packet_route_animation_frame_01.png` — packet-route-animation-frame — 320x120 — sha256 `b0bc52a26e01…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/packet-effects/packet_route_animation_frame_02.png` — packet-route-animation-frame — 320x120 — sha256 `e0ad55e05767…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/packet-effects/packet_route_animation_frame_03.png` — packet-route-animation-frame — 320x120 — sha256 `1c55a857ae51…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/packet-effects/packet_route_animation_frame_04.png` — packet-route-animation-frame — 320x120 — sha256 `398552769b68…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/packet-effects/packet_route_animation_frame_05.png` — packet-route-animation-frame — 320x120 — sha256 `45878cc8c554…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/packet-effects/packet_route_animation_frame_06.png` — packet-route-animation-frame — 320x120 — sha256 `a355ceb449f7…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/packet-effects/packet_route_animation_frame_07.png` — packet-route-animation-frame — 320x120 — sha256 `3778a7498578…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/dev-studio/dev_studio_self_working_team_room_bg.png` — dev-studio-room-bg — 1280x720 — sha256 `b5bad093e0bd…`
- `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/contact-sheets/v40_local_visual_kit_contact_sheet.png` — contact-sheet — 1200x1845 — sha256 `147e03ab384b…`
