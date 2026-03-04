\# OpenClaw Response: ClawSuite Agent Hub → Run Orchestrator (Mission Control / Studio Upgrade)

\## North Star

Agent Hub becomes a \*\*Run Orchestrator\*\*, not a feature museum:

\*\*Plan → Run → Supervise → Approve → Verify → Learn → Reuse\*\*

We already have separate routes for Terminal / Files / Memory / Tasks / Costs / Logs / Sessions, so the Hub must \*\*coordinate\*\* them (deep links), not duplicate them.

\## Priority Order

1) Runs tab (Console) — biggest visible impact

2) AI Planning step — mission creation feels like a product

3) Board wired to execution — Kanban becomes real

4) Approvals in Console — existing components, better placement/workflow

5) Discovery + Bootstrap — first-run experience

6) Knowledge loop — compounding improvement

7) Compare runs — “wow” feature

\## Redundancy Cleanup Rules

\- Analytics in hub should be \*\*run-scoped only\*\*; deep-link to \`/costs\` for global analytics.

\- Configure > Keys should be \*\*read-only or removed\*\*; deep-link to \`/settings\` for edits.

\- Board stays \*\*mission-scoped\*\*, but must unify data with \`/tasks\` as source of truth.

\---

\# FILE LAYOUT (for Codex targeting)

\- Main hub: \`src/screens/gateway/agent-hub-layout.tsx\` (~8,704 lines)

\- Components: \`src/screens/gateway/components/\`

\- Gateway API: \`src/lib/gateway-api.ts\`

\- SSE hook: \`src/screens/gateway/components/use-live-feed-chat-stream.ts\`

\- Mission store: \`src/stores/mission-store.ts\`

\- Task store: \`src/stores/task-store.ts\`

\- Mission overlay: inside \`agent-hub-layout.tsx\` (~line 7200)

\- Wizard: inside \`agent-hub-layout.tsx\` (~line 2899)

\- Kanban: \`src/screens/gateway/components/kanban-board.tsx\`

\- Approvals: \`approvals-bell.tsx\`, \`approvals-panel.tsx\`, \`inline-approval-card.tsx\`

\- Templates: \`src/screens/gateway/components/template-picker.tsx\`

\- Office view: \`src/screens/gateway/components/office-view.tsx\`

\## Implementation Constraint

Codex CLI works best with \*\*atomic tasks\*\*:

\- Each ticket touches \*\*1–2 files max\*\*

\- Clear inputs/outputs + acceptance criteria

\- Parallelizable across agents

\---

\# TICKET BOARD (Codex-Ready)

\## Phase 1 — Runs Tab (Console)

\### CS-001 — Create Run Console split-view layout (Runs list + Console pane)

\*\*Files:\*\*

\- \`src/screens/gateway/agent-hub-layout.tsx\`

\*\*Depends:\*\* none

\*\*Task:\*\* Convert Missions/Runs view into a 2-pane layout:

\- Left: runs list with filters (All / Running / Needs Input / Complete / Failed)

\- Right: Console placeholder panel (empty state if no run selected)

\*\*Acceptance:\*\*

\- Selecting a run updates the Console pane (even if stub content)

\- Filters update list counts + content

\*\*Test:\*\*

\- Smoke test navigation, selection, filter toggles

\### CS-002 — Extract Mission Overlay into a reusable Console component (shell only)

\*\*Files:\*\*

\- \`src/screens/gateway/components/run-console.tsx\` (new)

\- \`src/screens/gateway/agent-hub-layout.tsx\`

\*\*Depends:\*\* CS-001

\*\*Task:\*\* Create \`run-console.tsx\` that accepts \`missionId\` and renders:

\- header (mission name, status badge, run actions placeholder)

\- tabs: Stream | Timeline | Artifacts | Report (stubs ok)

Replace overlay usage in hub with the new Console component (keep overlay for now but deprecated).

\*\*Acceptance:\*\*

\- Console renders for selected missionId

\- No broken overlay behavior (overlay can remain accessible but not primary)

\*\*Test:\*\*

\- Select run → Console loads

\- Refresh page with run selected (if routing supports it)

\### CS-003 — Wire live stream into Console “Stream” tab (combined stream)

\*\*Files:\*\*

\- \`src/screens/gateway/components/run-console.tsx\`

\- \`src/screens/gateway/components/use-live-feed-chat-stream.ts\`

\*\*Depends:\*\* CS-002

\*\*Task:\*\* Use existing SSE hook to show a combined event stream:

\- newest at bottom, auto-scroll with “jump to latest”

\- show event type pills (tool\_call, output, status, error)

\*\*Acceptance:\*\*

\- Stream updates live while mission runs

\- Auto-scroll behaves correctly, manual scroll doesn’t fight user

\*\*Test:\*\*

\- Start mission → see live events

\- Pause scrolling, new events arrive, “jump to latest” appears

\### CS-004 — Add per-agent lanes view (toggle: Combined vs Lanes)

\*\*Files:\*\*

\- \`src/screens/gateway/components/run-console.tsx\`

\*\*Depends:\*\* CS-003

\*\*Task:\*\* Add a toggle that groups events by agent (lanes).

\*\*Acceptance:\*\*

\- Lane view shows same events grouped by agent id/name

\- Combined view still works

\*\*Test:\*\*

\- Run with multi-agent output → lanes populate

\### CS-005 — Add deep-link buttons from Console to Logs / Files / Terminal / Memory

\*\*Files:\*\*

\- \`src/screens/gateway/components/run-console.tsx\`

\*\*Depends:\*\* CS-002

\*\*Task:\*\* Add contextual buttons:

\- “Open Logs” → \`/logs?mission=\`

\- “Open Files” → \`/files?mission=\`

\- “Open Terminal” → \`/terminal?mission=\`

\- “Open Memory” → \`/memory?mission=\`

\*\*Acceptance:\*\*

\- Links are correct and open right page

\*\*Test:\*\*

\- Click each link; URL contains mission id

\---

\## Phase 2 — AI Planning Step (Wizard)

\### CS-010 — Add Planning sub-step UI inside Wizard (Clarify → Plan)

\*\*Files:\*\*

\- \`src/screens/gateway/agent-hub-layout.tsx\` (wizard section ~line 2899)

\*\*Depends:\*\* none

\*\*Task:\*\* Add a Planning panel before Team selection:

\- Clarify mini-chat area (user answers)

\- “Generate Plan” button (stub returns mock plan for now)

\*\*Acceptance:\*\*

\- Wizard step includes Planning UI

\- Plan box appears after generate

\*\*Test:\*\*

\- Enter answers → generate → plan renders

\### CS-011 — Add gateway API method for planning (or stub call)

\*\*Files:\*\*

\- \`src/lib/gateway-api.ts\`

\*\*Depends:\*\* CS-010

\*\*Task:\*\* Add \`generateMissionPlan({goal, context, answers, templateId})\` returning:

\- tasks: \[{title, description, acceptance, suggestedAgent, tools}\]

\- risks / assumptions

If backend not ready, return mocked structure but keep interface stable.

\*\*Acceptance:\*\*

\- Frontend calls gateway-api method (even if mocked)

\*\*Test:\*\*

\- Console logs show request/response shape

\### CS-012 — Persist plan to mission store (plan becomes source of truth)

\*\*Files:\*\*

\- \`src/stores/mission-store.ts\`

\- \`src/screens/gateway/agent-hub-layout.tsx\`

\*\*Depends:\*\* CS-011

\*\*Task:\*\* Store \`mission.plan\` and \`mission.planVersion\`.

\*\*Acceptance:\*\*

\- Plan persists when moving wizard steps

\*\*Test:\*\*

\- Generate plan → go next/back → plan remains

\---

\## Phase 3 — Board wired to execution (unify with /tasks)

\### CS-020 — Create “mission-scoped tasks” selector in task store

\*\*Files:\*\*

\- \`src/stores/task-store.ts\`

\*\*Depends:\*\* CS-012

\*\*Task:\*\* Add selectors + actions:

\- \`getTasksByMission(missionId)\`

\- \`upsertTasks(tasks\[\])\`

\- \`updateTaskStatus(taskId, status)\`

\*\*Acceptance:\*\*

\- Task store exposes mission-scoped tasks reliably

\*\*Test:\*\*

\- Unit-ish: create tasks → fetch by mission → update status

\### CS-021 — Generate tasks from plan on mission launch

\*\*Files:\*\*

\- \`src/screens/gateway/agent-hub-layout.tsx\`

\- \`src/stores/task-store.ts\`

\*\*Depends:\*\* CS-020

\*\*Task:\*\* When mission starts (after wizard review/launch), create tasks in task-store from plan.

\*\*Acceptance:\*\*

\- Launching mission creates tasks visible in mission board

\*\*Test:\*\*

\- Create mission with plan → board shows tasks immediately

\### CS-022 — Wire Kanban to task-store (mission-scoped view)

\*\*Files:\*\*

\- \`src/screens/gateway/components/kanban-board.tsx\`

\*\*Depends:\*\* CS-020

\*\*Task:\*\* Replace any local state with task-store source:

\- Columns map to statuses

\- Drag/drop updates task-store status

\*\*Acceptance:\*\*

\- Kanban reflects task-store data

\- Dragging updates task status

\*\*Test:\*\*

\- Move card between columns; persists after refresh (if store persists)

\### CS-023 — Update task status from run events (SSE → task-store)

\*\*Files:\*\*

\- \`src/screens/gateway/components/use-live-feed-chat-stream.ts\`

\- \`src/stores/task-store.ts\`

\*\*Depends:\*\* CS-003, CS-020

\*\*Task:\*\* When SSE events contain task references (or infer from markers), update task status.

If event schema lacks task ids, implement a minimal mapping approach:

\- task title match OR explicit \`meta.taskId\` if present

\*\*Acceptance:\*\*

\- As mission runs, tasks move across columns automatically

\*\*Test:\*\*

\- Run mission that emits task progress events → kanban updates

\---

\## Phase 4 — Approvals embedded in Console

\### CS-030 — Pin inline approval card in Run Console when blocked

\*\*Files:\*\*

\- \`src/screens/gateway/components/run-console.tsx\`

\- \`src/screens/gateway/components/inline-approval-card.tsx\`

\*\*Depends:\*\* CS-003

\*\*Task:\*\* If mission status = “Needs Input/Approval” or stream contains approval event:

\- show inline approval card pinned at top of Console

\- highlight relevant agent lane (if lane view)

\*\*Acceptance:\*\*

\- Blocking approval is unmistakable in Console

\*\*Test:\*\*

\- Trigger approval-required mission → pinned card appears

\### CS-031 — Add “next tool call preview” to approval card

\*\*Files:\*\*

\- \`src/screens/gateway/components/inline-approval-card.tsx\`

\*\*Depends:\*\* CS-030

\*\*Task:\*\* Display tool name + sanitized args preview (collapsible).

\*\*Acceptance:\*\*

\- User can see what will execute if approved

\*\*Test:\*\*

\- Approvals show preview; no raw secrets displayed

\---

\## Phase 5 — Discovery + Bootstrap

\### CS-040 — Add gateway “discover agents/models” API + UI button

\*\*Files:\*\*

\- \`src/lib/gateway-api.ts\`

\- \`src/screens/gateway/components/configure-agents.tsx\` (or wherever agents config lives)

\*\*Depends:\*\* none

\*\*Task:\*\* Add \`discoverAgents()\` returning agent descriptors (name, model, provider, tools).

UI: “Detect from Gateway” button → populates list.

\*\*Acceptance:\*\*

\- Discovery populates agents list without manual entry

\*\*Test:\*\*

\- Click detect → agents appear

\### CS-041 — One-click Starter Team generator

\*\*Files:\*\*

\- \`src/screens/gateway/components/teams.tsx\` (or teams config component)

\*\*Depends:\*\* CS-040

\*\*Task:\*\* “Create Starter Team” that creates:

\- Builder, Researcher, Reviewer, Runner (or your naming)

with safe default prompts + tool permissions.

\*\*Acceptance:\*\*

\- Starter team created and selectable in wizard

\*\*Test:\*\*

\- Create starter team → start mission with it

\### CS-042 — Demo mission template (“First Run”)

\*\*Files:\*\*

\- \`src/screens/gateway/components/template-picker.tsx\`

\*\*Depends:\*\* CS-041

\*\*Task:\*\* Add a built-in template: “Demo: Repo Quality Review” (or similar)

\*\*Acceptance:\*\*

\- Template appears and pre-fills goal/settings

\*\*Test:\*\*

\- Pick demo → wizard prefilled → launch

\---

\## Phase 6 — Knowledge Loop (Lessons + Reuse)

\### CS-050 — Auto-generate Run Summary + Lessons on completion (frontend stub)

\*\*Files:\*\*

\- \`src/screens/gateway/components/run-console.tsx\`

\*\*Depends:\*\* CS-003

\*\*Task:\*\* When run completes, show “Generate Summary” CTA that calls gateway API (or stub).

\*\*Acceptance:\*\*

\- Completion state prompts summary generation

\*\*Test:\*\*

\- Completed mission shows CTA; generates summary block

\### CS-051 — Save Lessons to Memory store + suggest reuse in wizard

\*\*Files:\*\*

\- \`src/screens/gateway/agent-hub-layout.tsx\`

\- \`src/screens/memory/\*\` OR existing memory API client

\*\*Depends:\*\* CS-050

\*\*Task:\*\* Save Lessons tagged by template + keywords.

In wizard scope step: show “Similar Missions Found” suggestions.

\*\*Acceptance:\*\*

\- Lessons saved and surfaced on future mission creation

\*\*Test:\*\*

\- Run mission → save lessons → create new mission → suggestions appear

\---

\## Phase 7 — Compare Runs

\### CS-060 — Add Compare selection + Compare view (run-scoped metrics)

\*\*Files:\*\*

\- \`src/screens/gateway/agent-hub-layout.tsx\`

\- \`src/screens/gateway/components/run-compare.tsx\` (new)

\*\*Depends:\*\* CS-001

\*\*Task:\*\* Allow selecting 2 runs from list and open Compare view:

\- time, tokens, cost

\- approvals count

\- errors/failure points

\- task completion deltas (if tasks exist)

\*\*Acceptance:\*\*

\- Compare renders meaningful deltas for two runs

\*\*Test:\*\*

\- Select 2 runs → compare view shows metrics

\---

\# NOTES FOR OPENCLAW EXECUTION

\## Suggested parallelization (multiple Codex agents)

\- Agent A: Phase 1 (CS-001..CS-005)

\- Agent B: Phase 2 (CS-010..CS-012)

\- Agent C: Phase 3 (CS-020..CS-023)

\- Agent D: Phase 4 + Phase 5 (CS-030..CS-042)

\- Agent E: Phase 6 + 7 (CS-050..CS-060)

\## Non-negotiables

\- Keep tickets 1–2 files max (Codex stability)

\- Prefer extraction into new components over editing the 8,704-line file repeatedly

\- Deep link to existing routes instead of duplicating features

\---

If you want, I can also generate “Codex prompts” per ticket (copy/paste ready), including exact line anchors in \`agent-hub-layout.tsx\` to minimize search time.