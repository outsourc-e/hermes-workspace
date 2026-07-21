# War Room Main Screen Asset List — Modular Pixel Rooms + Olympus Theme

Status: draft for DLV approval before implementation
References:
- `/Users/mac/.hermes/image_cache/img_65016036e0cc.png`
- `/Users/mac/.hermes/image_cache/img_163759165131.png`

## North Star

Create a main War Room screen like the reference structure: small modular pixel-art rooms connected by actual paved corridors/bridges. The design must be in Hermes/Olympus theme, not generic fantasy/lab theme.

The output must be composable: room shells, paths, props, agents, packets, labels, and effects are separate asset families.

## 1. Room module shell assets

Needed so the main screen can be expanded/rearranged without regenerating everything.

1. `room-shell-small-1x1`
   - one compact room module for small departments
   - 4 doorway variants: N/S/E/W
   - with blank label plaque

2. `room-shell-wide-2x1`
   - wide room like reference top-row rooms
   - doorway variants: S/E/W and combined

3. `room-shell-command-2x2`
   - larger central command room / Olympus
   - 4-way corridor access

4. `room-shell-rest-1x1`
   - calm lounge/sanctuary room
   - softer lighting, couches/rest stations

5. `room-shell-connector-cap`
   - visual caps and thresholds where roads enter rooms

6. `room-shell-corner-kit`
   - pillars, wall corners, caps, decorative trim

Theme rule: thick marble/stone walls, gold/bronze trim, dark obsidian floor shadow outside, no modern dashboard panels.

## 2. Road / bridge / path assets

These replace ugly abstract lines.

1. `road-horizontal-straight`
2. `road-vertical-straight`
3. `road-corner-ne/nw/se/sw`
4. `road-t-junction-up/down/left/right`
5. `road-cross-junction`
6. `short-bridge-room-to-road`
7. `long-bridge-span`
8. `door-threshold-gate`
9. `road-arrow-overlay-cyan-gold`
10. `packet-lane-overlay`
11. `blocked-gate-overlay`
12. `manual-approval-gate-overlay`

Animation states:
- idle subtle light pulse
- packet traveling
- route active glow
- blocked/approval needed lock glow

## 3. Room-specific visual themes

### Olympus Command / Hermes Conductor
- gold/cyan command dais
- caduceus/Hermes wings
- central operations table
- messenger routes panel
- agent: Hermes conductor

### Agora Opportunity Market
- warm marble marketplace
- product/niche stalls as scroll boards
- agent: Athena/product strategist

### Oracle Signals
- purple signal pool/crystal screens
- trend charts as magical glyph panels, not SaaS dashboard
- agent: Oracle/signal analyst

### Forge of Hephaestus
- lava/bronze/blacksmith tools
- anvil, furnace, tool rack, ShotLab station as in-world forge tool
- agent: Hephaestus forge operator

### Merchant Harbor
- ocean teal, dock boards, crates
- supplier proof table, route map, package inspection
- agent: harbor scout / Poseidon/Njord-like merchant handler

### Atlantis Vault / Archive
- blue/teal underwater archive glow
- shelves, vault, evidence table
- agent: archivist / Poseidon-Atlantis keeper

### Treasury / Approval
- emerald/gold vault
- approval shrine, locked chest, audit ledger
- agent: treasury guard/accountant

### Roman Dev Studio
- Roman red/gold/stone engineering camp
- code/work bench, QA shield rack, build table
- agent: Julius Caesar producer / Roman builder team

### Gateway / Discord Cockpit
- Hermes messenger console
- signal beacons, draft scroll station
- agent: gateway messenger

### Rest Room / Agent Lounge
- calm sanctuary, couches/benches, food/water, low warm light
- agents can rest/recharge/talk
- no fake work

## 4. Agent assets

Each agent needs a small pixel-art character set matching the room.

Required base states per agent:
1. idle
2. walk north
3. walk south
4. walk east
5. walk west
6. work/use station
7. talk/speech
8. carry packet
9. rest/recharge
10. blocked/thinking

Agents:
- Hermes conductor
- Athena opportunity strategist
- Oracle signal analyst
- Hephaestus forge operator
- Harbor scout
- Atlantis archivist
- Treasury approval guard
- Julius/Roman producer
- Gateway messenger
- Resting generic helper variants

Animation target:
- consistent frame grid per state
- same scale across all agents
- readable at tiny room scale
- no giant characters
- no restyling per state

## 5. Tool/station assets

Each station needs idle/work/ready/blocked visuals.

1. Command table
2. Mission router dais
3. Product opportunity board
4. SEO/signal oracle screen
5. Forge anvil
6. Furnace/bellows
7. ShotLab/asset sorting rack as forge tool
8. Supplier proof dock table
9. Package/crate inspection bench
10. Archive/vault shelves
11. Evidence ledger table
12. Approval shrine
13. Treasury lock chest
14. Roman build/code bench
15. QA shield rack
16. Gateway messenger console
17. Discord draft scroll station
18. Rest lounge couch/bench
19. Rest food/water/refresh table

Animation states:
- idle glow
- being used
- output ready
- needs approval
- blocked/error

## 6. Packet / workflow assets

Needed for live operations between rooms.

1. Generic task packet cube
2. Product opportunity scroll
3. Supplier proof crate
4. SEO signal orb
5. Draft listing artifact
6. Image/media bundle
7. Approval seal
8. Evidence folder
9. Error/blocker marker
10. Rest/idle status token

Animation states:
- moving along road
- waiting at room entrance
- handed to agent
- opened at station
- sealed/approved
- blocked/locked

## 7. UI overlay assets

These must be small and not turn into a dashboard.

1. blank room name plaque
2. hover outline / selected glow
3. speech bubble frame
4. tiny status badge: working / idle / resting / approval / blocked
5. manual-only action lock icon
6. safe route highlight
7. active room focus vignette
8. mini tooltip frame

## 8. Main screen layout constraints

- all rooms visible in first viewport
- use 2-row or 3-row modular grid
- roads/gates line up exactly with room doors
- open space outside rooms is dark obsidian/navy
- rooms remain large enough to see agent + 2–4 stations
- no abstract lines
- no unreadable text in image
- no giant labels baked into art
- text labels are UI overlays

## 9. First ChatGPT asset sheets to generate for approval

### Sheet A — Main Atlas Structural Kit
- 8–10 room shells in our theme
- road/bridge pieces
- connectors/doors/gates
- blank plaques
- one tiny packet on road

### Sheet B — Room Theme Props + Stations
- props/stations for the 10 rooms
- each prop isolated enough to crop later
- no baked text

### Sheet C — Agents + Packet Animation Concept
- matching tiny agents
- sample idle/walk/work/talk/rest/carry poses
- packets/scrolls/crates moving
- same scale and style

## 10. Approval gate

These sheets are for direction approval only.
No Workspace UI integration, no default screen replacement, no Kanban autonomous run until DLV approves the visual direction.
