<div align="center">

<img src="./public/hermes-avatar.webp" alt="Hermes Workspace" width="80" style="border-radius: 16px" />

# Hermes Workspace

**Your AI agent's command center — chat, files, memory, skills, and terminal in one place.**

[![Version](https://img.shields.io/badge/version-0.1.0-6366F1.svg)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-6366F1.svg)](CONTRIBUTING.md)

> Not a chat wrapper. A complete workspace — orchestrate agents, browse memory, manage skills, and control everything from one interface.

![Hermes Workspace](./docs/screenshots/splash.png)

</div>

---

## ✨ Features

- 🤖 **Hermes Agent Integration** — Direct FastAPI backend connection with real-time SSE streaming
- 🎨 **8-Theme System** — Official, Classic, Slate, Mono — each with light and dark variants
- 🔒 **Security Hardened** — Auth middleware on all API routes, CSP headers, exec approval prompts
- 📱 **Mobile-First PWA** — Full feature parity on any device via Tailscale
- ⚡ **Live SSE Streaming** — Real-time agent output with tool call rendering
- 🧠 **Memory & Skills** — Browse, search, and edit agent memory; explore 2,000+ skills

---

## 📸 Screenshots

| Chat | Files |
|:---:|:---:|
| ![Chat](./docs/screenshots/chat.png) | ![Files](./docs/screenshots/files.png) |

| Terminal | Memory |
|:---:|:---:|
| ![Terminal](./docs/screenshots/terminal.png) | ![Memory](./docs/screenshots/memory.png) |

| Skills | Settings |
|:---:|:---:|
| ![Skills](./docs/screenshots/skills.png) | ![Settings](./docs/screenshots/settings.png) |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 22+** — [nodejs.org](https://nodejs.org/)
- **Python 3.11+** — [python.org](https://www.python.org/)
- **Hermes Agent (with WebAPI)** — see below

### Step 1: Set up Hermes Agent (backend)

> **⚠️ Important:** Hermes Workspace requires the **WebAPI backend** (`hermes webapi`), which provides the FastAPI server with session management, chat streaming, skills, and memory endpoints. The upstream NousResearch/hermes-agent does not include this yet — use our fork which adds the WebAPI layer.

```bash
# Clone the fork with WebAPI support
git clone https://github.com/outsourc-e/hermes-agent.git
cd hermes-agent
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e .

# Run the interactive setup (configures your API keys)
hermes setup

# Start the WebAPI server on port 8642
hermes webapi
# Or manually: uvicorn webapi.app:app --host 0.0.0.0 --port 8642
```

> **Using upstream hermes-agent?** The workspace will still load — it auto-detects which API endpoints your gateway supports and gracefully disables features that aren't available. You'll see a log message listing which APIs are missing. For full functionality (chat, sessions, skills, memory), use our fork.

> **API keys:** Hermes supports Anthropic (Claude), OpenAI, OpenRouter, and local models via Ollama. Run `hermes setup` to configure your provider, or set `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in `~/.hermes/.env`.

### Step 2: Install & Run Hermes Workspace (frontend)

```bash
# In a new terminal
git clone https://github.com/outsourc-e/hermes-workspace.git
cd hermes-workspace
pnpm install
cp .env.example .env
printf '\nHERMES_API_URL=http://127.0.0.1:8642\n' >> .env
pnpm dev                   # Starts on http://localhost:3000
```

> **Verify:** Open `http://localhost:3000` — you should see the chat interface. If you get connection errors, make sure Hermes Agent is running on port 8642 (`curl http://localhost:8642/health` should return `{"status": "ok"}`).

### Environment Variables

```env
# Anthropic key for Hermes Agent (optional for demo mode, required for chat)
ANTHROPIC_API_KEY=your-key-here

# Hermes FastAPI backend URL
HERMES_API_URL=http://127.0.0.1:8642

# Optional: password-protect the web UI
# HERMES_PASSWORD=your_password
```

---

## 🐳 Docker Quickstart

[![Open in GitHub Codespaces](https://img.shields.io/badge/GitHub%20Codespaces-Open-181717?logo=github)](https://github.com/codespaces/new?hide_repo_select=true&ref=main&repo=outsourc-e/hermes-workspace)

### Prerequisites

- **Docker**
- **Docker Compose**

```bash
git clone https://github.com/outsourc-e/hermes-workspace.git
cd hermes-workspace
cp .env.example .env   # Edit with your API key
docker compose up
```

Open `http://localhost:3000`.

> **Supports any provider:** Anthropic, OpenAI, OpenRouter, or local models via Ollama (no key needed). Just set the right env var in `.env` — see `.env.example` for options.

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
[gateway] Missing Hermes APIs detected. Update Hermes: cd hermes-agent && git pull && pip install -e . && hermes gateway
```

**Fix:** You need the WebAPI backend. Use our fork:
```bash
git clone https://github.com/outsourc-e/hermes-agent.git
cd hermes-agent && pip install -e . && hermes webapi
```

### "Connection refused" or workspace hangs on load

Your Hermes gateway isn't running. Start it:
```bash
cd hermes-agent
source .venv/bin/activate
hermes webapi
```

Verify: `curl http://localhost:8642/health` should return `{"status": "ok"}`.

### "Using upstream NousResearch/hermes-agent"

The upstream hermes-agent doesn't include the WebAPI server yet. The workspace will load but with limited functionality. For full features, switch to our fork (`outsourc-e/hermes-agent`).

---

## 🗺️ Roadmap

| Feature | Status |
|---------|--------|
| Chat + SSE Streaming | ✅ Shipped |
| Files + Terminal | ✅ Shipped |
| Memory Browser | ✅ Shipped |
| Skills Browser | ✅ Shipped |
| Mobile PWA + Tailscale | ✅ Shipped |
| 8-Theme System | ✅ Shipped |
| Native Desktop App (Electron) | 🔨 In Development |
| Model Switching & Config | 🔨 In Development |
| Chat Abort / Cancel | 🔨 In Development |
| Cloud / Hosted Version | 🔜 Coming Soon |
| Team Collaboration | 🔜 Coming Soon |

---

## ⭐ Star History
## Star History

<a href="https://www.star-history.com/?repos=outsourc-e%2Fhermes-workspace&type=date&legend=top-left">
 <picture>
---

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
