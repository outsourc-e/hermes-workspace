# Troubleshooting — Hermes Workspace

Common setup issues and how to fix them.

---

## 1. Gateway starts but API server never binds (port 8642 not listening)

**Symptom:** `hermes gateway run` appears to start, but `curl http://127.0.0.1:8642/health` fails. `ss -tlnp | grep 8642` shows nothing.

**Cause:** `API_SERVER_ENABLED` is not set — or is set with the wrong env var name.

**Fix:**

```bash
# Find your Hermes env file
hermes config env-path
# Usually: ~/.hermes/.env

# Check for the key
grep -i API_SERVER ~/.hermes/.env
```

The env var must be **exactly** `API_SERVER_ENABLED=true` — with underscores. Common mistakes:

| Wrong | Right |
|---|---|
| `APISERVERENABLED=true` | `API_SERVER_ENABLED=true` |
| `APISERVERHOST=0.0.0.0` | `API_SERVER_HOST=127.0.0.1` |
| `ApiServerEnabled=true` | `API_SERVER_ENABLED=true` |

After fixing, restart the gateway: `hermes gateway run --replace`

**Also:** setting `API_SERVER_HOST=0.0.0.0` without `API_SERVER_KEY` causes a silent refusal. Use `127.0.0.1` for local access, or set a key for network access.

---

## 2. Workspace shows "Connect Backend" / "Skip setup" (mode=disconnected)

**Symptom:** Browser shows the onboarding welcome screen instead of the chat UI. Dev server logs show `mode=disconnected`.

**Cause:** Workspace can't reach the gateway HTTP API.

**Checklist (in order):**

1. Is the gateway running? `hermes gateway status` or `pgrep -af "hermes.*gateway"`
2. Is port 8642 bound? `curl -sf http://127.0.0.1:8642/health`
3. Is Workspace `.env` correct? `grep HERMES_API_URL ~/hermes-workspace/.env`
   - Should be: `HERMES_API_URL=http://127.0.0.1:8642`
4. Restart Workspace: `pnpm dev`

If the gateway is running and healthy but Workspace still disconnects, check for port conflicts (another process on 8642) or firewall rules.

---

## 3. Port 8642 already in use

**Symptom:** Gateway fails to start with "Address already in use" or silently exits.

**Fix:**

```bash
# Find what's using the port
lsof -i :8642    # macOS
ss -tlnp | grep 8642   # Linux

# Kill the stale process
kill <PID>

# Restart
hermes gateway run --replace
```

---

## 4. WSL: Gateway health check times out on first boot

**Symptom:** Workspace starts, checks the gateway, reports "disconnected". But if you wait 15 seconds and refresh, it works.

**Cause:** Python cold-start on WSL is slower (8–15s) due to filesystem overhead. Workspace's health check times out before the gateway is ready.

**Fix:** Start in two separate terminals:

```bash
# Terminal 1 — start gateway first, wait for it
hermes gateway run
# Wait until you see "Uvicorn running on http://127.0.0.1:8642"

# Terminal 2 — then start workspace
cd ~/hermes-workspace && pnpm dev
```

---

## 5. Dev server crashes immediately after boot

**Symptom:** `pnpm dev` starts, shows the Vite banner, then crashes with ELIFECYCLE or a stack trace.

**Common causes:**

- **Merge conflict markers in source files:** `grep -r "<<<<<<" src/` — if you find any, resolve them or `git checkout -- <file>`.
- **Missing node_modules:** `pnpm install`
- **Node version too old:** `node --version` — requires Node 22+.
- **Port already in use:** `lsof -i :3000` (macOS) or `ss -tlnp | grep 3000` (Linux) — kill the stale process.

---

## 6. "No compatible backend detected" in onboarding

**Symptom:** Clicked "Connect Backend", health check runs, shows error.

This means the Vite SSR server tried `GET /api/gateway-status` which internally probes the gateway. The probe failed.

**Most likely:** the gateway API server isn't running. See issue #1 above.

**Less likely:** `.env` has the wrong `HERMES_API_URL` (e.g. wrong port, `https` instead of `http`, `localhost` instead of `127.0.0.1` on WSL).

---

## Diagnostic bundle

If nothing above helps, run this and share the output:

```bash
echo "=== hermes version ===" && hermes --version 2>&1
echo "=== hermes env path ===" && hermes config env-path 2>&1
echo "=== hermes env (redacted) ===" && grep -E "^(API_SERVER|HERMES_|CLAUDE_)" "$(hermes config env-path 2>/dev/null || echo ~/.hermes/.env)" 2>&1
echo "=== gateway process ===" && pgrep -af "hermes.*gateway" 2>&1 || echo "not running"
echo "=== port 8642 ===" && (ss -tlnp 2>/dev/null || lsof -iTCP:8642 -sTCP:LISTEN 2>/dev/null) | grep 8642 || echo "not bound"
echo "=== health check ===" && curl -sf http://127.0.0.1:8642/health 2>&1 || echo "not reachable"
echo "=== workspace .env ===" && grep CLAUDE ~/hermes-workspace/.env 2>&1 || echo "no .env"
echo "=== OS ===" && uname -a
echo "=== Node ===" && node --version
echo "=== Python ===" && python3 --version 2>&1
```
