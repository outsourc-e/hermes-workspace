# Agora Inso Asset Prompts + Manifest

Status: art target locked for next HermesWorld realism loop
Primary reference: `docs/hermesworld/reference-images/agora-center-inso-reference.jpeg`
Source spec: `docs/hermesworld/AGORA-INSO-IMPLEMENTATION.md`

## Art goal

Use the Agora Inso reference as the primary visual target for the HermesWorld Agora plaza.

The target is a composed browser game screen, not isolated pretty assets:

- isometric / high third-person camera angled down into a circular social plaza
- circular stone hub with central obelisk / builder monument
- warm torch and lantern pools around the ring
- cool cyan/blue roof, portal, and faction accents
- dense edges: stalls, benches, crates, banners, flowers, pots, path seams
- clear walkable center
- readable NPC clusters and labels
- compact HUD islands, not SaaS slabs

Style lock:

- premium stylized realism
- low/mid-poly readable silhouettes, rich painted materials
- dark obsidian + moss stone + warm amber firelight + cyan agent-tech accents
- game asset concept sheet quality
- no text, no logos, no UI mock text in generated assets
- generated art is source material; final layout must be placed and judged in browser screenshots

## Global negative prompt

Use this on every generation unless a tool has a separate negative field:

```text
no text, no readable letters, no logos, no watermark, no photoreal modern city, no cyberpunk neon overload, no cartoon toy style, no plastic mobile-game asset look, no huge empty flat floor, no fisheye distortion, no blurry details, no overexposed bloom, no UI text, no duplicate limbs, no broken hands, no random weapons, no sci-fi guns, no anime chibi proportions
```

## Global style suffix

Append this to every prompt:

```text
HermesWorld Agora Inso visual target, premium browser-native fantasy/sci-fi RPG, stylized realism, isometric game readability, dark obsidian stone, mossy civic plaza, warm amber torchlight, controlled cyan agent-tech glow, clear silhouettes, optimized for 3D game asset interpretation, high detail but readable at gameplay camera distance, no text, no logo
```

---

# 1. Central monument / obelisk

## Prompt: final concept sheet

```text
Create a central monument for HermesWorld Agora: a civic builder obelisk rising from a circular stone plinth, ancient carved dark basalt and bronze trim, subtle cyan agent-network veins running through engraved channels, warm amber lanterns at the base, small offering steps and radial stone rings around it. The silhouette must be readable from an isometric gameplay camera. Shape language: entrepreneurial civic plaza meets ancient AI command shrine. Include 3/4 view, front view, top-down footprint inset, and material callouts, but no readable text. The monument should feel like the spawn anchor and social center of a multiplayer plaza. HermesWorld Agora Inso visual target, premium browser-native fantasy/sci-fi RPG, stylized realism, isometric game readability, dark obsidian stone, mossy civic plaza, warm amber torchlight, controlled cyan agent-tech glow, clear silhouettes, optimized for 3D game asset interpretation, high detail but readable at gameplay camera distance, no text, no logo.
```

Suggested generation settings:

- aspect: 16:9 or 4:3
- count: 4 variations
- choose for silhouette first, ornament second

Implementation notes:

- Build as simple geometry first: cylinders, bevelled boxes, cone/obelisk, emissive strips.
- Do not import a huge mesh unless optimized.
- Needs collision footprint no wider than 20-24% of plaza diameter.

---

# 2. Torch / lantern set

## Prompt: prop sheet

```text
Create a modular torch and lantern prop set for HermesWorld Agora: 8 small props on a neutral dark background, including waist-high stone braziers, hanging lantern posts, wall lanterns, market-stall lanterns, ground candle clusters, and blue-cyan agent-tech waypoint lamps. Materials: dark basalt, aged bronze, warm amber flame glass, small cyan runic accents. Each prop must have a strong simple silhouette, game-ready readable shape, and fit around a circular isometric plaza. No characters, no text, no labels. HermesWorld Agora Inso visual target, premium browser-native fantasy/sci-fi RPG, stylized realism, isometric game readability, dark obsidian stone, mossy civic plaza, warm amber torchlight, controlled cyan agent-tech glow, clear silhouettes, optimized for 3D game asset interpretation, high detail but readable at gameplay camera distance, no text, no logo.
```

## Prompt: in-scene lighting reference

```text
Create an isometric night-dusk lighting study for a circular fantasy civic plaza with warm torchlight pools around the ring and subtle cyan portal lamps at entrances. Focus on light placement, shadows, and readability: clear walkable center, lively market edges, warm/cool contrast, no characters, no text. The scene should show how lanterns guide player movement and frame the central monument. HermesWorld Agora Inso visual target, premium browser-native fantasy/sci-fi RPG, stylized realism, dark obsidian stone, mossy civic plaza, warm amber torchlight, controlled cyan agent-tech glow, clear silhouettes, no text, no logo.
```

Implementation notes:

- Use a small set of repeated lights with baked-looking emissive materials.
- Prefer fake glow planes / emissive meshes over many expensive real lights.
- Browser target: keep dynamic light count low; use ambient + key + selective point lights.

---

# 3. Market stalls / booths

## Prompt: modular stall kit

```text
Create a modular fantasy/sci-fi market stall kit for HermesWorld Agora, inspired by a dense isometric civic plaza. Show 10 reusable stall assets: blue-roof merchant canopy, amber-cloth builder kiosk, tool bench stall, scroll/data booth, potion/energy stand, crate cluster, barrel cluster, bench, flower pot cluster, small portal ticket booth. Materials: dark wood, basalt stone, bronze, fabric awnings in muted deep blue and amber, subtle cyan agent-tech trims. Must feel entrepreneurial, social, and busy without clutter. Asset sheet, orthographic-ish 3/4 view, neutral background, no text, no labels. HermesWorld Agora Inso visual target, premium browser-native fantasy/sci-fi RPG, stylized realism, isometric game readability, dark obsidian stone, mossy civic plaza, warm amber torchlight, controlled cyan agent-tech glow, clear silhouettes, optimized for 3D game asset interpretation, high detail but readable at gameplay camera distance, no text, no logo.
```

## Prompt: plaza edge composition

```text
Create an isometric environment concept for the edge of HermesWorld Agora plaza: circular stone path in foreground, dense market stalls and benches around the edge, blue awnings, warm lanterns, crates, flowers, pots, small portal-gate silhouette, clear center path visible, no characters. The composition should show how props cluster around the plaza rim while preserving walkable space. Premium stylized realism, browser-native RPG readability, no text, no logo.
```

Implementation notes:

- Stalls should be kitbashed from awning + counter + crates + lantern.
- Use 3 awning colors max: muted blue, amber, desaturated teal.
- Place at 30-45 degree rotations around the ring.

---

# 4. Ground tiles / radial plaza material

## Prompt: top-down tile sheet

```text
Create a seamless modular ground tile sheet for HermesWorld Agora: radial circular plaza stones, wedge-shaped pavers, moss seams, flower tufts, worn path edges, small engraved cyan agent-network channels, dark basalt and warm gray stone. Top-down orthographic view. Include variations: clean center tile, outer ring tile, cracked tile, mossy seam tile, edge curb, small flower/grass decal, bronze inlay strip. No text, no labels, no shadows baked too strongly. Game texture/material reference, readable at isometric browser RPG camera distance. HermesWorld Agora Inso visual target, premium stylized realism, no text, no logo.
```

## Prompt: material close-up

```text
Create a close-up material reference for HermesWorld Agora radial plaza stones: dark mossy basalt pavers, hand-cut circular seams, subtle worn edges, tiny grass and flowers in cracks, thin cyan engraved channels, amber lantern reflections on stone. Realistic material detail but stylized for a lightweight browser game. No text, no logo.
```

Implementation notes:

- Use procedural geometry/material variation first; imagegen is material reference.
- Keep tile contrast low enough that NPCs and labels remain readable.
- Use decals/planes for flowers/seams rather than a massive texture atlas if faster.

---

# 5. NPC portraits

NPC set target: five Agora social roles, consistent bust framing, square portraits.

Shared portrait suffix:

```text
RPG NPC bust portrait, centered square composition, readable face, premium stylized realism, dark obsidian civic plaza background, warm amber key light, cyan rim light, detailed but not noisy clothing, no text, no logo, no frame, same camera distance and lighting across the set.
```

## NPC 1 — Agora Steward / Orchestrator Host

```text
Create a HermesWorld Agora NPC portrait: the Agora Steward, a calm civic orchestrator who welcomes players into the social hub. Middle-aged, intelligent eyes, bronze-trimmed dark cloak, subtle cyan agent-network brooch, warm lantern light on face, composed expression, entrepreneurial city-founder energy. RPG NPC bust portrait, centered square composition, readable face, premium stylized realism, dark obsidian civic plaza background, warm amber key light, cyan rim light, detailed but not noisy clothing, no text, no logo, no frame, same camera distance and lighting across the set.
```

## NPC 2 — Market Builder / Toolsmith

```text
Create a HermesWorld Agora NPC portrait: Market Builder Toolsmith, practical maker and startup engineer, rolled sleeves, leather apron over dark tunic, small glowing tool charms, bronze goggles pushed up, friendly confident expression, warm forge-lantern key light and cyan rim accents. RPG NPC bust portrait, centered square composition, readable face, premium stylized realism, dark obsidian civic plaza background, warm amber key light, cyan rim light, detailed but not noisy clothing, no text, no logo, no frame, same camera distance and lighting across the set.
```

## NPC 3 — Signal Merchant / Data Broker

```text
Create a HermesWorld Agora NPC portrait: Signal Merchant Data Broker, elegant social operator who trades rumors, quests, and agent signals. Sleek layered robes, deep blue fabric, bronze clasp, small translucent cyan data tokens floating subtly near shoulder, sharp observant expression, warm/cool split lighting. RPG NPC bust portrait, centered square composition, readable face, premium stylized realism, dark obsidian civic plaza background, warm amber key light, cyan rim light, detailed but not noisy clothing, no text, no logo, no frame, same camera distance and lighting across the set.
```

## NPC 4 — Lantern Guard / Plaza Sentinel

```text
Create a HermesWorld Agora NPC portrait: Lantern Guard Plaza Sentinel, protective but approachable civic guardian, dark metal shoulder plates, amber lantern staff visible near shoulder, blue cloth sash, grounded expression, strong silhouette, warm torchlight and cyan rim glow. RPG NPC bust portrait, centered square composition, readable face, premium stylized realism, dark obsidian civic plaza background, warm amber key light, cyan rim light, detailed but not noisy clothing, no text, no logo, no frame, same camera distance and lighting across the set.
```

## NPC 5 — Apprentice Founder / Newcomer

```text
Create a HermesWorld Agora NPC portrait: Apprentice Founder Newcomer, young ambitious builder arriving at the plaza, travel cloak, satchel of scrolls and small devices, subtle nervous confidence, warm lantern reflection in eyes, cyan token pendant, hopeful expression. RPG NPC bust portrait, centered square composition, readable face, premium stylized realism, dark obsidian civic plaza background, warm amber key light, cyan rim light, detailed but not noisy clothing, no text, no logo, no frame, same camera distance and lighting across the set.
```

Implementation notes:

- Generate portraits as 1024x1024, crop to consistent bust framing.
- Downsample to 512 and 256 for runtime.
- Use same background/value range; inconsistency will look cheap instantly.

---

# 6. Minimap style

## Prompt: minimap art direction

```text
Create a stylized minimap design for HermesWorld Agora, top-right HUD island style. Show a circular plaza map from top-down: central obelisk icon, radial stone rings, NPC dots around the ring, market stall blocks, portal gate markers, player arrow, subtle dark obsidian panel backing, bronze border, cyan route accents, amber point-of-interest dots. Clean game UI, readable at small size, no readable text, no labels, no logo. Premium fantasy/sci-fi RPG HUD, compact island panel, not a SaaS dashboard.
```

## Prompt: minimap icon glyph sheet

```text
Create a small minimap glyph sheet for HermesWorld Agora: player arrow, NPC dot, quest star, portal arch, market stall, central monument, bench/rest point, chat/social node, danger/blocker marker. Style: simple top-down game map glyphs, dark bronze/cyan/amber palette, high contrast, readable at 16-24px, no text, no labels, transparent-looking dark background.
```

Implementation notes:

- Final minimap should be vector/CSS/canvas where possible, not a static generated image.
- Use generated result as style reference for colors, border, glyph proportions.
- Keep labels out; hover/tooltips in UI handle text.

---

# 7. HUD icon pack

## Prompt: 24-icon action/HUD pack

```text
Create a cohesive 24-icon HUD pack for HermesWorld Agora, premium fantasy/sci-fi RPG interface icons. Icons needed: move, inspect, talk, trade, quest, map, inventory, skills, memory, agents, dispatch, build, review, repair, portal, party, chat, report, inbox, torch, monument, market, settings, help. Style: luminous cyan and warm amber line icons on dark obsidian/bronze circular or rounded-square backplates, readable at 32px and 64px, consistent stroke weight, simple silhouettes, no text, no letters, no logos, no watermark.
```

## Prompt: action bar button material

```text
Create a game HUD action bar button material/style sheet for HermesWorld: dark obsidian glass-metal buttons, bronze bevel, subtle inner highlight, cyan active glow, amber hover/quest glow, disabled muted state, pressed state. Show 8 empty icon slots with different states, no text, no logos. Premium fantasy/sci-fi RPG UI, compact bottom-center action bar, not a SaaS toolbar.
```

Implementation notes:

- Final icons should be SVG or small transparent PNG sprites.
- Generate for direction, then trace/simplify if needed.
- Do not ship raster icons with accidental text artifacts.

---

# Asset manifest draft

```yaml
version: 1
zone: agora
visual_target: agora-inso
reference_image: docs/hermesworld/reference-images/agora-center-inso-reference.jpeg
source_spec: docs/hermesworld/AGORA-INSO-IMPLEMENTATION.md
art_direction:
  camera: isometric/high-third-person angled down
  mood: premium civic fantasy/sci-fi social plaza
  palette:
    obsidian: '#080F14'
    panel: '#18212B'
    stone: '#3D4542'
    moss: '#516B4B'
    bronze: '#9B7442'
    amber: '#F2C768'
    cyan: '#78A8C8'
  constraints:
    - clear walkable center
    - dense lively perimeter
    - no generated text/logos
    - browser-optimized assets
    - final layout judged from in-browser screenshots

assets:
  - id: agora_monument_obelisk_v01
    category: environment/landmark
    priority: P0
    prompt_section: central monument / obelisk
    expected_outputs:
      - concept_sheet_png
      - simplified_glb_or_procedural_component
      - material_reference_png
    runtime_target:
      component: AgoraMonument
      approximate_footprint_m: 5.5
      lod: 1
      collision: simple_cylinder
      lights: emissive_cyan_strips + 2 amber fake-glow planes
    acceptance:
      - readable from zoomed-out camera
      - acts as spawn/social anchor
      - does not block center navigation

  - id: agora_lantern_brazier_set_v01
    category: environment/lighting-props
    priority: P0
    prompt_section: torch / lantern set
    expected_outputs:
      - prop_sheet_png
      - 6-8 optimized prop meshes or procedural variants
      - flame_glow_sprite_png
    runtime_target:
      component: AgoraLanternSet
      placements: radial ring, stall corners, portal edges
      dynamic_lights_budget: 4 max
      preferred_fx: emissive material + billboards
    acceptance:
      - warm/cool contrast visible in screenshot
      - guides movement around plaza ring
      - no performance spike from too many lights

  - id: agora_market_stall_kit_v01
    category: environment/props
    priority: P0
    prompt_section: market stalls / booths
    expected_outputs:
      - modular_prop_sheet_png
      - awning/counter/crate/barrel/bench/pot variants
      - color_variant_manifest
    runtime_target:
      component: AgoraMarketKit
      placements: perimeter clusters only
      max_unique_meshes: 12
      instancing: preferred
    acceptance:
      - edges feel lively
      - center remains playable
      - kitbash variants do not look copy-pasted

  - id: agora_ground_tiles_radial_v01
    category: environment/materials
    priority: P0
    prompt_section: ground tiles / radial plaza material
    expected_outputs:
      - tile_sheet_png
      - material_reference_png
      - optional_decal_atlas_png
    runtime_target:
      component: AgoraGroundTiles
      technique: procedural radial geometry + decal planes
      texture_budget: <= 2048 atlas if rasterized
    acceptance:
      - circular plaza reads instantly
      - NPC labels remain readable
      - seams/flowers add richness without noise

  - id: agora_npc_portraits_v01
    category: characters/portraits
    priority: P0
    prompt_section: NPC portraits
    expected_outputs:
      - steward_1024_png
      - toolsmith_1024_png
      - data_broker_1024_png
      - lantern_guard_1024_png
      - apprentice_founder_1024_png
      - 512_runtime_versions
      - 256_thumbnail_versions
    runtime_target:
      component: NpcDialogueCard / NpcInspector
      format: webp preferred
      framing: consistent bust portrait
    acceptance:
      - five portraits look like one set
      - readable at dialogue-card size
      - each role is distinct by silhouette/accessory

  - id: agora_minimap_style_v01
    category: ui/minimap
    priority: P1
    prompt_section: minimap style
    expected_outputs:
      - minimap_style_reference_png
      - minimap_glyph_sheet_png
      - vector_glyph_trace_svg
    runtime_target:
      component: PlaygroundMinimap
      technique: generated style reference + SVG/canvas implementation
      placement: top-right HUD island
    acceptance:
      - central monument, NPCs, portals, stalls readable at small size
      - no text required
      - visually matches HUD/action bar materials

  - id: agora_hud_icon_pack_v01
    category: ui/icons
    priority: P1
    prompt_section: HUD icon pack
    expected_outputs:
      - 24_icon_contact_sheet_png
      - traced_svg_icon_set
      - action_button_state_sheet_png
    runtime_target:
      component: PlaygroundActionBar / HUD islands
      sizes_px: [32, 48, 64]
      format: svg preferred, png fallback
    acceptance:
      - icons readable at 32px
      - no accidental letters/text artifacts
      - active/hover/disabled states match Agora material language

pipeline:
  generation:
    preferred_tools:
      - GPT-Image / imagegen for concept sheets and portraits
      - Meshy or Tripo only if converting key props to GLB is faster than procedural build
      - Scenario optional for consistent portrait/icon style if repeated generations drift
  cleanup:
    - crop and remove text artifacts
    - optimize PNG/WebP sizes
    - trace icons to SVG where possible
    - use gltf-transform for imported GLB assets
    - record source prompt and approval state
  placement:
    - implement in actual HermesWorld components
    - capture desktop screenshot
    - capture mobile screenshot separately
    - compare against Agora Inso reference
  review_gate:
    - visual convergence to reference
    - readability at gameplay camera
    - no HUD clutter
    - no giant asset bundle regression
    - no unlicensed / unknown-provenance production assets
```

## Swarm-ready build split

- Art lane: generate concept sheets and portraits from the prompts above.
- Builder lane: implement `AgoraMonument`, `AgoraLanternSet`, `AgoraMarketKit`, and `AgoraGroundTiles` procedurally first.
- UI lane: translate minimap/HUD prompts into SVG/CSS/canvas components.
- QA lane: screenshot desktop/mobile, compare against `agora-center-inso-reference.jpeg`, flag gaps.
- Reviewer lane: check asset sizes, generated-art provenance, and bundle impact.
