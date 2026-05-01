# Swarm2 Agent IDE Spec

Status: Draft v1
Date: 2026-04-27
Owner: Aurora / Eric
Surface: `/swarm2`, plus shared agent surfaces in main workspace chat

## 1. Product Thesis

Swarm2 is not a dashboard. Swarm2 is the control plane and IDE for **sub-Hermes agents**.

A user should be able to clone their main Hermes agent as many times as needed. Each clone has the same core access, context shape, skills, memory conventions, workspace tools, and project capabilities as the parent agent, but can run independently on a lane of work.

This is materially different from spawning disposable subagents:

- Subagents are ephemeral workers.
- Sub-Hermes agents are persistent cloned operators.
- Subagents perform a task.
- Sub-Hermes agents own a lane/project and can run on autopilot.
- Subagents lose continuity unless wrapped carefully.
- Sub-Hermes agents carry persistent profile state, runtime metadata, tasks, logs, sessions, skills, and project awareness.

The swarm product promise:

> Clone your agent into a team, give each clone a lane, watch the work happen live, intervene when needed, and inspect/edit/ship outputs without leaving the swarm IDE.

## 2. Core Concepts

### 2.1 Main Agent / Hub

The main agent is the orchestrator.

In `/swarm2`, the main agent should appear as a compact hub node/card, not as a giant chat panel. Its job is to:

- route work
- monitor agents
- coordinate collaboration
- surface decisions/blockers
- maintain the swarm topology

The hub card should show:

- avatar / identity
- active swarm count
- room / collaboration count
- blockers / auth errors
- active project lanes
- routing controls

It should not consume the main content area with a full chat UI.

### 2.2 Sub-Hermes Agent

A swarm agent is a cloned Hermes profile with:

- model/provider config
- skills/tool access
- memory/profile files
- runtime metadata
- sessions/history
- tasks/cron/autopilot state
- project cwd
- logs/output
- terminal/TUI session
- optional dev server / preview URL

Each worker card should be a compact IDE tile for that clone.

### 2.3 Agent Lane

Each cloned agent can own a lane:

- project lane, e.g. BenchLoop
- PR lane
- research lane
- review lane
- issue queue lane
- docs lane
- ops lane

A lane has:

- current objective
- task queue
- project context
- live chat
- terminal/TUI
- preview/editor surfaces
- handoff/checkpoint state

### 2.4 Autopilot

Autopilot is orchestration over persistent cloned agents.

Autopilot should:

- assign tasks to the right cloned agent
- keep agents moving with proof-based checkpoints
- detect drift/staleness/blockers
- re-prompt or reroute when needed
- summarize meaningful results
- avoid interrupting the user unless a decision, blocker, or landed result matters

## 3. Required Surfaces

### 3.1 Swarm Hub

A compact top-center hub card.

Required:

- Main agent identity/avatar
- Swarm status metrics
- Routing / dispatch button
- Active room/collaboration count
- Blocker/auth health
- Wire anchor to worker cards

Not required:

- Full embedded main chat panel

### 3.2 Worker Cards

Each worker card is the primary control unit.

Required fields:

- worker name/id
- role/lane
- status: idle, working, thinking, reviewing, blocked, waiting, offline
- model/provider
- current task
- task queue preview
- latest chat messages
- latest runtime/log signal
- project/cwd/branch
- preview URL if available
- terminal/TUI attach state
- quick actions: chat, route, tasks, terminal, preview, editor

### 3.3 Live Worker Chat

Worker chat must be real, not local-only card history.

Required:

- Pull latest messages from the worker's actual session history/state.db/API
- Poll or subscribe for updates
- Show user/assistant/tool-ish messages compactly
- Sending from the card dispatches to that worker's real profile/session
- LocalStorage is allowed only as fallback/draft cache

Acceptance:

- If a worker was prompted by autopilot, the card reflects that conversation.
- If the user sends a message to a worker, the reply appears in the same live feed.

### 3.4 Task Queue

Each worker card should show its task state.

Required:

- current task
- next 2-3 queued tasks
- blocked/waiting indicators
- done/recently completed count
- click to open full task drawer or `/tasks?assignee=workerId`

Task sources:

- Hermes tasks API
- worker runtime.json currentTask/state
- optional project issue/PR metadata

### 3.5 Live Terminal / TUI

Swarm2 should host the actual live worker terminal/TUI when available.

Required:

- auto-detect active worker terminals
- mount active terminals by default in runtime view
- allow add/remove terminal panes
- attach to real tmux/session when available
- fallback to live log tail or shell when no attachable terminal exists
- preserve exact TUI interaction where possible

Acceptance:

- User can use the agent's TUI directly from Swarm2.
- Runtime view should not require manually knowing a tmux session name.

### 3.6 Project Preview

If an agent is working on a local project/site, Swarm2 should expose it.

Required:

- detect project cwd
- detect package/dev server config where possible
- surface known local URL(s), e.g. localhost ports
- show embedded preview panel
- show project label, branch, changed files

Acceptance:

- If swarm4 is working on BenchLoop and a local preview is running, the user can view it inside Swarm2 without leaving the page.

### 3.7 Editor / Diff Surface

Swarm2 should evolve into a Bolt-like agent IDE.

Phase 1:

- file browser for the worker's project cwd
- open/read files
- edit/save files
- diff view
- changed files list

Phase 2:

- visual element picker from preview
- selected element -> create fix task
- agent-assisted edits
- accept/reject patch workflow

Acceptance:

- User can inspect and modify agent output from the swarm surface.

### 3.8 Collaboration / Office View

Cards should communicate collaboration visually.

Concept:

- each worker has a small 2x2 office space in its card
- tools/status light up areas of the office
- when workers collaborate, their cards/offices connect into a larger shared office
- wires show collaboration lanes and routing

Required first pass:

- visual grouping by project/lane
- stronger connected state for workers in same room/project
- collaboration wire emphasis

Later:

- mini office avatars/scenes
- shared workspace expansion
- tool/state animations

### 3.9 Main Chat Agent Sidebar

Main workspace chat should get an agent sidebar inspired by Clawsuite.

Required:

- active cloned agents
- CLI/ACP/sub-Hermes sessions
- status/current task
- latest output
- issues/PRs solved
- quick open into Swarm2 card/session/terminal/preview
- Hermes-inspired avatars

Acceptance:

- User can monitor all agent work from the main chat surface without opening Swarm2.

## 4. Data Contracts

### 4.1 `runtime.json`

Each worker should write/maintain:

```json
{
  "workerId": "swarm4",
  "state": "working",
  "currentTask": "Implement BenchLoop leaderboard API",
  "activeTool": "terminal",
  "cwd": "/path/to/project",
  "projectName": "bench-loop",
  "branch": "feature/leaderboard-api",
  "pid": 12345,
  "tmuxSession": "swarm4",
  "terminalKind": "tmux|pty|log-tail|none",
  "previewUrls": ["http://localhost:3002"],
  "lastOutputAt": 1777269485753,
  "lastEvent": "Build passed",
  "blockedReason": null
}
```

### 4.2 Worker Metadata

Each worker should have `swarm.yaml` or equivalent:

```yaml
id: swarm4
displayName: BenchLoop Worker
role: Benchmark / Experiment Lane
specialties:
  - BenchLoop
  - local model benchmarks
  - experiment reporting
preferredTasks:
  - benchmark runs
  - quality gates
  - result synthesis
avoidTasks:
  - UI-heavy work
projectHints:
  - bench-loop
  - bench-loop-app
```

### 4.3 Chat History API

Add/standardize:

`GET /api/swarm-chat?workerId=swarm4&limit=30`

Returns:

```json
{
  "workerId": "swarm4",
  "sessionKey": "...",
  "messages": [
    { "role": "user", "content": "...", "timestamp": 1777269485753 },
    { "role": "assistant", "content": "...", "timestamp": 1777269490000 }
  ]
}
```

### 4.4 Task API

Worker cards should consume:

- `GET /api/hermes-tasks?assignee=swarm4&include_done=false`
- or existing task endpoint equivalent

### 4.5 Project Preview API

Add:

`GET /api/swarm-project?workerId=swarm4`

Returns:

```json
{
  "workerId": "swarm4",
  "cwd": "/path/to/project",
  "projectName": "bench-loop",
  "branch": "feature/x",
  "changedFiles": ["api/main.py", "ui/src/App.tsx"],
  "previewUrls": ["http://localhost:5173"],
  "packageScripts": ["dev", "test", "build"]
}
```

## 5. UX Layout

### Default `/swarm2` Layout

1. Header/stat strip
2. Compact hub node
3. Worker card grid
4. Recent activity feed
5. Floating router/dispatch drawer

### Worker Card Expanded Drawer

Tabs:

- Chat
- Tasks
- Terminal
- Preview
- Files/Diff
- Logs

### Runtime View

- auto-populated terminal grid for active workers
- add/remove terminal pane controls
- fallback panes for logs if no terminal attach exists

### Project View

- preview iframe
- file tree/editor
- changed files/diff
- worker chat sidecar

## 6. Implementation Phases

### Phase 1 — Make Swarm2 operationally useful

- Remove giant main-agent chat from hub
- Make hub compact
- Replace fake worker chat with real session history
- Add task queue panel to cards
- Add runtime terminal auto-population
- Add project/cwd/preview metadata badges

### Phase 2 — Agent IDE foundation

- Worker drawer with tabs
- File browser/read/edit
- changed files + diff
- project preview iframe
- terminal/log fallback polish

### Phase 3 — Autopilot orchestration

- profile metadata (`swarm.yaml`)
- routing uses worker specialties
- autopilot check-in reads real runtime/task/chat states
- proof-based checkpoint prompts
- drift/blocker detection

### Phase 4 — Collaboration visuals

- 2x2 office card visuals
- shared office expansion for collaborating workers
- project/lane clustering
- stronger topology and collaboration wires

### Phase 5 — Main workspace integration

- Agent sidebar in main chat
- Active cloned agents/sub-Hermes list
- latest output/status
- issues/PR solved summaries
- jump into Swarm2 views

## 7. Acceptance Criteria

Swarm2 is solid when:

- User can clone multiple full Hermes agents and see them as persistent workers.
- User can understand what every worker is doing without leaving `/swarm2`.
- User can chat with any worker and see real recent messages.
- User can see each worker's tasks and blockers.
- User can attach to live terminals/TUIs or live log fallback.
- User can view the local project/site each worker is modifying.
- User can inspect/edit files or diffs from the same surface.
- Autopilot can monitor workers and re-prompt based on real evidence.
- Main chat can show the same agent state in a sidebar.

## 7.1 Promotion & Deprecation Path

`/swarm` is v0 and got cluttered. `/swarm2` is the keeper. Lock-in:

1. Promote `/swarm2` to `/swarm`. Keep `/swarm2` as a redirect for one release.
2. Delete legacy components and screen:
   - `screens/swarm/swarm-screen.tsx`
   - `components/swarm/topology-band.tsx`
   - `components/swarm/widget-rail.tsx`
   - `components/swarm/agent-card.tsx`
   - `components/swarm/swarm-hub.tsx`
   - `components/swarm/swarm-orchestration.tsx`
   - `components/swarm/swarm-runtime-strip.tsx`
   - `components/swarm/swarm-health-strip.tsx`
   - `components/swarm/swarm-compose.tsx`
3. Keep only what the new surface uses: `swarm-terminal.tsx`, `router-chat.tsx`, and `swarm-node-chat.tsx` until real-chat replaces it.
4. Move `screens/swarm2/*` into `screens/swarm/*` after promotion.
5. Sidebar nav label: "Swarm". Drop Swarm2 branding everywhere.
6. Remove `SWARM2_SURFACE_CONTRACT.keepsLegacySwarmRoute = true`.
7. Rename `swarm2-screen.test.ts` to `swarm-screen.test.ts` and audit stale imports.

Acceptance: one Swarm route, no duplicates, all swarm tests green, docs/README/nav updated, `/swarm2` redirects for one release then 404s.

## 8. Non-goals for immediate pass

- Full visual editor parity with Bolt in Phase 1
- Perfect cross-machine terminal streaming before local attach works
- Full PR/issue automation UI before worker/task runtime is reliable
- Replacing `/swarm`; `/swarm2` remains the new product surface until stable

## 9. Immediate Next Build Pass

Execution contract for this mission:
- Context, memory, and handoffs come from `/Users/aurora/.openclaw/workspace`
- Swarm2 code, git, build, and tests run in `/Users/aurora/hermes-workspace`
- Do not use legacy workspace aliases
- Before any build/test/git loop, run:

```bash
cd /Users/aurora/hermes-workspace &&
pwd &&
test -f package.json &&
jq -r .name package.json
```

Start here:

1. Shrink `Swarm2OrchestratorCard` to hub-only, no embedded main chat.
2. Add `/api/swarm-chat` and wire worker cards to real history.
3. Add per-card task queue preview.
4. Add active project/cwd/preview badges from runtime/project API.
5. Make runtime view auto-populate active workers and attach/fallback cleanly.
6. After new route-module changes, prefer a full dev-server restart over trusting hot reload.

This turns `/swarm2` from a beautiful control surface into the first version of the actual sub-Hermes IDE.
