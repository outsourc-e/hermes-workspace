# HermesWorld — In-Game Target Spec

Last updated: 2026-05-06 02:22 EDT

Reference: `docs/hermesworld/reference-images/INGAME-TARGET-AGORA.png`

This is the **playable view** the marketing graphic implies.
When a user is *in* HermesWorld, this is what their screen should look like.

---

## What the reference shows

A circular plaza in Agora Commons:
- isometric/over-the-shoulder camera (closer to high 3/4 than top-down)
- central stone monument with a gold pyramid finial, ringed by lit torches
- radial cobblestone tiles with rune circles
- benches, foliage, lanterns lining the edge
- merchant stalls (red/blue tents) with crates and barrels
- 6 NPCs around the plaza, each with a colored name tag
- 1 player avatar (Eric) center-stage with a name pill
- a wisp/sparkle near front-right (collectible/quest cue)

### HUD layout
- **Top-left**: player card
  - portrait
  - name "Eric"
  - zone subtitle "TRAINING GROUNDS"
  - XP "75 - next 25"
  - 4 stat bubbles: HP 100, MP 50, SP 80, XP 75
- **Top-center**: objective banner
  - icon + label "OBJECTIVE — Move and Speak"
  - sub-text "Walk to Athena and speak with her. Athena waits by the Arrival Circle."
- **Top-right**: minimap "AGORA COMMONS"
  - circular map
  - YOU marker
  - Portal marker
- **Mid-left edge**: small ambient sticker "Hermes Guide" (helper card / NPC poke)
- **Right edge**: vertical icon rail (settings, fullscreen, share, party, etc.)
- **Bottom-left**: chat panel
  - "CHAT - 4 ONLINE - 3 NPC LOCAL-ONLY"
  - colored NPC tags on speakers
  - chat input box with SEND button
- **Bottom-center**: ability bar
  - HP/MP/SP triple bar on the left
  - 4 ability slots with cooldown timers/icons + 1 modifier
- **NPC name tags**: floating above each NPC with role
  - "Athena - Sage", "Apollo", "Nora - Piper", "Silas - Guard", "Dorian - Quartermaster"
- **Speech popups**: ambient lines over NPC heads
  - "Starter kit, cheap and proud."
  - "gm builders"

### Mood
- warm golden hour lighting
- premium 3D rendered look (Genshin / Honkai / Dragon Quest XII territory)
- crisp UI overlays with glassy panels and warm inner glow
- soft particle ambience (wisps, dust motes near torches)

---

## Why this matters

The marketing graphic (`MASTER-PRODUCT-GRAPHIC.png`) is what the **website/store page** should look like.

This in-game target (`INGAME-TARGET-AGORA.png`) is what the **playable game** should look like.

Both must be honored. They should feel like the same product.

---

## Style locks

- **Camera**: 3/4 isometric, slight rotation, ~45-50° pitch
- **Lighting**: warm golden hour with rim light on characters
- **Ground**: hand-painted cobblestones with rune circle inlays
- **Props**: stylized stone, wood, fabric, bronze details
- **Characters**: chibi-leaning proportions, capes, robes, Dragon Quest x Genshin energy
- **NPCs**: distinct silhouettes, color-coded by faction/role
- **HUD**: dark glassy chrome, gold/amber accents, white text, slight bevel
- **Name tags**: pill-shaped, dark with light text, role suffix
- **Objective banner**: dark slab top-center, icon on left, two-line copy
- **Minimap**: circular, dark inner, glowing landmarks, small markers
- **Chat**: 5-color tags for source kind (NPC, player, system), monospace-ish UI

---

## Asset list driven by this image

### 3D / world
- circular plaza floor (cobblestones, rune circles)
- central monument (stone tiers + gold pyramid finial)
- torches (low + tall)
- lanterns
- benches
- crates & barrels
- merchant stalls (red, blue, green roofs)
- foliage clumps
- dirt path tiles bordering grass
- portal arch (used in nearby image)
- atmospheric particles

### Characters / agents
- player avatar template, with class swaps:
  - Priest, Guardian, Mage, Rogue, Engineer, Oracle, Bard
- NPC roster (Agora):
  - Athena - Sage
  - Apollo
  - Nora - Piper
  - Silas - Guard
  - Dorian - Quartermaster
  - Hermes Guide (helper)
- agent companions per the marketing graphic

### UI
- player card panel
- stat bubbles (HP/MP/SP/XP)
- objective banner
- minimap with markers
- right-rail icon set (settings, fullscreen, share, party, social)
- chat panel
- ability bar w/ slot frames + cooldown
- name tag pills
- speech bubbles
- toast cards

### FX
- torch flames + glow
- wisps / sparkles
- dust motes
- footstep particles

---

## Engineering targets

- Camera: orthographic-ish 3D in Three.js / R3F
- Asset format: glTF/GLB with optimized textures (KTX2/Basis)
- Shaders: stylized PBR + rim light + cheap fog
- Performance: 60fps on M-series, 30fps target on midrange laptops
- Mobile: simplify chat panel + minimap, keep ability bar

---

## Realism loop on this view

For every iteration:
1. take the current playable Agora screenshot
2. diff against `INGAME-TARGET-AGORA.png`
3. list the top 3 visible differences (camera, lighting, monument, torches, NPCs, HUD, chat panel, etc.)
4. write smallest patch
5. screenshot again
6. repeat

This is how we ratchet from current state to target without rewriting the engine.

---

## v0.3 -> v0.6 milestones tied to this image

- **v0.3**: HUD layout matches (player card + objective + minimap + chat + ability bar)
- **v0.4**: 3D plaza ring + central monument + torches in correct visual style
- **v0.5**: NPCs with name tag pills and ambient speech, real movement
- **v0.6**: stalls, crates, lanterns, full warm lighting pass, particles
