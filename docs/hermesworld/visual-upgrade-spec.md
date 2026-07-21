# HermesWorld Visual Upgrade Spec

Status: draft locked for implementation
Owner: Eric / Aurora
Target release train: post-v2.2.x, candidate for v2.3.0 polish wave
Reference inputs: TinySkies, current HermesWorld build, internal screenshots, multiplayer/MMO readability goals

## 1. Goal

Upgrade HermesWorld from "strong prototype / shippable novelty" to "memorable stylized game surface" without changing the core product concept.

The point is **not** to turn HermesWorld into a different game.
The point is to:

- increase visual identity
- improve perceived quality
- make zones more legible and more cinematic
- make screenshots/videos more impressive
- preserve fast iteration and low asset complexity

This is an **art-direction + environment-polish pass**, not a rewrite.

## 2. Non-goals

Do **not** do these in this pass:

- no engine migration
- no major networking rewrite
- no fully custom character rig system
- no procedural world generator rewrite
- no realistic/PBR pivot
- no dependency on a separate HermesWorld repo
- no bloated asset pipeline that slows rapid iteration

## 3. Product truth to preserve

These are core and should stay intact:

1. HermesWorld lives **inside Hermes Workspace**
2. Every zone maps to real Hermes/agent concepts
3. Multiplayer presence matters
4. The world should stay readable on recordings and streams
5. It should remain lightweight enough to iterate fast
6. UI and world should feel like one system, not a pasted-on game

## 4. Visual benchmark summary

### TinySkies is useful for

- atmosphere
- silhouette clarity
- biome identity
- soft stylized color stacking
- readable terrain composition
- premium feeling from simple geometry

### TinySkies is **not** the target for

- product structure
- agent UX
- multiplayer architecture
- HUD interaction model

Use it as a **rendering / composition / environment-art reference**, not a gameplay template.

## 5. Biggest current visual gaps

### Gap 1 — atmosphere is too flat
The world is readable, but the lighting/air perspective does not yet sell depth, scale, or mood.

### Gap 2 — biome silhouettes are not distinct enough
Training, Forge, Agora, Grove, Oracle, Arena need stronger instant recognition from one screenshot.

### Gap 3 — pathing and landmarks need better environmental guidance
The player can move, but the world does not always pull the eye toward the next objective strongly enough.

### Gap 4 — characters/NPCs need stronger silhouette language
NPCs are good enough to function but not strong enough to become iconic.

### Gap 5 — HUD still reads partially as tool UI rather than premium game UI
The game layer is improving faster than the UI treatment.

## 6. Target visual pillars

### Pillar A — readable stylized wonder
The world should feel magical and premium without becoming visually noisy.

### Pillar B — strong biome identity
Every zone should be recognizable in one frame.

### Pillar C — navigation through composition
The world itself should tell the player where to go.

### Pillar D — iconic agent-fantasy NPCs
Characters should look like classes/archetypes, not just placeholders.

### Pillar E — cohesive world + HUD language
The interface should feel native to the world.

## 7. Zone-by-zone direction

## Training Grounds

Intent:
- onboarding
- clean readability
- confidence and progression

Upgrade targets:
- stronger path shapes
- clearer tutorial landmarks
- richer gate / portal framing
- more structured training props
- better contrast between playable routes and decorative ground

Visual language:
- heroic academy
- bright, inviting, polished

## Forge

Intent:
- creation
- prompts hardening into tools
- energy / transformation

Upgrade targets:
- lava / ember channel language
- glowing lines and hotter contrast
- stronger angular silhouettes
- more dramatic focal forge prop
- emissive props around crafting points

Visual language:
- volcanic, angular, industrial-mythic

## Agora
n
Intent:
- collaboration
- multiplayer social density
- builders everywhere

Upgrade targets:
- denser market / workshop props
- banners, kiosks, crowd clusters
- stronger plaza composition
- clearer social focal points
- more obvious “many builders live here” feeling

Visual language:
- civic, busy, social, entrepreneurial

## Grove

Intent:
- memory
- reflection
- soft mysticism

Upgrade targets:
- layered canopy depth
- ruins / stones / ritual circles
- softer fog and ambient green/teal palette
- stronger vertical layering
- more dreamlike pathways

Visual language:
- sacred, calm, memory-rich

## Oracle

Intent:
- routing
- foresight
- model choice / system design

Upgrade targets:
- celestial geometry
- floating rings / observatory elements
- stronger skyline silhouette
- richer VFX around prediction/navigation surfaces
- dramatic contrast between floor and sky

Visual language:
- cosmic, precise, elegant

## Arena

Intent:
- evals
- proving ground
- competition

Upgrade targets:
- stronger combat/exam framing
- bolder symmetry
- dramatic banners / hazard trim / spotlit center
- better event focus on challenge targets

Visual language:
- trial, spectacle, prestige

## 8. Priority upgrade list

## P1 — highest ROI

### 8.1 Lighting / atmosphere pass
Do first.

Deliverables:
- zone-specific fog color
- sky gradient improvements
- better depth tinting
- stronger warm/cool contrast
- key emissive accents on interactables and landmarks

Success metric:
- screenshots instantly look more premium
- the world gains depth even without new geometry

### 8.2 Landmark pass
Each zone gets 1-3 hero landmarks visible from a distance.

Examples:
- Forge super-furnace / hammer shrine
- Oracle ring tower
- Agora central pavilion / builder monument
- Grove memory tree / ruin arch

Success metric:
- player always has a visual anchor

### 8.3 Character silhouette pass
NPCs and player archetypes need stronger identity.

Do:
- stronger hats/capes/staffs/tools/back items
- cleaner role-specific palette sets
- distinguish mentor / builder / fighter / oracle classes at a glance

Success metric:
- NPCs feel memorable in stills and trailers

### 8.4 HUD styling pass
Do:
- unify panel materials
- improve hierarchy of quest/objective elements
- game-like framing for status/HUD
- reduce “dev tool” visual residue

Success metric:
- world + HUD feel like one product

## P2 — medium ROI

### 8.5 Terrain/path pass
Do:
- improve road edges, steps, elevation, rails
- make paths more visually intentional
- reduce flatness in key travel spaces

### 8.6 Prop density pass
Do:
- add more environmental storytelling props
- avoid repetitive emptiness between hero landmarks
- increase perceived richness without clutter

### 8.7 VFX pass
Do:
- portal polish
- quest interaction highlights
- ambient particles per zone
- subtle multiplayer presence effects

## P3 — later

### 8.8 Animation pass
- stronger idle pose personality
- more expressive NPC facing/attention
- mild flourish on interactions

### 8.9 Advanced shader/material polish
- stylized rim/fresnel where helpful
- better water/lava/glow materials
- stronger atmosphere transitions

## 9. UX-specific visual improvements

### 9.1 World navigation readability
The player should not rely entirely on text prompts.

Add:
- stronger environmental signposting
- visual framing around objective destinations
- more useful skyline orientation

### 9.2 Multiplayer visibility
Other players should feel more alive.

Add:
- slightly better remote-player silhouette recognition
- subtle status/readiness indicators
- tasteful presence markers without clutter

### 9.3 Recording-friendly composition
Assume clips and screenshots matter.

Do:
- cleaner framing zones
- reduce ugly dead spaces
- improve title-screen and key landmark shots
- preserve readable top-down / angled recording views

## 10. Asset strategy

Stay lightweight.

### Preferred asset strategy
- low-poly / stylized assets
- kitbash where possible
- custom hero props only where they matter most
- silhouette-first, texture-second

### Avoid
- giant asset packs with inconsistent style
- realistic PBR assets dropped into stylized world
- complex pipeline overhead that slows shipping

## 11. Technical implementation constraints

- no repo split required
- preserve route-based chunking
- preserve current multiplayer architecture
- maintain current playable FPS on modest hardware
- avoid visual changes that damage UI clarity

## 12. Recommended implementation phases

## Phase 1 — fast polish (1-2 days)

- lighting/fog pass
- HUD material/style pass
- 1 landmark pass per zone
- stronger NPC palette/silhouette pass

Expected result:
- major uplift in screenshots and first impression

## Phase 2 — environment identity (3-5 days)

- path/elevation improvements
- prop density and set dressing
- stronger zone silhouette differentiation
- portal/VFX polish

Expected result:
- zones become memorable and trailer-worthy

## Phase 3 — character/world richness

- stronger class/archetype presentation
- better ambient motion and subtle animation
- minimap / map polish if needed

Expected result:
- world feels more alive and authored

## 13. Success metrics

HermesWorld visual pass is successful if:

1. screenshots look meaningfully more premium without explanation
2. each zone is recognizable from one frame
3. players orient themselves faster without relying on text
4. NPCs feel more iconic
5. HUD feels intentionally game-like
6. videos look good enough for long-form content without apology

## 14. Concrete task list for swarm / kanban

### Lighting / atmosphere
- zone fog palettes
- sky gradient tuning
- emissive interactable pass
- landmark rim/accent pass

### Environment
- landmark hero props per zone
- path readability pass
- elevation/step framing pass
- prop density pass

### Characters
- NPC silhouette audit
- palette grouping by role
- accessory uniqueness pass
- posture/idle clarity pass

### HUD
- panel material unification
- quest/objective visual polish
- top-level HUD hierarchy cleanup
- multiplayer presence cue cleanup

### VFX
- portal upgrade
- objective highlight polish
- ambient particles by biome
- subtle remote-player cues

## 15. Final recommendation

Do **not** rewrite HermesWorld.

Do a **premium stylized art-direction pass** guided by:
- TinySkies for environment composition and atmosphere
- HermesWorld’s own product identity for concept and UX

This should be treated as a **polish/spec execution cycle**, not a research rabbit hole.

The highest leverage move is:

1. lighting
2. landmarks
3. silhouettes
4. HUD
5. path readability

That gets most of the win.
