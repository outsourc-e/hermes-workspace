# HermesWorld Character Assets

Drop character GLBs here.

## Canonical path

Characters should live at:

- `/public/assets/hermesworld/characters/<id>.glb`

Examples:
- `player-adventurer.glb`
- `oracle-scholar.glb`
- `forge-blacksmith.glb`
- `guard-knight.glb`
- `merchant-villager.glb`
- `villager-common.glb`

## Source pipeline

Recommended source order:
1. Ready Player Me or similar believable humanoid base
2. Mixamo animation clips
3. GLB export
4. browser optimization

## First animations to support
- idle
- walk
- run
- talk
- inspect
- use

## Naming rules
- lowercase kebab-case ids
- keep one archetype per file
- prefer shared rigs
- keep texture/material counts low
