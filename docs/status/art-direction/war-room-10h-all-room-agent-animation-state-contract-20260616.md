# War Room 10h — all-room agent animation asset/state contract

Created: 2026-06-16
Owner lane: artdirector
Task: `t_84ce9a68`
Status: PASS / animation contract + placeholder manifests only
Workspace boundary: `/Users/mac/hermes-workspace` only
Supersets parent contract: `docs/status/art-direction/war-room-10h-connected-cells-agent-motion-contract-20260616.md`

## 0. Safety and honesty locks

- This card creates a contract, prompts, and local manifest placeholders. It does not generate final/premium image assets and does not wire runtime React code.
- Candidate paths are local placeholders until separate asset generation, technical-art normalization, visual QA, implementation, and no-overclaim gates pass.
- No live Etsy/shop/supplier/publishing/paid-generation/account/message/order/refund/purchase/Discord/external action is allowed or implied.
- All connector and commerce visuals must remain `read-only`, `dry-run`, `draft-only`, `manual-only`, `approval-gated`, or `locked`.
- Reduced-motion stills are required; animation must explain workflow state, not decorate randomly.

## 1. Required global state vocabulary

| State | Contract |
| --- | --- |
| `idle` | 4 frames target: breathing, head turn, tool settle; fallback 1 still frame with no CSS halo. |
| `walk` | 8 frames per E/W direction target plus mirrored N/S if available; fallback 4 E + mirrored W; minimum 2-frame purposeful step for first slice. |
| `work` | 6 frames target at station-specific tool; fallback 2 frames or a still pose plus station effect, labelled temporary. |
| `talk` | 4 frames target: mouth/hand gesture/speech-bubble beat; fallback 1 talk pose plus live HTML bubble. |
| `carry-packet` | 6 frames target: walk-with-scroll/crate/orb; fallback carry overlay pinned to hand plus walk loop. |
| `rest` | 6 frames target in lounge pose; fallback 1 seated/relaxed still, never fake work. |

State aliases allowed in code/manifests: `walk-east`, `walk-west`, `walk-north`, `walk-south`; `carry-packet` may use `carry-scroll`, `carry-crate`, `carry-lock`, or `carry-tablet` as visual subtypes while preserving the canonical state name.

## 2. Frame-count target and fallback strategy

| Asset tier | Target | Fallback | Promotion gate |
| --- | --- | --- | --- |
| Atlas miniature agent | 48x48 frame, 8 columns x 7 rows = 56 frames per room agent | 48x48, 4 walk frames, 1-2 frames for other states; static first frame must read clearly | Contact sheet + alpha/background QA + runtime clipping QA |
| Full room popup operator | 96x96 frame, 8 columns x 7 rows = 56 frames per room agent | 96x96 still/2-frame loops for idle/work/talk/rest until remade | Room popup visual QA and station click/motion proof |
| Packet/corridor effects | 32x32 packet frame or SVG/WebP effect, 6-8 frame pulse/travel | static packet at progress point + one calm socket glow | route source/target/state verified from workflow packet |
| Rest lounge variants | 48/96 frame rest loops for all agents or shared rest pose overlay | 1 seated/relaxed still per agent or shared lounge steward token | no fake work, no active task state shown |

Fallback labels must be explicit in manifests: `placeholder-contract`, `candidate-only`, `temporary-static`, or `temporary-2frame`. Do not call fallback sprites final, premium, or complete.

## 3. Per-room agent/operator mapping

| Room id | Role | Operator visual theme | Required states | Candidate sprite / manifest paths |
| --- | --- | --- | --- | --- |
| `olympus-command` | `conductor-strategist` / Hermes mission conductor | winged courier-general with gold sash, short cape, caduceus pointer, command-table silhouette | `idle`, `walk`, `work`, `talk`, `carry-packet`, `rest` | prompt `generated-candidates/war-room/10h-all-room-agents/agents/olympus-command/prompts/olympus-command-agent-v1.prompt.md`<br>atlas `generated-candidates/war-room/10h-all-room-agents/agents/olympus-command/olympus-command-agent-atlas-48.sheet.png`<br>popup `generated-candidates/war-room/10h-all-room-agents/agents/olympus-command/olympus-command-agent-popup-96.sheet.png`<br>frames `generated-candidates/war-room/10h-all-room-agents/agents/olympus-command/frames/`<br>proof `generated-candidates/war-room/10h-all-room-agents/contact-sheets/olympus-command-agent-proof-v1.png` |
| `pantheon-quarters` | `agent-quartermaster` / role trainer and roster steward | quartermaster with laurel clipboard, training whistle, small role banners | `idle`, `walk`, `work`, `talk`, `carry-packet`, `rest` | prompt `generated-candidates/war-room/10h-all-room-agents/agents/pantheon-quarters/prompts/pantheon-quarters-agent-v1.prompt.md`<br>atlas `generated-candidates/war-room/10h-all-room-agents/agents/pantheon-quarters/pantheon-quarters-agent-atlas-48.sheet.png`<br>popup `generated-candidates/war-room/10h-all-room-agents/agents/pantheon-quarters/pantheon-quarters-agent-popup-96.sheet.png`<br>frames `generated-candidates/war-room/10h-all-room-agents/agents/pantheon-quarters/frames/`<br>proof `generated-candidates/war-room/10h-all-room-agents/contact-sheets/pantheon-quarters-agent-proof-v1.png` |
| `agora-opportunity` | `opportunity-scout` / product-intelligence market scout | agora scout with market ledger, magnifying lens, sample basket, teal/gold scarf | `idle`, `walk`, `work`, `talk`, `carry-packet`, `rest` | prompt `generated-candidates/war-room/10h-all-room-agents/agents/agora-opportunity/prompts/agora-opportunity-agent-v1.prompt.md`<br>atlas `generated-candidates/war-room/10h-all-room-agents/agents/agora-opportunity/agora-opportunity-agent-atlas-48.sheet.png`<br>popup `generated-candidates/war-room/10h-all-room-agents/agents/agora-opportunity/agora-opportunity-agent-popup-96.sheet.png`<br>frames `generated-candidates/war-room/10h-all-room-agents/agents/agora-opportunity/frames/`<br>proof `generated-candidates/war-room/10h-all-room-agents/contact-sheets/agora-opportunity-agent-proof-v1.png` |
| `oracle-signals` | `signal-oracle` / keyword and trend seer | oracle analyst with crystal lens, star-map cloak, glowing signal tablet | `idle`, `walk`, `work`, `talk`, `carry-packet`, `rest` | prompt `generated-candidates/war-room/10h-all-room-agents/agents/oracle-signals/prompts/oracle-signals-agent-v1.prompt.md`<br>atlas `generated-candidates/war-room/10h-all-room-agents/agents/oracle-signals/oracle-signals-agent-atlas-48.sheet.png`<br>popup `generated-candidates/war-room/10h-all-room-agents/agents/oracle-signals/oracle-signals-agent-popup-96.sheet.png`<br>frames `generated-candidates/war-room/10h-all-room-agents/agents/oracle-signals/frames/`<br>proof `generated-candidates/war-room/10h-all-room-agents/contact-sheets/oracle-signals-agent-proof-v1.png` |
| `merchant-harbor` | `supplier-proof-captain` / read-only supplier inspector | harbor captain with inspection spyglass, cargo tag board, blue sail sash | `idle`, `walk`, `work`, `talk`, `carry-packet`, `rest` | prompt `generated-candidates/war-room/10h-all-room-agents/agents/merchant-harbor/prompts/merchant-harbor-agent-v1.prompt.md`<br>atlas `generated-candidates/war-room/10h-all-room-agents/agents/merchant-harbor/merchant-harbor-agent-atlas-48.sheet.png`<br>popup `generated-candidates/war-room/10h-all-room-agents/agents/merchant-harbor/merchant-harbor-agent-popup-96.sheet.png`<br>frames `generated-candidates/war-room/10h-all-room-agents/agents/merchant-harbor/frames/`<br>proof `generated-candidates/war-room/10h-all-room-agents/contact-sheets/merchant-harbor-agent-proof-v1.png` |
| `hephaestus-forge` | `forge-artisan` / asset and ShotLab draft smith | forge artisan with hammer, apron, ember rim light, artifact crate | `idle`, `walk`, `work`, `talk`, `carry-packet`, `rest` | prompt `generated-candidates/war-room/10h-all-room-agents/agents/hephaestus-forge/prompts/hephaestus-forge-agent-v1.prompt.md`<br>atlas `generated-candidates/war-room/10h-all-room-agents/agents/hephaestus-forge/hephaestus-forge-agent-atlas-48.sheet.png`<br>popup `generated-candidates/war-room/10h-all-room-agents/agents/hephaestus-forge/hephaestus-forge-agent-popup-96.sheet.png`<br>frames `generated-candidates/war-room/10h-all-room-agents/agents/hephaestus-forge/frames/`<br>proof `generated-candidates/war-room/10h-all-room-agents/contact-sheets/hephaestus-forge-agent-proof-v1.png` |
| `treasury-commerce` | `gate-warden` / approval sentinel and money lock keeper | gate warden with shield, giant key, locked coin seal, stern stance | `idle`, `walk`, `work`, `talk`, `carry-packet`, `rest` | prompt `generated-candidates/war-room/10h-all-room-agents/agents/treasury-commerce/prompts/treasury-commerce-agent-v1.prompt.md`<br>atlas `generated-candidates/war-room/10h-all-room-agents/agents/treasury-commerce/treasury-commerce-agent-atlas-48.sheet.png`<br>popup `generated-candidates/war-room/10h-all-room-agents/agents/treasury-commerce/treasury-commerce-agent-popup-96.sheet.png`<br>frames `generated-candidates/war-room/10h-all-room-agents/agents/treasury-commerce/frames/`<br>proof `generated-candidates/war-room/10h-all-room-agents/contact-sheets/treasury-commerce-agent-proof-v1.png` |
| `atlantis-vault` | `archive-scribe` / archivist and provenance keeper | blue archivist scribe with tablet, shell stylus, calm archive robe | `idle`, `walk`, `work`, `talk`, `carry-packet`, `rest` | prompt `generated-candidates/war-room/10h-all-room-agents/agents/atlantis-vault/prompts/atlantis-vault-agent-v1.prompt.md`<br>atlas `generated-candidates/war-room/10h-all-room-agents/agents/atlantis-vault/atlantis-vault-agent-atlas-48.sheet.png`<br>popup `generated-candidates/war-room/10h-all-room-agents/agents/atlantis-vault/atlantis-vault-agent-popup-96.sheet.png`<br>frames `generated-candidates/war-room/10h-all-room-agents/agents/atlantis-vault/frames/`<br>proof `generated-candidates/war-room/10h-all-room-agents/contact-sheets/atlantis-vault-agent-proof-v1.png` |
| `roman-dev-studio` | `builder-general` / engineering builder and local implementation lead | Roman engineer-general with blueprint shield, calipers, tool belt, red cloak | `idle`, `walk`, `work`, `talk`, `carry-packet`, `rest` | prompt `generated-candidates/war-room/10h-all-room-agents/agents/roman-dev-studio/prompts/roman-dev-studio-agent-v1.prompt.md`<br>atlas `generated-candidates/war-room/10h-all-room-agents/agents/roman-dev-studio/roman-dev-studio-agent-atlas-48.sheet.png`<br>popup `generated-candidates/war-room/10h-all-room-agents/agents/roman-dev-studio/roman-dev-studio-agent-popup-96.sheet.png`<br>frames `generated-candidates/war-room/10h-all-room-agents/agents/roman-dev-studio/frames/`<br>proof `generated-candidates/war-room/10h-all-room-agents/contact-sheets/roman-dev-studio-agent-proof-v1.png` |
| `gateway-dispatch` | `dispatch-captain` / gateway dispatcher and command relay | dispatch captain with antenna standard, relay baton, headset-like laurel, guarded messenger satchel | `idle`, `walk`, `work`, `talk`, `carry-packet`, `rest` | prompt `generated-candidates/war-room/10h-all-room-agents/agents/gateway-dispatch/prompts/gateway-dispatch-agent-v1.prompt.md`<br>atlas `generated-candidates/war-room/10h-all-room-agents/agents/gateway-dispatch/gateway-dispatch-agent-atlas-48.sheet.png`<br>popup `generated-candidates/war-room/10h-all-room-agents/agents/gateway-dispatch/gateway-dispatch-agent-popup-96.sheet.png`<br>frames `generated-candidates/war-room/10h-all-room-agents/agents/gateway-dispatch/frames/`<br>proof `generated-candidates/war-room/10h-all-room-agents/contact-sheets/gateway-dispatch-agent-proof-v1.png` |
| `rest-room` | `rest-steward` / lounge keeper and off-duty agent | rest steward in soft robe with cup and blanket, relaxed readable silhouette | `idle`, `walk`, `work`, `talk`, `carry-packet`, `rest` where `work` means lounge upkeep only | prompt `generated-candidates/war-room/10h-all-room-agents/agents/rest-room/prompts/rest-room-agent-v1.prompt.md`<br>atlas `generated-candidates/war-room/10h-all-room-agents/agents/rest-room/rest-room-agent-atlas-48.sheet.png`<br>popup `generated-candidates/war-room/10h-all-room-agents/agents/rest-room/rest-room-agent-popup-96.sheet.png`<br>frames `generated-candidates/war-room/10h-all-room-agents/agents/rest-room/frames/`<br>proof `generated-candidates/war-room/10h-all-room-agents/contact-sheets/rest-room-agent-proof-v1.png` |

## 4. Room-specific behavior notes

- `olympus-command`: `work` means routing or stamping a mission packet at the command table; `carry-packet` is a sealed assignment scroll.
- `pantheon-quarters`: `work` means roster/training assignment; `rest` is a transition to the lounge, not idling in the quarters forever.
- `agora-opportunity`: `work` means read-only product/opportunity scoring; no buying or supplier action cues.
- `oracle-signals`: `work` means signal/keyword reading from a pool/constellation; `talk` can be a short prophecy/status bubble rendered live in HTML.
- `merchant-harbor`: `work` means supplier proof inspection only; no ordering, supplier messaging, purchase, or account mutation cues.
- `hephaestus-forge`: `work` means local draft/asset creation; paid generation and live ShotLab operations remain locked unless separately approved.
- `treasury-commerce`: `work` means inspecting a locked/manual-only approval packet; no animation may imply spending, buying, publishing, renewing, refunding, or live execution.
- `atlantis-vault`: `work` means saving provenance/archive tablets; `carry-packet` is a tablet/book or evidence scroll.
- `roman-dev-studio`: `work` means local code/build factory work; no git commit/push/reset/clean/stash/checkout cues.
- `gateway-dispatch`: `work` means internal/local relay state; no automated Discord sends or external messages.
- `rest-room`: idle agents with no active packet walk here on `rest-route`; they show `rest`, not fake work, and speech is calm status/personality only.

## 5. Exact prompt pack

Use these prompts as local prompt files if image generation is unavailable. They are intentionally text-free and candidate-only. Replace `{room}` path with the per-room prompt path above.

### `olympus-command` prompt

```text
Create a transparent-background 3/4 top-down GBA-readable sprite sheet for the War Room room `olympus-command` (Olympus Command / Conductor). Character: Hermes mission conductor; role: conductor-strategist. Visual theme: winged courier-general with gold sash, short cape, caduceus pointer, command-table silhouette. Room props: bronze command dais, maps, caduceus courier wings, sealed routing scrolls. Required states in this row order: row 1 idle, row 2 walk-east, row 3 walk-west, row 4 work at routing table + mission seal, row 5 talk/gesture, row 6 carry mission-packet, row 7 rest/lounge. Target atlas frames 48x48 with 8 columns where possible; also suitable to remake as 96x96 popup frames. Cohesive mythic-imperial miniature style, clean silhouette, transparent alpha, no baked text, no UI cards, no CSS-looking circles/halos, no blue token rings, no checker/white/card background, no extra characters, no logos, no fake metrics, no marketplace/live action buttons. First frame of every row must read as the state even if reduced-motion is enabled.
```

### `pantheon-quarters` prompt

```text
Create a transparent-background 3/4 top-down GBA-readable sprite sheet for the War Room room `pantheon-quarters` (Pantheon Quarters / Agent Roster). Character: role trainer / roster steward; role: agent-quartermaster. Visual theme: quartermaster with laurel clipboard, training whistle, small role banners. Room props: mythic dormitory, lockers, training rings, roster tablets. Required states in this row order: row 1 idle, row 2 walk-east, row 3 walk-west, row 4 work at assignment roster wall + training ring, row 5 talk/gesture, row 6 carry role-roster-packet, row 7 rest/lounge. Target atlas frames 48x48 with 8 columns where possible; also suitable to remake as 96x96 popup frames. Cohesive mythic-imperial miniature style, clean silhouette, transparent alpha, no baked text, no UI cards, no CSS-looking circles/halos, no blue token rings, no checker/white/card background, no extra characters, no logos, no fake metrics, no marketplace/live action buttons. First frame of every row must read as the state even if reduced-motion is enabled.
```

### `agora-opportunity` prompt

```text
Create a transparent-background 3/4 top-down GBA-readable sprite sheet for the War Room room `agora-opportunity` (Agora Opportunity Market). Character: market scout / product-intelligence buyer, read-only; role: opportunity-scout. Visual theme: agora scout with market ledger, magnifying lens, sample basket, teal/gold scarf. Room props: busy ancient marketplace, stall awnings, trend tokens, evidence baskets. Required states in this row order: row 1 idle, row 2 walk-east, row 3 walk-west, row 4 work at opportunity stall + scoring scale, row 5 talk/gesture, row 6 carry opportunity-packet, row 7 rest/lounge. Target atlas frames 48x48 with 8 columns where possible; also suitable to remake as 96x96 popup frames. Cohesive mythic-imperial miniature style, clean silhouette, transparent alpha, no baked text, no UI cards, no CSS-looking circles/halos, no blue token rings, no checker/white/card background, no extra characters, no logos, no fake metrics, no marketplace/live action buttons. First frame of every row must read as the state even if reduced-motion is enabled.
```

### `oracle-signals` prompt

```text
Create a transparent-background 3/4 top-down GBA-readable sprite sheet for the War Room room `oracle-signals` (Oracle SEO / Signals). Character: oracle analyst / keyword seer; role: signal-oracle. Visual theme: oracle analyst with crystal lens, star-map cloak, glowing signal tablet. Room props: crystal pool, constellation graph, signal pylons, scroll ribbons. Required states in this row order: row 1 idle, row 2 walk-east, row 3 walk-west, row 4 work at signal pool + keyword constellation, row 5 talk/gesture, row 6 carry signal-packet, row 7 rest/lounge. Target atlas frames 48x48 with 8 columns where possible; also suitable to remake as 96x96 popup frames. Cohesive mythic-imperial miniature style, clean silhouette, transparent alpha, no baked text, no UI cards, no CSS-looking circles/halos, no blue token rings, no checker/white/card background, no extra characters, no logos, no fake metrics, no marketplace/live action buttons. First frame of every row must read as the state even if reduced-motion is enabled.
```

### `merchant-harbor` prompt

```text
Create a transparent-background 3/4 top-down GBA-readable sprite sheet for the War Room room `merchant-harbor` (Merchant Harbor Supplier Proof). Character: harbor inspector / supplier verifier, read-only; role: supplier-proof-captain. Visual theme: harbor captain with inspection spyglass, cargo tag board, blue sail sash. Room props: harbor dock, cargo tags, inspection desk, risk flags, no purchase controls. Required states in this row order: row 1 idle, row 2 walk-east, row 3 walk-west, row 4 work at cargo inspection dock + proof board, row 5 talk/gesture, row 6 carry supplier-proof-packet, row 7 rest/lounge. Target atlas frames 48x48 with 8 columns where possible; also suitable to remake as 96x96 popup frames. Cohesive mythic-imperial miniature style, clean silhouette, transparent alpha, no baked text, no UI cards, no CSS-looking circles/halos, no blue token rings, no checker/white/card background, no extra characters, no logos, no fake metrics, no marketplace/live action buttons, no buying/order/message cues. First frame of every row must read as the state even if reduced-motion is enabled.
```

### `hephaestus-forge` prompt

```text
Create a transparent-background 3/4 top-down GBA-readable sprite sheet for the War Room room `hephaestus-forge` (Forge of Hephaestus / ShotLab Production). Character: asset/ShotLab production smith, draft-only; role: forge-artisan. Visual theme: forge artisan with hammer, apron, ember rim light, artifact crate. Room props: anvil, sparks, clay/ceramic/product mockup benches, draft crates. Required states in this row order: row 1 idle, row 2 walk-east, row 3 walk-west, row 4 work at anvil + draft workbench, row 5 talk/gesture, row 6 carry draft-artifact-packet, row 7 rest/lounge. Target atlas frames 48x48 with 8 columns where possible; also suitable to remake as 96x96 popup frames. Cohesive mythic-imperial miniature style, clean silhouette, transparent alpha, no baked text, no UI cards, no CSS-looking circles/halos, no blue token rings, no checker/white/card background, no extra characters, no logos, no fake metrics, no marketplace/live action buttons, no paid generation cues. First frame of every row must read as the state even if reduced-motion is enabled.
```

### `treasury-commerce` prompt

```text
Create a transparent-background 3/4 top-down GBA-readable sprite sheet for the War Room room `treasury-commerce` (Treasury / Approval and Money Locks). Character: approval sentinel / money lock keeper; role: gate-warden. Visual theme: gate warden with shield, giant key, locked coin seal, stern stance. Room props: vault doors, locked coin shrine, red approval seals, guarded ledger. Required states in this row order: row 1 idle, row 2 walk-east, row 3 walk-west, row 4 work at approval lock shrine + vault ledger, row 5 talk/gesture, row 6 carry commerce-lock-packet, row 7 rest/lounge. Target atlas frames 48x48 with 8 columns where possible; also suitable to remake as 96x96 popup frames. Cohesive mythic-imperial miniature style, clean silhouette, transparent alpha, no baked text, no UI cards, no CSS-looking circles/halos, no blue token rings, no checker/white/card background, no extra characters, no logos, no fake metrics, no purchase/refund/order/publish buttons, no live action success cues. First frame of every row must read as the state even if reduced-motion is enabled.
```

### `atlantis-vault` prompt

```text
Create a transparent-background 3/4 top-down GBA-readable sprite sheet for the War Room room `atlantis-vault` (Atlantis Data Vault / Archive). Character: archivist / provenance keeper; role: archive-scribe. Visual theme: blue archivist scribe with tablet, shell stylus, calm archive robe. Room props: underwater archive, stone tablets, glowing shelves, provenance streams. Required states in this row order: row 1 idle, row 2 walk-east, row 3 walk-west, row 4 work at archive shelves + provenance tablet, row 5 talk/gesture, row 6 carry archive-packet, row 7 rest/lounge. Target atlas frames 48x48 with 8 columns where possible; also suitable to remake as 96x96 popup frames. Cohesive mythic-imperial miniature style, clean silhouette, transparent alpha, no baked text, no UI cards, no CSS-looking circles/halos, no blue token rings, no checker/white/card background, no extra characters, no logos, no fake metrics, no marketplace/live action buttons. First frame of every row must read as the state even if reduced-motion is enabled.
```

### `roman-dev-studio` prompt

```text
Create a transparent-background 3/4 top-down GBA-readable sprite sheet for the War Room room `roman-dev-studio` (Roman Dev Studio / Code Factory). Character: engineering builder / local implementation lead; role: builder-general. Visual theme: Roman engineer-general with blueprint shield, calipers, tool belt, red cloak. Room props: Roman engineering workshop, blueprints, cranes, local build consoles. Required states in this row order: row 1 idle, row 2 walk-east, row 3 walk-west, row 4 work at build bench + blueprint wall, row 5 talk/gesture, row 6 carry implementation-packet, row 7 rest/lounge. Target atlas frames 48x48 with 8 columns where possible; also suitable to remake as 96x96 popup frames. Cohesive mythic-imperial miniature style, clean silhouette, transparent alpha, no baked text, no UI cards, no CSS-looking circles/halos, no blue token rings, no checker/white/card background, no extra characters, no logos, no fake metrics, no git commit/push/reset/clean cues. First frame of every row must read as the state even if reduced-motion is enabled.
```

### `gateway-dispatch` prompt

```text
Create a transparent-background 3/4 top-down GBA-readable sprite sheet for the War Room room `gateway-dispatch` (Gateway / Dispatch / Remote-Control Cockpit). Character: gateway dispatcher / command relay; role: dispatch-captain. Visual theme: dispatch captain with antenna standard, relay baton, headset-like laurel, guarded messenger satchel. Room props: signal tower, guarded message relays, read-only Discord cockpit indicators. Required states in this row order: row 1 idle, row 2 walk-east, row 3 walk-west, row 4 work at relay tower + dispatch console, row 5 talk/gesture, row 6 carry dispatch-packet, row 7 rest/lounge. Target atlas frames 48x48 with 8 columns where possible; also suitable to remake as 96x96 popup frames. Cohesive mythic-imperial miniature style, clean silhouette, transparent alpha, no baked text, no UI cards, no CSS-looking circles/halos, no blue token rings, no checker/white/card background, no extra characters, no logos, no fake metrics, no automated send/message/live external action cues. First frame of every row must read as the state even if reduced-motion is enabled.
```

### `rest-room` prompt

```text
Create a transparent-background 3/4 top-down GBA-readable sprite sheet for the War Room room `rest-room` (Rest Room / Agent Lounge / Sanctuary). Character: lounge keeper / off-duty agent; role: rest-steward. Visual theme: rest steward in soft robe with cup and blanket, relaxed readable silhouette. Room props: sanctuary lounge, soft cushions, nectar table, quiet status plaques, no fake work. Required states in this row order: row 1 idle, row 2 walk-east, row 3 walk-west, row 4 lounge upkeep at lounge bench + calm status board, row 5 talk/gesture, row 6 carry rest-state-token, row 7 rest/lounge. Target atlas frames 48x48 with 8 columns where possible; also suitable to remake as 96x96 popup frames. Cohesive mythic-imperial miniature style, clean silhouette, transparent alpha, no baked text, no UI cards, no CSS-looking circles/halos, no blue token rings, no checker/white/card background, no extra characters, no logos, no fake metrics, no work/commercial/live action cues. First frame of every row must read as the state even if reduced-motion is enabled.
```

## 6. Packet and corridor animation plan

| Route family | Source/target examples | Packet visuals | Motion states | Reduced-motion fallback |
| --- | --- | --- | --- | --- |
| `mission-route` | Olympus/Pantheon/Gateway to any worker room | sealed scroll, dispatch baton, assignment tablet | queued at source socket -> runner carries -> target socket arrival -> work starts | highlight source/target sockets and place scroll at current progress |
| `signal-route` | Oracle -> Agora/Olympus | crystal/ripple token, keyword star | pulse at signal pool -> glide along illuminated route -> market/command station glow | static crystal at checkpoint and one calm glow |
| `draft-route` | Forge/Roman Dev -> Command/QA/Archive | artifact crate, blueprint, local draft bundle | carry crate -> station work -> review handoff | crate parked beside review seal |
| `proof-route` | Merchant/Atlantis -> Command/Treasury | tagged cargo tablet, evidence scroll | inspector carries proof -> review marshal stamp -> archive | tagged proof tablet at gate |
| `lock-route` | Any live/manual decision -> Treasury | locked coin/seal | packet stops at Treasury lock shrine; no loop implying approval | locked seal remains closed |
| `archive-route` | Any completed/rejected output -> Atlantis | stone tablet/book | calm route to archive shelf -> settle and fade to shelf marker | static archive tablet at Vault socket |
| `rest-route` | Any room -> Rest Room | soft lantern/rest token | off-duty walk to lounge -> seated/rest loop | agent shown at lounge slot in rest pose |

Corridor rules: all movement must have known `sourceRoomId`, `targetRoomId`, `packetId`, `routeId`, `agentId`, `state`, and `progressPct`. Decorative infinite packet traffic is rejected.

## 7. Runtime manifest path recommendations

- Machine-readable placeholder index: `docs/status/asset-registry-handoffs/war-room-10h-all-room-agent-animation-manifest.placeholders.json`.
- Contact/provenance plan: `docs/status/assets/war-room-10h-all-room-agent-animation-contact-sheet-plan-20260616.md`.
- Candidate-only prompt/sprite root: `generated-candidates/war-room/10h-all-room-agents/`.
- If later approved for runtime after QA, runtime assets should use `public/war-room/10h/agents/<roomId>-agent.sheet.png`, but this contract does not authorize promotion.

Required manifest entry fields: `roomId`, `agentId`, `role`, `operator`, `states`, `targetFrameCounts`, `fallback`, `paths`, `prompt`, `safetyPolicy`, `promotionGates`, and `provenance`.

## 8. Contact sheet and provenance plan

For each generated candidate, create a dark-background proof sheet with rows for idle, walk-east, walk-west, work, talk, carry-packet, and rest. The proof must show frame boundaries, filename, dimensions, alpha/background notes, and generation source. Store proof sheets under `generated-candidates/war-room/10h-all-room-agents/contact-sheets/`.

Provenance fields must include: generation tool/model if known, prompt file path, source image references if any, timestamp, human/editor notes, alpha/background cleanup steps, rejected-candidate reasons, and visual QA verdict. Do not omit failed candidates; mark them `rejected` with reasons.

## 9. Downstream acceptance checklist

- [ ] All 11 major rooms have a mapped home agent/operator and all six required states.
- [ ] Every state has a target frame count and honest fallback.
- [ ] Every room has candidate prompt, atlas sheet path, popup sheet path, frame folder, proof path, and manifest id.
- [ ] Packet/corridor motion uses workflow packet source/target/progress; no random route animation.
- [ ] Rest Room is a real room and idle agents route there when unassigned.
- [ ] No sprite or prompt bakes text, UI cards, fake metrics, shop/live actions, or CSS-looking halos.
- [ ] Candidate assets are not promoted into runtime/public paths without technical-art + visual QA + integration gates.
- [ ] Reduced-motion rendering can communicate every state from the first frame/still pose.

## 10. Exit verdict

PASS: all major War Room agents now have an animation state contract covering idle, walk, work, talk, carry-packet, and rest; per-room roles/themes/prompts/paths are specified; packet/corridor and Rest Room behavior are defined; manifest placeholders and contact-sheet/provenance requirements are ready for asset generation and technical-art lanes. This is not a final asset pack and must not be described as premium/final without generated images and visual QA proof.
