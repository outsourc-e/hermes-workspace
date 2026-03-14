# Workspace P0/P1 Fixes Spec

_Branch: `feat/ux-polish-v3-handshake` — 197 commits ahead of origin/main_
_tsc: clean_

---

## Task 1: Fix Vite Daemon Auto-Start Reliability (P0)

**Problem:** Vite's `configureServer` spawns the daemon on first load, but after `POST /api/workspace/daemon/restart` kills and respawns, if that new daemon dies, nothing auto-restarts it again because the `startWorkspaceDaemon()` function only gets called from `configureServer` (runs once).

**File:** `vite.config.ts`

**Fix:**
The `startWorkspaceDaemon()` function already has retry logic with exponential backoff (up to 20 retries). The issue is that after a restart via the REST endpoint, `workspaceDaemonRetryCount` is reset but `workspaceDaemonStarted` may be in an inconsistent state. 

1. In `restartWorkspaceDaemon()`: after `stopWorkspaceDaemon()` completes, explicitly set `workspaceDaemonStarted = false` and `workspaceDaemonStarting = false` before calling `startWorkspaceDaemon()`
2. In `startWorkspaceDaemon()`: at the very beginning, add a guard: if `workspaceDaemonShuttingDown` is true, return immediately (don't restart during Vite shutdown)
3. Make sure the child process `exit` handler calls `startWorkspaceDaemon()` on non-zero exit (it already does via setTimeout, just verify the retry path works after a restart)

**Verification:** 
```bash
# Start vite, wait for daemon
curl http://localhost:3099/health  # should be ok
# Kill daemon manually
kill $(lsof -ti:3099)
# Wait 2-5 seconds
curl http://localhost:3099/health  # should recover
# Use restart button
curl -X POST http://localhost:3000/api/workspace/daemon/restart
curl http://localhost:3099/health  # should be ok
```

**Commit:** `fix(workspace): daemon auto-restart reliability (P0-1)`

---

## Task 2: Fix DB Path Consistency (P1)

**Problem:** The daemon uses a relative path `.workspaces/workspace.db` which resolves differently depending on `cwd`. When spawned from Vite (cwd = project root), it works. When spawned manually or from Electron, it may use a different DB.

**Files:** `workspace-daemon/src/db/index.ts` (or wherever DB is initialized), `workspace-daemon/src/server.ts`

**Fix:**
1. In `server.ts`: at the top, resolve the DB path deterministically:
   ```ts
   const DB_DIR = process.env.DB_PATH 
     ? path.dirname(process.env.DB_PATH)
     : path.resolve(__dirname, '..', '.workspaces');
   const DB_FILE = process.env.DB_PATH
     ? process.env.DB_PATH
     : path.join(DB_DIR, 'workspace.db');
   ```
2. Pass `DB_FILE` to wherever the database is initialized (find the `better-sqlite3` or `sql.js` constructor call)
3. Make sure `DB_DIR` is created if it doesn't exist: `mkdirSync(DB_DIR, { recursive: true })`
4. In `vite.config.ts`: when spawning the daemon, pass `DB_PATH` explicitly:
   ```ts
   env: { ...process.env, PORT: workspaceDaemonPort, DB_PATH: resolve('workspace-daemon/.workspaces/workspace.db') }
   ```

**Verification:** Start daemon → create project → restart daemon → project still exists

**Commit:** `fix(workspace): deterministic DB path resolution (P0-2)`

---

## Task 3: Fix Decomposer Fallback (P1)

**Problem:** Decomposer tries Anthropic SDK first (needs ANTHROPIC_API_KEY env var) then falls back to `claude` CLI. The CLI call fails because it passes a very long system prompt inline which often errors. Should use the SDK path reliably.

**File:** `workspace-daemon/src/decomposer.ts`

**Fix:**
1. The Anthropic SDK path already works — the issue is `ANTHROPIC_API_KEY` isn't set in the daemon's env. 
2. In `vite.config.ts`: when spawning the daemon, forward the Anthropic key:
   ```ts
   env: { 
     ...process.env, 
     PORT: workspaceDaemonPort, 
     DB_PATH: resolve('workspace-daemon/.workspaces/workspace.db'),
     // Forward API keys the daemon needs
     ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
   }
   ```
3. Also check `decomposer.ts` — the model is `claude-3-5-haiku-20241022`. Update to `claude-sonnet-4-6` for better decomposition quality. Actually, keep haiku for speed/cost — just make sure the key is forwarded.
4. Add a console.log in the SDK path so we can verify it's being used: `console.log('[decomposer] Using Anthropic SDK')`
5. In the CLI fallback path, add: `console.log('[decomposer] SDK unavailable, falling back to claude CLI')`

**Verification:** Set ANTHROPIC_API_KEY in shell → start daemon → decompose a project → check logs for "Using Anthropic SDK"

**Commit:** `fix(workspace): forward API keys to daemon + decomposer logging (P0-3)`

---

## Task 4: Fix Codex Adapter Command (P1)

**Problem:** The Codex adapter spawns `codex app-server` which starts the JSON-RPC server mode. This is correct. But the default agent's `adapter_config` may not have the right command/args set. Need to verify the seeded agents have correct config.

**Files:** `workspace-daemon/src/db/index.ts` (find where agents are seeded)

**Fix:**
1. Find the agent seed function (search for `aurora-coder`, `aurora-daemon`, `aurora-qa`, `aurora-planner`)
2. Verify each seeded agent has:
   - `adapter_type: 'codex'` (for coder/daemon) or `adapter_type: 'claude'` (for qa)
   - `adapter_config` as JSON string: `'{"command":"codex","args":["app-server"]}'` for codex agents
   - `status: 'online'` (so the orchestrator will select them)
   - `model` set to a valid model (e.g., `null` to use codex default)
3. If agents are seeded with `status: 'idle'` or `'offline'`, the orchestrator's `isOnlineAgent()` check filters them out. Make sure seeded agents default to `'online'`.
4. Check the `isOnlineAgent` function in `orchestrator.ts` — it accepts `'online' | 'idle'`. Both are valid. Make sure seed uses one of those.

**Verification:** Start daemon → `curl http://localhost:3099/api/workspace/agents` → all agents show status online/idle with correct adapter_config

**Commit:** `fix(workspace): verify agent seed config and status (P0-4)`

---

## Task 5: Add Telegram Notifications on Mission Complete (P1)

**Problem:** Missions complete silently. No notification to the user.

**Files:** `workspace-daemon/src/orchestrator.ts`

**Fix:**
1. At the top of `orchestrator.ts`, add a helper to send notifications via OpenClaw:
   ```ts
   function notifyCompletion(taskName: string, projectName: string, status: string): void {
     try {
       execSync(
         `~/.nvm/versions/node/v22.22.0/bin/openclaw system event --text "${status === 'completed' ? '✅' : '❌'} Workspace: ${taskName} (${projectName}) — ${status}" --mode now`,
         { stdio: 'ignore', timeout: 10000 }
       );
     } catch {
       // Non-critical — don't block on notification failure
     }
   }
   ```
   Import `execSync` from `node:child_process` at the top (it's already imported in agent-runner.ts, check if orchestrator has it — if not, add it).

2. In the `dispatchTask` method, after a task completes successfully (where `result.status === "completed"`), call:
   ```ts
   notifyCompletion(task.name, project.name, 'completed');
   ```

3. After a task fails (in the `catch` block and in the `result.status !== "completed"` path), call:
   ```ts
   notifyCompletion(task.name, project.name, 'failed');
   ```

4. Don't notify on pause/stop (user-initiated, they already know).

**Verification:** Run a task → check Telegram for notification

**Commit:** `feat(workspace): notify via OpenClaw on task complete/fail (P0-5)`

---

## Task 6: Fix Checkpoint Merge After Worktree Cleanup (P1)

**Problem:** When worktree is cleaned up after auto-approve, later manual review of the checkpoint can't re-merge because the worktree is gone. The `raw_diff` is stored but the apply may fail.

**File:** `workspace-daemon/src/checkpoint-builder.ts`

**Fix:**
1. Read `checkpoint-builder.ts` and find where `raw_diff` is stored and where approval applies the diff
2. When approving a checkpoint: if the worktree doesn't exist, apply `raw_diff` directly to the project's main working tree using `git apply`:
   ```ts
   // If worktree was cleaned up, apply raw_diff to project root
   if (!existsSync(workspacePath) && rawDiff) {
     execSync(`git apply --check --3way`, { input: rawDiff, cwd: projectPath });
     execSync(`git apply --3way`, { input: rawDiff, cwd: projectPath });
   }
   ```
3. Find the approval route (likely in `workspace-daemon/src/routes/checkpoints.ts`) and make sure it handles the missing-worktree case

**Verification:** Create task → auto-approve → verify worktree cleaned up → manually check checkpoint can still be applied

**Commit:** `fix(workspace): checkpoint merge fallback when worktree is cleaned (P0-6)`

---

## Task 7: Mobile Tab Scroll (P2)

**Problem:** 6 workspace tabs overflow on narrow screens.

**File:** `src/screens/workspace/workspace-layout.tsx`

**Fix:**
1. Find the div wrapping the PRIMARY_TABS `.map()` — it should have `overflow-x-auto` and `flex-wrap`
2. Remove `flex-wrap` (tabs should NOT wrap — they should scroll horizontally)
3. Add `scrollbar-hide` class (or `[&::-webkit-scrollbar]:hidden`) to hide the scrollbar
4. Add `whitespace-nowrap` so tabs stay on one line
5. The container div should be: `className="flex flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden"`

**Verification:** View workspace on a narrow viewport (< 768px) → tabs scroll horizontally, no wrap

**Commit:** `fix(workspace): horizontal tab scroll on mobile (P0-7)`

---

## Execution Order

| # | Task | Priority | Est |
|---|------|----------|-----|
| 1 | Daemon auto-restart reliability | P0 | 15m |
| 2 | DB path consistency | P0 | 20m |  
| 3 | Decomposer API key forwarding | P1 | 10m |
| 4 | Agent seed config verification | P1 | 15m |
| 5 | Telegram notifications | P1 | 15m |
| 6 | Checkpoint merge fallback | P1 | 20m |
| 7 | Mobile tab scroll | P2 | 5m |

**Total: ~1.5 hours Codex time**

## Rules for Codex
1. Read EVERY file mentioned before editing
2. Run `npx tsc --noEmit` after EACH task
3. Commit after each task individually
4. Do NOT change UI styling beyond Task 7
5. Do NOT add new dependencies
6. Do NOT touch files outside listed scope
