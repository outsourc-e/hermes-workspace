# Hub Monolith Extraction Plan
_Goal: Split 9K-line agent-hub-layout.tsx into ~15 independently-editable files_
_Then parallelize 8-10 Codex agents with zero merge conflicts_

---

## Current State
- `agent-hub-layout.tsx` — 9,209 lines, single file
- Contains: wizard, overview, runs tab, board wrapper, configure tab, office, agent management, mission lifecycle, SSE handling, approvals, detection, templates
- Every Codex agent that touches this file = merge conflict risk

## Extraction Targets

### Phase A: Pure Extractions (move code out, import back)
Each becomes its own file with clean props interface.

| # | New File | Lines (est) | What moves out |
|---|---------|-------------|----------------|
| 1 | `hub-wizard.tsx` | ~800 | Mission wizard (steps, goal, planning, team, settings, review) |
| 2 | `hub-runs-tab.tsx` | ~400 | renderRunsTabContent(), filter pills, run list, RunConsole mount |
| 3 | `hub-board-tab.tsx` | ~200 | Board view wrapper, Dispatch All, kanban mount |
| 4 | `hub-overview-tab.tsx` | ~300 | Overview tab content (already partially in overview-tab.tsx but some inline) |
| 5 | `hub-configure-tab.tsx` | ~600 | Configure tab: agents list, detect from gateway, starter team, agent cards |
| 6 | `hub-analytics-tab.tsx` | ~200 | Analytics tab wrapper + cost deep-link |
| 7 | `hub-mission-lifecycle.tsx` | ~400 | startMission, stopMissionAndCleanup, abortMission, completion detection |
| 8 | `hub-agent-actions.tsx` | ~300 | handleKillAgent, handleSteerAgent, handleDispatch, agent session management |
| 9 | `hub-sse-handler.tsx` | ~300 | SSE event processing, feed events, agent status updates |
| 10 | `hub-planning.tsx` | ~250 | AI planning: generateMissionPlan, parsePlannedTasks, buildMockPlan |
| 11 | `hub-detection.tsx` | ~200 | handleDetectFromGateway, handleCreateStarterTeam, handleImportDetectedAgent |
| 12 | `hub-types.tsx` | ~150 | All shared types, interfaces, constants (HUB_BUTTON_CLASS, etc.) |

### Phase B: Hub Shell (~2,500 lines remaining)
After extraction, `agent-hub-layout.tsx` becomes a thin shell:
- State declarations
- Tab routing
- Imports + prop passing
- Layout wrapper (header, tabs, sidebar)

---

## Extraction Rules
1. Each extracted file exports a single component or hook
2. Props interface defined in the new file (self-contained types)
3. Callbacks passed as props (onStartMission, onKillAgent, etc.)
4. Shared state accessed via Zustand stores (mission-store, task-store) not prop drilling
5. Hub shell imports and renders each component

## Parallel Blast Plan (post-extraction)

### Round 1: Extract (30 min, 4 agents)
- Agent A: Extract hub-wizard.tsx + hub-planning.tsx
- Agent B: Extract hub-runs-tab.tsx + hub-board-tab.tsx  
- Agent C: Extract hub-configure-tab.tsx + hub-detection.tsx
- Agent D: Extract hub-mission-lifecycle.tsx + hub-agent-actions.tsx

### Round 2: Build features (8-10 agents, zero conflicts)
Each agent owns 1 file:
- Agent 1: F-005 in hub-sse-handler.tsx (live task status)
- Agent 2: F-006 in run-console.tsx (auto artifacts)
- Agent 3: F-007 in hub-mission-lifecycle.tsx (auto reports)
- Agent 4: F-008 in config-wizards.tsx (generic API provider)
- Agent 5: Calendar wiring in hub-overview-tab.tsx
- Agent 6: Agenda wiring in hub-overview-tab.tsx (or separate)
- Agent 7: Onboarding flow (new file)
- Agent 8: Keyboard shortcuts (new file)
- Agent 9: Search across runs/tasks (new file)
- Agent 10: Mission scheduling (new file)

### Round 3: QA pipeline (local models)
- PC1 critic: reviews each commit
- PC2 qwen3: generates test scenarios
- Aurora: orchestrates, runs tsc, resolves any issues

## Expected Output
- Extraction: ~30 min
- Feature round: ~45-60 min for 10 features
- QA: ~15 min
- **Total: ~1.5 hours for 10 new features with clean architecture**

## Pre-Flight Checklist (run before blasting)
- [ ] `npx tsc --noEmit` passes
- [ ] All extractions compile independently
- [ ] No circular imports
- [ ] Hub shell renders all tabs correctly
- [ ] Git clean, feature branch ready
