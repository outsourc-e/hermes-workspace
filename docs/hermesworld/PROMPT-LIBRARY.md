# HermesWorld Prompt Library

Branch: `feat/asset-generation-v2`
Source style lock: `docs/hermesworld/STYLE-LOCK.md`

## Global Style Lock

Premium dark fantasy with cyan/amber accents. Use exact palette:

- GOLD `#F1C56D`
- BRONZE `#B8862B`
- PARCHMENT `#F4E9D3`
- VERDIGRIS `#2E6A63`
- MIDNIGHT `#0F1622`
- SLATE `#1B2433`
- STONE `#8A8F98`
- OBSIDIAN `#0A0D12`

Lighting: warm golden-hour key light, cyan/teal rim or fill light, soft volumetric haze, torch/lantern bloom, subtle motes/wisps.

Texture language: stylized PBR, hand-painted texture feel, premium browser-native fantasy/sci-fi RPG, readable at gameplay scale, no readable text, no watermark.

Global negative prompt:

```text
no text, no readable letters, no logos, no watermark, no UI overlay, no modern city, no plastic mobile game look, no flat gray, no pure black void, no oversaturated neon, no cyberpunk overload, no fisheye distortion, no blurry details, no duplicate characters, no broken hands, no malformed faces, no random firearms, no sci-fi guns, no anime chibi exaggeration, no low-resolution artifacts
```

## Zone Hero Images

Generate each at 1920x1080. Produce 3 variants per zone. Pick the best production image and save as `zone-N.jpg`; keep all candidates as `zone-N-variant-{a,b,c}.jpg`. Preserve any replaced `zone-N.jpg` as `zone-N-v1.jpg`.

### Training Grounds / zone-1

```text
HermesWorld Training Grounds zone hero, 1920x1080 cinematic wide establishing shot, premium browser-native dark fantasy RPG, obsidian practice courtyard with parchment banners, gold-trimmed sparring rings, bronze weapon racks, low stone walls, glowing cyan agent-tech waypoint pylons, warm lantern pools, verdigris moss in stone seams, readable empty walkable center, distant academy silhouettes, golden-hour key light, cyan rim light, soft volumetric haze, subtle magic motes, stylized PBR hand-painted texture feel, no text, no logos
```

### Forge / zone-2

```text
HermesWorld Forge zone hero, 1920x1080 cinematic wide establishing shot, premium dark fantasy artisan foundry, obsidian basalt workshop carved into mountain stone, bronze anvils and gold filigree trim, molten amber forge light, cyan runic cooling channels, hanging chains, hammer silhouettes, sparks and smoke, sturdy dwarven craftsmanship, readable composition for game background, verdigris patina accents, stylized PBR hand-painted texture feel, no text, no logos
```

### Agora / zone-3

```text
HermesWorld Agora zone hero, 1920x1080 cinematic wide establishing shot, civic fantasy plaza inspired by a warm social hub, circular obsidian stone forum, central caduceus/sigil monument without readable letters, gold lanterns, bronze market stalls, parchment awnings, verdigris moss, cyan portal accents, rich perimeter detail with clear walkable center, premium browser-native RPG, warm torch bloom, cyan rim light, soft haze, stylized PBR hand-painted texture feel, no text, no logos
```

### Grove / zone-4

```text
HermesWorld Grove zone hero, 1920x1080 cinematic wide establishing shot, mystical dark fantasy grove, ancient obsidian roots and stone arches, verdigris leaves and moss, gold fireflies, parchment prayer ribbons without readable marks, cyan spirit pools and agent-tech wisps, moonlit canopy with warm amber lanterns, tranquil premium RPG mood, readable paths, stylized PBR hand-painted texture feel, no text, no logos
```

### Oracle / zone-5

```text
HermesWorld Oracle zone hero, 1920x1080 cinematic wide establishing shot, mystical observatory temple, obsidian and slate stone dais, bronze astrolabes, gold constellation inlays without readable text, cyan scrying pool glow, parchment scroll alcoves, hooded statues, volumetric haze, celestial particles, premium dark fantasy planning sanctuary, readable central platform, stylized PBR hand-painted texture feel, no text, no logos
```

### Arena / zone-6

```text
HermesWorld Arena zone hero, 1920x1080 cinematic wide establishing shot, grand obsidian combat coliseum, bronze gates, gold-trimmed shield emblems without readable text, cyan barrier magic around battle floor, parchment pennants, torchlit stands, dramatic dust and haze, heroic dark fantasy RPG combat venue, readable circular arena center, stylized PBR hand-painted texture feel, no text, no logos
```

## NPC Portraits

Generate 1024x1024 portraits. Atmospheric or transparent-feeling background. Save in `public/avatars/v2/`.

### Atlas Scout

```text
HermesWorld NPC companion portrait, Atlas Scout, 1024x1024 square, blue-cyan robed scout with wide-brim traveler's hat, calm clever expression, leather satchel and compass charm, gold #F1C56D trim, obsidian/slate cloak shadows, verdigris accent stitching, warm key light and cyan rim light, premium stylized fantasy RPG portrait, atmospheric dark background, no text, no watermark
```

### Forge Builder

```text
HermesWorld NPC companion portrait, Forge Builder, 1024x1024 square, armored dwarf warrior artisan, broad silhouette, bronze plate armor, gold #F1C56D engraved edges, hammer motif, warm forge glow, cyan runic highlights, expressive determined face, premium stylized fantasy RPG portrait, atmospheric foundry background, no text, no watermark
```

### Oracle Planner

```text
HermesWorld NPC companion portrait, Oracle Planner, 1024x1024 square, hooded mystical strategist, slate and obsidian robes, gold #F1C56D astrolabe jewelry, parchment scroll details, cyan scrying light on face, calm prophetic expression, soft volumetric haze, premium stylized fantasy RPG portrait, atmospheric temple background, no text, no watermark
```

### Athena

```text
HermesWorld NPC companion portrait, Athena onboarding guide, 1024x1024 square, wise tactical mentor, elegant obsidian and parchment armor-robes, gold #F1C56D laurel/caduceus accents, bronze shoulder detail, cyan rim light, confident welcoming expression, premium stylized fantasy RPG portrait, atmospheric academy background, no text, no watermark
```

### Apollo

```text
HermesWorld NPC companion portrait, Apollo healer, 1024x1024 square, radiant healer companion, parchment and gold-trimmed robes, bronze sun charm, gentle expression, warm amber healing light, cyan restorative sigils, obsidian/slate background for contrast, premium stylized fantasy RPG portrait, no text, no watermark
```

### Hermes

```text
HermesWorld NPC companion portrait, Hermes guide, 1024x1024 square, charismatic messenger-guide, obsidian travel cloak, gold #F1C56D caduceus pin and wing accents, verdigris scarf detail, cyan portal rim light, clever welcoming expression, premium stylized fantasy RPG portrait, atmospheric portal background, no text, no watermark
```

## UI Icon Sprite Sheet

Generate a transparent 6x4 sprite sheet, 24 icons, each 64x64 cell. Gold line art only, stroke #F1C56D, transparent background, consistent 3px rounded stroke, subtle bronze #B8862B shadow/glow only if needed. Export `sprite-v1.png` and a matching JSON manifest with each icon's cell coordinates.

Icon order:

1. compass
2. hammer
3. eye
4. scales
5. sword
6. shield
7. scroll
8. map
9. bag
10. gear
11. sigil
12. quest
13. world
14. portal
15. inventory
16. chat
17. heart
18. star
19. flame
20. key
21. crown
22. coin
23. book
24. spark

```text
HermesWorld UI icon sprite sheet, transparent background, 6 columns by 4 rows, 24 fantasy RPG line-art icons, each icon centered in a 64x64 cell, gold #F1C56D stroke, consistent rounded 3px line weight, subtle bronze #B8862B glow, no text, no labels, no filled background, premium dark fantasy UI icon language, compass, hammer, eye, scales, sword, shield, scroll, map, bag, gear, caduceus sigil, quest lightbulb, geodesic world, portal arch, satchel inventory, chat bubble, heart, star, flame, key, crown, coin, book, spark
```

## Video Poster

Generate at 1280x720 and save as `public/assets/hermesworld/video/world-demo-poster-v2.jpg`. Preserve replaced `world-demo-poster.jpg` as `world-demo-poster-v1.jpg` if present.

```text
HermesWorld world-demo video poster, 1280x720 cinematic frame, portal/sigil hero composition, obsidian stone portal arch with caduceus-inspired circular sigil, gold #F1C56D engraved strokes, bronze #B8862B metal trim, parchment light rays, verdigris moss and patina, cyan #2E6A63 portal energy, warm lantern foreground, premium dark fantasy RPG world reveal, strong center composition with negative space for play button overlay, stylized PBR hand-painted texture feel, no text, no watermark, no logo letters
```
