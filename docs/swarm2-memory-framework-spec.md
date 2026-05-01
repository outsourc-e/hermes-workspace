# Swarm2 Memory Framework Spec

Date: 2026-04-28
Status: Stage 1 implementation spec
Canonical repo: `/Users/aurora/hermes-workspace`

## Goal

Swarm2 workers need continuity across tasks, compaction, restarts, and multi-session missions.

Today each worker has a Hermes profile, a `state.db`, a `runtime.json`, and a tmux session. That gives process identity, but not a structured memory layer. The memory framework adds deterministic file-backed memory that can later be augmented with Claude-native semantic memory providers.

The first version must be simple, inspectable, and durable:

- markdown files for human-readable memory,
- JSON metadata where structure matters,
- atomic writes from server hooks,
- grep-style recall first,
- vector/provider recall later.

## Canonical paths

These paths are locked. Do not substitute Claude/OpenClaw profile paths for worker-local memory.

| Layer | Canonical path |
| --- | --- |
| Worker profile root | `~/.hermes/profiles/<workerId>/` |
| Worker chat DB | `~/.hermes/profiles/<workerId>/state.db` |
| Worker runtime state | `~/.hermes/profiles/<workerId>/runtime.json` |
| Worker memory root | `~/.hermes/profiles/<workerId>/memory/` |
| Worker curated memory | `~/.hermes/profiles/<workerId>/memory/MEMORY.md` |
| Worker identity file | `~/.hermes/profiles/<workerId>/memory/IDENTITY.md` |
| Worker role/persona file | `~/.hermes/profiles/<workerId>/memory/SOUL.md` |
| Worker mission memory | `~/.hermes/profiles/<workerId>/memory/missions/<missionId>/` |
| Worker mission summary | `~/.hermes/profiles/<workerId>/memory/missions/<missionId>/SUMMARY.md` |
| Worker mission event log | `~/.hermes/profiles/<workerId>/memory/missions/<missionId>/events.jsonl` |
| Worker episodic logs | `~/.hermes/profiles/<workerId>/memory/episodes/YYYY-MM-DD.md` |
| Worker handoffs | `~/.hermes/profiles/<workerId>/memory/handoffs/<missionId>.md` |
| Swarm control-plane runtime | `/Users/aurora/hermes-workspace/.runtime/` |
| Swarm mission ledger | `/Users/aurora/hermes-workspace/.runtime/swarm-missions.json` |
| Swarm roster/source of truth | `/Users/aurora/hermes-workspace/swarm.yaml` |
| Shared swarm handoffs | `/Users/aurora/.openclaw/workspace/memory/handoffs/swarm/` |
| Shared swarm archive/memory | `/Users/aurora/.openclaw/workspace/memory/swarm/` |
| Completed mission archive | `/Users/aurora/.openclaw/workspace/memory/swarm/missions/<missionId>/` |

Explicitly wrong paths:

- `~/.hermes/profiles/...`
- `~/.openclaw/profiles/...`
- `/Users/aurora/hermes-workspace/.runtime/...`
- `/Users/aurora/.ocplatform/workspace/...` for new canonical writes

## Ownership model

### Worker-local memory

Stored under `~/.hermes/profiles/<workerId>/memory/`.

Owned by the worker. Used for:

- durable worker identity,
- role-specific conventions,
- mission-local decisions,
- episodic task history,
- compaction/restart handoffs.

### Swarm control-plane state

Stored under `/Users/aurora/hermes-workspace/.runtime/`.

Owned by Swarm2 server code. Used for:

- mission ledger,
- assignment states,
- runtime-generated coordination state,
- transient server artifacts.

### Shared swarm memory

Stored under `/Users/aurora/.openclaw/workspace/memory/swarm/` and `/Users/aurora/.openclaw/workspace/memory/handoffs/swarm/`.

Owned by the orchestrator/main session. Used for:

- cross-worker handoffs,
- mission archives,
- swarm-wide lessons,
- coordination context that should outlive a worker profile.

## File contracts

### `MEMORY.md`

Curated long-term memory for a worker.

Purpose:

- facts and preferences that should survive missions,
- stable role constraints,
- durable lessons,
- recurring gotchas.

Rules:

- concise, curated, not a raw log,
- promoted from mission/episodic memory only when broadly useful,
- loaded at worker startup by the future `swarm-memory` skill.

Initial template:

```markdown
# Memory — <workerId>

## Role

<role and specialty from swarm.yaml>

## Durable operating notes

- ...

## Project conventions

- ...

## Lessons learned

- ...
```

### `IDENTITY.md`

Stable identity metadata.

```markdown
# IDENTITY.md — <workerId>

- Name: <display name>
- Worker ID: <workerId>
- Role: <role>
- Specialty: <specialty>
- Model: <model>
```

### `SOUL.md`

Role/persona instructions for the worker.

Purpose:

- role-specific behavior,
- tone and decision style,
- escalation rules,
- quality bar.

### Mission memory

Path:

`~/.hermes/profiles/<workerId>/memory/missions/<missionId>/`

Files:

- `SUMMARY.md` — human-readable mission context and current state
- `events.jsonl` — append-only structured event stream
- `handoff.md` — latest mission-specific handoff, if any

`SUMMARY.md` template:

```markdown
# Mission <missionId> — <title>

## Current state

- Status: planning | executing | blocked | review | complete
- Current assignment: <assignmentId or none>
- Last updated: <ISO timestamp>

## Objective

<mission objective>

## Decisions

- ...

## Files touched

- ...

## Checkpoints

- ...

## Blockers

- ...

## Next action

...
```

`events.jsonl` event shape:

```json
{"at":"2026-04-28T00:00:00.000Z","type":"dispatch","workerId":"swarm5","missionId":"mission-...","assignmentId":"assign-...","summary":"Dispatched builder task"}
```

Event types:

- `mission-start`
- `dispatch`
- `checkpoint`
- `handoff-requested`
- `handoff-written`
- `resume`
- `blocked`
- `complete`
- `note`

### Episodic logs

Path:

`~/.hermes/profiles/<workerId>/memory/episodes/YYYY-MM-DD.md`

Purpose:

- chronological worker activity,
- easy grep,
- raw-ish but still readable.

Template:

```markdown
# Episodes — <workerId> — YYYY-MM-DD

## HH:MM UTC — <event type>

- Mission: <missionId>
- Assignment: <assignmentId>
- Summary: ...
- Result: ...
- Next action: ...
```

### Handoffs

Worker-local handoff:

`~/.hermes/profiles/<workerId>/memory/handoffs/<missionId>.md`

Shared latest handoff:

`/Users/aurora/.openclaw/workspace/memory/handoffs/swarm/<workerId>-latest.md`

Template:

```markdown
# Handoff — <workerId> — <missionId>

Generated: <ISO timestamp>

## Current state

...

## Objective

...

## Completed

...

## In progress

...

## Files touched

...

## Commands run

...

## Blockers

...

## Next exact action

...

## Resume prompt

When this worker restarts, load this handoff, inspect runtime.json, then continue from "Next exact action".
```

## API contracts

### `GET /api/swarm-memory`

Query params:

- `workerId` required unless reading shared memory
- `kind`: `profile | mission | episodic | handoff | shared`
- `missionId` optional/required for mission memory
- `date` optional for episodic logs

Returns:

```json
{
  "ok": true,
  "workerId": "swarm5",
  "kind": "mission",
  "path": "...",
  "files": [
    { "name": "SUMMARY.md", "path": "...", "content": "..." }
  ]
}
```

### `POST /api/swarm-memory`

Body:

```json
{
  "workerId": "swarm5",
  "kind": "mission",
  "missionId": "mission-...",
  "eventType": "checkpoint",
  "content": "markdown or summary text",
  "event": { "state": "DONE", "result": "..." }
}
```

Rules:

- validate `workerId`, `missionId`, and path traversal,
- create directories on demand,
- write markdown atomically,
- append JSONL events atomically,
- optionally mirror handoffs to shared handoff path.

### `GET /api/swarm-memory/search`

Query params:

- `workerId` optional,
- `query` required,
- `scope`: `worker | shared | all`, default `worker`,
- `limit`, default 10.

Stage 1 implementation:

- grep-like text search over markdown/jsonl files,
- simple ranking: exact phrase > token overlap > recency,
- return snippets with paths and line numbers.

Later:

- use Claude native memory provider or external provider for semantic recall.

## Integration with existing skills

### `swarm-worker-core`

Already defines checkpoint discipline and runtime reporting.

Memory framework adds:

- every checkpoint can become a mission event,
- every checkpoint can append to episodic memory,
- durable lessons can promote to `MEMORY.md`.

### `swarm-dev-runtime`

Already defines Claude-native profile/tmux invariants.

Memory framework must respect:

- `~/.hermes/profiles/<workerId>` profile root,
- `HERMES_HOME` per worker,
- tmux sessions named `swarm-<workerId>`,
- wrappers in `~/.local/bin/swarmN`.

### `swarm-orchestrator`

Uses memory to:

- search worker history before assignment,
- attach relevant mission context to prompts,
- find prior handoffs,
- archive completed missions.

### Role skills

`swarm-pr-worker`, `swarm-ui-worker`, `swarm-bench-worker`, and future role skills use `swarm-memory` for role-specific recall.

### `self-improving-agent`

Provides learning/promotion conventions.

Memory framework adopts:

- daily log pattern,
- `MEMORY.md` as curated long-term memory,
- promotion of broadly useful learnings.

## Startup/resume behavior

Future `swarm-memory` skill should instruct workers to load:

1. `IDENTITY.md`, `SOUL.md`, and `MEMORY.md`,
2. `runtime.json` to detect `currentMissionId`,
3. active mission `SUMMARY.md`, if present,
4. latest local/shared handoff for current mission, if present,
5. recent episodic entries relevant to the active mission.

Resume prompt should be compact:

```text
Load your worker memory from ~/.hermes/profiles/<workerId>/memory/.
If runtime.json has currentMissionId, read that mission SUMMARY.md and latest handoff.
Continue from the handoff's Next exact action.
```

## Auto-write hooks

Stage 1 hooks:

- dispatch start → mission event + episodic entry,
- checkpoint parsed → mission event + episodic entry + update SUMMARY.md,
- lifecycle handoff requested → handoff-requested event,
- handoff written → local handoff + shared latest handoff.

## Safety and privacy

- Do not copy private main-session `MEMORY.md` into worker profiles.
- Workers receive only their own profile memory plus mission/shared swarm memory.
- Shared swarm memory should contain project/process knowledge, not Eric-private context unless explicitly intended.
- All writes must remain inside canonical roots.

## Stage 1 deliverables

1. `src/server/swarm-memory.ts`
2. `src/routes/api/swarm-memory.ts`
3. `src/routes/api/swarm-memory/search.ts` or equivalent route
4. auto-write hooks in dispatch/checkpoint/lifecycle
5. `skills/swarm-memory/SKILL.md`
6. minimal tests for path resolution, writes, and search

## Stage 2 deliverables

1. lifecycle auto-renew integration,
2. worker startup/resume loader prompt integration,
3. mission archive export,
4. worker card memory panel.

## Stage 3 deliverables

1. optional Claude memory provider bridge,
2. vector/semantic recall,
3. cross-worker memory recommendation in decompose/routing.
