# War Room v1 Phase 10 general/advisor unit asset contract

Status: PASS / art-direction contract only
Owner lane: artdirector
Date: 2026-06-12
Scope: documentation-only. This contract does not generate images, copy assets, integrate runtime art, edit app/source/public asset paths, mutate Kanban from the War Room UI/API, or authorize live/external actions.

## Safety statement

Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED; only mock/theoretical/read-only UI is allowed. No shop/supplier/paid/live actions and no Kanban mutations from the War Room route/UI/API.

## Purpose

Phase 9 proved the `local-hermes-kanban` followed mission path, deterministic unit hooks, route/state evidence, visible `NOT CONNECTED` safety copy, and read-only mutation guards. The remaining visual gap is that the followed unit still uses temporary CSS/block prototype art.

Phase 10 defines the first real GBA/Pokemon-readable historical strategy `general/advisor` unit asset family. It replaces the current temporary CSS/block unit direction conceptually, but this card must not integrate anything. Future workers may use this contract to write prompts, perform prompt QA, generate one candidate family into candidate-only paths, and only later ask technical art / visual QA / architecture / integration lanes to decide whether a bounded integration is safe.

## Target visual style

The unit family must read as a clean GBA/Pokemon-like historical strategy unit family:

- Small, clean, very readable pixel/2D top-down or three-quarter top-down units.
- Historical command-board flavor: generals, advisors, captains, inspectors, craftsmen, and gate sentinels standing on a strategy map.
- Unified mixed-empires palette across Rome, Greece, Napoleon-era command, and Asia/East; it must feel like one coherent imperial strategy game, not a collage of unrelated costume references.
- Premium through silhouette, palette discipline, outline quality, and state readability, not through noisy lighting or HD detail.
- Designed for a central war-table / mission-map interface with moving agents and lifecycle states.
- no flat SaaS/glassmorphism. HTML overlays may exist later as diegetic plaques/scrolls/seals, but the unit sprites themselves must never look like dashboard icons, pills, KPI dots, or glass cards.
- Not photorealistic, not 3D, not sci-fi dashboard, not giant character portrait art.

## Unit identities

All identities must share the same body scale, palette logic, outline thickness, facing rules, and animation/state vocabulary. Identity differences should be readable at small size through helmet/hat shape, shoulder/cape silhouette, held prop, accent color, and stance.

| Identity | In-world read | Core silhouette cues | Palette/accent guidance | Use in lifecycle |
| --- | --- | --- | --- | --- |
| `vision-architect/advisor` | strategic advisor / map-reader | slim advisor cloak, scroll or pointer, slightly taller hat/hood, calm stance | indigo, parchment, muted gold | planning, triage, scope review, roadmap/spec tasks |
| `implementer/general` | field general / builder commander | compact helmet or bicorne-like command hat, short cape/banner tab, strong forward stance | deep red, bronze, navy | ready, claimed, active work, implementation tasks |
| `qa-agent/review-captain` | inspection captain | small clipboard/tablet-as-scroll, officer sash, squared shoulders | teal, white, brass | `qa-review`, test/build/browser inspection, evidence checking |
| `reviewer` | senior reviewer / release marshal | darker mantle, seal stamp or monocle-like inspector cue, still authoritative pose | purple, blackened brass, ivory | overclaim review, release-readiness review, final claim checks |
| `technical-artist` | sprite engineer / forge artisan | small tools, apron/sash, compact work posture, visible craft prop | orange, steel, brown leather | alpha cleanup, proof sheets, normalization, sprite sheet handoff |
| `gate-warden` | safety lock sentinel | stout guard silhouette, locked shield/seal, planted feet | dark blue, iron, warning amber | blocked, approval-required, parent-waiting, stale/risk states |

## Required asset states

Each state must be defined before any image generation. Future prompts may request a subset only if they explicitly name the selected identity and state family, but the full family vocabulary is:

| State | Visual behavior | Required readability at reduced motion / still frame |
| --- | --- | --- |
| `idle` | subtle standing loop or single resting pose at the current station | identity and facing remain readable without animation |
| `walk` | 2-4 frame travel cycle for station-to-station route movement | one still frame must still look like the unit is traveling, not floating |
| `work` | focused station action: pointing, writing, hammering, commanding, or inspecting depending on identity | pose must imply active work without needing particles/text |
| `qa-review` | inspection stance with scroll/check/seal/proof cue | must read as review/inspection, not generic work |
| `blocked` | stopped posture, guard/seal/wait cue, no fake progress | must read as halted/needs input and remain calm, not error-alarm spam |
| `approval-required` | mission packet / seal posture directed toward central command table | must read as locked pending DLV decision, not approved/completed |
| `completed-archived` | relaxed return-to-archive or stamped victory-ledger pose | must read as resolved/archived, not active work |

## Sprite and candidate requirements

Future generated candidates must satisfy all of these requirements before they can be considered for prompt QA, technical art, visual QA, or integration:

1. Transparent background: output must be transparent PNG/WebP or otherwise technically alpha-verifiable after normalization. No opaque floor, backdrop, parchment, room wall, panel, card, or sky baked behind the unit.
2. No baked text/UI: no labels, gibberish letters, UI controls, task cards, buttons, status badges, stats, speech bubbles, or readable/unreadable text baked into the sprite.
3. No room scene: the unit asset is a character/sprite family only. It must not include a war room, command table, station prop, map tile, floor base, scene lighting, or one-piece composition.
4. No generic blob: silhouette must be a deliberate historical general/advisor/captain/warden at small size, not an anonymous circle, token, pawn, emoji, plastic toy, or cheap blob.
5. Small readable silhouette: must survive at the Phase 9 followed unit footprint and be readable as a map unit, not a full-body front-facing RPG model. The sprite should prioritize head/hat/shoulder/prop outline over facial detail.
6. Direction/facing rules: default candidate family should include a three-quarter top-down south/east or south/west facing stance suitable for the current map perspective. If walk frames are produced, the facing must remain consistent; no front-facing portrait stance unless a future manifest explicitly asks for a UI portrait.
7. Scale against Phase 9 followed unit footprint: must fit the current followed-unit visual slot proven in Phase 9 QA. It should read in the same on-map footprint as the prototype unit and leave transparent padding for animation without clipping. Candidate review must compare against the Phase 9 manifest and screenshots before integration.
8. Reduced-motion still/readability rules: every state must have a still frame that communicates identity, lifecycle, station intent, and safety state without relying on animation, blur, particles, glow, or text.
9. Candidate-only path discipline: all generated files must remain outside live/public runtime paths until later gates pass. Acceptable first candidate path family: `generated-candidates/war-room/v1/agent-units/general-advisor/v1/`. Do not copy to `public/war-room`, runtime manifests, app source, release packages, or asset registry live entries from this contract alone.
10. Source/provenance discipline: future candidate metadata must include prompt id, generated time, local path, intended identity, states included, transparent-background claim, and explicit candidate-only status.
11. No final-art claim: candidates are candidate-only until technical art, visual QA, architecture/integration, and release review all pass. This contract does not approve any asset as final, premium, perfect, DLV-approved, or release-ready.

## Unified palette and style rules

Use one mixed-empires art language rather than separate costume sets:

- Shared outline: crisp dark outline or controlled edge treatment suited to GBA/Pokemon readability.
- Shared base neutrals: parchment cream, warm stone, dark navy, weathered bronze, leather brown.
- Role accents: one small accent family per identity; avoid rainbow role chaos.
- Historical hints only: helmets, bicornes, lamellar/robe shapes, Roman/Greek/Napoleonic/East-Asian cues may be blended, but no exact real-world flag, insignia, modern uniform, or political symbol should dominate.
- Avoid glow-heavy JARVIS/sci-fi effects. Subtle route/status overlays can be handled later by UI/manifest layers, not baked into the unit.

## Minimal first-candidate recommendation

Generate exactly one identity/state family first in a later card:

Recommended first family: `qa-agent/review-captain` with states `idle`, `walk`, `work`, and `qa-review`.

Reason: Phase 9's followed `local-hermes-kanban` screenshot/manifest currently centers a `visualqaagent` unit in `qa-review` on route `active-to-qa`, with prototype art disclosed as non-final. Replacing this single followed QA/review-captain family first gives the clearest before/after proof against existing Phase 9 evidence, exercises the most visible review lifecycle, and avoids expanding into every role before prompt QA and technical art prove the style is viable.

Do not generate all identities at once. Do not generate all seven states at once unless prompt QA explicitly approves a tiny proof-sheet request for the selected `qa-agent/review-captain` family. The first candidate should be a controlled style anchor, not a batch.

## Reject list for ChatGPT / prompt output

Reject any prompt or generated candidate that contains or encourages:

- Non-transparent backgrounds, baked floor tiles, paper/cards, room backdrops, screenshots, UI frames, or scene lighting.
- Baked text, gibberish, fake UI labels, buttons, task cards, dashboards, captions, logos, or readable/unreadable inscriptions.
- Photorealism, 3D renders, plastic figurines, clay/toy style, cinematic game key art, or sci-fi dashboards.
- Giant portraits, busts, full-body front-facing RPG character models, or character-sheet poses that cannot function as small map units.
- Cheap blobs, emoji tokens, board-game pawns, anonymous circles, generic robot icons, generic office avatars, or SaaS status dots.
- One-piece room scenes, complete war tables, command rooms, floor bases, station props, or all-in-one final-room PNGs.
- Unrelated ecommerce, supplier, AliExpress/Alibaba, Etsy, ShotLab, jewelry, product-listing, ad, or marketplace imagery.
- Flat SaaS/glassmorphism, KPI card styling, neon glass panels, enterprise dashboard widgets, or monitor-wall UI as the main visual language.
- Excessive glow, smoke, particles, magic aura, lens flare, or noise that hurts small-size readability.
- Modern guns, modern tactical gear, corporate badges, real national flags, copyrighted game characters, or political symbols.

## Downstream gate expectations

1. `promptqaagent` reads this contract and writes prompt-readiness QA before any generation. It must reject prompts that allow non-transparent backgrounds, baked text/UI, giant scenes, generic blobs, non-GBA/non-historical drift, or flat SaaS/glassmorphism.
2. `assetcreator` may generate exactly one candidate family only after prompt QA PASS, and only under candidate-only paths such as `generated-candidates/war-room/v1/agent-units/general-advisor/v1/`.
3. `technical-artist` inspects alpha, dimensions, transparent padding, proof sheets, scale against the Phase 9 followed unit footprint, and state completeness. No live promotion.
4. `visualqaagent` compares candidate proof sheets to the Phase 9 screenshots/manifest and final vision. PASS requires a small readable historical strategy general/advisor unit at War Room scale.
5. `claudearchitect` may write a bounded integration contract only after candidate QA passes.
6. `codexintegrator` may integrate only after an architecture contract authorizes exact files and read-only safety gates.
7. `releaseagent` remains separate and must not claim release readiness from this document.

## Explicit forbidden scope for this contract

- No edits to `src/`, `public/war-room/`, generated-candidates, runtime manifests, package files, API routes, asset registry, or release docs.
- No image generation and no asset copying.
- No app integration or CSS replacement work.
- No live/public asset promotion.
- No final/premium/perfect/release-ready claims.
- No real Etsy/shop/supplier/AliExpress/Alibaba/ShotLab/API/account connection, write, purchase, paid generation, publish, listing edit, message, refund, renewal, ad, or account action.
- No War Room route/UI/API Kanban mutations. The War Room UI/API remains read-only and must not create, dispatch, complete, unblock, archive, approve, POST, PATCH, or DELETE Kanban lifecycle data.

## Exit verdict

PASS: Phase 10 art-direction unit asset contract ready.
