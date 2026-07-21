# War Room V40 local visual kit v2 — technical-art contract

Created UTC: 2026-06-12T23:41:32.243069+00:00
Task: `t_cabfb8e3`
Status: PASS / manifest + safe-zone + action contract only. No React integration performed.

## Output files

- Public local-app manifest: `public/war-room/v40/local-visual-kit-v2/v40_asset_integration_manifest.json`
- Technical-art JSON: `docs/status/technical-art/war-room-v40-local-visual-kit-v2-technical-art-contract-20260613.json`
- Safe-zone/hitbox proof PNG: `docs/status/technical-art/proofs/war-room-v40-local-visual-kit-v2-safe-zones-proof.png`
- Public staged asset root: `public/war-room/v40/local-visual-kit-v2/`
- Source candidate root preserved: `generated-candidates/war-room/v40-6h/20260613-local-visual-kit-v2/`

## Scope and safety

This handoff only stages local static assets and writes manifest/proof documents. It does not edit React, run live connectors, publish, buy, message, refund, spend, send Discord messages, enable accounts, or perform git actions.

All downstream UI must keep connector state as `NOT_CONNECTED`, `local-only`, `read-only`, `draft-only`, `mock`, `disabled`, or `approval-gated`.

## Asset staging summary

- Public staged PNG assets: 44 (source kit excluding contact sheet)
- Room/cell contracts: 9
- Main cell dimensions: 960x540, 16:9
- Popup frame dimensions: 1600x1000
- Popup room viewport: x=155 y=165 w=1290 h=640
- Popup close socket hitbox: x=1428 y=82 w=80 h=80
- Packet route animation: 8 frames, 320x120, recommended duration 1100ms

## Locked structure for integrator

1. Main `/war-room` remains cells-only.
2. The whole cell is the click target.
3. Cell click opens one centered popup/modal.
4. Popup contains room viewport, worker, station prop, packet/action, local output, safety lock, and close socket.
5. Close returns to cells-only board.
6. No default main-board decision panel, proof wall, source ledger, or detailed room.

## Safe zones and hitboxes

### Main cell contract

- Whole-cell click hitbox: 0%,0%,100%,100%; recommended minimum CSS target 220x124.
- Room art preserve zone: x=6%, y=8%, w=88%, h=72%.
- Compact status plaque zone: x=5%, y=76%, w=90%, h=18%.
- Status/packet badge zone: x=78%, y=8%, w=16%, h=16%.
- Avoid long text over room art. Default text budget: room name, status, one short action line.

### Popup frame contract

- Room viewport: x=155 y=165 w=1290 h=640.
- Title plaque: x=250 y=78 w=850 h=64.
- Close socket hitbox: x=1428 y=82 w=80 h=80, min CSS target 44px.
- Station rail: x=175 y=815 w=1250 h=115.
- Footer avoid zone: x=0 y=930 w=1600 h=70.

### Popup room slot suggestions at 1280x720 viewport

- left_tool: x=16%, y=56%, w=16%, h=23%.
- center_tool: x=42%, y=58%, w=18%, h=24%.
- right_lock: x=71%, y=50%, w=16%, h=24%.
- output_surface: x=63%, y=18%, w=26%, h=22%.
- worker_floor: x=34%, y=54%, w=12%, h=30%.
- packet_route: x=28%, y=45%, w=46%, h=12%.

## Station/action surface contract

Every implemented station surface must show, in this order:

1. Source/input.
2. Work action.
3. Concrete output/artifact.
4. Local variants/options.
5. Risk/lock.
6. Next handoff.

Allowed action verbs: Inspect, Stage draft, Compare, Route, Queue for approval, Save local note, Open read-only context, Ask worker.

Forbidden action verbs unless DLV later approves a separate live-action gate: Publish, Buy, Order, Message supplier, Message customer, Refund, Renew, Edit live listing, Charge, Spend, Send to Discord, Enable connector.

## Animation contract

Use `packet_route_animation_frame_00.png` through `packet_route_animation_frame_07.png` only to communicate explicit local work:

- main-cell packet handoff from source cell to target cell;
- popup worker moving/working from `worker_floor` to a station slot;
- station use cue from primary station prop to `output_surface`.

Do not use random particle storms, jitter, flappy motion, or any animation that implies publishing/buying/messaging/spending/sending externally.

## Room defaults

- `olympus_command` — Olympus Command: cell `/war-room/v40/local-visual-kit-v2/cell-backgrounds/olympus_command_cell_bg.png`, station `/war-room/v40/local-visual-kit-v2/station-props/council_war_table_prop.png`, worker `/war-room/v40/local-visual-kit-v2/worker-tokens/worker_hermes_operator_token.png`, packet `/war-room/v40/local-visual-kit-v2/packet-effects/packet_artifact_diamond.png`, action `route local mission packet`, safety `NOT_CONNECTED / local-only`.
- `pantheon_quarters` — Pantheon Quarters: cell `/war-room/v40/local-visual-kit-v2/cell-backgrounds/pantheon_quarters_cell_bg.png`, station `/war-room/v40/local-visual-kit-v2/station-props/review_gate_prop.png`, worker `/war-room/v40/local-visual-kit-v2/worker-tokens/worker_reviewer_token.png`, packet `/war-room/v40/local-visual-kit-v2/packet-effects/packet_route_node.png`, action `assign/review worker packet`, safety `local-only / no provider-key controls`.
- `agora_opportunity` — Agora of Opportunity: cell `/war-room/v40/local-visual-kit-v2/cell-backgrounds/agora_opportunity_cell_bg.png`, station `/war-room/v40/local-visual-kit-v2/station-props/keyword_crystal_prop.png`, worker `/war-room/v40/local-visual-kit-v2/worker-tokens/worker_planner_token.png`, packet `/war-room/v40/local-visual-kit-v2/packet-effects/read_only_evidence_crate.png`, action `inspect read-only opportunity signal`, safety `read-only / no listing editor`.
- `oracle_signals` — Oracle of Signals: cell `/war-room/v40/local-visual-kit-v2/cell-backgrounds/oracle_signals_cell_bg.png`, station `/war-room/v40/local-visual-kit-v2/station-props/signal_pool_prop.png`, worker `/war-room/v40/local-visual-kit-v2/worker-tokens/worker_planner_token.png`, packet `/war-room/v40/local-visual-kit-v2/packet-effects/packet_route_node.png`, action `rank local signal packet`, safety `read-only / no market claims final`.
- `forge_hephaestus` — Forge of Hephaestus: cell `/war-room/v40/local-visual-kit-v2/cell-backgrounds/forge_hephaestus_cell_bg.png`, station `/war-room/v40/local-visual-kit-v2/station-props/prompt_anvil_prop.png`, worker `/war-room/v40/local-visual-kit-v2/worker-tokens/worker_coder_token.png`, packet `/war-room/v40/local-visual-kit-v2/packet-effects/draft_only_scroll_glyph.png`, action `stage draft artifact`, safety `draft-only / no paid generation`.
- `merchant_harbor` — Merchant Harbor: cell `/war-room/v40/local-visual-kit-v2/cell-backgrounds/merchant_harbor_cell_bg.png`, station `/war-room/v40/local-visual-kit-v2/station-props/qa_lens_prop.png`, worker `/war-room/v40/local-visual-kit-v2/worker-tokens/worker_qa_token.png`, packet `/war-room/v40/local-visual-kit-v2/packet-effects/read_only_evidence_crate.png`, action `inspect supplier proof packet`, safety `read-only / no buy/message`.
- `atlantis_vault` — Atlantis Vault: cell `/war-room/v40/local-visual-kit-v2/cell-backgrounds/atlantis_vault_cell_bg.png`, station `/war-room/v40/local-visual-kit-v2/station-props/release_handoff_shrine_prop.png`, worker `/war-room/v40/local-visual-kit-v2/worker-tokens/worker_release_guard_token.png`, packet `/war-room/v40/local-visual-kit-v2/packet-effects/approval_lock_seal.png`, action `archive local handoff packet`, safety `local archive / no raw DB first-view`.
- `treasury_commerce` — Treasury of Commerce: cell `/war-room/v40/local-visual-kit-v2/cell-backgrounds/treasury_commerce_cell_bg.png`, station `/war-room/v40/local-visual-kit-v2/station-props/aegis_approval_seal_prop.png`, worker `/war-room/v40/local-visual-kit-v2/worker-tokens/worker_release_guard_token.png`, packet `/war-room/v40/local-visual-kit-v2/packet-effects/not_connected_gate_glyph.png`, action `lock commerce/spend packet`, safety `approval-gated / no spend`.
- `dev_studio` — Dev Studio: cell `/war-room/v40/local-visual-kit-v2/cell-backgrounds/dev_studio_cell_bg.png`, station `/war-room/v40/local-visual-kit-v2/station-props/code_bench_prop.png`, worker `/war-room/v40/local-visual-kit-v2/worker-tokens/worker_coder_token.png`, packet `/war-room/v40/local-visual-kit-v2/packet-effects/packet_artifact_diamond.png`, action `show self-working team packet`, safety `local-only / no git commit/push/reset`.

## Verification performed

- Parsed source manifest JSON.
- Copied 44 non-contact-sheet PNG assets into `public/war-room/v40/local-visual-kit-v2/` for local app serving.
- Reopened every public PNG with Pillow and recorded dimensions + SHA-256.
- Wrote the expanded technical-art manifest to both public and docs/status paths.
- Generated an overlay proof PNG showing popup safe zones, close hitbox, station rail, cell plaque/badge zones, and popup slot maps.

## Downstream QA reminders

The integrator/QA lanes still need runtime proof after React integration:

```bash
pnpm build
curl -I --max-time 10 http://127.0.0.1:3001/war-room
```

Browser QA must verify: closed state cells-only, no default detail/decision panel, click cell -> centered popup, station/action visible and local-only, close returns to cells-only, console clean, no live connectors/actions enabled.
