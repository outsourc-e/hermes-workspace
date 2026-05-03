# Hermes Playground 🌐

> The agent MMO. A browser 3D world where you walk around, talk to Hermes Agent NPCs, run quests, level up, and meet other builders. Built for the Nous Research × Kimi hackathon 2026.

```
        ╔═══════════════════════════════════════════════╗
        ║          H E R M E S   P L A Y G R O U N D    ║
        ║                                                ║
        ║   walk · quest · learn · build · play          ║
        ╚═══════════════════════════════════════════════╝
```

## Pitch

Docs are boring. Agents are abstract. Communities need shared space.

So **Hermes turns onboarding into a multiplayer RPG world**. You don't read about Hermes Agent — you *play* it. Five worlds, six enterable buildings, a town full of NPCs that explain memory/tools/routing through quests, and presence multiplayer so other builders are walking around the same Agora as you.

## Try it

```bash
git clone https://github.com/outsourc-e/hermes-workspace
cd hermes-workspace
pnpm install
pnpm dev
# open http://localhost:3001/playground in two browser tabs
```

For real cross-device multiplayer (no setup, hosted hub):

```bash
# Just run pnpm dev. The .env already wires VITE_PLAYGROUND_WS_URL to a
# Cloudflare Worker + Durable Object hub at:
#   wss://hermes-playground-ws.myaurora-agi.workers.dev/playground
# Open /playground in two devices on different networks — they'll meet there.
pnpm dev
```

Want your own hub?

```bash
cd playground-ws-worker
pnpm install
pnpm wrangler login
pnpm deploy   # → wss://hermes-playground-ws.<your-subdomain>.workers.dev
# Then set VITE_PLAYGROUND_WS_URL + VITE_PLAYGROUND_STATS_URL in .env.production.
```

Local sidecar (no cloud):

```bash
# terminal A
pnpm playground:ws            # ws://localhost:8787
# terminal B
VITE_PLAYGROUND_WS_URL=ws://localhost:8787 pnpm dev
```

## Demo flow (60 seconds)

1. Land on title, enter a builder name, tweak the avatar, then enter the Training Grounds.
2. Walk to Athena, accept the Hermes Sigil, then open the kit and equip the Training Blade + Novice Cloak.
3. Send one local chat message, then visit the Archive Podium to explain docs, memory, and iteration recall.
4. Follow the quest tracker to the Forge Gate, ask Athena or Pan to build something, and trigger the tutorial-complete celebration.
5. Step through the unlocked Forge Gate, show the short "Generating world..." payoff, then arrive in the Forge with ambient audio live.
6. Attack the rogue model with Strike / Dash / Bolt and briefly show the low-HP pulse if you let it hit back.
7. Open a second tab or device to show multiplayer presence, nearby builders, remote nameplate ping, and live chat.

## Hackathon Submission

Hermes Playground turns agent onboarding into a social RPG loop. Instead of reading a wall of docs, builders walk a shared world, meet Hermes-themed NPCs, learn movement, gear, chat, memory, and build rituals, then step through the Forge Gate into a live multiplayer builder realm. It frames Hermes Workspace as a place you inhabit, not just a tool you open.

### 30-60 second demo script

1. "This is Hermes Playground, our multiplayer onboarding RPG for the Nous Research × Kimi hackathon."
2. "A new builder starts in the Training Grounds, learns the five-step loop, and gets guided by Athena, Iris, and Pan."
3. "The quest tracker, journal, gear, chat, and docs/memory beats all map to real Hermes builder habits."
4. "When the last tutorial step lands, the Forge Gate unlocks and we generate a world-intro line through the NPC route."
5. "Now we’re in the Forge, where prompts become tools, combat becomes benchmark play, and other builders can meet you live in-zone."

### Tweet draft

Hermes Playground turns AI-agent onboarding into a multiplayer RPG: move, gear up, chat, learn docs + memory, then unlock the Forge and build live with friends nearby. Built for the @NousResearch × @Kimi_Moonshot hackathon. #HermesWorkspace #AIAgents

### What to capture

1. Title screen with personalized builder greeting, avatar customizer, and enter flow.
2. Training Grounds with quest tracker, objective arrow, inventory/equip panel, and archive briefing modal.
3. Tutorial-complete celebration modal followed by the Forge Gate unlocking with glow/particles.
4. "Generating world..." overlay and first arrival in the Forge with ambient audio/combat visible.
5. Two-player multiplayer moment showing nearby builders chip, live chat, and a remote nameplate ping.

## What's inside

| | |
|---|---|
| **Worlds** | Agora, Forge, Grove, Oracle Temple, Benchmark Arena |
| **Enterable buildings** | Tavern, Bank, Smithy, Inn, Apothecary, Guild Hall |
| **NPCs** | Athena, Apollo, Iris, Nike, Pan, Chronos, Hermes, Artemis, Eros + 5 Agora keepers (Dorian, Leonidas, Midas, Cassia, Selene, Hestia) |
| **Skills** | Promptcraft, Worldsmithing, Summoning, Engineering, Oracle, Diplomacy |
| **Items** | 10+ collectible quest artifacts |
| **Quests** | Multi-chapter campaign through every world |
| **Multiplayer** | BroadcastChannel (same-machine) + WebSocket (any-device) via Cloudflare Worker + Durable Object hub. World-scoped fan-out, server-pushed live counts, 5 Hz presence with skip-when-still, token-bucket rate limit. |
| **LLM dialog** | Free-form chat with each NPC — type into the dialog box, gets persona-wrapped LLM reply via `/api/playground-npc`. Falls back gracefully if the gateway is offline. |

## Controls

| Action | Input |
|---|---|
| Walk | Click ground · WASD |
| Talk | Click NPC · E |
| Camera | Arrow keys / `[` `]` zoom |
| Sprint | Shift |
| Skills | 1–6 |
| Journal | J |
| World Map | M |
| Chat focus | T |

## Architecture

```
/playground (route)
├── playground-screen.tsx           orchestrator + HUD wiring
├── playground-world-3d.tsx         R3F scene, NPC/Bot/Remote players, interiors
├── playground-environment.tsx      reusable scenery/landmark primitives
├── playground-hud.tsx              stat orbs (RuneScape style)
├── playground-sidepanel.tsx        right rail tabs (inv/skills/quests/worlds/settings)
├── playground-actionbar.tsx        skill hotbar
├── playground-chat.tsx             chat dock
├── playground-dialog.tsx           branching NPC dialog cards
├── playground-journal.tsx          quest journal
├── playground-map.tsx              full-screen world map modal
├── playground-minimap.tsx          radar
└── hooks/
    └── use-playground-multiplayer.ts   BroadcastChannel + WebSocket transport
scripts/playground-ws.mjs           tiny WS relay (run with `pnpm playground:ws`)
```

Stack: TanStack Start + React Three Fiber + Drei + Three.js, ws (Node), BroadcastChannel API.

No external 3D assets — everything is procedurally drawn from primitives so the entire 3D world ships in <250 KB and runs on any laptop.

## Stylized > photoreal

We chose stylized indie 3D over photoreal AAA. Reasoning:
- Browser. Single-developer. Hackathon clock.
- Anyone can join from any device, instantly.
- "Genshin-lite for agents" reads as intentional, not unfinished.
- Future work: Ready Player Me avatars + Mixamo animations + r3f-postprocessing for the next-tier visual jump.

## Multiplayer

Two transports run in parallel inside one client hook:

- **BroadcastChannel** — same-origin tabs find each other instantly with zero server.
- **WebSocket** — tiny stateless relay (`scripts/playground-ws.mjs`) for cross-device. Same wire format.

Wire schema (mirrors what a future Colyseus / Durable Object server will use):

```ts
type PresenceWire = { kind: 'presence'; id; name; color; world; interior; x; y; z; yaw; ts }
type ChatWire     = { kind: 'chat';     id; name; color; world; text; ts }
type LeaveWire    = { kind: 'leave';    id }
```

Deploy options for the WS relay are listed in `memory/goals/2026-05-03-playground-mmorpg/multiplayer-deploy.md` (Fly.io / Render / Railway).

## Roadmap

- [x] Free-roam click-to-walk world
- [x] 5 worlds + 6 enterable buildings
- [x] 14+ NPCs with branching dialog and quest hooks
- [x] Stat orbs, side panel tabs, quest tracker
- [x] Multiplayer presence MVP (BroadcastChannel + WS)
- [x] Animated title screen + onboarding card
- [ ] Public WS deploy (Fly.io / Render)
- [ ] Ready Player Me avatar integration
- [ ] Mixamo animation pipeline
- [ ] Voice via LiveKit per zone
- [ ] Server-authoritative combat
- [ ] Per-world WS room sharding

## Credits

- Built on [Hermes Workspace](https://github.com/outsourc-e/hermes-workspace) and [Hermes Agent](https://github.com/NousResearch/hermes-agent).
- Inspired by RuneScape, PlayROHAN, Lost Ark, and Skyrim. No assets copied — everything is original primitives + Hermes Greek-mythology theming.
- Hackathon: Nous Research × Kimi 2026.

## License

MIT. Same as Hermes Workspace.
