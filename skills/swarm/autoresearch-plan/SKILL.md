---
name: autoresearch-plan
description: Convert a goal into validated autoresearch contract (scope, metric, verify, guard, executor). Ported from uditgoenka/autoresearch plan subcommand.
version: 2.2.1-hermes
author: Hermes Workspace (adapted from uditgoenka/autoresearch)
metadata:
  hermes:
    tags: [swarm, autoresearch, planning]
    category: swarm
---

# Autoresearch Plan

Used by **orchestrator** when drafting or completing an autoresearch contract. Do not execute the iteration loop here.

## Phase 1 — Analyze goal

- Measurable vs subjective? Subjective goals → route to `architect:design` or `researcher:quick`, not autoresearch.
- Natural scope (files, modules, skill paths)
- Suggest executor: code targets → `developer`; spec/skill/prompt targets → `architect`

## Phase 2 — Derive scope

1. Scan project structure
2. Identify relevant paths; propose globs
3. Set `mutable_target` (exactly one writable surface per loop)
4. Set `locked_eval` (eval scripts, rubrics, guards — must not be mutated)

## Phase 3 — Metric + direction

- Name and description
- `direction`: `higher` or `lower`
- Proxy metrics only when verify command is mechanical

## Phase 4 — Verify command

1. Shell command that prints a single number
2. Safety-screen the command
3. Dry-run → confirm numeric output
4. On failure, adjust and retry

## Phase 5 — Guard (optional)

- Test suite, typecheck, build, or size/lint guard
- Must pass on every kept iteration

## Phase 6 — Iterations

- Simple metric: 10–15
- Moderate: 20–25
- Complex: 30+
- Default bounded; document if `unlimited` requested

## Phase 7 — Output contract YAML

Write to `memory/swarm/orchestrator/<mission>-autoresearch.yaml` or mission-provided path:

```yaml
goal: ...
scope: [...]
mutable_target: ...
locked_eval: [...]
metric: ...
direction: higher | lower
verify: bash path/to/eval.sh
guard: bash path/to/guard.sh
iterations: N
results_log: path/to/results.tsv
rollback: git checkout -- <mutable_target> when metric worsens or guard fails
greenlight: pending | approved — <notes>
executor: architect | developer
```

Hand to orchestrator for greenlight, then dispatch to `{executor}:autoresearch`.
