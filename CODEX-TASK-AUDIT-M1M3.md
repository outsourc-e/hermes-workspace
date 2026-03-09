# Audit Task: Workspace M1–M3 Code Review

## Goal
Thoroughly audit all Workspace screens (M1–M3) for bugs, UI issues, missing features, and improvement opportunities. Produce a written report AND fix any issues you find.

## Screens to Audit

### 1. Projects Dashboard (`src/screens/projects/projects-screen.tsx`)
- KPI bar (6 metrics) — check data loading, skeleton states, error handling
- Project cards — progress bars, gate pills, agent squad badges
- Review Inbox panel — filters, batch approve, empty states
- Agent Capacity panel — utilization bars, real vs placeholder data
- Create Project dialog
- Decompose dialog (goal → AI task plan → launch)

### 2. Project Detail View (`src/screens/projects/project-detail-view.tsx`)
- Phases / missions / tasks tree — expand/collapse, status badges, dependency display
- Spec editor — save/cancel, PATCH endpoint wiring
- Checkpoints tab — list, status, link to detail modal
- Activity feed — event timeline, relative timestamps

### 3. Review Queue (`src/screens/review/review-queue-screen.tsx`)
- Checkpoint triage inbox — status filters, project filter
- Approve / revise / reject actions
- Empty states
- Link to checkpoint detail modal

### 4. Checkpoint Detail Modal (`src/screens/projects/checkpoint-detail-modal.tsx` + `checkpoint-detail-modal-parts.tsx`)
- Header: agent/model/tokens/cost/duration stats
- Verification matrix (tsc/tests/lint/e2e) — status badges, output display
- Files changed — inline diff, collapsible per file, +/- counts
- Unblocks list
- Approve/revise/reject panel — approve-and-commit vs approve-and-pr dropdown
- Full agent log toggle

### 5. Runs/Console Screen (`src/screens/runs/runs-console-screen.tsx`)
- Active run cards — terminal output display
- Recent runs table — project/agent/status filters
- Empty states

### 6. Daemon Routes + API
- Check `workspace-daemon/src/routes/` for missing error handling, unhandled edge cases
- Check `src/routes/api/workspace/` for missing validation

## What to Look For

### Bugs
- Data not loading (missing API calls, wrong endpoints, stale queries)
- Broken TypeScript (run `npx tsc --noEmit` in root and `workspace-daemon/`)
- Null/undefined crashes (missing optional chaining)
- Race conditions in mutations
- Missing loading/error states that would crash the UI

### UI Issues
- Inconsistent spacing, border-radius, colors vs design system
- Text overflow / truncation issues
- Mobile layout problems (check sm/md breakpoints)
- Missing empty states (show something useful when list is empty)
- Missing loading skeletons (show shimmer while data loads)
- Buttons that do nothing or are missing handlers

### Feature Gaps
- Actions that are wired in UI but not implemented in daemon
- Filters/sorts that don't work
- Stats that show 0 or placeholder when they should be real
- Missing toasts/confirmations on destructive actions

## How to Work

1. Read ALL files listed above before writing any fixes
2. Also read:
   - `src/lib/workspace-checkpoints.ts`
   - `src/lib/workspace-types.ts` (if exists)
   - `src/screens/projects/lib/workspace-types.ts`
   - `src/screens/projects/lib/workspace-utils.ts`
   - `workspace-daemon/src/tracker.ts` (for what data the daemon actually provides)
   - `workspace-daemon/src/routes/checkpoints.ts`
   - `workspace-daemon/src/routes/projects.ts`
3. Fix bugs as you find them — commit as you go with descriptive messages
4. Write findings + fixes to `WORKSPACE-AUDIT-RESULTS.md` in repo root (what you found, what you fixed, what needs human review)
5. Run `npx tsc --noEmit` in root AND `workspace-daemon/` before final commit
6. Final commit message: `audit: M1-M3 workspace audit + fixes`
7. Then run: `openclaw system event --text "M1-M3 audit complete. See WORKSPACE-AUDIT-RESULTS.md" --mode now`

## Priority Order
Fix in this order: crashes > data bugs > missing states > UI polish
