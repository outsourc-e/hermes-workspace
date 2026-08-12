---
name: autoresearch
description: Bounded optimization-loop contract and discipline — see docs/swarm/AUTORESEARCH.md.
version: 2.2.1-hermes
author: Hermes Workspace (contract index; loop ported from uditgoenka/autoresearch)
metadata:
  hermes:
    tags: [swarm, autoresearch, optimization]
    category: swarm
---

# Autoresearch (Swarm)

Reference: `docs/swarm/AUTORESEARCH.md` in hermes-workspace. Classic loop semantics from [uditgoenka/autoresearch](https://github.com/uditgoenka/autoresearch).

```text
normal research     = gather evidence -> synthesize facts (researcher:quick)
autoresearch        = mutate one target -> verify metric -> keep/revert -> repeat
orchestrator        = contract + greenlight + dispatch
executor            = architect:autoresearch | developer:autoresearch (runs loop)
```

## When to use

Only when a **scalar metric** and **mechanical verify/guard commands** exist. If evaluation requires human judgment, stay in `researcher:quick` or `architect:design`.

## Contract fields

Required: `goal`, `scope`, `mutable_target`, `locked_eval`, `metric`, `direction`, `verify`, `guard`, `iterations`, `results_log`, `rollback`, `greenlight`, **`executor`** (`architect` | `developer`).

## Role skills

| Role | Skill | Action |
|---|---|---|
| `orchestrator` | `autoresearch-orchestrate`, `autoresearch-plan` | **`orchestrator:autoresearch`** — wizard/plan/contract → dispatch |
| `orchestrator` | same | `orchestrator:autoresearch-dispatch` — contract-only dispatch |
| `architect` | `autoresearch-execute` | Run loop on spec/skill/prompt targets |
| `developer` | `autoresearch-execute` | Run loop on code/test targets |
| `researcher` | — | May supply facts; does **not** run autoresearch |
