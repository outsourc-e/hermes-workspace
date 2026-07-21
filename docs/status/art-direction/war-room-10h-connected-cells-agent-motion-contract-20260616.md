# War Room 10h — connected cells + agent motion art/animation contract

Created: 2026-06-16 23:43 IDT
Owner lane: artdirector
Task: `t_015cf3e9`
Status: PASS / art-direction contract only
Workspace boundary: `/Users/mac/hermes-workspace` only
Source contract read first: `docs/status/automation/2026-06-16-war-room-10h-event-driven-run-contract.md`
Prior art direction incorporated: V40 cells/popup contract and Phase 10 unit asset contract.

## 0. Scope and safety locks

This document is a contract for downstream asset, technical-art, and implementation lanes. It does not edit React source, integrate runtime assets, generate paid assets, connect external systems, or approve release. No React implementation in this card.

Hard locks for this 10-hour run:

- No live Etsy/shop/supplier/publishing/paid-generation/account/message/order/refund/purchase/Discord/external actions.
- All store/tool connector visuals must remain `NOT_CONNECTED`, `READ_ONLY_READY`, `DRY_RUN_ONLY`, `draft-only`, or `approval-gated`.
- No UI, prop, route, packet, or animation may imply that publishing, buying, messaging, charging, spending, renewing, refunding, or live connector enablement is available.
- No final/premium/show-off quality claim from this contract alone. Visual proof, asset QA, browser QA, and no-overclaim review are required before stronger claims.

## 1. North star

The main War Room should read as a living connected cell atlas: an autonomous AI-agent operating floor where rooms are specialized teams, corridors carry work packets, workers move with purpose, and approval locks physically prevent unsafe actions.

A user should understand this before reading detailed labels:

1. The map is made of connected rooms/cells, not dashboard cards.
2. Each room owns a job, worker family, station tools, and output surface.
3. Corridors are workflow routes, not decorative lines.
4. Packets/scrolls/runners move from source room to target room according to local workflow state.
5. Clicking any room opens a full room popup; the main board remains cells-only underneath.
6. Live external action is locked unless DLV explicitly approves it later.

## 2. Room/cell visual hierarchy

### 2.1 Main atlas hierarchy

The main `/war-room` view must be dominated by the connected cell atlas.

Primary visual layer:

- Room/cell silhouettes with architectural depth, walls, floors, entrances, and small in-world props.
- Physical corridor network between rooms.
- Moving workers and packet tokens on routes.
- Short status locks/lights on cells.

Secondary visual layer:

- Short room labels and one short action/status line.
- Hover/focus plaque for longer room name and current packet.
- Compact run strip only if it does not compete with the atlas.

Hidden until hover/focus/open:

- Raw task ids, source paths, API endpoints, JSON, logs, long packet titles, evidence walls, and connector details.

Forbidden as first-read hierarchy:

- KPI dashboard, proof wall, Trello/Kanban board, admin console, generic SaaS cards, generic sci-fi monitor wall, or CSS grid with text as the main visual substance.

### 2.2 Cell anatomy

Every visible cell should include these elements, even if some are tiny in the first slice:

1. Asset-backed room base/crop or illustrated frame.
2. Entry/exit sockets for corridors.
3. One room-specific station silhouette or prop cluster.
4. One visible worker/operator or idle worker slot.
5. One packet/output marker if work exists.
6. One safety/status state: `working`, `queued`, `review`, `ready`, `locked`, `not-connected`, or `draft-only`.
7. Click target covering the whole cell with accessible name.

### 2.3 Room grouping and scale

Recommended atlas grouping for this run:

- `olympus-command`: central routing / mission control anchor.
- `pantheon-quarters`: agents/roles/training.
- `agora-opportunity`: product-intelligence intake.
- `oracle-signals`: keyword/trend/signal analysis.
- `hephaestus-forge`: creative/local tool production.
- `merchant-harbor`: supplier/sourcing proof, read-only only.
- `atlantis-vault`: archive/database backbone.
- `treasury-commerce`: spend/live-action locks.
- Optional `dev-studio`: self-working local development cell.

Scale rule: the central anchor may be slightly larger, but no single room should swallow the map. The connected atlas must still feel like a complete operating floor.

## 3. Corridor and route visuals

### 3.1 Corridor language

Corridors should look like physical/logical routes in the War Room world:

- Bronze/stone channel, illuminated floor groove, conveyor trough, aqueduct-like signal channel, messenger walkway, or map route ribbon.
- Source and target sockets visibly connect to room entrances.
- Route state should be clear without long labels.

Route states:

| State | Visual treatment |
| --- | --- |
| `idle` | dim bronze/stone path, low contrast |
| `queued` | small pulsing packet at source socket |
| `moving` | packet/runner travels along highlighted segment |
| `review` | route ends at seal/checkpoint before target station |
| `blocked` | route interrupted by gate/chain/seal, no fake motion |
| `complete` | brief calm arrival glow, then settles to idle/archive marker |

### 3.2 Route types

Use these named route families in manifests and code handoffs:

- `mission-route`: conductor/assignment packets from Olympus Command to a worker room.
- `signal-route`: signal/keyword packets from Oracle to Agora or Command.
- `draft-route`: artifact drafts from Forge to Command/review.
- `proof-route`: evidence packets from Merchant Harbor or Vault to review/approval.
- `lock-route`: commerce/external action packet ending at Treasury approval lock.
- `archive-route`: completed or rejected packet moving to Atlantis Vault.

### 3.3 Forbidden corridor behavior

Reject any implementation where:

- Lines float above cells like a flowchart overlay with no room entrances.
- Packets move randomly or continuously with no source/target meaning.
- Routes imply live publication, purchase, messaging, or paid generation.
- Motion obscures labels, close controls, or safety locks.

## 4. Agent/operator visual family

### 4.1 Family purpose

Agents are small operating-floor workers, not avatars or chat bubbles. They should make the workflow legible: who owns a packet, where they are going, and whether they are working, reviewing, blocked, or archiving.

Preferred style for this run:

- Cohesive historical strategy / GBA-readable unit family.
- Three-quarter top-down or shallow-orthographic facing compatible with the atlas.
- Clean silhouette, controlled palette, transparent background.
- Mythic/imperial command cues through hats, capes, sashes, tools, shields, scrolls, and seals.
- No baked text, logos, task ids, dashboard badges, or fake metrics.

### 4.2 Operator roles

| Role token | In-world read | Primary use |
| --- | --- | --- |
| `mission-runner` | messenger/courier with scroll tube | packet handoff along corridors |
| `planner-advisor` | map advisor with pointer/scroll | planning/spec/route decisions |
| `builder-general` | commander/builder with banner/tool | implementation/local build work |
| `qa-captain` | inspector with lens/check scroll | browser/build/visual QA |
| `review-marshal` | senior reviewer with seal | no-overclaim/safety review |
| `forge-artisan` | craft worker with anvil/tool | asset/prompt/local artifact work |
| `gate-warden` | shield/lock sentinel | blocked/approval-required/live-action lock |
| `archive-scribe` | scribe with tablet | save/archive/provenance state |

### 4.3 Operator states

Required state vocabulary:

- `idle`: calm, readable stand pose at room/station.
- `walk-n`, `walk-e`, `walk-s`, `walk-w`: 4-direction route movement when practical; 2-direction fallback allowed for first slice.
- `carry-packet`: visible scroll/crate/orb handoff token.
- `work`: station-specific work pose.
- `review`: inspection/QA pose.
- `blocked`: stopped pose with gate/seal/wait cue.
- `approval-required`: worker points or faces toward lock shrine/Treasury/Command seal.
- `complete`: calm stamp/archive pose.

Reduced-motion rule: the first frame of every animation must communicate the state without relying on motion.

## 5. Sprite/token frame requirements

### 5.1 Minimum for first integrated motion slice

One worker family may be enough for the first implementation slice if it is clean and purposeful.

Minimum first slice:

- `mission-runner` or `qa-captain` token.
- Transparent PNG/WebP or CSS-sprite-compatible sheet.
- `idle`: 1-2 frames.
- `walk`: 4 frames in one direction, or 2 frames if time is tight.
- `carry-packet`: 1-2 frames or carried overlay token.
- `blocked` or `approval-required`: 1 still frame.
- Dimensions documented in manifest.
- Safe padding documented so route motion does not clip.

### 5.2 Practical target if time allows

Practical 10-hour target for asset lanes:

- 1 atlas-scale runner family: 32x32 or 48x48 logical display footprint, 4-8 frame walk loop.
- 1 room-popup operator family: 64x64 or 96x96 logical display footprint, 4-frame idle and 4-frame work/review loop.
- 3 packet tokens: scroll, crate/artifact, lock-seal.
- 3 effect sprites: corridor glow, station pulse, approval seal pulse.

### 5.3 Sheet layout contract

Use predictable row names in manifests even if a generated sheet itself has no text:

- Row 1: `idle`
- Row 2: `walk-east`
- Row 3: `walk-west`
- Row 4: `carry-packet`
- Row 5: `work-or-review`
- Row 6: `blocked-or-approval-required`

If the asset is a folder of separate frame files instead of a sheet, use frame names like:

- `agent-mission-runner__walk-east__f01.png`
- `agent-mission-runner__walk-east__f02.png`
- `agent-mission-runner__carry-packet__f01.png`
- `agent-gate-warden__approval-required__f01.png`

## 6. Packet, scroll, and runner animation requirements

### 6.1 Packet objects

Packets are the core visual language for backend/control-spine data. A packet can be a scroll, sealed tablet, artifact crate, crystal, route token, or lock-seal depending on room type.

Packet types:

| Packet id | Visual | Meaning |
| --- | --- | --- |
| `mission-packet` | sealed scroll/tablet | task assignment or next safe local action |
| `signal-packet` | crystal/ripple token | keyword/trend/source signal |
| `draft-artifact-packet` | small crate/easel bundle | local draft output |
| `supplier-proof-packet` | tagged crate/evidence tablet | read-only supplier proof/risk |
| `commerce-lock-packet` | locked coin/seal | cost/live-action decision, locked |
| `archive-packet` | stone tablet/book | saved provenance/result |
| `review-seal-packet` | stamped seal/check lens | QA/review state |

### 6.2 Motion grammar

Allowed motion:

- Packet travels from source room socket to target room socket.
- Runner carries packet and pauses at route checkpoints.
- Station use cue appears only at the active station: anvil sparks, scan sweep, seal pulse, pool ripple, gate glow.
- Arrival glow lasts briefly, then settles.
- Blocked packet reaches a gate/seal and stops; it does not bounce or keep pretending progress.

Disallowed motion:

- Random floating objects, confetti, flying cards, decorative particles with no workflow meaning.
- Constant jitter or marquee animation that makes the app feel unstable.
- Text panels sliding around as the main action.
- Worker teleporting through room centers after clicks.
- Route motion while reduced-motion preference is active.

### 6.3 Reduced-motion fallback

Every animation must have a reduced-motion equivalent:

- Show source and target sockets highlighted.
- Place packet at current route progress or target checkpoint.
- Use one calm pulse or static glow, not looping travel.
- Keep worker in the state pose that explains the workflow.

## 7. Full room popup requirements

Clicking a room opens a centered full room popup. The popup must not become a generic modal card.

Popup anatomy:

1. Room background or frame asset.
2. Worker/operator at station or route entry.
3. 2-4 station props with coordinates.
4. Active station glow/use cue.
5. Packet/action trail inside the room.
6. Output surface for concrete local artifact/status.
7. Approval/safety lock surface.
8. Close control in a dedicated close socket.

Popup safe text budget:

- Room name.
- One active action line.
- Output label/status.
- Lock label such as `READ_ONLY`, `DRAFT_ONLY`, `NOT_CONNECTED`, or `APPROVAL_REQUIRED`.

Do not show raw JSON, full source ledger, raw ids, long logs, or connector credentials in the popup.

## 8. Asset manifest names and path discipline

### 8.1 Candidate-only paths

Generated or manually assembled candidates should start under:

- `generated-candidates/war-room/10h-connected-cells/atlas/`
- `generated-candidates/war-room/10h-connected-cells/rooms/`
- `generated-candidates/war-room/10h-connected-cells/agents/`
- `generated-candidates/war-room/10h-connected-cells/packets/`
- `generated-candidates/war-room/10h-connected-cells/effects/`
- `generated-candidates/war-room/10h-connected-cells/contact-sheets/`

Do not copy candidates into runtime/public paths until separate technical-art, visual QA, and integration gates pass.

### 8.2 Runtime-ready path names if later approved

If downstream gates approve local runtime integration, prefer these names:

- `public/war-room/10h/atlas/connected-cell-atlas-base.webp`
- `public/war-room/10h/atlas/connected-cell-atlas-overlay-routes.svg`
- `public/war-room/10h/rooms/room-olympus-command-shell.webp`
- `public/war-room/10h/rooms/room-hephaestus-forge-shell.webp`
- `public/war-room/10h/agents/agent-mission-runner.sheet.png`
- `public/war-room/10h/agents/agent-qa-captain.sheet.png`
- `public/war-room/10h/packets/packet-mission-scroll.png`
- `public/war-room/10h/packets/packet-commerce-lock.png`
- `public/war-room/10h/effects/effect-corridor-glow.sheet.png`
- `public/war-room/10h/effects/effect-approval-seal.sheet.png`

Runtime paths are recommendations only; this card does not authorize writing them.

### 8.3 Manifest names

Required manifest handoff names:

- `docs/status/art-direction/war-room-10h-connected-cells-agent-motion-contract-20260616.md` — this contract.
- `docs/status/asset-registry-handoffs/war-room-10h-connected-cells-asset-manifest.json` — candidate/approved asset index, if created later.
- `docs/status/asset-registry-handoffs/war-room-10h-connected-cells-safe-zones.json` — normalized hitboxes and text zones, if created later.
- `docs/status/assets/war-room-10h-connected-cells-contact-sheet.md` — visual proof/contact-sheet notes, if created later.

### 8.4 Manifest schema requirement

Every asset entry should include:

```json
{
  "id": "agent-mission-runner",
  "status": "candidate-only",
  "assetPath": "generated-candidates/war-room/10h-connected-cells/agents/agent-mission-runner.sheet.png",
  "family": "agent",
  "roomId": null,
  "dimensionsPx": { "w": 384, "h": 192 },
  "frameSizePx": { "w": 48, "h": 48 },
  "states": ["idle", "walk-east", "carry-packet", "blocked"],
  "alphaRequired": true,
  "bakedTextAllowed": false,
  "safeTextZonePct": null,
  "hitboxesPct": [],
  "motionPolicy": "workflow-only; reduced-motion still required",
  "externalActionPolicy": "no live external actions; read-only/dry-run/draft-only labels only",
  "promotionGate": "technical-art + visual QA + implementation contract required"
}
```

## 9. Safe zones and interaction coordinates

### 9.1 Atlas safe zones

For each cell, document:

- `cellBoundsPct`: full click target.
- `labelSafeZonePct`: short label/status text, maximum 1-2 lines.
- `workerSlotPct`: idle/operator position.
- `stationSlotPct`: visible room prop position.
- `packetSocketPct`: packet origin/arrival position.
- `routeSocketsPct`: normalized entrance/exit points.
- `lockBadgePct`: small safety/approval state.

Default safe-zone policy:

- Labels should sit on quiet floor/plaque areas, not over worker faces, station silhouettes, or route motion.
- Route lines and packet motion must not pass under close controls or major text.
- Lock badges should be physically attached to gates/shrines, not floating SaaS pills.

### 9.2 Popup safe zones

For each popup room, document:

- `closeSocketPct`: dedicated top/right frame socket.
- `titlePlaquePct`: room name only.
- `actionPlaquePct`: current action line.
- `outputSurfacePct`: concrete local artifact/output.
- `approvalLockPct`: locked/live-action safety surface.
- `stationHitboxesPct`: one entry per prop/station.
- `operatorSlotsPct`: idle, work, review, blocked positions.
- `packetPathPct`: source-to-station or station-to-exit route.

No generated asset should bake readable text into these zones. Text remains live HTML/SVG overlay for localization, accessibility, and truthful runtime state.

## 10. Temporary vs remake-later standards

### 10.1 Acceptable temporary in this 10-hour run

These may pass as temporary if clearly labeled and do not block workflow readability:

- One atlas base assembled from simple but room-like image/crop assets.
- One worker token family reused across multiple rooms.
- 2-frame walk loop before a full 4-8 frame loop exists.
- CSS/SVG route overlay if it aligns to real room entrances and does not become a flowchart.
- HTML text overlays for labels, status, and accessibility.
- Basic station glows/pulses implemented as CSS/SVG effects.
- Placeholder contact-sheet proof if asset generation is not complete.

### 10.2 Must be remade later

These are explicitly not final and must be remade before product-quality/premium claims:

- CSS rectangles/cards serving as the primary room/cell visual substance.
- Generic circular avatars, emoji, colored dots, or SaaS icons replacing operators.
- One-piece collage images with baked rooms, labels, workers, packets, and UI all flattened together.
- Any asset with readable/gibberish baked text.
- Any room where marketplace/shop/supplier/paid/live action appears enabled.
- Any route or motion that is decorative rather than tied to a real source/target workflow packet.
- Any popup that is a generic repeated dashboard shell with only title text changed.
- Any unit too small/noisy to read at atlas scale.

## 11. Downstream implementation acceptance criteria

Minimum acceptable connected-cells slice:

1. Main board shows 6+ connected cells, not a dashboard/proof wall.
2. At least one corridor route visually connects a source room to a target room.
3. At least one worker or runner moves purposefully on that route, or has a reduced-motion static equivalent.
4. At least one packet type is visible and mapped to backend/control-spine state.
5. Clicking one room opens a centered full room popup with room scene/frame, worker, station prop, output surface, safety lock, and close control.
6. No live connector/action is enabled or implied.
7. Browser QA verifies load, click room, observe popup, observe route/worker/packet state, close popup, console clean.
8. Report functional pass separately from visual/product-quality score.

Stretch slice:

- 8-9 cells connected.
- Two packet types and two route states.
- One popup station-specific work animation.
- Contact sheet and manifest for every staged asset.
- Reduced-motion mode verified.

## 12. Handoff notes by downstream lane

### Asset creator

Prioritize separate, modular, text-free files:

1. Main connected atlas base/cell frames.
2. Corridor route overlays/effects.
3. Mission runner or QA captain sprite/token family.
4. Packet icons: mission scroll, review seal, commerce lock.
5. One popup room shell/frame, preferably `olympus-command` or `hephaestus-forge`.

Do not generate a final all-in-one dashboard screenshot. Do not bake text. Keep candidates in candidate-only paths.

### Technical artist

Normalize and reject assets based on:

- Transparent alpha where required.
- No opaque matte around tokens/sprites.
- Dimensions and frame size documented.
- Safe zones and hitboxes documented.
- Route sockets align with cell entrances.
- Reduced-motion still frames exist.
- External/live-action safety labels remain live overlays, not baked claims.

### Integrator

Integrate only after scoped approval:

1. Preserve cells-only main board.
2. Use assets/manifest as visual layers; invisible HTML hitboxes are allowed for accessibility.
3. Keep external action flags disabled.
4. Drive routes/packets from typed local workflow/control-spine data, not random timers.
5. Keep fallback rendering honest if assets are missing.

### QA / no-overclaim review

Verify:

- Main board is connected cell atlas, not card grid.
- Route/worker/packet motion has source, target, and state.
- Popup opens/closes correctly.
- Safety locks are visible and true.
- No shop/supplier/paid/live action is active or implied.
- Visual score is reported honestly; do not call it premium/final unless visual QA evidence supports that.

## 13. Exit verdict

PASS: art/animation contract ready for connected main War Room cells and agent movement between rooms. This document defines the required hierarchy, corridors, operator family, frame requirements, packet/runner motion, manifest names, safe zones, and temporary-vs-remake boundaries for the 10-hour autonomous run.
