# Agent Pairing Guide — Workspace ↔ Claude Gateway

> **Audience:** AI agents helping users set up Hermes Workspace.
> Run these steps in order. Each step has a verification command — don't
> skip to the next until the check passes.

## Architecture (30-second version)

```
┌─────────────────┐       HTTP :8642        ┌──────────────────┐
│  Claude Gateway  │◄──────────────────────►│ Hermes Workspace │
│  (Python, FastAPI)│  /health, /v1/chat,   │  (Node, Vite)     │
│  hermes gateway   │  /api/sessions, etc.  │  pnpm dev         │
│  run              │                       │  port 3000        │
└─────────────────┘                        └──────────────────┘
```

Workspace talks to the gateway over HTTP. No WebSocket. No magic.
If `curl http://127.0.0.1:8642/health` returns JSON, they can pair.

---

## Step 1 — Is hermes-agent installed?

```bash
claude --version
```

**Pass:** prints `Hermes Agent vX.Y.Z`.
**Fail:** `command not found`.

### Fix (if hermes-agent not installed)

```bash
# Official Nous installer — works on macOS, Linux, WSL
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
```

After install, restart your shell or run:
```bash
export PATH="$HOME/.local/bin:$PATH"
claude --version
```

---

## Step 2 — Is the API server enabled?

The gateway exposes an HTTP API on port 8642, but only if `API_SERVER_ENABLED=true`
is set in the claude env file.

```bash
# Find the env file
CLAUDE_ENV="$(claude config env-path 2>/dev/null || echo "$HOME/.claude/.env")"
echo "Claude env file: $CLAUDE_ENV"

# Check for the key
grep -i "API_SERVER" "$CLAUDE_ENV" 2>/dev/null || echo "NO API_SERVER KEYS FOUND"
```

**Pass:** output includes `API_SERVER_ENABLED=true` (with underscores).

**Common failure — wrong env var names:**
```
# ❌ WRONG (missing underscores — gateway silently ignores these)
APISERVERENABLED=true
APISERVERHOST=0.0.0.0

# ✅ CORRECT
API_SERVER_ENABLED=true
API_SERVER_HOST=127.0.0.1
```

> **Critical:** env var names MUST have underscores. `APISERVERENABLED` ≠
> `API_SERVER_ENABLED`. The gateway reads exact names via `os.getenv()`.
> Typos are silently ignored — no warning, no error, just no API server.

### Fix

```bash
CLAUDE_ENV="$(claude config env-path 2>/dev/null || echo "$HOME/.claude/.env")"
mkdir -p "$(dirname "$CLAUDE_ENV")"

# Remove any typo'd versions first
sed -i.bak '/^APISERVERENABLED/d; /^APISERVERHOST/d; /^APISERVERKEY/d; /^APISERVERPORT/d' "$CLAUDE_ENV" 2>/dev/null || true

# Write correct keys (idempotent — updates existing or appends)
grep -q '^API_SERVER_ENABLED=' "$CLAUDE_ENV" 2>/dev/null && \
  sed -i.bak 's/^API_SERVER_ENABLED=.*/API_SERVER_ENABLED=true/' "$CLAUDE_ENV" || \
  echo 'API_SERVER_ENABLED=true' >> "$CLAUDE_ENV"
```

**Do NOT set `API_SERVER_HOST=0.0.0.0`** unless the user explicitly wants
network access AND sets `API_SERVER_KEY=<some-secret>`. The gateway refuses
to bind non-loopback without a key (silent failure). Default `127.0.0.1` is
correct for local Workspace.

---

## Step 3 — Is the gateway process running?

```bash
pgrep -af "claude.*gateway" || echo "NOT RUNNING"
```

**Pass:** shows a `hermes gateway run` (or similar) process.
**Fail:** nothing.

### Fix

```bash
# Start in foreground (recommended for debugging — you see all output)
hermes gateway run

# OR if using systemd
hermes gateway install   # creates the service
systemctl --user start claude-gateway
```

**First run:** claude may prompt for initial setup (provider, model). Complete
the interactive setup before continuing.

---

## Step 4 — Is port 8642 bound?

```bash
# Linux / WSL
ss -tlnp | grep 8642 || echo "PORT NOT BOUND"

# macOS
lsof -iTCP:8642 -sTCP:LISTEN || echo "PORT NOT BOUND"

# Universal fallback
curl -sf http://127.0.0.1:8642/health && echo "OK" || echo "NOT REACHABLE"
```

**Pass:** port is bound AND `curl /health` returns `{"status": "ok", "platform": "hermes-agent"}`.

**Fail — gateway running but port not bound:** API server didn't start.
Go back to Step 2 and verify the env vars have underscores.

**Fail — port bound by something else:**
```bash
# Find what's on the port
lsof -i :8642   # macOS
ss -tlnp | grep 8642   # Linux
# Kill the stale process, then restart gateway
```

---

## Step 5 — Is Workspace pointed at the gateway?

```bash
# In the hermes-workspace directory
cat .env | grep HERMES_API_URL
```

**Pass:** `HERMES_API_URL=http://127.0.0.1:8642`

**Fail or missing:**
```bash
# In the hermes-workspace directory
echo 'HERMES_API_URL=http://127.0.0.1:8642' >> .env
```

If `.env` doesn't exist:
```bash
cp .env.example .env
# Then set HERMES_API_URL as above
```

---

## Step 6 — Start Workspace and verify pairing

```bash
cd ~/hermes-workspace   # or wherever it's installed
pnpm dev
```

**Look for this in the startup output:**
```
[claude-api] Configured API: http://127.0.0.1:8642
[gateway] gateway=http://127.0.0.1:8642 ... mode=enhanced-fork core=[health, chatCompletions, models, streaming]
```

**`mode=enhanced-fork`** = paired successfully. Sessions, memory, skills all
available.

**`mode=disconnected`** = pairing failed. Go back to Step 4.

---

## Step 7 — Verify in browser

Open `http://localhost:3000` (or whatever port Vite reports).

- **Full UI with chat** = success.
- **"Connect Backend" / "Skip setup" onboarding screen** = gateway not reachable
  from the Vite SSR server. Re-check Steps 4–5.
- **500 error / blank page** = Vite build issue, not a pairing problem.
  Check terminal for build errors.

---

## Quick-fix cheat sheet (copy-paste block)

For users who just want it to work — run this entire block:

```bash
# 1. Find claude env
CLAUDE_ENV="$(claude config env-path 2>/dev/null || echo "$HOME/.claude/.env")"
mkdir -p "$(dirname "$CLAUDE_ENV")"

# 2. Enable API server (idempotent)
grep -q '^API_SERVER_ENABLED=' "$CLAUDE_ENV" 2>/dev/null && \
  sed -i.bak 's/^API_SERVER_ENABLED=.*/API_SERVER_ENABLED=true/' "$CLAUDE_ENV" || \
  echo 'API_SERVER_ENABLED=true' >> "$CLAUDE_ENV"

# 3. Clean up common typos
sed -i.bak '/^APISERVERENABLED/d; /^APISERVERHOST/d' "$CLAUDE_ENV" 2>/dev/null || true

# 4. Restart gateway
hermes gateway stop 2>/dev/null; sleep 2; hermes gateway run &
sleep 8

# 5. Verify
curl -sf http://127.0.0.1:8642/health && echo "✅ Gateway API is up" || echo "❌ Gateway API not reachable"

# 6. Set workspace env
cd ~/hermes-workspace 2>/dev/null || cd "$(find ~ -maxdepth 2 -name hermes-workspace -type d | head -1)"
grep -q '^HERMES_API_URL=' .env 2>/dev/null && \
  sed -i.bak 's|^HERMES_API_URL=.*|HERMES_API_URL=http://127.0.0.1:8642|' .env || \
  echo 'HERMES_API_URL=http://127.0.0.1:8642' >> .env

echo "✅ Done. Run: pnpm dev"
```

---

## Platform-specific notes

### WSL (Windows Subsystem for Linux)

- Python cold-start is slower on WSL due to filesystem I/O overhead.
  The gateway may take 10–15 seconds to bind port 8642.
- If Workspace's health check times out before the gateway is ready,
  start the gateway separately first (`hermes gateway run`), wait for
  the port to bind, then start Workspace in a second terminal.
- Use `127.0.0.1`, not `localhost` — WSL2 sometimes resolves `localhost`
  to the Windows host instead of the WSL VM.

### macOS

- No special considerations. Default setup works.
- If using Homebrew Python, ensure `claude` is on PATH:
  `export PATH="$HOME/.local/bin:$PATH"`

### Linux (native)

- systemd users: `hermes gateway install` creates a user service.
  Check status with `systemctl --user status claude-gateway`.
- If using a different `$HOME` for the systemd service (e.g. running as
  a different user), the `.env` file location changes. Use
  `claude config env-path` to find it.

---

## Still broken?

Collect this diagnostic bundle and share it:

```bash
echo "=== claude version ===" && claude --version 2>&1
echo "=== claude env path ===" && claude config env-path 2>&1
echo "=== claude env (redacted) ===" && grep -E "^(API_SERVER|CLAUDE_)" "$(claude config env-path 2>/dev/null || echo ~/.hermes/.env)" 2>&1
echo "=== gateway process ===" && pgrep -af "claude.*gateway" 2>&1 || echo "not running"
echo "=== port 8642 ===" && (ss -tlnp 2>/dev/null || lsof -iTCP:8642 -sTCP:LISTEN 2>/dev/null) | grep 8642 || echo "not bound"
echo "=== health check ===" && curl -sf http://127.0.0.1:8642/health 2>&1 || echo "not reachable"
echo "=== workspace .env ===" && grep CLAUDE ~/hermes-workspace/.env 2>&1 || echo "no .env"
echo "=== OS ===" && uname -a
echo "=== Node ===" && node --version
echo "=== Python ===" && python3 --version 2>&1
```

This gives any human or agent enough context to diagnose the issue in one read.
