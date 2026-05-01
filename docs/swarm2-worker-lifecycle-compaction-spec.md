# Swarm2 Worker Lifecycle + Compaction Spec

Date: 2026-04-28
Status: staged implementation

## Problem

Swarm workers are persistent Claude agents with their own profiles, sessions, tmux panes, runtime state, and memory. That is the right architecture, but long-running workers will eventually degrade when context approaches the model window.

We need an automatic lifecycle system so workers can:

1. run with large context budgets,
2. checkpoint before quality drops,
3. write durable handoffs,
4. restart/new themselves cleanly,
5. resume from handoff and mission state,
6. keep the orchestrator informed.

## Target behavior

Each worker gets a context policy:

- soft limit: 250k tokens, request concise checkpoint soon
- handoff limit: 400k tokens, write full handoff before more work
- hard limit: 500k tokens, stop accepting new work until renewed

Exact numbers should be configurable per model/profile, but default policy should be safe.

## Lifecycle states

- `healthy`: under soft limit
- `watch`: over soft limit, continue but monitor
- `handoff_required`: over handoff limit, ask worker to write handoff
- `renew_required`: over hard limit or repeatedly stale/fragmented
- `renewing`: handoff was requested and tmux/session is being restarted
- `blocked`: renewal failed or handoff missing

## Handoff contract

Before renewal, worker must write or return a handoff containing:

```text
STATE: HANDOFF
FILES_CHANGED: ...
COMMANDS_RUN: ...
RESULT: current state and what landed
BLOCKER: blocker or none
NEXT_ACTION: exact next step after renewal
```

Durable handoff path:

```text
/Users/aurora/.openclaw/workspace/memory/handoffs/swarm/<workerId>-latest.md
```

Optional timestamped archive can exist later, but `latest.md` is the resume source.

## Renewal sequence

1. Detect context pressure from Claude `state.db` session token counts.
2. Ask worker for handoff via tmux dispatch.
3. Parse handoff checkpoint from chat.
4. Save handoff into durable memory path.
5. Stop worker tmux session.
6. Start clean Claude session with same profile and cwd.
7. Send resume prompt containing handoff summary + active mission assignment.
8. Mark runtime state healthy/executing.

## Product requirements

Swarm2 UI should show:

- context state per worker
- current session token estimate
- lifecycle status
- last handoff time
- renew button
- automatic renewal status

## Safety rules

- Never auto-renew while worker is actively writing unless hard limit is reached.
- Never start destructive execution after renewal without mission policy allowing it.
- Handoff must be complete before restart unless human forces renewal.
- If handoff parse fails, mark worker `blocked` and ask orchestrator/human.

## Stage 1 implementation

- Add lifecycle status API.
- Read latest session token counts from `state.db`.
- Return lifecycle state and recommended action.
- Add request-handoff action that sends a strict handoff prompt to tmux.
- Add renew action, but require `force: true` for now.
- Normalize swarm wrappers to use `/Users/aurora/claude-workspace` cwd.

## Stage 2

- Parse handoff checkpoints into durable handoff files.
- Add runtime.json fields for `contextTokens`, `contextState`, `lastHandoffAt`.
- Add Swarm2 UI lifecycle badges.

## Stage 3

- Automatic renewal loop.
- Resume prompt with mission state.
- Per-model context policies.
