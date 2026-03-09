# Codex Task: Plan Review Screen

## Overview
After the decompose dialog generates a task plan, show a full Plan Review screen before launching. This replaces the simple "review plan → launch" in the decompose dialog with a rich screen.

## Reference
See `/Users/aurora/.openclaw/workspace/orchestrator-mockup/v4.html` → `#s-planreview` for exact layout.

## Route
`/plan-review` with state passed via URL params or React Router state: `{ goal, project_id, mission_id, tasks[] }`

## Trigger
In `decompose-dialog.tsx`: after AI decompose succeeds and user clicks "Launch Mission", instead of immediately dispatching, navigate to `/plan-review` with the plan data.

## Layout
Two-column layout:
- **Left** (flex 1): task list with dependency display
- **Right** (260px): stats sidebar

## Left Column

### Header
- Mission name (derived from goal text, truncated to 60 chars)
- Subtitle: "AI generated N tasks with dependencies. Review and edit before launching."

### Warning Banners (yellow/amber)
- If any task description mentions auth/security/payments → show risk warning badge
- If any task has dependencies → show dependency chain info

### Task List
Each task card shows:
- Task number circle (1, 2, 3...)
- Task name
- Dependencies: "← Task N, N" (or "No dependencies" if none)
- Badges: assigned agent type (Codex/Claude/etc), estimated time (~Xmin), risk tag if relevant

Task cards with high-risk keywords (auth/security/jwt/payment/db migration) get a red left border + red number circle.

### Inline Edit
- Clicking a task name makes it editable (contentEditable or input on click)
- Allow reordering (drag handle on left side, or up/down arrows)

## Right Column — Stats Sidebar

### Stats Grid (2x2)
- Tasks: count
- Est. Time: sum of estimated minutes
- Est. Cost: "$0.00" (free Codex)
- Agents: count of unique agent types

### Execution Waves Section
Calculate waves from dependencies (topological sort):
- Wave 1: tasks with no deps
- Wave 2: tasks whose deps are all in Wave 1
- etc.
Show each wave: "Wave N · T1, T2 · ~Xm ∥" (∥ = parallel)

### Agents Summary
List unique agent types + task count each

### Checks Section
- ✅ tsc after each task
- ✅ tests after final task
- ⚪ lint (off)
- ⚪ e2e (off)

### Action Buttons
- ✏️ Edit (focus first task name)
- 🔄 Re-plan (go back to decompose dialog)
- 🚀 Launch (call POST /api/workspace/missions/:id/start or navigate to runs with mission started)

## Data Flow
1. Receive plan from decompose dialog (tasks array with: id, name, description, depends_on, agent_type)
2. Calculate execution waves client-side (simple topological sort utility in workspace-utils.ts)
3. On Launch: call existing `POST /api/workspace/missions/:id/dispatch` or equivalent to start the mission
4. Navigate to `/runs` after launch

## File Locations
- `src/screens/plan-review/plan-review-screen.tsx` (new)
- Update `decompose-dialog.tsx` to navigate to plan-review instead of launching directly
- Add `/plan-review` route to router
- Add `calculateExecutionWaves(tasks)` utility to `src/screens/projects/lib/workspace-utils.ts`

## Design System
- Risk task cards: `border-l-2 border-red-500` 
- Risk badges: red background
- Wave display: accent-colored wave labels
- Same card/border system as all workspace screens

## Validation
1. `npx tsc --noEmit` in root
2. Commit: `feat: plan review screen`
3. Run: `openclaw system event --text "Plan Review screen done" --mode now`
