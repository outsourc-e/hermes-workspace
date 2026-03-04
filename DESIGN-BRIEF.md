# ClawSuite Agent Hub — Design Brief for ChatGPT

## Context
We're redesigning the **Agent Hub** screen in ClawSuite, an open-source AI agent orchestration dashboard that connects to OpenClaw Gateway. The Agent Hub is one screen within the larger ClawSuite app (which also has a Dashboard, Chat, Files, Settings, etc.).

The Agent Hub lets users manage teams of AI agents, launch multi-agent missions, and monitor their work. Think of it like a "war room" for your AI workforce.

**Tech stack:** React + TypeScript + Tailwind CSS, dark theme primary (slate-900/neutral-800), accent color is orange-500.

**Target users:** Power users running multiple AI agents (developers, ops teams, creators managing AI workflows).

---

## Current Architecture: What We Have

### Main Tabs (top navigation pills)
1. **Overview** — Hero pixel-art office view + 3 info cards (Active Team, Recent Missions, Usage)
2. **Missions** — Mission history list with reports, completion stats, transcript viewer
3. **Board** — 6-column Kanban (Backlog, Todo, In Progress, Blocked, Done, Cancelled)
4. **Analytics** — Cost dashboard with per-agent/model/daily breakdowns (CSS bar charts)
5. **Configure** — Sub-tabs: Agents | Teams | Keys

### Overview Tab (current)
- **Pixel Office Hero** (full-width, 420px tall) — animated pixel-art agents walking around an office. Agents glow when active, idle when not. Shows mission name when running.
- **3 Info Cards below:**
  - Active Team: agent list with model badges, status dots
  - Recent Missions: last 3 completed/failed, duration
  - Usage Snapshot: session count, total tokens, cost today
- **Quick action buttons:** "New Mission", "Manage Teams"

### Missions Tab
- List of completed mission reports with: name, goal, team, token count, cost, duration
- Click to expand: full transcript, agent breakdown, artifacts
- Export as Markdown button
- Status badges (Done, Failed, Cancelled)

### Board Tab (Kanban)
- 6 columns: Backlog | Todo | In Progress | Blocked | Done | Cancelled
- Drag-and-drop task cards between columns
- Task cards show: title, assignee, priority badge, timestamps
- Filter/sort capabilities

### Analytics Tab
- 6 summary metric cards (Total Missions, Total Tokens, Total Cost, Avg/Mission, Today, This Week)
- 3 CSS bar charts: Cost by Agent, Cost by Model, Daily Cost (7d)
- All computed from stored mission reports

### Configure Tab
**Sub-tab: Agents**
- Card grid of all agents with: avatar, name, model badge, role, system prompt preview
- Click to edit via Agent Wizard Modal (Name, Model dropdown, Role, Memory Path, Skill Allowlist, System Prompt with template picker)
- Add Agent button

**Sub-tab: Teams**
- Saved team configurations (e.g. "Research Team", "Code Review Team")
- Each team = a preset of agents with specific roles
- Add/edit/delete teams, assign team icons

**Sub-tab: Keys**
- API provider management (OpenAI, Anthropic, Google, etc.)
- Add provider wizard with key input
- Edit/delete providers, verify connection

### Overlay Components (modals/slide-overs)
- **Mission Wizard** — Multi-step: set goal → pick team → configure → launch
- **Agent Chat Panel** — Slide-over from right, full conversation with any agent. Smart mode: steer when running, direct message when idle. Auto-polls for new messages.
- **Steer Agent Modal** — Quick directive input to a running agent
- **Agent Output Panel** — Right sidebar showing live terminal-style output from selected agent
- **Mission Detail Overlay** — Full-screen mission view with agent status, progress, live output, export button
- **Approval Cards** — Inline exec approval requests with Approve/Deny buttons
- **Completion Report** — Auto-generated mission summary with stats
- **Template Picker** — Workflow template browser for saved mission configs

### Other Features Built
- **Streaming Text** — Typewriter animation for live agent output
- **Collaboration Presence** — BroadcastChannel-based multi-tab presence (hidden when solo)
- **Workflow Templates** — Save/load reusable mission configurations
- **Token Trend Charts** — Usage tracking over time
- **Agent Avatars** — Procedurally generated pixel avatars per agent
- **Auto-complete Detection** — Detects when agents finish and auto-generates reports
- **Auto-retry System** — Failed agents can be automatically retried
- **BeforeUnload Guard** — Warns before closing tab with active mission

---

## What Competitors Have (Gaps We Need to Fill)

### OpenClaw Studio (robsannaa/openclaw-mission-control)
A comprehensive GUI for OpenClaw. Key features we're missing:
- **System Health on Dashboard** — Gateway status, CPU/mem/disk, active session count
- **Cron Job Management** — Full CRUD for scheduled tasks with run history
- **Built-in Terminal** — Multi-tab terminal right in the dashboard (xterm.js)
- **Channel Configuration** — Set up Telegram/Discord/WhatsApp/Signal/Slack connections
- **Doctor/Diagnostics** — Health checks with one-click fixes
- **File Browser** — Workspace file explorer with Cmd+K semantic search
- **Agent Org Chart** — Interactive hierarchy view of agent relationships
- **Vector Search** — Semantic search across agent memory

### Mission Control (crshdn/mission-control)
Focused on task orchestration:
- **7-Stage Pipeline** — Planning → Inbox → Assigned → In Progress → Testing → Review → Verification → Done (we have 6 columns but simpler)
- **AI Planning Phase** — Interactive Q&A where AI asks clarifying questions before executing
- **4-Agent Core Team Bootstrap** — Auto-creates Builder, Tester, Reviewer, Learner on new workspace
- **Agent Discovery** — One-click import existing agents from OpenClaw Gateway
- **Knowledge Loop** — Learner agent captures outcomes and injects lessons into future tasks
- **WebSocket Live Feed** — Real-time event stream (not polling)
- **Webhook System** — Agent completion webhooks with HMAC verification

---

## Design Request

### What We Need
1. **Redesigned Overview tab** that incorporates the pixel office (smaller, ~280px) alongside mission-focused data
2. **Polished navigation** that's intuitive for new users — they should immediately know where everything is
3. **Visual hierarchy** that emphasizes: what's running NOW → team readiness → quick actions → recent history
4. **Suggestions for gap-filling** — which competitor features would improve our hub the most, and where they'd fit in the tab structure

### Design Constraints
- Dark theme primary (slate-900 backgrounds, neutral-700 borders, white/neutral-100 text)
- Accent: orange-500 (#f97316) for CTAs, violet-500 for agent actions, emerald-500 for success, sky-500 for info
- Responsive: works from 1024px wide to ultrawide
- Component library: Tailwind CSS utility classes, no external UI framework
- The pixel office view is a React component that renders an HTML5 canvas with animated agents — it can be any size
- All data comes from OpenClaw Gateway API (REST + SSE)

### Specific Questions
1. How should the Overview tab be laid out? (Office + mission status + team roster + quick actions)
2. Should we add new tabs (Cron, Terminal, Sessions) or keep it tight with 5 tabs?
3. How should empty states look for new users with no agents configured?
4. Where should the Chat with Agent panel live — keep as slide-over or give it its own tab/section?
5. What's the best way to show "mission in progress" without it being a separate full-screen overlay?

### Deliverable
Please provide:
- A detailed layout mockup (ASCII art or descriptive wireframe) for each tab
- Color/spacing recommendations
- Navigation structure recommendation
- Prioritized list of which competitor features to add first
- Any UX patterns that would make onboarding smoother

The goal is to make this feel like a polished product, not a developer tool. Think Linear meets Vercel dashboard — clean, fast, information-dense but not overwhelming.
