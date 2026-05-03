# Hermes Playground multiplayer hub (Cloudflare Worker)

Drop-in port of `scripts/playground-ws.mjs` to Cloudflare Workers + Durable Objects.
Free tier covers a hackathon and well beyond. Zero cold starts. Edge-deployed.

## Why CF + DO over Fly.io / Render / Railway

- Free tier: 100k req/day on Workers, 1M+ DO req/mo. WebSocket connections count
  per-message, not per-connection — a presence broadcast every 200 ms across
  20 players is well under the limit.
- Zero cold starts (vs Fly.io free tier which idles VMs after inactivity, and
  Render free which has a 30-50s cold start that kills demos).
- One Durable Object instance is the canonical "lobby/room" pattern — strong
  consistency, no Redis needed.
- Globally edge-deployed: a player in Tokyo and a player in NYC both connect
  to the closest edge, then route to the single DO holding game state.

## Files

- `src/worker.ts` — entry + `PlaygroundHub` Durable Object class
- `wrangler.toml` — DO binding + migration
- `package.json` / `tsconfig.json` — build deps

## Endpoints

- `GET /playground` — WebSocket upgrade (presence + chat fan-out, mirrors
  the Node sidecar protocol)
- `GET /stats` — JSON `{ online, byWorld, peakToday, peakDay, ts }` for the HUD badge
- `GET /health` — JSON `{ ok: true, online, ts }`

## Deploy (~10 min, requires Eric's CF account)

```bash
cd playground-ws-worker
pnpm install                 # installs wrangler
pnpm wrangler login          # one-time browser auth
pnpm deploy                  # publishes to <name>.<your-subdomain>.workers.dev
```

Then in workspace `.env.production`:

```bash
VITE_PLAYGROUND_WS_URL=wss://hermes-playground-ws.<your-subdomain>.workers.dev/playground
VITE_PLAYGROUND_STATS_URL=https://hermes-playground-ws.<your-subdomain>.workers.dev/stats
```

(Custom domain optional via Workers Routes — `wss://hub.hermes-playground.app`.)

## Local dev

```bash
pnpm wrangler dev            # hot-reload on http://localhost:8787
# In hermes-workspace:
VITE_PLAYGROUND_WS_URL=ws://localhost:8787/playground pnpm dev
```

## Protocol parity

Wire format is identical to `scripts/playground-ws.mjs`. The client
(`src/screens/playground/hooks/use-playground-multiplayer.ts`) connects unchanged.

Messages:
- `{ kind: 'presence', id, x, y, z, yaw, name, color, worldId, avatar?, ... }`
- `{ kind: 'chat', id, text, ts }`
- `{ kind: 'leave', id }`
- Server-emitted: `{ kind: 'hello', server, ts }`

## State model

- `presence: Map<id, lastWire>` — fan-out + bootstrap on connect
- `chatRing: array<chat>` — last 50 messages, replayed to newcomers
- `peakToday` — persisted in DO storage for stats endpoint

Stale presence is pruned every 1 s via DO alarms (cheaper than `setInterval`,
and survives instance hibernation).

## Cost ceiling

For 100 concurrent players sending presence at 5 Hz:
- 100 × 5 × 60 × 60 × 24 = 43.2M msgs/day → still inside free tier for outbound
  (Workers count requests, not WS messages). If usage explodes:
  - Workers Paid: $5/mo for 10M req/day baseline.
  - DO storage: trivial (presence in memory, peak in storage).

## Hardening (post-hackathon)

- Add rate limiting per playerId (token bucket in DO state).
- Multi-room: route by `?room=` to `idFromName(roomId)`.
- Anti-spoof: require signed JWT for `presence.id`.
- Replace presence ring with `state.storage.transaction` for crash recovery.
