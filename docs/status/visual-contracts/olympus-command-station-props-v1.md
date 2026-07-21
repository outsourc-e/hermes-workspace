# Olympus Command station props — modular asset contracts v1

Status: design contract only; not generated, not integrated, not approved as live app art.
Scope: Olympus Command station-prop family that will sit on the candidate-c mythology/history floor package after separate prompt, generation, asset QA, slicing, registry, manifest, integration, browser QA, and release review steps.

## Safety statement

This document is contracts only. It is not ChatGPT image generation, not ShotLab/premium generation, not app integration, not a live asset promotion, and not a public-path copy. No Etsy/shop/supplier/ShotLab paid/live connections or writes are allowed or implied. Candidate-c remains a non-live package-ready floor candidate with caveat; candidate-b remains rejected/withheld and must not be promoted.

## Shared art direction

The props must read as a living Olympus/JARVIS command world: ancient Greek / Hellenistic command chamber, historical strategy-room craft, and subtle Hermes signal energy. The dominant language is mythology/history first: carved dark marble, aged bronze, antique gold inlay, temple geometry, Greek-key borders, parchment/campaign-map materials, votive stone, caduceus/wing motifs only as abstract ornament. Cyan JARVIS/Hermes energy may appear as a restrained glow/accent, never as the main theme.

These assets are semantic layers over the floor base, not one baked room scene. Each asset must be separately movable/scalable in the room manifest and must leave room for agents/operators, highlights, and real HTML/UI overlays.

## Universal production requirements

- Output role: transparent prop/station PNG or WebP candidate, not a full-room background.
- Background: transparent alpha required for every station prop in this contract.
- Composition: direct-overhead or very shallow orthographic angle compatible with a 16:9 top-down floor base.
- No baked UI: no readable text, pseudo-text, buttons, labels, charts, dashboards, screens, progress bars, or data cards inside the image.
- HTML/UI separation: all actual text, controls, numbers, statuses, locks, and cockpit content must be rendered by the app later as accessible UI overlays, not painted into the asset.
- Modular edges: avoid heavy cast shadows that assume one exact floor position; soft contact shadow is acceptable if it does not break relocation.
- Anchor/operator space: every prop must include a clear click/focus anchor and leave nearby empty floor space for one Hermes/operator sprite plus highlight rings.
- Forbidden global drift: generic sci-fi console, cyberpunk command center, neon dashboard, SaaS admin panel, monitor wall, spaceship cockpit, hologram UI spam, shop/Etsy/business imagery, people/gods/statues/avatars baked into the prop, giant final-room PNG.

## Asset contracts

### 1. Council War Table

Asset id: `station_council_war_table`
Purpose: central strategic station for mission intake, high-level Kanban/campaign planning, and JARVIS recommendations. It should feel like the council table of Olympus where decisions are weighed before dispatch.
Suggested size/aspect: 1600 x 1000 px transparent canvas; prop footprint should remain horizontally broad but not fill the full canvas. Preserve transparent padding around the table for glow/highlight and placement tuning.
Transparent requirement: required; alpha background, no baked floor.
Visual anchors:
- Antique bronze and dark marble campaign table.
- Inlaid Greek-key border around table edge.
- Subtle parchment/campaign-map surface shapes without readable labels or symbols.
- Abstract wing/caduceus ornament at corners or table legs, small and non-logo-like.
- Warm antique-gold rim with very restrained cyan signal fissures/inlay.
Forbidden drift:
- No modern conference table, sci-fi touchscreen slab, holographic map UI, colored charts, text labels, monitor panels, board-game tokens with readable marks, or central logo/sigil dominating the prop.
No baked text/UI: map marks may be abstract terrain/route shapes only; all mission names, cards, approvals, and recommendations come from later HTML overlays.
Anchor/operator space: primary click anchor at center of tabletop; leave open floor at bottom/front edge for 1–2 operator sprites and a readable selection halo.
QA acceptance criteria:
- Reads as mythic/historical strategy furniture before it reads as JARVIS tech.
- Transparent alpha verified; no rectangular background residue.
- Usable as a central room prop without hiding future station zones.
- Contains no readable/pseudo-readable text or dashboard elements.

### 2. Mission Board

Asset id: `station_mission_board`
Purpose: vertical/raised mission planning station for viewing Kanban state, mission queues, and task pathways. It is the in-world object DLV clicks before the real mission cockpit opens.
Suggested size/aspect: 1100 x 1400 px transparent canvas; tall/standing board with enough top padding for highlight effects.
Transparent requirement: required; alpha background, no wall baked behind it unless the wall piece is part of the transparent freestanding prop.
Visual anchors:
- Bronze-framed campaign board or carved stone stela with parchment panels.
- Temple-column side supports, Greek-key trim, wax-seal-like ornaments.
- Abstract thread/route lines and empty plaque shapes only; no readable marks.
- Small Hermes wing motif at crown or feet, treated as antique ornament.
Forbidden drift:
- No Trello-like cards, sticky notes with fake text, futuristic monitor, terminal screen, kanban dashboard, glass UI slab, or app screenshot look.
No baked text/UI: board surface may show empty tablets/panels/route marks; real task names/status chips must be HTML overlays later.
Anchor/operator space: click anchor at central board surface; leave clear floor area in front/lower side for one operator and focused station highlight.
QA acceptance criteria:
- Looks like historical command planning furniture, not a software board.
- Has clear readable silhouette at room scale.
- Transparent with no baked background/floor.
- Empty enough for future UI overlay without clutter.

### 3. JARVIS / Omen Beacon

Asset id: `station_jarvis_omen_beacon`
Purpose: mythic signal beacon for concise JARVIS Omens, system awareness, and recommendations. It should feel like an oracle flame/signal column inside Olympus Command, not a computer terminal.
Suggested size/aspect: 900 x 1400 px transparent canvas; vertical beacon/pedestal with glow kept inside alpha canvas.
Transparent requirement: required; transparent alpha including glow falloff where possible.
Visual anchors:
- Marble oracle pedestal, bronze tripod, laurel/wing/caduceus-inspired abstract forms.
- Soft cyan/blue-white omen flame or signal plume, secondary to stone/bronze base.
- Ancient votive/oracle language with premium museum-quality finish.
Forbidden drift:
- No robot head, AI logo, holographic assistant avatar, chat bubble, monitor, waveform UI, neon sci-fi column, or readable prophecy text.
No baked text/UI: the beacon may emit abstract light only; actual omen text must live in the app's JARVIS/Omen panel.
Anchor/operator space: click anchor at beacon flame/core; leave front-left or front-right floor pad for Hermes/operator sprite and voice/listening animation.
QA acceptance criteria:
- Immediately communicates oracle/omen beacon with subtle JARVIS energy.
- Glow does not create a hard rectangular alpha edge.
- No face/avatar/text/screen is baked into the image.
- Silhouette remains identifiable at small room scale.

### 4. Approval Seal / Shrine

Asset id: `station_approval_seal_shrine`
Purpose: sacred approval gate for risky decisions. It represents DLV consent, lock/unlock rituals, and explicit human approval before any dangerous action.
Suggested size/aspect: 1000 x 1000 px transparent canvas; compact shrine/seal footprint with strong iconographic silhouette.
Transparent requirement: required; alpha background.
Visual anchors:
- Small marble shrine or raised plinth with antique-gold seal ring.
- Wax seal / signet / laurel / Greek temple mini-architecture.
- Subtle locked-gate visual language through abstract closed ring or clasp, not a modern padlock icon unless highly stylized as ancient metalwork.
- Warm ceremonial lighting with restrained cyan edge glow for active approval state.
Forbidden drift:
- No modern padlock UI, red alert dashboard, approval button, legal form, text labels, thumbs-up/checkmark icon, or e-commerce/payment imagery.
No baked text/UI: approval status, risk copy, and buttons must be HTML/UI overlays later.
Anchor/operator space: click anchor at central seal; leave clear circular interaction zone around shrine for focus ring and agent kneel/stand pose.
QA acceptance criteria:
- Reads as solemn mythic approval shrine, not a settings/control widget.
- Communicates locked/consent-required state without text.
- Transparent alpha and compact footprint support multiple room placements.
- Does not imply actual marketplace/store action.

### 5. Gateway Dispatch Console

Asset id: `station_gateway_dispatch_console`
Purpose: dispatch station for safe worker routing, Gateway/agent launch status, and approved Kanban execution. It should be a mythic messenger/portal console rooted in Hermes, not a spaceship cockpit.
Suggested size/aspect: 1300 x 1000 px transparent canvas; medium-wide station with portal/console silhouette.
Transparent requirement: required; alpha background.
Visual anchors:
- Bronze-and-marble messenger altar with winged side elements.
- Abstract portal arch, caduceus-inspired conduit, or messenger route motif.
- Small energy channels indicating dispatch flow, cyan as accent only.
- Historical courier/command-post feel: tablets, scroll slots, signal basins, not screens.
Forbidden drift:
- No server rack, terminal, monitor bank, network diagram, spaceship helm, neon portal dominating the room, code/log text, or app dashboard panels.
No baked text/UI: worker names, statuses, errors, route labels, and dispatch controls must be later overlays/cockpit content.
Anchor/operator space: click anchor at central portal/altar core; leave side approach lane for operator sprite and room-pathing.
QA acceptance criteria:
- Hermes messenger/dispatch identity is clear through form and ornament, not logos/text.
- Looks compatible with ancient command chamber materials.
- Has no readable logs/statuses/buttons.
- Transparent prop can sit on candidate-c floor without covering the floor's open center excessively.

### 6. Safe Autonomy Mode Pedestal

Asset id: `station_safe_autonomy_mode_pedestal`
Purpose: visible autonomy/safety-mode control station for Observer / Planner / Safe Build / Full Ops concepts, with risky states clearly separated in future UI overlays. It symbolizes bounded autonomy under DLV control.
Suggested size/aspect: 1000 x 1200 px transparent canvas; upright pedestal/control plinth with layered tiers.
Transparent requirement: required; alpha background.
Visual anchors:
- Tiered marble pedestal with bronze rings or four abstract mode stones/sockets.
- Ancient mechanism language: astrolabe, voting stones, temple dial, oracle basin.
- Restrained cyan/blue-white glow only on the currently active abstract socket area, if any.
- Premium carved-stone and antique-metal craft.
Forbidden drift:
- No toggle switch UI, segmented control, modern dashboard, giant glowing button, warning panel, fake labels, progress meters, or sci-fi reactor core.
No baked text/UI: mode names and permissions must be rendered as real UI later; prop can have four unlabeled sockets/tiers only.
Anchor/operator space: click anchor at top dial/core; leave front clear area for DLV/operator sprite and for a visible safe/locked highlight ring.
QA acceptance criteria:
- Reads as a mythic control pedestal for bounded autonomy, not a generic control panel.
- Four-mode concept can be inferred from form without text.
- Transparent alpha and restrained glow support layered placement.
- Does not visually promise unrestricted or live external actions.

## QA acceptance criteria for the prop family

A generated prop candidate passes this contract only if all of the following are true:

1. Each asset is a separate transparent layer with clean alpha, not a baked room image.
2. The prop sits naturally on the candidate-c mythology/history floor direction: Greek/Hellenistic, dark marble, bronze/antique gold, temple geometry, serious strategy-game/museum quality.
3. JARVIS/Hermes signal energy is subtle and secondary, never generic sci-fi/dashboard dominant.
4. No asset contains readable text, pseudo-text, UI widgets, charts, monitor screens, app cards, shop/Etsy/business imagery, people, gods, avatars, or statues.
5. Each prop has a clear click/focus anchor and nearby operator/agent space.
6. Each prop leaves room for real accessible HTML overlays/cockpits and does not force text into the art.
7. The family feels cohesive in material, scale, perspective, and lighting while preserving distinct silhouettes per station.
8. Candidate outputs remain outside `public/war-room` until separate asset QA, registry/provenance, manifest placement, browser/visual QA, and release review approve integration.

## Next production-line handoff

This contract is ready for a future Prompt Architect card to translate into a strict prompt pack. The next step must still be prompt QA before any ChatGPT generation. No image generation or app integration is authorized by this document.
