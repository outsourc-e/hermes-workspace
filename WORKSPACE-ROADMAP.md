# ClawSuite Workspace — Full Architecture Roadmap
_Written: 2026-03-10 6:45pm EST by Aurora (Opus audit)_
_Branch: `feat/ux-polish-v3-handshake`_

---

## Reference Layout (Projects = gold standard)

Every tab screen must use this exact outer structure:
```tsx
<main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-900 md:px-6 md:pt-8">
  <section className="mx-auto w-full max-w-[1480px] space-y-5">
    {/* content */}
  </section>
</main>
```

Reference header card pattern:
```tsx
<header className="flex flex-col gap-4 rounded-xl border border-primary-200 bg-primary-50/80 px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
  <div className="flex items-start gap-3">
    <div className="flex size-11 items-center justify-center rounded-xl border border-accent-500/30 bg-accent-500/10 text-accent-400">
      <Icon />
    </div>
    <div>
      <h1 className="text-base font-semibold text-primary-900">Title</h1>
      <p className="mt-1 text-sm text-primary-500">Description</p>
    </div>
  </div>
  {/* action buttons */}
</header>
```

---

## Phase 1: Layout Uniformity (Visual Parity)

### 1.1 — Standardize wrapper pattern

| File | Current | Change |
|------|---------|--------|
| `src/screens/review/review-queue-screen.tsx` | `max-w-7xl` (1280px) | → `max-w-[1480px]` |
| `src/screens/runs/runs-console-screen.tsx` | `max-w-7xl` | → `max-w-[1480px]` |
| `src/screens/teams/teams-screen.tsx` | `max-w-[1400px]` | → `max-w-[1480px]` |
| `src/screens/skills/workspace-skills-screen.tsx` | `<div>` + `max-w-[1600px]` + different padding | → `<main>` wrapper + `max-w-[1480px]` |
| `src/screens/agents/agents-screen.tsx` | Sidebar layout, no outer `<main>` | → Full redesign (see 1.2) |

### 1.2 — Agents: Drop sidebar, redesign as single-column

New layout:
```
┌─────────────────────────────────────────────┐
│ Header card: "Agents" icon + title + Register│
├─────────────────────────────────────────────┤
│ Agent cards (horizontal grid, 3-4 cols)     │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│ │Codex │ │Claude│ │Ollama│ │ + Add│        │
│ └──────┘ └──────┘ └──────┘ └──────┘       │
├─────────────────────────────────────────────┤
│ Selected agent detail (tabs below cards)    │
│ Profile | Model & Limits | Prompt | Runs    │
└─────────────────────────────────────────────┘
```

- Agent selector: horizontal card row (`grid sm:grid-cols-2 lg:grid-cols-4`), selected card gets accent border
- Each card: avatar + name + role + status dot + model — compact, clickable
- Detail section below: keep existing tabbed content (Profile, Model & Limits, System Prompt, Skills, Runs)
- Matches Projects' pattern: header → content grid → detail section
- Remove `<aside>` entirely
- Use `<main>` wrapper with `max-w-[1480px]` like all other tabs
- Keep all existing logic/queries/mutations — only restructure the JSX layout

### 1.3 — Skills: Fix dark remnants

In `src/screens/skills/workspace-skills-screen.tsx`, these classes need light-theme conversion:

| Element | Dark class | Light replacement |
|---------|-----------|-------------------|
| Memory file buttons | `bg-primary-950/50 border-primary-800 text-primary-100` | `bg-white border-primary-200 text-primary-900` |
| Memory file active | `border-accent-500/40 bg-accent-500/5` | keep (already works) |
| Memory file icon | `border-primary-800 bg-primary-900 text-primary-300` | `border-primary-200 bg-primary-50 text-primary-500` |
| File name text | `text-primary-100` | `text-primary-900` |
| File path text | `text-primary-400` (fine in both) | keep |
| Retention rows | `bg-primary-900/60 border-primary-800 text-primary-300/100` | `bg-primary-50 border-primary-200 text-primary-600/900` |
| Empty memory section | `border-primary-700 bg-primary-900/40 text-primary-400` | `border-primary-200 bg-primary-50/70 text-primary-500` |
| Error state | `border-red-500/30 bg-red-500/10 text-red-200` | `border-red-200 bg-red-50 text-red-600` |

Also wrap in standard `<main>` pattern (see 1.1).

### 1.4 — Header pattern standardization

| Tab | Has header card? | Fix |
|-----|-----------------|-----|
| Projects | ✅ | Reference |
| Review Queue | ✅ | Already matches |
| Runs | ✅ | Already matches |
| Agents | ❌ | Add header card with robot icon |
| Skills | ❌ (bare h1 + p) | Wrap in header card with sparkles icon |
| Teams | ⚠️ Different style | Align to pattern (add icon, adjust padding) |

---

## Phase 2: Theme Consistency

### 2.1 — Teams approval tier colors
In `src/screens/teams/teams-screen.tsx`, the `APPROVAL_TIERS` constant:
- `text-green-300` → `text-green-700`, `bg-green-400/10` → `bg-green-50`, `border-green-400/25` → `border-green-200`
- `text-amber-300` → `text-amber-700`, `bg-amber-400/10` → `bg-amber-50`, `border-amber-400/25` → `border-amber-200`
- `text-red-300` → `text-red-700`, `bg-red-400/10` → `bg-red-50`, `border-red-400/25` → `border-red-200`

### 2.2 — Dialogs stay dark (NO ACTION)
Dark modal dialogs are intentional — they float above the page and dark provides contrast. Skip.

---

## Phase 3: Real Data Wiring

### 3.1 — Skills API endpoint
Create `server/routes/workspace-skills.ts`:
- `GET /api/workspace/skills` — reads `~/.openclaw/workspace/skills/` directory
- For each subdirectory with a `SKILL.md`, parse frontmatter for name/description/category
- Returns `{ skills: SkillItem[] }`
- Wire into `workspace-skills-screen.tsx` to replace hardcoded `SKILLS` array

### 3.2 — Teams DB init
In `workspace-daemon/src/db/schema.ts`:
- On init, INSERT default teams (Admin, Dev, Reviewer) if `teams` table is empty
- `GET /api/workspace/teams` should return from DB, not empty array
- Add CRUD endpoints: POST/PUT/DELETE for teams and members

### 3.3 — Audit event inserts
In daemon event handlers, add `type: 'audit'` events when:
- Checkpoint approved/rejected
- Task run starts/completes/fails
- Agent registered/removed
- Team modified

---

## Phase 4: Framework Logic Gaps

### 4.1 — Run duration fix (P0)
File: `workspace-daemon/src/orchestrator/agent-runner.ts`
- On dispatch: `UPDATE task_runs SET started_at = datetime('now') WHERE id = ?`
- On complete: `UPDATE task_runs SET completed_at = datetime('now'), status = ? WHERE id = ?`

### 4.2 — Agent dispatch ("Test Run" button)
- Wire "Test Run" button → POST `/api/workspace/task-runs` with `{ agent_id, task_name: "Test run" }`
- Daemon creates run, dispatches to agent's adapter
- Navigate to Runs tab with new run selected

### 4.3 — Agent CRUD (delete/deactivate)
- "Deactivate" toggle → `PATCH /api/workspace/agents/:id { status: 'offline' }`
- "Delete" button (confirm) → `DELETE /api/workspace/agents/:id`

### 4.4 — Review Queue keyboard shortcuts
File: `src/screens/review/review-queue-screen.tsx`
- `a` → approve selected checkpoint
- `r` → reject selected checkpoint
- `j`/`k` → navigate up/down
- `Enter` → open detail

### 4.5 — Re-run failed tasks
- Add "Retry" button on failed runs in `runs-console-screen.tsx`
- POST `/api/workspace/task-runs/:id/retry`
- Daemon clones run with `attempt + 1`, resets to `pending`

---

## Phase 5: Worktree + Daemon Infrastructure

### 5.1 — Worktree commit bug (P0 blocker)
File: `workspace-daemon/src/git/workspace-manager.ts`
- Always create real git worktree: `git worktree add ${path} -b task-${runId} ${baseBranch}`
- If creation fails, THROW — don't fall back to empty dir
- Update `workspace_path` in DB immediately after creation
- Verify `.git` exists in worktree before returning

### 5.2 — Daemon autostart
- Electron: IPC handler `workspace-daemon:start` in `electron/main.js`, spawn on app ready
- Dev: Vite plugin that spawns daemon on dev server start
- Both check if port 3099 is already occupied

### 5.3 — Checkpoint verify badge
- After Codex completes, daemon calls `POST /verify-tsc` with worktree path
- Store result in checkpoint: `{ tsc: { status: 'passed'|'failed', output: string } }`
- Show green/red badge in Review Queue checkpoint cards

---

## Codex Task Decomposition

### Parallel-safe groups (UI only, no file overlap):

**Group A (parallel, 3 tasks):**
- `P1-WRAP`: review-queue, runs-console, teams wrapper `max-w` fix (class-only, 3 files)
- `P1-SKILLS-DARK`: workspace-skills-screen dark→light + wrapper fix (1 file)
- `P2-TEAMS-THEME`: teams-screen tier colors (1 file, class-only)

**Group B (after Group A):**
- `P1-AGENTS`: agents-screen.tsx full redesign — drop sidebar, single-column layout (1 file)

**Group C (after Group B, since headers touch agents/skills/teams):**
- `P1-HEADERS`: Add header cards to agents, skills, teams (3 files)

**Group D (standalone):**
- `P4-KEYBOARD`: review-queue-screen keyboard shortcuts (1 file)

### Daemon tasks (sequential):
1. `P4-DURATION`: agent-runner.ts — started_at/completed_at writes
2. `P5-WORKTREE`: workspace-manager.ts — git worktree fix
3. `P3-SKILLS-API`: new server route — read skills directory
4. `P3-TEAMS-DB`: db/schema.ts + init — seed teams table

---

## Key Files Reference

```
src/screens/workspace/workspace-layout.tsx         — tab nav, renders all sub-screens
src/screens/projects/projects-screen.tsx           — REFERENCE layout (gold standard)
src/screens/review/review-queue-screen.tsx         — review queue
src/screens/runs/runs-console-screen.tsx           — runs console
src/screens/agents/agents-screen.tsx               — agents (needs redesign)
src/screens/skills/workspace-skills-screen.tsx     — skills & memory
src/screens/teams/teams-screen.tsx                 — teams & roles
workspace-daemon/src/orchestrator/agent-runner.ts  — run dispatch logic
workspace-daemon/src/git/workspace-manager.ts      — worktree management
workspace-daemon/src/db/schema.ts                  — daemon DB schema
```

## Dev Environment
- Dev server: `pnpm dev` in clawsuite dir → `http://localhost:3000`
- Workspace daemon: `cd workspace-daemon && PORT=3099 npm start` (manual)
- Branch: `feat/ux-polish-v3-handshake`
- tsc must be clean after every change
