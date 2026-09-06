# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Hermes Workspace is a **control plane / web UI for an external `hermes-agent` gateway** — not a standalone app. It is a TanStack Start (React 19 + Vite 7, SSR + server routes) application that connects over WebSocket RPC to a separately-running `hermes-agent` process (default `HERMES_API_URL=http://127.0.0.1:8642`). Most server routes proxy to that gateway. Nothing works end-to-end without a reachable gateway.

**Zero-fork principle:** the workspace runs against _vanilla_ `hermes-agent`. When an upstream endpoint is missing, features must degrade via capability gates rather than fail (e.g. Conductor falls back to native Swarm dispatch). See `src/server/gateway-capabilities.ts` and `src/lib/feature-gates.ts`.

## Commands

```bash
pnpm install              # deps (pnpm only — see .npmrc / pnpm-lock.yaml)
pnpm dev                  # dev server, http://localhost:3000 (vite dev)
pnpm build                # production build (dist/)
pnpm start                # run built server (server-entry.js)
pnpm start:all            # `hermes gateway run` + pnpm dev concurrently
npx tsc --noEmit          # type check (no build emit; tsconfig is noEmit)
pnpm lint                 # eslint
pnpm check                # prettier --write . && eslint --fix (use before PRs)
pnpm test                 # vitest run (all tests)
pnpm smoke:managed        # managed companion smoke test
```

Run a single test: `npx vitest run src/server/gateway-capabilities.test.ts` or filter by name with `npx vitest run -t "<test name>"`. Tests are colocated as `*.test.ts(x)` next to the code they cover; jsdom is the test environment.

Electron desktop builds: `pnpm electron:dev`, `pnpm electron:build[:mac|:win]` (bundles `dist/server` via esbuild into `electron/server-bundle.cjs`).

## Architecture

**Client layer**

- `src/routes/` — TanStack file-based routes; `routeTree.gen.ts` is **generated**, do not edit by hand.
- `src/screens/` — per-feature page UIs (chat, dashboard, swarm, mcp, memory, …).
- `src/stores/` — Zustand stores (chat, mission, task, workspace, agent-swarm, …).
- `src/lib/` — client-side API wrappers and shared logic; `src/components/`, `src/hooks/`, `src/utils/` support these.

**Server layer**

- `src/routes/api/*.ts` — TanStack Start server route handlers (the HTTP/SSE surface). These are thin; real logic lives in `src/server/`.
- `src/server/gateway.ts` — the core integration point. Owns the WebSocket connection to `hermes-agent`; `gatewayRpc()` is the primary request path and `onGatewayEvent()` the event stream. Most API routes call through here.
- `src/server/auth-middleware.ts` — auth enforced on every route; plus CSP and path-traversal guards. Treat auth as fail-closed.
- `server-entry.js` — production HTTP entry. **Refuses to start on a non-loopback `HOST` unless `HERMES_PASSWORD` is set** (prevents exposing terminals/files/agents unauthenticated). Preserve this guard.

**Swarm subsystem** (`src/server/swarm-*.ts`, `src/routes/api/swarm-*.ts`, `src/stores/agent-swarm-store.ts`)
A large multi-agent control plane: persistent tmux-backed workers with role-based dispatch. The roster of semantic workers (orchestrator, builder, reviewer, qa, researcher, ops-watch, maintainer, strategist, inbox-triage, km-agent) is defined by `swarm.yaml` — **this is the source of truth for routing**. Each worker also has a profile under `~/.hermes/profiles/<worker-id>/`, a `<worker-id>-core` skill, and a wrapper in `~/.local/bin/`. Keep `swarm.yaml`, profile `config.yaml`, core skills, and wrappers aligned when changing a worker. See `AGENTS.md` for the full contract and `docs/swarm/` for design.

## Conventions

- **Path alias:** import from `@/*` → `src/*`.
- **Naming contract** (`docs/hermes-workspace-naming-contract.md`): canonical product names are _Hermes Workspace_, _Hermes Agent_, _Swarm_, _Hermes Kanban_, `HERMES_HOME`, `~/.hermes`. Treat Claude-era wording in older code/docs as legacy residue and normalize it to Hermes naming — **except** where it preserves real backward compatibility (e.g. `CLAUDE_PASSWORD` is accepted as a fallback for `HERMES_PASSWORD`; `CLAUDE_AGENT_PATH` is still read). Don't break those compat fallbacks.
- TypeScript is `strict`; `noUnusedLocals`/`noUnusedParameters` are off but `noFallthroughCasesInSwitch` is on.
- One PR per feature/fix against `main`; run `pnpm check` and `npx tsc --noEmit` before opening.

## Environment

Copy `.env.example` → `.env`. Key vars: `HERMES_API_URL` (gateway backend), `HERMES_PASSWORD` (web UI auth; required for non-localhost `HOST`), `CLAUDE_ALLOWED_HOSTS` / `CLAUDE_AGENT_PATH`. The dev server (`vite.config.ts`) can auto-locate and start a sibling `hermes-agent` via a fallback chain (`CLAUDE_AGENT_PATH`, `../hermes-agent`, `~/.claude/hermes-agent`, `~/hermes-agent`).
