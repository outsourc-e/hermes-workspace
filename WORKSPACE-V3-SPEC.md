# Workspace V3 Spec — Enterprise Polish
_2026-03-14 · Aurora_

Goal: Close all gaps between v4 mockup and current build. Ship as enterprise-quality product inside ClawSuite + standalone.

---

## Round 1 — Backend Reliability (no UI changes, pure daemon fixes)

### R1-1: Stale Task Watchdog (P0)
**File:** `workspace-daemon/src/orchestrator.ts`
**Problem:** When Codex process dies unexpectedly, task stays "running" forever in DB. The existing `setTimeout` watchdog only aborts if the Promise is still pending — if the process crashed silently, the `runTask` call already rejected but `state.running` may not be cleaned properly for edge cases.
**Fix:**
1. Add a `sweepStaleRuns()` method that runs on a 60-second interval
2. Query all task_runs with status="running" where `updated_at` is older than `MAX_RUN_DURATION_MS`
3. Mark them as `failed` with error "Process disappeared (stale run cleanup)"
4. Update corresponding task status to `failed`
5. Call `sweepStaleRuns()` on startup (catches leftovers from daemon restart)
6. Emit SSE event `task_run.stale_cleanup` so UI updates

### R1-2: Checkpoint Verification Pipeline (P0)
**Files:** `workspace-daemon/src/verification.ts`, `workspace-daemon/src/routes/checkpoints.ts`
**Problem:** Verification only runs `tsc`. V4 mockup shows tsc + tests + lint. Review queue needs verification badges.
**Fix:**
1. Extend `verification.ts` to support multiple checks: `tsc`, `test` (detect package.json scripts), `lint` (eslint if present)
2. Return `VerificationResult[]` array with `{check: string, passed: boolean, output: string, durationMs: number}`
3. Store verification results on checkpoint record (new `verification_results` TEXT column, JSON)
4. Auto-run verification when checkpoint is created (after Codex commits)
5. Add `GET /api/workspace/checkpoints/:id/verify` to re-run verification on demand
6. Include verification_results in checkpoint list/detail API responses

### R1-3: Revise Flow (P1)
**Files:** `workspace-daemon/src/routes/checkpoints.ts`, `workspace-daemon/src/orchestrator.ts`
**Problem:** Only approve exists. No way to send a checkpoint back with instructions.
**Fix:**
1. Add `POST /api/workspace/checkpoints/:id/revise` with body `{instructions: string}`
2. Revise flow: mark checkpoint as `revised`, create a new task_run for the same task with the revision instructions prepended to the original task description
3. The new run picks up the existing worktree (don't wipe it) so the agent builds on its previous work
4. Track revision count on checkpoint (`revision_number` column)

### R1-4: Reject Flow (P1)
**Files:** `workspace-daemon/src/routes/checkpoints.ts`
**Fix:**
1. Add `POST /api/workspace/checkpoints/:id/reject` with body `{reason: string}`
2. Mark checkpoint as `rejected`, mark task as `failed`
3. Clean up worktree
4. Log audit event

---

## Round 2 — Project Detail Redesign (match v4 layout)

### R2-1: Phase/Mission Sidebar Nav
**File:** `src/screens/projects/project-detail-view.tsx`
**Change:** Replace current flat layout with v4's two-column: left sidebar (back button, project name, phase tree with missions, Resume + New Mission buttons) + right main area.

### R2-2: Project Policies Card
**File:** `src/screens/projects/project-detail-view.tsx`
**Change:** Add policies card: branch strategy (per-mission/main), approval mode (auto/PR/manual), required checks (tsc/tests/lint), shell access (yes/no), network access (yes/no). Store in `projects` table as `policies` JSON column.

### R2-3: Health Card
**File:** `src/screens/projects/project-detail-view.tsx`
**Change:** Card showing last tsc result, test results, lint warnings. Pulls from most recent verification run for the project. Add `GET /api/workspace/projects/:id/health` endpoint.

### R2-4: Git Card
**File:** `src/screens/projects/project-detail-view.tsx`
**Change:** Show current branch, latest commit hash, open PRs count. Daemon reads from git at project path. Add `GET /api/workspace/projects/:id/git-status` endpoint.

### R2-5: Active Mission Inline Card
**File:** `src/screens/projects/project-detail-view.tsx`
**Change:** Show currently running mission with progress bar, task count, agent count, elapsed time, cost. Links to mission detail.

---

## Round 3 — Review Queue Enterprise (match v4)

### R3-1: Verification Badges on Checkpoints
**File:** `src/screens/review/review-queue-screen.tsx`
**Change:** Show Verified ✅ / Missing ⚠️ / Failed ❌ badges based on verification_results from R1-2.

### R3-2: Risk Tags
**Files:** `src/screens/review/review-queue-screen.tsx`, daemon decomposer
**Change:** Decomposer assigns risk level (low/medium/high) per task based on scope (auth/payments = high, UI = low). Show as colored badges. Store on task record.

### R3-3: Project Filters + Sort
**File:** `src/screens/review/review-queue-screen.tsx`
**Change:** Filter bar: All | per-project tabs. Sort: newest/oldest/highest-risk. Filter by verification status.

### R3-4: Revise + Reject Buttons
**File:** `src/screens/review/review-queue-screen.tsx`
**Change:** Three actions per checkpoint: Approve (green), Revise (yellow, opens instruction input), Reject (red, opens reason input). Wire to R1-3 and R1-4 endpoints.

### R3-5: Approve All Verified
**File:** `src/screens/review/review-queue-screen.tsx`
**Change:** Bulk action button: "Approve all verified (N)" that approves all checkpoints where all verification checks passed.

### R3-6: Keyboard Shortcuts
**File:** `src/screens/review/review-queue-screen.tsx`
**Change:** A=approve, R=revise, X=reject, J/K=navigate. Show hint bar at top.

---

## Round 4 — Mission Control + Diff Viewer

### R4-1: Breadcrumb Nav
**File:** New `src/screens/missions/mission-detail-screen.tsx`
**Change:** Projects > ClawSuite > Mission 3: Checkpoint UI breadcrumb bar.

### R4-2: Task Pipeline Visualization
**File:** `src/screens/missions/mission-detail-screen.tsx`
**Change:** Each task as a row with: status icon, name, assigned agent, duration timer (live), dependency arrows. Color-coded by status (pending/running/review/done/failed).

### R4-3: Split-Pane Terminal + Diff
**File:** `src/screens/missions/mission-detail-screen.tsx`
**Change:** Click a running task → bottom pane shows live terminal output (left) + file diff preview (right). Uses xterm.js or pre-formatted output from run events.

### R4-4: Checkpoint Detail with Diff Viewer
**File:** `src/screens/projects/checkpoint-detail-modal.tsx`
**Change:** Full diff viewer: file list on left, side-by-side or unified diff on right with syntax highlighting. Use `react-diff-viewer` or similar. Verification results panel below diff. Approve/Revise/Reject actions.

---

## Round 5 — Final Polish

### R5-1: Dark/Light Theme Consistency
All workspace screens match v4 color system (already mostly there from ClawSuite design system).

### R5-2: Skills Screen — Render SKILL.md
**File:** `src/screens/workspace/skills/` (or wherever skills screen lives)
**Change:** Detail panel renders SKILL.md content as markdown instead of showing filesystem path.

### R5-3: Teams Screen — Dynamic Tiers
**File:** `src/screens/teams/teams-screen.tsx`
**Change:** Fetch tiers from DB instead of hardcoded array.

### R5-4: Responsive/Mobile Polish
All workspace screens usable on tablet. Sidebar collapses to hamburger.

### R5-5: Standalone Extraction Prep
- Ensure zero direct imports between `workspace-daemon/` and `src/` (HTTP+SSE only)
- Add `workspace-daemon/package.json` with own deps
- Add `workspace-daemon/bin/cli.ts` with `workspace init|start|status` commands
- Document API contract in `workspace-daemon/API.md`

---

## Execution Order
Round 1 → Round 2 → Round 3 → Round 4 → Round 5
Each round = 1 Codex session (2-4 tasks batched per run)
Estimated: 5 rounds × ~30min = 2.5-3 hours total
