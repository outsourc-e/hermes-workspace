<div align="center">

<img src="./public/hermes-avatar.webp" alt="Hermes Workspace" width="80" style="border-radius: 16px" />

# Hermes Workspace

**Your AI agent's command center — chat, files, memory, skills, and terminal in one place.**

[![Version](https://img.shields.io/badge/version-1.0.0-6366F1.svg)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-6366F1.svg)](CONTRIBUTING.md)

> Not a chat wrapper. A complete workspace — orchestrate agents, browse memory, manage skills, and control everything from one interface.

> **v2 — zero-fork. Clone, don't fork.** Runs on vanilla [`pip install hermes-agent`](https://github.com/NousResearch/hermes-agent). No patches, no drift. Upgrade any time with `pip install -U hermes-agent`.

![Hermes Workspace](./docs/screenshots/splash.png)

</div>

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

|                 Chat                 |                 Files                  |
| :----------------------------------: | :------------------------------------: |
| ![Chat](./docs/screenshots/chat.png) | ![Files](./docs/screenshots/files.png) |

|                   Terminal                   |                  Memory                  |
| :------------------------------------------: | :--------------------------------------: |
| ![Terminal](./docs/screenshots/terminal.png) | ![Memory](./docs/screenshots/memory.png) |

|                  Skills                  |                   Settings                   |
| :--------------------------------------: | :------------------------------------------: |
| ![Skills](./docs/screenshots/skills.png) | ![Settings](./docs/screenshots/settings.png) |

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

### Manual install

Hermes Workspace works with any OpenAI-compatible backend. If your backend also exposes Hermes gateway APIs, enhanced features like sessions, memory, skills, and jobs unlock automatically.

#### Prerequisites

- **Node.js 22+** — [nodejs.org](https://nodejs.org/)
- **An OpenAI-compatible backend** — local, self-hosted, or remote
- **Optional:** Python 3.11+ if you want to run a Hermes gateway locally

#### Step 1: Start your backend

Point Hermes Workspace at any backend that supports:

- `POST /v1/chat/completions`
- `GET /v1/models` recommended

Example Hermes gateway setup:

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install hermes-agent
hermes setup
hermes gateway run
```

If you're using another OpenAI-compatible server, just note its base URL.

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

> **Verify:** Open `http://localhost:3000` and complete the onboarding flow. First connect the backend, then verify chat works. If your gateway exposes Hermes APIs, advanced features appear automatically.

#### Environment Variables

```env
# OpenAI-compatible backend URL
HERMES_API_URL=http://127.0.0.1:8642

# Optional provider keys for Hermes gateway-managed config
ANTHROPIC_API_KEY=your-key-here

# Optional: password-protect the web UI
# HERMES_PASSWORD=your_password
```

---

## 🧠 Local Models (Ollama, Atomic Chat, LM Studio, vLLM)

Hermes Workspace supports two modes with local models:

### Portable Mode (Easiest)

Point the workspace directly at your local server — no Hermes gateway needed.

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

Route through the Hermes gateway for sessions, memory, skills, jobs, and tools.

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

**3. Start the gateway and workspace:**

```bash
hermes gateway run          # Starts on :8642
HERMES_API_URL=http://127.0.0.1:8642 pnpm dev
```

All workspace features unlock automatically — sessions persist, memory saves across chats, skills are available, and the dashboard shows real usage data.

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

Edit `.env` and add your API key:

```env
ANTHROPIC_API_KEY=your-key-here
```

> **Important:** The `hermes-agent` container requires `ANTHROPIC_API_KEY` to function. Without it, the gateway will fail to authenticate.

### Step 2: Start the Services

```bash
docker compose up
```

This starts two services:

- **hermes-agent** — The AI agent gateway (port 8642)
- **hermes-workspace** — The web UI (port 3000)

### Step 3: Access the Workspace

Open `http://localhost:3000` and complete the onboarding.

> **Verify:** Check the Docker logs for `[gateway] Connected to Hermes` — this confirms the workspace successfully connected to the agent.

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
- Path traversal prevention on file/memory routes
- Rate limiting on endpoints
- Optional password protection for web UI

---

## 🔧 Troubleshooting

### "Workspace loads but chat doesn't work"

The workspace auto-detects your gateway's capabilities on startup. Check your terminal for a line like:

```
[gateway] http://127.0.0.1:8642 available: health, models; missing: sessions, skills, memory, config, jobs
[gateway] Missing Hermes APIs detected. Update Hermes: pip install -U hermes-agent && hermes gateway run
```

**Fix:** Upgrade to the latest stock `hermes-agent`, which now ships the extended endpoints:

```bash
pip install -U hermes-agent
hermes gateway run
```

If you were on the old `outsourc-e/hermes-agent` fork, it's no longer needed as of v2 — uninstall it and install upstream instead.

### "Connection refused" or workspace hangs on load

Your Hermes gateway isn't running. Start it:

```bash
cd hermes-agent
source .venv/bin/activate
hermes gateway run
```

### Ollama: chat returns empty or model shows "Offline"

Make sure your `~/.hermes/config.yaml` has the `custom_providers` section and `API_SERVER_ENABLED=true` in `~/.hermes/.env`. See [Local Models](#-local-models-ollama-lm-studio-vllm) above.

Also ensure Ollama is running with CORS enabled:

```bash
OLLAMA_ORIGINS=* ollama serve
```

Use `http://127.0.0.1:11434/v1` (not `localhost`) as the base URL.

Verify: `curl http://localhost:8642/health` should return `{"status": "ok"}`.

### "Using upstream NousResearch/hermes-agent"

v2+ runs on vanilla `hermes-agent` with full feature parity. `pip install -U hermes-agent` gets you the extended endpoints (sessions, memory, skills, config). **No fork required, ever.**

If you're pinned to an older `hermes-agent` version and missing endpoints, the workspace will degrade gracefully to **portable mode** with basic chat — upgrade upstream to restore full features.

### Docker: "Unauthorized" or "Connection refused" to hermes-agent

If using Docker Compose and getting auth errors:

1. **Check your API key is set:**

   ```bash
   cat .env | grep ANTHROPIC_API_KEY
   # Should show: ANTHROPIC_API_KEY=sk-ant-...
   ```

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

### Docker: "hermes webapi command not found"

The `hermes webapi` command referenced in older docs doesn't exist. The correct command is:

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
