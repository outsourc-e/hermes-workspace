# Workspace Sprint 4-5 Spec

_Branch: `feat/ux-polish-v3-handshake` — 192+ commits ahead of origin/main_
_tsc: clean | All Phase 2 Sprints 1-3 done_

---

## Task 1: Restore All Tabs (Revert Overflow Menu)

**Problem:** Skills & Memory and Teams & Roles were moved into a `...` overflow menu. This hides real features and feels like broken navigation.

**File:** `src/screens/workspace/workspace-layout.tsx`

**Changes:**
1. Merge `OVERFLOW_TABS` back into `PRIMARY_TABS`:
   ```ts
   const PRIMARY_TABS: WorkspaceTab[] = ['projects', 'review', 'runs', 'agents', 'skills', 'teams']
   ```
2. Delete the `OVERFLOW_TABS` array (line 92)
3. Delete the `overflowActive` variable (line 255)
4. Delete the entire `<MenuRoot>` block that renders the `...` button (lines ~349-385) — the `MenuRoot`, `MenuTrigger`, `MenuContent`, and `MenuItem` elements for overflow
5. Remove unused imports: `MenuContent`, `MenuItem`, `MenuRoot`, `MenuTrigger` (lines 8-12) — only if nothing else in the file uses them
6. On mobile: the tab bar already has `overflow-x-auto` and `flex-wrap` so all 6 tabs will wrap or scroll naturally

**Verification:** All 6 tabs visible in the tab bar. No `...` button. Mobile wraps cleanly.

---

## Task 2: Daemon Health Monitor

**Problem:** Daemon dies silently. No recovery path after `tsx watch` exhausts retries.

**Files:**
- `src/hooks/use-workspace-sse.ts`
- `src/screens/workspace/workspace-layout.tsx`
- `vite.config.ts`

**Changes:**

### 2a: Reconnect toast in `use-workspace-sse.ts`
- When SSE `onerror` fires and connection drops, show a toast: `"Workspace daemon disconnected — reconnecting..."`
- Use whatever toast system ClawSuite already uses (check imports in other files)
- On successful reconnect, show: `"Workspace daemon reconnected"`

### 2b: Restart daemon button in `workspace-layout.tsx`
- In the existing offline/disconnected banner, add a "Restart Daemon" button
- Button calls `POST /api/workspace/daemon/restart` (new endpoint, see 2c)
- Show loading state while restarting

### 2c: Restart endpoint in Vite proxy
- In `vite.config.ts`: add a middleware handler for `POST /api/workspace/daemon/restart`
- Handler kills the existing daemon child process (by stored PID) and spawns a fresh one
- Returns `{ ok: true }` on success

### 2d: Increase retry limits in `vite.config.ts`
- Find the daemon spawn retry logic
- Increase max retries from 5 to 20
- Add exponential backoff: 1s, 2s, 4s, 8s, capped at 30s

**Verification:** Kill daemon process manually → toast appears → click Restart → daemon comes back → toast confirms.

---

## Task 3: Stale Daemon Detection

**Problem:** Stale daemon from previous session holds port 3099. New Vite start skips spawning.

**Files:**
- `vite.config.ts`
- `workspace-daemon/src/server.ts`

**Changes:**

### 3a: Version endpoint in daemon
- Add `GET /api/workspace/version` to `workspace-daemon/src/server.ts`
- Returns `{ version: <git-hash-or-build-timestamp>, uptime: <seconds> }`
- Use `Date.now()` at server startup as the version identifier

### 3b: Stale check on Vite startup in `vite.config.ts`
- On startup: check if port 3099 is in use
- If in use: `GET http://localhost:3099/api/workspace/version` with 2s timeout
- If healthy response: log "Reusing existing daemon" and skip spawn
- If no response or timeout: kill process on port 3099 (`lsof -ti:3099 | xargs kill -9`), then spawn fresh
- If not in use: spawn fresh as normal

**Verification:** Start Vite → kill it → start again → stale daemon detected and replaced.

---

## Task 4: Electron Production Build (Daemon Bundle)

**Problem:** Workspace daemon only runs via `tsx` in dev. Electron builds need compiled JS.

**Files:**
- `workspace-daemon/package.json`
- `workspace-daemon/tsconfig.json` (create if missing)
- `electron/main.ts` (or `electron/main.cjs`)
- `electron-builder.config.cjs`

**Changes:**

### 4a: Add build script to workspace-daemon
- Add to `workspace-daemon/package.json`:
  ```json
  "scripts": {
    "build": "tsup src/server.ts --format cjs --out-dir dist --clean"
  }
  ```
- If `tsup` isn't a dep, use `esbuild` instead:
  ```json
  "build": "esbuild src/server.ts --bundle --platform=node --outfile=dist/server.js --external:better-sqlite3"
  ```
- Ensure `dist/` is in `.gitignore`

### 4b: Spawn daemon from Electron main process
- In `electron/main.ts`: on `app.whenReady()`, spawn the daemon:
  ```ts
  const daemonProc = spawn('node', [path.join(__dirname, '../workspace-daemon/dist/server.js')], {
    env: { ...process.env, PORT: '3099', DB_PATH: path.join(app.getPath('userData'), 'workspace.db') },
    stdio: 'pipe'
  })
  ```
- On `app.before-quit`: kill `daemonProc`
- Store PID so gateway restart doesn't orphan it

### 4c: Include daemon dist in electron-builder
- In `electron-builder.config.cjs`, add to `files`:
  ```js
  "workspace-daemon/dist/**/*"
  ```

### 4d: DB path → userData
- In `workspace-daemon/src/server.ts` (or wherever DB is initialized): respect `DB_PATH` env var
- Fallback to current path if env var not set (dev mode)

**Verification:** `cd workspace-daemon && npm run build` succeeds. `node dist/server.js` starts the daemon. Electron build includes the bundle.

---

## Task 5: sessions_yield Integration in Orchestrator

**Problem:** Orchestrator polls for sub-agent results instead of using OpenClaw's new `sessions_yield` tool.

**Files:**
- `workspace-daemon/src/orchestrator.ts` (or wherever task dispatch + result collection happens)

**Changes:**
- After spawning a sub-agent task run, use `sessions_yield` to pause the orchestrator turn
- When the sub-agent completes, the orchestrator receives the result as the next message
- This replaces any polling loop or timer-based result checking
- Only applies if the orchestrator is running as an OpenClaw agent session (check if gateway RPC is available)
- Fallback to current polling if not running inside OpenClaw

**Verification:** Spawn a task → orchestrator yields → result arrives without polling.

---

## Task 6: Gateway RPC Timeout Guard

**Problem:** ClawSuite's `gateway.ts` makes RPC calls with no timeout. Stalled connections leak promises.

**File:** `src/server/gateway.ts`

**Changes:**
- Find `GatewayClient.request()` or equivalent RPC call method
- Add a configurable timeout (default 30s)
- On timeout: reject the promise, log warning, clean up pending state
- Pattern: wrap each RPC call in `Promise.race([rpcCall, timeoutPromise])`

**Verification:** Simulate stalled gateway → RPC rejects after 30s instead of hanging forever.

---

## Execution Order

| Order | Task | Effort | Impact |
|-------|------|--------|--------|
| 1 | Task 1: Restore tabs | 10 min | High (UX fix) |
| 2 | Task 6: RPC timeout | 20 min | High (reliability) |
| 3 | Task 2: Daemon health monitor | 45 min | Medium (DX) |
| 4 | Task 3: Stale daemon detection | 30 min | Medium (DX) |
| 5 | Task 5: sessions_yield | 30 min | Medium (perf) |
| 6 | Task 4: Electron build | 60 min | High (ship path) |

**Total estimated: ~3.5 hours of Codex time**

---

## Rules for Codex

1. Read ALL files listed in each task BEFORE writing any code
2. Run `npx tsc --noEmit` after each task — must be clean
3. Do NOT touch files outside the listed scope
4. Do NOT change any styling/theme — light theme is final
5. Commit after each task with message format: `fix(workspace): <description> (Sprint 4-5 Task N)`
6. If a task requires a new dependency, note it but do NOT install — flag for review
