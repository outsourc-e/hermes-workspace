# Agent Hub V2 — Feature Spec
_Closing gaps vs Studio/Mission Control + community requests_

---

## Tier 1: Quick Wins (1-2 hours each)

### F-001: Office Customization
**What:** Let users personalize the pixel office view
- Company/team name on the whiteboard (editable via Configure tab)
- Custom agent avatars (upload or pick from presets)
- Desk glow states already exist (running=green, approval=amber, failed=red)
- Monitor screens show agent's current task title
**Where:** `office-view.tsx` + new field in Configure > General
**Effort:** Small

### F-002: Calendar View
**What:** Visual calendar showing scheduled jobs, reminders, and mission runs
- Monthly/weekly/daily toggle
- Cron jobs rendered as recurring events
- Completed missions shown as past events with status color
- Click event → deep-link to cron job or run history
- Data source: existing `fetchCronJobs()` + mission history from store
**Where:** New screen `src/screens/gateway/components/calendar-view.tsx`, add as tab or sidebar item
**Effort:** Small-Medium

### F-003: Agenda / Daily Briefing
**What:** "Today" view showing what's happening and what needs attention
- Active missions (running, needs input)
- Tasks due today (from task store)
- Upcoming cron jobs (next 24h)
- Recent completions / failures
- Agent availability (who's idle, who's busy)
**Where:** Can replace or augment the Overview tab in Agent Hub
**Effort:** Small

### F-004: Real AI Planning
**What:** Swap mock plan generation with actual LLM call
- When user clicks "Generate Plan" in wizard, send goal + answers to an agent session
- Agent returns structured task breakdown (JSON)
- Parse into plan checklist (same UI, real data)
- Use cheapest available model (local or minimax)
**Where:** `agent-hub-layout.tsx` wizard Step 1, call `sendToSession` with planning prompt
**Effort:** Small

---

## Tier 2: Medium Features (half day each)

### F-005: Live Task Status from SSE
**What:** Agent output auto-updates board task status
- SSE events already flow into the feed — classify "task completed" / "task started" events
- When agent mentions completing a task → move it on the board
- Pattern matching on agent output: "completed", "done", "finished", "implemented"
- Also detect file writes as artifact creation
**Where:** `agent-hub-layout.tsx` SSE handler → task store `updateTaskStatus`
**Effort:** Medium

### F-006: Auto-Populated Artifacts
**What:** Automatically collect files/outputs during a run
- Monitor agent tool calls for file writes (`write`, `edit`, `exec` with file output)
- Extract from session history on mission complete
- Show in Artifacts tab with file preview, diff view, copy
- Also capture git commits if agent pushes
**Where:** `run-console.tsx` Artifacts tab + extraction logic in hub layout
**Effort:** Medium

### F-007: Auto-Generated Reports
**What:** When mission completes, generate a summary report via LLM
- Collect all agent outputs + task statuses
- Send to a cheap model: "Summarize this mission run..."
- Parse into: summary, key findings, per-agent breakdown
- Store in mission history (persists across reloads)
**Where:** Mission completion handler → `sendToSession` for report gen → store in mission-store
**Effort:** Medium

### F-008: Generic API Provider ("Add Any AI Service")
**What:** Expand provider wizard to support arbitrary API endpoints
- Current wizard knows specific providers (OpenAI, Anthropic, Ollama, etc.)
- Add "Custom API" option: base URL + API key + model name
- Support non-chat APIs: image gen (DALL-E/Kling), audio (Whisper), video
- Each custom provider gets a card in settings with test button
**Where:** `config-wizards.tsx` AgentWizardModal + gateway config
**Effort:** Medium

---

## Tier 3: Bigger Features (1-2 days each)

### F-009: Node-Based Workflow Editor
**What:** Visual drag-and-drop pipeline builder (like n8n / Freepik Space)
- Nodes: Agent, Tool, Condition, Loop, Output
- Edges: data flow between nodes
- Pre-built templates (Code Review Pipeline, Research → Write → Review)
- Saves as workflow JSON, can be executed as a mission
- Library: react-flow or xyflow
**Where:** New screen, new store
**Effort:** Large — roadmap item, not immediate

### F-010: Task Dependencies
**What:** Task B can't start until Task A completes
- Add `dependsOn: string[]` to task type
- Board shows dependency arrows between cards
- Dispatch respects ordering — blocked tasks stay in Backlog
- Visual indicator: lock icon on blocked tasks
**Where:** `task-store.ts` + `kanban-board.tsx`
**Effort:** Medium-Large

---

## Comparison Matrix (After V2)

| Feature | Studio | Mission Control | ClawSuite (current) | ClawSuite (after V2) |
|---------|--------|----------------|---------------------|---------------------|
| Mission wizard | ✅ | ✅ | ✅ | ✅ |
| AI planning | ✅ | ✅ | 🟡 Mock | ✅ F-004 |
| Multi-agent exec | ✅ | ✅ | ✅ | ✅ |
| Live stream | ✅ | ✅ | ✅ | ✅ |
| Agent lanes | ✅ | ✅ | ✅ | ✅ |
| Stop/Kill/Steer | ✅ | ✅ | ✅ | ✅ |
| Approvals | ✅ | ✅ | ✅ | ✅ |
| Kanban board | ✅ | ✅ | ✅ | ✅ |
| Live task updates | ✅ | ✅ | ❌ | ✅ F-005 |
| Task dependencies | ✅ | ❌ | ❌ | ✅ F-010 |
| Auto artifacts | ✅ | ✅ | ❌ | ✅ F-006 |
| Auto reports | ✅ | ✅ | ❌ | ✅ F-007 |
| Run comparison | ✅ | ❌ | ✅ | ✅ |
| Learnings/knowledge | ✅ | ❌ | 🟡 | ✅ |
| Calendar | ❌ | ❌ | ❌ | ✅ F-002 |
| Agenda/briefing | ❌ | ❌ | ❌ | ✅ F-003 |
| Office customization | ❌ | ❌ | ❌ | ✅ F-001 |
| Custom AI providers | 🟡 | ✅ | 🟡 | ✅ F-008 |
| Visual workflows | ❌ | ❌ | ❌ | 🟡 F-009 (roadmap) |
| Templates | ✅ | ✅ | ✅ | ✅ |
| Agent discovery | ✅ | ✅ | ✅ | ✅ |

**After V2, ClawSuite would be the only one with Calendar + Agenda + Office customization + Run comparison — features neither Studio nor Mission Control has.**

---

## Build Order (recommended)
1. F-001 Office customization (crowd pleaser, visible)
2. F-003 Agenda / daily briefing (immediate value)
3. F-004 Real AI planning (biggest functional gap)
4. F-005 Live task status from SSE (makes board actually useful)
5. F-002 Calendar view (community request)
6. F-007 Auto reports (mission completion polish)
7. F-006 Auto artifacts (nice to have)
8. F-008 Generic API provider (EmadAi request)
9. F-010 Task dependencies (board maturity)
10. F-009 Node workflows (big, save for later)
