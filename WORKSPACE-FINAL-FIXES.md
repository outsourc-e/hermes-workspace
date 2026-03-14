# Workspace Final Fixes — Auto-Wire Pipeline

_Branch: `feat/ux-polish-v3-handshake` — 208 commits ahead_
_tsc: clean_

## Context
E2E test shows the full pipeline works (dispatch → codex → checkpoint → notification) but has 3 gaps:
1. Decompose with only `project_id` doesn't create phase/mission/tasks — just returns JSON
2. The create-project auto-decompose flow in the UI calls decompose but doesn't wire up the hierarchy
3. Checkpoint shows "No changes detected" when codex completes but doesn't modify files

---

## Task 1: Auto-Create Full Hierarchy on Decompose with project_id

**Problem:** `POST /api/workspace/decompose` with `project_id` (no `mission_id`) returns tasks as JSON but doesn't persist them. The UI then shows a review dialog but when you "launch" you need to manually create phase → mission → tasks.

**File:** `workspace-daemon/src/routes/decompose.ts`

**Fix:** When `project_id` is provided but `mission_id` is NOT, auto-create the full hierarchy:

In the `router.post("/", ...)` handler, after the decompose call succeeds and we have tasks, add:

```ts
// If project_id provided but no mission_id, auto-create the full hierarchy
if (project_id && !mission_id && result.tasks.length > 0) {
  // Create a phase
  const phase = tracker.createPhase({
    project_id,
    name: 'Implementation',
    sort_order: 0,
  });

  // Create a mission
  const mission = tracker.createMission({
    phase_id: phase.id,
    name: goal.trim().slice(0, 100),
    spec: goal,
  });

  // Create tasks under the mission
  await createTasksForMission(tracker, mission.id, result.tasks);

  // Return the created IDs so the UI can navigate
  res.json({
    tasks: result.tasks,
    phase_id: phase.id,
    mission_id: mission.id,
    auto_created: true,
    ...(result.parsed ? {} : { raw_response: result.rawResponse }),
  });
  return;
}
```

Make sure `tracker.createPhase` and `tracker.createMission` exist. Check `tracker.ts` for these methods. If they don't exist, check how the phase and mission POST routes create them and replicate that logic.

**Verification:** `POST /decompose` with `project_id` → response includes `mission_id` and `phase_id` → tasks exist in DB

**Commit:** `feat(decompose): auto-create phase/mission/tasks hierarchy (FINAL-1)`

---

## Task 2: Auto-Start Mission After Decompose

**Problem:** After creating the hierarchy, the mission sits in `pending` status. The orchestrator only dispatches tasks from `running` missions. Need to auto-start the mission so tasks begin immediately.

**File:** `workspace-daemon/src/routes/decompose.ts`

**Fix:** After creating the mission and tasks in Task 1's code, start the mission:

```ts
// Auto-start the mission
tracker.setMissionStatus(mission.id, 'running');
```

Check if `tracker.setMissionStatus` exists. If not, look at how `POST /api/workspace/missions/:id/start` sets the status and replicate it. It likely does something like:
```ts
tracker.updateMission(missionId, { status: 'running' });
```

Find the mission start route in `workspace-daemon/src/routes/missions.ts` and see what it does. It may also need to set parent phase status.

**Verification:** After decompose, mission status is `running` and orchestrator starts dispatching tasks within one poll interval (5s)

**Commit:** `feat(decompose): auto-start mission after hierarchy creation (FINAL-2)`

---

## Task 3: Improve Checkpoint Diff Detection

**Problem:** Checkpoint builder runs `git diff` and `git diff --cached` on the worktree. If codex committed its changes (as instructed by WORKFLOW.md), the working tree is clean and `git diff` returns nothing. The checkpoint builder needs to diff against the branch point, not the working tree.

**File:** `workspace-daemon/src/checkpoint-builder.ts`

**Fix:** Read the file first. Find where the diff is generated. The checkpoint should compare the worktree branch HEAD against the base branch (the branch the worktree was created from).

The fix: instead of `git diff` (working tree vs index), use `git diff` against the merge base:

```ts
// Find the merge base (where the worktree branched from)
const mergeBase = execSync('git merge-base HEAD main', { cwd: workspacePath, encoding: 'utf8' }).trim();
// Or if we know the base branch:
// const mergeBase = execSync('git merge-base HEAD origin/feat/ux-polish-v3-handshake', { cwd: workspacePath, encoding: 'utf8' }).trim();

// Diff from merge base to HEAD — this captures committed changes
const diff = execSync(`git diff ${mergeBase} HEAD`, { cwd: workspacePath, encoding: 'utf8' });
const diffStat = execSync(`git diff --stat ${mergeBase} HEAD`, { cwd: workspacePath, encoding: 'utf8' });
```

But we need to know the base branch. Check `workspace.ts` / `WorkspaceManager` to see what branch name the worktree is created from. The task branch is usually `task-<runId>` created from the project's current branch.

Alternative simpler approach: check if there are ANY commits on the task branch that aren't on the parent branch:

```ts
// Get commits unique to this task branch
const taskCommits = execSync('git log --oneline HEAD --not --remotes', { cwd: workspacePath, encoding: 'utf8' }).trim();
```

Or even simpler — check if HEAD differs from the first parent:

```ts
// Diff the task branch commit(s) against the branch start
const parentBranch = execSync('git rev-parse HEAD~1', { cwd: workspacePath, encoding: 'utf8' }).trim();
const diff = execSync(`git diff ${parentBranch} HEAD`, { cwd: workspacePath, encoding: 'utf8' });
```

Read `checkpoint-builder.ts` fully, understand how `raw_diff` is currently generated, and fix it to capture committed changes, not just uncommitted ones.

**Verification:** Codex commits a file → checkpoint shows the diff → "No changes detected" never appears when codex actually committed something

**Commit:** `fix(checkpoint): detect committed changes in worktree branch (FINAL-3)`

---

## Execution Order
1. Task 1 (auto-create hierarchy) — enables one-click project→tasks
2. Task 2 (auto-start mission) — makes tasks run immediately
3. Task 3 (checkpoint diff) — shows actual changes in review

## Rules
- Read EVERY file before editing. Especially tracker.ts, missions.ts routes, checkpoint-builder.ts
- Run `npx tsc --noEmit` after each task
- Commit after each task
- Do NOT change any UI files
- Do NOT add new dependencies
- Check that tracker methods exist before calling them — if they don't, add them to tracker.ts
