# War Room V40 — cells + popup visual/action contract (6h focused run)

Created: 2026-06-13 02:29 IDT
Owner lane: artdirector
Task: `t_f8fe6bf5`
Status: PASS / art-direction contract only
Workspace boundary: `/Users/mac/hermes-workspace` only
Source contract read first: `docs/status/automation/war-room-v40-6h-focused-dev-team-run-20260613.md`

## Safety and scope

This is a visual/action contract for the implementation and asset lanes. It does not edit React source, generate or promote live assets, connect external services, or approve release.

All business/external systems remain `NOT_CONNECTED`, `local-only`, `read-only`, `draft-only`, or `approval-gated`. No Etsy/shop/supplier/publishing/paid-generation/account/message/order/refund/purchase/Discord/live external action is authorized.

## Locked product structure

Do not negotiate these during V40. Exact lock: main `/war-room` view = cells only. Do not edit React source from this artdirector card.

1. Main `/war-room` view is cells only.
2. The main board must not show an opened detailed room, decision panel, generic station dialog, source ledger, proof wall, or admin dashboard by default.
3. Clicking a cell opens one centered popup/modal room.
4. The popup contains the detailed room scene, agent/worker, station tools, packet/action path, station output, decision/approval state, and close control.
5. Closing the popup returns to the same cells-only main view.
6. If the implementation needs deeper station details, they open inside the centered popup, not as a new detailed room embedded in the main board.

## V40 north star

Turn the current beta cell shell into a practical AI-agent operating environment: a board of living departmental cells where each room visibly owns work, workers, packets, and safe local outputs; opening a cell feels like entering a compact command-room app, not reading a styled proof document.

Functional pass is not product-quality pass. V40 can be an intermediate slice, but it must visibly move away from beta CSS cards and toward asset-backed rooms, station-specific tools, and self-explanatory agent work.

## First-glance hierarchy

### Main cells-only board: 5-second read

The user should understand this in five seconds without reading a paragraph:

- This is a live AI-agent operating floor.
- Each cell is a room/team with a specific job.
- Work packets move between cells.
- Some work is safe/local/draft-only; external actions are locked.
- Clicking a cell opens its room.

### Popup room: 5-second read

After a cell opens:

- Which room am I in?
- Which worker/god is responsible?
- What is the worker doing now?
- Which station/tool is active?
- What concrete output is being produced?
- What is blocked until DLV approval?
- How do I close and return to cells?

## Main board visual contract — cells only, no beta shell

### Required cell anatomy

Each main-board cell must be a miniature room/cell, not a card. A cell needs:

1. Image/asset-backed room base or crop.
2. Small worker/operator presence inside the cell.
3. 1-3 visible station/tool silhouettes or props.
4. One packet/artifact marker if work exists.
5. A calm status light or rim state.
6. Short hover/focus plaque for the room name and current action.
7. Click/tap target over the whole cell.

### Main board layout

- Use cells as the dominant visual surface, not surrounding dashboards.
- Corridors/links should connect cells as physical/logical paths, not a flowchart overlay.
- Show only a compact live-run strip if needed; it must not steal the main hierarchy.
- No persistent right inspector, bottom proof dock, giant safety banner, or debug/source panel in the main state.
- Avoid one oversized focus cell plus many tiny unreadable cells unless the focus is a deliberate active-run mode. For V40, prefer balanced cells with one active emphasis, not a single Forge card swallowing the map.

### Main board text budget

Visible by default:

- Room name or very short role.
- Status: `working`, `queued`, `review`, `ready`, or `locked`.
- Packet count or one short action line.

Hidden until hover/focus/open:

- Full worker ids.
- Source/API/provenance details.
- Long packet titles.
- Safety explanation paragraphs.
- Debug route names and data attributes.

### Main board forbidden look

Fail any pass that looks like:

- CSS grid/dashboard cards.
- Proof wall / evidence wall / status report page.
- Trello/Kanban board.
- Admin console with KPI pills.
- Generic sci-fi dashboard / JARVIS monitor wall.
- Black-background particle demo.
- Flowchart with rectangles.
- Cell atlas where the room image is hidden by text overlays.

## Centered popup room contract

### Popup frame

- Centered overlay, fixed above the main board.
- Background behind popup darkens/blurs but still hints the cells board exists underneath.
- Popup should feel like a room viewport inside an ornate machine/window frame, not a flat modal card.
- Close control must be obvious, high-contrast, and consistently placed in the generated frame's close socket or a dedicated top-right/top-center close plaque.
- Maximum height should respect the Workspace footer/status bar; no critical lower tool/action should sit under the footer.

### Popup room anatomy

Each opened room should include:

1. Room scene/background image.
2. Agent/worker/god visible on the room floor or at station.
3. Station/tool props placed in-world.
4. Active station glow/use cue.
5. Packet/action trail from worker to tool or from source station to target station.
6. Output surface that shows the concrete artifact.
7. Safety/approval lock surface that names locked external actions.
8. Close control.

### Popup room should not include

- A generic repeated three-column cockpit for every station.
- A big text wall explaining the architecture.
- Raw API JSON or source ledger by default.
- Multiple competing close buttons.
- Main-board style decision panel outside the popup.
- Browser/admin screens as the dominant visual.

## Station/tool motifs by room

These motifs should guide assetcreator and integration. The point is for each station to have a distinct job and visual metaphor.

### Olympus Command / mission control

Purpose: route autonomous work safely.

Motifs:

- Council War Table: campaign table with routes, local mission tokens, and review seals.
- Hermes Dispatch Beacon: messenger portal / routing pylon for worker assignments.
- Gateway Console: mythic gate altar showing local gateway health, not a server dashboard.
- Aegis Approval Seal: shield/shrine for anything requiring human approval.
- Mission Archive Pedestal: sealed archive stand for prior runs, screenshots, and decisions.

Concrete output surface:

- `Mission packet`: goal, owner, current worker, next safe local action, review needed.

Forbidden:

- Kubernetes/server-dashboard look.
- Raw logs as main visual.
- Live connector toggles.

### Pantheon Quarters / agent roster and training

Purpose: show agents as workers and roles, not generic avatars.

Motifs:

- Agent Chambers: small sleeping/working pods for worker profiles.
- Roster Board: role assignment wall with empty plaques.
- Review Table: peer-review surface.
- Training Yard: skill/practice area.
- Model Statues: model/provider identity as statues, not billing controls.

Concrete output surface:

- `Worker assignment packet`: assignee, model/profile, current job, quality rule, review state.

Forbidden:

- Circular avatar grid.
- Generic profile cards.
- Provider-key/billing controls.

### Agora of Opportunity / product-intelligence intake

Purpose: turn market/product signals into reviewable opportunity packets.

Motifs:

- Idea Stalls: candidate baskets/scrolls.
- Competitor Board: market comparison map with empty markers.
- Alura/Etsy Counter: read-only signal counter, not a live marketplace screen.
- Niche Scroll Rack: keyword/niche archive.
- Shop Expansion Stalls: only draft concepts, no live shop action.

Concrete output surface:

- `Opportunity packet`: input signal, score/heuristic status, uncertainty, next proof needed.

Forbidden:

- Real Etsy listing editor.
- Product cards implying ready-to-publish.
- Unverified supplier/SEO claims presented as final truth.

### Oracle of Signals / keyword and trend analysis

Purpose: read signals and produce warnings or ranked queues.

Motifs:

- Signal Pool: glowing pool with ranked ripples.
- Keyword Crystal: one clear query/output artifact.
- Trend Stars: constellation of market movement.
- Stats Observatory: telescope/astrolabe, not spreadsheet grid.
- Alert Bell: warning/approval omen.

Concrete output surface:

- `Signal packet`: keyword, source, confidence, competitor/risk note, recommended next room.

Forbidden:

- Overstuffed charts or fake graphs baked into assets.
- Claims that generic keywords are product approval.

### Forge of Hephaestus / creative production and local tools

Purpose: convert approved/local inputs into draft artifacts and tool-specific outputs.

Motifs:

- Prompt Anvil: source brief -> prompt mold -> variants -> approval seal.
- Model Bellows: route selection and fallback plan, no provider/billing mutation.
- Sorting Rack: compare variants with reject/hold/winner zones.
- Listing Easel: draft-only listing preview, missing-input checklist.
- Skills Forge: skill file/workflow improvement with backup/review state.
- Approval Shrine: spend/live/shop lock.

Concrete output surface:

- `Draft artifact packet`: source brief, generated/local draft, variants, blocked actions, next handoff.

Forbidden:

- Generic cockpit tabs.
- Same station UI for every tool.
- `Premium Station Cockpit` copy.
- Fake paid generation button.

### Merchant Harbor / supplier and sourcing proof

Purpose: read supplier evidence and risks without contacting or buying.

Motifs:

- AliExpress Pier / Alibaba Dock: ship docks with crates tagged as read-only evidence.
- Supplier Ledger: provenance tablet, not a live supplier inbox.
- Customs Risk Gate: locked risk gate.
- Trade Winds Route Board: shipment/route sketch.
- Quality Inspection Table: evidence magnifier and reject tray.

Concrete output surface:

- `Supplier proof packet`: source links, material uncertainty, minimum order/price if known, risks, next human choice.

Forbidden:

- Supplier message composer.
- Purchase button.
- “verified” unless a separate supplier verification pass actually did it.

### Atlantis Vault / archive and database backbone

Purpose: canonical read-only archive/database room.

Motifs:

- Data Vault Index: searchable shelf/crystal index.
- Source Evidence Vault: screenshots/files locked behind visible cabinet doors.
- Decision Tablets: decisions/handoffs.
- Skill Relic Shelves: reusable lessons.
- Workflow Packet Pool: packet/handoff registry.
- Feedback Memory Loom: feedback links, not imperative memory spam.

Concrete output surface:

- `Archive packet`: records, provenance, linked rooms, current state, safe next use.

Forbidden:

- Raw SQLite/JSON dump as first view.
- File explorer only with no room metaphor.

### Treasury of Commerce / money and locked live actions

Purpose: protect spend, margins, and paid operations.

Motifs:

- Margin Chest: profit/margin note.
- Cost Scales: cost comparison.
- Ad-Spend Gate: locked paid action gate.
- API Usage Meter: usage/cost guard.
- Revenue Ledger: read-only summary.
- Approval Vault: DLV decision safe.

Concrete output surface:

- `Commerce lock packet`: cost implication, risk, allowed local action, locked live action, DLV decision needed.

Forbidden:

- Anything that implies spend/ad/purchase/publish is enabled.

## Optional Dev Studio / self-working-team room

Use this only if it helps the product demonstrate “Hermes team working on itself.” It should not become a meta proof wall.

Room name options:

- Dev Studio
- Hermes Workshop
- Build Studio
- Engineering Cell

Recommended concept:

A centered popup room showing the autonomous dev team as a local-only work cell: planner, coder, asset worker, QA, reviewer, and release guard arranged around a build bench. Each worker owns a station and visible artifact. The cell explains the War Room's practical purpose by showing how this very run is coordinated safely.

Station motifs:

1. Planner Desk: scope and acceptance criteria.
2. Code Bench: local implementation queue; no commit/push.
3. Asset Table: candidate assets and contact sheets.
4. QA Lens: screenshots, console/build gates.
5. Review Gate: no-live/no-overclaim checklist.
6. Release Handoff Shrine: status docs and blocked/live-action locks.

Concrete output surface:

- `Self-working team packet`: current lane, artifact path, QA gate, blocker/review state.

Required safety copy:

- `LOCAL ONLY`
- `NO GIT COMMIT/PUSH/RESET`
- `NO LIVE CONNECTORS`
- `REVIEW BEFORE CLAIMING PRODUCT QUALITY`

Forbidden:

- Showing real credentials, raw terminals, user chats, Discord messages, or live external dashboards.
- Making the team room the main board default. It is one cell like the others.

## Concrete station-specific action surface contract

Every station popup/tool must answer these, in this order:

1. Source/input: what record, packet, brief, keyword, candidate, or task is being used?
2. Work action: what is the worker/tool doing now?
3. Output: what concrete artifact or decision packet is produced?
4. Variants/options: what choices are available locally?
5. Risk/lock: what cannot happen without DLV approval?
6. Next handoff: which room/station receives the output?
7. Ask/direct field or local action buttons, if implemented, must update local visible state only.

Recommended station action verbs:

- Inspect
- Stage draft
- Compare
- Route
- Queue for approval
- Save local note
- Open read-only context
- Ask worker

Forbidden station action verbs unless explicitly approved by DLV in a later live-action gate:

- Publish
- Buy
- Order
- Message supplier
- Message customer
- Refund
- Renew
- Edit live listing
- Charge
- Spend
- Send to Discord
- Enable connector

## Motion contract

Motion should communicate work, not decorate randomly.

Allowed:

- Slow packet movement along explicit source -> target corridor.
- Worker/god walks from current position to station operator spot.
- Station-specific use cue: sparks at anvil, scan sweep at sorting/lens, seal pulse at approval, pool ripple at signal, gate glow at treasury.
- Calm cell breathing only if it does not make the board feel buggy.

Disallowed:

- Random objects flying everywhere.
- Flappy/bird motion that is not tied to a workflow.
- Worker snapping back through room center after a click.
- Constant jitter that makes the app feel broken.
- Animating text/proof panels instead of room objects.

## Asset contract for V40 implementation lanes

Assetcreator/technicalartist should prefer candidate files under:

- `public/war-room/v40/` for assets intentionally staged for local app use.
- `generated-candidates/war-room/v40-6h/` for candidate-only pieces not integrated yet.
- `docs/status/assets/` or `docs/status/asset-registry-handoffs/` for provenance/contact sheets.

Desired V40 candidate asset families:

1. Main cell frame/edge overlays: room-specific, text-free, 16:9 or scalable frame slices.
2. Centered popup room frame: text-free frame with close socket and safe zones.
3. Station prop/icon set: transparent PNG/SVG, one per tool, no baked text.
4. Worker/operator tokens: transparent, small, floor-compatible; no CSS circles as final.
5. Packet/action effects: small artifact icons, corridor glows, handoff seals.
6. Optional Dev Studio assets: planner desk, code bench, asset table, QA lens, review gate, release shrine.

Candidate quality gates:

- Separate files, not one collage.
- No baked readable text or gibberish.
- No opaque matte on transparent assets.
- No browser/admin/dashboard screens.
- No external/live action claim.
- Coordinates/safe zones documented in a handoff manifest before integration.

## Negative rules that prevent CSS-card/proof-wall regression

Fail a V40 pass if any of these happen:

- The main `/war-room` state shows a detailed room panel instead of cells-only.
- A centered popup opens but the main board also shows the same detailed room underneath.
- The visual foundation is mostly Tailwind rectangles, pills, cards, or gradients.
- Long text/proof/source panels dominate the first viewport.
- Safety copy becomes a giant banner instead of a visible lock/shrine/gate plus short label.
- Station popups all reuse the same generic shell and only change title text.
- Worker/god is hidden, tiny beyond recognition, or replaced by CSS status dots only.
- Packet movement is decorative and not tied to source/target room/station.
- Raw ids, data keys, API endpoints, source paths, or logs are visible by default.
- The UI implies external connectors are live or actions can publish/buy/message/spend.
- The team reports premium/final quality after only build/DOM checks.

## Acceptance criteria for V40 implementation lanes

Minimum acceptable visible slice:

1. Main board: 6+ cells visible, cells-only, no opened detailed room/decision panel by default.
2. One room popup: centered modal with room asset/frame, close control, worker, stations, and useful output area.
3. One station: unique station-specific surface with source/input, concrete output, local actions, safety lock, and next handoff.
4. One action animation: worker/tool/packet movement tied to the selected station or packet.
5. One safety proof: visible `NOT_CONNECTED` / `draft-only` / `read-only` lock, not a live action.
6. QA: build, route HTTP check, browser click main cell -> popup -> station/action -> close, console clean.
7. Reporting: explicitly separate functional pass from product-quality score.

Stretch acceptable slice:

- Dev Studio cell added as a self-working-team room with planner/coder/asset/QA/review stations.
- Two station-specific surfaces in different rooms.
- Packet route source -> target visual in both main board and popup.
- Asset registry/provenance attached for every new visual piece.

## Product-quality score guide

Use this scoring language during QA/release:

- 0-30: Broken/proof wall; not an operating environment.
- 31-50: Functional beta; cells/popup structure exists but still card-like.
- 51-65: Useful intermediate; visible room/worker/station/output/action, but not show-off quality.
- 66-80: Strong local vertical slice; asset-backed, understandable, practical, safe, still not final.
- 81-90: Demo-worthy; multiple unique rooms/tools, clean motion, strong art direction, safety clear.
- 91-100: Premium/show-off; requires visual QA against references and cannot be claimed in this planning contract.

For this 6h run, target `51-65` honestly first. Do not call it premium unless visual QA proves it.

## Handoff to child lanes

### Asset Creator (`t_91593918`)

Use this contract to create candidate assets for:

- centered popup frame;
- cell frame/room crop treatment;
- station/tool motif kit;
- packet/action effects;
- optional Dev Studio motifs.

Prioritize assets that remove the beta CSS-card feeling without forcing a full React rewrite.

### Technical Artist

Normalize assets into safe paths/manifests and provide:

- dimensions;
- alpha/matte status;
- safe text zones;
- close socket;
- hitbox suggestions;
- operator slots;
- reject notes for any weak candidate.

### Integrator

Do not change the locked structure. Integrate one visible vertical slice at a time:

1. Preserve main cells-only board.
2. Replace card-like surfaces with asset-backed frames/crops.
3. Center popup room only on click.
4. Add one unique station surface and one visible action path.
5. Keep all external actions disabled.

### QA / Review

Test the exact chain:

- `/war-room` loads cells-only.
- Click cell opens centered popup.
- Click station/action shows visible local state change.
- Close returns to cells-only main.
- Console clean.
- No live connector/action enabled.
- Report functional pass and product-quality score separately.

## Final note

V40 should feel like a practical local operating system for AI agents: rooms are teams, stations are tools, packets are work products, and approval gates are physical locks. If a proposed change cannot be explained in that language, it probably belongs in a hidden inspector or status doc, not in the first visible War Room surface.
