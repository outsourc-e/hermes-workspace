# Agora Center Implementation Plan — Inso Reference

Reference: `docs/hermesworld/reference-images/agora-center-inso-reference.jpeg`

## What the reference proves

The target is not just higher-poly models. It is a composed game screen:

- isometric/third-person camera angled down into a lively plaza
- circular stone hub with central monument/obelisk
- readable NPC labels and clusters
- warm torchlight and blue roof accents
- rich ground detail: grass, flowers, path seams, market stalls, benches
- HUD islands instead of slabs:
  - player/status top-left
  - objective top-center
  - minimap top-right
  - chat bottom-left
  - action bar bottom-center
  - quick tools right edge
- environment density around the edges, clear walkable center

## Target for HermesWorld v0.3

Create an Agora scene that feels like the reference while staying browser-native:

1. Replace empty/flat hub with a circular plaza composition.
2. Add a central landmark/monument that acts as spawn anchor.
3. Place NPCs around the ring, not randomly.
4. Add market stalls, benches, torches, foliage, and portal gate silhouettes.
5. Make minimap and objective HUD visually match game style.
6. Keep mobile HUD separate, not a squeezed desktop version.

## Implementation slices

### Slice 1 — Layout/composition

Files likely touched:
- `src/screens/playground/components/playground-world-3d.tsx`
- `src/screens/playground/components/playground-environment.tsx`
- `src/screens/playground/components/playground-minimap.tsx`

Tasks:
- Add `AgoraCommons` component.
- Build circular plaza with stone rings/tiles.
- Add central obelisk/monument.
- Move NPCs to named anchor points around the ring.
- Add walkable clear center.

Acceptance:
- desktop screenshot reads as an Agora hub from zoomed-out camera.
- NPCs are not visually piled up.

### Slice 2 — Lighting/material realism

Tasks:
- warm torch/lantern lights around ring
- blue/cyan roof/portal accents
- contact shadows, ambient occlusion/postprocessing if performant
- textured-looking procedural stone via repeated geometry/material variation

Acceptance:
- screenshot has depth, focal point, and warm/cool contrast.

### Slice 3 — Prop density

Tasks:
- stalls with colored awnings
- benches
- barrels/crates/pots
- flower/grass clusters
- path edge stones
- small portal booth/gate

Acceptance:
- edges feel alive while center remains playable.

### Slice 4 — HUD/game readability

Tasks:
- top-left status card compact
- top-center objective card compact
- top-right minimap card styled like reference
- bottom-center action bar
- bottom-left chat collapsed/compact

Acceptance:
- no top clutter, clear objective, map, status.

### Slice 5 — Asset upgrade loop

Tasks:
- generate/refine zone art, NPC portraits, item icons, sigils
- place assets in UI
- screenshot
- vision review
- revise

Acceptance:
- one browser screenshot side-by-side with reference showing visible convergence.

## Swarm assignment

- Mobile UX lane: HUD and no-scroll constraints.
- Gameplay/world lane: Agora anchors, NPC composition, plaza component.
- Art lane: generated assets, material references, UI icon set.
- Reviewer lane: performance, bundle size, client-secret safety.

## Hard constraints

- No client-side prize secrets.
- No giant PR.
- Keep generated assets optimized.
- Preserve hosted-runtime architecture.
- Mobile must be tested separately.
