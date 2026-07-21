# War Room v1 Phase 8 GBA Historical Strategy Style Contract

Status: artdirection / visual contract only
Owner lane: artdirector
Date: 2026-06-12
Scope: documentation-only. This contract does not implement code, generate assets, approve release packaging, or authorize live actions.

## 1. Product read in one sentence

War Room v1 must read first as a clean GBA/Pokemon-like historical strategy command map: a central war table anchors the screen, one real `local-hermes-kanban` mission path is followed through the lifecycle, background tasks become quiet map markers, and proof/details appear only when a mission or station is selected.

## 2. First-read hierarchy

1. Central war table / map first
   - The first visual read is the central war table inside a top-down/isometric mission map, not a header, proof panel, status grid, or dashboard shell.
   - The command table is where active mission focus, locked approval seals, and DLV decision packets collect.
   - Safety copy remains visible in-world: Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED.

2. One followed real mission path second
   - Pick one real `local-hermes-kanban` task as the followed mission.
   - Show its route as a readable path through stations: intake -> assignment -> active -> QA/review -> blocker/approval/remediation/archive as applicable.
   - The followed path may have the strongest color, route arrows, seal, unit motion, and short plaque label.

3. Quiet background lifecycle markers third
   - Other tasks stay as subdued pins, scrolls, flags, or ledger stamps at their current stations.
   - Background markers must not compete with the followed path or create a card grid.
   - Dense evidence, comments, run data, and completion proof stay collapsed until selection.

4. Proof/details only on selection
   - Selection can open a ledger/plaque/scroll inspector with task id, title, status, assignee, run/comment/block/completion evidence.
   - The inspector is secondary. It must never become the dominant first-read surface.

## 3. GBA / historical strategy visual language

- Tile readability: use clear walk lanes, simple station footprints, visible route bends, and small readable objects with pixel-grid discipline.
- Historical unity: Rome, Greece, Napoleon, and Asia/East influences must share one material system: warm parchment stone, aged brass/gold, muted imperial reds, ink browns, jade/teal accents only for signal layers.
- Small general/advisor units: agents are embodied as compact strategy units, not avatars, blobs, pills, circles, or roster rows.
- Restrained palette/effects: premium through coherence, silhouette, and spacing; avoid noisy bloom, heavy particle fog, dark clutter, HD-2D spectacle, or sci-fi monitor dominance.
- Diegetic labels: replace SaaS labels with plaques, wax seals, mission scrolls, route banners, carved station signs, and victory ledgers.
- JARVIS layer: allowed only as subtle intelligence annotations, omen strips, or faint pulses that support the historical map. It must not turn the scene into a futuristic cockpit.

## 4. `local-hermes-kanban` source-to-visual mapping

| Source field / evidence | Visual treatment | First-read rule | Selection / proof detail |
|---|---|---|---|
| task id | Tiny mission code on scroll edge, route tag, or ledger corner | Visible only for followed mission or selected marker | Full id in ledger inspector and accessible text |
| task title | Short mission plaque; truncate to meaningful words | Followed mission only; background uses icon + short status | Full title in selected scroll/ledger |
| status | Station placement plus seal color: ready, running, blocked, done, canceled | Spatial station is stronger than text | Raw status value shown in selected proof |
| assignee | Small general/advisor unit identity near the mission | Unit silhouette/role first, name second | Full assignee/profile and lane role in ledger |
| run / current_run_id | Moving unit, work pulse, or station torch for claimed/running tasks | Motion only for followed or selected task | Run id, started time, heartbeat/staleness in proof ledger |
| comment evidence | Small note pin attached to mission scroll | Quiet unless selected | Comment excerpt, author/source, and timestamp in ledger |
| block reason | Red/orange decision lane marker or sealed stop ribbon | Distinct blocker zone; no noisy error wall | Exact human decision needed in selected scroll |
| approval / live-risk evidence | Central war table packet with wax approval seal | Always routed to central war table; live actions locked | Risk type, requested decision, locked action list |
| completion summary / artifacts | Archive/victory ledger stamp | Quiet green/archive stamp after path resolves | Completion summary, verification, artifacts, parent/child links |
| source=`local-hermes-kanban` | Board provenance plaque at map edge | Must remain visible enough to prove real local source | Full source/live/degraded/task-count evidence in inspector |
| NOT CONNECTED safety copy | Carved safety banner/table rule | Always visible; not a dismissible toast | Explains no external/shop/supplier/ShotLab/API/account systems are connected |

## 5. Unit silhouette and movement rules

- Scale: units should read at small GBA strategy scale; one glance distinguishes commander, implementer, QA/reviewer, asset/prompt worker, and approval sentinel.
- Silhouette: use hat/helmet/cloak/banner/tool shapes rather than tiny text. Avoid abstract circles, generic user icons, or oversized character art.
- Deterministic placement: unit station and route derive from task lifecycle, assignee, run state, and selected/followed mission state. No random decorative wandering.
- Movement strength:
  - Followed or selected task: strongest route highlight and unit movement.
  - Active unselected tasks: subtle idle/work pulses only.
  - Background completed/blocked tasks: still markers; no competing animation.
- Lifecycle motion examples:
  - ready -> assignment: unit waits beside assignment dais.
  - claimed/running -> active: unit walks to active work station.
  - review-required -> QA/review: unit escorts mission to QA inspection table.
  - blocked -> decision lane / command table: unit stops with sealed decision ribbon.
  - approval/live-risk -> central war table + approval seal: packet rises to table and locks.
  - completed -> archive: mission receives ledger stamp and unit returns idle.
- Reduced-motion fallback: disable travel animation but keep deterministic station placement, route line, seal/status color, and selected mission emphasis.
- Accessibility: DOM/text hooks remain machine-readable for task id/title/status/assignee/source/lifecycle/station even when visual proof is collapsed.

## 6. Anti-slop negatives

Hard fail if the candidate direction reads as any of the following:

- no flat SaaS surface masquerading as parchment.
- no glassmorphism, frosted panels, neon cockpit, or generic futuristic dashboard dominance.
- no KPI/card grid dominance as the primary composition.
- no generic Tailwind admin table or evidence-card wall as first read.
- no dark clutter, low-contrast brown soup, unreadable pixel noise, or over-ornamented monuments.
- no one-piece baked final PNG as the interactive surface.
- no final art from CSS/procedural shapes; placeholders must be labeled temporary/prototype/reference-only.
- no live business-action controls, no enabled shop/supplier/ShotLab/API/account writes, and no War Room Kanban mutation controls.
- no random decorative motion unrelated to `local-hermes-kanban` lifecycle state.
- no claim of final product-quality PASS until visual QA and implementation gates record real evidence.

## 7. Candidate next implementation boundary

The next implementation card, if this contract is accepted, should be limited to visual hierarchy cleanup only:

- Keep Phase 7 `local-hermes-kanban` lifecycle semantics, source truth, DOM hooks, and read-only/no-write safety.
- Preserve the central command table station, lifecycle station mapping, approval locks, and NOT CONNECTED safety copy.
- Reduce proof-card dominance by making the map/central war table the first read, one followed mission path the second read, background tasks quiet, and proof ledgers selection-based.
- Do not change Kanban data access semantics, create/write/dispatch/complete/unblock/archive/approve tasks from the War Room UI/API, connect external systems, promote assets, or package a release.
- Do not generate final assets in this pass; use contract-compliant temporary placeholders only if they are explicitly labeled prototype/reference-only.

## 8. Acceptance notes for visual QA

A screenshot can pass this artdirection gate only if a reviewer can answer yes in under 30 seconds:

1. Is the central war table/map the first thing I see?
2. Can I follow one real `local-hermes-kanban` mission path without reading a proof wall?
3. Are background lifecycle markers quiet and secondary?
4. Do agent units read as small GBA historical general/advisor units with deterministic state?
5. Are labels/plaque/ledger/seal treatments diegetic rather than SaaS cards?
6. Is the NOT CONNECTED safety state visible and unambiguous?
7. Are proof details available without dominating the default screen?
8. Is there no flat SaaS, glassmorphism, KPI/card grid, generic Tailwind table, live action control, or one-piece baked final PNG?
