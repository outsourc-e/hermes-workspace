# Art Director War Room v1 Style Guard

Status: PASS constraints for Codex Phase 1 implementation
Owner: artdirector
Created: 2026-06-12
Scope: style guard only. No assets generated. No app code edited.
Inputs:
- `docs/status/vision/war-room-v1-build-spec.md`
- `docs/status/automation/war-room-professional-automation-sprint.md`

## 1. Implementation verdict

PASS for Codex UI work only if the first slice preserves a clean historical pixel strategy-map read: GBA/Pokemon-like readability, central war table, embodied small general/advisor units, real Kanban lifecycle state, and sparse progressive disclosure.

FAIL if the first read becomes a SaaS dashboard, glass admin panel, HD fantasy scene, JARVIS cockpit, temple-first Olympus chamber, or decorative room with no visible task movement.

## 2. Allowed placeholder language

PASS:
- Placeholder labels may say: `temporary placeholder`, `layout proof`, `state proof`, `fixture mission`, `mock locked approval`, or `non-final pixel shell`.
- Placeholder visuals may use simple low-detail pixel/tile blocks to prove map zones, movement lanes, station hierarchy, and state transitions.
- Placeholder task data may be real-shaped fixture data only when clearly labeled and traceable to the lifecycle mapper.
- Placeholder controls must stay locked/read-only for marketplace, shop, supplier, ShotLab, paid, account, and destructive actions.

FAIL:
- Do not describe placeholders as final art, polished v1, live automation, production visuals, or approved asset output.
- Do not use placeholder cards as the main product read.
- Do not bake fake screenshots, fake charts, gibberish UI text, or fake marketplace actions into the scene.
- Do not promote CSS/procedural/SVG/Pillow layout proofs as final runtime art without a later explicit art approval.

## 3. Forbidden visual drift

FAIL immediately if any of these dominate the viewport:
- Flat SaaS cards, card grids, KPI dashboards, generic admin tables, generic Tailwind panels.
- Glassmorphism, frosted panels, blurred neon cards, floating translucent widgets.
- HD fantasy clutter, bloom, smoke, particles, oversized monuments, dark low-contrast spectacle.
- JARVIS-first hologram wall, sci-fi cockpit, neon monitor command center.
- Temple-first Olympus shrine/chamber where mythology replaces the historical strategy board.
- Photoreal, painterly concept-art, generic 3D room, cinematic side-view composition.
- Agent representation as only circles, pills, avatars, halos, roster rows, or chat bubbles.

PASS only when the dominant read is: historical war table + strategy map + readable moving units + diegetic plaques/scrolls/markers.

## 4. Unit readability constraints

PASS:
- Units read as small generals/advisors at actual Workspace viewport size without zooming.
- Each followed unit has a distinct silhouette, facing/direction, and station relationship.
- Unit scale fits the tile grid and walkable lanes; it is not swallowed by props or text.
- Movement is legible and deterministic: queued/ready -> active work -> review/block/approval -> completed/superseded.
- Status effects are restrained: small pulse, route highlight, seal, or banner only when they clarify state.

FAIL:
- Tiny anonymous blobs.
- Decorative characters that do not map to assignee/status.
- Units hidden behind panels, monuments, bloom, smoke, or low contrast.
- Animation/effects that become more important than the unit path.

## 5. Tile/map hierarchy constraints

PASS hierarchy, strongest to weakest:
1. Central command table and followed mission path.
2. Followed general/advisor unit and current task marker.
3. Current active station or approval/block/review station.
4. Quiet background stations and inactive units.
5. Secondary inspection ledger/panel.

PASS map rules:
- Top-down or shallow isometric map surface remains the primary UI.
- Walkable lanes and station zones are visibly organized on a tile/grid-like structure.
- Default map text stays short: task id/short label, status, assignee/unit, station, urgent block/approval signal.
- Long titles, timestamps, run ids, parent/child links, comments, QA logs, and artifacts stay in hover/selection/focus/secondary detail surfaces.
- Text appears as diegetic plaques, scrolls, table overlays, map markers, banners, seals, or ledgers.

FAIL:
- Every lifecycle field shown with equal weight.
- Side panel or card grid becomes more important than the map.
- Background tasks compete with the followed mission path.
- Decorative floor/base has no clear lanes, stations, or movement affordances.

## 6. Screenshot QA checklist

For every Codex Phase 1 screenshot, mark PASS/FAIL:

- First read is historical pixel strategy war room, not SaaS/glass/JARVIS/HD fantasy.
- Camera reads top-down or shallow isometric.
- Central war table is visually primary.
- At least one small general/advisor unit is readable at actual viewport size.
- One mission marker/scroll shows short task id/title/status in a diegetic surface.
- A visible path or station change communicates lifecycle movement.
- QA/review, blocker, approval, or completed state has a distinct spatial map location.
- Risky/live actions appear only as locked command-table approval objects.
- No enabled shop/supplier/ShotLab/paid/destructive action controls are visible.
- Background metadata is progressively disclosed, not all dumped on the map.
- No glassmorphism/card-grid/KPI/admin-dashboard dominance.
- Placeholders are labeled temporary and do not dominate the first read.

## 7. Codex stop rule

Codex should stop and hand back for review if the fastest implementation path requires dashboard/card/glass UI, HD fantasy spectacle, or fake lifecycle claims. The acceptable prototype is less polished but spatially correct: readable tile map, embodied unit, central table, locked approval object, and real-shaped lifecycle state.
