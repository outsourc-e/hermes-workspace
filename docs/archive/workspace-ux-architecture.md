# ClawSuite Workspace UX Architecture Spec

**Generated:** 2026-03-10  
**Target:** V4 Mockup (`orchestrator-mockup/v4.html`)  
**Repo:** `/Users/aurora/.openclaw/workspace/clawsuite`

---

## Executive Summary

The workspace section (`/workspace`) implements 6 tab-based screens via hash navigation. Current implementation covers ~70% of V4 mockup functionality. Key gaps are **screen extraction** (Project Detail and Checkpoint are embedded/modal instead of routable), **Teams screen data binding**, and **navigation polish**.

---

## V4 Mockup Screens (Reference)

| ID | Screen Name | Hash/Route | V4 Purpose |
|----|-------------|------------|------------|
| S1 | Projects Dashboard | `#projects` (default) | KPIs, project cards, review inbox, agent capacity |
| S2 | Project Detail | Inline view | Roadmap sidebar, policies, health, active mission |
| S3 | Review Queue | `#review` | Filterable checkpoint list across all projects |
| S4 | Mission Control | Query param `?missionId=` | Live terminals, task progress, activity log |
| S5 | Checkpoint Detail | Navigated from S3/S4 | Diffs, verification matrix, actions |
| S6 | Agents | `#agents` | Agent list + detail tabs (profile/model/prompt/skills/runs) |
| S7 | Teams & Roles | `#teams` | Team cards, approval policy, audit log |
| S8 | New Project Wizard | Modal from S1 | 5-step: Source → Spec → Agents → Policies → Create |
| S9 | Plan Review | Query param `?plan=` | Task breakdown before mission launch |
| S10 | Runs Console | `#runs` | Active + recent runs with filters |
| S11 | Skills & Memory | `#skills` | Skills panel + Memory browser panel |

---

## Current Implementation Map

| V4 Screen | Current File | Status | Notes |
|-----------|--------------|--------|-------|
| S1 Dashboard | `projects-screen.tsx` (lines 1-300) | ✅ Implemented | KPIs, cards, inbox, capacity all present |
| S2 Project Detail | `project-detail-view.tsx` + embedded in `projects-screen.tsx` | ⚠️ Partial | View exists but navigation is inline, not routed |
| S3 Review Queue | `review-queue-screen.tsx` | ✅ Implemented | Filters, row actions, composer all work |
| S4 Mission Control | `mission-console-screen.tsx` | ✅ Implemented | Terminals, task list, policy drawer present |
| S5 Checkpoint Detail | `checkpoint-detail-modal.tsx` | ⚠️ Modal | Should be navigable screen, not modal |
| S6 Agents | `agents-screen.tsx` | ✅ Implemented | List + detail tabs all functional |
| S7 Teams | `teams-screen.tsx` | 🔴 Stub | Hardcoded data, no API integration |
| S8 Wizard | `new-project-wizard.tsx` | ⚠️ Modal | Full wizard exists but not routed |
| S9 Plan Review | `plan-review-screen.tsx` | ✅ Implemented | Task graph, waves, launch button all work |
| S10 Runs Console | `runs-console-screen.tsx` | ✅ Implemented | Filters, run cards, status badges present |
| S11 Skills & Memory | `workspace-skills-screen.tsx` | ✅ Implemented | Two-panel layout matches V4 |

---

## Navigation Flows

### Current (workspace-layout.tsx)
```
/workspace
├── #projects (default)
│   ├── ?projectId= → Inline ProjectDetailView
│   └── ?missionId= → MissionConsoleScreen
├── #review
├── #runs
├── #agents
├── #skills
└── #teams
```

### Target (V4)
```
/workspace
├── #projects (S1 Dashboard)
│   ├── ?project= → S2 Project Detail (standalone view)
│   ├── ?missionId= → S4 Mission Control
│   └── + New Project → S8 Wizard (can be modal or route)
├── #review (S3 Review Queue)
│   └── Click row → S5 Checkpoint Detail (navigable)
├── #runs (S10 Runs Console)
├── #agents (S6 Agents)
├── #skills (S11 Skills & Memory)
└── #teams (S7 Teams & Roles)
```

### Key Navigation Patterns

1. **Breadcrumb Trail**: V4 shows `Projects › ClawSuite › Mission 3` in topbar. Current implementation has this in workspace-layout.tsx ✓

2. **Back Navigation**: S5 Checkpoint shows `← Mission Control` link. Modal currently lacks this pattern.

3. **Deep Links**: All screens should support direct linking via query params.

---

## Gap Analysis & Prioritized Tasks

### P0: Critical Path (Required for MVP)

#### P0-1: Extract Checkpoint Detail to Navigable View
**Files:** 
- Create: `src/screens/checkpoints/checkpoint-detail-screen.tsx`
- Modify: `src/screens/workspace/workspace-layout.tsx`
- Modify: `src/screens/review/review-queue-screen.tsx`

**What:**
- Move checkpoint detail from modal to standalone screen
- Add `?checkpointId=` query param support in workspace-layout
- Add back navigation `← Review Queue` or `← Mission Control`
- Keep modal as optional quick-view (shift+click or preview)

**Why:** Core workflow requires checkpoint review with full context. Modal limits diff viewing and lacks proper navigation state.

**Estimate:** 4 hours

---

#### P0-2: Wire Teams Screen to Real Data
**Files:**
- Modify: `src/screens/teams/teams-screen.tsx`
- Add: API endpoint `/api/workspace/teams` (daemon-side)
- Add: API endpoint `/api/workspace/audit-log` (daemon-side)

**What:**
- Replace hardcoded `TEAM_CARDS`, `APPROVAL_TIERS`, `AUDIT_LOG`
- Fetch teams from workspace daemon
- Display real audit log from activity events
- Keep read-only for now (edit teams can be P2)

**Why:** Stub data breaks the illusion of a real orchestration system.

**Estimate:** 3 hours

---

### P1: Important (Post-MVP Polish)

#### P1-1: Clean Project Detail Extraction
**Files:**
- Verify: `src/screens/projects/project-detail-view.tsx` (66KB!)
- Modify: `src/screens/projects/projects-screen.tsx`

**What:**
- Ensure project detail view is cleanly separated (it already is in separate file)
- Verify navigation works correctly with `?projectId=` param
- Consider splitting project-detail-view.tsx if it has multiple concerns

**Why:** Code organization, but functionality exists.

**Estimate:** 2 hours

---

#### P1-2: Add Wizard Route Support
**Files:**
- Modify: `src/screens/workspace/workspace-layout.tsx`
- Modify: `src/screens/projects/new-project-wizard.tsx`

**What:**
- Add `?wizard=true` or `#wizard` route to open wizard as full screen
- Keep modal trigger as quick access
- Support direct linking `/workspace?wizard=true`

**Why:** Some users prefer dedicated wizard page over modal.

**Estimate:** 1 hour

---

#### P1-3: Checkpoint Screen Visual Diffs
**Files:**
- Modify: `src/screens/checkpoints/checkpoint-detail-screen.tsx` (from P0-1)
- May need: Monaco diff viewer integration

**What:**
- V4 mockup shows inline diffs with syntax highlighting
- Current modal has diff stats but not visual diffs
- Add collapsible per-file diff panels

**Why:** Visual diff is the primary decision-making tool for checkpoints.

**Estimate:** 4 hours

---

#### P1-4: Verification Matrix Display
**Files:**
- Modify: Checkpoint detail screen

**What:**
- V4 shows `✅ tsc`, `⚠️ tests`, `⚪ e2e` in verification grid
- Add verification status to checkpoint response
- Display pass/warn/na badges per check

**Why:** Builds trust in automated verification.

**Estimate:** 2 hours

---

### P2: Nice to Have (Future)

#### P2-1: Skills Memory File Editor
**Files:**
- Modify: `src/screens/skills/workspace-skills-screen.tsx`

**What:**
- V4 shows textarea for `SOUL.md` editing
- Add inline memory file editor
- Support save/reset actions

**Estimate:** 3 hours

---

#### P2-2: Agent System Prompt Editor
**Files:**
- Modify: `src/screens/agents/agents-screen.tsx`

**What:**
- V4 shows editable system prompt textarea per agent
- Add save/reset with version tracking
- Show "v3 · edited 2h ago" metadata

**Estimate:** 2 hours

---

#### P2-3: Teams Policy Editor
**Files:**
- Modify: `src/screens/teams/teams-screen.tsx`

**What:**
- Edit approval policies (low/medium/high risk thresholds)
- Add/remove team members
- Configure per-agent capabilities

**Estimate:** 4 hours

---

#### P2-4: Review Queue Keyboard Navigation
**Files:**
- Modify: `src/screens/review/review-queue-screen.tsx`

**What:**
- V4 shows `A` approve, `R` revise, `X` reject, `J/K` nav
- Add keyboard shortcuts
- Show shortcut hints in UI

**Estimate:** 2 hours

---

## File Impact Summary

### New Files
```
src/screens/checkpoints/checkpoint-detail-screen.tsx  (P0-1)
```

### Heavy Modifications
```
src/screens/workspace/workspace-layout.tsx           (P0-1, P1-2)
src/screens/teams/teams-screen.tsx                   (P0-2)
src/screens/review/review-queue-screen.tsx           (P0-1)
```

### Light Modifications
```
src/screens/projects/new-project-wizard.tsx          (P1-2)
src/screens/projects/project-detail-view.tsx         (P1-1)
src/screens/skills/workspace-skills-screen.tsx       (P2-1)
src/screens/agents/agents-screen.tsx                 (P2-2)
```

---

## Recommended Execution Order

```
Week 1:
├── P0-1: Checkpoint Detail Screen (4h)
└── P0-2: Teams Screen Data (3h)

Week 2:
├── P1-1: Project Detail Cleanup (2h)
├── P1-2: Wizard Route (1h)
├── P1-3: Visual Diffs (4h)
└── P1-4: Verification Matrix (2h)

Backlog:
├── P2-1 through P2-4 as time permits
```

---

## Codex Task Instructions

### Task: P0-1 Checkpoint Detail Screen

```
Read these files first:
- src/screens/projects/checkpoint-detail-modal.tsx (current implementation)
- src/screens/workspace/workspace-layout.tsx (navigation)
- src/screens/review/review-queue-screen.tsx (triggers)
- orchestrator-mockup/v4.html (search for "s-checkpoint")

Then:
1. Create src/screens/checkpoints/checkpoint-detail-screen.tsx
   - Extract modal content to standalone screen component
   - Add props: checkpointId, projectId, returnTo ('review' | 'mission')
   - Add breadcrumb: "← {returnTo}" with working navigation
   - Keep same layout/styling as modal
   
2. Modify workspace-layout.tsx
   - Add checkpointId to WorkspaceSearch type
   - Add conditional render for checkpoint screen when checkpointId present
   
3. Modify review-queue-screen.tsx
   - Change row click to navigate to /workspace?checkpointId=X&projectId=Y
   - Keep modal available via shift+click for quick preview

4. Run tsc --noEmit and fix any errors before committing
```

### Task: P0-2 Teams Screen Data

```
Read these files first:
- src/screens/teams/teams-screen.tsx (current stub)
- src/screens/projects/lib/workspace-types.ts (type patterns)
- orchestrator-mockup/v4.html (search for "s-teams")

Then:
1. Create types for teams/roles in workspace-types.ts:
   - WorkspaceTeam { id, name, members: WorkspaceTeamMember[] }
   - WorkspaceTeamMember { id, name, type: 'user' | 'agent' }
   - ApprovalPolicy { risk: 'low' | 'medium' | 'high', requirement: string }

2. Create API fetcher functions:
   - listWorkspaceTeams() → fetch /api/workspace/teams
   - listAuditLog(limit?: number) → fetch /api/workspace/events?type=audit
   
3. Modify teams-screen.tsx:
   - Replace TEAM_CARDS with useQuery(listWorkspaceTeams)
   - Replace AUDIT_LOG with useQuery(listAuditLog)
   - Keep APPROVAL_TIERS as config for now (policy editing is P2)
   - Add loading/error states
   
4. Run tsc --noEmit and fix any errors before committing
```

---

## Notes

1. **Modal vs Screen tradeoff**: Modals are faster to implement but break deep linking and keyboard nav. For core workflows (checkpoint review), prefer screens.

2. **project-detail-view.tsx is 66KB**: This file is large but functional. Don't refactor unless bugs found.

3. **checkpoint-detail-modal.tsx is 30KB**: Contains rendering logic + diff parsing + verification display. When extracting to screen, keep helper functions in place.

4. **Teams API may not exist**: If `/api/workspace/teams` 404s, stub the endpoint in daemon first or add mock data with TODO.
