# HermesWorld Graphics + Usability Development Plan

Status: start now
Owner: Eric / Aurora
Stack: Hermes Workspace + React + Three.js / React Three Fiber

## Goal

Upgrade HermesWorld from "promising web demo" to "serious playable world" with:
- stronger visual identity
- much better usability
- more believable characters
- better screenshot / clip quality
- a clean path that stays web-native

## Core decision

Do **not** switch engines now.

Stay on:
- **Three.js**
- **React Three Fiber**
- current Hermes Workspace integration

Reason:
- web shareability matters
- X traffic matters
- embedding/dashboard mode matters
- current blockers are art direction, assets, rendering, and UX, not engine choice

## Hard truth on "real-looking characters"

### What is realistic right now
We can get to:
- **stylized-real / semi-real / premium MMO-lite**
- strong silhouettes
- better faces/hair/clothes
- better animation
- more human proportions
- better materials and lighting

### What is not realistic right now
Not this sprint:
- AAA Unreal photoreal humans
- fully custom hero character system from scratch
- hundreds of unique high-end characters

## Recommended character direction

Target look:
- **semi-real fantasy RPG characters**
- more grounded than Roblox / low-poly toy figures
- less uncanny than rushed photoreal
- readable at gameplay distance
- works in browser performance budgets

## Character pipeline to start now

### Best first path
Use a proven character source instead of inventing characters from primitives.

Recommended order:
1. **Ready Player Me** or equivalent avatar source for fast believable human bases
2. **Mixamo** for animation clips
3. export to **GLB**
4. optimize materials / texture sizes for browser
5. adapt wardrobe/colors to HermesWorld visual language

### Why this path
- gets believable humans fast
- works with browser GLB pipeline
- animation is solved sooner
- lets us focus on world + UX instead of making characters from zero

### First character set we need
- player base male
- player base female
- scholar / oracle NPC
- blacksmith / forge NPC
- guard / knight NPC
- merchant / villager NPC

Do **not** start with huge variety.
Get 4-6 great archetypes first.

## Animation pipeline

### First animation pack
Need:
- idle
- walk
- run
- talk / gesture
- inspect / use
- celebrate / emote
- sit or kneel if easy

### Character behavior goals
- no stiff statue NPCs
- idle should feel alive
- movement should read clearly from distance
- talking should feel intentional even before lip sync

## Environment upgrade priorities

## 1. Landmark pass
Every zone needs strong silhouette.

Immediate targets:
- Agora central monument / obelisk / sigil altar
- Oracle tower / ring structure
- Forge furnace / chimney / heat source
- Grove memory tree / crystal tree / archive roots
- Arena ring / banners / gates
- Training Grounds camp / gate / tutorial shrine

## 2. Ground + path pass
Fix the current "objects on a plane" feeling.

Need:
- stronger stone paths
- path borders
- elevation changes
- stairs / slopes / platform edges
- clustered vegetation instead of random scatter

## 3. Prop clustering
Move from generic scattered props to authored compositions.

Need:
- market stalls that actually compose into scenes
- bench / torch / crate / barrel clusters
- decorative banners and signposts
- repeating prop kits per zone

## 4. Lighting / atmosphere
Highest ROI visual upgrade.

Need:
- stronger key light direction
- fog / distance atmosphere
- warm firelight pools
- cooler shadow balance
- subtle bloom / post processing
- skybox that supports mythic mood

## Usability upgrade priorities

## 1. Readability of objective flow
The user should always know:
- where they are
- what to do next
- what is interactable
- what their agents are doing

### Immediate changes
- clearer quest objective widget
- stronger waypoint / marker language
- better hover/interact outlines
- more distinct NPC labels

## 2. HUD cleanup
Current HUD should feel more like a game and less like mixed prototype layers.

Need:
- one consistent HUD material language
- clearer bottom action bar
- tighter minimap frame
- cleaner player stats card
- less visual noise from debug/admin leftovers

## 3. Chat / social UX
Chat should not dominate the scene.

Need:
- smaller, cleaner chat panel
- better contrast and message hierarchy
- easier collapse/minimize behavior
- less overlap with gameplay space

## 4. Input / interaction cues
Need immediate affordances:
- interact prompt treatment
- click target confidence
- path-to-target feedback
- clearer selected NPC / object state

## Performance plan

This all has to stay browser-safe.

### Rules
- prefer **instancing** for repeated props
- reduce unique materials
- compress textures
- cap texture resolution aggressively
- use LOD where needed
- keep postprocessing restrained
- test draw calls after each art pass

### Budget mindset
For each major scene ask:
- how many characters on screen?
- how many unique materials?
- how many dynamic lights?
- how many transparent effects?

## Development tracks

## Track A — Characters
Deliver believable people fast.

### Start now
- choose character source
- pick 4-6 NPC archetypes
- pick 1 player archetype
- get GLB import path working cleanly
- wire idle + walk + talk test scene

## Track B — Agora visual remake
Use Agora as the first gold-standard zone.

### Start now
- rebuild central plaza composition
- improve stone ground / path circles
- add stronger firelight and monument detail
- replace placeholder NPC bodies with first believable characters

## Track C — HUD / usability pass
### Start now
- objective widget redesign
- minimap cleanup
- stats card cleanup
- interaction marker cleanup
- remove any workspace-local/debug carryover from game-facing UI

## Track D — Asset pipeline
### Start now
- standardize GLB imports
- define texture size limits
- define naming conventions
- define animation clip naming
- define NPC archetype list

## Immediate first sprint

### Sprint 1: "Agora believable"
Make only the Agora look and feel dramatically better.

Ship these first:
1. one upgraded player character
2. three upgraded NPC archetypes
3. better idle/walk/talk animations
4. rebuilt central plaza composition
5. better firelight/fog/post
6. cleaned HUD around objective + minimap + bottom bar

If Agora feels real, the rest of the world becomes believable.

## Exact first implementation steps

### Step 1
Replace current primitive character stand-ins with imported GLB humanoids.

### Step 2
Add animation controller for:
- idle
- walk
- gesture/talk

### Step 3
Rebuild Agora center using:
- stronger monument
- radial paving
- authored prop clusters
- meaningful NPC placement

### Step 4
Polish camera and UI for the new scene.

### Step 5
Capture screenshots/clips and tune from what looks weak.

## Success criteria

We know this is working when:
- a screenshot reads like a real game scene, not a prototype
- characters look like people, not placeholders
- the objective and interactions are obvious
- the page is clip-worthy on X
- the browser still runs smoothly

## My recommendation

Start **now** with:
1. character pipeline
2. Agora remake
3. HUD cleanup

That is the shortest path to the result you actually want.

## Immediate next task

Implement the first "Agora believable" pass:
- import better humanoid characters
- wire idle/walk/talk clips
- rebuild the central plaza composition around those characters
- tune lighting/fog/post
- clean HUD overlap
