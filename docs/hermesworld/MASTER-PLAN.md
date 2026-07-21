# HermesWorld — Master Plan (Single Source of Truth)

Last updated: 2026-05-06 02:20 EDT
Owner: Eric (vision/product/taste)
Orchestrator: Opus (review, swarm direction, integration)
Workers: gpt-5.5 swarms (deep build), 4090/PC1, rented GPU as needed

This document survives compaction and re-spawns.
If you are a future agent: read this first.

---

## 1. Identity

HermesWorld = the first **Agentic MMO**.

- Roblox + WoW + Rohan + AI agents
- Humans + their AI agents are guildmates
- Browser-native first, downloadable later
- Built by a single founder + agent swarm
- Acquisition narrative: first AI-agent video game company

Two locked references:
- **Marketing/store page spec**: `docs/hermesworld/reference-images/MASTER-PRODUCT-GRAPHIC.png`
- **Playable in-game spec**: `docs/hermesworld/reference-images/INGAME-TARGET-AGORA.png`

The marketing graphic is what the website looks like. The in-game target is what the actual game looks like when playing. Both must be honored. See `INGAME-TARGET-SPEC.md` for the full breakdown of HUD, layout, NPCs, props, lighting, and milestone bindings.

## 2. Vision pillars (from the master graphic)

- **Choose Your Class** — 7 human classes
  - Priest / Healer
  - Guardian / Tank
  - Mage / Promptcaster
  - Rogue / Scout
  - Engineer / Builder
  - Oracle / Analyst
  - Bard / Social

- **AI Agent Companions** — 6 agent classes
  - Scout, Scribe, Builder, Trader, Combat, Healer
  - Slogan: "Your Guild. Your Agents. Your Advantage."

- **Guild Systems**
  - Guild Halls (build & customize)
  - Banners
  - Guild Chat
  - Guild Objectives
  - Shared Vault
  - Weekend Wars
  - Raids
  - Leaderboards
  - Seasonal Rewards

- **Epic Events**
  - Capture Obelisks / Sigils (map control)
  - Guild Hall Defense
  - Boxing Arena
  - more added per season

- **Identity slogans**
  - "Your World. Your Guild. Your Legacy."
  - "One World. Many Legends. Endless Adventures."

- **Platform pillars**
  - Browser-native (no downloads)
  - Real-time multiplayer
  - Player-driven economy
  - Decentralized ownership
  - Season pass (Season 1: Dawn of Legends)

## 3. Operating model

- **Eric**: product taste, X presence, vision pivots, money/GPU calls
- **Opus orchestrator**: swarm direction, integration, review, anti-spaghetti gate, planning, content/comm
- **gpt-5.5 swarms**: art realism loop, gameplay systems, integrations, infra, prize lane
- **GPU lane**: PC1 (4090) + rented A100/H100 for HY-World 2.0, Hunyuan, Meshy, Tripo, large imagegen batches
- **Coin fees ($6k+)** → buys GPU time, asset gen credits, CDN, contractor reviewers

Anti-drift gate (every output runs through this):
> Does this serve **Agentic MMO with humans + agents as guildmates**?
> If yes → ship. If no → reshape or park.

## 4. Repos

- `outsourc-e/hermes-workspace` — public (browser game lives here)
- `outsourc-e/hermesworld-game` — **private** (issues, internal specs, prize logic, secrets, roadmap)
- `outsourc-e/controlsuite` — desktop client
- `ocplatform/ocplatform` — agent runtime
- `ocplatform/ocplatform-control-ui` — webchat surface

## 5. Asset replacement waves (right order)

We replace HermesWorld's art batch by batch, never all at once.

- **Wave A — Identity / HUD** (no game logic risk)
  - logo polish, world map icons, minimap markers, HUD pack (HP/MP/SP/XP/talk/run/menu/map), objective chip, toast frames, chat bubbles, quest reward cards

- **Wave B — Character art** (high visual leverage)
  - 7 class portraits
  - 6 agent companion portraits
  - core NPC portraits (Athena, Apollo, Hephaestus, etc.)
  - avatar customizer fix (face being covered bug)
  - preset thumbnails

- **Wave C — Map / world art**
  - world map illustrated bg
  - 6 zone hero banners (Training, Forge, Agora, Grove, Oracle, Arena)
  - zone unlock cards
  - fast travel iconography
  - minimap stylization

- **Wave D — Items / sigils / loot**
  - 7 sigils
  - core item icons (weapons/armor/relics/companion modules)
  - rarity frame system
  - guild banner kit

- **Wave E — In-world 3D**
  - HY-World 2.0, Hunyuan, Meshy, Tripo
  - Agora plaza props (monument, torches, stalls)
  - glTF/GLB → optimize → drop into R3F

Always run the realism loop:
prompt → generate → vision review → optimize → drop into game → screenshot → vision review → patch → repeat.

## 6. Tonight's wave (locked)

1. Master plan committed (this doc)
2. Reference images mirrored into repo
3. Private repo `outsourc-e/hermesworld-game` created with labels + issue templates
4. Existing bugs filed:
   - mobile UX merge-readiness (swarm3 worktree exists)
   - character creator face-covering bug
   - name reservation needs
5. Name reservation page (form on hermes-world.ai)
6. Character creator face fix lane
7. Swarm re-prompt without `/goal` so deep work resumes
8. Wave A imagegen batch starts (HUD + identity) on local imagegen, ready for review
9. Morning report with what shipped, what blocked, what needs your taste

## 7. Persistent goals registry

| Goal ID | File | State |
| --- | --- | --- |
| 2026-05-06-hermesworld-swarm-game-studio | `memory/goals/2026-05-06-hermesworld-swarm-game-studio/` | active |
| 2026-05-06-hermesworld-master-plan | this file | active |

When new goals are spawned, register them here so future agents see them.

## 8. Existing companion docs

- `docs/hermesworld/INGAME-TARGET-SPEC.md` — playable view target breakdown
- `docs/hermesworld/AGENTIC-WOW-ROHAN-SYSTEMS.md` — class/skill/raid systems
- `docs/hermesworld/GUILDS-AGENTS-COMPANION-ECONOMY.md` — guild + agent + monetization
- `docs/hermesworld/VISION-BEST-AI-MMO.md` — north star
- `docs/hermesworld/ART-BIBLE-REALISM-LOOP.md` — image gen → review loop
- `docs/hermesworld/AGORA-INSO-IMPLEMENTATION.md` — Agora hub upgrade plan
- `docs/hermesworld/AGORA-INSO-ASSET-PROMPTS.md` — concrete prompt pack
- `skills/video-game-building/` — reusable game-build skill

## 9. Bug + community input pipeline

- Public face: `hermes-world.ai/feedback` form
- Form posts to private repo via GitHub Issues API
- Discord bot threads → issues with `community-report` label
- X mentions/DMs reviewed daily and triaged
- Public roadmap: published from selected repo issues marked `publish:roadmap`

## 10. What never happens

- never client-side prize secrets/oracle logic
- never pay-to-win in competitive guild wars
- never replace all art at once without realism loop
- never ship without spec gate
- never lose this doc

## 11. Wake-up procedure for future agents

1. Read this file.
2. Read `docs/hermesworld/MASTER-PRODUCT-GRAPHIC.png`.
3. Read `memory/goals/2026-05-06-hermesworld-swarm-game-studio/goal.spec.md` and `state.json`.
4. Check today's `memory/YYYY-MM-DD.md` log for context.
5. Run `git status`, `gh issue list --label priority:high` to see live state.
6. Resume the active wave.
