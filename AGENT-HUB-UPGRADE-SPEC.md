# ClawSuite Agent Hub Upgrade Spec
_Written: 2026-03-04 | Competitive research from 10 open-source OpenClaw dashboards_

## Executive Summary
ClawSuite has the deepest feature set of any OpenClaw dashboard (terminal, browser, file explorer, chat, metrics). But we're missing two things everyone's building toward: **token/cost visibility** and **task orchestration**. This spec closes those gaps and steals the best ideas from the competition.

---

## Phase 1: Token Usage Dashboard (Issue #40)
_Priority: HIGH — most requested feature, 20-30% cost reduction reported_

### What to Build
A new "Usage" page/panel with four sections:

#### 1A. Token Trend Chart (Recharts)
- 5-day rolling usage, broken down by model (stacked area chart)
- X-axis: date, Y-axis: tokens (input + output)
- Color-coded per model (Claude = purple, GPT = green, local = gray)
- Toggle between tokens and estimated cost ($)
- Data source: OpenClaw gateway `usage-analytics` API (we already have the endpoint)

#### 1B. Context File Browser
- Tree view of workspace files (MEMORY.md, memory/*, SOUL.md, AGENTS.md, etc.)
- Per-file: size in bytes, estimated tokens (bytes ÷ 4 rough estimate, or tiktoken)
- Click to expand folders, see individual files
- Highlight files over threshold (e.g. >5K tokens = yellow, >20K = red)
- Total context load on session boot = sum of all injected files
- Data source: new API endpoint that reads workspace files + calculates sizes

#### 1C. Per-Session Breakdown
- Table: session key, model, input tokens, output tokens, cost, duration, status
- Sortable by cost, tokens, duration
- Filter: last 24h / 3d / 7d / 30d
- Highlight cron jobs vs interactive vs sub-agent sessions
- Data source: gateway session list + session status

#### 1D. Cron Job Cost Tracker
- List of all cron jobs with: name, schedule, avg tokens per run, total cost (period)
- Sparkline showing cost trend per job
- "Optimize" button that suggests cheaper models or reduced frequency
- Data source: gateway cron API + run history

### API Endpoints Needed
- `GET /api/usage-analytics` — already exists, extend with per-model breakdown
- `GET /api/context-files` — NEW: list workspace files with token estimates
- `GET /api/cron-usage` — NEW: aggregate cron job usage from run history

### UI Components
- `src/components/usage-dashboard/` — new directory
  - `usage-trend-chart.tsx` — Recharts stacked area
  - `context-file-browser.tsx` — tree view with token counts
  - `session-usage-table.tsx` — sortable session breakdown
  - `cron-cost-tracker.tsx` — cron job cost list

---

## Phase 2: Task Orchestration (Kanban)
_Priority: MEDIUM — differentiator, Mission Control's main feature_

### What to Build
A Kanban-style task board integrated with the Agent Hub.

#### Columns
- **Inbox** → **Planned** → **In Progress** → **Review** → **Done**

#### Task Properties
- Title, description, priority (P0-P3)
- Assigned agent (or unassigned)
- Linked session key (auto-linked when agent starts)
- Status auto-updates from gateway events (agent starts → In Progress, completes → Review)
- Comments/notes thread

#### AI Planning Flow (stolen from Mission Control)
- When creating a task, optional "Plan with AI" button
- Sends task description to a planning agent that asks clarifying questions
- Generates: acceptance criteria, suggested approach, estimated complexity
- Then spawns a specialized agent with the refined task

#### Storage
- SQLite (like Mission Control) or flat JSON file
- Tasks persist across gateway restarts
- No external DB dependency

### UI Components
- `src/components/task-board/` — new directory
  - `kanban-board.tsx` — drag-and-drop columns
  - `task-card.tsx` — individual task card
  - `task-detail-modal.tsx` — full task view with comments
  - `ai-planning-flow.tsx` — planning agent interaction

---

## Phase 3: Agent Hub Polish
_Priority: MEDIUM — UX improvements stolen from Studio + others_

### 3A. In-Chat Exec Approvals (from Studio)
- Replace modal with inline chat cards: [Allow Once] [Always Allow] [Deny]
- Show command preview in the card
- Auto-dismiss on timeout

### 3B. Agent Creation Wizard (from Clawd Control + Studio)
- One-step modal: name + avatar + model selection
- Post-create: auto-open capabilities sidebar
- Capability toggles: Commands (Off/Ask/Auto), Web (Off/On), Files (Off/On)

### 3C. Remote Gateway Support (from Studio)
- WebSocket proxy pattern for remote gateway connection
- Settings: Upstream URL + Token fields
- Tailscale-friendly (wss:// support)
- Auto-reconnect with backoff

### 3D. Soul/Memory Editor (from VidClaw)
- In-app editor for SOUL.md, AGENTS.md, USER.md, IDENTITY.md
- Version history (git-backed diff view)
- Token count shown per file
- Live preview of changes

---

## Phase 4: Advanced Features
_Priority: LOW — future differentiators_

### 4A. Multi-Machine Support (from AI Maestro)
- Connect to multiple gateways from one ClawSuite instance
- Unified agent view across machines
- Agent-to-agent messaging visibility

### 4B. Widget Dashboard (from LobsterBoard)
- Customizable dashboard with draggable widgets
- Widget library: system metrics, usage charts, session monitor, cron status
- Save/load layouts

### 4C. Quality Gates (from Mission Control)
- Task completion requires review sign-off
- Automated checks: tests pass, no regressions, code review

---

## Implementation Order

| Sprint | What | Effort | Impact |
|--------|------|--------|--------|
| **Now** | Bug fixes #37 + #39 | 1 day | Unblocks users |
| **Week 1** | Token trend chart + session breakdown (1A + 1C) | 3 days | Highest user demand |
| **Week 2** | Context file browser + cron tracker (1B + 1D) | 2 days | Completes usage story |
| **Week 3** | In-chat approvals + agent wizard (3A + 3B) | 3 days | UX polish |
| **Week 4** | Kanban task board MVP (2) | 4 days | Differentiator |
| **Week 5** | Remote gateway + soul editor (3C + 3D) | 3 days | Power users |
| **Later** | Multi-machine, widgets, quality gates (4) | Ongoing | Moat |

---

## Competitive Position After Upgrades

| Feature | ClawSuite | Mission Control | Studio | LobsterBoard |
|---------|-----------|----------------|--------|--------------|
| Token/Cost Dashboard | ✅ Full | ❌ | ❌ | ⚠️ Widget only |
| Task Board | ✅ Kanban | ✅ Kanban | ❌ | ❌ |
| Chat + Streaming | ✅ Full | ⚠️ Basic | ✅ Full | ❌ |
| Terminal | ✅ | ❌ | ❌ | ❌ |
| Browser | ✅ | ❌ | ❌ | ❌ |
| File Explorer | ✅ | ❌ | ⚠️ Agent files | ❌ |
| Remote Gateway | ✅ | ✅ | ✅ | ❌ |
| Agent Creation | ✅ Wizard | ✅ AI Planning | ✅ Modal | ❌ |
| Exec Approvals | ✅ In-chat | ❌ | ✅ In-chat | ❌ |
| Custom Layout | ❌ | ❌ | ❌ | ✅ |
| Multi-Machine | ❌ (Phase 4) | ✅ | ❌ | ❌ |

**After Phase 3, ClawSuite would be the most complete OpenClaw dashboard by a significant margin.**
