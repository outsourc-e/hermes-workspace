# Olympus War Room vNext Asset Contracts

This file defines the complete asset scope for the full modular game workspace. The first generated batch may be only the Forge vertical slice, but the product scope is the entire Olympus world.

## Global style bible

Premium Greek/Olympus strategy-game workspace with Pokémon-like top-down/isometric interaction. High-detail illustrated assets, cinematic lighting, black marble, antique gold, bronze, lava orange, emerald, teal Atlantis glow, purple oracle energy. No cheap 2002 browser game, no flat CSS dashboard, no procedural placeholder props, no baked gibberish text.

## Shared rules

- Room backgrounds: text-free, no baked labels, no fake UI controls.
- Station props: transparent PNG, separate from background, visually readable without label text.
- Mini gods: transparent sprites/sheets, small floor-scale, directional movement eventually.
- Dialog frames: generated image frame with explicit empty safe zones and close socket.
- Text overlays: React/HTML only, placed in mapped safe zones.
- Close control: X icon in designed close socket, never generic floating Close button.

## Main world map

### Asset: Olympus world map
- Path: `/war-room/vNext/world/olympus-world-map.png`
- Use: navigation hub for all rooms.
- Required: visible areas for Olympus Command, Pantheon Quarters, Agora, Oracle, Forge, Merchant Harbor, Atlantis Vault, Treasury.
- Forbidden: unreadable labels, ShotLab as room name, random UI panels.

## Room backgrounds

1. `/war-room/vNext/rooms/olympus-command/background.png` — command hall with war table, gateway balcony, approval seal area.
2. `/war-room/vNext/rooms/pantheon-quarters/background.png` — agent dorm/quarters/training hall.
3. `/war-room/vNext/rooms/agora/background.png` — marketplace/product research stalls and shop expansion area.
4. `/war-room/vNext/rooms/oracle/background.png` — signal pool, stars, crystal observatory.
5. `/war-room/vNext/rooms/forge/background.png` — Forge of Hephaestus workshop, walkable paths, lava side, station zones.
6. `/war-room/vNext/rooms/merchant-harbor/background.png` — docks, supplier piers, logistics boards.
7. `/war-room/vNext/rooms/atlantis-vault/background.png` — underwater archive vault, shelves, crystal memory.
8. `/war-room/vNext/rooms/treasury/background.png` — commerce vault with ledgers, scales, approval locks.

## Station props

### Olympus Command
- `/war-room/vNext/stations/olympus-command/war-table.png`
- `/war-room/vNext/stations/olympus-command/dispatch-beacon.png`
- `/war-room/vNext/stations/olympus-command/gateway-console.png`
- `/war-room/vNext/stations/olympus-command/aegis-approval-seal.png`
- `/war-room/vNext/stations/olympus-command/mission-archive-pedestal.png`

### Pantheon Quarters
- `/war-room/vNext/stations/pantheon-quarters/agent-chambers.png`
- `/war-room/vNext/stations/pantheon-quarters/roster-board.png`
- `/war-room/vNext/stations/pantheon-quarters/review-table.png`
- `/war-room/vNext/stations/pantheon-quarters/training-yard.png`
- `/war-room/vNext/stations/pantheon-quarters/model-statues.png`

### Agora of Opportunity
- `/war-room/vNext/stations/agora/idea-stalls.png`
- `/war-room/vNext/stations/agora/competitor-board.png`
- `/war-room/vNext/stations/agora/alura-etsy-counter.png`
- `/war-room/vNext/stations/agora/niche-scroll-rack.png`
- `/war-room/vNext/stations/agora/shop-expansion-stalls.png`

### Oracle of Signals
- `/war-room/vNext/stations/oracle/signal-pool.png`
- `/war-room/vNext/stations/oracle/keyword-crystal.png`
- `/war-room/vNext/stations/oracle/trend-stars.png`
- `/war-room/vNext/stations/oracle/stats-observatory.png`
- `/war-room/vNext/stations/oracle/alert-bell.png`

### Forge of Hephaestus
- `/war-room/vNext/stations/forge/approval-shrine.png`
- `/war-room/vNext/stations/forge/prompt-anvil.png`
- `/war-room/vNext/stations/forge/model-bellows.png`
- `/war-room/vNext/stations/forge/shotlab-sorting-rack.png`
- `/war-room/vNext/stations/forge/listing-easel.png`
- `/war-room/vNext/stations/forge/skills-forge.png`

### Merchant Harbor
- `/war-room/vNext/stations/merchant-harbor/aliexpress-pier.png`
- `/war-room/vNext/stations/merchant-harbor/alibaba-dock.png`
- `/war-room/vNext/stations/merchant-harbor/supplier-ledger.png`
- `/war-room/vNext/stations/merchant-harbor/customs-risk-gate.png`
- `/war-room/vNext/stations/merchant-harbor/logistics-route-board.png`

### Atlantis Vault
- `/war-room/vNext/stations/atlantis-vault/crystal-archive.png`
- `/war-room/vNext/stations/atlantis-vault/screenshot-vault.png`
- `/war-room/vNext/stations/atlantis-vault/report-tablets.png`
- `/war-room/vNext/stations/atlantis-vault/skill-relic-shelves.png`
- `/war-room/vNext/stations/atlantis-vault/dataset-pool.png`

### Treasury of Commerce
- `/war-room/vNext/stations/treasury/margin-chest.png`
- `/war-room/vNext/stations/treasury/cost-scales.png`
- `/war-room/vNext/stations/treasury/ad-spend-gate.png`
- `/war-room/vNext/stations/treasury/api-usage-meter.png`
- `/war-room/vNext/stations/treasury/revenue-ledger.png`
- `/war-room/vNext/stations/treasury/approval-vault.png`

## Mini god / agent assets

- `/war-room/vNext/agents/hermes-mini-sheet.png`
- `/war-room/vNext/agents/athena-mini-sheet.png`
- `/war-room/vNext/agents/hercules-mini-sheet.png`
- `/war-room/vNext/agents/oracle-mini-sheet.png`
- `/war-room/vNext/agents/hephaestus-mini-sheet.png`
- `/war-room/vNext/agents/merchant-scout-mini-sheet.png`
- `/war-room/vNext/agents/atlantis-archivist-mini-sheet.png`
- `/war-room/vNext/agents/treasury-watcher-mini-sheet.png`
- `/war-room/vNext/agents/chatgpt-heavy-mini-sheet.png`
- `/war-room/vNext/agents/kimi-worker-mini-sheet.png`
- `/war-room/vNext/agents/ollama-support-mini-sheet.png`

## Shared UI assets

- `/war-room/vNext/ui/station-dialog-frame.png` — large station panel with mapped safe zones and circular close socket.
- `/war-room/vNext/ui/room-title-plaque.png` — generated/image-made title plaque for major room titles.
- `/war-room/vNext/ui/station-label-plaque.png` — generated/image-made hover/active station title plaque; labels appear only on hover/focus/active.
- `/war-room/vNext/ui/agent-nameplate.png` — generated/image-made temporary walking-state nameplate; idle gods should not carry always-on text in the room center.
- `/war-room/vNext/ui/speech-bubble.png` — small god speech bubble.
- `/war-room/vNext/ui/hud-top-strip.png` — minimal top HUD.
- `/war-room/vNext/ui/state-rings.png` — idle/working/thinking/approval/blocked/done rings.
- `/war-room/vNext/ui/path-spark.png` — subtle movement marker.

## First generation batch

Generate only these first, but keep all above in scope:

1. Forge background.
2. Approval Shrine prop.
3. Prompt Anvil prop.
4. Hephaestus mini god sheet.
5. Station dialog frame.

## First batch QA

- Approval Shrine must visibly be a shrine/gate/seal without reading text.
- Prompt Anvil must visibly be an anvil/hammer/lava/prompt-forge object without reading text.
- Hephaestus must be floor-scale, not a giant sticker.
- Dialog frame must have empty safe text zones and a real circular close socket.
