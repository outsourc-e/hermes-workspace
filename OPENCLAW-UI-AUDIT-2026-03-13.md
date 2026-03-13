# OpenClaw Control UI Audit (dashboard-v2, 2026.3.12)

**Date:** 2026-03-13  
**Purpose:** Gap analysis vs ClawSuite — identify features to incorporate

---

## CHAT Section

### Chat
- **What it does:** Primary conversation interface with the AI agent. Session selector dropdown, message history with tool call visualization.
- **Key UI elements:**
  - Session dropdown selector (shows all active sessions: main, subagents, ACP sessions, cron jobs)
  - Message history with collapsible tool call outputs (▸ Tool output)
  - Refresh chat button, toggle thinking/working output, focus mode toggle
  - Token/cost metadata per message (↑18.7k ↓284 R2.6k 4% ctx)
  - Message input with attachment + mic buttons
  - "Read aloud" button per message
  - Delete message button per message
- **ClawSuite equivalent:** Chat screen
- **Gap:** 
  - Token cost preview while typing (P0 — user specifically liked this)
  - Session dropdown showing all sessions in one place (P1 — ClawSuite has separate Sessions page)
  - Inline "Read aloud" per message (P2)

---

## CONTROL Section

### Overview
- **What it does:** Dashboard landing page showing gateway status, stats, recent sessions, and alerts.
- **Key UI elements:**
  - **Gateway Access card:** WebSocket URL, Gateway Token (masked), Password field, Default Session Key, Language selector, Connect/Refresh buttons
  - **Snapshot card:** Status (OK), Uptime, Tick Interval, Last Channels Refresh
  - **Stats row:** Cost ($16.92 / 11M tokens / 222 msgs), Sessions (55), Skills (56/56), Cron (12 jobs, 10 failed)
  - **Recent Sessions list:** Shows session name, model, recency
  - **Attention section:** Skills with missing dependencies, failed cron jobs
  - **Event Log / Gateway Logs tabs** at bottom
- **ClawSuite equivalent:** Dashboard (partial)
- **Gap:** 
  - Unified stats cards showing cost/sessions/skills/cron at a glance (P1 — ClawSuite dashboard is less dense)
  - "Attention" section highlighting problems (P1)
  - Gateway connection config UI (P2 — ClawSuite connects automatically)
  - Language selector in overview (skip — ClawSuite handles differently)

### Channels
- **What it does:** Configure messaging platform connections (Telegram, Discord, etc.)
- **Key UI elements:**
  - Side-by-side cards per channel type (Telegram, Discord visible)
  - Per channel: Configured status, Running status, Mode (polling/webhook), Last start, Last probe
  - Probe status indicator
  - Expandable "Accounts" section
  - Ack Reaction config, Ack Reaction Scope
  - "Actions" expandable section
  - "Allow From" list with add/delete (whitelist user IDs)
  - Block Streaming toggle
  - Block Streaming Coalesce settings
  - Discord Presence Activity config (text, type, URL)
  - Telegram Bot Token field
- **ClawSuite equivalent:** Channels page
- **Gap:**
  - Inline channel health probe status (P1 — ClawSuite shows connected but not probe details)
  - Discord Presence Activity config (P2)
  - Block Streaming toggle/coalesce (skip — advanced feature)
  - Ack Reaction config (P2 — useful for acknowledging messages)

### Instances
- **What it does:** Shows all connected clients/nodes with presence beacons
- **Key UI elements:**
  - List of connected instances (gateway, backend agent, webchat UIs, ClawSuite dev)
  - Per instance: Name, IP, version, tags (gateway/backend/webchat/operator/scopes)
  - Platform info (darwin, MacIntel, OS version)
  - Connection status (just now, 1m ago, etc.)
  - Last input timestamp
  - Reason (self, disconnect, connect)
  - Toggle host visibility button
  - Refresh button
- **ClawSuite equivalent:** No direct equivalent
- **Gap:** 
  - Instances/Nodes view showing all connected clients (P1 — useful for multi-device setup)
  - Scope visibility per connected instance (P2)

### Sessions
- **What it does:** View and manage all active sessions with per-session config overrides
- **Key UI elements:**
  - Table with columns: Key, Label, Kind, Updated, Tokens, Thinking, Fast, Verbose, Reasoning
  - Clickable session keys (links to chat view for that session)
  - Editable label field per session
  - Token usage display (used/limit)
  - Dropdown overrides for Thinking (off/minimal/low/medium/high/xhigh), Fast, Verbose, Reasoning
  - Filter input (by key, label, kind)
  - Pagination (10/25/50/100 per page)
  - Active min filter, Limit, Global/Unknown toggles
  - Row menu (more actions)
- **ClawSuite equivalent:** Sessions page
- **Gap:**
  - Per-session config overrides (Thinking, Fast, Verbose, Reasoning) (P1 — very useful)
  - Inline label editing (P2)
  - Token usage per session in table view (P1)

### Usage
- **What it does:** Analytics dashboard for token usage, costs, and tool calls
- **Key UI elements:**
  - **Filters row:** Date picker (Today/7d/30d/custom), Local toggle, Tokens/Cost switch, Refresh, Export
  - **Summary stats:** 11.1M tokens, $16.92 cost, 29 sessions, Pin, Export
  - **Filter input:** Complex query syntax (key:, model:, has:errors, minTokens:)
  - **Filter pills:** Agent, Channel, Provider, Model, Tool
  - **Usage Overview cards:**
    - Messages (222 - 57 user, 165 assistant)
    - Tool Calls (110 - 13 tools used)
    - Errors (21 - 0 tool results)
    - Avg Tokens/Msg (49.9K across 222 messages)
    - Avg Cost/Msg ($0.0762 - $16.92 total)
    - Sessions (29 of 29 in range)
    - Throughput (37.4K tok/min - $0.0572/min)
    - Error Rate (9.46% - 21 errors, 10m 12s avg session)
    - Cache Hit Rate (98.9% - 7.9M cached, 8.0M prompt)
  - **Top lists:** Top Models, Top Providers, Top Tools, Top Agents, Top Channels
- **ClawSuite equivalent:** No direct equivalent (partial in Dashboard)
- **Gap:**
  - Full usage analytics dashboard (P0 — major feature gap)
  - Cache hit rate visibility (P1)
  - Top models/providers/tools breakdown (P1)
  - Throughput metrics (tok/min, $/min) (P2)
  - Export functionality (P1)

### Cron Jobs
- **What it does:** Manage scheduled tasks and recurring agent runs
- **Key UI elements:**
  - **Stats row:** Enabled (Yes), Jobs (12), Next wake timestamp
  - **Jobs list panel (left):**
    - Search jobs filter
    - Filters: Enabled, Schedule type (At/Every/Cron), Last run status, Sort, Direction
    - Per job card: Name, schedule (Every 1h, Cron 0 9 * * *), full Prompt text, Delivery method, Agent, Status (Error/OK), Next run, Last run
    - Actions: Edit, Clone, Disable, Run, Run if due, History, Remove
    - Tags: enabled/disabled, isolated, now
  - **New Job form (right):**
    - Name, Description, Agent ID, Enabled toggle
    - Schedule config: Every/At/Cron, interval, unit
    - Execution: Session, Wake mode
  - **Run history panel:**
    - Scope filter (All jobs, Selected job), search runs, sort
    - Status/Delivery filters
    - Per run: Job name, status, summary text, model/provider, timestamps, duration, link to open run chat
- **ClawSuite equivalent:** Cron page
- **Gap:**
  - Inline job prompt viewing (P1 — ClawSuite shows jobs but not full prompt)
  - Run history with summaries and error details (P1)
  - Clone job functionality (P2)
  - "Run if due" button (P2)
  - Schedule type selector (At/Every/Cron) (P1)

---

## AGENT Section

### Agents
- **What it does:** Configure agent workspaces, models, tools, and identities
- **Key UI elements:**
  - Agent selector dropdown (main, pc1-coder, pc1-critic, pc1-planner)
  - Tabs: Overview, Files, Tools, Skills, Channels (2), Cron Jobs (10)
  - **Overview tab:**
    - Workspace path (clickable link)
    - Primary Model display (openai-codex/gpt-5.4 +2 fallback)
    - Skills Filter (all skills)
    - Model Selection dropdown with all available models (extensive list including Anthropic, OpenAI, Ollama, LMStudio models)
    - Fallbacks config
    - Reload Config / Save buttons
- **ClawSuite equivalent:** Agents page (partial)
- **Gap:**
  - Multi-agent management in one place (P1 — ClawSuite is single-agent focused)
  - Per-agent model selection with fallbacks (P1)
  - Agent tabs for Files, Tools, Skills, Channels, Cron (P0 — comprehensive agent config)
  - Workspace path display (skip — ClawSuite handles differently)

### Skills
- **What it does:** View and manage installed skills
- **Key UI elements:**
  - "Browse Skills Store" button
  - Search skills input
  - Skills count (56 shown)
  - Collapsible categories: Workspace Skills (4), Built-in Skills (51), Extra Skills (1)
  - Per skill card: Name, description, tags (openclaw-extra, eligible), Disable button
- **ClawSuite equivalent:** Skills page
- **Gap:**
  - Skills Store browser (P1 — ClawSuite doesn't have skill marketplace)
  - Skill categorization (Workspace/Built-in/Extra) (P2)
  - Skill eligibility indicator (P2)

### Nodes
- **What it does:** Configure paired devices, exec approvals, and node bindings
- **Key UI elements:**
  - **Exec approvals section:**
    - Target: Gateway edits local approvals; node edits the selected node
    - Host dropdown (Gateway)
    - Scope tabs: Defaults, main, pc1-coder (pc1-coder), pc1-critic (pc1-critic), pc1-planner (pc1-planner)
    - Security Mode (Deny)
    - Ask Mode (On miss)
    - Ask fallback (Deny)
    - Auto-allow skill CLIs toggle
  - **Exec node binding section:**
    - Default binding (Any node) — "No nodes with system.run available"
    - Per-agent bindings (main: uses default)
- **ClawSuite equivalent:** No direct equivalent
- **Gap:**
  - Node/device pairing UI (P1 — distributed setup)
  - Exec approval policies per agent (P1)
  - Node binding config (P2)

---

## SETTINGS Section

### Config
- **What it does:** Comprehensive gateway configuration with search and categorized tabs
- **Key UI elements:**
  - Toolbar: Open, Reload, Save, Apply, Update buttons
  - Search settings input
  - Category tabs: Settings, Environment, Authentication, Updates, Meta, Logging, Diagnostics, Cli, Secrets, Acp
  - Form/Raw toggle (view config as form or JSON)
  - **Updates section:** Auto-update settings, beta check interval, stable delay/jitter, update channel (stable/beta/dev)
  - **CLI section:** Banner settings, tagline mode
  - **Diagnostics section:** Cache trace settings, OpenTelemetry config (endpoint, protocol, sample rate, service name)
  - **ACP section:** Allowed agents, backend, dispatch settings, streaming config
  - **Authentication section:** Auth cooldowns, profile order per provider, auth profiles with mode (api_key/oauth/token)
  - **Environment section:** Shell import settings, variable overrides
  - **Logging section:** Console log level, style (pretty/compact/json), file path, redaction patterns
  - **Secrets section:** Defaults, providers, resolution settings
- **ClawSuite equivalent:** Settings page (very partial)
- **Gap:**
  - Comprehensive categorized config UI (P0 — ClawSuite settings are minimal)
  - Search across all settings (P1)
  - Form + Raw JSON toggle (P2)
  - OpenTelemetry config UI (skip — advanced feature)
  - ACP settings UI (P1 — if implementing ACP)

### Communications
- **What it does:** Channel-specific messaging and audio settings
- **Key UI elements:**
  - Category tabs: Communication, Channels, Messages, Broadcast, Talk, Audio
  - **Broadcast section:**
    - Broadcast strategy (parallel/sequential)
    - Custom broadcast entries
  - **Audio section:**
    - Audio transcription settings
    - Audio transcription command (whisper-cli integration)
- **ClawSuite equivalent:** Channels page (partial)
- **Gap:**
  - Broadcast strategy config (P2)
  - Audio transcription settings (P2)
  - Talk/messaging settings (P2)

### Appearance
- **What it does:** Theme and UI customization, setup wizard
- **Key UI elements:**
  - Category tabs: Appearance, UI, Setup Wizard
  - **Theme selector:** Claw, Knot, Dash themes with visual cards
  - **Mode selector:** System, Light, Dark with visual cards
  - **Connection info:** Gateway URL, Status (Connected), Assistant name (Aurora)
  - **Setup Wizard section:** Wizard last run timestamp
- **ClawSuite equivalent:** Settings (theme only)
- **Gap:**
  - Multiple theme families (Claw/Knot/Dash) (P2)
  - Connection status display (P2)
  - Setup wizard UI (skip — ClawSuite handles setup differently)

### Automation
- **What it does:** Configure commands, hooks, cron, approvals, and plugins
- **Key UI elements:**
  - Category tabs: Automation, Commands, Hooks, Bindings, Cron, Approvals, Plugins
  - **Approvals section:**
    - Exec Approval Forwarding settings
    - Approval Agent Filter (allowlist of agent IDs)
    - Forward Exec Approvals toggle
    - Approval Forwarding Mode (session/targets/both)
    - Approval Session Filter (regex patterns)
- **ClawSuite equivalent:** No direct equivalent
- **Gap:**
  - Exec approval forwarding UI (skip — advanced feature)
  - Commands/Hooks config UI (P2)
  - Plugins management (P1 — if implementing plugin system)

### Infrastructure
- **What it does:** Gateway server, web, browser, node, and media settings
- **Key UI elements:**
  - Category tabs: Infrastructure, Gateway, Web, Browser, NodeHost, CanvasHost, Discovery, Media
  - **Gateway section:**
    - Gateway Allow x-real-ip Fallback toggle
    - Gateway Auth settings (Tailscale identity, auth mode: none/token/password/trusted-proxy)
    - Gateway Password (redacted - click reveal)
    - Gateway Auth Rate Limit settings
- **ClawSuite equivalent:** No direct equivalent
- **Gap:**
  - Gateway auth mode config (P2)
  - Browser/Canvas/Node host settings (skip — infrastructure config)
  - Rate limiting config (P2)

### AI & Agents
- **What it does:** Agent configurations, models, skills, tools, memory, session settings
- **Key UI elements:**
  - Category tabs: AI & Agents, Agents, Models, Skills, Tools, Memory, Session
  - **Agents section:**
    - Agent Defaults (shared settings)
    - Block Streaming Break (text_end/message_end)
    - Block Streaming Chunk/Coalesce settings
    - Block Streaming Default toggle
    - Bootstrap Max Chars (system prompt truncation)
    - Bootstrap Prompt Truncation Warning (off/once/always)
    - Bootstrap Total Max Chars
- **ClawSuite equivalent:** Settings (partial)
- **Gap:**
  - Agent defaults config UI (P1)
  - Block streaming settings (P2)
  - Bootstrap/system prompt config (P1)
  - Memory settings UI (P1)
  - Session defaults UI (P1)

### Debug
- **What it does:** Raw JSON snapshots of system status, health, and heartbeat data
- **Key UI elements:**
  - Refresh button
  - **Snapshots section:**
    - Status JSON (runtime version, heartbeat config)
    - Health JSON (ok status, timestamp, duration, channel statuses)
- **ClawSuite equivalent:** No direct equivalent
- **Gap:**
  - Raw status/health JSON viewer (P2 — useful for debugging)
  - Heartbeat config visibility (P2)

### Logs
- **What it does:** Live gateway log viewer with filtering
- **Key UI elements:**
  - Refresh button, Export visible button
  - Filter input (search logs)
  - Auto-follow toggle
  - Log level toggles: trace, debug, info, warn, error, fatal
  - File path display (/tmp/openclaw/openclaw-2026-03-13.log)
  - Log entries with: timestamp, level badge, source (gateway/ws), message content
- **ClawSuite equivalent:** No direct equivalent
- **Gap:**
  - Live log viewer with level filtering (P1 — very useful for debugging)
  - Export logs functionality (P2)
  - Auto-follow toggle (P2)

---

## Summary: Priority Gaps for ClawSuite

### P0 — Must Have
| Feature | OpenClaw Screen | Notes |
|---------|-----------------|-------|
| Usage analytics dashboard | Usage | Full token/cost tracking, cache hit rates, top models/tools |
| Comprehensive agent config | Agents | Per-agent tabs for Files, Tools, Skills, Channels, Cron |
| Categorized settings UI | Config | Searchable, tabbed config with Form+Raw toggle |

### P1 — High Value
| Feature | OpenClaw Screen | Notes |
|---------|-----------------|-------|
| Token cost per session | Sessions | Per-session token usage in table view |
| Per-session config overrides | Sessions | Thinking, Fast, Verbose, Reasoning dropdowns |
| Run history with details | Cron Jobs | Full prompt, summaries, error details, link to chat |
| Instances/nodes view | Instances | Connected devices with version/platform info |
| Live log viewer | Logs | Filterable, auto-follow, exportable |
| Skills store browser | Skills | Link to clawhub marketplace |
| Agent defaults config | AI & Agents | Bootstrap, streaming, session defaults |

### P2 — Nice to Have
| Feature | OpenClaw Screen | Notes |
|---------|-----------------|-------|
| Multiple themes | Appearance | Claw/Knot/Dash theme families |
| Clone job functionality | Cron Jobs | Quick duplication of cron jobs |
| Inline label editing | Sessions | Click-to-edit session labels |
| Discord presence config | Channels | Activity type, name, URL |
| Raw debug JSON | Debug | Status/health snapshots |

### Skip — Low Priority or N/A
| Feature | Reason |
|---------|--------|
| Gateway connection UI | ClawSuite connects automatically |
| OpenTelemetry config | Enterprise/infrastructure feature |
| Setup wizard | ClawSuite has different onboarding flow |
| ACP settings | Requires ACP implementation first |
| Exec approval forwarding | Advanced multi-node feature |

---

**Audit completed:** 2026-03-13 12:15 EDT  
**Screens covered:** 17 (Chat, Overview, Channels, Instances, Sessions, Usage, Cron Jobs, Agents, Skills, Nodes, Config, Communications, Appearance, Automation, Infrastructure, AI & Agents, Debug, Logs)  
**Version:** dashboard-v2, 2026.3.12
