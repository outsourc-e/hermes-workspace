# Swarm2 Autopilot Orchestration Spec

Date: 2026-04-28
Status: implementation spec, staged rollout
Canonical repo: `/Users/aurora/claude-workspace`

## Goal

Swarm2 should behave like a persistent autopilot team, not a prettier multi-chat UI.

A user should be able to tell the orchestrator:

> Set up four agents: one handles PRs, one does research, one builds features, one reviews. Run this mission.

Swarm2 should then:

1. create or update the swarm roster,
2. assign roles, skills, and missions,
3. route work to the right persistent Claude worker sessions,
4. keep each worker running in its own profile/tmux session,
5. collect checkpoints as workers complete subtasks,
6. automatically prompt workers to continue when more work remains,
7. review outputs before calling the workflow complete,
8. surface the whole loop in `/swarm2` without requiring manual babysitting.

## Product principles

- **Persistent agents, not disposable helpers.** Each worker has identity, profile memory, runtime state, and a live session.
- **Roster is source of truth.** Worker number heuristics are fallback only. Routing reads `swarm.yaml`.
- **Proof beats vibes.** Workers checkpoint files changed, commands run, results, blockers, next action.
- **Orchestrator drives the loop.** Workers execute. Orchestrator decomposes, sequences, monitors, re-prompts, reviews, and escalates.
- **Autopilot is staged.** The system should work in manual, semi-auto, then full-auto modes.
- **tmux/Claude native.** Worker sessions are Claude profiles in `swarm-<workerId>` tmux sessions.

## Current foundation

Already present:

- `swarm.yaml`, canonical roster config.
- `/api/swarm-roster`, reads/writes roster entries.
- `/api/swarm-decompose`, routes a mission into assignments.
- `/api/swarm-dispatch`, sends prompts to live tmux/Claude sessions and falls back to one-shot Claude.
- `/api/swarm-runtime`, reads worker `runtime.json`, tmux state, tasks, artifacts, previews.
- `/api/swarm-chat`, reads worker chat history from profile `state.db`.
- `/api/swarm-tmux-start/stop/scroll`, controls persistent sessions.
- Swarm skills:
  - `swarm-worker-core`
  - `swarm-orchestrator`
  - `swarm-dev-runtime`
  - `swarm-ui-worker`
  - `swarm-pr-worker`
  - `swarm-bench-worker`

## Target architecture

```text
User mission
  ↓
Orchestrator
  ↓ reads/writes
swarm.yaml roster + runtime state
  ↓
Decomposer/router
  ↓ produces
Assignment plan
  ↓
Dispatcher
  ↓ per-worker prompt into tmux/Claude
Persistent worker sessions
  ↓ workers checkpoint
runtime.json + state.db + artifacts/previews
  ↓
Orchestrator loop
  ↓
continue / reroute / review / complete / escalate
```

## Roster contract

`swarm.yaml` remains human-readable and portable. Each worker entry should support:

```yaml
workers:
  - id: swarm5
    name: Swarm5
    role: Builder
    specialty: full-stack implementation and UI/system integration
    model: GPT-5.5
    mission: Ship focused product slices in Claude Workspace with tests.
    skills: [swarm-ui-worker, swarm-worker-core]
    capabilities:
      - code-editing
      - ui-implementation
      - build-verification
    defaultCwd: /Users/aurora/claude-workspace
    preferredTaskTypes: [implementation, refactor, ui]
    maxConcurrentTasks: 1
    acceptsBroadcast: true
    reviewRequired: true
```

### Required fields now

- `id`
- `name`
- `role`
- `specialty`
- `model`
- `mission`
- `skills`

### Next fields to add

- `capabilities`
- `defaultCwd`
- `preferredTaskTypes`
- `maxConcurrentTasks`
- `acceptsBroadcast`
- `reviewRequired`

## Runtime contract

Each worker profile may expose `~/.claude/profiles/<workerId>/runtime.json`.

The orchestrator and worker should keep these fields current:

- `workerId`
- `role`
- `state`: `idle | executing | thinking | writing | waiting | blocked | syncing | reviewing | offline`
- `phase`
- `currentTask`
- `activeTool`
- `cwd`
- `lastCheckIn`
- `lastSummary`
- `lastResult`
- `nextAction`
- `blockedReason`
- `checkpointStatus`: `none | in_progress | done | blocked | handoff | needs_input`
- `needsHuman`
- `lastDispatchAt`
- `lastDispatchMode`
- `lastDispatchResult`
- `tasks[]`
- `artifacts[]`
- `previews[]`

## Assignment contract

`/api/swarm-decompose` should return assignments shaped like:

```json
{
  "assignments": [
    {
      "workerId": "swarm4",
      "task": "Research the options and produce a concise recommendation with sources.",
      "rationale": "Research lane owns technical synthesis.",
      "expectedOutput": "Recommendation with tradeoffs and next action.",
      "dependsOn": [],
      "reviewRequired": false
    }
  ],
  "unassigned": []
}
```

Stage 1 only requires `workerId`, `task`, `rationale`.

## Dispatch contract

`/api/swarm-dispatch` should accept either legacy broadcast shape:

```json
{ "workerIds": ["swarm1"], "prompt": "..." }
```

or assignment shape:

```json
{
  "assignments": [
    { "workerId": "swarm4", "task": "...", "rationale": "..." },
    { "workerId": "swarm5", "task": "...", "rationale": "..." }
  ]
}
```

Assignment dispatch must send each worker only its own task, plus compact orchestration context.

## Worker prompt envelope

Every dispatched task should be wrapped with:

1. orchestrator context,
2. worker identity from `swarm.yaml`,
3. skill stack names,
4. current task,
5. checkpoint/reporting contract,
6. continuation instruction.

Example:

```text
## Swarm Orchestrator Dispatch
Worker: swarm5 — Builder
Mission: Ship focused product slices in Claude Workspace with tests.
Skills: swarm-ui-worker, swarm-worker-core

## Assigned Task
...

## Required Checkpoint Format
Reply/check in with:
STATE: DONE | BLOCKED | NEEDS_INPUT | HANDOFF | IN_PROGRESS
FILES_CHANGED: ...
COMMANDS_RUN: ...
RESULT: ...
BLOCKER: ...
NEXT_ACTION: ...

If this is one task in a larger workflow, stop after the checkpoint and wait for orchestrator continuation.
```

## Orchestrator loop

The orchestrator loop runs over runtime state:

1. collect worker states from `/api/swarm-runtime`,
2. inspect recent chat from `/api/swarm-chat`,
3. mark workers stale if `lastCheckIn` is too old,
4. detect blockers,
5. detect completion checkpoints,
6. assign next task if more work remains,
7. route review tasks to reviewer lanes,
8. escalate only when human input is needed.

### Loop states

- `planning`: mission decomposition is being built.
- `dispatching`: initial assignments are going out.
- `executing`: workers are active.
- `checkpointing`: workers are returning proof.
- `reviewing`: reviewer/orchestrator validates outputs.
- `continuing`: next tasks are sent.
- `blocked`: human or environment intervention required.
- `complete`: final handoff is ready.

## Autopilot stages

### Stage 1, landing now

- Router uses real roster metadata instead of hardcoded worker-number roles.
- Decomposer receives full roster context.
- Dispatch accepts per-worker assignments.
- Dispatch writes initial runtime checkpoint.
- Worker prompts include skill/checkpoint contract.

### Stage 2

- Add `/api/swarm-checkpoint` to safely write structured worker checkpoints.
- Parse worker checkpoint messages from chat and update runtime state.
- Add assignment IDs and parent mission IDs.

### Stage 3

- Add `/api/swarm-orchestrator-loop`.
- Loop watches runtime/chat and auto-continues workers.
- Add stale/drift detection.
- Add reviewer lane routing.

### Stage 4

- Add user-facing mission history.
- Add saved workflows/templates.
- Add multi-user bootstrapping so fresh installs can create agents and roles seamlessly.

## Stage 1 smoke test

Mission:

> Test Swarm2 autopilot. Research one improvement, implement one tiny safe artifact, review the result.

Expected route:

- Research worker receives research/checkpoint task.
- Builder receives implementation/checkpoint task.
- Reviewer receives review/checkpoint task.

Pass criteria:

- `/api/swarm-decompose` returns assignment JSON using roster roles.
- `/api/swarm-dispatch` returns `delivery: tmux` for live workers.
- `runtime.json` for each target shows `state: executing`, current task, `checkpointStatus: in_progress`.
- Worker card chat eventually shows the dispatched message.
- At least one worker replies with proof-bearing state.

## Open questions

- Should new roster-only agents auto-create Claude profiles and wrappers, or should Add Swarm remain config-only until first start?
- Should orchestrator loop run in the browser session, server interval, cron job, or persistent Claude orchestrator worker?
- How aggressive should auto-continue be before asking Eric?
- Should reviews be mandatory for code-changing tasks only, or all workflows?

## Recommended next implementation order

1. Stage 1 routing/dispatch/checkpoint patch.
2. Smoke test via direct API and UI.
3. Add `/api/swarm-checkpoint`.
4. Add mission IDs and assignment IDs.
5. Add orchestrator loop endpoint.
6. Add bootstrapping for user-created swarms.
