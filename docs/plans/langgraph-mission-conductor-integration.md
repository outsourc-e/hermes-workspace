# LangGraph Mission Conductor Integration Plan

## Context

Two orchestration systems exist in this repo:

1. **Your TS Mission Coordinator** (`src/server/mission-coordinator/`) — a TypeScript-native
   DAG engine with SQLite-backed coordination, resource leases, Hermes Kanban linkage, and
   template-based mission creation. ~2,154 lines across 22 files. No Python dependency.

2. **jingr1's LangGraph Orchestrator** (`hermes_langgraph_orchestrator/` + TS integration
   layer) — a Python LangGraph-based workflow engine with YAML-defined state machine
   transitions, LLM checkpoint classification, human gates with resume, and a TS bridge
   that spawns Python subprocesses. ~13K lines across 16 Python files + ~20 TS files.

**Decision: prefer jingr1's LangGraph system as the primary mission conductor.** The TS
mission coordinator becomes the persistence/coordination layer underneath, with LangGraph
as the workflow brain on top.

## Architecture: Layered Integration

```
┌─────────────────────────────────────────────────────┐
│  UI Layer (React)                                    │
│  - human-gate-panel.tsx (jingr1)                     │
│  - use-human-gate.ts hook (jingr1)                   │
│  - human-gate-options.ts (jingr1)                    │
│  - existing swarm2 screens (yours, patched)          │
├─────────────────────────────────────────────────────┤
│  API Layer (TanStack Router)                         │
│  - /api/swarm-langgraph/* (jingr1, new)              │
│  - /api/orchestrator-* (jingr1, new)                 │
│  - /api/mission-coordinator (yours, existing)        │
│  - /api/conductor-spawn (yours, existing)            │
├─────────────────────────────────────────────────────┤
│  LangGraph Orchestration Brain (Python)              │
│  - hermes_langgraph_orchestrator/ (jingr1, new)      │
│  - Workflow YAMLs: RDI, RADW, research_only,         │
│    design_implement (jingr1, new)                    │
│  - LLM checkpoint classification                     │
│  - Human gate with resume (MemorySaver checkpointer) │
│  - Mock mode for CI                                   │
├─────────────────────────────────────────────────────┤
│  TS Bridge Layer (jingr1, new)                       │
│  - langgraph-orchestrator.ts (spawn Python)          │
│  - langgraph-human-gate.ts (env vars for resume)     │
│  - handoff.ts (structured agent handoffs)            │
│  - swarm-mission-sync.ts (checkpoint → mission sync) │
│  - swarm-background-harvest.ts (polling loop)        │
│  - swarm-harvest.ts (worker checkpoint harvest)      │
│  - swarm-tmux-delivery.ts (tmux transport)           │
├─────────────────────────────────────────────────────┤
│  TS Coordination Layer (yours, existing)             │
│  - mission-coordinator/coordinator.ts                │
│  - mission-coordinator/graph-engine.ts (DAG)         │
│  - mission-coordinator/coordination-db.ts (SQLite)   │
│  - mission-coordinator/hermes-linkage.ts (Kanban)    │
│  - mission-coordinator/execution-bridge.ts           │
│  - mission-coordinator/templates.ts                  │
└─────────────────────────────────────────────────────┘
```

The key insight: these systems are **complementary, not competing**.

- Your TS coordinator handles: mission CRUD, DAG validation, resource leases,
  SQLite persistence, Hermes Kanban card provisioning, lifecycle reconciliation.
- jingr1's LangGraph handles: workflow-driven routing (which worker goes next),
  LLM-based checkpoint classification, human approval gates with resume,
  multi-round review loops with iteration limits.

The integration connects them: LangGraph decides *what to do next*, your coordinator
handles *how to persist and track it*.

## Phase 1: Import LangGraph Python Package + TS Bridge (no conflicts)

All new files, zero conflict risk.

### Files to checkout from jingr1/main:

**Python package (16 files):**
- `hermes_langgraph_orchestrator/__init__.py`
- `hermes_langgraph_orchestrator/__main__.py`
- `hermes_langgraph_orchestrator/graph.py`
- `hermes_langgraph_orchestrator/nodes.py` (1719 lines — the core)
- `hermes_langgraph_orchestrator/state.py`
- `hermes_langgraph_orchestrator/workflow.py`
- `hermes_langgraph_orchestrator/resume.py`
- `hermes_langgraph_orchestrator/mock_services.py`
- `hermes_langgraph_orchestrator/pyproject.toml`
- `hermes_langgraph_orchestrator/requirements.txt`
- `hermes_langgraph_orchestrator/bin/hermes-langgraph`
- `hermes_langgraph_orchestrator/workflows/rdi.yaml`
- `hermes_langgraph_orchestrator/workflows/radw.yaml`
- `hermes_langgraph_orchestrator/workflows/research_only.yaml`
- `hermes_langgraph_orchestrator/workflows/design_implement.yaml`
- `hermes_langgraph_orchestrator/README.md`

**TS bridge (new files):**
- `src/server/langgraph-orchestrator.ts` — Python subprocess spawner
- `src/server/langgraph-human-gate.ts` — human gate env var bridge
- `src/server/handoff.ts` + `handoff.test.ts` — structured agent handoffs
- `src/server/swarm-mission-sync.ts` — checkpoint → mission state sync
- `src/server/swarm-background-harvest.ts` — 15s polling loop
- `src/server/swarm-harvest.ts` — worker checkpoint harvest
- `src/server/swarm-tmux-delivery.ts` — tmux transport helpers
- `src/lib/swarm-workers.ts` + `swarm-workers.test.ts` — worker ID filtering
- `src/lib/tmux-attach.ts` + `tmux-attach.test.ts` — tmux attach helpers
- `src/lib/terminal-workspace-lazy.ts` — lazy terminal loader
- `src/lib/xterm-client.ts` — xterm client setup
- `src/lib/xterm-styles.client.ts` — xterm styles

**API routes (new files):**
- `src/routes/api/swarm-langgraph/run.ts` — start LangGraph mission
- `src/routes/api/swarm-langgraph/status.ts` — get mission state
- `src/routes/api/swarm-langgraph/resume.ts` — resume from human gate
- `src/routes/api/swarm-langgraph/cancel.ts` — cancel mission
- `src/routes/api/swarm-langgraph/mission-event.ts` — SSE event stream
- `src/routes/api/orchestrator-state.ts` — get orchestrator state
- `src/routes/api/orchestrator-resume.ts` — resume orchestrator
- `src/routes/api/orchestrator-active-gates.ts` — list active human gates

**UI components (new files):**
- `src/screens/swarm2/components/human-gate-panel.tsx`
- `src/screens/swarm2/hooks/use-human-gate.ts`
- `src/screens/swarm2/lib/human-gate-options.ts`

**Scripts (new files):**
- `scripts/sync-swarm-profiles.mjs` — sync ~/.hermes/profiles from swarm.yaml
- `scripts/sync-autoresearch-skills.sh` — install autoresearch skill wrappers

### Files to prefer jingr1's version (5 overlapping files):

- `src/server/pty-helper.py` — jingr1 fixes stdin EOF handling (keeps PTY alive
  when HTTP stream detaches). Better than ours. Take jingr1's.
- `src/routes/api/terminal-resize.ts` — jingr1 returns 200 with `session_not_found`
  reason instead of 404, avoiding browser noise. Take jingr1's.
- `src/routes/terminal.tsx` — jingr1 removes inline lazy import, uses
  `terminal-workspace-lazy.ts` module. Take jingr1's.
- `src/components/terminal-panel.tsx` — jingr1 uses ErrorBoundary + lazy module
  instead of inline Suspense. Take jingr1's.
- `src/server/swarm-model-resolver.test.ts` — jingr1's tests match the new
  `parseSwarmModelLabel` API. Take jingr1's.

### NOT taken in this phase (conflict-heavy, handle separately):
- `swarm.yaml` — jingr1's version removes workers you use. Keep yours.
- `src/server/swarm-model-resolver.ts` — jingr1 renames `resolveSwarmModelLabel` →
  `parseSwarmModelLabel`. Breaking change. Handle in Phase 3.
- `src/components/swarm/router-chat.tsx` — 943 lines of workflow UI. Handle in Phase 2.
- `src/routeTree.gen.ts` — auto-generated, will regenerate after route files land.
- `src/routes/__root.tsx` — minor import style changes, not worth the conflict.
- `src/components/workspace-shell.tsx` — removes session card logic, conflicts with
  your work. Skip.
- `src/stores/session-model-store.ts` — 105 lines of changes, conflicts. Skip.

## Phase 2: Route Registration + UI Wiring

After Phase 1 lands the files, the new API routes need to be registered:

1. Run `pnpm dev` once to auto-generate `src/routeTree.gen.ts` (TanStack Router
   file-based routing picks up the new route files automatically).

2. Wire the human-gate-panel into the swarm2 screen. The panel needs to be
   rendered when `langgraph_needs_human` is true on a mission. Add a polling
   mechanism in the swarm2 screen that checks `/api/orchestrator-active-gates`
   and shows the panel when gates are active.

3. Add workflow selector UI to router-chat.tsx (jingr1 adds WORKFLOW_OPTIONS with
   RDI/RADW/research_only/design_implement). This is the 943-line diff — merge
   jingr1's workflow selection additions while keeping your existing dispatch
   logic. Prefer jingr1's version where they diverge.

## Phase 3: Model Resolver Migration

jingr1 replaces the hardcoded model label matcher with a clean `provider/model-id`
parser. This is architecturally better but breaks the API:

- `resolveSwarmModelLabel()` → `parseSwarmModelLabel()`
- Removes all hardcoded model regex patterns
- Expects `provider/model-id` format in swarm.yaml (e.g. `deepseek/deepseek-v4-pro`)

Steps:
1. Take jingr1's `swarm-model-resolver.ts` + test file
2. Update all callers (grep for `resolveSwarmModelLabel`)
3. Update `swarm.yaml` model fields to `provider/model-id` format
4. Run tests to verify

## Phase 4: Python Environment Setup

1. Create venv: `cd hermes_langgraph_orchestrator && python3 -m venv .venv`
2. Install deps: `.venv/bin/pip install -r requirements.txt`
3. Verify: `.venv/bin/python -m hermes_langgraph_orchestrator --help`
4. Test mock mode: `.venv/bin/python -m hermes_langgraph_orchestrator --execute --mock-services --goal "test mission" --mission-id test-1`

## Phase 5: Bridge LangGraph ↔ Mission Coordinator

This is the integration layer that connects jingr1's LangGraph brain to your
existing TS coordination layer:

1. **Mission creation bridge**: When LangGraph starts a mission (via
   `/api/swarm-langgraph/run`), also create a mission in the TS coordinator
   (`createMission()` from `mission-coordinator/coordinator.ts`). LangGraph
   handles workflow routing; the TS coordinator handles DAG persistence, leases,
   and Kanban card provisioning.

2. **Checkpoint sync**: When LangGraph classifies a checkpoint, update the
   corresponding node state in the TS coordinator. Map LangGraph verdicts to
   NodeState:
   - `DONE` → `done` (or `review` if `reviewRequired`)
   - `BLOCKED` → `blocked`
   - `NEEDS_INPUT` → `needs_input`
   - `HANDOFF` → `review`
   - `IN_PROGRESS` → `running`

3. **Human gate ↔ Kanban**: When LangGraph pauses at a human gate, create a
   Kanban card for the human decision (using `hermes-linkage.ts`). When the
   human resumes via the UI, complete the Kanban card and resume LangGraph.

4. **Background harvest**: jingr1's `swarm-background-harvest.ts` polls every
   15s. Wire it to also call `reconcileOnce()` from your
   `reconciliation-loop.ts` so both systems stay in sync.

## Phase 6: Workflow YAML → Mission Template Mapping

Your TS coordinator has templates (`templates.ts`): coding, research, qa, release,
maintenance. jingr1 has workflow YAMLs: RDI, RADW, research_only, design_implement.

Map them:
- `coding` template → `design_implement.yaml` workflow
- `research` template → `research_only.yaml` workflow
- `qa` template → `rdi.yaml` workflow (research → design → implement → review)
- `release` template → `radw.yaml` workflow
- `maintenance` template → `design_implement.yaml` workflow

This allows the existing `/api/mission-coordinator?action=create&template=coding`
endpoint to trigger a LangGraph workflow automatically.

## File Inventory

### New files from jingr1 (all zero-conflict):
- 16 Python files (hermes_langgraph_orchestrator/)
- 15 TS server/lib files
- 8 API route files
- 3 UI component files
- 2 script files
- Total: 44 new files

### Overlapping files (prefer jingr1's):
- 5 files where jingr1's version is better (pty-helper, terminal-resize, terminal.tsx,
  terminal-panel.tsx, swarm-model-resolver.test.ts)

### Files NOT taken:
- swarm.yaml (keep yours)
- swarm-model-resolver.ts (Phase 3, separate commit)
- router-chat.tsx (Phase 2, separate commit)
- routeTree.gen.ts (auto-generated)
- __root.tsx, workspace-shell.tsx, session-model-store.ts (conflicts not worth it)

## Execution Order

1. Phase 1: Checkout all new files + 5 overlapping files → single commit
2. Phase 4: Python venv setup → verify mock mode works
3. Phase 2: Route registration + UI wiring → commit
4. Phase 3: Model resolver migration → commit
5. Phase 5: Bridge integration → commit
6. Phase 6: Template mapping → commit
