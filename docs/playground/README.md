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

1. Land on title → enter your builder name → "Enter the Agora"
2. Click the ground to walk into the plaza
3. Click Athena → automatically walks to her, opens dialog → take Athena's Scroll
4. Walk into the Tavern doorway → meet Selene the Tavern Keeper, Apollo, Iris
5. Exit, walk to Bank → talk to Midas about persistent agent memory
6. Open the World Map (M) → travel to Forge → fight a rogue model
7. Open second browser tab → see your other character walk and chat with you in real time

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
