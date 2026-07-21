# War Room visual remake QA checklist — anti-CSS-slop hard gates

Purpose: Visual QA gate for War Room layered ChatGPT asset implementation cards. This checklist is intentionally strict: a build that passes is not enough if the scene still looks like CSS/Tailwind/Pillow/procedural placeholder art, one giant pasted PNG, or a dashboard wrapped around a fantasy label.

Scope and safety boundary:
- QA work is read-only against the app unless a card explicitly asks for a small QA doc/script.
- Work stays inside `/Users/mac/hermes-workspace` and Kanban board `warroom`.
- No Etsy/shop/supplier/AliExpress/Alibaba/ShotLab paid or live connections, writes, uploads, purchases, publishes, renewals, messages, refunds, or account changes.
- Mock/theoretical business data is allowed only when visibly labeled as simulated, theory, draft-only, preview-only, or not connected.
- CSS/React may place, clip, animate, label, and orchestrate assets; CSS/SVG/Pillow/procedural drawings must not be accepted as final art.

## Required evidence packet for every visual QA card

A QA card cannot pass without this packet in its handoff/comment:

1. Card ids reviewed: implementation card id, upstream design/prompt/asset/manifest card ids when known.
2. Exact route(s) reviewed, for example `/war-room` and any room/station state.
3. Exact files/assets reviewed:
   - room/component files
   - manifest file(s)
   - generated asset paths under `public/war-room/...`
   - candidate/contact-sheet paths if assets are not integrated yet
4. Verification commands and raw result summary:
   - `pnpm build` when app files changed or route behavior depends on compiled code
   - `pnpm exec tsc --noEmit --pretty false` or scoped typecheck when relevant and feasible
   - route/API smoke when relevant
   - browser load and console check when visual UI was changed
5. Visual proof:
   - screenshot or browser-vision summary of hub/room/station path
   - at least one clicked primary interaction if the card wires UI
6. Safety proof:
   - explicit statement that no live Etsy/shop/supplier/ShotLab paid actions were connected or executed
   - proof that dangerous actions remain locked/read-only/draft-only if they are visible

## PASS/FAIL gates

### Gate 1 — ChatGPT-generated asset proof

PASS only if:
- Every final visible floor/room/prop/station/frame/character asset claimed as premium has a local file path and provenance note showing it came from the ChatGPT premium asset pipeline or an approved generated asset source.
- Asset creator handoff includes deterministic filenames and at least one QA image/contact sheet or screenshot.
- Uploaded/reference images are not mistaken for generated outputs.
- Candidate assets were downloaded through authenticated browser context when using ChatGPT image URLs.

FAIL if:
- The implementation claims final art but uses CSS gradients, SVG doodles, Pillow drawings, emoji, Lucide-style icons, HTML div shapes, or placeholder rectangles as the main visual asset.
- The only proof is “it looks generated” with no local asset path/provenance.
- A downloaded asset is actually a reference/upload/contact-sheet wrongly treated as final output.
- The card says ChatGPT will be used later while shipping procedural art now as final.

Required remediation:
- Block or fail the implementation with exact missing asset paths and request a focused asset-creator card.

### Gate 2 — Modular semantic layer separation

PASS only if final interactive scenes are built from semantic layers, preferably:
- `floor_base.png` — empty floor/walls only; no props, gods, labels, UI controls, central clutter, or baked workflow content.
- separate transparent `station_<name>.png` and `prop_<name>.png` files.
- separate character/agent assets or sprite strips.
- optional transparent effects/overlays.
- optional generated frame/panel assets.
- a room manifest with coordinates, scale, z-index, animation/hitbox metadata, and asset references.

FAIL if:
- A room is implemented as one giant PNG with all stations, labels, workers, UI, panels, and text baked in, except temporary references/contact sheets.
- Future interaction points cannot move independently because props/tools/characters are baked into the background.
- The app hardcodes many asset positions in JSX while a manifest was expected.
- Station state depends on visual objects that are not addressable as layers.

Required remediation:
- Request Asset Slicer / Manifest Builder card to split layers and create/repair the manifest before integration continues.

### Gate 3 — True transparency and crop quality for props/characters

PASS only if:
- All prop/station/character assets that should float over a floor are PNG/WebP with true alpha transparency.
- Pillow or equivalent file inspection confirms alpha channel and alpha extrema include real transparency, usually `(0, 255)` or equivalent.
- Dark/light proof or browser QA shows no baked checkerboard, white box, square card slab, halo, or leftover background fragments.
- Crops are tight enough to read as objects, not thumbnails.

FAIL if:
- A “transparent” prop is actually a square card/cell with a baked background.
- Browser view reveals checkerboard, white/black box, rough rectangular crop, or edge halos.
- The asset is technically RGBA but visually still looks like a card because the crop includes a slab/background.

Suggested verification command:
```bash
python3 - <<'PY'
from PIL import Image
from pathlib import Path
for p in Path('public/war-room').rglob('*.png'):
    im = Image.open(p)
    if im.mode == 'RGBA':
        print(p, im.size, im.getchannel('A').getextrema())
PY
```

### Gate 4 — Manifest-driven placement and interactions

PASS only if:
- Room/station coordinates, scale, z-index, hitboxes, labels, safe zones, close spots, and animation states come from a manifest or typed room model.
- Click targets align with visible tools/stations in browser QA.
- Labels/callouts sit in negative space or generated plaques; they do not cover important generated objects.
- Dialog/frame safe zones keep dynamic text away from ornate artwork and controls.

FAIL if:
- Coordinates are guessed and visibly offset from the asset.
- Click boxes are huge, rectangular, or unrelated to the visible object.
- Text floats over props/floor art in a way that makes the scene look like a dashboard overlay.
- Close buttons, labels, safety badges, or station details are clipped or hidden by Workspace chrome/status bar.

Required remediation:
- Request a focused manifest/hotspot QA card with DOM rects and screenshot evidence.

### Gate 5 — No baked gibberish text or fake UI in generated art

PASS only if:
- Final image assets are text-free or contain only approved, legible, intentional text.
- App labels are real HTML text over clean zones/plaques, not AI-baked gibberish.
- Generated frame/panel assets have empty readable zones for dynamic content.

FAIL if:
- Assets contain unreadable AI pseudo-text, misspelled room names, duplicate labels, fake buttons, fake dashboards, fake forms, fake UI text, fake product screenshots, or “ShotLab Forge” room-name drift.
- Baked labels conflict with actual app state or safety locks.
- Text overlaps art or sits on top of important generated objects.

Required remediation:
- Replace/regenerate textless asset or cover only with an in-world generated plaque/clean crop if the defect is small and does not look patched.

### Gate 6 — No one-giant-PNG final scene

PASS only if:
- A full-scene image is used only as a temporary reference, contact sheet, mood tile, or non-interactive background where the card explicitly says no layered interaction is final yet.
- Final room work can independently move, hide, animate, click, and replace floor, props, tools, characters, overlays, labels, and dialogs.

FAIL if:
- The final War Room scene is a single large ChatGPT image with HTML labels placed on top and no semantic layer model.
- The scene cannot support future station state, agent movement, safety locks, or prop replacement without regenerating the whole image.

Required remediation:
- Send back to asset slicing/manifest build; do not accept as final implementation.

### Gate 7 — Browser premium look / anti-dashboard-slop

PASS only if browser visual QA confirms:
- First glance looks like a premium living War Room / Olympus operations environment, not a generic SaaS dashboard or CSS grid.
- The main visual layer dominates; explanatory cards, status pills, feeds, and debug/prototype text do not crowd the scene.
- Rooms/cells/stations are readable at actual viewport size.
- Operators/agents/tools are proportional to the room and do not look like pasted stickers.
- Motion, if present, is purposeful and calm; no random flappy objects, jitter, or distracting CSS bobbing.
- Workspace fixed header/footer/sidebar controls do not hide key content.

FAIL if:
- It looks like Tailwind cards with fantasy words.
- The generated assets are tiny decorations inside a normal dashboard shell.
- There is obvious clipping, overlap, stale loader, unreadable labels, or broken perspective.
- Visual QA would not impress a non-technical guest in the first 5 seconds.

Required remediation:
- Fail with a screenshot/vision note naming the exact visible reason, not vague “needs polish”.

### Gate 8 — Console clean and route behavior

PASS only if:
- Target route loads without new runtime errors.
- Console has no new uncaught exceptions, React hydration errors, failed asset loads, or missing manifest errors.
- Primary click path works: hub → room/cell → station/tool/dialog → close/back, when that path is in scope.
- All reviewed image elements have nonzero natural dimensions unless intentionally lazy/unloaded and not visible.

FAIL if:
- The visual only appears after manual workaround not documented in the card.
- Console shows new app errors, missing files, broken imports, or 404 asset URLs.
- Buttons exist in accessibility tree but are visually hidden/clipped/nonfunctional.

Suggested browser probes:
```js
Array.from(document.images).map(img => ({src: img.currentSrc || img.src, w: img.naturalWidth, h: img.naturalHeight, alt: img.alt}))
```
```js
[...document.querySelectorAll('[data-war-room-layer], [data-room-id], [data-station-id]')].map(el => ({tag: el.tagName, id: el.dataset.roomId || el.dataset.stationId || el.dataset.warRoomLayer, rect: el.getBoundingClientRect().toJSON?.() ?? el.getBoundingClientRect()}))
```

### Gate 9 — Build/typecheck where relevant

PASS only if:
- `pnpm build` passes after app/source changes.
- Typecheck is run when the card touches types, manifests, data contracts, API contracts, or core components, or the handoff explicitly references a known unrelated baseline failure.
- Any skipped command has a clear reason.

FAIL if:
- The card changes app code but provides no build result.
- Type errors are introduced or hidden as “pre-existing” without evidence.
- Generated manifests/assets are referenced by code but build/SSR cannot resolve them.

### Gate 10 — Safety locks intact

PASS only if:
- All Etsy/shop/supplier/ShotLab paid/live actions remain locked, read-only, draft-only, mock-only, or theoretical.
- UI copy does not imply a real store is connected unless new explicit DLV approval exists.
- Buttons for dangerous actions are disabled, gated, or clearly marked as preview/local/draft.
- No credentials, tokens, account data, or private customer/order data are exposed in reports or screenshots.

FAIL if:
- Any card connects a live shop/store/supplier/paid generation route without explicit DLV approval.
- Any action can publish, purchase, message, refund, renew, upload paid generation, or modify external state.
- Mock data is presented as real production business state.

Stop condition:
- Block immediately if a task attempts a real external write or destructive command.

## Minimum QA paths by card type

### Design / prompt pack review
- Check prompts require separate semantic layers.
- Check prompts forbid baked labels/UI controls/gibberish text.
- Check prompts explicitly say references are style/quality only and not copy targets.
- Check the output paths and next partner needs are concrete.

### Asset creator review
- Confirm one ChatGPT tab/session discipline in logs when available.
- Confirm local generated asset paths and deterministic names.
- Confirm asset is not the uploaded reference.
- Vision-check premium quality and defects.
- For props/characters, verify true alpha.

### Asset slicer / manifest review
- Confirm layer list matches the production-line model.
- Confirm `floor_base` is empty enough for movement and future tools.
- Confirm transparent props/characters are separate.
- Confirm manifest coordinates, z-index, scale, and safe zones exist.
- Confirm no app visual integration side effects unless the card explicitly includes integration.

### Integrator review
- Run build/typecheck as relevant.
- Load target route in browser.
- Check console and failed asset loads.
- Click at least one primary path.
- Screenshot/vision QA the actual viewport.
- Confirm safety locks/read-only state.

## QA result template for Kanban comments/handoffs

```markdown
Visual QA result: PASS | FAIL | BLOCKED

Reviewed:
- Card(s): ...
- Route(s): ...
- Files/assets: ...

Evidence:
- Build/typecheck: ...
- Browser/console: ...
- Visual QA: ...
- Asset/layer proof: ...
- Safety: Etsy/shops/suppliers/ShotLab paid/live actions not connected; only mock/theoretical/read-only UI.

Gate results:
- ChatGPT proof: PASS/FAIL — ...
- Modular layers: PASS/FAIL — ...
- Transparency/crops: PASS/FAIL/NA — ...
- Manifest placement: PASS/FAIL — ...
- Baked text: PASS/FAIL — ...
- One-giant-PNG: PASS/FAIL — ...
- Premium browser look: PASS/FAIL — ...
- Console/route: PASS/FAIL — ...
- Build/typecheck: PASS/FAIL/NA — ...
- Safety locks: PASS/FAIL — ...

Required remediation if FAIL:
1. ...
2. ...
```

## Final rule

If any hard gate fails, do not call the visual remake done. Write focused remediation with exact failing asset/component/route and pass the card back to the appropriate next role: Design Planner, Prompt Architect, Asset Creator, Asset Slicer / Manifest Builder, Integrator, or Supervisor.
