---
name: autoresearch-orchestrate
description: Hermes autoresearch entry — wizard, plan, validate contract, dispatch executor. Use via orchestrator:autoresearch (Claude /autoresearch equivalent).
version: 2.3.0-hermes
author: Hermes Workspace (adapted from uditgoenka/autoresearch)
metadata:
  hermes:
    tags: [swarm, orchestrator, autoresearch, dispatch, wizard]
    category: swarm
---

# Autoresearch Orchestrate (Hermes)

**Modes:** `orchestrator:autoresearch` (default entry) | `orchestrator:autoresearch-dispatch` (contract-only).

Announce on every invocation: `[autoresearch] mode: wizard | classic | contract | plan`

This is the Hermes equivalent of Claude Code `/autoresearch`. Orchestrator owns **wizard → contract → greenlight → dispatch → monitor**. Executors run the loop; orchestrator does **not** mutate `mutable_target`.

Reference: `docs/swarm/AUTORESEARCH-GUIDE.md`, `references/orchestrator-routing.md`.

## Parse user input (first match wins)

| Condition | Mode | Action |
|-----------|------|--------|
| User says `/autoresearch` with **no** goal/metric/verify/contract path | **wizard** | Setup wizard (below) |
| `Metric:` or `Verify:` inline, or full contract block in message | **classic** | `autoresearch-plan` → write contract → dispatch |
| Path to existing `contract.yaml` or `*.yaml` with all fields | **contract** | Validate, dry-run verify/guard, dispatch |
| Only a natural-language goal (no metric/verify) | **plan** | `autoresearch-plan` derive config → confirm → dispatch |
| `--plan-only` or "draft contract only" | **plan** | Write contract, stop before dispatch |

## Setup wizard (mode: wizard)

Use **`clarify`** in one batch (or sequential if clarify unavailable):

1. **Goal** — "What do you want to improve?" (open text)
2. **Target type** — skill/spec/prompt → `executor: architect`; code/tests → `executor: developer`
3. **Mutable file** — suggest from repo scan; user confirms one path
4. **Metric** — what number to optimize; propose verify shell command
5. **Guard** — test/build/size cap, or skip
6. **Iterations** — default **3** for pilot

Then run `autoresearch-plan` phases 2–7: scan scope, dry-run verify/guard, safety-screen commands.

Present derived contract summary. Ask once: **Run pilot now?** (yes → `greenlight: approved — interactive wizard pilot`; no → save contract only).

Write contract to `memory/swarm/orchestrator/<slug>-autoresearch.yaml` (paths **relative to workspace root**).

## Plan mode (natural-language goal)

1. Classify archetype (`references/orchestrator-routing.md`).
2. If not mechanically measurable → refuse autoresearch; route to `researcher:quick` or `architect:design`.
3. Derive scope, metric, verify, guard, executor via `autoresearch-plan`.
4. Dry-run verify/guard; fix paths.
5. Confirm summary with user (clarify if ambiguous).
6. Proceed to dispatch unless `--plan-only`.

## Contract mode (existing YAML)

1. Read contract file.
2. Verify all required fields + `greenlight` contains `approved` (or obtain approval via clarify).
3. Dry-run `verify` and `guard` from workspace root.
4. Fix path prefix bugs (`hermes-workspace/...` → relative paths).
5. Dispatch.

## Classic mode (inline Metric/Verify)

Parse `Goal:`, `Scope:`, `Metric:`, `Direction:`, `Verify:`, `Guard:`, `Iterations:` from message (uditgoenka flag style). Fill missing fields via wizard questions. Write contract → dispatch.

## Choose executor

| mutable_target | executor |
|----------------|----------|
| `*.md` skill/SOUL/routing hint/spec under `skills/`, `agents/`, `memory/` | `architect` |
| `src/**`, `tests/**`, `*.ts`, `*.py`, build configs | `developer` |
| Ambiguous | ask user; default `architect` for docs-only |

## Dispatch (after contract is complete)

Orchestrator does **not** run the iteration loop. Dispatch via **terminal**:

```bash
cd <workspace-root>
architect:autoresearch chat -q "Execute autoresearch per <contract-path>. Log to results_log. End STATE: DONE."
# or
developer:autoresearch chat -q "Execute autoresearch per <contract-path>. Log to results_log. End STATE: DONE."
```

Use `HERMES_SWARM_FORCE_ONESHOT=1` prefix if tmux unavailable.

After dispatch, **monitor** `results_log` TSV; on `STATE: DONE` summarize metric delta. On `BLOCKED`, report blocker.

For **demo / known-good contract**, user may pass path only:

```text
/autoresearch autoresearch-demo/contract.yaml
```

## Safety invariants

- Never push, publish, merge, or deploy without explicit human greenlight.
- Bounded by default (`iterations: 3` pilot); `unlimited` only with explicit approval.
- Screen every `verify` / `guard` command (no `rm -rf`, fork bombs, `curl|sh`, credentials).
- Predicate pinned in contract — do not re-derive mid-run.

## Required contract fields

`goal`, `scope`, `mutable_target`, `locked_eval`, `metric`, `direction`, `verify`, `guard`, `iterations`, `results_log`, `rollback`, `greenlight`, `executor`

## Checkpoint

```text
[autoresearch] mode: <wizard|classic|contract|plan>
STATE: WIZARD | PLANNED | DISPATCHED | MONITORING | DONE | BLOCKED | NEEDS_GREENLIGHT
CONTRACT: <path>
EXECUTOR: architect | developer
DISPATCH_COMMAND: <shell one-liner>
RESULT: ...
NEXT_ACTION: ...
```

## Do not

- Run modify/verify/keep loop yourself (executor only)
- Assign autoresearch to `researcher`
