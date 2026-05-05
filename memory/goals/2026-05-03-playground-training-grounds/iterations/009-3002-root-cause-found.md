# Iteration 009 — 3002 loading-loop ROOT CAUSE FOUND

Date: 2026-05-04 01:27 EDT
Repo: `/Users/aurora/hermes-workspace`
Branch: `main` (head: `72dd321e8`)

---

## Root cause

**Three concurrent `vite dev` processes were running against the same `hermes-workspace` source tree.**

Process inventory at start of session:
- pid 40934 — vite dev on **:3001** (running 36+ min, cwd `/Users/aurora/hermes-workspace`)
- pid 8826  — vite dev on **:3003** (running 12+ hours, same cwd)
- pid 8866  — vite dev (zombie pair to 8826, same cwd)
- pid 50028 — vite dev on **:3002** (the one we cared about, same cwd)
- pid 71649 — vite dev on **:3005** (different cwd: `/Users/aurora/.worktrees/hermes-playground-local`) — **fine**
- pid 11433 — vite dev on **:3006** (worktree, fine)

All three duplicate `hermes-workspace` vite servers were running **TanStack Router's
file-based route generator** simultaneously. They each wrote `src/routeTree.gen.ts`,
detected another writer's mtime change, and re-ran the generator. This caused:

1. Perpetual `routeTree.gen.ts was modified by another process during processing` warnings
2. Constant HMR reload signals fired at every browser client
3. The browser would re-execute the splash + startup chain on every reload, never settling

That is the loading loop Eric was seeing. The auth/connection layer was never the
problem — the page was being yanked out from under itself by HMR every few hundred ms.

## Evidence

- 34,039 instances of "modified by another process" in `/tmp/hermes3002.log`
  before kill (file size ~10 MB).
- After killing pids 40934, 8826, 8866 and starting a single fresh vite on 3002:
  - `routeTree.gen.ts` mtime is **stable** across multiple checks
  - log file size stops growing
  - all health endpoints clean (`/api/connection-status`, `/api/auth-check`,
    `/api/gateway-status`)

## Fix applied

1. Killed the three duplicate hermes-workspace vite processes.
2. Started a single fresh `pnpm dev` on 3002.
3. Renamed `src/routes/api/send-stream-live-tools.ts` →
   `src/routes/api/-send-stream-live-tools.ts` so TanStack's ignore prefix skips
   it cleanly. (Updated `send-stream.ts` and the test file's imports.) This silences
   the secondary "does not export a Route" warning. **It is not the root cause**,
   but the noise was a red herring during the prior investigation.

Committed: `72dd321e8` on `main`.

## How to recognize this in the future

If 3002 loops, **before** touching auth/startup code, check:

```bash
ps aux | grep -i vite | grep -v grep
lsof -nP -iTCP:3002 -iTCP:3001 -iTCP:3003 -iTCP:3004 -iTCP:3005 -sTCP:LISTEN
```

If more than one vite is bound to the same source tree (`/Users/aurora/hermes-workspace`),
that is the bug. Worktree vites at different cwds are fine.

A single command that detects it:

```bash
ps aux | grep -E "vite.*hermes-workspace/node_modules" | grep -v grep | grep -v worktree | wc -l
```

Should return `1` (or `0` if dev not running). Anything more means duplicates.

## Status of prior iteration's shell-fallback patch

The fallback `useEffect` in `src/components/workspace-shell.tsx` (added in
iteration 008) is still in place and harmless. It was not the fix but it does
not need to be reverted.

## Bottom line

3002 loading loop was infrastructural, not in app code:
multiple vite servers fighting over `routeTree.gen.ts`. Killed the duplicates,
loop is gone.
