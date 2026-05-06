# HermesWorld Art Bible — Realism Loop

Last updated: 2026-05-06

## Visual ambition

HermesWorld should feel like a premium browser-native fantasy/sci-fi agent RPG, not a demo scene.

Target vibe:
- cinematic dark fantasy meets agent command center
- realistic/stylized hybrid, readable at browser scale
- moody lighting, fog, emissive magical UI, high contrast
- game-first interface, not SaaS dashboard clutter
- every asset should support mechanics

Primary Agora target:
- Use `docs/hermesworld/reference-images/agora-center-inso-reference.jpeg` as the primary visual target for Agora realism work.
- The goal is a composed game screen: circular civic plaza, central obelisk/monument, warm torchlight, blue/cyan roof/portal accents, dense market edges, clear walkable center, readable NPC clusters, and compact HUD islands.
- Asset prompts and manifest live in `docs/hermesworld/AGORA-INSO-ASSET-PROMPTS.md`.

Reference workflow from Eric's Downloads:
- Imagegen creates high-quality source material.
- The game places assets in the real interface.
- Browser screenshots capture actual player view.
- Vision review judges hierarchy, spacing, readability, clickability, mobile fit, and visual consistency.
- Agents revise and repeat.

## Palette

Base:
- Obsidian: `#080F14`
- Panel: `#18212B`
- Deep ink: `#030712`

Accents:
- Action green: `#2FCA94`
- Vision blue: `#78A8C8`
- Insight amber: `#F2C768`
- Arcane purple: `#8B5CF6`, only as controlled magic/glow

Text:
- Primary: `#E6E7EA`
- Muted: `rgba(230,231,234,.65)`

Avoid:
- oversaturated neon everywhere
- purple fog as the only mood
- cute/cartoon mascot style
- unreadable tiny text
- SaaS dashboard density on mobile

## Shape language

Panels:
- 6-10px radius
- 1px low-contrast borders
- subtle inner highlights
- dark glass/metal material

HUD:
- compact islands, not slabs
- status visible at a glance
- icons readable at 48-64px source size
- mobile gets its own layout, never desktop squeezed down

World:
- large silhouettes first
- readable landmarks
- one hero light source per scene
- secondary fire/magic/portal lights
- atmospheric depth, but not enough to hide navigation

## Asset rules

Generate with imagegen:
- hero art / zone banners, 16:9
- NPC portraits, square 1:1, consistent framing
- item icons, square 1:1, readable at 64px
- sigil icons, square 1:1, high contrast
- card art, vertical 2:3
- environmental backgrounds, 16:9
- texture/material explorations

Do not generate final layout with imagegen.
Layout must be judged in browser screenshots.

## Prompt snippets

### Zone hero art

Create cinematic dark fantasy/sci-fi environment concept art for HermesWorld, a browser-native AI agent RPG. Mood: mysterious, premium, ancient technology, magical realism. High contrast, realistic textures, atmospheric depth, readable landmark silhouette, no text, no logo, no characters, no oversaturated neon. Style: AAA game key art, dark obsidian palette, cyan/amber accent light, subtle arcane glow. 16:9.

### NPC portrait

Create a realistic stylized fantasy/sci-fi RPG NPC portrait for HermesWorld. Bust portrait, centered, dramatic rim lighting, dark obsidian background, readable face, high-detail clothing/materials, premium game character art, no text, no logo, consistent square framing. 1:1.

### Item icon

Create a premium RPG item icon for HermesWorld. Single object centered on dark transparent-looking obsidian background, strong silhouette, readable at 64px, realistic material, cyan/amber rim light, no text, no logo, no busy background. 1:1.

### Sigil icon

Create a mystical sigil icon for HermesWorld. Ancient agent-world symbol, clean readable silhouette, luminous cyan/amber engraving, dark metal/stone backing, high contrast, collectible game badge quality, no text, no logo. 1:1.

## Vision review checklist

Every screenshot must be judged on:
1. Playable first: can the player tell what to do?
2. Status visibility: HP/objective/map readable instantly?
3. HUD readability: text, icon, and tap targets clear?
4. Inventory density: are items distinct?
5. Mobile layout: no scroll, no overlap, no squeezed desktop UI.
6. Art supports mechanics: landmarks, NPCs, objects communicate purpose.
7. Visual consistency: same palette, light logic, framing, borders.
8. Performance: assets optimized, not just pretty.

## HermesWorld v0.3 realism goals

Minimum visible leap:
- replace flat/placeholder zone art with generated cinematic zone banners
- 5 NPC portraits with consistent premium framing
- 12 item icons with readable silhouettes
- 7 sigil icons for lore/easter egg layer
- HUD revised into compact game-style islands
- one high-quality screenshot loop per mobile and desktop

## Build loop

1. Generate asset set.
2. Compress/optimize into web assets.
3. Place in actual HermesWorld UI.
4. Capture screenshot.
5. Vision review against checklist.
6. Patch UI/art/layout.
7. Repeat until it feels like a game, not a prototype.
