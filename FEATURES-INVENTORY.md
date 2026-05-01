# Claude Workspace — Comprehensive Features Inventory

> **Version:** 2.0.0 | **Stack:** React 19 + TanStack Start/Router + Vite 7 + Tailwind CSS 4 + Zustand + xterm.js + Monaco Editor  
> **Description:** Desktop workspace for Claude Agent — chat, orchestration, and multi-agent coding pipelines

---

## Table of Contents

1. [Frontend Screens & Features](#1-frontend-screens--features)
2. [Backend API Endpoints](#2-backend-api-endpoints)
3. [UI Components Library](#3-ui-components-library)
4. [Configuration & Settings](#4-configuration--settings)
5. [Server-Side Architecture](#5-server-side-architecture)
6. [Integrations & Provider Support](#6-integrations--provider-support)
7. [UX Features & Interactions](#7-ux-features--interactions)
8. [Security Features](#8-security-features)
9. [Mobile & PWA Features](#9-mobile--pwa-features)
10. [Deployment Options](#10-deployment-options)

---

## 1. Frontend Screens & Features

### 1.1 Chat Screen (`/chat`, `/chat/$sessionKey`)

- **Real-time SSE streaming** with tool call rendering
- **Multi-session management** — create, rename, delete, fork sessions
- **Dual chat backend modes:**
  - **Enhanced Claude** — full session API with persistent history via Claude gateway
  - **Portable** — OpenAI-compatible `/v1/chat/completions` (works with Ollama, LM Studio, vLLM, etc.)
- **Chat sidebar** — session list with search, pin, rename, delete dialogs
- **Message rendering:**
  - Markdown with GFM support (`react-markdown` + `remark-gfm` + `remark-breaks`)
  - Syntax highlighting via Shiki
  - Tool call pill rendering with expandable details
  - Thinking/reasoning content display
  - Message timestamps
  - Message actions bar (copy, etc.)
- **Chat composer** — multi-line input with:
  - Slash command menu (`/new`, `/clear`, `/model`, `/save`, `/skills`, `/skin`, `/help`)
  - File attachment support (images via base64, multimodal content)
  - Voice input (Web Speech API)
  - Context meter showing token usage percentage
- **Session management features:**
  - Auto-generated session titles
  - Session forking
  - Session search across history
  - Pinned sessions
  - Session tombstones for deleted session cleanup
- **Inspector panel** — sidebar showing session activity, memory, and skills
- **Research card** — embedded research display
- **Connection status messaging** — real-time gateway connectivity indicators
- **Scroll-to-bottom button** for long conversations
- **Chat empty state** — onboarding content when no messages exist
- **Provider selection dialog** — model/provider chooser inline in chat
- **Smooth streaming text** — progressive text reveal for streaming responses
- **Context alert system** — warnings when approaching token limits

### 1.2 Dashboard Screen (`/dashboard`)

- Overview dashboard for workspace metrics
- Dashboard overflow panel for expanded views

### 1.3 Files Screen (`/files`)

- **Full workspace file browser** with directory tree navigation
- **File preview dialog** — inline file viewing
- **Monaco Editor integration** — full code editing
- **File operations:** create, read, write, rename, delete, mkdir
- **File upload** — multipart form upload support
- **Image preview** — base64 rendering for image files
- **Glob pattern support** — filter files by pattern
- **Path traversal prevention** — sandboxed to workspace root
- **Ignored directories:** `node_modules`, `.git`, `.next`, `.turbo`, `.cache`, `__pycache__`, `.venv`, `dist`
- **Max depth/entries limits** — configurable tree depth (default 3), max 20K entries

### 1.4 Terminal Screen (`/terminal`)

- **Full PTY terminal** via Python pty-helper
- **xterm.js** with addons: fit, search, web-links
- **256-color support** (TERM=xterm-256color, COLORTERM=truecolor)
- **Persistent shell sessions** — create, input, resize, close
- **SSE-based terminal streaming** — real-time output
- **Keepalive pings** every 8 seconds
- **Terminal workspace** component with debug panel
- **Mobile terminal input** — adapted for touch devices
- **Platform-aware default shell:** zsh (macOS), bash (Linux), PowerShell (Windows)

### 1.5 Memory Browser Screen (`/memory`)

- **Browse agent memory files** in `~/.claude/` (MEMORY.md, memory/, memories/)
- **Search across memory entries** — text search with line-level results (max 200 matches)
- **Markdown preview** with live editing via MemoryEditor
- **Memory file list** — sorted with MEMORY.md first, daily files by date
- **Memory components:** MemoryFileList, MemorySearch, MemoryEditor, MemoryPreview

### 1.6 Skills Browser Screen (`/skills`)

- **Browse 2,000+ skills** from the Claude skill registry
- **Tabbed view:** Installed, Marketplace, Featured
- **Skill categories:** All, Web & Frontend, Coding Agents, Git & GitHub, DevOps & Cloud, Browser & Automation, Image & Video, Search & Research, AI & LLMs, Productivity, Marketing & Sales, Communication, Data & Analytics, Finance & Crypto
- **Search and filter** — by name, description, author, tags, triggers
- **Sort options:** by name, by category
- **Featured skills** curation with groups (Most Popular, New This Week, Developer Tools, Productivity)
- **Security risk display** — safe/low/medium/high levels with flags and scores
- **Workspace skills screen** — per-session skill management

### 1.7 Jobs Screen (`/jobs`)

- **Scheduled job management** — cron-style agent automation
- **Create job dialog** — schedule, prompt, name, delivery, skills, repeat config
- **Edit job dialog** — modify existing jobs
- **Job operations:** create, update, delete, pause, resume, trigger
- **Job output viewer** — view execution results
- **Job state tracking** — enabled/disabled, next/last run, success status

### 1.8 Settings Screens (`/settings`, `/settings/providers`)

- **Settings dialog** — centralized configuration panel
- **Providers screen** — manage AI provider connections
- **Provider wizard** — guided setup for new providers

---

## 2. Backend API Endpoints

### 2.1 Chat & Messaging

| Endpoint             | Method | Description                                                                      |
| -------------------- | ------ | -------------------------------------------------------------------------------- |
| `/api/send-stream`   | POST   | Main streaming chat endpoint — routes to enhanced Claude or portable OpenAI mode |
| `/api/send`          | POST   | Non-streaming chat send                                                          |
| `/api/sessions/send` | POST   | Session-specific send                                                            |
| `/api/chat-events`   | GET    | SSE chat event stream                                                            |
| `/api/events`        | GET    | Global SSE event bus (keepalive, real-time updates)                              |
| `/api/history`       | GET    | Chat history retrieval                                                           |

### 2.2 Sessions

| Endpoint                               | Method | Description                           |
| -------------------------------------- | ------ | ------------------------------------- |
| `/api/sessions`                        | GET    | List all sessions (paginated, max 50) |
| `/api/sessions`                        | POST   | Create new session                    |
| `/api/sessions`                        | PATCH  | Update session (rename)               |
| `/api/sessions`                        | DELETE | Delete session                        |
| `/api/sessions/$sessionKey/status`     | GET    | Session status                        |
| `/api/sessions/$sessionKey/active-run` | GET    | Active run for session                |
| `/api/session-status`                  | GET    | Session connection status             |

### 2.3 Files

| Endpoint                     | Method | Description                                 |
| ---------------------------- | ------ | ------------------------------------------- |
| `/api/files?action=list`     | GET    | List directory tree with depth/entry limits |
| `/api/files?action=read`     | GET    | Read file content (text or base64 image)    |
| `/api/files?action=download` | GET    | Download file with Content-Disposition      |
| `/api/files`                 | POST   | Write/upload/mkdir/rename/delete files      |
| `/api/paths`                 | GET    | Path resolution and workspace info          |

### 2.4 Memory

| Endpoint             | Method | Description                      |
| -------------------- | ------ | -------------------------------- |
| `/api/memory`        | GET    | Get memory from Claude gateway   |
| `/api/memory/list`   | GET    | List local memory markdown files |
| `/api/memory/read`   | GET    | Read specific memory file        |
| `/api/memory/search` | GET    | Search across memory files       |
| `/api/memory/write`  | POST   | Write/update memory file         |

### 2.5 Skills

| Endpoint      | Method | Description                               |
| ------------- | ------ | ----------------------------------------- |
| `/api/skills` | GET    | List skills (paginated, filtered, sorted) |
| `/api/skills` | POST   | Skill installation (currently disabled)   |

### 2.6 Models & Config

| Endpoint             | Method | Description                                  |
| -------------------- | ------ | -------------------------------------------- |
| `/api/models`        | GET    | List available models (gateway + auth store) |
| `/api/claude-config` | GET    | Read Claude config.yaml and .env             |
| `/api/claude-config` | PATCH  | Update config.yaml and .env                  |
| `/api/context-usage` | GET    | Token/context usage for a session            |

### 2.7 Jobs

| Endpoint                  | Method                | Description                                    |
| ------------------------- | --------------------- | ---------------------------------------------- |
| `/api/claude-jobs`        | GET                   | List all jobs                                  |
| `/api/claude-jobs`        | POST                  | Create new job                                 |
| `/api/claude-jobs/$jobId` | GET/POST/PATCH/DELETE | Job CRUD and actions (pause/resume/run/output) |

### 2.8 Terminal

| Endpoint               | Method | Description                              |
| ---------------------- | ------ | ---------------------------------------- |
| `/api/terminal-stream` | POST   | Create PTY session and stream SSE output |
| `/api/terminal-input`  | POST   | Send input to terminal session           |
| `/api/terminal-resize` | POST   | Resize terminal dimensions               |
| `/api/terminal-close`  | POST   | Close terminal session                   |

### 2.9 Auth & Infrastructure

| Endpoint                 | Method | Description                                   |
| ------------------------ | ------ | --------------------------------------------- |
| `/api/auth`              | POST   | Password authentication (rate-limited: 5/min) |
| `/api/auth-check`        | GET    | Check authentication status                   |
| `/api/ping`              | GET    | Server ping/health                            |
| `/api/connection-status` | GET    | Gateway connection status with capabilities   |
| `/api/gateway-status`    | GET    | Detailed gateway capabilities                 |
| `/api/start-agent`       | POST   | Auto-start Claude agent process               |
| `/api/start-claude`      | POST   | Start Claude gateway                          |
| `/api/workspace`         | GET    | Workspace auto-detection                      |

### 2.10 OAuth

| Endpoint                 | Method | Description                     |
| ------------------------ | ------ | ------------------------------- |
| `/api/oauth/device-code` | POST   | Device code flow (Nous Portal)  |
| `/api/oauth/poll-token`  | POST   | Poll for OAuth token completion |

---

## 3. UI Components Library

### 3.1 Core UI Primitives (`src/components/ui/`)

- **alert-dialog** — confirmation dialogs
- **autocomplete** — filterable autocomplete input
- **braille-spinner** — loading indicator with braille animation
- **button** — button variants (class-variance-authority)
- **collapsible** — expandable/collapsible sections
- **command** — command palette UI (cmdk-style)
- **dialog** — modal dialogs
- **input** — text input fields
- **menu** — dropdown menus
- **preview-card** — content preview cards
- **scroll-area** — custom scrollable areas
- **switch** — toggle switches
- **tabs** — tabbed interfaces
- **three-dots-spinner** — loading animation
- **toast** — notification toasts
- **tooltip** — hover tooltips

### 3.2 Prompt Kit (`src/components/prompt-kit/`)

- **chat-container** — main chat layout wrapper
- **message** — individual message rendering
- **markdown** — rich markdown rendering
- **code-block** — syntax-highlighted code with copy
- **prompt-input** — chat input component
- **tool** — tool call display
- **tool-indicator** — tool execution status
- **thinking** — thinking/reasoning block
- **thinking-indicator** — animated thinking state
- **typing-indicator** — typing animation
- **text-shimmer** — text loading shimmer effect
- **scroll-button** — scroll-to-bottom control

### 3.3 Feature Components

- **workspace-shell** — main app layout shell
- **chat-panel** — persistent side chat panel
- **chat-panel-toggle** — show/hide chat panel
- **command-palette** — global `⌘K` command palette
- **slash-command-menu** — `/` command autocomplete in chat
- **attachment-button** — file attachment trigger
- **attachment-preview** — attached file preview
- **export-menu** — export chat as Markdown/JSON/Text
- **context-meter** — token usage visualization
- **mode-selector** — preset mode selection
- **save-mode-dialog** / **apply-mode-dialog** / **rename-mode-dialog** / **manage-modes-modal** — full mode management UI
- **model-suggestion-toast** — smart model recommendations
- **keyboard-shortcuts-modal** — keyboard shortcut reference
- **global-shortcut-listener** — system-wide keyboard shortcuts
- **terminal-shortcut-listener** — terminal-specific shortcuts
- **connection-overlay** — full-screen connection status
- **connection-startup-screen** — initial loading/connection screen
- **backend-unavailable-state** — offline fallback UI
- **claude-health-banner** — gateway health indicator
- **claude-reconnect-banner** — reconnection prompt
- **error-boundary** — React error boundary
- **error-toast** — error notification
- **loading-indicator** — generic loading state
- **logo-loader** — branded loading animation
- **status-indicator** — colored status dots
- **empty-state** — empty content placeholder
- **theme-toggle** — light/dark theme switcher

### 3.4 Navigation & Layout

- **mobile-tab-bar** — bottom navigation for mobile
- **mobile-hamburger-menu** — hamburger menu for mobile
- **mobile-sessions-panel** — mobile session browser
- **mobile-page-header** — mobile header bar
- **mobile-prompt** — MobileSetupModal, MobilePromptTrigger

### 3.5 Specialized Components

- **memory-viewer/** — MemoryFileList, MemorySearch, MemoryEditor, MemoryPreview
- **file-explorer/** — file-explorer-sidebar, file-preview-dialog
- **terminal/** — terminal-panel, terminal-workspace, debug-panel, mobile-terminal-input
- **inspector/** — inspector-panel, activity-store
- **usage-meter/** — usage-meter, usage-meter-compact, usage-details-modal, context-alert-modal
- **search/** — search-modal, search-input, search-results, search-result-item, quick-actions
- **settings-dialog/** — settings-dialog
- **onboarding/** — claude-onboarding, onboarding-wizard, onboarding-tour, tour-steps, setup-step-content, provider-select-step
- **agent-chat/** — AgentChatModal, AgentChatHeader, AgentChatInput, AgentChatMessages
- **avatars/** — user-avatar, assistant-avatar
- **auth/** — login-screen

### 3.6 Provider & Model Components

- **provider-logo** — provider brand logos
- **provider-model-icon** — model-specific icons
- **agent-avatar** — AI agent avatar
- **agent-card** — agent info card

---

## 4. Configuration & Settings

### 4.1 User Settings (persisted via Zustand + localStorage)

| Setting                   | Type                            | Default  | Description                 |
| ------------------------- | ------------------------------- | -------- | --------------------------- |
| `claudeUrl`               | string                          | `''`     | Claude API URL              |
| `claudeToken`             | string                          | `''`     | Bearer token                |
| `theme`                   | `system\|light\|dark`           | `system` | Color mode                  |
| `accentColor`             | `orange\|purple\|blue\|green`   | `blue`   | Accent color                |
| `editorFontSize`          | number                          | `13`     | Monaco editor font size     |
| `editorWordWrap`          | boolean                         | `true`   | Editor word wrap            |
| `editorMinimap`           | boolean                         | `false`  | Editor minimap              |
| `notificationsEnabled`    | boolean                         | `true`   | Sound/notifications         |
| `usageThreshold`          | number                          | `80`     | Context usage warning %     |
| `smartSuggestionsEnabled` | boolean                         | `false`  | Smart model suggestions     |
| `preferredBudgetModel`    | string                          | `''`     | Preferred cheap model       |
| `preferredPremiumModel`   | string                          | `''`     | Preferred premium model     |
| `onlySuggestCheaper`      | boolean                         | `false`  | Only suggest cheaper models |
| `showSystemMetricsFooter` | boolean                         | `false`  | System metrics display      |
| `mobileChatNavMode`       | `dock\|integrated\|scroll-hide` | `dock`   | Mobile nav behavior         |

### 4.2 Theme System — 8 Themes

| Theme                 | Description                     | Mode  |
| --------------------- | ------------------------------- | ----- |
| Claude Official       | Navy and indigo flagship        | Dark  |
| Claude Official Light | Soft indigo light palette       | Light |
| Claude Classic        | Bronze accents on dark charcoal | Dark  |
| Classic Light         | Warm parchment with bronze      | Light |
| Slate                 | Cool blue developer theme       | Dark  |
| Slate Light           | GitHub-light with blue accents  | Light |
| Mono                  | Clean monochrome grayscale      | Dark  |
| Mono Light            | Bright monochrome grayscale     | Light |

### 4.3 Workspace State (Zustand, persisted)

- Sidebar collapsed/expanded
- File explorer collapsed/expanded
- Chat focus mode
- Active sub-page route
- Chat panel open/closed + session key
- Mobile keyboard state

### 4.4 Modes System

- **Custom presets** — save/load named configurations
- Each mode stores: name, preferred model, smart suggestions toggle, budget/premium model prefs
- Drift detection — alerts when settings diverge from applied mode

### 4.5 Environment Variables

| Variable               | Description                                        |
| ---------------------- | -------------------------------------------------- |
| `CLAUDE_API_URL`       | Backend API URL (default: `http://127.0.0.1:8642`) |
| `CLAUDE_PASSWORD`      | Optional password protection for web UI            |
| `CLAUDE_WORKSPACE_DIR` | Workspace root directory (default: `~/.claude`)    |
| `CLAUDE_AGENT_PATH`    | Path to claude-agent directory                     |
| `CLAUDE_DEFAULT_MODEL` | Default model override                             |
| `CLAUDE_ALLOWED_HOSTS` | Allowed hosts (default: `.ts.net`)                 |
| `ANTHROPIC_API_KEY`    | Anthropic API key passthrough (optional)           |
| `OPENAI_API_KEY`       | OpenAI API key passthrough (optional)              |
| `OPENROUTER_API_KEY`   | OpenRouter API key passthrough (optional)          |
| `GOOGLE_API_KEY`       | Google Gemini API key passthrough (optional)       |
| `CLAUDE_API_TOKEN`     | Auth token for gateway API_SERVER_KEY              |
| `BEARER_TOKEN`         | Bearer token for backend auth                      |
| `PORT`                 | Server port (default: 3002 dev, 3000 prod)         |

### 4.6 Claude Config Management

- **Read/write `~/.claude/config.yaml`** — YAML config via web UI
- **Read/write `~/.claude/.env`** — environment variables
- **Provider status** with masked API keys
- **Auth store integration** — reads from `~/.claude/auth-profiles.json` and `~/.openclaw/agents/main/agent/auth-profiles.json`

---

## 5. Server-Side Architecture

### 5.1 Gateway Capability Probing

- **Two-tier capability model:**
  - **Core:** health, chatCompletions, models, streaming
  - **Enhanced:** sessions, skills, memory, config, jobs
- **Three chat modes:**
  - `enhanced-claude` — full Claude session API
  - `portable` — OpenAI-compatible /v1/chat/completions
  - `disconnected` — no usable backend
- **Auto-detection** with port fallback (8642 → 8643)
- **Probe TTL** — 30 second cache, periodic refresh
- **Feature gates** — graceful degradation per capability

### 5.2 Chat Event Bus

- Server-side event bus for real-time updates
- SSE broadcasting to all connected clients
- Chat events: chunk, done, error, thinking, tool calls

### 5.3 Run Store (Persistence)

- Persisted run state at `~/.claude/webui-mvp/runs/`
- Run lifecycle: accepted → active → handoff → stalled → complete → error
- Tool call tracking with phase management
- Lifecycle event logging (max 40 per run)
- Run timeout: 15 minutes

### 5.4 Terminal Sessions

- Python PTY helper (`pty-helper.py`) — real PTY without native node-pty addon
- Session management: create, input, resize (SIGWINCH), close (SIGTERM → SIGKILL)
- Event emitter pattern with early buffer for pre-listener output

### 5.5 Memory Browser (Server)

- Filesystem-based memory browsing in `~/.claude/`
- File filters: MEMORY.md, memory/_, memories/_
- Markdown-only restriction
- Path traversal prevention
- Sort: MEMORY.md first, daily files by date descending, then by modification time

### 5.6 OpenAI-Compatible API Client

- Streaming parser for `/v1/chat/completions` SSE
- Support for reasoning/thinking content (DeepSeek, QwQ, etc.)
- Automatic default model detection from `/v1/models`
- Multimodal support (image_url content parts)

### 5.7 Claude Agent Auto-Start

- Auto-detects sibling `claude-agent/` directory
- Resolves Python virtualenv (`.venv`, `venv`, system `python3`)
- Spawns uvicorn with health polling (15 attempts, 1s interval)
- Reads `~/.claude/.env` for agent configuration

### 5.8 Workspace Daemon (Optional)

- Separate workspace daemon process on port 3099
- Auto-restart with exponential backoff (max 20 retries)
- Provides workspace-level APIs (checkpoints, agents, etc.)

---

## 6. Integrations & Provider Support

### 6.1 AI Providers (Provider Catalog)

| Provider   | Auth Types         | Description                         |
| ---------- | ------------------ | ----------------------------------- |
| Anthropic  | API Key, CLI Token | Claude models — Haiku, Sonnet, Opus |
| OpenAI     | API Key            | GPT and reasoning models            |
| Google     | API Key, OAuth     | Gemini models                       |
| OpenRouter | API Key            | Unified multi-provider access       |
| MiniMax    | API Key            | Foundation models                   |
| Ollama     | Local (no auth)    | Local models                        |
| Custom     | API Key            | Any OpenAI-compatible server        |

### 6.2 Known Gateway Providers (Claude Config)

- Nous Portal (OAuth device code flow)
- OpenAI Codex (OAuth)
- Anthropic (API key)
- OpenRouter (API key)
- Z.AI / GLM (API key)
- Kimi / Moonshot (API key)
- MiniMax / MiniMax CN (API key)
- Ollama (local, no auth)
- Custom OpenAI-compatible

### 6.3 Well-Known Models

- **Anthropic:** Claude Sonnet 4, Claude Opus 4
- **OpenAI:** GPT-4o
- **xAI:** Grok 3
- **Context window database:** Claude 4 (1M), Claude 3.x (200K), GPT-4o (128K), Gemini 2.x (1M), Qwen (32K–131K), Llama 3 (8K–128K), Mistral (32K–128K), DeepSeek (64K–128K)

### 6.4 OAuth Integration

- **Device code flow** for Nous Portal
- Token polling mechanism
- Auth profile storage in `~/.claude/auth-profiles.json`

### 6.5 Workspace Agents

- Multi-agent directory with capabilities tracking
- Agent properties: model, provider, status (online/away/offline), avatar, system prompt
- Agent capabilities: repo write, shell commands, git operations, browser, network
- Agent stats: runs/tokens/cost today, success rate, avg response time

### 6.6 Workspace Checkpoints

- Code review checkpoint system
- Review actions: approve, approve-and-commit, approve-and-pr, approve-and-merge, reject, revise
- Diff viewing with file-level additions/deletions
- Verification checks: TypeScript (tsc), tests, lint, e2e
- Run event timeline

---

## 7. UX Features & Interactions

### 7.1 Sound Notification System

Web Audio API synthesized sounds (no audio files):

- **Agent Spawned** — ascending C5→E5 chime
- **Agent Complete** — satisfying G5 ding
- **Agent Failed** — low C3→A2 error tone
- **Chat Notification** — soft E5 ping
- **Chat Complete** — gentle E5→C5 descend
- **Alert** — attention-grab A4→E5→A4
- **Thinking** — subtle C6 tick
- Configurable volume (0–1) and enable/disable

### 7.2 Keyboard Shortcuts

- **⌘K** — Command palette
- **Global shortcuts** via `global-shortcut-listener`
- **Terminal shortcuts** via `terminal-shortcut-listener`
- **Session shortcuts** — navigate between sessions
- **Keyboard shortcuts modal** — discoverable reference

### 7.3 Voice Input

- Web Speech API integration
- Languages: configurable (default: en-US)
- States: idle, listening, processing, error
- Interim (partial) results support
- Toggle on/off

### 7.4 Haptic Feedback

- `navigator.vibrate(8)` for mobile tap feedback

### 7.5 Search

- **Global search modal** with quick actions
- **Search input** with keyboard navigation
- **Search results** with highlighted matches
- **Session search** across all chat history

### 7.6 Onboarding

- **Onboarding wizard** — first-run setup flow
- **Onboarding tour** — interactive guided tour (react-joyride)
- **Setup steps** — provider selection, connection verification
- **Tour steps** — feature highlights

### 7.7 Export

- Export conversations as Markdown, JSON, or Plain Text

### 7.8 Auto-Generated Session Titles

- Automatic title generation from conversation content

### 7.9 Pinned Sessions & Models

- Pin frequently used sessions for quick access
- Pin preferred models

### 7.10 Smart Model Suggestions

- Automatic model recommendations based on task
- Budget vs premium model preferences
- Model suggestion toast notifications

---

## 8. Security Features

### 8.1 Authentication

- Optional password protection via `CLAUDE_PASSWORD` env var
- Timing-safe password comparison
- Cryptographic session tokens (32 bytes hex)
- HTTP-only, SameSite=Strict cookies (30-day expiry)
- Rate-limited login: 5 attempts/minute per IP
- 1-second delay on failed auth (brute force prevention)

### 8.2 Authorization

- Auth middleware on all API routes
- Local request detection (127.0.0.1, ::1, Tailscale 100.x, LAN 192.168.x, 10.x)
- `requireLocalOrAuth` for sensitive operations (file delete, terminal)

### 8.3 Input Validation

- CSRF protection via `Content-Type: application/json` requirement
- Path traversal prevention on file and memory routes
- Zod schema validation on auth endpoints
- Input sanitization on all user inputs

### 8.4 Rate Limiting

- Sliding window rate limiter (in-memory, no external deps)
- Per-endpoint limits: auth (5/min), files (30/min), terminal (10/min)
- Auto-cleanup every 5 minutes
- 429 Too Many Requests responses

### 8.5 Error Handling

- Safe error messages in production (hides internals)
- Error boundaries in React
- Graceful degradation on gateway unavailability

---

## 9. Mobile & PWA Features

### 9.1 Progressive Web App

- Full PWA with install prompts
- iOS Safari "Add to Home Screen" support
- Android Chrome install support
- Desktop Chrome/Edge install support

### 9.2 Mobile-Specific Components

- Mobile tab bar (bottom navigation)
- Mobile hamburger menu
- Mobile sessions panel
- Mobile page header
- Mobile terminal input
- Mobile setup modal & prompt trigger
- Mobile keyboard handling & inset tracking
- Swipe navigation

### 9.3 Mobile Chat Nav Modes

- **Dock** — iMessage-style (no nav in chat)
- **Integrated** — chat input in nav pill
- **Scroll-hide** — nav shows on scroll up

### 9.4 Tailscale Integration

- First-class support for Tailscale remote access
- Default allowed hosts include `.ts.net`
- End-to-end encrypted mobile access

---

## 10. Deployment Options

### 10.1 Local Development

```bash
pnpm dev  # Vite dev server with HMR on port 3002
```

### 10.2 Production Build

```bash
pnpm build && pnpm start  # Node.js server on port 3000
```

### 10.3 Stable Mode

```bash
pnpm start:stable  # Background process via scripts/start-stable.sh
pnpm stop:stable   # Stop via scripts/stop-stable.sh
```

### 10.4 Docker Compose

- **claude-agent** container — Python FastAPI gateway on port 8642
- **claude-workspace** container — Node.js web UI on port 3000
- Health checks with retries
- Environment file passthrough

### 10.5 Auto-Start Features

- Claude agent auto-start from sibling directory
- Workspace daemon auto-start with crash recovery
- Port fallback detection (8642 → 8643)

---

## File/Directory Statistics

| Category           | Count |
| ------------------ | ----- |
| Total source files | ~287  |
| API route files    | ~35   |
| React components   | ~100+ |
| Custom hooks       | ~25   |
| Server modules     | ~12   |
| Library utilities  | ~20   |
| Store files        | 3     |
| Screen files       | 8     |

---

## Technology Stack

| Layer         | Technology                      |
| ------------- | ------------------------------- |
| Framework     | TanStack Start (React 19 + SSR) |
| Routing       | TanStack Router (file-based)    |
| Build         | Vite 7                          |
| Styling       | Tailwind CSS 4                  |
| State         | Zustand 5 (persisted)           |
| Data Fetching | TanStack React Query 5          |
| Terminal      | xterm.js 5 + Python PTY         |
| Editor        | Monaco Editor                   |
| Markdown      | react-markdown + Shiki          |
| Charts        | Recharts 3                      |
| Animation     | Motion (Framer Motion)          |
| Validation    | Zod                             |
| Icons         | Hugeicons + Lobehub Icons       |
| Tour          | react-joyride                   |
| WebSocket     | ws library                      |
| Config        | YAML parser                     |
| Testing       | Vitest + Testing Library        |

---

_Generated from codebase analysis of `/Users/aurora/claude-workspace/`_
