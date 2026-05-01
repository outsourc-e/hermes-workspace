<div align="center">

<img src="./public/claude-avatar.webp" alt="Hermes Workspace" width="80" style="border-radius: 16px" />

# Hermes Workspace

**Your AI agent's command center — chat, files, memory, skills, and terminal in one place.**

[![Version](https://img.shields.io/badge/version-2.0.0-2557b7.svg)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-6366F1.svg)](CONTRIBUTING.md)

> Not a chat wrapper. A complete workspace — orchestrate agents, browse memory, manage skills, and control everything from one interface.

> **v2 — zero-fork. Clone, don't fork.** Runs on vanilla [`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent) installed via Nous's own installer. No patches, no drift.

![Hermes Workspace](./docs/screenshots/splash.png)

</div>

---

## Swarm Mode

Hermes Agent Swarm turns the workspace into a live control plane: unlimited Hermes Agents, 1 orchestrator, 0 humans manually dispatching.
Persistent tmux workers keep context across tasks, rotate safely, and report proof-bearing checkpoints.
Role-based dispatch routes builders, reviewers, docs, research, ops, triage, QA, and lab lanes without turning Eric into the task router.
A byte-verified review gate protects release branches before PRs ship.
Autonomous PR/issue lanes, lab experiments, and the repair playbook keep the machine moving while humans handle judgment.

Start here: [docs/swarm/](./docs/swarm/)

- **Orchestrator Chat** — ask the control plane for one task, a decomposed mission, or a full broadcast.
- **Multi-Agent Control Plane** — see persistent Hermes Agents, roles, state, runtime, and routing wires in one surface.
- **Kanban TaskBoard** — plan backlog, ready, running, review, blocked, and done lanes without leaving the workspace.
- **Reports + Inbox** — review checkpoints, blockers, handoffs, and ready-for-human decisions.
- **TUI View built in** — attach to tmux-backed workers or fall back to a live shell/log stream.

---

## ✨ Features

- 🤖 **Hermes Agent Integration** — Direct gateway connection with real-time SSE streaming
- 🎨 **8-Theme System** — Official, Classic, Slate, Mono — each with light and dark variants
- 🔒 **Security Hardened** — Auth middleware on all API routes, CSP headers, exec approval prompts
- 📱 **Mobile-First PWA** — Full feature parity on any device via Tailscale
- ⚡ **Live SSE Streaming** — Real-time agent output with tool call rendering
- 🧠 **Memory & Skills** — Browse, search, and edit agent memory; explore 2,000+ skills

---

## 📸 Screenshots

|                 Chat                 |                  Conductor                   |
| :----------------------------------: | :------------------------------------------: |
| ![Chat](./docs/screenshots/chat.png) | ![Conductor](./docs/screenshots/conductor.png) |

|                   Dashboard                  |                  Memory                  |
| :------------------------------------------: | :--------------------------------------: |
| ![Dashboard](./docs/screenshots/dashboard.png) | ![Memory](./docs/screenshots/memory.png) |

|                   Terminal                   |                   Settings                   |
| :------------------------------------------: | :------------------------------------------: |
| ![Terminal](./docs/screenshots/terminal.png) | ![Settings](./docs/screenshots/settings.png) |

|                  Tasks                  |                 Jobs                 |
| :--------------------------------------: | :----------------------------------: |
| ![Tasks](./docs/screenshots/tasks.png) | ![Jobs](./docs/screenshots/jobs.png) |

---

## 🚀 Quick Start

### One-line install (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/outsourc-e/hermes-workspace/main/install.sh | bash
```

This installs `hermes-agent` from PyPI, clones this repo, sets up `.env`, and installs deps. Then:

```bash
hermes gateway run                  # terminal 1
cd ~/hermes-workspace && pnpm dev   # terminal 2
```

Open http://localhost:3000. That's it.

---

### Already running `hermes-agent`? Attach the workspace to it

If you already have `hermes-agent` installed (via Nous's installer, `pip install`, systemd, Docker, etc.) and it's serving the gateway at `http://<host>:8642`, you don't need to reinstall anything — just point the workspace at it.

```bash
git clone https://github.com/outsourc-e/hermes-workspace.git
cd hermes-workspace
pnpm install
cp .env.example .env

# Point at your existing Hermes Agent services.
echo 'HERMES_API_URL=http://127.0.0.1:8642' >> .env
# Zero-fork installs also need the separate dashboard API for config/sessions/skills/jobs.
echo 'HERMES_DASHBOARD_URL=http://127.0.0.1:9119' >> .env

# If your gateway was started with API_SERVER_KEY (auth enabled), set the same value:
# echo 'HERMES_API_TOKEN=***' >> .env

pnpm dev                            # http://localhost:3000 (override with PORT=4000 pnpm dev)
```

Requirements on the agent side:

- Gateway bound to an address the workspace can reach (typically `API_SERVER_HOST=0.0.0.0` + the port exposed).
- `API_SERVER_ENABLED=true` in `~/.hermes/.env` (or the agent's env) so the gateway serves core APIs on `:8642`.
- `hermes dashboard` running (default `http://127.0.0.1:9119`) for zero-fork installs. The dashboard provides config, sessions, skills, and jobs APIs.
- If `API_SERVER_KEY` is set, the workspace must pass the same value via `HERMES_API_TOKEN` — otherwise leave both unset.

Verify both services before opening the workspace:

- `curl http://127.0.0.1:8642/health` should return ok.
- `curl http://127.0.0.1:9119/api/status` should return dashboard metadata.

Then start the workspace and complete onboarding — it should detect the gateway + dashboard pair and unlock the enhanced panes automatically.

#### Running on a remote host (Tailscale / VPN / LAN)

If the workspace and its browser live on different machines — e.g. the workspace runs on a Pi/Mac/home server and you access it from your phone over Tailscale — point `HERMES_API_URL` at the **reachable** backend address, not `127.0.0.1`:

```bash
# On the server running the workspace + gateway:
echo 'HERMES_API_URL=http://100.x.y.z:8642' >> .env
echo 'HERMES_DASHBOARD_URL=http://100.x.y.z:9119' >> .env

# Also tell the gateway to listen on all interfaces so Tailscale peers can reach it.
# In ~/.hermes/.env (or wherever the gateway reads config):
echo 'API_SERVER_HOST=0.0.0.0' >> ~/.hermes/.env
```

Then restart the gateway, dashboard, and workspace. Hit the workspace from the remote device and the connection probe will use the Tailscale IP instead of localhost. Both `HERMES_API_URL` and `HERMES_DASHBOARD_URL` must be set to Tailscale/LAN-reachable URLs — setting only one will leave the other probing `127.0.0.1` and failing.

**If you've already started the workspace**, you can update both URLs from `Settings → Connection` without restarting. The values are persisted to `~/.hermes/workspace-overrides.json` and take effect immediately (gateway capabilities are reprobed on save). Editing `.env` still works for pre-start config and for CI/containers.

---

### Manual install

Hermes Workspace works with any OpenAI-compatible backend. If your backend also exposes Hermes Agent gateway APIs, enhanced features like sessions, memory, skills, and jobs unlock automatically.

#### Prerequisites

- **Node.js 22+** — [nodejs.org](https://nodejs.org/)
- **An OpenAI-compatible backend** — local, self-hosted, or remote
- **Optional:** Python 3.11+ if you want to run a Hermes Agent gateway locally

#### Step 1: Start your backend

Point Hermes Workspace at any backend that supports:

- `POST /v1/chat/completions`
- `GET /v1/models` recommended

Example Hermes Agent gateway setup (from scratch):

```bash
# Install hermes-agent via Nous's official installer
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash

# Configure a provider + start the gateway
claude setup
hermes gateway run
```

Our one-liner installer (below) does both steps automatically. If you're using another OpenAI-compatible server, just note its base URL.

### Step 2: Install & Run Hermes Workspace

```bash
# In a new terminal
git clone https://github.com/outsourc-e/hermes-workspace.git
cd hermes-workspace
pnpm install
cp .env.example .env
printf '\nHERMES_API_URL=http://127.0.0.1:8642\n' >> .env
pnpm dev                   # Starts on http://localhost:3000
```

> **Verify:** Open `http://localhost:3000` and complete the onboarding flow. First connect the backend, then verify chat works. If your gateway exposes Hermes Agent APIs, advanced features appear automatically.

### Agent W Managed Companion

When Hermes Workspace is running behind Agent W's local HTTPS proxy, the
managed companion entrypoint is:

```bash
https://localhost:4445/chat/new
```

For local validation from the workspace checkout:

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm build
pnpm smoke:managed
```

`pnpm smoke:managed` checks the managed `4445` surface and fails if the recent
PM2 error log still contains the missing-asset/runtime signatures that show up
when `dist` drifts under a live server process.

#### Environment Variables

```env
# OpenAI-compatible backend URL
HERMES_API_URL=http://127.0.0.1:8642

# Optional: provider keys the Hermes Agent gateway can read at runtime.
# You only need the key(s) for whichever provider(s) you actually use.
# ANTHROPIC_API_KEY=sk-ant-...         # Claude
# OPENAI_API_KEY=sk-...                # GPT / o-series
# OPENROUTER_API_KEY=sk-or-v1-...      # OpenRouter (incl. free models)
# GOOGLE_API_KEY=AIza...               # Gemini
# (Ollama / LM Studio / local servers don't need a key)

# Optional: password-protect the web UI
# CLAUDE_PASSWORD=your_password
```

---

## 🧠 Local Models (Ollama, Atomic Chat, LM Studio, vLLM)

Hermes Workspace supports two modes with local models:

### Portable Mode (Easiest)

Point the workspace directly at your local server — no Hermes Agent gateway needed.

### Atomic Chat

```bash
# Start workspace pointed at Atomic Chat
HERMES_API_URL=http://127.0.0.1:1337/v1 pnpm dev
```

Download [Atomic Chat](https://atomic.chat/), launch the desktop app, and make sure a model is loaded before starting Hermes Workspace.

### Ollama

```bash
# Start Ollama
OLLAMA_ORIGINS=* ollama serve

# Start workspace pointed at Ollama
HERMES_API_URL=http://127.0.0.1:11434 pnpm dev
```

Chat works immediately. Sessions, memory, and skills show "Not Available" — that's expected in portable mode.

### Enhanced Mode (Full Features)

Route through the Hermes Agent gateway for sessions, memory, skills, jobs, and tools.

Here are two explicit `~/.hermes/config.yaml` examples for the local providers we support directly in the workspace:

**Atomic Chat**

```yaml
provider: atomic-chat
model: your-model-name
custom_providers:
  - name: atomic-chat
    base_url: http://127.0.0.1:1337/v1
    api_key: atomic-chat
    api_mode: chat_completions
```

**Ollama**

```yaml
provider: ollama
model: qwen3:32b
custom_providers:
  - name: ollama
    base_url: http://127.0.0.1:11434/v1
    api_key: ollama
    api_mode: chat_completions
```

You can adapt the same shape for other OpenAI-compatible local runners, but `Atomic Chat` and `Ollama` are the two built-in local paths documented in the workspace UI.

**2. Enable the API server in `~/.hermes/.env`:**

```env
API_SERVER_ENABLED=true
```

**3. Start the gateway, dashboard, and workspace:**

```bash
hermes gateway run          # Starts core APIs on :8642
hermes dashboard            # Starts dashboard APIs on :9119
HERMES_API_URL=http://127.0.0.1:8642 \
HERMES_DASHBOARD_URL=http://127.0.0.1:9119 \
pnpm dev
```

For authenticated gateways, also set `HERMES_API_TOKEN` in the workspace environment to the same value as `API_SERVER_KEY`.

All workspace features unlock automatically once both services are reachable — sessions persist, memory saves across chats, skills are available, and the dashboard shows real usage data.

> **Works with any OpenAI-compatible server** — Atomic Chat, Ollama, LM Studio, vLLM, llama.cpp, LocalAI, etc. Just change the `base_url` and `model` in the config above.

---

## 🐳 Docker Quickstart

[![Open in GitHub Codespaces](https://img.shields.io/badge/GitHub%20Codespaces-Open-181717?logo=github)](https://github.com/codespaces/new?hide_repo_select=true&ref=main&repo=outsourc-e/hermes-workspace)

The Docker setup runs both the **Hermes Agent gateway** and **Hermes Workspace** together.

### Prerequisites

- **Docker**
- **Docker Compose**
- **Anthropic API Key** — [Get one here](https://console.anthropic.com/settings/keys) (required for the agent gateway)

### Step 1: Configure Environment

```bash
git clone https://github.com/outsourc-e/hermes-workspace.git
cd hermes-workspace
cp .env.example .env
```

Edit `.env` and add **at least one** LLM provider key — whichever provider you want hermes-agent to use:

```env
# Pick one (or more). You do NOT need all of these.
ANTHROPIC_API_KEY=sk-ant-...           # Claude
# OPENAI_API_KEY=sk-...                # GPT / o-series
# OPENROUTER_API_KEY=sk-or-v1-...      # OpenRouter (free models available)
# GOOGLE_API_KEY=AIza...               # Gemini
```

Using **Ollama, LM Studio, or another local server**? No key needed — just point hermes-agent at your local endpoint via the onboarding flow.

> **Heads up:** `hermes-agent` needs to be able to reach _some_ model. If you don't configure any provider (API key or local server), chat will fail on first message.

### Step 2: Start the Services

```bash
docker compose up
```

This pulls two pre-built images and starts them:

- **hermes-agent** → `nousresearch/hermes-agent:latest` on port **8642**
- **hermes-workspace** → `ghcr.io/outsourc-e/hermes-workspace:latest` on port **3000**

No local build. First run takes a minute to pull; subsequent starts are instant.
Agent state (config, sessions, skills, memory, credentials) persists in the
`claude-data` named volume, so containers can be recreated without data loss.

### Step 3: Access the Workspace

Open `http://localhost:3000` and complete the onboarding.

> **Verify:** Check the Docker logs for `[gateway] Connected to Hermes Agent` — this confirms the workspace successfully connected to the agent.

### Building from source

Want to hack on the workspace or the bundled agent Dockerfile? Use the dev overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

The base `docker-compose.yml` stays untouched — the overlay adds `build:` blocks
that take priority over `image:`, so both services compile from local source.

### Using a Pre-Built Image (Coolify / Easypanel / Dokploy / Unraid)

Deploying Hermes Workspace to a PaaS or home-lab stack? Pull the image
directly from GitHub Container Registry:

```
ghcr.io/outsourc-e/hermes-workspace:latest
```

Available tags:

| Tag | What it is |
|---|---|
| `latest` | Latest `main` commit (stable; recommended) |
| `v2.0.0` | Pinned semver tag |
| `main-<sha>` | Specific commit |

Minimal Coolify / Easypanel config:

```yaml
service: hermes-workspace
image: ghcr.io/outsourc-e/hermes-workspace:latest
port: 3000
env:
  HERMES_API_URL: http://hermes-agent:8642   # point at your gateway
  HERMES_API_TOKEN: ${API_SERVER_KEY}        # if gateway auth is enabled
```

The image is built for `linux/amd64` and `linux/arm64`. Pair it with either
a `nousresearch/hermes-agent:latest` container (what our `docker-compose.yml`
does by default) or an existing gateway on another host.

---

## 📱 Install as App (Recommended)

Hermes Workspace is a **Progressive Web App (PWA)** — install it for the full native app experience with no browser chrome, keyboard shortcuts, and offline support.

### 🖥️ Desktop (macOS / Windows / Linux)

1. Open Hermes Workspace in **Chrome** or **Edge** at `http://localhost:3000`
2. Click the **install icon** (⊕) in the address bar
3. Click **Install** — Hermes Workspace opens as a standalone desktop app
4. Pin to Dock / Taskbar for quick access

> **macOS users:** After installing, you can also add it to your Launchpad.

### 📱 iPhone / iPad (iOS Safari)

1. Open Hermes Workspace in **Safari** on your iPhone
2. Tap the **Share** button (□↑)
3. Scroll down and tap **"Add to Home Screen"**
4. Tap **Add** — the Hermes Workspace icon appears on your home screen
5. Launch from home screen for the full native app experience

### 🤖 Android

1. Open Hermes Workspace in **Chrome** on your Android device
2. Tap the **three-dot menu** (⋮) → **"Add to Home screen"**
3. Tap **Add** — Hermes Workspace is now a native-feeling app on your device

---

## 📡 Mobile Access via Tailscale

Access Hermes Workspace from anywhere on your devices — no port forwarding, no VPN complexity.

### Setup

1. **Install Tailscale** on your Mac and mobile device:
   - Mac: [tailscale.com/download](https://tailscale.com/download)
   - iPhone/Android: Search "Tailscale" in the App Store / Play Store

2. **Sign in** to the same Tailscale account on both devices

3. **Find your Mac's Tailscale IP:**

   ```bash
   tailscale ip -4
   # Example output: 100.x.x.x
   ```

4. **Open Hermes Workspace on your phone:**

   ```
   http://100.x.x.x:3000
   ```

5. **Add to Home Screen** using the steps above for the full app experience

> 💡 Tailscale works over any network — home wifi, mobile data, even across countries. Your traffic stays end-to-end encrypted.

---

## 🖥️ Native Desktop App

> **Status: In Development** — A native Electron-based desktop app is in active development.

The desktop app will offer:

- Native window management and tray icon
- System notifications for agent events and mission completions
- Auto-launch on startup
- Deep OS integration (macOS menu bar, Windows taskbar)

**In the meantime:** Install Hermes Workspace as a PWA (see above) for a near-native desktop experience — it works great.

---

## ☁️ Cloud & Hosted Setup

> **Status: Coming Soon**

A fully managed cloud version of Hermes Workspace is in development:

- **One-click deploy** — No self-hosting required
- **Multi-device sync** — Access your agents from any device
- **Team collaboration** — Shared mission control for your whole team
- **Automatic updates** — Always on the latest version

Features pending cloud infrastructure:

- Cross-device session sync
- Team shared memory and workspaces
- Cloud-hosted backend with managed uptime
- Webhook integrations and external triggers

---

## ✨ Features

### 💬 Chat

- Real-time SSE streaming with tool call rendering
- Agent-authored artifact events surfaced in the inspector
- Multi-session management with full history
- Markdown + syntax highlighting
- Chronological message ordering with merge dedup
- Inspector panel for session activity, memory, and skills

### 🧠 Memory

- Browse and edit agent memory files
- Search across memory entries
- Markdown preview with live editing

### 🧩 Skills

- Browse 2,000+ skills from the registry
- View skill details, categories, and documentation
- Skill management per session

### 📁 Files

- Full workspace file browser
- Navigate directories, preview and edit files
- Monaco editor integration

### 💻 Terminal

- Full PTY terminal with cross-platform support
- Persistent shell sessions
- Direct workspace access

### 🎨 Themes

- 8 themes: Official, Classic, Slate, Mono — each with light and dark variants
- Theme persists across sessions
- Full mobile dark mode support

### 🔒 Security

- Auth middleware on all API routes
- CSP headers via meta tags
- Path traversal prevention on file/memory routes (real-path boundary check, not string prefix)
- Rate limiting on endpoints
- Fail-closed startup guard: refuses to bind non-loopback without `CLAUDE_PASSWORD`
- Session cookies: `HttpOnly` + `SameSite=Strict` + `Secure` (in production)
- Optional password protection for web UI

**Key env vars for remote / Docker deployments:**

- `CLAUDE_PASSWORD` — required whenever `HOST ≠ 127.0.0.1`
- `COOKIE_SECURE=1` — force the `Secure` cookie flag when terminating HTTPS at a proxy
- `TRUST_PROXY=1` — trust `x-forwarded-for` / `x-real-ip` (only set behind a sanitizing reverse proxy)
- `HERMES_DASHBOARD_TOKEN` — explicit bearer for dashboard API (preferred over the legacy HTML-scrape fallback)
- `CLAUDE_ALLOW_INSECURE_REMOTE=1` — bypass the fail-closed guard (not recommended)

See `.env.example` for the full list. Credits to [@kiosvantra](https://github.com/kiosvantra) for the security audit surfacing #121–#125.

---

## 🔧 Troubleshooting

### "Workspace loads but chat doesn't work"

The workspace auto-detects your gateway's capabilities on startup. Check your terminal for a line like:

```
[gateway] http://127.0.0.1:8642 available: health, models; missing: sessions, skills, memory, config, jobs
[gateway] Missing Hermes Agent APIs detected. Update hermes-agent to the latest version.
```

**Fix:** Upgrade to the latest stock `hermes-agent`, which ships the extended endpoints:

```bash
cd ~/hermes-agent && git pull && uv pip install -e .
hermes gateway run
```

(If you installed via a different path, follow your Nous installer's upgrade instructions.) If you were on the old `outsourc-e/hermes-agent` fork, it's no longer needed as of v2 — uninstall it and use upstream instead.

### "Connection refused" or workspace hangs on load

Your Hermes Agent gateway isn't running. Start it:

```bash
hermes gateway run
```

First-time run? Do `claude setup` first to pick a provider and model.

### Ollama: chat returns empty or model shows "Offline"

Make sure your `~/.hermes/config.yaml` has the `custom_providers` section and `API_SERVER_ENABLED=true` in `~/.hermes/.env`. See [Local Models](#-local-models-ollama-lm-studio-vllm) above.

Also ensure Ollama is running with CORS enabled:

```bash
OLLAMA_ORIGINS=* ollama serve
```

Use `http://127.0.0.1:11434/v1` (not `localhost`) as the base URL.

Verify: `curl http://localhost:8642/health` should return `{"status": "ok"}`.

### "Using upstream NousResearch/hermes-agent"

v2+ runs on vanilla `hermes-agent` with full feature parity. The upstream ships all extended endpoints (sessions, memory, skills, config). **No fork required, ever.**

If you're pinned to an older `hermes-agent` version and missing endpoints, the workspace will degrade gracefully to **portable mode** with basic chat — upgrade upstream to restore full features.

### Docker: "Unauthorized" or "Connection refused" to hermes-agent

If using Docker Compose and getting auth errors:

1. **Check at least one provider key is set:**

   ```bash
   grep -E '_API_KEY' .env
   # Should show one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, GOOGLE_API_KEY, ...
   ```

   (hermes-agent reads whichever key matches the provider configured in `~/.hermes/config.yaml`.)

2. **View the agent container logs:**

   ```bash
   docker compose logs hermes-agent
   ```

   Look for startup errors or missing API key warnings.

3. **Verify the agent health endpoint:**

   ```bash
   curl http://localhost:8642/health
   # Should return: {"status": "ok"}
   ```

4. **Restart with fresh containers:**

   ```bash
   docker compose down
   docker compose up --build
   ```

5. **Check workspace logs for gateway status:**
   ```bash
   docker compose logs hermes-workspace
   ```
   Look for: `[gateway] http://hermes-agent:8642 mode=...` — if it shows `mode=disconnected`, the agent isn't running correctly.

### Docker: "claude webapi command not found"

The `claude webapi` command referenced in older docs doesn't exist. The correct command is:

```bash
hermes --gateway   # Starts the FastAPI gateway server
```

The Docker setup uses `hermes --gateway` automatically — no action needed if using `docker compose up`.

---

## 🗺️ Roadmap

| Feature                       | Status            |
| ----------------------------- | ----------------- |
| Chat + SSE Streaming          | ✅ Shipped        |
| Files + Terminal              | ✅ Shipped        |
| Memory Browser                | ✅ Shipped        |
| Skills Browser                | ✅ Shipped        |
| Mobile PWA + Tailscale        | ✅ Shipped        |
| 8-Theme System                | ✅ Shipped        |
| Native Desktop App (Electron) | 🔨 In Development |
| Model Switching & Config      | 🔨 In Development |
| Chat Abort / Cancel           | 🔨 In Development |
| Cloud / Hosted Version        | 🔜 Coming Soon    |
| Team Collaboration            | 🔜 Coming Soon    |

---

## ⭐ Star History

## [![Star History Chart](https://api.star-history.com/svg?repos=outsourc-e/hermes-workspace&type=date&logscale&legend=top-left)](https://www.star-history.com/#outsourc-e/hermes-workspace&type=date&logscale&legend=top-left)

## 💛 Support the Project

Hermes Workspace is free and open source. If it's saving you time and powering your workflow, consider supporting development:

**ETH:** `0xB332D4C60f6FBd94913e3Fd40d77e3FE901FAe22`

[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-%E2%9D%A4-pink?logo=github)](https://github.com/sponsors/outsourc-e)

Every contribution helps keep this project moving. Thank you 🙏

---

## 🤝 Contributing

PRs are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- Bug fixes → open a PR directly
- New features → open an issue first to discuss
- Security issues → see [SECURITY.md](SECURITY.md) for responsible disclosure

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <sub>Built with ⚡ by <a href="https://github.com/outsourc-e">@outsourc-e</a> and the Hermes Workspace community</sub>
</div>
