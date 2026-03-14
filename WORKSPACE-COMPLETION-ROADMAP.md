# Workspace Completion Roadmap

_Generated: 2026-03-13 22:30 EDT by Aurora (Opus)_
_Branch: `feat/ux-polish-v3-handshake`_
_Current state: 180+ commits ahead of origin/main, tsc clean_

---

## Overview

The workspace daemon + UI pipeline is functionally end-to-end (project → task → agent run → checkpoint → review). Three bugs and some missing endpoints/polish prevent daily use. This roadmap covers everything needed to ship workspace as "usable."

---

## Sprint 1: Critical Bugs (do first)

### 1.1 — Retry storm guard
**Priority:** P0 — actively wasting resources
**Problem:** When a project path no longer exists (temp dir cleaned), tasks retry forever (4,607 failed runs from one task).
**Files:**
- `workspace-daemon/src/orchestrator.ts` — `dispatchTask()` method (~line 240)
- `workspace-daemon/src/workspace.ts` — `createWorkspace()` method

**Fix:**
1. In `orchestrator.ts dispatchTask()`: before calling `agentRunner.runTask()`, check `fs.existsSync(project.path)`. If missing, fail the task permanently with `"Project path no longer exists"` and do NOT queue retry.
2. In orchestrator retry logic (`queueRetry`): add max retry cap of 3 (already has `MAX_RETRIES = 3` constant but the path-missing error may bypass it). Verify the retry counter increments properly for workspace creation failures.
3. Add `DELETE /api/workspace/task-runs/purge` endpoint that deletes all task runs with status `failed` older than a given threshold (default 24h). Call it from a "Clear failed runs" button in the Runs tab.

**Verify:** Kill a temp project dir, trigger task, confirm it fails once and stops. Confirm purge endpoint clears old runs.

### 1.2 — Daemon auto-restart on code change
**Priority:** P0 — daemon doesn't restart when code changes
**Problem:** Vite's configureServer plugin spawns daemon on startup but doesn't respawn on kill or code change. After any daemon code edit, you must manually restart.
**Files:**
- `vite.config.ts` (~line 125-215, daemon spawn logic)
- `workspace-daemon/package.json`

**Fix:**
1. Change daemon spawn from `npx tsx src/server.ts` to `npx tsx watch src/server.ts` — tsx watch auto-restarts on file changes.
2. In the Vite `configureServer` plugin, add a `beforeClose` hook that kills `workspaceDaemonChild` on Vite shutdown to prevent orphan processes.

**Verify:** Edit `workspace-daemon/src/server.ts` (add a comment), confirm daemon auto-restarts. Kill Vite, confirm daemon dies too.

### 1.3 — Stale data cleanup
**Priority:** P1 — UI is cluttered with test data
**Problem:** 6 test projects, 4,607 failed runs, 14 old checkpoints from E2E testing.

**Fix:**
1. Add `DELETE /api/workspace/projects/:id` to daemon (cascade delete phases, missions, tasks, task-runs, checkpoints for that project).
2. Add project delete button in project detail view (with confirmation dialog).
3. After implementing, delete the 5 test projects (E2E Live Test, Git Test, E2E Audit Test, Math Lib, Stress Test) — keep only "ClawSuite Workspace."

**Verify:** Delete a test project, confirm all related runs/checkpoints are gone.

---

## Sprint 2: Missing Endpoints

### 2.1 — Missions list endpoint
**Problem:** `GET /api/workspace/missions` returns 404 — no GET `/` handler in daemon missions router.
**Files:** `workspace-daemon/src/routes/missions.ts`

**Fix:** Add `router.get("/", (req, res) => { ... })` that returns `tracker.listMissions(filter)` with optional `?phase_id=` and `?status=` query params. Need to add `listMissions()` to tracker if it doesn't exist.

### 2.2 — Task-runs retry frontend route
**Problem:** `runs-console-screen.tsx` line 873 calls `/workspace-api/api/workspace/task-runs/${runId}/retry` directly via Vite proxy instead of through a TanStack route. Works on localhost but would break in production build.
**Files:**
- `src/routes/api/workspace/task-runs.$id.retry.ts` (create new)
- `src/screens/runs/runs-console-screen.tsx` (update to use `/api/workspace/task-runs/${runId}/retry`)

**Fix:** Create the TanStack server route following the pattern in `task-runs.$id.pause.ts`. Update the runs screen to use the consistent path.

### 2.3 — Agents PATCH/DELETE frontend routes
**Problem:** `agents-screen.tsx` lines 257/267 call `/workspace-api/api/workspace/agents/${agentId}` directly via Vite proxy for PATCH/DELETE.
**Files:**
- `src/routes/api/workspace/agents.$id.ts` (create new)
- `src/screens/agents/agents-screen.tsx` (update paths)

**Fix:** Create the TanStack server route with PATCH and DELETE handlers, forwarding to daemon. Update agents screen to use consistent path.

---

## Sprint 3: UI Polish

### 3.1 — Completion toast/notification
**Problem:** When a task run completes, no visible notification appears — user must check Review tab.
**Files:**
- `src/hooks/use-workspace-sse.ts`
- `src/screens/workspace/workspace-layout.tsx`

**Fix:**
1. In `use-workspace-sse.ts`: add listener for `task_run.completed` events. Parse the event data for task name and status.
2. Show a toast (import from `@/components/ui/toast`) with the task name and result: "✅ Create hello.js completed — review ready" or "❌ Task failed: [error]"
3. Add a pending review count badge on the "Review" tab label when checkpoints with `status=pending` exist.

### 3.2 — Review queue TSC badge
**Problem:** Checkpoint verification data (tsc pass/fail) is stored in DB but not shown on review queue cards.
**Files:** `src/screens/review/review-queue-screen.tsx` (~line 127, `CheckpointCard` component)

**Fix:**
1. `getCheckpointTscStatus()` already exists and is called. Check if it returns data and render a small badge: green "tsc ✓" or red "tsc ✗" next to the diff stats on each card.
2. This is purely display — the data is already being fetched.

### 3.3 — Checkpoint detail light theme
**Problem:** `checkpoint-detail-screen.tsx` (753 lines) still uses dark backgrounds/text in places.
**Files:** `src/screens/checkpoints/checkpoint-detail-screen.tsx`

**Fix:** Replace dark theme classes: `bg-gray-900` → `bg-surface`, `text-gray-100` → `text-primary-900`, `border-gray-700` → `border-primary-200`, etc. Follow the same light-theme pattern used in other workspace screens.

### 3.4 — Approve-and-merge as default
**Problem:** Quick approve button uses `approve-and-commit` (commits in worktree only). Should use `approve-and-merge` (merges back to project main branch).
**Files:** `src/screens/review/review-queue-screen.tsx` (~line 543)

**Fix:** Change `action: 'approve-and-commit'` to `action: 'approve-and-merge'` in the `handleApprove` function and the `CheckpointDetailModal` default. The merge endpoint already exists and works.

---

## Sprint 4: Quality of Life

### 4.1 — Project archive/status
**Fix:** Add `PATCH /api/workspace/projects/:id` to daemon (already exists in projects router — verify). Add "Archive" button on project cards that sets `status: 'archived'`. Filter archived projects from default view, show with toggle.

### 4.2 — Review keyboard shortcuts completion
**Fix:** In `review-queue-screen.tsx`, wire `Enter` key to open the highlighted checkpoint detail (the handler exists but the keyboard listener may not fire for Enter). Add `m` shortcut for approve-and-merge vs `a` for approve-and-commit.

### 4.3 — Run output viewer
**Fix:** The runs console screen already has `LiveOutputPanel` and fetches `/api/workspace/task-runs/:id/events`. Verify it actually renders agent stdout/stderr. If events are empty, check that the Codex adapter's `onEvent` callback is firing during runs.

### 4.4 — Clean up Vite proxy vs TanStack route inconsistency
**Problem:** Some screens call `/workspace-api/...` (Vite proxy) and others call `/api/workspace/...` (TanStack server routes). Both work in dev but only TanStack routes work in production builds.
**Fix:** Audit all `workspace-api` references in `src/screens/` and `src/lib/` — replace with `/api/workspace/` equivalents. Ensure all routes have matching TanStack server route files.

---

## Execution Notes

- **Each sprint task is independent** — can be done in any order within the sprint
- **Sprint 1 first** — the retry storm is actively running and the daemon restart issue slows dev
- **tsc verification required** after every task: `npx tsc --noEmit` from both `clawsuite/` and `workspace-daemon/`
- **Branch:** all work stays on `feat/ux-polish-v3-handshake`
- **Commit style:** `fix(workspace):` for bugs, `feat(workspace):` for new features
- **Test after each task:** reload ClawSuite on mobile (Tailscale URL) to verify

---

## File Reference

| File | Lines | Role |
|------|-------|------|
| `workspace-daemon/src/orchestrator.ts` | 486 | Task dispatch, retry, concurrency |
| `workspace-daemon/src/tracker.ts` | 2,506 | DB source of truth, all reads/writes |
| `workspace-daemon/src/agent-runner.ts` | ~135 | Runs adapters, builds checkpoints |
| `workspace-daemon/src/checkpoint-builder.ts` | 198 | Diff capture, QA, auto-approve logic |
| `workspace-daemon/src/server.ts` | ~80 | Express app, route mounting |
| `workspace-daemon/src/routes/checkpoints.ts` | 592 | Approve/reject/merge/verify endpoints |
| `workspace-daemon/src/routes/task-runs.ts` | 194 | Run list, retry, pause, stop |
| `workspace-daemon/src/routes/missions.ts` | ~70 | Create, start, pause, resume, stop |
| `workspace-daemon/src/adapters/codex.ts` | 765 | Codex CLI adapter |
| `src/screens/workspace/workspace-layout.tsx` | 495 | Workspace shell, tabs, SSE, hands-free toggle |
| `src/screens/projects/projects-screen.tsx` | 2,183 | Project list, detail, create, decompose |
| `src/screens/review/review-queue-screen.tsx` | 871 | Checkpoint review cards, approve/reject |
| `src/screens/runs/runs-console-screen.tsx` | 1,144 | Run list, live output, retry/pause/stop |
| `src/screens/checkpoints/checkpoint-detail-screen.tsx` | 753 | Full checkpoint detail + diff viewer |
| `src/hooks/use-workspace-sse.ts` | 148 | SSE connection, query invalidation |
| `src/server/workspace-proxy.ts` | 58 | Forwards requests to daemon |
| `vite.config.ts` | ~220 | Daemon spawn, Vite proxy config |
