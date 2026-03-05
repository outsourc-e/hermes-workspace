# Hub Beta — The Real Orchestrator
_Built by using it. If it doesn't help us ship, it doesn't go in._

---

## Philosophy
This isn't a feature museum or a demo. This is the actual tool we use to build ClawSuite.
Every feature must pass one test: **"Did this help us ship faster without sacrificing quality?"**
When it's ready, it replaces the current Agent Hub with the proven workflow wrapped in the existing polish (office view, templates, analytics, etc.)

---

## Core Pipeline

### 1. GOAL
- Single text input: "Build calendar view for ClawSuite"
- Optional: attach files, paste context, select repo/branch
- Optional: pick a team preset or let it auto-select

### 2. DECOMPOSE (AI Planner)
- Takes goal → scans repo structure → outputs file-scoped tasks
- Each task specifies: target file, what to read first, exact changes, estimated size
- Detects dependencies: which tasks must be serial, which can be parallel
- Shows task list for review before execution
- User can edit/reorder/remove tasks before launch

### 3. EXECUTE (CLI Agent Grid)
- Spawns N Codex/Claude CLI processes (real exec, not chat sessions)
- Each agent gets: system prompt (Builder/Critic/Fixer role) + task ticket
- Terminal grid shows live stdout from each agent
- Progress bar per agent (reading → writing → validating → done)
- Status: queued → running → validating → done/failed
- Controls: pause, kill, restart, steer (inject message into stdin)

### 4. QUALITY GATE (Auto-validation)
- After each agent completes:
  - Auto-run `npx tsc --noEmit`
  - If fails → auto-spawn Fixer agent on the errors
  - If passes → mark task as reviewed
- Optional: critic agent reviews diff before marking done
- Quality score: % of tasks passing tsc on first try

### 5. ASSEMBLE (Wiring)
- After all builders done, Wirer agent connects components
- Imports, prop passing, store connections
- Final tsc pass on full project
- Git commit with conventional message

### 6. DELIVER (PR)
- Auto-generates PR description from completed tasks
- Includes: what changed, files modified, quality score, agent stats
- Pushes to feature branch
- Notifies user: "PR ready for review"

---

## UI Layout

```
┌─────────────────────────────────────────────────────┐
│  Hub Beta                              [Settings ⚙] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─ Goal ──────────────────────────────────────┐    │
│  │ "Add calendar + agenda views to ClawSuite"  │    │
│  │ [Decompose →]                               │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ┌─ Pipeline ──────────────────────────────────┐    │
│  │ ● Decompose  → ● Execute → ● Quality       │    │
│  │   ✅ 7 tasks    ██░ 5/7    → ○ Assemble    │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ┌─ Agent Grid ────────────────────────────────┐    │
│  │ ┌──────────┬──────────┬──────────┐          │    │
│  │ │ Builder1 │ Builder2 │ Builder3 │          │    │
│  │ │ ✅ Done  │ ⚡ Write │ 📖 Read  │          │    │
│  │ │ 142 loc  │ app.tsx  │ store.ts │          │    │
│  │ │ 34s      │ 12s...   │ 3s...    │          │    │
│  │ ├──────────┼──────────┼──────────┤          │    │
│  │ │ Builder4 │ Wirer    │ Critic   │          │    │
│  │ │ ⏳ Queue │ ⏳ Wait  │ ⏳ Wait  │          │    │
│  │ └──────────┴──────────┴──────────┘          │    │
│  │ [+ Add Agent] [Kill All] [Logs ↓]           │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ┌─ Task Board ────────────────────────────────┐    │
│  │ Queue(2) │ Building(3) │ Review(1) │ Done(1)│    │
│  │ ░░░░░░░░ │ ████████░░░ │ ██░░░░░░░ │ ██████ │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ┌─ Quality ───────────────────────────────────┐    │
│  │ tsc: ✅ pass │ Critic: 0 issues │ Score: A  │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  [Generate PR →]                                    │
└─────────────────────────────────────────────────────┘
```

---

## What We Keep From Current Hub (wrap around beta later)
- 🏢 Office view with pixel art (people love it)
- 👥 Team configuration + presets
- 📋 Mission templates (Code Review, Feature Build, etc.)
- 💰 Cost analytics dashboard
- 📊 Run history + compare
- 📚 Learnings + snippets
- 🔔 Approval flow

## What's New in Beta (the core we're building)
- 🖥️ Real CLI terminal grid (xterm.js or similar)
- 🧠 AI decomposition (goal → file-scoped tasks)
- ⚡ Parallel CLI agent spawning (codex exec)
- ✅ Auto quality gates (tsc + critic)
- 🔌 Auto wiring (Wirer agent)
- 📝 Auto PR generation

## What Gets Replaced
- Chat-based session execution → real CLI processes
- Mock planning → real AI decomposition
- Manual board updates → auto from agent stdout parsing
- Manual quality checks → automated pipeline

---

## Build Plan

### Phase 1: Terminal Grid (Day 1)
- New route `/hub-beta`
- Goal input + decompose button (mock decomposition first)
- xterm.js grid showing N terminal panes
- Spawn `codex exec` processes, stream stdout to panes
- Kill/restart per pane
- THIS IS THE CORE — if this works, everything else is UI

### Phase 2: Decomposition (Day 1-2)
- Real AI planner: goal → file-scoped tasks
- Task list with edit/reorder/toggle
- Auto-assign tasks to agents based on role
- Launch button spawns all agents

### Phase 3: Quality Pipeline (Day 2)
- Auto tsc after each agent completes
- Fixer agent on failures
- Critic review on passes
- Quality score display

### Phase 4: Assembly + PR (Day 2-3)
- Wirer agent runs after builders
- Git operations (branch, commit, push)
- PR description generation
- Notification to user

### Phase 5: Polish + Replace (Day 3-4)
- Wrap existing hub features around beta core
- Office view, templates, analytics, history
- Replace old `/agent-hub` route
- Ship it

---

## Tech Requirements
- `xterm.js` — terminal emulator in browser (MIT license, 14KB)
- WebSocket or SSE for stdout streaming from backend
- `node-pty` or gateway exec for process spawning
- Backend route: POST /api/spawn-agent → returns websocket URL for stdout

---

## Success Criteria
- Can we use this to build the remaining ClawSuite features faster than manual orchestration?
- Does quality stay the same or improve?
- Would EmadAi or another user understand the workflow without docs?

If yes to all three → replace current Agent Hub.
