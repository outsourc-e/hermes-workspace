# Olympus Command visual QA checklist — anti-slop and browser method

Task: `t_082ffa62`
Scope: Olympus Command layered visual remake QA. This document is a method/checklist for later Prompt Architect, Asset Creator, Manifest Builder, Integrator, and QA cards. It does not approve any current asset and does not edit app code.

## Scope and safety lock

- Work only inside `/Users/mac/hermes-workspace` and Kanban board `warroom`.
- No Etsy, shop, supplier, AliExpress/Alibaba, ShotLab paid/live, publish, upload, purchase, message, order, refund, renewal, account, billing, or real API write action.
- Mock/theoretical business state must be visibly marked as mock, theory, draft-only, preview-only, locked, or not connected.
- CSS/React may place, mask, animate, label, and orchestrate generated layers. CSS/SVG/Pillow/procedural drawings are not acceptable final art.

## Olympus Command target

The scene must read in the first 5 seconds as a premium mythic Greek + JARVIS command bridge: obsidian/marble/antique gold/cyan Hermes signal glow, direct overhead or shallow orthographic camera, clear floor lanes, central command table, visible approval/safety lock shrine, Omen/JARVIS command loop, gateway/session pulse, and agent-routing meaning.

## Hard fail gates

Fail the candidate/card if any item below is true:

1. One-giant-PNG final scene
   - Floor, stations, labels, UI panels, workers, gods, safety state, and text are baked into one complete room image.
   - A full-scene image is used as final interaction substrate instead of temporary reference/contact sheet.

2. CSS/Pillow/SVG/procedural final art
   - Main room/stations are CSS gradients, div shapes, SVG doodles, Pillow-generated drawings, emoji/icons, glass cards, Tailwind panels, or other procedural placeholders.
   - Generated assets are tiny decorations inside a normal dashboard shell.

3. Baked text, gibberish, or fake UI
   - Any final image contains AI pseudo-text, misspellings, fake buttons, fake charts, fake dashboards, fake ecommerce screenshots, duplicate labels, or room-name drift.
   - Dynamic labels are not real HTML text placed on clean generated plaques/safe zones.

4. Station square-card crops
   - A prop/station/character is a rectangular card, thumbnail, background slab, or white/black/checkerboard box instead of an isolated transparent object.
   - Alpha exists technically but the crop visually remains a square card.

5. Wrong perspective/depth
   - Camera is deep 3/4, side-on, or distorted so Hermes/operators would slide on walls, float, or look pasted on.
   - Floor lanes and station surfaces cannot support top-down movement and placement.

6. Clipping/overlap/layout breakage
   - Important objects, labels, close buttons, station frames, command table, approval shrine, or Omen strip are clipped by viewport, Workspace chrome, sidebars, status bars, or each other.
   - Hit targets are visibly offset from objects or huge unrelated rectangles.

7. Missing safety locks
   - Approval/safety lock shrine is missing, too subtle, or visually disconnected from risky actions.
   - UI suggests real Etsy/shop/supplier/ShotLab/live business actions are connected, executable, or already performed.
   - Dangerous actions are not disabled/gated/preview-only/read-only.

8. Fake live shop/business action
   - Any browser/API flow appears to publish, purchase, message, refund, renew, upload paid generation, edit listings, connect stores, or change external state without explicit DLV approval.
   - Mock data is presented as live production state.

## Required layer checklist

For an Olympus Command implementation to pass, later cards should provide or reference these semantic layers/assets:

- `floor_base.png`: empty floor/walls only; no stations, labels, gods, UI controls, central table, sigils that block placement, carpets, or workflow content.
- Optional `wall_trim_or_border.png` / `floor_lane_markings.png`: subtle, non-cluttering, separate layers.
- `station_command_table.png`: transparent central command/routing table, no text.
- `station_approval_shrine.png` and/or `prop_approval_seal_locked.png`: transparent approval/safety lock layer.
- `frame_omen_strip.png`, `icon_omen_eye_or_caduceus.png`, optional `overlay_omen_signal_glow.png`: text-free command-loop frame/icon/glow.
- `station_gateway_obelisk.png`, `prop_session_beacons.png`, optional `overlay_gateway_pulse.png`: gateway/session pulse without real outbound action.
- `station_agent_routing_dais.png`, `prop_worker_tokens.png`, optional `overlay_assignment_path.png`: agent routing meaning without roster-card dashboard feel.
- `plaque_room_title.png`, `plaque_station_label_small.png`, optional `frame_mission_brief_panel.png`: text-free generated surfaces for HTML labels.
- Existing Hermes operator may be reused if scale/style works; new Hermes art requires a separate approved card and sprite/animation strip expectations.
- A room manifest/model must reference assets with coordinates, scale, z-index, hitboxes, label safe zones, close spots, and animation/state metadata.

## Asset QA method

1. Provenance
   - Confirm each final premium visual asset has a local path and handoff note showing ChatGPT premium/generated-asset origin.
   - Uploaded references/contact sheets must not be treated as final generated outputs.

2. File/layer inspection
   - Confirm deterministic semantic filenames and separate files for floor, station, prop, frame, overlay, character, and manifest.
   - For transparent props/stations/characters, verify alpha and dimensions from workspace root:

```bash
python3 - <<'PY'
from PIL import Image
from pathlib import Path
for p in Path('public/war-room').rglob('*.png'):
    im = Image.open(p)
    alpha = im.getchannel('A').getextrema() if im.mode == 'RGBA' else None
    print(p, im.size, im.mode, alpha)
PY
```

   - Alpha for floating objects should show real transparency, usually `(0, 255)`, and visual QA must still reject square-card crops/halos.

3. Visual inspection before integration
   - Check floor base alone first: empty, premium, top-down/shallow orthographic, clear walkable lanes, no baked props/text.
   - Check each station/prop alone on dark and light backgrounds for halos, boxes, crop slabs, text, and scale readability.
   - Do not continue to broad asset generation if the floor base fails.

## Browser/integrator QA method

Run from `/Users/mac/hermes-workspace` when app/source integration changes are in scope:

```bash
pnpm build
pnpm exec tsc --noEmit --pretty false
```

If known unrelated baseline type errors exist, capture the exact baseline note; do not hide new War Room errors behind it.

Browser route checks for later integrator cards:

1. Load the target route, normally `/war-room` and the Olympus Command room/state.
2. Check the browser console for new uncaught exceptions, hydration errors, failed asset loads, missing manifests, and 404 image URLs.
3. Click the primary path in scope: hub/entry -> Olympus Command -> a station/tool/dialog -> close/back.
4. Capture screenshot or browser-vision summary at actual viewport size.
5. Verify the first glance is premium environment-first, not dashboard/cards-first.
6. Verify visible layer behavior:
   - image assets have nonzero natural dimensions;
   - manifest layers align with visible objects;
   - labels sit on plaques/safe zones;
   - Hermes/operator scale matches floor depth;
   - command table, approval shrine, Omen strip, gateway pulse, and agent routing are visually discoverable.
7. Verify safety:
   - approval shrine/lock is visible;
   - dangerous business buttons are locked/read-only/draft-only/mock-only;
   - no live Etsy/shop/supplier/ShotLab connection or action was attempted.

Useful browser probes:

```js
Array.from(document.images).map(img => ({
  src: img.currentSrc || img.src,
  w: img.naturalWidth,
  h: img.naturalHeight,
  alt: img.alt
}))
```

```js
[...document.querySelectorAll('[data-war-room-layer], [data-room-id], [data-station-id]')].map(el => ({
  tag: el.tagName,
  id: el.dataset.warRoomLayer || el.dataset.roomId || el.dataset.stationId,
  rect: el.getBoundingClientRect().toJSON?.() ?? el.getBoundingClientRect()
}))
```

## QA handoff template

```markdown
Olympus Command visual QA result: PASS | FAIL | BLOCKED

Reviewed:
- Card(s): ...
- Route(s): ...
- Files/assets/manifests: ...

Evidence:
- Build/typecheck: ...
- Browser/console: ...
- Visual QA/screenshot: ...
- Layer/provenance/alpha proof: ...
- Safety: Etsy/shops/suppliers/ShotLab paid/live actions not connected; only mock/theoretical/read-only/locked UI.

Gate results:
- One-giant-PNG: PASS/FAIL — ...
- CSS/Pillow/SVG/procedural final art: PASS/FAIL — ...
- Baked text/gibberish/fake UI: PASS/FAIL — ...
- Station crops/transparency: PASS/FAIL/NA — ...
- Perspective/depth: PASS/FAIL — ...
- Clipping/hit targets: PASS/FAIL — ...
- Safety locks/fake live actions: PASS/FAIL — ...
- Premium first-glance browser look: PASS/FAIL — ...
- Console/route/build: PASS/FAIL/NA — ...

Required remediation if FAIL:
1. ...
2. ...
Assigned next role: Design Planner | Prompt Architect | Asset Creator | Manifest Builder | Integrator | QA/Supervisor
```

## Final rule

If any hard fail gate triggers, do not call Olympus Command visually done. Write focused remediation with exact failing asset/component/route and pass it back to the correct next role. QA must not quietly patch broad implementation and must not approve fake live business actions or non-modular visual shortcuts.
