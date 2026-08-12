# Mission Coordinator

The mission coordinator is the Workspace-side safety layer for Hermes execution. Hermes remains the execution authority; Workspace owns graph readiness, resource leases, preflight, evidence references, and operator visibility.

## API

`/api/mission-coordinator` requires Workspace authentication.

- `GET /api/mission-coordinator` lists coordination missions.
- `GET /api/mission-coordinator?missionId=<id>` returns mission, preflight, and audit events.
- `POST {"action":"template","missionId":"...","objective":"...","template":"coding"}` creates a declarative mission.
- `POST {"action":"preflight","missionId":"..."}` calculates readiness and lock conflicts without mutating state.
- `POST {"action":"claim","missionId":"...","owner":"..."}` acquires the scheduler lease and ready-node resource leases.
- `POST {"action":"complete","missionId":"...","nodeId":"...","owner":"..."}` completes a leased node and advances dependency readiness.
- `POST {"action":"leases"}` lists active leases.

## Scheduling rules

- Missions are dependency graphs.
- Only dependency-satisfied nodes become ready.
- Exclusive locks prevent overlapping write work.
- One scheduler owner may advance a mission at a time.
- A checkpoint or claim is not proof of completion; verification and review remain required before production integration.
- Legacy broadcast callers must migrate to graph nodes before they can safely control write-capable workers.

## Recovery

If Workspace restarts, coordination state remains in:

```text
$HERMES_WORKSPACE_STATE_DIR/coordination.db
```

The database uses SQLite WAL mode. Scheduler and resource leases have expiry timestamps. A recovery process should:

1. inspect `/api/mission-coordinator` and `/api/mission-coordinator` leases;
2. reconcile node state with native Hermes task/run state;
3. allow expired leases to be reclaimed;
4. never delete Hermes tasks, evidence, or artifacts during Workspace rollback;
5. keep a node blocked when upstream capability or evidence state is unknown.

## First canary

Use the coding template:

```text
inspect -> design -> build -> review -> QA -> integrate
```

Run it with one active write node and verify that the build node cannot claim the repository lock until design completes, and that review/QA cannot become ready before their predecessors are done.
