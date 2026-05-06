# HermesWorld Swarm Game Architecture

Last updated: 2026-05-06

## Core idea

HermesWorld should be built like an agent-native game studio:

- one orchestrator owns product direction and integration
- workers own bounded systems
- every lane ships proof-bearing artifacts
- integration happens through small PRs/patches, not one giant branch
- prize/easter-egg security is server-authoritative and private

## Runtime direction

- Hermes Workspace embeds hosted HermesWorld via iframe.
- HermesWorld runtime lives on `hermes-world.ai`.
- Workspace remains OSS shell/distribution.
- Game/prize-sensitive logic moves behind hosted/private services.

## Current practical stack

- React + TypeScript
- Three.js / React Three Fiber
- Drei ecosystem
- Cloudflare Pages + Workers
- WebSocket relay for multiplayer
- localStorage/IndexedDB for casual local story saves
- private prize oracle for valuable claims

## Swarm lanes

### Lane A — Shell/mobile UX

Goal: make HermesWorld playable on phones.

Outputs:
- fixed viewport, no document scroll
- mobile HUD island layout
- collapsible objective/chat
- actual mobile smoke notes

Stop condition:
- build passes and screenshot/description proves no scroll/clutter regression

### Lane B — World/gameplay systems

Goal: make the game loop feel real.

Outputs:
- quest/event system boundaries
- NPC dialog/state model
- inventory/title/reward system cleanup
- agent action API shape

Stop condition:
- minimal patch or spec with exact files and interfaces

### Lane C — Content/easter eggs

Goal: ship discoverability and lore without leaking prizes.

Outputs:
- public lore/easter egg layer
- private prize-oracle interface
- 7-sigil hunt design
- decoy vs prize-sensitive boundary

Stop condition:
- no hardcoded prize coordinates/secrets in client

### Lane D — Infra/multiplayer/prize oracle

Goal: server-authoritative backbone.

Outputs:
- Cloudflare Worker architecture
- claim endpoint contract
- wallet signed-message flow
- anti-cheat/rate-limit/event-log model

Stop condition:
- private-service spec and stubs only unless secrets are available

### Lane E — Art/assets/procedural generation

Goal: make zones look better fast.

Outputs:
- asset pipeline recommendation
- glTF/low-poly style guide
- prompt library for Meshy/Tripo/Spline/Codex asset generation
- zone visual pass plan

Stop condition:
- 5 concrete tools/prompts/assets to test this week

### Lane F — Integration reviewer

Goal: prevent swarm chaos.

Outputs:
- review every lane for overlap/security/perf
- enforce small patches
- reject client-side secrets
- merge order recommendation

## Integration rules

1. No prize secrets in client code.
2. No giant PRs unless explicitly approved.
3. Every worker reports:
   - files changed
   - commands run
   - result
   - blocker
   - next action
4. Main session decides merges.
5. Mobile UX must be tested as a viewport constraint, not guessed.

## Immediate mission

1. Fix Workspace embed nav regression, done via PR #354.
2. Research best 2026 AI game stack, dispatched to swarm7.
3. Dispatch parallel lanes:
   - swarm3: mobile UX repair
   - swarm4: gameplay systems architecture
   - swarm10: easter egg/prize boundary
   - swarm12: integration/security reviewer
4. Convert outputs into small PRs/specs.
