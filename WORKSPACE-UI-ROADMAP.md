# Workspace UI — Development Roadmap
_Last updated: 2026-03-09_

## Current State
- Branch: `feat/workspace-ui` (LOCAL ONLY — 69 commits ahead of origin/main)
- tsc: ✅ clean
- Dev server: http://localhost:3000

---

## Screen Inventory (11 planned)

| Screen | Status | Notes |
|--------|--------|-------|
| Projects Dashboard | ✅ Built | KPI bar, project cards, review inbox, agent capacity |
| Project Detail | ✅ Built | Health, git, agent squad, policies panels |
| New Project Wizard | ✅ Built | 5-step wizard + policy controls |
| Mission Console | ✅ Built | Live 3-panel agent terminal view |
| Runs Console | ✅ Built | SSE live updates, run detail modal, agent glow |
| Review Queue | ✅ Built | Checkpoint review flow |
| Checkpoint Detail Modal | ✅ Built | Verification matrix, diff viewer, spec upload |
| Plan Review | ✅ Built | Breadcrumbs, nav polished |
| Agents Directory | ✅ Built | Register agent form, onboarding clarity |
| Skills & Memory | ✅ Built | Separate from gateway skills |
| **Teams & Roles** | ❌ Missing | No dedicated workspace screen — only old `team-panel.tsx` in gateway hub |

**Score: 10/11 screens built**

---

## Immediate Next Steps

### 1. Build Teams & Roles screen (last missing screen)
- Route: `/workspace-teams`
- Features: team list, role definitions (Researcher / Planner / Builder / Validator / Deployer), RBAC policy assignment per project, member invite
- Reference: `src/screens/gateway/components/team-panel.tsx` (old version, use as starting point only)

### 2. Visual QA pass
- Boot dev server, walk every screen against v4 mockup
- Check: Checkpoint Detail polish, Agents screen polish
- Fix visual gaps before pushing

### 3. Refinement loop upgrade
- Current: tsc once → stop
- Target: tsc → errors → send to Codex → fix → re-run (up to 3 iterations)
- This is the #1 quality unlock for overnight runs

---

## Planned New Features (after roadmap complete)

### Specialized Agent Roles
Instead of one generic Codex adapter, define distinct roles:
- **Researcher** — reads files, summarizes context, no writes
- **Planner** — decomposes goals into tasks/waves
- **Builder** — Codex/Claude, writes code, commits
- **Validator** — tsc + tests + diff review
- **Deployer** — merge on approval, cleanup worktrees

Each gets a different system prompt + tool access. This is what "App Factory" pattern runs.

### Parallel Guardrails
- tsc watcher running *during* Codex build, not after
- Real-time error catch vs batch check at end

### Agent Handoffs (Context Passing)
- Codex finishes → passes git diff + error log → Validator picks up with full context
- Prevents context drop between waves in overnight runs

### Teams & Roles (Enterprise Angle)
- RBAC per project
- Multi-user support
- Cost tracking per team/member

---

## Gateway Stability Commits (cherry-pick to origin/main)
These 4 commits are clean fixes that should ship independently of the workspace UI:
- `38119e9` — browser status + navigate API compat (OpenClaw 2026.3.8)
- `343a6be` — graceful SIGTERM/SIGINT shutdown
- `a78e272` — prevent gateway disconnects from crashing Vite
- `db057f3` — gateway connection stability

**Action:** Create branch from `origin/main`, cherry-pick these 4, push as PR for Eric's review.

---

## Notes
- Workspace daemon: Express + SQLite, wave scheduler, Codex + Claude adapters, worktree isolation — all built
- Dead code to delete (cleanup pass): `src/routes/api/stream.ts`, `src/server/gateway-stream.ts`
- PR-first rule: Codex commits locally → Aurora summarizes → Eric approves → push
