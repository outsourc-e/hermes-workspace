# Agora Believable Checklist

Status: active first implementation slice
Owner: Eric / Aurora

## Objective
Turn Agora into the first zone that feels like a real game scene instead of a promising prototype.

## Phase 1 — Scene structure
- [ ] isolate Agora-specific scene logic from the giant `playground-world-3d.tsx`
- [ ] identify current player model/render path
- [ ] identify current NPC render path
- [ ] define where `PlayerCharacter` and `NpcCharacter` will mount

## Phase 2 — Characters
- [x] scaffold character archetype config
- [x] scaffold `PlayerCharacter` component boundary
- [x] scaffold `NpcCharacter` component boundary
- [ ] replace one player stand-in with `PlayerCharacter`
- [ ] replace one guard/oracle NPC stand-in with `NpcCharacter`
- [ ] wire label + selection behavior to new character components

## Phase 3 — Agora composition
- [ ] strengthen central monument silhouette
- [ ] improve radial stone paving / circular plaza readability
- [ ] cluster benches / stalls / torches more intentionally
- [ ] place NPCs in authored conversational groups
- [ ] remove any obviously toy-like placeholder blocking

## Phase 4 — Lighting and atmosphere
- [ ] improve key light direction
- [ ] add stronger warm firelight pools
- [ ] add controlled fog / distance atmosphere
- [ ] tune bloom/post so the scene feels rich, not blurry

## Phase 5 — HUD and readability
- [ ] tighten objective panel
- [ ] reduce minimap visual noise
- [ ] improve NPC label readability
- [ ] improve interaction prompts
- [ ] make bottom action bar read more like game UI, less prototype

## Success criteria
- [ ] player character looks like a believable human silhouette
- [ ] at least 3 NPCs feel believable and differentiated
- [ ] Agora screenshot looks postable on X without apology
- [ ] objective flow is obvious at first glance
- [ ] no leftover workspace-local chrome leaks into the public/game-facing surface
