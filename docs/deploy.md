# Deploying Hermes Workspace

Hermes Workspace is a **stateful, long-running server**: it spawns PTY terminals,
proxies and (optionally) launches the `hermes-agent` gateway, serves SSE/websocket
streams, and reads/writes the local filesystem. That shapes where it can run.

| Target                                                     | What works                                                  | What doesn't                                                                                  | Use when                                         |
| ---------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Persistent host** (Docker / VM / Render / Railway / Fly) | Everything — chat, terminals, files, gateway, agents, swarm | —                                                                                             | You want the real control plane                  |
| **Vercel** (serverless)                                    | UI shell, static assets, stateless SSR routes               | Terminals, gateway spawn, websockets, local file browser, any route that calls a live gateway | You only need a public preview / landing surface |

## Vercel (UI shell only)

TanStack Start 1.166 builds a standalone Node server (`dist/server/server.js`),
which Vercel has no native preset for — so a default import serves the static
client dir and **every SSR route, including `/`, returns 404**.

This repo ships an adapter that fixes that by emitting a [Build Output API v3](https://vercel.com/docs/build-output-api/v3)
directory (`scripts/vercel-build.mjs` + `scripts/vercel-ssr-entry.mjs`), wired up
in `vercel.json`:

- `vite build` → `dist/client` (static) + `dist/server/server.js` (SSR)
- `scripts/vercel-build.mjs` assembles `.vercel/output/`:
  - `static/` ← `dist/client`
  - `functions/ssr.func/` — a Node function that calls the server's Web `fetch`
    handler
  - `config.json` — serve real files first (`handle: filesystem`), then fall
    through to the SSR function

No project settings are required beyond the defaults; `vercel.json` sets the
`installCommand`/`buildCommand` and `framework: null`. Push and Vercel rebuilds.

**Expectations on Vercel:** `/` and other shell routes render. Routes that fetch a
live gateway will fail fast (no gateway reachable) or hit the function timeout —
this is inherent to serverless, not a bug. For a working workspace, deploy to a
persistent host below.

### Provider keys on Vercel

`.env` is gitignored and is **not** uploaded to Vercel. Set keys the workspace
reads as Vercel **Environment Variables** (Project → Settings → Environment
Variables, or `vercel env add`):

```
OPENAI_API_KEY        # provider-usage panel
OPENROUTER_API_KEY    # provider-usage panel
GOOGLE_API_KEY        # provider-usage panel (Gemini) — use an AIza-form key
```

## Persistent host (full functionality)

### Docker Compose (recommended)

The repo ships a two-service stack (`docker-compose.yml`): `hermes-agent`
(the gateway) + `hermes-workspace`. It binds `127.0.0.1:3000` by default.

```bash
cp .env.example .env          # add your provider key(s) + HERMES_PASSWORD
docker compose up -d
# open http://127.0.0.1:3000
```

The container binds `0.0.0.0:3000` internally, so **`HERMES_PASSWORD` is required**
(the server fail-closes without it on a non-loopback host — see `server-entry.js`).
Put it in `.env`. See [docs/docker.md](./docker.md) for the full reference.

### Bare Node / VM

```bash
pnpm install
pnpm build
HERMES_PASSWORD=<strong-secret> HOST=0.0.0.0 PORT=3000 node server-entry.js
```

Run behind TLS (reverse proxy, Tailscale Funnel, or Cloudflare Tunnel) and set
`COOKIE_SECURE=1` so session cookies survive HTTPS. Point `HERMES_API_URL` at
your gateway (`http://127.0.0.1:8642` by default).

## Verifying keys after deploy

From any host that can reach the providers:

```bash
pnpm keys:check
```

See [docs/api-key-registry.md](./api-key-registry.md) for the full key inventory.
