# Workspace Audit Results

## Scope

Audited Workspace M1-M3 surfaces and their backing routes:

- `src/screens/projects/projects-screen.tsx`
- `src/screens/projects/project-detail-view.tsx`
- `src/screens/projects/checkpoint-detail-modal.tsx`
- `src/screens/projects/checkpoint-detail-modal-parts.tsx`
- `src/screens/projects/dashboard-kpi-bar.tsx`
- `src/screens/projects/dashboard-project-cards.tsx`
- `src/screens/projects/dashboard-review-inbox.tsx`
- `src/screens/projects/dashboard-agent-capacity.tsx`
- `src/screens/projects/create-project-dialog.tsx`
- `src/screens/projects/decompose-dialog.tsx`
- `src/screens/review/review-queue-screen.tsx`
- `src/screens/runs/runs-console-screen.tsx`
- `src/lib/workspace-checkpoints.ts`
- `src/screens/projects/lib/workspace-types.ts`
- `src/screens/projects/lib/workspace-utils.ts`
- `src/routes/api/workspace/*`
- `src/routes/api/workspace-tasks*`
- `workspace-daemon/src/routes/*`
- `workspace-daemon/src/tracker.ts`

## Fixed

### 1. Project detail showed unrelated checkpoints

- File: `src/screens/projects/projects-screen.tsx`
- Bug: when a project had zero matching checkpoints, the detail panel fell back to showing all workspace checkpoints.
- Fix: removed the fallback so project detail now shows only checkpoints for the selected project, or an empty state if none exist.

### 2. Opening checkpoint review could briefly bind to the wrong project

- File: `src/screens/projects/projects-screen.tsx`
- Bug: selecting a checkpoint from another project opened modal state before the correct project detail finished loading.
- Fix: delay modal selection until the target project is focused.

### 3. Task dependency display was unreadable

- File: `src/screens/projects/project-detail-view.tsx`
- Bug: tasks displayed raw dependency IDs instead of task names.
- Fix: added an ID-to-name lookup and render readable dependency names in the task tree.

### 4. Review Queue was missing required project triage and checkpoint detail access

- File: `src/screens/review/review-queue-screen.tsx`
- Bugs:
  - no project filter
  - no path into the checkpoint detail modal
  - quick approve used plain `approve` instead of the workspace default `approve-and-commit`
- Fixes:
  - added project filter chips
  - added `Review` action that opens `CheckpointDetailModal`
  - loaded matching project detail for the modal
  - switched quick approve to `approve-and-commit`

### 5. Workspace stats showed placeholder daily cost

- File: `src/routes/api/workspace/stats.ts`
- Bug: `Cost Today` was hardcoded to `0`.
- Fix: fetch task runs and sum same-day `cost_cents` into real USD cost.

### 6. Task creation route missed basic validation

- File: `workspace-daemon/src/routes/tasks.ts`
- Bugs:
  - accepted unknown `mission_id`
  - accepted malformed `depends_on`
  - did not normalize incoming task text
- Fixes:
  - 404 for missing mission
  - 400 for invalid `depends_on`
  - trim `name` and `description` before create

## Findings Not Fixed

### 1. Verification filters are still heuristic, not true verification state

- Files: `src/screens/projects/dashboard-review-inbox.tsx`, `src/screens/projects/lib/workspace-utils.ts`
- Current behavior still treats checkpoint metadata as a proxy for “verified”.
- Proper fix likely requires persisted verification results from the daemon, not just checkpoint list metadata.

### 2. Agent Capacity remains status-derived, not workload-derived

- Files: `src/screens/projects/dashboard-agent-capacity.tsx`, `src/screens/projects/lib/workspace-utils.ts`
- Bars still reflect coarse agent status rather than true concurrent assignment/utilization.
- This needs product direction on what utilization should mean in this workspace model.

### 3. Policy alerts are still placeholder data

- File: `src/routes/api/workspace/stats.ts`
- `policyAlerts` remains `0` because there is no current daemon source of truth for policy incidents.

## Validation

Passed:

- `npx tsc --noEmit`
- `cd workspace-daemon && npx tsc --noEmit`
