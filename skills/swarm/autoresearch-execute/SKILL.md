---
name: autoresearch-execute
description: Classic autoresearch loop — modify, verify, keep/discard against a pinned metric. Runs on architect or developer after orchestrator dispatch.
version: 2.2.1-hermes
author: Hermes Workspace (adapted from uditgoenka/autoresearch classic loop)
metadata:
  hermes:
    tags: [swarm, autoresearch, optimization, execute]
    category: swarm
---

# Autoresearch Execute

**Modes:** `architect:autoresearch` | `developer:autoresearch`. Announce executor mode on entry.

Runs only when orchestrator dispatched a **complete** contract with `greenlight: approved`. Full spec: `docs/swarm/AUTORESEARCH.md`.

## Entry gate

Required fields: `goal`, `scope`, `mutable_target`, `locked_eval`, `metric`, `direction`, `verify`, `guard`, `iterations`, `results_log`, `rollback`, `greenlight`, `executor`.

If any missing or `greenlight` not approved → `STATE: BLOCKED` — return to orchestrator.

## Precondition checks

1. Git repo exists
2. Warn if dirty tree (non-fatal for demo)
3. Screen `verify` / `guard` for dangerous commands
4. Run guard baseline if configured

## Establish baseline (iteration 0)

1. Run `verify` → numeric metric
2. Append TSV row: `0\t{timestamp}\t{commit}\t{metric}\t0.0\t{guard}\t-\tbaseline\tinitial state`
3. Header: `# metric_direction: {direction}\niteration\ttimestamp\tcommit\tmetric\tdelta\tguard\tguard-metric\tstatus\tdescription`

## Iteration loop (1 … N)

### Review
- Read last rows of `results_log`
- `git log --oneline -20`; if last status was `keep`, inspect `git diff HEAD~1`

### Modify
- **One** focused change to `mutable_target` only
- Architect: spec/skill/prompt edits. Developer: code/test edits per contract scope.

### Commit
- `experiment: {description}` prefix

### Verify + guard
- Run `verify`; compute delta vs previous kept metric
- Run `guard` if set

### Decide
- **keep** — improved (correct direction) and guard passed
- **discard** — worsened → apply `rollback` / `git revert HEAD --no-edit`
- **crash** / **metric-error** — revert
- **no-op** — no change

### Log
Append TSV row every iteration.

## Prohibited

- Mutate `locked_eval` or broaden `scope`
- Metric hacking, disabling guards, skipping verify
- Background/unbounded loops without orchestrator greenlight

## Exit checkpoint

```text
STATE: DONE | BLOCKED
FILES_CHANGED: ...
COMMANDS_RUN: verify, guard, git ...
RESULT: start_metric → end_metric, kept/discarded counts
BLOCKER: ... or none
NEXT_ACTION: hand to architect review (developer) or orchestrator (architect)
```
