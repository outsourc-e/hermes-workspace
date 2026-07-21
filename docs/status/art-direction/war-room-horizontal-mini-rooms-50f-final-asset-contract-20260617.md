# War Room Horizontal Mini-Rooms + 50f Agent Final Asset Contract

Created: 2026-06-17
Task: `t_6479d006`
Status: PASS / documentation contract only
Workspace boundary: `/Users/mac/hermes-workspace`
Supersedes for this run:
- `docs/status/automation/2026-06-17-war-room-10h-chatgpt-codex-horizontal-rooms-50f-contract.md`
- `docs/status/art-direction/war-room-main-screen-asset-list-modular-pixel-olympus-20260617.md`
- `/Users/mac/Documents/Hermes Second Brain/01 Projects/War Room/החלטת עיצוב - מסך ראשי מודולרי חדרים וגשרים 2026-06-17.md`

## 0. Non-negotiable visual law

The main War Room screen is a single all-rooms view made from small horizontal rectangular rooms connected by real paved corridors/bridges.

Required:

1. All rooms fit in the first viewport at once.
2. Every room is a miniature version of itself: it has its own floor/walls, one visible agent, 2-4 room-specific stations/props, a doorway, and a blank plaque for live UI text.
3. Rooms are horizontal rectangles. No square-first modules, irregular giant rooms, dashboard cards, or abstract connected-atlas lines.
4. Corridors are physical world pieces: stone/bronze roads, bridges, thresholds, gates, and junction tiles.
5. Hermes/Olympus theme: marble/stone, bronze/gold, caduceus/Hermes wing cues, obsidian/navy outside void.
6. Every room agent has a 50+ frame animation contract; target is 96 frames per room agent.
7. Movement is slow, directional, and workflow-backed. No random idle traffic, no decorative data lines.
8. Live store/shop/supplier/customer/account/paid actions stay locked/manual-only. The art must not imply autonomous publishing, purchasing, messaging, renewal, refund, account mutation, or paid generation.

## 1. Coordinate system

Use this coordinate system for all downstream layout, asset slicing, and hitbox work.

- Logical atlas grid: `24u x 14u`.
- Intended render aspect: `16:9`, e.g. `1920x1080`.
- Approximate scale at 1920x1080: `1u = 80px wide x 72px tall`.
- Coordinates below are logical grid units: `{ x, y, w, h }`.
- Door/socket points are `{ x, y }` in the same grid.
- Text labels are live UI overlays on blank plaques; no generated asset may bake readable text.

## 2. Final room list, dimensions, and grid positions

All rooms are horizontal. Standard room shell is `4u x 2u`. Command and two larger production rooms are wider but still horizontal.

| Room id | Display name | Grid bounds `{x,y,w,h}` | Pixel target at 1920x1080 | Door sockets | Miniature contents required |
| --- | --- | --- | --- | --- | --- |
| `agora-opportunity` | Agora Opportunity | `{1,1,4,2}` | `320x144` | S `{3,3}` | market stall, product board, score scale, Athena/opportunity agent |
| `oracle-signals` | Oracle Signals | `{6,1,4,2}` | `320x144` | S `{8,3}` | crystal pool, signal/keyword glyph screen, source scrolls, oracle agent |
| `hephaestus-forge` | Forge of Hephaestus | `{11,1,4,2}` | `320x144` | S `{13,3}` | anvil, furnace, ShotLab/draft rack, forge agent |
| `merchant-harbor` | Merchant Harbor | `{16,1,4,2}` | `320x144` | S `{18,3}` | dock planks, cargo inspection table, supplier proof crate, harbor scout |
| `gateway-discord-cockpit` | Gateway / Discord Cockpit | `{20,1,4,2}` | `320x144` | S `{22,3}` | guarded messenger console, signal beacon, draft scroll station, gateway messenger |
| `atlantis-vault` | Atlantis Vault / Archive | `{1,5.4,4,2}` | `320x144` | E `{5,6.4}` | underwater archive shelves, evidence ledger table, vault door, archivist |
| `olympus-command` | Olympus Command / Hermes Conductor | `{9,5.15,6,2.5}` | `480x180` | N `{12,5.15}`, W `{9,6.4}`, E `{15,6.4}`, S `{12,7.65}` | central command table, mission router dais, caduceus/Hermes wings, Hermes conductor |
| `treasury-approval` | Treasury / Approval | `{19,5.4,4,2}` | `320x144` | W `{19,6.4}` | approval shrine, locked chest, audit ledger, treasury guard |
| `roman-dev-studio` | Roman Dev Studio | `{4.8,10,5,2}` | `400x144` | N `{7.3,10}` | build bench, QA shield rack, blueprint table, Roman producer |
| `rest-room-agent-lounge` | Rest Room / Agent Lounge | `{14.2,10,5,2}` | `400x144` | N `{16.7,10}` | couches/benches, food/water table, recharge/quiet plaque, rest steward + idle helper slot |

Layout intent:

- Top row is intake/analysis/production/dispatch.
- Center row is archive, command, approval lock.
- Bottom row is local implementation and rest/recharge.
- Olympus Command is the only larger room and still remains a horizontal miniature, not a giant hub.
- The main screen must preserve empty obsidian/navy negative space around roads; do not pack rooms into a dashboard grid with card gutters.

## 3. Exact road / bridge topology

### 3.1 Corridor tile vocabulary

All topology below must be built from physical assets, not SVG-only abstract connector lines.

Required road pieces:

- `road-horizontal-straight`
- `road-vertical-straight`
- `road-corner-ne`
- `road-corner-nw`
- `road-corner-se`
- `road-corner-sw`
- `road-t-junction-up`
- `road-t-junction-down`
- `road-t-junction-left`
- `road-t-junction-right`
- `road-cross-junction`
- `short-bridge-room-to-road`
- `long-bridge-span`
- `door-threshold-gate`
- `manual-approval-gate-overlay`
- `blocked-gate-overlay`
- `route-glow-overlay-cyan-gold`

### 3.2 Main corridor nodes

| Node id | Grid point | Meaning |
| --- | --- | --- |
| `n-agora-s` | `{3,3}` | Agora south doorway |
| `n-oracle-s` | `{8,3}` | Oracle south doorway |
| `n-forge-s` | `{13,3}` | Forge south doorway |
| `n-harbor-s` | `{18,3}` | Merchant Harbor south doorway |
| `n-gateway-s` | `{22,3}` | Gateway south doorway |
| `n-top-agora` | `{3,4}` | top boulevard junction under Agora |
| `n-top-oracle` | `{8,4}` | top boulevard junction under Oracle |
| `n-top-forge` | `{13,4}` | top boulevard junction under Forge |
| `n-top-harbor` | `{18,4}` | top boulevard junction under Harbor |
| `n-top-gateway` | `{22,4}` | top boulevard junction under Gateway |
| `n-command-n` | `{12,5.15}` | Command north threshold |
| `n-command-w` | `{9,6.4}` | Command west threshold |
| `n-command-e` | `{15,6.4}` | Command east threshold |
| `n-command-s` | `{12,7.65}` | Command south threshold |
| `n-atlantis-e` | `{5,6.4}` | Atlantis east threshold |
| `n-treasury-w` | `{19,6.4}` | Treasury west threshold |
| `n-lower-command` | `{12,9}` | lower boulevard command junction |
| `n-roman-n` | `{7.3,10}` | Roman Dev Studio north threshold |
| `n-rest-n` | `{16.7,10}` | Rest Room north threshold |
| `n-lower-roman` | `{7.3,9}` | lower boulevard Roman junction |
| `n-lower-rest` | `{16.7,9}` | lower boulevard Rest junction |

### 3.3 Physical corridor segments

Each segment is a paved road or bridge with finite width. Segment endpoints must visually touch door thresholds.

| Segment id | From -> to | Tile composition | Purpose |
| --- | --- | --- | --- |
| `seg-agora-drop` | `n-agora-s -> n-top-agora` | vertical short bridge + threshold | Agora enters top boulevard |
| `seg-oracle-drop` | `n-oracle-s -> n-top-oracle` | vertical short bridge + threshold | Oracle enters top boulevard |
| `seg-forge-drop` | `n-forge-s -> n-top-forge` | vertical short bridge + threshold | Forge enters top boulevard |
| `seg-harbor-drop` | `n-harbor-s -> n-top-harbor` | vertical short bridge + threshold | Harbor enters top boulevard |
| `seg-gateway-drop` | `n-gateway-s -> n-top-gateway` | vertical short bridge + threshold | Gateway enters top boulevard |
| `seg-top-agora-oracle` | `n-top-agora -> n-top-oracle` | horizontal road, T junctions at ends | opportunity/signal route |
| `seg-top-oracle-forge` | `n-top-oracle -> n-top-forge` | horizontal road, junction at command drop | signal/draft route spine |
| `seg-top-forge-harbor` | `n-top-forge -> n-top-harbor` | horizontal road | production/proof route spine |
| `seg-top-harbor-gateway` | `n-top-harbor -> n-top-gateway` | horizontal road | dispatch/proof route spine |
| `seg-command-north-link` | `n-command-n -> {12,4}` | vertical bridge connected into top boulevard with cross junction | top row to Command |
| `seg-atlantis-command` | `n-atlantis-e -> n-command-w` | horizontal bridge with archive-blue edge glow | archive/provenance route |
| `seg-command-treasury` | `n-command-e -> n-treasury-w` | horizontal bridge with approval gate at Treasury end | manual approval lock route |
| `seg-command-lower` | `n-command-s -> n-lower-command` | vertical paved bridge | Command to bottom boulevard |
| `seg-lower-roman-command` | `n-lower-roman -> n-lower-command` | horizontal paved road | Dev Studio build/report route |
| `seg-lower-command-rest` | `n-lower-command -> n-lower-rest` | horizontal paved road | idle/rest route and return route |
| `seg-roman-up` | `n-roman-n -> n-lower-roman` | vertical short bridge + threshold | Roman Dev Studio room connector |
| `seg-rest-up` | `n-rest-n -> n-lower-rest` | vertical short bridge + threshold | Rest Room connector |

### 3.4 Named workflow routes on the topology

| Route id | Source -> Target | Segment path | Packet/agent behavior |
| --- | --- | --- | --- |
| `route-opportunity-to-command` | Agora -> Command | `seg-agora-drop`, `seg-top-agora-oracle`, partial `seg-top-oracle-forge`, `seg-command-north-link` | opportunity scroll carried by Athena scout or runner; pauses at Command threshold |
| `route-signal-to-agora` | Oracle -> Agora | `seg-oracle-drop`, reverse `seg-top-agora-oracle`, `seg-agora-drop` | signal orb moves slowly; source/target sockets glow purple/gold |
| `route-signal-to-command` | Oracle -> Command | `seg-oracle-drop`, partial `seg-top-oracle-forge`, `seg-command-north-link` | keyword/signal packet to Hermes conductor |
| `route-forge-to-command` | Forge -> Command | `seg-forge-drop`, partial `seg-top-oracle-forge`, `seg-command-north-link` | draft artifact crate to Command review |
| `route-harbor-to-treasury` | Harbor -> Treasury | `seg-harbor-drop`, `seg-top-forge-harbor`, partial top road, `seg-command-north-link`, `seg-command-treasury` | supplier proof crate stops at Treasury lock; never implies purchasing |
| `route-gateway-to-command` | Gateway -> Command | `seg-gateway-drop`, reverse `seg-top-harbor-gateway`, reverse `seg-top-forge-harbor`, `seg-command-north-link` | internal dispatch packet; no automated external send cue |
| `route-command-to-atlantis` | Command -> Atlantis | `seg-atlantis-command` reverse | completed/rejected packet archives into Vault |
| `route-command-to-treasury` | Command -> Treasury | `seg-command-treasury` | manual-only approval packet; blocked gate can stop before Treasury threshold |
| `route-roman-to-command` | Roman Dev Studio -> Command | `seg-roman-up`, `seg-lower-roman-command`, `seg-command-lower` | local build/report packet to Command |
| `route-any-to-rest` | Any active room -> Rest Room | room connector -> nearest boulevard -> `seg-lower-command-rest`, `seg-rest-up` | off-duty agent walks to lounge; no fake work while resting |

Acceptance rule: if a renderer cannot draw the above exact topology, it must fail contract QA rather than falling back to curved abstract lines.

## 4. Per-agent 50+ frame animation requirements

### 4.1 Global target

Each room agent target sheet is `48x48` atlas-scale frames, transparent background, `12 rows x 8 columns = 96 frames`.

For full room popups later, remake or upscale as `96x96`, same rows and state semantics.

Required row order:

| Row | State | Frames | Notes |
| --- | --- | ---: | --- |
| 1 | `idle` | 8 | breathing/head/tool settle; first frame must read as idle |
| 2 | `walk-north` | 8 | slow real steps; no sliding |
| 3 | `walk-south` | 8 | slow real steps; no sliding |
| 4 | `walk-east` | 8 | side step readable at atlas scale |
| 5 | `walk-west` | 8 | may mirror east only if costume/handed tool still reads correctly |
| 6 | `carry-packet-north` | 8 | carries room-specific packet while walking north |
| 7 | `carry-packet-south` | 8 | carries room-specific packet while walking south |
| 8 | `carry-packet-east` | 8 | carries room-specific packet while walking east |
| 9 | `carry-packet-west` | 8 | carries room-specific packet while walking west |
| 10 | `work-at-station` | 8 | station-specific, not generic typing |
| 11 | `talk-status` | 4 | may repeat to 8 columns; live speech bubble overlay, no baked text |
| 12 | `rest-or-blocked` | 4 rest + 4 blocked/approval | rest pose for lounge/off-duty and blocked/manual-only cue |

Minimum acceptable fallback for the first implementation slice is still at least 56 documented frames per agent: `idle 4`, cardinal walks `4x8 = 32`, `work 4`, `talk 4`, one directional `carry-packet 8`, `rest 2`, `blocked/approval 2`. Any fallback must be labeled `temporary-not-final` in manifests.

### 4.2 Per-room agent contracts

| Room id | Agent id | Visual identity | Packet carried | Station-specific work animation |
| --- | --- | --- | --- | --- |
| `olympus-command` | `agent-hermes-conductor` | Hermes courier-general with gold/cyan sash, wing cues, caduceus pointer | sealed mission scroll | stamps/points at command table and route map |
| `agora-opportunity` | `agent-athena-opportunity` | Athena strategist with ledger, lens, small market basket | opportunity scroll | compares product tokens on score scale, marks read-only shortlist |
| `oracle-signals` | `agent-oracle-signal-analyst` | purple/blue oracle analyst with crystal lens and star cloak | signal orb | reads crystal pool/keyword constellation; no SaaS dashboard typing |
| `hephaestus-forge` | `agent-hephaestus-forge-operator` | forge smith with hammer/apron/ember rim | draft artifact crate | strikes anvil, adjusts draft rack, furnace spark loop |
| `merchant-harbor` | `agent-harbor-scout` | dock inspector with spyglass, cargo tag sash | supplier proof crate | inspects crate/table and applies risk tag; no order/message cue |
| `atlantis-vault` | `agent-atlantis-archivist` | teal/blue scribe with shell stylus and tablet | archive tablet/evidence folder | shelves tablet, opens provenance ledger |
| `treasury-approval` | `agent-treasury-guard` | approval warden with shield/key/locked coin seal | commerce lock packet | guards approval shrine, inspects locked ledger; no money-spend success cue |
| `roman-dev-studio` | `agent-roman-producer` | Roman engineer-producer with red cloak, blueprint shield | implementation packet/blueprint | uses build bench/QA shield rack; no git commit/push visual cue |
| `gateway-discord-cockpit` | `agent-gateway-messenger` | messenger captain with relay baton and guarded satchel | internal dispatch packet | works relay beacon/draft scroll station; no external send animation |
| `rest-room-agent-lounge` | `agent-rest-steward` | lounge steward/off-duty helper with cup/blanket | rest token | lounge upkeep only; true rest/recharge poses for idle agents |

### 4.3 Motion timing

- Walk/carry loops play at `8-10 fps`, but actual route travel is slow: `12-24 seconds` for a cross-map route.
- Agents must pause at thresholds and junctions for `300-800ms`.
- Packets must align to route progress; they may not teleport through rooms.
- Reduced motion: stop route travel, place packet at current checkpoint, show first-frame pose + calm socket glow only.

## 5. Per-tool / station animation requirements

Every station uses `idle`, `active-work`, `packet-received`, `output-ready`, and `blocked-manual-approval` states. Target is `5 states x 8 frames = 40 frames` per station/effect family, or SVG/CSS effect tokens with equivalent frame timing and reduced-motion stills.

| Station id | Room | Idle | Active-work | Packet-received | Output-ready | Blocked/manual state |
| --- | --- | --- | --- | --- | --- | --- |
| `station-command-table` | Olympus | low cyan/gold table glow | routes pulse across map | scroll lands on table | calm seal glow | command seal locked |
| `station-mission-router-dais` | Olympus | bronze ring idle | caduceus route sweep | packet enters dais slot | route-ready halo | no external action gate |
| `station-opportunity-board` | Agora | warm plaque glow | product tokens slide/compare | opportunity scroll docks | shortlist token glow | read-only badge lock |
| `station-market-score-scale` | Agora | still balance scale | weighted product token motion | packet becomes score tablet | approved-for-review seal | purchase/order locked |
| `station-oracle-pool` | Oracle | purple water shimmer | constellation ripple | signal orb enters pool | source signal crystal glow | source unavailable/blocker dim |
| `station-signal-screen` | Oracle | glyph shimmer, no text | keyword star sweep | signal packet docks | trend-ready orb | no fake metric panels |
| `station-forge-anvil` | Forge | ember pulse | hammer/spark loop | draft crate opens | finished draft sparkle | paid generation locked |
| `station-furnace-bellows` | Forge | low lava glow | bellows/smoke loop | material packet enters | cooled artifact glow | overheat/blocked gate |
| `station-shotlab-rack` | Forge | organized draft rack | sorting/inspection loop | image bundle docks | candidate-ready glow | draft-only/manual lock |
| `station-supplier-proof-table` | Merchant | dock lantern idle | magnifier/inspection sweep | crate/tablet placed | proof-ready tag | no supplier message/order lock |
| `station-crate-inspection-bench` | Merchant | tied crates idle | tag/risk marker movement | proof crate opens | evidence tag glow | risk-blocked chain |
| `station-archive-shelves` | Atlantis | teal shelf shimmer | tablet slides into shelf | evidence folder arrives | archived marker glow | missing provenance lock |
| `station-evidence-ledger` | Atlantis | ledger idle | page/stylus movement | packet becomes record | saved provenance seal | integrity-blocked seal |
| `station-approval-shrine` | Treasury | emerald/gold lock idle | lock inspection pulse | approval packet docks | manual-review-ready glow | locked closed, no success cue |
| `station-treasury-chest` | Treasury | chest closed idle | ledger/key inspection | coin-lock packet arrives | ready-for-human plaque glow | hard lock chain |
| `station-roman-build-bench` | Roman | tool bench idle | blueprint/build loop | implementation packet docks | build-report-ready banner | local failure/blocker marker |
| `station-qa-shield-rack` | Roman | shield rack idle | shield/lens inspection | report tablet arrives | QA-ready shield glow | failed-check crack marker |
| `station-gateway-console` | Gateway | beacon idle | relay baton/beacon pulse | internal dispatch packet docks | draft-ready glow | no automated send lock |
| `station-discord-draft-scroll` | Gateway | guarded scroll idle | draft review movement | message draft scroll arrives | draft prepared, unsent | manual-only send lock |
| `station-lounge-couch` | Rest | calm warm idle | agent sits/rests | rest token arrives | refreshed idle marker | unavailable/rest-needed cue |
| `station-food-water-table` | Rest | soft glimmer | small serving/restore loop | rest token docks | recharge-ready glow | no work/fake productivity state |

Station visual law:

- Stations communicate state with in-world props/effects, not dashboard widgets.
- `output-ready` means ready for local review or next safe route, not live external execution.
- `blocked-manual-approval` uses physical locks, gates, chains, wax seals, shrine locks, or closed doors.

## 6. Asset manifest contract

Downstream asset manifests must include these fields for every room, road, agent, packet, station, and effect:

```json
{
  "id": "agent-hermes-conductor",
  "family": "agent",
  "roomId": "olympus-command",
  "status": "candidate-only | approved-for-runtime | temporary-not-final | rejected",
  "assetPath": "generated-candidates/war-room/horizontal-mini-rooms-50f/agents/agent-hermes-conductor.sheet.png",
  "frameSizePx": { "w": 48, "h": 48 },
  "sheetGrid": { "columns": 8, "rows": 12 },
  "totalFrames": 96,
  "states": ["idle", "walk-north", "walk-south", "walk-east", "walk-west", "carry-packet-north", "carry-packet-south", "carry-packet-east", "carry-packet-west", "work-at-station", "talk-status", "rest-or-blocked"],
  "alphaRequired": true,
  "bakedTextAllowed": false,
  "routeSocketsGrid": [],
  "safeTextZonePct": null,
  "hitboxesPct": [],
  "reducedMotionStill": "first-frame-per-state",
  "externalActionPolicy": "no live external action; read-only/dry-run/draft/manual-only/approval-gated only",
  "promotionGate": "technical-art QA + visual QA + browser/layout QA + no-overclaim review"
}
```

Recommended candidate root:

- `generated-candidates/war-room/horizontal-mini-rooms-50f/rooms/`
- `generated-candidates/war-room/horizontal-mini-rooms-50f/roads/`
- `generated-candidates/war-room/horizontal-mini-rooms-50f/agents/`
- `generated-candidates/war-room/horizontal-mini-rooms-50f/stations/`
- `generated-candidates/war-room/horizontal-mini-rooms-50f/packets/`
- `generated-candidates/war-room/horizontal-mini-rooms-50f/effects/`
- `generated-candidates/war-room/horizontal-mini-rooms-50f/contact-sheets/`

Runtime/public promotion is not authorized by this contract alone.

## 7. Main screen acceptance checks

A downstream implementation passes this contract only if all checks pass.

### 7.1 Layout checks

- [ ] Exactly the 10 rooms above are visible in the first viewport without scrolling at normal desktop size.
- [ ] Every room is a horizontal rectangle; no room is square-first, circular, card-like, or a giant fantasy map island.
- [ ] Olympus Command is larger but remains horizontally biased and does not dominate more than 15% of atlas area.
- [ ] Every room has a visible blank plaque, one agent, and at least two room-specific station silhouettes.
- [ ] Labels/status text are live overlays on plaques, not baked into generated images.
- [ ] Obsidian/navy outside world is visible around the layout.

### 7.2 Road/topology checks

- [ ] All room door sockets align to the segment endpoints listed in section 3.
- [ ] Corridors use paved road/bridge/threshold assets, not abstract SVG connector lines.
- [ ] Every route has a known source room, target room, packet type, route id, and progress value.
- [ ] `route-command-to-treasury` visibly terminates at a manual approval lock/gate when approval is required.
- [ ] Reduced-motion mode preserves source/target socket highlights without animated travel.

### 7.3 Animation checks

- [ ] Each room agent manifest declares at least 50 frames; target sheets declare 96 frames.
- [ ] Cardinal walk directions N/S/E/W are present and legible.
- [ ] Carry-packet motion exists for practical cardinal directions or an explicitly temporary fallback is labeled.
- [ ] Work animation is station-specific per room.
- [ ] Rest Room shows real rest/recharge states, not fake work.
- [ ] First frame of every state reads correctly as the reduced-motion still.

### 7.4 Tool/station checks

- [ ] Every station has idle, active-work, packet-received, output-ready, and blocked/manual states.
- [ ] Station effects are in-world prop/effect animations, not SaaS widgets.
- [ ] Live-action-sensitive stations show manual-only/locked states where relevant.

### 7.5 Safety and honesty checks

- [ ] No live shop/store/supplier/customer/account/paid action is enabled or implied.
- [ ] No Discord/external message is visually sent automatically; Gateway drafts remain guarded/manual.
- [ ] No production quality claim is made without generated assets, contact sheets, technical-art QA, browser QA, and no-overclaim review.
- [ ] If placeholders are used, the UI/docs mark them `temporary-not-final`.

## 8. Exit verdict

PASS: this document defines the final horizontal mini-room layout, exact road/bridge topology, 50+ frame per-agent animation law, per-tool/station animation requirements, manifest fields, and acceptance checks for the War Room main screen. It does not authorize production UI edits, runtime asset promotion, live external actions, or final quality claims without downstream evidence.
