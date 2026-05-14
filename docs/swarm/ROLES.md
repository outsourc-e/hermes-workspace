# Swarm Role Presets

The Add Swarm dialog ships with role presets so new Hermes Agents start with a real operating contract instead of a blank textarea and optimism. Pick the closest preset, tune the mission, then start the worker.

Each role has:

- specialty
- default skills
- default model
- when to use it
- canonical spec reference

Canonical project specs live in the swarm specs directory at:

```text
/swarm-specs/projects/<worker>.md
```

Use those specs as the source of truth for standing missions. The role preset is the fast-start shape; the project spec is the durable contract.

## Preset summary

| Preset | Default model | Use when |
| --- | --- | --- |
| Orchestrator | GPT-5.4 | You need dispatch, routing, drift detection, and escalation. |
| Builder | GPT-5.5 | You need product code shipped with tests/build proof. |
| Reviewer | GPT-5.4 | You need byte-verified review and merge readiness. |
| Triage | GPT-5.5 | You need issues/PRs scored, reproduced, patched, or prepared. |
| Lab | GPT-5.4 | You need isolated experiments or local-model benchmarking. |
| Sage | GPT-5.5 | You need research, synthesis, scripts, or launch copy. |
| Scribe | GPT-5.5 | You need docs, specs, handoffs, skills hygiene, memory curation. |
| Foundation | GPT-5.4 | You need runtime, repair, infra, health, or lifecycle work. |
| QA | GPT-5.4 | You need regression, smoke, expected-vs-actual verification. |
| Mirror Integrations | GPT-5.4 | You need upstream sync, integrations, or asset packs. |
| Custom | user-selected | You are creating a lane that does not fit an existing preset. |

## Orchestrator

Specialty: control-plane state, dispatch, drift detection, escalation.

Default skills:

- `swarm-orchestrator`
- `swarm-worker-core`
- `swarm-review-learning-loop`
- `self-improvement`

Default model: GPT-5.4

When to use:

- routing multi-worker missions
- translating intent into SwarmBriefs
- interpreting checkpoints
- detecting drift
- re-prompting workers
- escalating blockers
- managing standing missions

Canonical spec:

```text
/swarm-specs/projects/swarm3.md
```

Good checkpoint:

```text
STATE: HANDOFF
RESULT: Routed docs release to swarm7 and review gate to swarm6 after docs checkpoint.
NEXT_ACTION: Wait for swarm7 NEEDS_REVIEW checkpoint, then dispatch swarm6 byte-verified review.
```

## Builder

Specialty: full-stack implementation, fast ship cycles.

Default skills:

- `swarm-worker-core`
- `byte-verified-code-review`

Default model: GPT-5.5

When to use:

- product UI
- backend endpoints
- integrations
- bug fixes
- feature slices
- focused refactors

Canonical spec examples:

```text
/swarm-specs/projects/swarm5.md
/swarm-specs/projects/swarm10.md
```

Builder should ship narrow diffs, not renovate the cathedral because a button looked lonely.

## Reviewer

Specialty: byte-verified code review, naming, tests, build gate.

Default skills:

- `swarm-worker-core`
- `byte-verified-code-review`
- `swarm-review-learning-loop`

Default model: GPT-5.4

When to use:

- PR readiness
- release branch gates
- generated-file sanity checks
- fragile naming changes
- regression review
- build/test verification

Canonical spec:

```text
/swarm-specs/projects/swarm6.md
```

Reviewer verdicts should be one of:

- APPROVED
- CHANGES_REQUESTED
- BLOCKED

## Triage

Specialty: autonomous PR/issues processor.

Default skills:

- `swarm-worker-core`
- `byte-verified-code-review`
- `swarm-review-learning-loop`

Default model: GPT-5.5

When to use:

- issue backlog scan
- PR feedback triage
- reproduction notes
- minimal failing tests
- small fix branches
- issue ranking

Canonical spec examples:

```text
/swarm-specs/projects/swarm12.md
/swarm-specs/projects/swarm1.md
```

Triage should never silently merge or close. It prepares the work and asks for the gate.

## Lab

Specialty: local-model R&D, spec-dec, benchmarking.

Default skills:

- `swarm-worker-core`
- `pc1-ollama-gguf-bench`
- `swarm-bench-worker`

Default model: GPT-5.4

When to use:

- local model testing
- throughput comparisons
- speculative runtime improvements
- isolated prototypes
- experiment logs

Canonical spec:

```text
/swarm-specs/projects/swarm9.md
```

Lab is allowed to be weird because it is isolated. Product lanes are not.

## Sage

Specialty: research, scripts, X content, creative briefs.

Default skills:

- `swarm-worker-core`
- `last30days`
- `pdf-and-paper-deep-reading`

Default model: GPT-5.5

When to use:

- technical research
- market/model scan
- launch angles
- thread drafts
- creative briefs
- citations

Canonical spec:

```text
/swarm-specs/projects/swarm4.md
```

Sage drafts; humans approve public posting. Use normal research for evidence gathering and synthesis. Use autoresearch only for bounded optimization loops with an explicit Goal/Scope/Metric/Verify/Guard/Iterations contract; see [AUTORESEARCH.md](./AUTORESEARCH.md).

## Scribe

Specialty: docs, skills hygiene, memory curation.

Default skills:

- `swarm-worker-core`
- `last30days`
- `creative-writing`

Default model: GPT-5.5

When to use:

- README updates
- docs trees
- release notes
- handoffs
- specs
- runbooks
- skill documentation
- memory hygiene reports

Canonical spec:

```text
/swarm-specs/projects/swarm7.md
```

Scribe makes the system legible. This is less glamorous than building the system and usually more responsible for whether anyone can use it.

## Foundation

Specialty: infra, repair playbook, autopilot wiring.

Default skills:

- `swarm-worker-core`

Default model: GPT-5.4

When to use:

- runtime APIs
- health checks
- tmux lifecycle
- profile detection
- repair playbook updates
- orchestrator loop wiring
- backend contracts

Canonical spec examples:

```text
/swarm-specs/projects/swarm8.md
/swarm-specs/projects/swarm2.md
```

Foundation keeps the floor from turning into soup.

## QA

Specialty: regression QA, render verification, expected-vs-actual checks.

Default skills:

- `swarm-worker-core`
- `byte-verified-code-review`

Default model: GPT-5.4

When to use:

- smoke tests
- regression checks
- UI expected-vs-actual passes
- artifact verification
- post-build confidence
- release sanity

Canonical spec:

```text
/swarm-specs/projects/swarm11.md
```

QA should say exactly what was checked, exactly what failed, and exactly how to reproduce it.

## Mirror Integrations

Specialty: asset packs, upstream sync, integrations.

Default skills:

- `swarm-worker-core`
- `claude-promo`
- `songwriting-and-ai-music`

Default model: GPT-5.4

When to use:

- upstream diff watching
- integration packaging
- asset collection
- creative asset generation
- cross-lane support

Canonical spec:

```text
/swarm-specs/projects/swarm10.md
```

Mirror Integrations is the lane for portable useful things, not random shiny distractions. There will be random shiny distractions. They are sneaky.

## Custom

Specialty: user-defined.

Default skills: none.

Default model: user-selected.

When to use:

- the worker does not fit an existing role
- you are testing a new lane
- you need temporary specialization
- a future preset is being prototyped

Canonical spec:

```text
/swarm-specs/projects/<new-worker>.md
```

Custom workers should still get:

- `swarm-worker-core`
- a role description
- a specialty
- a mission
- a checkpoint contract
- a clear approval boundary

Blank custom workers become expensive autocomplete. Add structure first.

## Choosing the right role

Use this routing rule:

| If the work is mostly... | Send it to... |
| --- | --- |
| deciding who should do what | Orchestrator |
| changing product code | Builder |
| proving a branch is safe | Reviewer |
| chewing through issues/PRs | Triage |
| experimenting away from release | Lab |
| researching or drafting narrative | Sage |
| explaining, documenting, preserving context | Scribe |
| runtime/health/repair infrastructure | Foundation |
| checking behavior and regressions | QA |
| upstream/integration/assets | Mirror Integrations |
| none of the above | Custom |

## Adding a new role preset

1. Define the role in the UI preset list.
2. Give it a one-line specialty.
3. Give it a standing mission.
4. Choose default skills.
5. Choose default model.
6. Create a canonical project spec.
7. Add it to this document.
8. Dispatch a tiny smoke task and verify a checkpoint.

If step 6 feels like too much work, the role probably is not real yet.
