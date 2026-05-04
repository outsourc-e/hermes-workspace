# Docker

Hermes Workspace + Hermes Agent in containers.

## TL;DR (single-host, localhost-only)

```bash
git clone https://github.com/outsourc-e/hermes-workspace
cd hermes-workspace
cp .env.example .env
# add at least one provider key (e.g. OPENROUTER_API_KEY=...)
docker compose up -d
open http://localhost:3000
```

That's it. The repo's `docker-compose.yml` runs:

- `hermes-agent` (port `8642`, internal only)
- `hermes-workspace` (port `3000`, bound to `127.0.0.1`)

The workspace waits for the agent's `/health` to return `200` before starting (via `depends_on: condition: service_healthy`). On a fresh laptop this takes about 15 seconds.

## Multi-host / NAS / VPS

If the workspace and agent run on **different machines**, or you want LAN/Tailscale access to the workspace, three things change:

### 1. Agent binds publicly

In `.env`:

```bash
API_SERVER_HOST=0.0.0.0
API_SERVER_KEY=<a long random string>
```

This makes the agent listen on all interfaces, not just the Docker loopback. **`API_SERVER_KEY` is mandatory** when `API_SERVER_HOST` is non-loopback — the agent will refuse to start otherwise.

### 2. Workspace knows where the agent is

In `.env`:

```bash
HERMES_API_URL=http://<agent-host-or-service>:8642
HERMES_API_TOKEN=<the same value as API_SERVER_KEY>
HERMES_DASHBOARD_URL=http://<agent-host-or-service>:9119
HERMES_DASHBOARD_TOKEN=<same key, or set CLAUDE_DASHBOARD_TOKEN>
```

Inside docker compose on the same host, `<agent-host-or-service>` is the service name from your compose file (e.g. `hermes-agent`). On a Synology NAS with a separate workspace stack, it's the LAN IP (e.g. `192.168.1.78`).

### 3. Workspace gets a password

The workspace bind is non-loopback in Docker (`0.0.0.0:3000`). It refuses to start in production mode without a password to prevent accidental open exposure:

```bash
HERMES_PASSWORD=<a long random string different from API_SERVER_KEY>
```

If you publish the workspace behind HTTPS (reverse proxy, Tailscale Funnel, Cloudflare Tunnel), also set `COOKIE_SECURE=1` so session cookies get the `Secure` flag.

## Connection failures — diagnostic playbook

If the workspace shows "**Disconnected**" or "**Missing Hermes APIs detected**" but the agent appears to be running:

### Step 1 — Verify the agent is reachable from inside the workspace container

```bash
docker compose exec hermes-workspace sh
# inside the workspace container:
curl -fsS http://hermes-agent:8642/health
curl -fsS -H "Authorization: Bearer $HERMES_API_TOKEN" http://hermes-agent:8642/v1/models | head -c 200
exit
```

If `/health` returns a JSON `{"status": "ok"}`, the agent is alive on the docker network.

### Step 2 — Confirm the workspace's environment

```bash
docker compose exec hermes-workspace env | grep -E "HERMES_API|API_SERVER"
```

You should see:

- `HERMES_API_URL=http://hermes-agent:8642` (or whichever service name)
- `HERMES_API_TOKEN=<same value as agent's API_SERVER_KEY>`

### Step 3 — Force a reprobe

The workspace caches the gateway capability map for 2 minutes (15 seconds when in disconnected state, since v2.2.1). If the agent came up after the workspace started probing, that cache is stale.

```bash
curl -X POST http://localhost:3000/api/gateway-reprobe
```

This re-runs the probe and returns the fresh capability map. If it now reads `mode=zero-fork` you're connected.

### Step 4 — Read the workspace's capability log

The workspace logs the full capability summary on every probe. Look for the `[gateway]` line:

```bash
docker compose logs hermes-workspace 2>&1 | grep '\[gateway\]' | tail -3
```

A healthy log looks like:

```
[gateway] gateway=http://hermes-agent:8642 dashboard=http://hermes-agent:9119 mode=zero-fork core=[health,chatCompletions,models,streaming] enhanced=[sessions,skills,memory,config,jobs,enhancedChat,conductor,kanban] missing=[mcp]
```

A failing log usually shows `core=[]` and `missing=[health,...]` — that means every probe got a non-2xx response. Check the agent's logs (`docker compose logs hermes-agent`) for matching 401/404/timeout entries.

### Common causes

| Symptom | Cause | Fix |
|---|---|---|
| `core=[]` and `missing=[health,...]` | Workspace probed before agent was ready | Wait 30s and reload, or `POST /api/gateway-reprobe`. Cache TTL drops to 15s in disconnected state. |
| `core=[health,chatCompletions]` but no `models` | Older agent image (pre-`/v1/models`) | Update: `docker compose pull && docker compose up -d` |
| All probes 401 | `HERMES_API_TOKEN` doesn't match agent's `API_SERVER_KEY` | Check both `.env` values are the same. They must match exactly. |
| Workspace UI shows "Connection refused" | Workspace using `127.0.0.1` instead of the service name | Set `HERMES_API_URL=http://hermes-agent:8642` (or whichever service name). |
| Agent restart loops with `API_SERVER_KEY required` | Agent bound to 0.0.0.0 without a key | Set `API_SERVER_KEY` in `.env` (mandatory for non-loopback bind). |

## Synology NAS / external host setups

If your workspace and agent are on **different stacks** on the same NAS (or different hosts entirely), they don't share a docker network. You need:

1. Both to publish their ports (the agent on `8642`, the workspace on `3000`).
2. The workspace to point at the agent's **host IP**, not service name. Example for Synology with NAS at `192.168.1.78`:

```bash
HERMES_API_URL=http://192.168.1.78:8642
HERMES_API_TOKEN=<API_SERVER_KEY>
HERMES_DASHBOARD_URL=http://192.168.1.78:9119
```

3. The agent to bind on `0.0.0.0`:

```bash
API_SERVER_HOST=0.0.0.0
API_SERVER_KEY=<long random>
```

4. The dashboard plugin (multi-board kanban, conductor missions) needs the dashboard service running on the agent host too — see the agent's docker-compose for that service.

If you bind the agent to `0.0.0.0` on a NAS without `API_SERVER_KEY`, the agent will refuse to start. This is intentional — open-internet exposure of the agent's chat endpoint without auth would be a footgun.

## Hermes Workspace + Hermes Agent: why two containers?

The workspace is the **UI**. The agent is the **engine**. Splitting them lets you:

- Update either independently (`docker compose pull hermes-workspace` etc.)
- Run multiple workspaces against one agent (different ports)
- Run the workspace on a tablet/phone while the agent stays on a beefy machine

The default compose colocates them for simplicity. The split-host setup above is the explicit "you know what you're doing" path.

## Filing bugs

If your setup matches the playbook above and still breaks, file an issue at <https://github.com/outsourc-e/hermes-workspace/issues> with:

1. Your `docker-compose.yml` (redact secrets)
2. The output of `docker compose logs hermes-workspace 2>&1 | grep '\[gateway\]' | tail -5`
3. The output of `curl -fsS http://<workspace-host>:3000/api/gateway-reprobe -X POST` (also redact)

That gets us to the actual cause within a couple of comments instead of a long back-and-forth.
