# ClawSuite — Full Product Context for Redesign

## What Is ClawSuite?
ClawSuite is an open-source web dashboard that connects to **OpenClaw Gateway** (an AI agent runtime). Think of it as the "Vercel Dashboard" but for AI agents instead of deployments. It runs locally at `localhost:5173` and talks to the gateway at `localhost:18789`.

**Tech:** React + TypeScript + TanStack Router + Tailwind CSS + Zustand stores
**Repo:** github.com/outsourc-e/clawsuite
**Stats:** 29 routes, 123 components, 93 screen files, 32 hooks, 8 stores

---

## Full Navigation (Sidebar)
The sidebar uses a ChatGPT-style layout: chat session list on top, nav items below.

| # | Route | Label | Description |
|---|-------|-------|-------------|
| 1 | `/dashboard` | Dashboard | Widget-based home with 13 widgets |
| 2 | `/chat/$sessionKey` | Chat | Full chat UI (ChatGPT-style) with SSE streaming |
| 3 | `/agents` | Agent Hub | **THE SCREEN WE'RE REDESIGNING** — mission control |
| 4 | `/browser` | Browser | Built-in browser panel (BrowserView screenshots/tabs) |
| 5 | `/terminal` | Terminal | xterm.js multi-tab terminal workspace |
| 6 | `/tasks` | Tasks | Task manager (standalone, separate from hub Board) |
| 7 | `/skills` | Skills | Skill browser/installer from ClawHub |
| 8 | `/cron` | Cron Jobs | Cron job manager with CRUD + run history |
| 9 | `/logs` | Logs | Gateway log viewer |
| 10 | `/debug` | Debug | Debug console |
| 11 | `/files` | Files | Workspace file browser |
| 12 | `/memory` | Memory | Memory browser (MEMORY.md + daily files) |
| 13 | `/costs` | Cost & Usage | Usage/cost analytics |
| 14 | `/channels` | Channels | Channel config (Telegram, Discord, etc.) |
| 15 | `/instances` | Instances | Multi-instance management |
| 16 | `/sessions` | Sessions | All gateway sessions browser |
| 17 | `/usage` | Usage | Detailed usage metrics |
| 18 | `/agents` | Agents | Agent registry |
| 19 | `/nodes` | Nodes | Connected node devices |
| 20 | `/settings` | Settings | General settings + provider API keys |
| 21 | `/connect` | Connect | Gateway connection setup |

---

## Dashboard Screen (the EXISTING dashboard, separate from Agent Hub)
Widget-based home screen with drag-to-reorder. 13 widgets:

1. **MetricsWidget** — Key numbers (sessions, tokens, cost, uptime)
2. **ServicesHealthWidget** — Gateway status, connection health, version
3. **RecentSessionsWidget** — Last active chat sessions
4. **ActivityLogWidget** — Recent events/activity feed
5. **SquadStatusWidget** — Agent squad overview
6. **ScheduledJobsWidget** — Upcoming cron jobs
7. **NotificationsWidget** — Notifications/alerts
8. **SkillsWidget** — Installed skills
9. **TasksWidget** — Active tasks
10. **UsageMeterWidget** — Token/cost meter
11. **AgentStatusWidget** — Agent health status
12. **CollapsibleWidget** — Generic collapsible container
13. **AddWidgetPopover** — Widget picker
14. **SystemMetricsFooter** — CPU/mem/disk bar at bottom

**Key point:** The Dashboard already handles system health, metrics, services, sessions, cron preview, activity log. So the Agent Hub should NOT duplicate this.

---

## Chat Screen
Full ChatGPT-style interface:
- Session sidebar with search, create, rename, delete, pin
- Message list with streaming (word-by-word SSE)
- Composer with: attachments, voice input, slash commands, model selector
- Context meter (shows context window usage)
- Message actions: copy, retry, edit, branch
- Exec approval toasts (approve/deny tool use)
- Gateway status messages inline

---

## Agent Hub — Current State (What We're Redesigning)
**Route:** `/agents`
**File:** `src/screens/gateway/agent-hub-layout.tsx` (8,704 lines)

### Current Tabs
| Tab | Contents |
|-----|----------|
| **Overview** | Pixel office hero (420px, animated agents) + 3 info cards (Active Team, Recent Missions, Usage) |
| **Missions** | History list of completed missions with reports, transcripts, artifacts |
| **Board** | 6-col Kanban: Backlog, Todo, In Progress, Blocked, Done, Cancelled |
| **Analytics** | Cost dashboard: 6 metric cards + 3 bar charts (by agent/model/day) |
| **Configure** | Sub-tabs: Agents (card grid + wizard) / Teams (presets) / Keys (API providers) |

### All Agent Hub Components (26 files)
```
agent-avatar.tsx          — Procedural pixel avatars
agent-chat-panel.tsx      — Slide-over chat with any agent
agent-hub-error-boundary  — Error boundary wrapper
agent-output-panel.tsx    — Live terminal-style agent output
agents-working-panel.tsx  — Panel showing which agents are actively working
approvals-bell.tsx        — Notification bell for pending approvals
approvals-page.tsx        — Full approvals list view
approvals-panel.tsx       — Inline approval cards
collaboration-presence.tsx — BroadcastChannel multi-tab presence
config-wizards.tsx        — Agent/Team/Provider wizard modals
cost-analytics.tsx        — Analytics dashboard component
export-mission.tsx        — Export mission as Markdown + clipboard
inline-approval-card.tsx  — Single approval request card
kanban-board.tsx          — 6-column drag-drop Kanban
live-activity-panel.tsx   — Live activity event stream
live-feed-panel.tsx       — Real-time feed panel
mission-event-log.tsx     — Mission event timeline
mission-timeline.tsx      — Visual mission progress timeline
office-view.tsx           — Pixel art office (HTML5 canvas, animated agents)
overview-tab.tsx          — Overview tab layout
presence-indicator.tsx    — User presence dots
remote-agents-panel.tsx   — Remote session cards (currently disabled)
streaming-text.tsx        — Typewriter text animation
task-board.tsx            — Task types + board logic
team-panel.tsx            — Team management panel
template-picker.tsx       — Workflow template browser
```

### Agent Hub Features Already Built
- **Mission Lifecycle:** Create → Configure → Launch → Monitor → Complete → Report
- **Multi-agent orchestration:** Assign teams, each agent gets tasks, parallel execution
- **Live SSE streaming:** `use-live-feed-chat-stream.ts` hook for real-time updates
- **Agent Chat:** Slide-over panel, smart mode (steer when running, direct msg when idle)
- **Exec Approvals:** Inline approve/deny for tool calls needing permission
- **Workflow Templates:** Save/load reusable mission configurations
- **Auto-complete detection:** Detects when agents finish, generates reports
- **Auto-retry:** Failed agents can be automatically retried
- **BeforeUnload guard:** Warns before closing with active mission
- **Mission Detail Overlay:** Full-screen view with per-agent status, live output, export
- **Token tracking:** Real-time token count during missions
- **Collaboration presence:** Multi-tab awareness via BroadcastChannel

### Agent-View Components (global, used outside hub too)
```
agent-card.tsx            — Agent info card
agent-progress.tsx        — Progress indicator
agent-registry-card.tsx   — Registry listing card
agent-stream-panel.tsx    — Live output stream
agent-view-panel.tsx      — Full agent detail view
guardrails-modal.tsx      — Safety/permission settings
kill-confirm-dialog.tsx   — Kill agent confirmation
steer-modal.tsx           — Quick directive modal
swarm-connection-overlay  — Multi-agent connection UI
```

---

## Gateway API (what data we can pull)
```typescript
// Session management
fetchSessions()           → { sessions: GatewaySession[] }
fetchSessionHistory(key)  → { messages: Message[] }
fetchSessionStatus(key)   → { status, model, tokens, etc. }
sendToSession(key, msg)   → send message to agent
steerAgent(key, msg)      → send directive to running agent
killAgentSession(key)     → terminate agent
toggleAgentPause(key)     → pause/resume agent

// Model management
fetchModels()             → { models: Model[] }
switchModel(key, model)   → change agent model
setDefaultModel(model)    → set system default

// Approvals
fetchGatewayApprovals()   → { approvals: Approval[] }
resolveGatewayApproval()  → approve/deny
```

Plus SSE event stream for real-time updates (agent activity, tool calls, completions).

---

## Other Screens That Already Exist (so Hub shouldn't duplicate)

| Screen | What It Does | Hub Overlap? |
|--------|-------------|--------------|
| **Dashboard** | System health, metrics, activity log, services, cron preview | ❌ Hub should NOT show system health |
| **Chat** | Full conversation UI with any session | ❌ Hub has slide-over chat, that's enough |
| **Terminal** | Multi-tab xterm.js | ❌ Already exists as standalone |
| **Cron** | Full CRUD cron manager | ❌ Already exists |
| **Files** | File browser | ❌ Already exists |
| **Memory** | Memory viewer/editor | ❌ Already exists |
| **Costs** | Usage analytics | ⚠️ Hub Analytics tab overlaps — consider linking instead |
| **Sessions** | All sessions browser | ❌ Already exists |
| **Channels** | Channel configuration | ❌ Already exists |
| **Tasks** | Task manager | ⚠️ Hub Board tab overlaps — should be unified |
| **Settings** | Provider keys, general config | ⚠️ Hub Configure > Keys overlaps |

---

## What Competitors Have That We DON'T (after accounting for existing screens)

Since ClawSuite already has Terminal, Cron, Files, Memory, Channels, Dashboard health — our REAL gaps are specifically in the **Agent Hub**:

### True Agent Hub Gaps
1. **Run Console** — No dedicated "watch a mission run in real-time" view with per-agent lanes, event timeline, inline controls. Our Mission Detail Overlay exists but it's a modal, not a primary view.
2. **AI Planning Phase** — Mission wizard goes goal → team → launch. Missing the "AI asks clarifying questions → generates plan → user edits plan → then launch" loop.
3. **Board wired to execution** — Kanban exists but tasks are manual. Should auto-populate from mission plans and update status from agent events.
4. **Agent discovery** — No "import agents from gateway" button. Manual config only.
5. **Team bootstrap** — No "create a recommended starter team" one-click setup.
6. **Knowledge loop** — No "lessons learned" system that feeds back into future missions.
7. **Mission comparison** — Can't diff two mission runs or see improvement over time.

### Things We Thought Were Gaps But Already Exist Elsewhere
- ✅ Terminal → `/terminal` (xterm.js, multi-tab)
- ✅ Cron management → `/cron` (full CRUD)
- ✅ File browser → `/files`
- ✅ System health → `/dashboard` (ServicesHealthWidget, SystemMetricsFooter)
- ✅ Memory editor → `/memory`
- ✅ Channel config → `/channels`
- ✅ Cost analytics → `/costs` AND hub Analytics tab
- ✅ Sessions browser → `/sessions`

---

## Design Questions for You

1. **Overview tab:** How should the pixel office + mission status + team roster fit together? The office is our unique visual identity — keep it but make it functional (clickable agents, status indicators on desks).

2. **Tab restructure:** Current: Overview | Missions | Board | Analytics | Configure. 
   Proposed rename: Overview | Runs | Tasks | Analytics | Configure.
   Should we add/remove tabs?

3. **Redundancy cleanup:** Analytics tab overlaps `/costs`, Board overlaps `/tasks`, Configure > Keys overlaps `/settings`. Should we:
   - (a) Keep hub-specific versions focused on mission context
   - (b) Link out to the standalone screens
   - (c) Embed the standalone screens inside hub tabs

4. **Run Console vs Mission Detail:** Currently, clicking a running mission opens a full-screen overlay with agent status + live output. Should this become the primary "Runs" tab content instead of an overlay?

5. **Empty state / onboarding:** New user opens Agent Hub with zero agents. What should they see? Wizard? Demo? Template gallery?

6. **The pixel office as control surface:** Instead of just decoration, make it functional:
   - Click agent → focus their live output
   - Desk lights up = in progress, flashes = needs approval
   - Mission name on a whiteboard in the office
   - "New Mission" button is a door/elevator in the office
   Is this worth the engineering investment?

---

## What We Need From You

1. **Layout mockups** (wireframes/ASCII) for each tab in the redesigned Agent Hub
2. **Navigation structure** recommendation (tabs, sub-tabs, drawers)
3. **Prioritized build order** — which changes give biggest polish impact first
4. **Redundancy resolution** — which overlapping features to keep/remove/merge
5. **Onboarding flow** for new users
6. **The office question** — keep as decoration, make interactive, or replace entirely
