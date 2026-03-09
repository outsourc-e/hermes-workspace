# Codex Task: Mission Launcher + LLM Task Decomposition UI

## Overview
Build the "Mission Launcher" flow — the user types a goal/PRD, hits Decompose, sees the generated task tree with dependencies, then launches a mission. This maps to v4 Screens 1 (launcher) and 9 (plan review).

## What Already Exists
- `workspace-daemon/src/decomposer.ts` — fully implemented LLM decomposer (calls `claude --print`, parses JSON task arrays)
- `workspace-daemon/src/routes/decompose.ts` — POST /api/decompose endpoint accepting { goal, project_id?, mission_id? }
- Returns: { tasks: [{name, description, estimated_minutes, depends_on, suggested_agent_type}], raw_response? }
- If mission_id is provided, tasks are auto-created in that mission

## What to Build

### 1. Frontend API Proxy
Create `src/routes/api/workspace/decompose.ts` — proxy POST to daemon /api/decompose
Same pattern as other workspace proxy routes (auth check, rate limit, forward request)

### 2. Decompose Dialog/Modal in Project Detail
In `src/screens/projects/projects-screen.tsx`, add a "Decompose Goal" button next to the "Add Mission" button in the project detail phase view.

When clicked, show a modal/dialog:
- **Step 1: Input**
  - Large textarea: "Describe what you want to build..."
  - Show project name + path for context
  - "Decompose" button (primary accent)
  - Loading state while LLM runs (can take 15-30s)

- **Step 2: Review Task Plan** (after decompose returns)
  - Show generated tasks in a list:
    - Task name (editable inline)
    - Description (expandable)
    - Estimated time badge
    - Suggested agent type badge (Codex/Claude/Ollama)
    - Dependencies shown as arrows or "depends on: Task 1, Task 2"
  - Execution plan summary: "X tasks, ~Y minutes estimated, Z waves"
  - Options:
    - "Launch Mission" — creates a new mission in the selected phase, adds all tasks, starts the mission
    - "Save as Draft" — creates mission + tasks but doesn't start
    - "Re-decompose" — goes back to step 1 with the goal text preserved
    - "Cancel" — closes dialog

### 3. Launch Flow
When user clicks "Launch Mission":
1. POST to create a new mission in the selected phase (existing endpoint)
2. POST tasks to the new mission (POST /api/workspace-tasks for each task, or use the decompose endpoint with mission_id)
3. POST to start the mission (existing /api/workspace/missions/:id/start)
4. Close dialog, refresh project detail

### Implementation Notes
- Use the existing Dialog component from `@/components/ui/dialog`
- The decompose call can be slow (15-30s) — show a good loading state (shimmer + "AI is analyzing your goal...")
- Keep it in the same projects-screen.tsx file or extract into a new component file if cleaner
- Wire with @tanstack/react-query useMutation for the decompose call
- The textarea should support pasting markdown/PRDs (monospace hint text)

## Files to Read
1. workspace-daemon/src/decomposer.ts — understand the decompose response shape
2. workspace-daemon/src/routes/decompose.ts — the endpoint
3. src/screens/projects/projects-screen.tsx — where to add the button + dialog
4. src/routes/api/workspace/missions.ts — existing mission creation proxy
5. src/routes/api/workspace-tasks.ts — existing task creation proxy

## After ALL changes:
1. npx tsc --noEmit in workspace-daemon/ — fix errors
2. npx tsc --noEmit in root — fix errors
3. Commit: "feat: mission launcher with LLM task decomposition UI"
4. Run: openclaw system event --text "Done: Mission launcher with LLM decompose UI" --mode now
