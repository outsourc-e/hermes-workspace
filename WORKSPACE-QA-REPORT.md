# Workspace QA Audit Report

Date: 2026-03-13

TypeScript verification:
- `clawsuite/`: `npx tsc --noEmit` -> 0 errors
- `workspace-daemon/`: `npx tsc --noEmit` -> 0 errors

## Summary table

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | P0.1 PATCH/DELETE agents routes | ✅ DONE | `workspace-daemon/src/routes/agents.ts` has `router.patch("/:id")` and `router.delete("/:id")`. |
| 2 | P0.2 adhoc test run endpoint | ✅ DONE | `workspace-daemon/src/routes/task-runs.ts` implements `createAdhocTaskRunsRouter()` and `server.ts` mounts `/api/task-runs/adhoc`. |
| 3 | P0.3 `useWorkspaceSse` wired into `workspace-layout.tsx` | ✅ DONE | `src/hooks/use-workspace-sse.ts` subscribes to `/api/events` and invalidates React Query keys; `src/screens/workspace/workspace-layout.tsx` calls `useWorkspaceSse()`. |
| 4 | P0.4 Live run output panel with streaming | ✅ DONE | `src/screens/runs/runs-console-screen.tsx` renders `LiveOutputPanel`, fetches `GET /api/workspace/task-runs/:id/events`, and polls active selected runs every 2s. |
| 5 | P1.1 Smart agent routing by keyword | ✅ DONE | `workspace-daemon/src/orchestrator.ts` routes by keyword patterns to `aurora-coder`, `aurora-daemon`, `aurora-qa`, `aurora-planner`, then falls back to `suggested_agent_type` and online codex agents. |
| 6 | P1.2 Decomposer uses Anthropic API not just CLI | ✅ DONE | `workspace-daemon/src/decomposer.ts` uses `@anthropic-ai/sdk` when `ANTHROPIC_API_KEY` is set, with CLI fallback. |
| 7 | P1.3 Checkpoint stores `raw_diff` | ✅ DONE | `workspace-daemon/src/db/index.ts` migrates `raw_diff`; `tracker.createCheckpoint()` inserts it; `routes/checkpoints.ts` uses stored diff when worktree is gone. |
| 8 | Phase 1 layout: workspace screens use `<main>` and `max-w-[1480px]` | ✅ DONE | Verified in `projects`, `review`, `runs`, `agents`, `skills`, and `teams` screens. |
| 9 | Phase 2 theme: no dark remnants in workspace screens | ⚠️ PARTIAL | Primary workspace tabs are light-themed, but dark styling remains in checkpoint detail views such as `src/screens/checkpoints/checkpoint-detail-screen.tsx`. |
| 10 | Phase 3 skills API endpoint exists in daemon routes | ✅ DONE | `workspace-daemon/src/routes/skills.ts` provides `GET /api/workspace/skills` and `GET /api/workspace/skills/:id/content`; mounted in `server.ts`. |
| 11 | Phase 3 teams DB seeding on init | ✅ DONE | `workspace-daemon/src/db/index.ts` defines `seedDefaultTeams()` and calls it during DB initialization. |
| 12 | Phase 4 run duration writes (`started_at`/`completed_at`) | ✅ DONE | Implemented via tracker methods: `markTaskRunStarted()`, `completeTaskRun()`, and `failTaskRun()` in `workspace-daemon/src/tracker.ts`. |
| 13 | Phase 4 retry button on failed runs | ⚠️ PARTIAL | UI exists in `src/screens/runs/runs-console-screen.tsx`, but `workspace-daemon/src/routes/task-runs.ts` has no `POST /:id/retry` route. |
| 14 | Phase 4 keyboard shortcuts on review queue | ⚠️ PARTIAL | `src/screens/review/review-queue-screen.tsx` supports `a`, `r`, `j`, `k`, arrows; planned `Enter` open-detail shortcut is missing. |
| 15 | Phase 5 worktree commit bug fix | ✅ DONE | Implemented in `workspace-daemon/src/workspace.ts`: always creates a real git worktree, throws on failure, and verifies `.git` exists. |
| 16 | Phase 5 checkpoint tsc verify badge | ⚠️ PARTIAL | Backend verification exists (`POST /api/workspace/checkpoints/:id/verify-tsc`) and detail screens show verification state, but the review queue cards do not show the planned green/red badge. |

## Remaining gaps

1. Run retry is not complete end-to-end.
   Frontend calls `POST /api/workspace/task-runs/:id/retry`, but no matching daemon route exists in `workspace-daemon/src/routes/task-runs.ts`.

2. Review queue keyboard shortcuts are incomplete.
   `a`, `r`, `j`, `k`, `ArrowUp`, and `ArrowDown` are implemented, but `Enter` does not open the highlighted checkpoint detail as specified in the roadmap.

3. Checkpoint verification is not surfaced in the review queue.
   Verification data is stored and detail views can run/show TSC results, but the queue cards in `src/screens/review/review-queue-screen.tsx` do not display a checkpoint verify badge.

4. Theme cleanup is not fully consistent across workspace-adjacent screens.
   Main workspace tabs are light-themed, but `src/screens/checkpoints/checkpoint-detail-screen.tsx` still uses dark background/text treatment.

## Priority order for next tasks

1. Add daemon retry support for failed runs.
   Implement `POST /api/workspace/task-runs/:id/retry` and clone/reset the failed run path expected by the current UI.

2. Add checkpoint verification badge to the review queue.
   Surface stored `verification.tsc` state directly on review cards so reviewers can triage without opening detail screens.

3. Finish review queue keyboard shortcuts.
   Add `Enter` to open the highlighted checkpoint detail and keep shortcut help text aligned with behavior.

4. Finish theme cleanup for checkpoint detail surfaces.
   Convert remaining dark styling in checkpoint detail screen(s) if the intent is full workspace light-theme consistency.
