# ClawSuite Chat & Gateway Parity Upgrade Roadmap
**Created:** 2026-03-13
**Goal:** Match OpenClaw gateway dashboard-v2 chat quality + add ClawSuite-exclusive improvements, then finish workspace.

---

## Phase 1: Chat Rendering Overhaul (P0)

### 1.1 Unified Turn Rendering
**Current:** Tool calls render as separate message bubbles with gear ⚙️ avatar. Each tool result is its own "message" in the thread.
**Target:** Full agent turn renders as ONE continuous message — text → inline tool block → more text, no separate bubbles.
**Files:** `message-item.tsx`, `chat-message-list.tsx`, message store/grouping logic
**Complexity:** High — requires refactoring how SSE events are grouped into messages

### 1.2 Tool Call Deduplication
**Current:** Tool call shows TWICE — collapsed `• ⚡ 1 tool read` in assistant bubble AND expanded as separate "Tool" message below.
**Target:** Single inline collapsible tool block inside the assistant message. One representation only.
**Files:** `message-item.tsx`, `chat-message-list.tsx`

### 1.3 Specific Tool Labels
**Current:** Generic "Tool output" or "⚡ Tool output read"
**Target:** Show actual tool name + action: `browser screenshot`, `exec ls -la`, `memory_search "query"`, `Read file.tsx`
**Files:** `message-item.tsx` (tool block renderer)

### 1.4 Hide System-Injected Messages
**Current:** Memory flush prompts, heartbeat polls, and other system-injected content renders as user messages in chat.
**Target:** Filter out system messages (memory flush, heartbeat, compaction prompts) from chat display. Only show real user messages.
**Files:** `chat-message-list.tsx`, message filtering logic

### 1.5 Contextual Thinking Indicator
**Current:** "Thinking... 41s" with "Taking longer than usual..." — already looks good.
**Target:** Show contextual status when available: "Running browser screenshot...", "Searching memory...", "Reading 3 files..." instead of generic "Thinking" when tool calls are in progress.
**Files:** `message-item.tsx` or thinking bubble component
**Note:** Attempted before, was hard to pull off. Try again with current SSE event data — tool_use events may provide enough info now.

---

## Phase 2: Chat Feature Additions (P0-P1)

### 2.1 Token Counter While Typing (P0)
**Current:** No token preview while composing.
**Target:** Show estimated token count in compose bar as user types (e.g., "~26 tokens"). Appears after a threshold (e.g., 50+ chars).
**Files:** `chat-composer.tsx`

### 2.2 Token/Cost Metadata Per Message (P0)
**Current:** Partial — shows on some messages but not consistently styled.
**Target:** Every assistant message shows inline pill row: `↑18.7k ↓284 R2.6k 4% ctx · model-name`. Subtle monospace, below the message content.
**Files:** `message-item.tsx`, `message-status.tsx`

### 2.3 Focus Mode Toggle (P1)
**Current:** No focus mode.
**Target:** Button in chat header that hides sidebar, nav, context bar — pure fullscreen chat. Toggle back with same button or Escape.
**Files:** `chat-header.tsx`, `chat-screen.tsx`

### 2.4 Session Switcher Dropdown in Chat (P1)
**Current:** Must navigate to separate Sessions page to switch.
**Target:** Dropdown in chat header showing all sessions (main, subagents, ACP, cron). Click to switch without leaving chat.
**Files:** `chat-header.tsx`, `chat-sidebar.tsx`

---

## Phase 3: Gateway Feature Parity (P1)

### 3.1 Usage Analytics Dashboard Upgrade
**Current:** `usage-screen.tsx` (247 lines) — basic.
**Target:** Full analytics: date filters (Today/7d/30d/custom), token/cost toggle, summary cards (messages, tool calls, errors, avg tokens/msg, cache hit rate, throughput), top models/providers/tools breakdowns, export.
**API:** `/api/usage-analytics.ts` already exists, `/api/gateway/usage` wired.
**Files:** `usage-screen.tsx` (rewrite)

### 3.2 Sessions Config Overrides
**Current:** `sessions-screen.tsx` (196 lines) — shows list only.
**Target:** Add per-session dropdown overrides for Thinking, Fast, Verbose, Reasoning. Inline token usage display per session.
**API:** Session config override via gateway RPC.
**Files:** `sessions-screen.tsx`

### 3.3 Cron Run History
**Current:** `cron-manager-screen.tsx` (331 lines) — shows jobs, create/edit.
**Target:** Add run history tab per job: status, summary text, model/provider, timestamps, duration, link to open run's chat. Clone job button. Full prompt view.
**API:** Cron runs via gateway RPC.
**Files:** `cron-manager-screen.tsx`

### 3.4 Channels Screen Depth
**Current:** `channels-screen.tsx` (252 lines) — basic connected status.
**Target:** Per-channel probe status, streaming config toggles, ack reaction config, Discord presence activity, allow-from management.
**Files:** `channels-screen.tsx`

### 3.5 Nodes/Instances Screen Depth
**Current:** `nodes-screen.tsx` (185 lines) — thin.
**Target:** Connected clients with version/platform info, exec approval policies per agent, node binding config.
**Files:** `nodes-screen.tsx`

---

## Phase 4: Settings & Infrastructure (P1-P2)

### 4.1 Categorized Settings UI
**Current:** Flat settings page.
**Target:** Tabbed settings with categories: General, Authentication, Models, Channels, Automation, Infrastructure, AI & Agents. Search across all settings. Form + Raw JSON toggle.
**API:** `/api/config-get`, `/api/config-patch` already wired.
**Files:** New settings screen or major rewrite of existing.

### 4.2 Live Log Viewer
**Current:** No log viewer.
**Target:** New screen: filterable by level (trace/debug/info/warn/error/fatal), auto-follow toggle, search, export visible. Stream from gateway log file.
**Files:** New screen + new API route.

### 4.3 Agent Defaults Config
**Current:** Part of providers screen.
**Target:** Agent defaults UI: bootstrap prompt config, block streaming settings, memory settings, session defaults, compaction settings.
**Files:** Extend agents screen or new settings tab.

---

## Phase 5: Workspace Completion (after chat/gateway parity)

### 5.1 Mobile Workspace 404 Fix
- Debug from phone/Tailscale perspective
- Restart Vite, check for remaining hardcoded `localhost:3099` paths
- Verify proxy works end-to-end from phone

### 5.2 Workspace Polish & QA
- Full mobile QA pass after daemon fix
- Eric review of all workspace screens
- Prepare PR/push of `feat/ux-polish-v3-handshake` (153 commits)

### 5.3 Agent Hub Completion
- Remaining workspace orchestration features
- Live terminal grid visibility
- Review queue + checkpoint flow polish

---

## Build Priority Summary

| # | Task | Phase | Priority | Est. Effort |
|---|------|-------|----------|-------------|
| 1 | Unified turn rendering | 1.1 | P0 | High |
| 2 | Tool dedup + labels | 1.2-1.3 | P0 | Medium |
| 3 | Hide system messages | 1.4 | P0 | Low |
| 4 | Token counter while typing | 2.1 | P0 | Low |
| 5 | Token/cost per message | 2.2 | P0 | Low |
| 6 | Usage analytics upgrade | 3.1 | P1 | High |
| 7 | Sessions overrides | 3.2 | P1 | Medium |
| 8 | Cron run history | 3.3 | P1 | Medium |
| 9 | Contextual thinking indicator | 1.5 | P1 | Medium |
| 10 | Focus mode | 2.3 | P1 | Low |
| 11 | Session switcher in chat | 2.4 | P1 | Medium |
| 12 | Channels depth | 3.4 | P1 | Medium |
| 13 | Nodes depth | 3.5 | P1 | Medium |
| 14 | Categorized settings | 4.1 | P1 | High |
| 15 | Log viewer | 4.2 | P1 | Medium |
| 16 | Agent defaults config | 4.3 | P2 | Medium |
| 17 | Workspace mobile fix | 5.1 | P0 | Low |
| 18 | Workspace QA + push | 5.2 | P0 | Medium |
| 19 | Agent hub completion | 5.3 | P1 | High |

---

## What ClawSuite Already Has That OpenClaw Doesn't
- ✅ Workspace orchestration (projects, decompose, missions, tasks, review queue, checkpoints)
- ✅ Agent hub with live activity, kanban, run console, cost analytics
- ✅ Named agent system with role-specific prompts
- ✅ Skills marketplace browser (integrated)
- ✅ Rich dashboard with hero metrics, glance cards, widget grid
- ✅ Debug console (1092 lines)
- ✅ Thinking indicator with elapsed timer + contextual messaging
- ✅ Memory browser
- ✅ Provider wizard with verify step
- ✅ Electron desktop app with auto-start gateway

**ClawSuite's moat = Workspace + Simplified UX + Operator-focused design. Gateway parity is table stakes; workspace is the differentiator.**
