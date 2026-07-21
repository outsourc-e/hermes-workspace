# HermesWorld Viral Sprint Handoff

Date: 2026-05-05 14:22 EDT
Owner: Eric / Aurora
Repo: `/Users/aurora/hermes-workspace`
Status: local-only, uncommitted, handoff for next Opus session

## What landed this session

### 1. HermesWorld landing was rebuilt into a standalone public surface
Routes in repo:
- `/hermes-world`
- `/world`

Key file:
- `src/screens/playground/hermes-world-landing.tsx`

Landing now has:
- world-first public launch structure
- hero, capability strip, launch-drop section, zones, agents, sigils, final CTA, footer
- GitHub / roadmap / feature-list links instead of local-only `/playground` public CTAs
- stronger HermesWorld-specific copy
- launch-day messaging like:
  - “Dropping HermesWorld today.”
  - landing page / roadmap / feature list / graphics sprint

### 2. HermesWorld landing now bypasses workspace chrome
The biggest source of confusion was root/app-shell leakage.

Fixed or partially fixed:
- `/hermes-world` and `/world` now bypass the **WorkspaceShell** and scroll like normal pages
- local-only workspace chrome removed from the landing route
- app splash skipped on HermesWorld landing routes
- route is intended to be document-scrollable, not app-pane scrollable

Touched:
- `src/components/workspace-shell.tsx`
- `src/routes/__root.tsx`

### 3. Multiple root-level overlays were traced and removed/gated
Found and addressed these root-level leak sources:
- `UsageMeter`
- `SearchModal`
- `KeyboardShortcutsModal`
- `UpdateCenterNotifier`
- `MobilePromptTrigger`
- `OnboardingTour`

Important note:
- Some of these were gated only for landing routes.
- Later, game surfaces like `/playground` also needed special treatment.

### 4. Bottom-right usage/session pill leak on HermesWorld/game surfaces was addressed
This `SESSION | IN | OUT | CTX | COST` widget was another workspace overlay leak.

Action taken:
- hid the global usage/session pill for **game surfaces**, not just the landing page

Touched:
- `src/routes/__root.tsx`

### 5. Sidebar overlap bugs in `/playground` were addressed
On 3002 with the left sidebar open, gameplay UI elements overlapped badly.

Fix direction implemented:
- made several game UI pieces sidebar-aware so they shift when the left sidebar is open

Touched:
- `src/screens/playground/components/playground-hud.tsx`
- `src/screens/playground/components/playground-chat.tsx`
- `src/screens/playground/playground-screen.tsx`

The intended fix was:
- use `useWorkspaceStore((s) => s.sidebarCollapsed)`
- shift HUD/chat/chips to `320px` left offset when sidebar is open
- keep `min(120px, 9vw)` behavior when collapsed

### 6. HermesWorld landing hero was shifted back toward the old glowing-orb vibe
Eric preferred the older orb-based entry/startup vibe over the framed screenshot-heavy top fold.

Action taken:
- hero switched to use `PlaygroundHeroCanvas`
- kept new landing structure/copy, but moved the visual style back toward orb glow / portal / startup energy

Touched:
- `src/screens/playground/hermes-world-landing.tsx`
- `src/screens/playground/components/playground-hero-canvas.tsx` (used, not necessarily modified)

### 7. HermesWorld copy cleanup
Removed more workspace-local carryover text from the landing.

Examples changed:
- `Hermes Workspace Experiment // Persistent Agent World`
  → `HermesWorld Preview // Persistent Agent World`
- `Hermes Workspace Connected`
  → `Live World Build`

### 8. Local preview/dev process debugging happened repeatedly
Root cause for a lot of weirdness:
- multiple Vite dev servers were fighting over `routeTree.gen.ts`
- this caused reload thrash, aborted requests, and “stopping mid-turn” feelings during local preview

Key reality:
- 3002/3003 reliability was not just “the site is broken”, it was also local dev process instability
- detached/nohup relaunches were used at points to keep things alive longer

### 9. Character/graphics pipeline scaffolding started in code
This was the first real gameplay/visual upgrade setup work.

Added:
- `src/screens/playground/lib/character-config.ts`
- `src/screens/playground/components/player-character.tsx`
- `src/screens/playground/components/npc-character.tsx`
- `src/screens/playground/components/playground-glb-body.tsx`
- `src/screens/playground/components/playground-player-glb.tsx`
- rewrote/normalized `src/screens/playground/components/playground-npc-glb.tsx`
- `public/assets/hermesworld/characters/README.md`

What this means:
- canonical asset path now exists for believable humanoid GLBs
- canonical path:
  - `/public/assets/hermesworld/characters/<id>.glb`
- legacy `/avatars-3d/<id>.glb` remains as fallback

### 10. Execution docs/specs were created
Created / updated:
- `docs/hermesworld/landing-page-spec.md`
- `docs/hermesworld/graphics-usability-plan.md`
- `docs/hermesworld/agora-believable-checklist.md`

These docs now encode the session’s design/implementation direction.

## What was accomplished, distilled

This session did **four big things**:

1. **Turned HermesWorld landing into a real standalone launch page** instead of a workspace-fragment/app-pane.
2. **Removed or traced most of the workspace chrome leaks** that kept showing up in HermesWorld surfaces.
3. **Stabilized the local direction** around world-first marketing, GitHub/public links, and the glowing-orb entry vibe.
4. **Started the real graphics/character pipeline** so the next session can move from planning into visible world upgrades.

## What still needs to be tackled for the redesign

### A. Final HermesWorld landing cleanup
Still verify/fix:
- no remaining root overlay leaks on `/hermes-world` or `/playground`
- no bottom-right usage/session pill anywhere on HermesWorld/game surfaces
- no mobile-access prompt / other workspace popups on HermesWorld routes
- no sidebar overlap edge cases on `/playground`

### B. Re-verify local previews cleanly
Need a fresh sanity pass on:
- `http://127.0.0.1:3002/hermes-world`
- `http://127.0.0.1:3002/playground`
- optional `3003` behavior if still used as redirect/entry

Need to ensure:
- landing looks correct
- game route has no overlapping HUD with sidebar open
- no stale cached bundle behavior

### C. Continue the real graphics redesign
Next actual game-side work should be:
1. integrate character boundaries into `playground-world-3d.tsx`
2. mount first `PlayerCharacter` / `NpcCharacter` path in the live Agora scene
3. begin **Agora Believable** pass:
   - plaza composition
   - better central monument
   - stronger paths/ground
   - better lighting/fog
   - better NPC placement
4. start replacing toy-like placeholder figures with believable humanoid pipeline

### D. Character asset pipeline needs real assets next
Need actual GLBs now, not just scaffolding.

Priority assets:
- `player-adventurer.glb`
- `oracle-scholar.glb`
- `forge-blacksmith.glb`
- `guard-knight.glb`
- `merchant-villager.glb`
- `villager-common.glb`

Recommended source path:
- Ready Player Me or similar base characters
- Mixamo for idle/walk/talk/use animations
- optimize to browser-safe GLB assets

### E. HUD/readability pass still needs deeper work
The sidebar-aware offset work started, but the full usability pass is still ahead:
- objective widget
- minimap polish
- action bar clarity
- interaction prompts
- NPC labels
- less prototype noise

## Most important next task for Opus

**Do not restart from brand strategy.**
The next session should continue directly into:

### Primary next task
Refactor `playground-world-3d.tsx` to mount the new character boundaries into Agora and start the first visible believable-character pass.

### Immediate sub-steps
1. inspect current player/NPC rendering in `playground-world-3d.tsx`
2. swap one player and one or two NPC stand-ins to the new component boundaries
3. improve Agora composition around those characters
4. re-check HUD overlap and root overlays in real local preview

## Files most likely to touch next

Landing / route chrome:
- `src/screens/playground/hermes-world-landing.tsx`
- `src/components/workspace-shell.tsx`
- `src/routes/__root.tsx`

Game / graphics:
- `src/screens/playground/components/playground-world-3d.tsx`
- `src/screens/playground/components/playground-hud.tsx`
- `src/screens/playground/components/playground-chat.tsx`
- `src/screens/playground/playground-screen.tsx`

Character pipeline:
- `src/screens/playground/lib/character-config.ts`
- `src/screens/playground/components/player-character.tsx`
- `src/screens/playground/components/npc-character.tsx`
- `src/screens/playground/components/playground-glb-body.tsx`
- `src/screens/playground/components/playground-player-glb.tsx`
- `src/screens/playground/components/playground-npc-glb.tsx`
- `public/assets/hermesworld/characters/*`

Planning docs:
- `docs/hermesworld/landing-page-spec.md`
- `docs/hermesworld/graphics-usability-plan.md`
- `docs/hermesworld/agora-believable-checklist.md`

## Local-state warning
This is still **local-only** and likely **uncommitted**.
There are multiple in-progress modifications in the repo. Do not assume a clean branch. Be careful not to clobber unrelated local work while continuing.

## One-line resume prompt

Resume the HermesWorld redesign from the current local-only state. First verify the landing/game surfaces are free of workspace overlay leaks, then continue the **Agora Believable** pass by wiring the new character pipeline into `playground-world-3d.tsx` and replacing placeholder figures with the first believable humanoid boundaries.
