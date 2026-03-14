# Workspace Phase 2 Roadmap

_Generated: 2026-03-14 01:15 EDT by Aurora (Opus)_
_Branch: `feat/ux-polish-v3-handshake` — 188 commits ahead of origin/main_
_Prerequisite: All Phase 1 roadmap tasks + 12 bug fixes complete, tsc clean_

---

## Current State

The workspace pipeline is functional end-to-end:
- Create project (dialog + 5-step wizard with AI decomposition) ✅
- Dispatch tasks to Codex/Claude agents in isolated git worktrees ✅
- Checkpoint creation with diff, QA scoring, TSC verification ✅
- Review queue with approve/reject/revise + keyboard shortcuts ✅
- Hands-free auto-approve toggle ✅
- SSE live updates + completion toasts ✅
- Project archive + agent directory + teams + skills ✅

**What's holding it back from daily use:**
1. Dark theme remnants in 8 files (dialogs, modals, wizard, utils)
2. New Project Wizard exists (1,199 lines!) but is clunky — needs guided onboarding polish
3. No live terminal output during agent runs (events exist but no streaming terminal)
4. Daemon lifecycle is fragile (manual restarts, no health monitoring)
5. Workspace tab is cluttered — too many tabs, no clear hierarchy
6. No way to run workspace from Electron production build

---

## Sprint 1: Theme + Visual Cleanup (do first — biggest perceived impact)

### P2-01: Light theme sweep across all workspace screens
**Files (8 files with dark remnants):**
- `src/screens/projects/checkpoint-detail-modal-parts.tsx`
- `src/screens/projects/checkpoint-detail-modal.tsx`
- `src/screens/projects/create-project-dialog.tsx`
- `src/screens/projects/decompose-dialog.tsx`
- `src/screens/projects/lib/workspace-utils.ts`
- `src/screens/projects/new-project-wizard.tsx`
- `src/screens/projects/project-detail-view.tsx`
- `src/screens/runs/lib/runs-utils.ts`

**Fix:** Replace all dark theme classes:
- `bg-gray-*` → `bg-surface` / `bg-primary-50` / `bg-white`
- `bg-primary-800` / `bg-primary-900` → `bg-surface` / `bg-primary-50`
- `text-gray-*` → `text-primary-900` / `text-primary-500` / `text-primary-700`
- `border-gray-*` → `border-primary-200`
- `text-primary-100` → `text-primary-900`
- `border-primary-700` → `border-primary-200`
- Follow the pattern in `review-queue-screen.tsx` (the cleanest light-theme screen)

### P2-02: Workspace tab declutter
**File:** `src/screens/workspace/workspace-layout.tsx`
**Problem:** 6 tabs (Projects, Review, Runs, Agents, Skills, Teams) on one bar. On mobile this overflows. Skills and Teams are secondary — rarely used.

**Fix:**
- Keep 4 primary tabs: **Projects**, **Review**, **Runs**, **Agents**
- Move Skills + Teams into a "More" overflow menu or into a settings/config sub-screen
- Add a pending review count badge on the Review tab (the data fetch already exists from the Sprint 3 work — verify it renders)
- Add a running count badge on the Runs tab

### P2-03: Clean up stale test projects
**Problem:** 4 test projects (E2E Live Test, Git Test, Math Lib, Stress Test) cluttering the UI. Git Test is archived, others are still active.
**Fix:** Archive or delete the remaining test projects via the API. Can be done via curl — no code change needed. Leave only "ClawSuite Workspace."

---

## Sprint 2: Onboarding Polish

### P2-04: Simplify Create Project flow
**Files:** `src/screens/projects/create-project-dialog.tsx` (178 lines), `src/screens/projects/new-project-wizard.tsx` (1,199 lines)
**Problem:** Two paths exist — a simple dialog and a 5-step wizard. The wizard is powerful but overwhelming for first use. The simple dialog is too bare.

**Fix:**
- Make the simple dialog the default "New Project" button action
- Add a "Advanced setup" link in the dialog that opens the full wizard
- In the simple dialog: add a "Auto-decompose" checkbox (default ON) — when checked, after project creation, auto-call `/api/workspace/decompose` with the spec, create phases/missions/tasks, and start the first mission
- This gives a 1-click path: name + path + spec → project created + tasks running

### P2-05: Empty state onboarding
**File:** `src/screens/projects/projects-screen.tsx`
**Problem:** When workspace has no projects, the empty state just says "No projects." Should guide the user.

**Fix:**
- Replace empty state with a card: "Create your first project" with a brief 3-step explanation (1. Point to a repo 2. Describe what to build 3. Agents run automatically)
- Include a "Quick Start" button that opens the simple create dialog
- Include a "Watch Demo" link (placeholder for now)

---

## Sprint 3: Live Output + Terminal

### P2-06: Streaming run output
**Files:** `src/screens/runs/runs-console-screen.tsx` (~line 158, `LiveOutputPanel`), `workspace-daemon/src/adapters/codex.ts`
**Problem:** `LiveOutputPanel` exists and renders events, but the output is stored events (after completion), not live streaming during execution. During a run, you see nothing until it finishes.

**Fix:**
1. In the Codex adapter (`workspace-daemon/src/adapters/codex.ts`): verify that `onEvent` callbacks fire during execution (not just at the end). The adapter spawns a child process — it should pipe stdout/stderr chunks as events in real-time.
2. In `use-workspace-sse.ts`: add listener for `task_run.output` events. When received, append to a local output buffer and invalidate the run events query.
3. In `LiveOutputPanel`: add auto-scroll behavior — when new events arrive, scroll to bottom. Add a "Follow" toggle.
4. Style the output panel as a terminal: monospace font, dark background (this is the ONE place dark theme is appropriate), max-height with scroll.

### P2-07: Run detail expansion
**File:** `src/screens/runs/runs-console-screen.tsx`
**Problem:** Run list shows basic info. Clicking a run should show full detail: output log, token usage, duration, agent used, diff preview.

**Fix:**
- Add an expandable detail panel below each run row (or side panel on desktop)
- Show: agent name, model, tokens in/out, cost, duration, status
- Show output log (from LiveOutputPanel)
- If checkpoint exists: show diff stat + "Go to Review" link

---

## Sprint 4: Daemon Reliability

### P2-08: Daemon health monitor
**Files:** `vite.config.ts`, `src/hooks/use-workspace-sse.ts`
**Problem:** Daemon dies silently. Vite's `tsx watch` should auto-restart, but if the daemon crashes repeatedly it hits the 5-retry limit and stops. No recovery path after that.

**Fix:**
1. In `use-workspace-sse.ts`: when SSE disconnects, show a small warning toast "Workspace daemon disconnected, reconnecting..." (the banner already shows, but a toast is more noticeable)
2. Add a "Restart daemon" button in the offline banner that calls a new endpoint
3. Create `POST /api/workspace/daemon/restart` TanStack route that kills and respawns the daemon process (this only works in dev/Vite mode — in production the daemon lifecycle is different)
4. For Vite mode: increase max retries from 5 to 20, add exponential backoff

### P2-09: Daemon startup on pnpm dev
**File:** `vite.config.ts`
**Problem:** If a stale daemon process is running from a previous session, Vite skips spawning a new one. The stale process might be running old code.

**Fix:**
1. On Vite startup: check if port 3099 is in use. If so, verify it's healthy via `GET /health`. If healthy, leave it. If NOT healthy (no response within 2s), kill the process on that port and spawn fresh.
2. Add a version/hash endpoint to the daemon (`GET /api/workspace/version` returns build timestamp or git hash) — Vite can compare and force-restart if stale.

---

## Sprint 5: Electron Production Build

### P2-10: Bundle daemon for Electron
**Files:** `electron/main.ts` or `electron/main.cjs`, `electron-builder.config.cjs`
**Problem:** Workspace daemon only runs via `tsx` in dev. Electron production builds need a compiled daemon.

**Fix:**
1. Add a `workspace-daemon/build` script that compiles TS to JS: `tsc -p tsconfig.json` or use `tsup`/`esbuild` for a single-file bundle
2. In electron-builder config: include `workspace-daemon/dist/**/*` in the files array
3. In Electron main process: on app launch, spawn the daemon from `workspace-daemon/dist/server.js` with the correct PORT and working directory
4. On app quit: kill the daemon child process
5. Store daemon DB in `app.getPath('userData')` instead of `.workspaces/` so it persists across updates

### P2-11: Electron auto-update for daemon
**File:** `electron/main.ts`
**Problem:** When the app updates, the daemon binary updates too. Need to handle migration gracefully.

**Fix:**
1. On daemon startup: run DB migrations (already happens in `db/index.ts`)
2. Add version check: daemon logs its version on startup, Electron main process reads it and compares to expected version
3. If mismatch: kill old daemon, spawn new one

---

## Priority Order

| Sprint | Tasks | Impact | Effort |
|--------|-------|--------|--------|
| Sprint 1 | P2-01, P2-02, P2-03 | High (visual polish, first impression) | Low-Medium |
| Sprint 2 | P2-04, P2-05 | High (onboarding, new user experience) | Medium |
| Sprint 3 | P2-06, P2-07 | High (core workflow visibility) | Medium-High |
| Sprint 4 | P2-08, P2-09 | Medium (reliability, DX) | Medium |
| Sprint 5 | P2-10, P2-11 | High (shipping Electron) | High |

**Recommendation:** Sprint 1 → Sprint 2 → Sprint 3 → Sprint 5 → Sprint 4.
Do visual polish and onboarding first (biggest user-facing impact), then live output (core feature), then Electron (ship path). Daemon reliability last since it's mainly a dev experience issue.

---

## File Reference

| Task | Files | Est. Lines |
|------|-------|-----------|
| P2-01 | 8 screen/dialog files | ~50 replacements |
| P2-02 | workspace-layout.tsx | ~40 lines changed |
| P2-03 | N/A (API calls only) | 0 |
| P2-04 | create-project-dialog.tsx, projects-screen.tsx | ~80 lines |
| P2-05 | projects-screen.tsx | ~30 lines |
| P2-06 | runs-console-screen.tsx, use-workspace-sse.ts, codex.ts | ~100 lines |
| P2-07 | runs-console-screen.tsx | ~150 lines |
| P2-08 | use-workspace-sse.ts, workspace-layout.tsx, vite.config.ts | ~60 lines |
| P2-09 | vite.config.ts | ~30 lines |
| P2-10 | electron/main.ts, electron-builder.config.cjs, workspace-daemon/package.json | ~80 lines |
| P2-11 | electron/main.ts, workspace-daemon/src/server.ts | ~40 lines |
