# Swarm Skills

Skills are the reusable operating knowledge behind Swarm Mode. A role preset names the skills a worker should load; the profile and skills path make those skills available at runtime.

A skill is not a vibe. It is a procedure: when to use it, what commands to run, what files matter, what pitfalls exist, and how to verify the result.

## Bundled swarm skills

| Skill | Use it for |
| --- | --- |
| `swarm-orchestrator` | Orchestrator loop, dispatch, drift detection, re-prompts, escalation, mission routing. |
| `swarm-worker-core` | Base worker contract: phases, checkpoints, runtime state, blockers, handoffs. |
| `swarm-review-learning-loop` | Capture review learnings, recurring failures, and skill improvements after tasks. |
| `byte-verified-code-review` | Review diffs with byte-level proof for naming-sensitive and generated-file changes. |
| `swarm-bench-worker` | Benchmark/lab work for local models, runtime experiments, and result logging. |
| `swarm-pr-worker` | GitHub issue/PR workflow, triage, patching, PR prep, review feedback. |
| `swarm-ui-worker` | UI implementation lane for Project Workspace surfaces. |
| `swarm-dev-runtime` | Runtime contracts, backend APIs, lifecycle, health, and repair wiring. |
| `swarm-memory` | File-backed memory expectations for workers and orchestrator history. |
| `swarm-orchestration-loop` | Canonical orchestration/review loop for persistent worker fleets. |
| `swarm-review-learning-loop` | Shared loop for turning task outcomes into durable improvements. |

Some installations may name the byte review skill differently. If the exact skill is not present, use the available review skill that enforces byte checks, diff review, tests, build, smoke, and verdict discipline.

## How skills auto-load

When you clone the repo and run the workspace, worker sessions load skills from the configured Project Agent profile. In Eric's release environment, profiles point at a shared skills directory, commonly exposed to workers as:

```text
~/.ocplatform/workspace/skills/
```

A worker profile can also carry profile-local skills under:

```text
~/.claude/profiles/<workerId>/skills/
```

The important rule is that the worker's runtime must be able to resolve the skill name from its profile. The UI can display a role's default skills, but the worker still needs the skill files available locally.

## Role-to-skill defaults

| Role | Default skills |
| --- | --- |
| Orchestrator | `swarm-orchestrator`, `swarm-worker-core`, `swarm-review-learning-loop`, `self-improvement` |
| Builder | `swarm-worker-core`, `byte-verified-code-review` |
| Reviewer | `swarm-worker-core`, `byte-verified-code-review`, `swarm-review-learning-loop` |
| Triage | `swarm-worker-core`, `byte-verified-code-review`, `swarm-review-learning-loop` |
| Lab | `swarm-worker-core`, `pc1-ollama-gguf-bench`, `swarm-bench-worker` |
| Sage | `swarm-worker-core`, `last30days`, `pdf-and-paper-deep-reading` |
| Scribe | `swarm-worker-core`, `last30days`, `creative-writing` |
| Foundation | `swarm-worker-core` |
| QA | `swarm-worker-core`, `byte-verified-code-review` |
| Mirror Integrations | `swarm-worker-core`, `claude-promo`, `songwriting-and-ai-music` |
| Custom | no default skills |

## What each core skill contributes

### swarm-worker-core

Base contract for every Project Agent:

- understand the task
- set phase
- execute the next meaningful step
- verify
- checkpoint
- continue, escalate, or stop cleanly

If a worker has only one skill, it should have this one.

### swarm-orchestrator

Used by the orchestrator lane. It owns:

- mission decomposition
- role-based routing
- drift detection
- checkpoint interpretation
- re-prompting
- escalation
- lane priority
- handoff hygiene

The orchestrator should not be the best coder in the room. It should be the worker that makes every other worker useful.

### swarm-review-learning-loop

Used after completed work and reviews to convert outcome into memory or skill improvements. This prevents the swarm from repeatedly stepping on the same rake and calling it research.

### byte-verified-code-review

Used for review gates. It forces proof instead of "looks fine":

- inspect exact diff
- byte-check fragile naming or generated output
- run tests/build/smoke
- state verdict
- document blockers precisely

### swarm-bench-worker

Used by Lab for local-model and runtime experiments:

- benchmark plan
- controlled run
- result capture
- reproducibility notes
- escalation threshold

### swarm-pr-worker

Used by PR/issues lanes:

- issue scan
- scoring
- reproduction
- branch discipline
- fix/test/PR prep
- review feedback handling

### swarm-ui-worker

Used by UI builders:

- route inspection
- component boundaries
- visual state
- smoke checks
- build verification

### swarm-dev-runtime

Used by Foundation/runtime lanes:

- API contracts
- profile/runtime state
- health checks
- lifecycle repair
- tmux/gateway integration

## Adding custom skills

Create a skill directory with a `SKILL.md` file:

```text
skills/my-skill/
  SKILL.md
  references/
  templates/
  scripts/
```

Recommended frontmatter:

```yaml
---
name: my-skill
description: One sentence explaining when a worker must load this skill.
---
```

Recommended sections:

```markdown
# My Skill

## Trigger
When to use it.

## Steps
1. Exact first step.
2. Exact second step.
3. Verification.

## Pitfalls
- Known failure mode.
- Exact unblock action.

## Output contract
What the worker must return.
```

## Adding a custom skill to a worker

1. Add the skill folder to the shared skills directory or the worker profile's `skills/` directory.
2. Add the skill name to the role preset or worker roster entry.
3. Restart or rotate the worker session so the profile reloads.
4. Dispatch a small task that requires the skill.
5. Verify the checkpoint names the skill and returns proof.

## Skill hygiene rules

A skill should be patched when:

- a command is stale
- a path changed
- a setup assumption is wrong
- a worker hit a recurring error not documented there
- the user's preferred workflow changed
- a better verification step exists

Do not create a memory note for a procedure that belongs in a skill. Memory stores durable facts; skills store repeatable workflows.

## Skill loading checklist

Before blaming a worker:

- Does the skill exist by exact name?
- Does the worker profile have access to the skills directory?
- Did the session start after the skill was added?
- Does the role preset include the skill?
- Did the task require the worker to load it?
- Did the checkpoint show evidence that the procedure was followed?

## Minimum viable skill for Swarm v1

For a useful worker:

```text
swarm-worker-core
```

For a useful orchestrator:

```text
swarm-orchestrator
swarm-worker-core
swarm-review-learning-loop
```

For a useful reviewer:

```text
swarm-worker-core
byte-verified-code-review
swarm-review-learning-loop
```

Everything else is specialization.
