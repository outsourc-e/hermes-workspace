# ClawSuite Workspace — System Spec V2
_Authored by Aurora (Sonnet 4.6), 2026-03-10, post E2E audit_

---

## Executive Summary

The workspace daemon works. The E2E flow (project → mission → task → Codex run → checkpoint → approve) completed successfully in ~85 seconds with real Codex output. The system is ~60% of the way to a polished product. The remaining 40% is: live output visibility, proper agent routing, missing CRUD routes, and SSE wiring in the frontend.

---

## 1. Gap Analysis

### P0 — Blockers (system unusable without these)

#### P0.1 — PATCH/DELETE /api/workspace/agents missing
- **Root cause:** UI buttons wired (commit `e43761e`) but daemon routes don't exist
- **Symptom:** Deactivate/Delete buttons in Agents screen → 404
- **Fix:** Add `router.patch('/:id')` and `router.delete('/:id')` to `workspace-daemon/src/routes/agents.ts`
- **Files:** `workspace-daemon/src/routes/agents.ts`

#### P0.2 — Test Run button has no daemon support
- **Root cause:** `POST /api/workspace/task-runs` requires `task_id` from an existing mission. Test Run sends `agent_id` + `task_name` — no mission context.
- **Symptom:** "Test run dispatched" toast but nothing actually runs
- **Fix:** Add a `POST /api/workspace/task-runs/adhoc` endpoint that creates a throwaway mission + task + run in one shot
- **Files:** `workspace-daemon/src/routes/task-runs.ts`, new `src/routes/adhoc-runs.ts`

#### P0.3 — SSE not consumed in workspace UI
- **Root cause:** Daemon emits `task_run.started`, `task_run.updated`, `checkpoint.created` etc. via SSE but workspace screens use polling (`useQuery` with `refetchInterval`). No live updates.
- **Symptom:** Run console doesn't update until manual refresh. No live output visible.
- **Fix:** Add `useWorkspaceSse()` hook that subscribes to `GET /api/events` (SSE stream) and invalidates React Query cache on matching events
- **Files:** New `src/hooks/use-workspace-sse.ts`, wire into `workspace-layout.tsx`

#### P0.4 — Live run output not streamed
- **Root cause:** Codex output goes to `run_events` table but UI has no way to show it in real-time. Runs console shows completed runs only.
- **Symptom:** "Black box" — you start a mission and wait blindly
- **Fix:** `GET /api/task-runs/:id/events` already exists. Add live streaming panel in runs console that polls or subscribes to that endpoint while run is active.
- **Files:** `src/screens/runs/runs-console-screen.tsx`

---

### P1 — High Priority (degrades core UX)

#### P1.1 — Agent routing is random
- **Root cause:** `orchestrator.ts` picks the first online agent with any `adapter_type`. No task-type matching.
- **Symptom:** All tasks go to `codex-dep-test` regardless of what the task needs
- **Fix:** Add `suggested_agent_type` field to tasks (already in decompose output). Match tasks to agents by: (1) explicit `agent_id` on task, (2) `suggested_agent_type` → find agent with matching `adapter_type`, (3) fallback to first available
- **Files:** `workspace-daemon/src/orchestrator.ts`, `workspace-daemon/src/tracker.ts`

#### P1.2 — Decomposer CLI dependency
- **Root cause:** `decomposer.ts` shells out to `claude --print` CLI. Requires Claude Code installed.
- **Symptom:** Decompose works on Eric's Mac, breaks anywhere else (cloud, Electron on fresh machine)
- **Fix:** Replace CLI spawn with direct Anthropic API call using `ANTHROPIC_API_KEY` env var, fallback to CLI if key missing
- **Files:** `workspace-daemon/src/decomposer.ts`

#### P1.3 — Checkpoint merge fails if worktree cleaned up
- **Root cause:** `approve-and-commit` and `approve-and-merge` routes try to operate on the worktree path. Worktrees are cleaned up after run completes.
- **Symptom:** Approve button in review queue → error "worktree not found"
- **Fix:** On checkpoint creation, copy the diff to `checkpoints.diff` column. Approve flow applies the stored patch instead of re-reading worktree.
- **Files:** `workspace-daemon/src/routes/checkpoints.ts`, `workspace-daemon/src/tracker.ts`

#### P1.4 — Teams approval tiers hardcoded in frontend
- **Root cause:** `teams-screen.tsx` has `APPROVAL_TIERS` array hardcoded
- **Symptom:** Teams screen always shows same 3 tiers regardless of DB
- **Fix:** Store tiers in `teams` table as JSON column `approval_config`. Fetch from `GET /api/workspace/teams`
- **Files:** `src/screens/teams/teams-screen.tsx`, `workspace-daemon/src/routes/teams.ts`

#### P1.5 — Daemon autostart has no UI feedback
- **Root cause:** Electron spawns daemon but no IPC back to renderer on success/failure
- **Symptom:** App opens, may or may not have daemon running, no indicator
- **Fix:** `workspace:status` IPC polls `/api/projects` until 200, sets global state. Workspace tab shows "Daemon offline" banner until connected.
- **Files:** `electron/main.ts`, `src/screens/workspace/workspace-layout.tsx`

---

### P2 — Polish (product quality)

#### P2.1 — Skills detail panel is useless
- **Root cause:** Skills screen shows `skill.path` as the "detail" — just a filesystem path
- **Fix:** Fetch and render full `SKILL.md` content in the detail panel (already have the path)
- **Files:** `src/screens/skills/workspace-skills-screen.tsx`, `workspace-daemon/src/routes/skills.ts` (add `GET /:id/content`)

#### P2.2 — Run duration shows wrong for old runs
- **Root cause:** `workspace_path: null` on runs before fix `d421c99`. Not a bug now but historical data is dirty.
- **Fix:** Migration script to backfill `workspace_path` from git worktree pattern. Low priority.

#### P2.3 — No project creation flow in UI
- **Root cause:** Projects screen shows projects from DB but no "New Project" button that creates one with a real local path
- **Fix:** Add project creation modal: name + path picker + spec textarea → `POST /api/projects`
- **Files:** `src/screens/projects/projects-screen.tsx`

#### P2.4 — No mission/task creation in UI
- **Root cause:** You can see projects but can't start a mission from the UI
- **Fix:** "New Mission" button on project detail → decompose modal → creates phase + mission + tasks → start button
- **Files:** `src/screens/projects/projects-screen.tsx`

---

## 2. Named Agent Architecture

### Design Principles
1. **Named agents are personas, not just model configs** — each has a system prompt that includes codebase conventions, file ownership, and verification steps
2. **Task routing by keyword** — decomposer suggests `agent_type`; orchestrator maps type to specific named agent
3. **Agents are seeded in DB** — can be edited via UI, not hardcoded in source
4. **System prompts include project context** — injected at runtime from `project.spec` and recent file list

### Agent Roster

#### `aurora-coder` — UI/React specialist
```
adapter_type: codex
model: gpt-5.4
role: frontend

SYSTEM PROMPT:
You are aurora-coder, the frontend implementation agent for ClawSuite.

## Your stack
- React + TanStack Router/Query in clawsuite/src/
- Tailwind CSS with the primary-50..950 scale + accent-* colors
- HugeIcons (@hugeicons/core-free-icons + @hugeicons/react)
- motion/react for animations (NOT framer-motion)
- Components in src/components/ui/ (Button, toast, Switch, etc)

## Design system rules
- Light theme: bg-surface (#f9fafb), text-primary-900, borders border-primary-200
- Dark elements ONLY in chat UI, never in workspace screens
- Standard page wrapper: <main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-900 md:px-6 md:pt-8">
- Standard section: <section className="mx-auto w-full max-w-[1480px] space-y-5">
- Header card: rounded-xl border border-primary-200 bg-primary-50/80 px-5 py-4 shadow-sm

## File ownership
src/screens/workspace/, src/screens/agents/, src/screens/review/,
src/screens/runs/, src/screens/skills/, src/screens/teams/,
src/screens/projects/, src/components/

## Verification
After EVERY change: run npx tsc --noEmit from clawsuite/. Zero errors required before commit.
```

#### `aurora-daemon` — Backend/API specialist
```
adapter_type: codex
model: gpt-5.4
role: backend

SYSTEM PROMPT:
You are aurora-daemon, the backend implementation agent for the workspace daemon.

## Your stack
- Express + better-sqlite3 in clawsuite/workspace-daemon/src/
- Routes in src/routes/, DB in src/db/, types in src/types.ts
- Tracker class (src/tracker.ts) is the source of truth — ALL DB writes go through it
- SSE via emitSse() in tracker — emit on every meaningful state change
- Migrations: add ensureXxxColumn() functions in src/db/index.ts, call in getDatabase()

## Patterns
- Route files export createXxxRouter(tracker) functions
- Always call tracker methods, never raw DB queries from routes
- Input validation before any DB write
- Return { error: string } with appropriate status on failures

## File ownership
workspace-daemon/src/routes/, workspace-daemon/src/tracker.ts,
workspace-daemon/src/db/, workspace-daemon/src/orchestrator.ts,
workspace-daemon/src/adapters/

## Verification
After EVERY change: run npx tsc --noEmit from workspace-daemon/. Zero errors required before commit.
```

#### `aurora-qa` — Reviewer/verifier
```
adapter_type: claude
model: claude-sonnet-4-6
role: reviewer

SYSTEM PROMPT:
You are aurora-qa, the review agent for ClawSuite.

Your job: review git diffs and verify correctness before checkpoints are approved.

## Checklist (apply to every review)
1. TypeScript: does the diff introduce any type errors? Check function signatures, return types.
2. React: are there missing useEffect deps? Infinite render risks? Missing key props?
3. API: do new routes have input validation? Do they return consistent error shapes?
4. DB: do new columns have migrations? Are SQL queries injection-safe (prepared statements)?
5. Design system: do new UI components use the correct color tokens?
6. Regressions: does the change touch shared utilities that could break unrelated screens?

## Output format
Return a JSON object: { "approved": boolean, "issues": string[], "summary": string }
```

#### `aurora-planner` — Decomposition specialist
```
adapter_type: claude
model: claude-sonnet-4-6
role: planner

SYSTEM PROMPT:
You are aurora-planner, the task decomposition agent for ClawSuite.

Given a goal, produce a JSON array of tasks that together implement it.

## Task schema
{ name, description, estimated_minutes, depends_on, suggested_agent_type }
- suggested_agent_type: "codex" for file edits, "claude" for analysis/review, "openclaw" for orchestration

## Rules
- Maximum 8 tasks per decomposition
- Each task must be independently executable
- description must be specific enough for an agent to act without additional context
- depends_on must reference exact task names in the same array
- No task should take > 120 minutes
- Return ONLY the JSON array, no markdown, no explanation
```

### Task Routing Rules

```typescript
// In orchestrator.ts — agent selection priority:
function selectAgent(task: Task, agents: AgentRecord[]): AgentRecord | null {
  // 1. Explicit assignment
  if (task.agent_id) return agents.find(a => a.id === task.agent_id) ?? null

  // 2. Route by name keywords
  const name = task.name.toLowerCase()
  if (/ui|react|screen|component|style|layout|design/.test(name)) {
    return agents.find(a => a.id === 'aurora-coder' && a.status === 'online') ?? null
  }
  if (/api|route|endpoint|db|database|schema|migration/.test(name)) {
    return agents.find(a => a.id === 'aurora-daemon' && a.status === 'online') ?? null
  }
  if (/review|qa|verify|test|check/.test(name)) {
    return agents.find(a => a.id === 'aurora-qa' && a.status === 'online') ?? null
  }

  // 3. Route by suggested_agent_type
  if (task.suggested_agent_type) {
    return agents.find(a => a.adapter_type === task.suggested_agent_type && a.status === 'online') ?? null
  }

  // 4. Fallback: first online codex agent
  return agents.find(a => a.adapter_type === 'codex' && a.status === 'online') ?? null
}
```

---

## 3. Consolidated Agent Invocation Spec

### Problem with current approach
Every time Aurora (main session) needs to do coding work, she spawns `codex --yolo exec 'do X'` from scratch. The agent has no memory of the codebase conventions, no awareness of recent changes, and no systematic verification.

### Solution: Two invocation paths

#### Path A — ClawSuite Workspace (for project work)
Use the daemon. Create a task, assign to named agent, let the orchestrator run it.
- Full audit trail in DB
- Checkpoint + review flow
- SSE updates in UI
- Retries built in

```
POST /api/projects/:id/adhoc-task
{ "name": "Fix X", "description": "...", "agent_id": "aurora-coder" }
→ creates mission + task + starts immediately
→ returns { run_id } for SSE monitoring
```

#### Path B — Aurora direct (for out-of-band/urgent work)
Aurora spawns Codex directly but uses named system prompts from a shared file.

```bash
# Load the right system prompt for the task type
PROMPT=$(cat clawsuite/AGENT-PROMPTS.md | awk '/^## aurora-coder$/,/^## /' | head -50)

codex --yolo exec "CONTEXT: $PROMPT

TASK: Fix the agents screen layout..."
```

### AGENT-PROMPTS.md
Create `clawsuite/AGENT-PROMPTS.md` with canonical system prompts for each agent. Both the daemon (for embedding in agent DB records) and Aurora (for CLI spawns) reference this file.

---

## 4. Development Roadmap

### Sprint 1 — Fix the P0 blockers (do first, enables everything else)

#### 1.1 — Agent CRUD routes (S)
**Files:** `workspace-daemon/src/routes/agents.ts`
**What:** Add `PATCH /:id` (update status/prompt/model) and `DELETE /:id`. Wire through tracker.
**Deps:** None
**Complexity:** S

#### 1.2 — Ad-hoc run endpoint (M)
**Files:** `workspace-daemon/src/routes/task-runs.ts` (or new `adhoc-runs.ts`)
**What:** `POST /api/workspace/task-runs/adhoc` — accepts `{ agent_id, task_name, description, project_id? }`, creates throwaway mission + task, starts immediately, returns `{ run_id, mission_id }`
**Deps:** None
**Complexity:** M

#### 1.3 — SSE hook in frontend (M)
**Files:** New `src/hooks/use-workspace-sse.ts`, wire in `workspace-layout.tsx`
**What:** Subscribe to `/api/events` SSE stream. On `task_run.started|updated|completed`, `checkpoint.created|updated`: call `queryClient.invalidateQueries()` for the right keys.
**Deps:** None
**Complexity:** M

#### 1.4 — Live run output panel (M)
**Files:** `src/screens/runs/runs-console-screen.tsx`
**What:** When a run is `status: running`, show a live output panel that polls `GET /api/task-runs/:id/events` every 2s and streams `run_event.data` content. Auto-scroll. Stop polling on completion.
**Deps:** 1.3 (SSE for run state change detection)
**Complexity:** M

---

### Sprint 2 — Agent architecture (makes the system smart)

#### 2.1 — Seed named agents (S)
**Files:** `workspace-daemon/src/db/index.ts`
**What:** Replace generic seed agents with `aurora-coder`, `aurora-daemon`, `aurora-qa`, `aurora-planner` as described in section 2. Full system prompts, correct adapter_types.
**Deps:** None
**Complexity:** S

#### 2.2 — Task routing by keyword/type (M)
**Files:** `workspace-daemon/src/orchestrator.ts`
**What:** Implement `selectAgent()` function from section 2 routing rules. Replace current first-available logic.
**Deps:** 2.1
**Complexity:** M

#### 2.3 — AGENT-PROMPTS.md + agent prompt sync (S)
**Files:** New `clawsuite/AGENT-PROMPTS.md`, `workspace-daemon/src/db/index.ts`
**What:** Create canonical prompts file. Seed script reads it to populate `system_prompt` columns.
**Deps:** 2.1
**Complexity:** S

#### 2.4 — Decomposer: API fallback (M)
**Files:** `workspace-daemon/src/decomposer.ts`
**What:** Try Anthropic SDK first (`ANTHROPIC_API_KEY`), fallback to CLI, fallback to stub decomposition. Removes CLI hard-dependency.
**Deps:** None
**Complexity:** M

---

### Sprint 3 — Project creation UI (makes it usable without CLI)

#### 3.1 — New Project modal (M)
**Files:** `src/screens/projects/projects-screen.tsx`
**What:** "New Project" button → modal with name, local path (input), spec textarea → `POST /api/projects` → creates git repo at path if it doesn't exist → closes modal, shows new project card
**Deps:** None
**Complexity:** M

#### 3.2 — Mission creation + decompose UI (L)
**Files:** `src/screens/projects/projects-screen.tsx`
**What:** Project card → "New Mission" → decompose modal: enter goal → calls `POST /api/decompose` → shows task list with suggested agents → "Start Mission" confirms → `POST /api/phases` + `/api/missions` + N × `/api/tasks` + `POST /api/missions/:id/start`
**Deps:** 3.1, 2.4 (reliable decompose)
**Complexity:** L

#### 3.3 — Mission detail view (M)
**Files:** `src/screens/projects/projects-screen.tsx`
**What:** Clicking a mission shows its tasks, each task's status, assigned agent, last run. "Retry" button for failed tasks.
**Deps:** 3.2
**Complexity:** M

---

### Sprint 4 — Checkpoint review hardening

#### 4.1 — Store diff in checkpoint row (M)
**Files:** `workspace-daemon/src/tracker.ts`, `workspace-daemon/src/db/schema.sql`
**What:** On checkpoint creation, store full git diff as `checkpoints.raw_diff`. Approve flow uses stored diff instead of live worktree.
**Deps:** None
**Complexity:** M

#### 4.2 — Review queue: end-to-end verify (S)
**Files:** `src/screens/review/review-queue-screen.tsx`
**What:** Test the full approve → merge flow. Verify keyboard shortcuts work. Add visual confirmation of merge success.
**Deps:** 4.1
**Complexity:** S

---

### Sprint 5 — Polish

#### 5.1 — Daemon connection status banner (S)
**Files:** `src/screens/workspace/workspace-layout.tsx`
**What:** Poll `/api/projects` on mount. If 200 → green "Daemon connected" pill. If fail → yellow "Daemon offline — starting..." → retry loop.
**Deps:** None
**Complexity:** S

#### 5.2 — Skills content viewer (S)
**Files:** `src/screens/skills/workspace-skills-screen.tsx`, `workspace-daemon/src/routes/skills.ts`
**What:** Add `GET /api/workspace/skills/:id/content` returning full `SKILL.md` markdown. Render in detail panel with basic markdown → HTML.
**Deps:** None
**Complexity:** S

#### 5.3 — Teams approval tiers from DB (M)
**Files:** `src/screens/teams/teams-screen.tsx`, `workspace-daemon/src/routes/teams.ts`
**What:** Add `approval_config` JSON column to teams. UI fetches and renders dynamically.
**Deps:** None
**Complexity:** M

---

## Priority Order for Codex

If spawning Codex to carry out these tasks, do them in this order:

1. **1.1** — Agent CRUD routes (30 min) — unblocks UI buttons
2. **2.1** — Seed named agents (20 min) — sets up proper agent roster  
3. **1.2** — Ad-hoc run endpoint (45 min) — makes Test Run actually work
4. **2.2** — Task routing (30 min) — makes agent assignment smart
5. **2.4** — Decomposer API fallback (30 min) — removes CLI dependency
6. **1.3** — SSE hook (45 min) — live updates everywhere
7. **1.4** — Live run output (45 min) — visibility into running tasks
8. **3.1** — New Project modal (45 min) — no more CLI to create projects
9. **3.2** — Mission creation + decompose UI (2 hrs) — full UI flow
10. **4.1** — Store diff in checkpoint (30 min) — fix approve-after-cleanup bug

**Total estimated: ~8-9 hours of Codex work, parallelizable into 2-3 sessions**

Items 1, 2, 4, 5 can run in parallel (different files).
Items 3, 6, 7 can run in parallel.
Items 8, 9, 10 can run in parallel.

---

## Notes on Implementation

### SSE in frontend (1.3) — key gotcha
TanStack Query + SSE: use `EventSource` in a `useEffect`, not in `queryFn`. The SSE stream should only invalidate cache — it shouldn't replace the query data directly (race conditions).

```typescript
// use-workspace-sse.ts pattern
useEffect(() => {
  const es = new EventSource('/api/events')
  es.addEventListener('task_run.updated', () => {
    queryClient.invalidateQueries({ queryKey: ['workspace', 'task-runs'] })
  })
  es.addEventListener('checkpoint.created', () => {
    queryClient.invalidateQueries({ queryKey: ['workspace', 'checkpoints'] })
  })
  return () => es.close()
}, [queryClient])
```

### Ad-hoc runs (1.2) — schema consideration
Don't pollute the real project/mission tree with throwaway test runs. Create a `__adhoc__` project per workspace on first use. All ad-hoc runs go under it. Keeps the real project list clean.

### Agent routing (2.2) — don't over-engineer
Start with keyword matching. A full ML-based router is overkill. The keyword list covers 90% of cases and is easy to edit.

### Decomposer API (2.4) — use `@anthropic-ai/sdk`
Already in package.json likely. `new Anthropic().messages.create(...)` with the existing system prompt. 20 lines of code, removes a shell exec.
