# Codex Task: Runs / Console Screen (v4 Screen 10)

## Overview
Build the Runs / Console screen — a cross-project view of all active and recent agent runs with live output. This is the "ops dashboard" where you monitor what agents are doing right now.

## Target (from v4 spec)

### Layout
New route: /runs (add to src/routes/runs.tsx)

1. **Header**: "Runs / Console" title + filters
2. **Active Runs** (top section):
   - Cards for each currently running task_run
   - Each card shows: agent name, task name, project name, elapsed time, progress
   - Terminal output area (from run_events)
   - Pause/Stop buttons
3. **Recent Runs** (bottom section):
   - Table/list of completed/failed task_runs
   - Columns: task name, project, agent, status, duration, tokens, cost, timestamp
   - Click to expand and see the run log
4. **Filters**:
   - By project (dropdown)
   - By agent (dropdown)  
   - By status (running/completed/failed)
   - Time range (last hour/today/all)

## Data Sources
- Task runs: daemon already has GET /api/task-runs (from createTasksRouter)
- Run events: daemon has run_events table with per-task-run logs
- Agents: GET /api/agents
- Projects: GET /api/projects

## What to Build

### 1. New API proxy routes
- src/routes/api/workspace/task-runs.ts — proxy GET to daemon /api/task-runs
- src/routes/api/workspace/task-runs.$id.events.ts — proxy GET to daemon /api/task-runs/:id/events (may need to add this daemon route)

### 2. Daemon enhancement
Check workspace-daemon/src/routes/tasks.ts — if task-runs listing doesn't exist yet, add:
- GET /api/task-runs — list all task_runs with JOINed task/mission/project/agent names
- GET /api/task-runs/:id/events — list run_events for a specific task_run

### 3. New screen: src/screens/runs/runs-console-screen.tsx
- Active runs section with terminal-style output cards
- Recent runs table with expandable details
- Filters (project, agent, status)
- Auto-refresh every 5s for active runs

### 4. Route: src/routes/runs.tsx
- Standard ClawSuite route file
- Same loading pattern as projects.tsx and review.tsx

### 5. Sidebar entry
Check if /runs is already in the sidebar navigation. If not, note where to add it (but don't modify the sidebar — that's a separate task).

## Implementation Notes
- Use @tanstack/react-query for data fetching
- Terminal output: monospace font, dark bg, auto-scroll
- Keep the file under 800 lines
- Match existing design system
- The run_events data includes type (started/output/completed/failed) and data with message text

## After ALL changes:
1. npx tsc --noEmit — fix errors
2. Commit: "feat: runs/console screen with active and recent task runs"
3. Run: openclaw system event --text "Done: Runs/Console screen with active and recent task runs" --mode now
