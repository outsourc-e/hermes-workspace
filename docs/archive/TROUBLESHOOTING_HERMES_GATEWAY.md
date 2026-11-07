# Hermes Gateway Troubleshooting Guide

## Quick Status Check

```bash
# Check if Hermes gateway API server is running
curl -s http://127.0.0.1:8642/health
# Expected: {"status":"ok","platform":"hermes-agent","version":"..."}

# Check workspace gateway status
curl -s http://127.0.0.1:3001/api/gateway-status
# Expected: mode="zero-fork", gateway.available=true
```

---

## Common Issues & Fixes

### 1. API Server Disconnected (Port 8642 Not Binding)

**Symptoms:**
- `curl http://127.0.0.1:8642/health` fails
- Gateway logs show: `Could not bind 100.85.50.87:8642`
- Dashboard shows `api_server` state: `disconnected`

**Root Cause:**
`API_SERVER_HOST` in `~/.hermes/.env` is set to a specific IP (e.g., Tailscale IP `100.85.50.87`) instead of `0.0.0.0`. This prevents binding to all interfaces.

**Fix:**
```bash
# Change binding to all interfaces
sed -i '' 's/API_SERVER_HOST=100.85.50.87/API_SERVER_HOST=0.0.0.0/' ~/.hermes/.env

# Restart Hermes gateway
hermes gateway restart

# Verify
curl -s http://127.0.0.1:8642/health
```

**Why this happens:**
- `API_SERVER_HOST` env var overrides `config.yaml` setting
- Tailscale IP binding fails if interface isn't ready or permissions differ
- `0.0.0.0` binds to all interfaces (localhost + Tailscale + LAN)

---

### 2. Workspace Can't Connect to Gateway

**Symptoms:**
- Workspace shows `mode: "disconnected"` in `/api/gateway-status`
- `HERMES_API_URL` in workspace `.env` points to wrong address

**Fix:**
```bash
# Update workspace .env to use local gateway
sed -i '' 's|HERMES_API_URL=http://100.85.50.87:8642|HERMES_API_URL=http://127.0.0.1:8642|' /path/to/hermes-workspace/.env

# Restart workspace dev server
pkill -f "vite dev"
cd /path/to/hermes-workspace && pnpm dev
```

**Note:** The workspace auto-detects the gateway on `127.0.0.1:8642` if `HERMES_API_URL` is not set.

---

### 3. Hermes Proxy Returns 401 Unauthorized

**Symptoms:**
- `/api/hermes-proxy/*` returns `Invalid gateway API key (API_SERVER_KEY)`
- Direct API calls with token work: `curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8642/v1/models`

**Root Cause:**
Vite dev server proxy intercepts `/api/hermes-proxy` before TanStack Start route handler.

**Fix:** Remove conflicting Vite proxy in `vite.config.ts`:
```typescript
// REMOVE this block:
'/api/hermes-proxy': {
  target: proxyTarget,
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/api\/hermes-proxy/, ''),
},
```

The TanStack Start route at `src/routes/api/hermes-proxy/$.ts` handles auth correctly.

---

### 4. Workspace Dev Server Doesn't Load .env for Server Routes

**Symptoms:**
- Server-side code reads empty `process.env.HERMES_API_TOKEN`
- Client-side env vars work (Vite loads them)

**Fix:** Add dotenv to gateway-capabilities.ts (loads early in server):
```typescript
// src/server/gateway-capabilities.ts - ADD at top:
import 'dotenv/config'
```

And install dotenv:
```bash
pnpm add -w dotenv
```

---

### 5. Gateway Won't Restart / "Gateway Already Running" Error

**Symptoms:**
- `hermes gateway restart` says "gateway already running"
- Old PID holds lock

**Fix:**
```bash
# Force stop and replace
hermes gateway stop
# OR if stuck:
pkill -9 -f "hermes gateway run"
hermes gateway run --replace

# Or use the CLI properly:
hermes gateway restart
```

---

## Configuration Reference

### ~/.hermes/.env (Gateway)
```bash
# Required for workspace connection
API_SERVER_ENABLED=true
API_SERVER_KEY=hermes_internal_secret_key_2026
API_SERVER_HOST=0.0.0.0   # CRITICAL: bind all interfaces
API_SERVER_PORT=8642

# Optional: for Tailscale access, gateway binds 0.0.0.0 automatically
# No need to set specific Tailscale IP here
```

### ~/.hermes/config.yaml (Gateway)
```yaml
gateway:
  api_server:
    enabled: true
    port: 8642
    host: 0.0.0.0   # Matches env var
```

### hermes-workspace/.env (Workspace)
```bash
# Gateway connection (auto-detects if omitted)
HERMES_API_URL=http://127.0.0.1:8642

# Must match API_SERVER_KEY on gateway
HERMES_API_TOKEN=hermes_internal_secret_key_2026

# Dashboard (separate service on port 9119)
HERMES_DASHBOARD_URL=http://127.0.0.1:9119
```

### docker-compose.yml (Production)
```yaml
services:
  hermes-agent:
    environment:
      API_SERVER_ENABLED: 'true'
      API_SERVER_KEY: ${API_SERVER_KEY}
      API_SERVER_HOST: '127.0.0.1'  # Internal docker network
    ports:
      - '8642:8642'

  hermes-workspace:
    environment:
      HERMES_API_URL: http://hermes-agent:8642
      HERMES_API_TOKEN: ${API_SERVER_KEY}
```

---

## Diagnostic Commands

```bash
# Check gateway process
ps aux | grep "hermes gateway"

# Check port bindings
lsof -i :8642
lsof -i :8644  # webhook
lsof -i :9119  # dashboard

# Gateway logs
tail -f ~/.hermes/logs/gateway.log
tail -f ~/.hermes/logs/gateway.error.log

# Workspace logs (dev)
cat /tmp/workspace*.log

# Test direct gateway API
curl -H "Authorization: Bearer $HERMES_API_TOKEN" http://127.0.0.1:8642/v1/models
curl -H "Authorization: Bearer $HERMES_API_TOKEN" http://127.0.0.1:8642/api/sessions
curl -s http://127.0.0.1:9119/api/status  # Dashboard
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    User Browser                              │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP :3001
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Hermes Workspace (Vite + TanStack Start)        │
│  - Serves UI                                                │
│  - /api/gateway-status  → probes gateway capabilities       │
│  - /api/hermes-proxy/*  → authenticated proxy to gateway    │
│  - /api/connection-status → connection health check         │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP :8642 (with Bearer token)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Hermes Gateway (hermes-agent)                   │
│  - /health              → health check                       │
│  - /v1/models           → model list                         │
│  - /v1/chat/completions → OpenAI-compatible chat             │
│  - /api/sessions        → session management                 │
│  - /api/skills          → skills API                         │
│  - /api/config          → config API                         │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP :9119
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Hermes Dashboard                                │
│  - /api/status          → dashboard status                   │
│  - UI for sessions, skills, config, analytics               │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Ports

| Service | Port | Purpose |
|---------|------|---------|
| Workspace UI | 3001 (dev) / 3000 (prod) | Main web interface |
| Hermes Gateway API | 8642 | Core API (chat, models, sessions) |
| Webhook Receiver | 8644 | Platform webhooks (Slack, Telegram, etc) |
| Dashboard | 9119 | Extended UI, skills, config management |

---

## Recovery Checklist

When things break, run through in order:

1. [ ] `curl http://127.0.0.1:8642/health` — Gateway API alive?
2. [ ] `curl http://127.0.0.1:9119/api/status` — Dashboard alive?
3. [ ] Check `API_SERVER_HOST=0.0.0.0` in `~/.hermes/.env`
4. [ ] `hermes gateway restart` — Full restart
5. [ ] `curl http://127.0.0.1:3001/api/gateway-status` — Workspace sees gateway?
6. [ ] Check `HERMES_API_TOKEN` matches `API_SERVER_KEY`
7. [ ] Check Vite proxy not conflicting with `/api/hermes-proxy`

---

## Related Files

- `~/.hermes/.env` — Gateway runtime config
- `~/.hermes/config.yaml` — Gateway persistent config
- `hermes-workspace/.env` — Workspace config
- `hermes-workspace/vite.config.ts` — Dev server config (proxies)
- `hermes-workspace/src/server/gateway-capabilities.ts` — Capability probing
- `hermes-workspace/src/routes/api/hermes-proxy/$.ts` — Authenticated proxy
- `hermes-workspace/src/routes/api/gateway-status.ts` — Status endpoint
- `hermes-workspace/src/routes/api/connection-status.ts` — Connection health