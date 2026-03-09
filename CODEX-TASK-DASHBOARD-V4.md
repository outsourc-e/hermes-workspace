# Codex Task: Rebuild Projects Dashboard to Match v4 Mockup

## Overview
Rebuild `src/screens/projects/projects-screen.tsx` to match the v4 mockup design. The current screen works but looks nothing like the target. The v4 mockup (at `orchestrator-mockup/v4.html`) shows a polished dashboard with KPI bar, redesigned project cards, embedded review inbox, and agent capacity panel.

## Target Design (from v4.html Screen 1: Projects Dashboard)

### Layout
The page has this structure from top to bottom:
1. **Header bar** — "Projects" title + "+ New Project" button (top right)
2. **KPI bar** — 6 metric cards in a row:
   - Projects count
   - Agents Online (e.g. "6/8")
   - Running / Queued / Paused counts
   - Checkpoints Pending count
   - Policy Alerts count
   - Cost Today ($0.00)
3. **Project Cards** — 3 cards in a horizontal row, each showing:
   - Project icon + name + path + status badge (active/paused/done)
   - Current phase + mission text
   - Progress bar with percentage
   - Checkpoint count pill
   - Gate status pills (tsc ✅, tests req, PR mode, commit mode, all checks ✅)
   - Agent squad badges (colored dots: Codex, Claude, QA, etc.)
   - Action buttons (▶ Resume + View, or 📊 Report + View)
4. **Bottom section** — two panels side by side:
   - **Review Inbox** (left, wider ~65%) — filterable list of pending checkpoints with project badge, task title, scope pills (UI/API), risk level (Low/AUTH🔥), verification badge (Verified ✅/Missing ⚠️), Approve/Review buttons, time ago
   - **Agent Capacity** (right, ~35%) — per-agent utilization bars with queue depth

### Color Scheme
- Dark theme: bg ~#1a1a2e, cards ~#22223a, borders ~#2a2a4a
- Status: green for active/completed, amber for paused, badges colored per agent
- Accent: orange/amber for primary buttons

## Data Sources
All data comes from the workspace daemon at localhost:3099. Existing API proxy routes are at `src/routes/api/workspace/`:
- `GET /api/workspace/projects` — list projects with phase_count, mission_count, task_count
- `GET /api/workspace/projects/:id` — project detail with phases, missions, tasks
- `GET /api/workspace/checkpoints` — list checkpoints (supports ?status=pending filter)
- `GET /api/workspace/agents` — list registered agents
- `GET /api/workspace/missions` — list missions

For KPIs that don't have dedicated endpoints yet, compute from existing data:
- Projects count = projects.length
- Agents Online = agents with status !== 'offline'
- Running/Queued/Paused = count tasks by status across all projects
- Checkpoints Pending = checkpoints with status 'pending'
- Policy Alerts = 0 for now (placeholder)
- Cost Today = sum task_runs cost_cents for today (0 for now, placeholder)

## What to Change

### File: `src/screens/projects/projects-screen.tsx` (~1511 lines)
This is the main file to rewrite. Keep the existing functionality (CRUD, mission start, checkpoint review) but restructure the layout to match v4.

**Keep:**
- All existing API calls and mutations (useQuery for projects, checkpoints, etc.)
- Project detail view (when you click a project card, it shows phases/missions/tasks)
- Mission start/stop/resume functionality
- Checkpoint approve/revise/reject functionality
- Create project dialog

**Restructure the dashboard (list view) to have:**
1. KPI bar at top
2. Project cards in a grid (3 across on desktop)
3. Review Inbox panel below cards
4. Agent Capacity panel next to Review Inbox

### New API proxy route needed: `src/routes/api/workspace/stats.ts`
Create a stats endpoint that aggregates:
```typescript
GET /api/workspace/stats
Response: {
  projects: number
  agentsOnline: number
  agentsTotal: number
  running: number
  queued: number
  paused: number
  checkpointsPending: number
  policyAlerts: number
  costToday: number
}
```

## Implementation Notes

- Use the existing ClawSuite design system (Tailwind classes with primary-*, accent-* tokens)
- The existing `@hugeicons/core-free-icons` library is available for icons
- Use `@tanstack/react-query` for data fetching (already used)
- The workspace daemon runs on port 3099, proxied via Vite at `/api/workspace/*`
- Keep the file under 1600 lines — extract components if needed
- The project detail view (selected project) can remain as-is, just improve the list/dashboard view

## Files to Read First
1. `src/screens/projects/projects-screen.tsx` — current implementation (1511 lines)
2. `src/lib/workspace-checkpoints.ts` — checkpoint helpers
3. `src/routes/api/workspace/projects.ts` — API proxy for projects
4. `src/routes/api/workspace/checkpoints.ts` — API proxy for checkpoints
5. `orchestrator-mockup/v4.html` — the visual target (open in browser, screenshot for reference)

## Verification
After changes:
1. Run `npx tsc --noEmit` — must pass with zero errors
2. The projects dashboard should show KPI bar, project cards, review inbox, agent capacity
3. Clicking a project card should still show the detail view
4. All existing functionality (create project, start mission, approve checkpoint) must still work
