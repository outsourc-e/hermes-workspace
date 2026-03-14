# Workspace QA Audit

Date: 2026-03-14

Scope: read-only audit of the requested frontend and daemon files. I also ran `npx tsc --noEmit` in both `clawsuite/` and `workspace-daemon/`.

TypeScript verification:
- `clawsuite/`: passed, 0 errors
- `workspace-daemon/`: passed, 0 errors

Notes:
- I ignored pure formatting/import-order churn unless it pointed to a real bug, dead path, missing error handling, or type-safety problem.
- `eslint` on the audited files reports additional style/lint cleanup, but the findings below are limited to issues with functional or maintainability impact.

## File-by-file report

### 1. `src/screens/workspace/workspace-layout.tsx`
- No material issues found.

### 2. `src/screens/projects/projects-screen.tsx`
- No material issues found.

### 3. `src/screens/projects/dashboard-project-cards.tsx`
- No material issues found.

### 4. `src/screens/review/review-queue-screen.tsx`
- No material issues found.

### 5. `src/screens/runs/runs-console-screen.tsx`
- No material issues found.

### 6. `src/screens/checkpoints/checkpoint-detail-screen.tsx`
- No material issues found.

### 7. `src/screens/agents/agents-screen.tsx`
- Issue: test-run dispatch posts to a nonexistent API path. `dispatchAgentTestRun()` calls `/api/task-runs/adhoc` at line 241, but the daemon exposes `/api/workspace/task-runs/adhoc` ([workspace-daemon/src/server.ts:54](./workspace-daemon/src/server.ts)).
- Severity: P0

### 8. `src/hooks/use-workspace-sse.ts`
- Issue: SSE is hardcoded to `/workspace-api` at lines 5 and 59 instead of going through the app route at `/api/workspace/events`. That bypasses the TanStack server route/proxy layer and is already documented in the repo as a dev-only proxy pattern. In production builds, this can break SSE entirely and trigger the workspace offline banner even when the daemon is healthy.
- Issue: this hook expects a `task_run.completed` event for successful runs (lines 85-119), but the daemon only emits that event for `completed` and `failed` statuses; normal successful runs land in `awaiting_review`. See [workspace-daemon/src/orchestrator.ts](./workspace-daemon/src/orchestrator.ts) and [workspace-daemon/src/tracker.ts](./workspace-daemon/src/tracker.ts).
- Severity: P1

### 9. `src/server/workspace-proxy.ts`
- No material issues found.

### 10. `workspace-daemon/src/orchestrator.ts`
- Issue: `dispatchTask()` creates a running entry, abort controller, and marks the agent as running before checking whether `project.path` exists. If the path is missing, it returns at lines 298-304 before reaching the `finally` cleanup, leaking `state.running`, leaving the abort controller registered, and leaving the agent stuck in `running`.
- Issue: successful non-autoapproved runs are completed with status `awaiting_review` at lines 337-345. That is fine by itself, but it does not line up with the frontend SSE contract because `task_run.completed` is only emitted for `completed` and `failed` in tracker. Result: success notifications and some invalidation paths never fire for the normal review flow.
- Severity: P1

### 11. `workspace-daemon/src/tracker.ts`
- Issue: `emitTaskRunCompleted()` only emits when the final status is `completed` or `failed` at lines 2672-2680. Normal successful workspace runs finish as `awaiting_review`, so they never publish `task_run.completed`. This breaks the completion path expected by [src/hooks/use-workspace-sse.ts](./src/hooks/use-workspace-sse.ts).
- Issue: spot-scan only. No other obvious high-confidence defects stood out in this file during the requested scan.
- Severity: P1

### 12. `workspace-daemon/src/routes/projects.ts`
- Issue: input validation is too weak for mutable numeric/boolean fields. In `POST /`, `max_concurrent` is only type-cast from `req.body` and then passed through `Math.trunc(max_concurrent ?? 2)` at lines 57-109. A non-number payload can become `NaN` and propagate into stored project config instead of returning `400`.
- Issue: `getProjectGitStatus()` parses `git log -1 --format=%h|%s|%ai` by splitting on `|` at lines 23-38. A commit subject containing `|` will corrupt `commit_hash`, `commit_message`, and `commit_date`.
- Severity: P1 for input validation, P2 for git metadata parsing

### 13. `workspace-daemon/src/routes/missions.ts`
- No material issues found.

### 14. `workspace-daemon/src/routes/task-runs.ts`
- Issue: the ad-hoc run creation flow waits only 1 second for a task run to appear (`waitForTaskRun()` at lines 8-18, used at lines 90-103). Under normal queue delay or load, the route can return `503` even though the task was queued successfully. That invites duplicate retries and duplicate work.
- Severity: P1

### 15. `workspace-daemon/src/routes/checkpoints.ts`
- Issue: `/approve` swallows stored-diff apply failures and still marks the checkpoint approved. At lines 361-381, `applyStoredDiffToProject()` errors are reduced to `console.warn`, then `approveCheckpoint()` still runs. That can produce a false “approved” state even when no code was applied.
- Issue: `/reject` force-sets the task run back to `running` at lines 574-578 even when there is no live session to steer, or when steering failed/was skipped because `sessionId` is missing. That creates phantom running runs.
- Issue: `/revise` only flips checkpoint status at lines 582-588. Unlike `/reject`, it never reopens the task run or steers the agent session, so “Revise” does not actually send work back to the agent.
- Severity: P1

### 16. `workspace-daemon/src/checkpoint-builder.ts`
- Issue: checkpoint verification runs against `projectPath`, not the task workspace. `attachVerification()` uses `runVerification(projectPath)` at lines 53-63, and `finalizeCheckpoint()` runs QA against `projectPath` at lines 76-83. For non-autoapproved checkpoints, that means stored tsc/QA results can reflect the base repo instead of the candidate diff in the worktree.
- Issue: duplicate `node:child_process` imports at lines 3-4.
- Severity: P1 for verification/QA target mismatch, P2 for duplicate imports

### 17. `workspace-daemon/src/agent-runner.ts`
- Issue: `runAfterRunHooks()` is only called after a successful `adapter.execute()` at lines 93-114. If the adapter throws, is aborted, or exits exceptionally, after-run hooks are skipped. That can leak cleanup/teardown logic for failed runs.
- Severity: P1

## Structured summary

- VERDICT: NEEDS_CHANGES
- ISSUES:
  - Broken frontend API path for agent test runs in `agents-screen.tsx`
  - SSE path uses dev-only proxy and normal successful runs never emit the event the hook expects
  - Orchestrator leaks running state when project paths disappear
  - Checkpoint approval/reject/revise routes can report or create incorrect run/checkpoint states
  - Checkpoint verification/QA runs against the wrong tree for pending checkpoints
  - Ad-hoc task-run creation can falsely return 503 after queueing work
- RISK_LEVEL: HIGH
