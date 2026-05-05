# Iteration 008 — 3002 loading-loop handoff for Opus

Date: 2026-05-04 01:13 EDT
Repo: `/Users/aurora/hermes-workspace`
Current branch: `main`
Current main head at handoff: `cb2ecec5f`

---

## Situation

HermesWorld has been merged into local `main` and pushed to `origin/main`.

### Merge / ship status
- Feature branch: `feat/agent-view-port-from-controlsuite`
- Merged local `main` into the feature branch first, resolved conflicts, build passed.
- Merged feature branch into local `main`.
- Pushed `main` to GitHub:
  - remote push range: `8f31e113b..cb2ecec5f`

### Product state
- HermesWorld is live in the repo and shipped to GitHub main.
- 3005 preview/worktree behaved correctly.
- 3002 (local main workspace dev server) has had a persistent **loading loop** for Eric, even after merges and refresh attempts.

---

## What was already done

### HermesWorld changes already merged
Recent relevant commits on the feature branch before merge included:
- `8312ba810` — rebrand Playground nav item to HermesWorld with gold NEW badge
- `215bdf8a4` — featured HermesWorld nav slot + sidebar handling
- `0d4f6fec7` — keep left sidebar visible on HermesWorld
- `58d8c8f11` — finish HermesWorld branding pass
- `cb2ecec5f` — merge local main into feature branch

### Merge conflict policy used
During merge-from-main into feature branch, conflicts were resolved by:
- taking **main** as source of truth for dashboard/agent-view/chat layout
- preserving **HermesWorld branding + multiplayer env config** where relevant

Conflict files that were resolved during that merge:
- `.env.example`
- `src/components/agent-view/agent-view-panel.tsx`
- `src/screens/chat/chat-screen.tsx`
- `src/screens/dashboard/dashboard-screen.tsx`

---

## 3002 loading-loop investigation already attempted

### 1. Verified local server / backend modes
Found a real mismatch initially:
- `3002` was running against **portable backend** `8645`
- `3005` was running against **enhanced backend** `8642`

This was likely wrong for comparing HermesWorld behavior.

### 2. Changed local main `.env`
Edited:
- `/Users/aurora/hermes-workspace/.env`

Changed:
- `HERMES_API_URL=http://127.0.0.1:8645` → `http://127.0.0.1:8642`
- `CLAUDE_API_URL=http://127.0.0.1:8645` → `http://127.0.0.1:8642`

### 3. Restarted 3002 repeatedly
3002 was restarted multiple times after:
- backend URL switch
- Vite cache wipe (`node_modules/.vite` removed)
- clean `pnpm dev` restarts

### 4. Verified health endpoints
After the restart, 3002 reported healthy:
- `/api/connection-status` → `{"ok":true,"mode":"enhanced","backend":"http://127.0.0.1:8642"}`
- `/api/auth-check` → `{"authenticated":true,"authRequired":false}`
- `/api/gateway-status` → valid JSON on both 3002 and 3005

So by the end, backend/auth/gateway health looked good.

### 5. Notable false lead
At one point `/api/gateway-capabilities` returned app HTML instead of JSON.
That looked suspicious, but later investigation showed the real route in current main is `/api/gateway-status`, and that endpoint was healthy.

### 6. Shell fallback patch added
To guard against a wedged startup overlay, a fallback check was added to:
- `src/components/workspace-shell.tsx`

What it does:
- imports `fetchClaudeAuthStatus`
- adds a `useEffect` that, if `connectionVerified` is still false, tries:
  1. `/api/auth-check` via `fetchClaudeAuthStatus(3000)`
  2. then `/api/connection-status`
- if either is healthy, it calls:
  - `setAuthStatus({ authenticated: true, authRequired: false })`
  - `setConnectionVerified(true)`

Intent:
- if the `ConnectionStartupScreen` itself gets stuck, the shell should still unlock.

3002 was restarted after this patch too.

---

## Current mystery

Despite:
- healthy auth endpoint
- healthy connection-status endpoint
- healthy gateway-status endpoint
- enhanced backend on 8642
- shell fallback patch

Eric still reports **the same loading loop on 3002**.

That suggests one of these is true:
1. it is **not** the startup/auth overlay at all,
2. there is a separate UI-level infinite loading state on main,
3. browser/client state is stale in a more specific way,
4. a route/layout shell interaction on main differs from the 3005 preview in some subtle way,
5. HMR / generated route artifacts / dev-server state on 3002 is still inconsistent.

---

## Strong hypotheses for Opus to test

### Hypothesis A — wrong overlay/component
It may not be `ConnectionStartupScreen` at all.
Ask Eric for a screenshot immediately if needed and identify the exact visible component.

### Hypothesis B — main vs worktree route/layout drift
Compare these files between 3002 main and the working 3005 worktree preview:
- `src/components/workspace-shell.tsx`
- `src/components/connection-startup-screen.tsx`
- `src/routes/__root.tsx`
- `src/routes/playground.tsx`
- `src/screens/playground/playground-screen.tsx`
- `src/screens/chat/components/chat-sidebar.tsx`

### Hypothesis C — generated route tree / Vite dev weirdness
The dev logs repeatedly showed warnings like:
- `send-stream-live-tools.ts does not export a Route`
- `routeTree.gen.ts was modified by another process during processing`

This may be harmless, but it smells like route generation churn. Worth checking whether 3002 is serving a bad in-memory state.

### Hypothesis D — browser-only state
Could be localStorage/sessionStorage / persisted Zustand state / service worker / stale route state. We suspected this already, but it remains plausible.

---

## Suggested next steps for Opus

1. **Get a screenshot first** if possible.
   - Identify whether the loop is:
     - startup/auth overlay,
     - splash,
     - route shell,
     - playground transition loading screen,
     - some other loader.

2. **Compare 3002 vs 3005 route/layout state**.
   - Especially `workspace-shell.tsx`, `__root.tsx`, and startup/auth flow.

3. **Check whether the new fallback patch in `workspace-shell.tsx` actually compiled into 3002**.
   - Search built output or runtime behavior if needed.

4. **Inspect client state assumptions**.
   - localStorage keys
   - sessionStorage keys
   - onboarding completion flags
   - any persisted auth/loading flags

5. **Check if HermesWorld transition loader itself is what's looping**.
   - Search for `transitioning`, `TransitionLoadingScreen`, and route enter logic in `playground-screen.tsx`.

6. **If necessary, temporarily add ultra-obvious debug text** to the suspected overlay component so Eric can tell which one is on screen.

---

## Useful commands / facts from this session

### 3002 health
- `curl -s http://localhost:3002/api/connection-status`
- `curl -s http://localhost:3002/api/auth-check`
- `curl -s http://localhost:3002/api/gateway-status`

### 3005 comparison
- `curl -s http://localhost:3005/api/connection-status`
- `curl -s http://localhost:3005/api/gateway-status`

### Observed good state on 3002 near the end
- `mode: enhanced`
- `backend: http://127.0.0.1:8642`
- `auth-check: authenticated true`
- `gateway-status: valid JSON`

### Dev log location
- `/tmp/hermes3002.log`

Recurring log noise:
- `send-stream-live-tools.ts does not export a Route`
- `routeTree.gen.ts was modified by another process during processing`

---

## Bottom line

This is no longer a simple backend/auth failure.
The obvious transport and auth issues were fixed, yet Eric still sees the loop.
Opus should assume:
- the loop is probably a **specific UI component/state machine**, or
- 3002 dev-mode has a **route/layout/state divergence** from 3005 that needs targeted comparison.
