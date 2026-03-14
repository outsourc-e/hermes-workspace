# Workspace UX Polish — Enterprise Feel

_Branch: `feat/ux-polish-v3-handshake`_
_tsc: clean_

## Feedback from live testing
1. Path field is manual text — needs browse or recent paths
2. "Saving..." freezes for 30-60s during decompose — no progress feedback
3. Project detail: spec takes half viewport, running state buried below fold
4. After checkpoint approve — no feedback on what happened
5. No clear pipeline/step visualization

---

## Task 1: Path Input — Recent Paths Dropdown + Browse Button

**File:** `src/screens/projects/create-project-dialog.tsx`

**Changes:**
1. Replace the plain text input for PATH with a combo input:
   - Text input stays (user can still type)
   - Add a "Browse" button next to it. Since we can't open a native file picker in web, make it call `GET /api/workspace/recent-paths` to get a dropdown of previously-used project paths
   - Add a dropdown that shows when the input is focused, listing recent paths
   
2. Add the backend route. In `workspace-daemon/src/server.ts` (or create a new route file):
   ```ts
   app.get("/api/workspace/recent-paths", (_req, res) => {
     const projects = tracker.listProjects();
     const paths = [...new Set(projects.map(p => p.path).filter(Boolean))];
     // Also add common workspace paths
     const suggestions = [
       ...paths,
       process.cwd(),
     ].filter(Boolean);
     res.json({ paths: [...new Set(suggestions)] });
   });
   ```

3. Style the dropdown to appear below the input, matching the existing design system (bg-white, border-primary-200, rounded-lg, shadow-sm)

**Commit:** `feat(workspace): path input with recent paths dropdown (UX-1)`

---

## Task 2: Decompose Progress Indicator

**File:** `src/screens/projects/create-project-dialog.tsx`

**Changes:**
1. When "Auto-create tasks with AI" is checked and user clicks Save:
   - Change button text from "Saving..." to show a progress message:
     - First: "Creating project..." (during POST /projects)
     - Then: "Decomposing tasks with AI..." (during POST /decompose) with a spinning indicator
     - Then: "Starting mission..." (brief)
   - Add a small animated progress bar or shimmer below the button
   
2. The dialog should NOT close until decompose finishes. Currently it seems to close/freeze. Keep it open with the progress text visible.

3. If decompose takes >10 seconds, add helper text: "AI is analyzing your spec and creating tasks. This usually takes 30-60 seconds."

4. On success: show a brief "✅ Project created with N tasks" toast, THEN close the dialog and navigate to the project detail

5. On error: show the error in the dialog, don't close it, let user retry

**Commit:** `feat(workspace): decompose progress indicator in create dialog (UX-2)`

---

## Task 3: Reorganize Project Detail — Status First, Spec Collapsed

**File:** `src/screens/projects/project-detail-view.tsx`

**Changes:**
The current layout is:
1. Header (name, status, path)
2. Spec editor (huge, half the viewport)
3. KPI cards (Open Checkpoints, Next Up, Agent Squad)
4. Phases/Missions/Tasks

Reorganize to:
1. Header (name, status, path) — keep as-is but more compact
2. **Pipeline Status Bar** — new component, horizontal, shows: `Tasks: 3 total | 1 running | 1 complete | 1 queued` with colored dots/segments
3. KPI cards row (Open Checkpoints, Next Up, Agent Squad) — move UP, right below header
4. Phases/Missions/Tasks — the main content, full width
5. **Spec collapsed** — move the "Project Spec / PRD" section into a collapsible accordion, DEFAULT COLLAPSED. Show first 2 lines as preview. Click to expand.

Implementation:
- The spec section (`Project Spec / PRD`) already has a chevron. Make it collapsed by default: the initial state of the accordion should be `closed`
- Move the 3 KPI cards (`Open Checkpoints`, `Next Up`, `Agent Squad`) above the spec accordion
- Add a pipeline status bar between header and KPI cards:
  ```tsx
  <div className="flex items-center gap-3 rounded-lg border border-primary-200 bg-white px-4 py-3">
    <span className="text-sm font-medium text-primary-900">Pipeline</span>
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1 text-sm">
        <span className="h-2 w-2 rounded-full bg-green-500" /> {completedCount} done
      </span>
      <span className="inline-flex items-center gap-1 text-sm">
        <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" /> {runningCount} running
      </span>
      <span className="inline-flex items-center gap-1 text-sm">
        <span className="h-2 w-2 rounded-full bg-gray-300" /> {pendingCount} queued
      </span>
    </div>
  </div>
  ```
- Get counts from the existing data (tasks array from project detail query)

**Commit:** `feat(workspace): reorganize project detail — status first, spec collapsed (UX-3)`

---

## Task 4: Checkpoint Approval Feedback

**Files:** 
- `src/screens/review/review-queue-screen.tsx`
- `src/screens/projects/checkpoint-detail-modal.tsx` (or wherever approve button is)

**Changes:**
1. After clicking Approve on a checkpoint, show clear feedback:
   - Toast: "✅ Checkpoint approved — changes merged to [branch name]"
   - If merge succeeds: show the commit hash in the toast
   - If merge fails: show error toast with the reason
   
2. After approval, the checkpoint card in Review Queue should update immediately:
   - Status badge changes from "Pending" to "Approved" (green)
   - Show "Merged at [commit hash]" below the status
   - Card should gray out slightly or move to a "Completed" section

3. After all checkpoints for a mission are approved, show:
   - Toast: "🎉 Mission complete — all tasks approved"
   - Mission status in project detail should update to "Completed"

4. Check: does the approve mutation return the commit hash? Look at the checkpoint approve route (`workspace-daemon/src/routes/checkpoints.ts`). If it doesn't return useful data, add it:
   ```ts
   res.json({ ok: true, commit_hash: result.commitHash, status: 'approved' });
   ```

**Commit:** `feat(workspace): checkpoint approval feedback + merge confirmation (UX-4)`

---

## Task 5: Active Run Card — Show Live Output Inline

**File:** `src/screens/projects/project-detail-view.tsx`

**Changes:**
1. When a task is in `running` status, the task card in the mission section should show a mini live output preview — last 3 lines of agent output, auto-updating

2. Don't require the user to click "Open Console" to see what's happening. Show a compact terminal preview right in the task card:
   ```tsx
   {task.status === 'running' && (
     <div className="mt-2 rounded bg-gray-900 px-3 py-2 font-mono text-xs text-green-400 max-h-20 overflow-hidden">
       {lastOutputLines.map((line, i) => (
         <div key={i} className="truncate">{line}</div>
       ))}
     </div>
   )}
   ```

3. The output comes from SSE events — use the existing `useWorkspaceSse` hook to get `task_run.output` events for the current running task

4. Add a "View Full Output" link that navigates to the Runs tab / console for that task

**Commit:** `feat(workspace): inline live output preview on running tasks (UX-5)`

---

## Execution Order
1. Task 3 (layout reorganize) — biggest visual impact
2. Task 2 (progress indicator) — fixes the "frozen" feeling
3. Task 4 (approval feedback) — closes the loop
4. Task 5 (inline output) — reduces scroll/click to see status
5. Task 1 (path dropdown) — nice-to-have polish

## Rules
- Read ALL files before editing
- `npx tsc --noEmit` after each task
- Commit after each task
- Use existing design system: bg-surface, text-primary-900, border-primary-200, accent-500
- Use existing toast system (check imports in other files)
- Do NOT add new npm dependencies
- Do NOT change workspace-daemon files except Task 1 (recent-paths endpoint) and Task 4 (approve response)
