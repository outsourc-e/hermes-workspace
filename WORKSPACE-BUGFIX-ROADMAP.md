# Workspace Bug Fix Roadmap

_Generated: 2026-03-14 00:40 EDT by Aurora (Opus)_
_Based on: WORKSPACE-QA-AUDIT-FINAL.md_
_Branch: `feat/ux-polish-v3-handshake`_

---

## P0 — Will break in production (fix first)

### BUG-01: Agent test-run dispatches to wrong API path
**File:** `src/screens/agents/agents-screen.tsx` ~line 241
**Problem:** `dispatchAgentTestRun()` calls `/api/task-runs/adhoc` but daemon exposes `/api/workspace/task-runs/adhoc`
**Fix:** Change the fetch URL to `/api/workspace/task-runs/adhoc`. Also create `src/routes/api/workspace/task-runs.adhoc.ts` TanStack server route if it doesn't exist (check first), following the pattern of other workspace routes.

### BUG-02: SSE uses dev-only Vite proxy path
**File:** `src/hooks/use-workspace-sse.ts` line 4-5
**Problem:** `DAEMON_URL = '/workspace-api'` uses the Vite dev proxy. In production/Electron builds, this path won't exist — SSE will fail and show "daemon offline" permanently.
**Fix:** Change SSE to connect to `/api/workspace/events` (through TanStack server route). The server route at `src/routes/api/workspace/events.ts` already exists and forwards to daemon. Verify the TanStack route properly streams SSE responses (check that `forwardWorkspaceRequest` passes through the streaming body without buffering).

---

## P1 — Wrong behavior (fix next)

### BUG-03: Completion toasts never fire for normal runs
**Files:** `workspace-daemon/src/tracker.ts` ~line 2672, `src/hooks/use-workspace-sse.ts` ~line 85
**Problem:** `emitTaskRunCompleted()` only emits `task_run.completed` for status `completed` or `failed`. But successful workspace runs finish as `awaiting_review`, not `completed`. So the toast added in Sprint 3 never fires for the happy path.
**Fix:** In `tracker.ts`, update `emitTaskRunCompleted()` to also emit for `awaiting_review` status. OR add a new event `task_run.awaiting_review` and listen for it in the SSE hook. The latter is cleaner — add the event in tracker, add the listener in `use-workspace-sse.ts` that shows "✅ [task] ready for review".

### BUG-04: Orchestrator leaks running state on missing project path
**File:** `workspace-daemon/src/orchestrator.ts` ~line 288-304
**Problem:** When `project.path` doesn't exist, the early return skips the `finally` block. This leaks: `state.running` entry, abort controller, and agent stays stuck in `running` status.
**Fix:** Move the `fs.existsSync(project.path)` check to BEFORE the running entry is created and agent status is set. Or move it inside the try block so the catch/finally cleanup runs. Either approach works — just make sure `state.running.delete()`, `abortControllers.delete()`, and `tracker.setAgentStatus(agent.id, 'online')` all fire on early return.

### BUG-05: Checkpoint approve swallows diff-apply errors
**File:** `workspace-daemon/src/routes/checkpoints.ts` ~line 361-381
**Problem:** In `/approve`, if `applyStoredDiffToProject()` fails, it's caught with `console.warn` but `approveCheckpoint()` still runs. Checkpoint is marked approved even though no code was applied.
**Fix:** If `applyStoredDiffToProject()` throws, return 500 with error message. Do NOT call `approveCheckpoint()` on failure. Keep the `console.warn` for logging but make the error propagate to the response.

### BUG-06: Reject creates phantom running task runs
**File:** `workspace-daemon/src/routes/checkpoints.ts` ~line 574-578
**Problem:** `/reject` sets the task run back to `running` even when there's no live agent session to steer (no `sessionId`). Creates phantom running state.
**Fix:** Only set task run to `running` if `sessionId` exists and the steer/stop was successful. If no session, set the task run to `failed` with reason "Rejected by reviewer" instead.

### BUG-07: Revise is a no-op
**File:** `workspace-daemon/src/routes/checkpoints.ts` ~line 582-588
**Problem:** `/revise` only flips checkpoint status but never reopens the task run or sends instructions back to the agent. "Revise" button does nothing useful.
**Fix:** Two options:
  - **Option A (simple):** Revise creates a NEW task run for the same task with the reviewer's notes appended to the original prompt. Set the checkpoint to `revised`, create a pending task run, trigger it via orchestrator. This is the cleanest approach.
  - **Option B (session-based):** If the agent session is still alive (has `sessionId`), send the revision notes to the running session. Fall back to Option A if session is gone.
  - **Recommend Option A** — simpler, more reliable, works regardless of session state.

### BUG-08: Checkpoint verification runs against wrong tree
**File:** `workspace-daemon/src/checkpoint-builder.ts` ~line 53-63, 76-83
**Problem:** `attachVerification()` and QA runner use `projectPath` (base repo) instead of `workspacePath` (the worktree with the candidate diff). TSC and QA results reflect the base repo, not the proposed changes.
**Fix:** Pass `workspacePath` instead of `projectPath` to both `runVerification()` and `QARunner.runQA()`. The verification should run against the worktree where the changes actually live.

### BUG-09: Adhoc task-run returns false 503
**File:** `workspace-daemon/src/routes/task-runs.ts` ~line 8-18
**Problem:** `waitForTaskRun()` only waits 1 second for the task run to appear. Under any queue delay, it returns 503 "not created yet" even though the task was successfully queued.
**Fix:** Increase timeout to 5 seconds. Also change the 503 response to 202 Accepted with `{ ok: true, task_id, queued: true }` so the caller knows the task was accepted even if the run hasn't started yet.

---

## P2 — Cleanup (do last or skip)

### BUG-10: Git log parsing breaks on pipe character
**File:** `workspace-daemon/src/routes/projects.ts` ~line 23-38
**Problem:** Parsing `git log --format=%h|%s|%ai` by splitting on `|`. Commit messages containing `|` corrupt parsed fields.
**Fix:** Use a delimiter that won't appear in commit messages, like `%x00` (null byte), or use `--format=` with separate calls for each field.

### BUG-11: Weak input validation for max_concurrent
**File:** `workspace-daemon/src/routes/projects.ts` ~line 57-109
**Fix:** Add `typeof max_concurrent === 'number' && !isNaN(max_concurrent)` guard before `Math.trunc()`.

### BUG-12: Duplicate child_process imports
**File:** `workspace-daemon/src/checkpoint-builder.ts` lines 3-4
**Fix:** Merge `import { execSync } from 'node:child_process'` and `import { execFile } from 'node:child_process'` into one import.

---

## Execution Notes

- **Fix order:** BUG-01 → BUG-02 → BUG-03 → BUG-04 → BUG-08 → BUG-05 → BUG-06 → BUG-07 → BUG-09 → BUG-10/11/12
- **BUG-02 (SSE)** needs careful testing — verify the TanStack server route properly streams SSE without buffering the response
- **BUG-07 (Revise)** is the most complex — creates new task runs. Test thoroughly.
- **BUG-08 (Verification target)** is critical for hands-free mode — auto-approve decisions based on wrong tree = bad merges
- **tsc verification required** after every fix: `npx tsc --noEmit` from both `clawsuite/` and `workspace-daemon/`
- **Branch:** all work stays on `feat/ux-polish-v3-handshake`

## File Reference

| Bug | File | Lines |
|-----|------|-------|
| BUG-01 | src/screens/agents/agents-screen.tsx | ~241 |
| BUG-02 | src/hooks/use-workspace-sse.ts | 4-5, 59 |
| BUG-03 | workspace-daemon/src/tracker.ts | ~2672 |
| BUG-03 | src/hooks/use-workspace-sse.ts | ~85 |
| BUG-04 | workspace-daemon/src/orchestrator.ts | ~288-304 |
| BUG-05 | workspace-daemon/src/routes/checkpoints.ts | ~361-381 |
| BUG-06 | workspace-daemon/src/routes/checkpoints.ts | ~574-578 |
| BUG-07 | workspace-daemon/src/routes/checkpoints.ts | ~582-588 |
| BUG-08 | workspace-daemon/src/checkpoint-builder.ts | ~53-83 |
| BUG-09 | workspace-daemon/src/routes/task-runs.ts | ~8-18 |
| BUG-10 | workspace-daemon/src/routes/projects.ts | ~23-38 |
| BUG-11 | workspace-daemon/src/routes/projects.ts | ~57-109 |
| BUG-12 | workspace-daemon/src/checkpoint-builder.ts | 3-4 |
