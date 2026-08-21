# Swarm Architecture

Swarm Mode is built around a durable loop: intent enters through Aurora, dispatch flows through the orchestrator, workers execute in persistent sessions, checkpoints return to the control plane, and only judgment-worthy decisions reach Eric.

## The loop

```text
┌────────┐
│ Eric   │
└───┬────┘
    │ intent, judgment, approval
    ▼
┌────────────┐
│ Aurora     │
│ main agent │
└───┬────────┘
    │ translates intent into SwarmBrief
    ▼
┌────────────────────────────┐
│ Orchestrator                │
│ routing, drift, escalation │
└───┬────────────────────────┘
    │ dispatches by role + standing mission
    ▼
┌────────────────────────────────────────────────────┐
│ Hermes Agents                                      │
│ swarm4 research  swarm5 build  swarm6 review        │
│ swarm7 docs      swarm8 ops    swarm9 lab           │
│ swarm10 patches  swarm11 QA    swarm12 triage       │
└───┬────────────────────────────────────────────────┘
    │ proof-bearing checkpoint
    ▼
┌────────────────────────────┐
│ Reports / Inbox / runtime  │
└───┬────────────────────────┘
    │ orchestrator decides next route
    ▼
┌─────────────────────────────────────┐
│ continue / repair / review / input  │
└─────────────────────────────────────┘
```

The key rule: workers do not free-style message Eric. They checkpoint. The orchestrator routes. Aurora handles judgment. Eric approves the few things that matter.

## Canonical flow

1. Eric states an outcome.
2. Aurora names the work and frames it into a SwarmBrief.
3. The orchestrator selects the right worker or decomposes the work.
4. The worker executes inside its persistent profile and tmux runtime.
5. The worker returns a canonical checkpoint.
6. The notification router sends the checkpoint to the orchestrator by default.
7. The orchestrator decides whether to continue, repair, hand off, review, or escalate.
8. Reports and Inbox make the state inspectable.

## The non-dispatch rule (when NOT to swarm)

The swarm is a graph. Graphs are for work that splits, verifies, resumes, or needs
controlled authority. They are not for every request. Routing simple work through the
full graph is the one configuration the research says always loses: in the Google
DeepMind × MIT study of 180 agent configurations, every multi-agent setup degraded
39-70% on sequential work where each step needs the full picture.

Aurora applies this rule BEFORE framing a SwarmBrief:

| If the request is... | Route it to... |
|---|---|
| Short (< ~15 min of agent time) | Main session, single agent. Do NOT dispatch. |
| One context can hold all relevant info | Main session, single agent. Do NOT dispatch. |
| No independent branches (pure sequential) | Main session, single agent. Do NOT dispatch. |
| Failure is cheap and reversible | Main session, single agent. Do NOT dispatch. |
| Needs parallel work, separate tools/permissions, independent verification, resumable execution, shared state, or gated authority | SwarmBrief → orchestrator → workers |

Any request that fails all four "keep it single" tests may still be dispatched, but
the dispatch must be justified in the SwarmBrief `why_now` field ("requires 3 parallel
research lanes" beats "seemed like a good idea").

Rule of thumb: **more agents is not a strategy. The shape of the work decides.**

## SwarmBrief shape

The canonical YAML lives in `SWARM_SPEC.md` section 3. This is the public shape:

```yaml
brief_id: brief-<timestamp>-<slug>
worker: swarm<N>
project: <project-name>
goal: <one-sentence end state>
why_now: <trigger>
scope:
  - bounded item
deliverables:
  - exact artifact path
test_or_proof:
  - command, review, screenshot, artifact, or byte check
constraints:
  - hard limits
checkpoint_contract:
  state: DONE|HANDOFF|BLOCKED|NEEDS_REVIEW|NEEDS_INPUT
  files_changed: list
  commands_run: list
  proof: tests/build/smoke/review evidence
  next_action: exact handoff
  blockers: exact blocker
escalation:
  on_blocked: route
  on_done: route
budget:
  wall_clock_hours: 2
  max_tokens: 200000        # token ceiling for the whole brief
fanout:
  max_workers: 4            # hard cap on simultaneously dispatched workers
  max_parallel_same_repo: 1 # one writer per file/repo (guardrail)
```

The `fanout` block is a hard cap, not a suggestion. The orchestrator must not exceed
`max_workers` concurrent workers per brief, and must never run two workers against the
same repo simultaneously (one writer per file). If a brief's natural decomposition
needs more than `max_workers`, it must be split into sequenced batches with a merge
checkpoint between them — the orchestrator owns the merge, and a single owner cannot
reconcile 10 simultaneous writers.

A brief is not a prompt dump. It is the smallest operating contract that lets a worker execute without inventing scope.

## Checkpoint contract

Workers return this block:

```text
STATE: DONE | BLOCKED | NEEDS_INPUT | HANDOFF | IN_PROGRESS | NEEDS_REVIEW
FILES_CHANGED: exact paths or none
COMMANDS_RUN: exact commands or none
RESULT: concrete result/proof
BLOCKER: blocker or none
NEXT_ACTION: exact recommended next action
HANDOFF_PAYLOAD:
  type: diff | artifact | report | test_result | review_verdict | none
  path: <exact path to the artifact>   # or "inline"
  schema_version: 1
```

Good checkpoints contain evidence. Bad checkpoints contain adjectives. The swarm optimizes for evidence.

`HANDOFF_PAYLOAD` is the edge contract. It tells the downstream node exactly what data
crosses the boundary and where to find it, so the orchestrator and reviewers read
structured artifacts instead of re-interpreting prose. Rule: `RESULT` may summarize,
but `HANDOFF_PAYLOAD.path` must be precise enough that the next node opens the file
without asking. If a node produces no consumable artifact, use `type: none` explicitly.

## Notification routing

The notification router lives in `src/server/swarm-notifications.ts`.

Current behavior:

- Checkpoints route to the orchestrator worker by default.
- The default orchestrator worker is `orchestrator`.
- The tmux target is `swarm-orchestrator`.
- Duplicate raw checkpoints are suppressed via `runtime.json`.
- `NEEDS_INPUT` escalates to the main session.
- If the orchestrator tmux session is unreachable, the checkpoint escalates to the main session.
- `DONE`, `HANDOFF`, and `BLOCKED` go to the orchestrator first.
- The main session receives direct escalation only when human input is needed or the orchestrator cannot be reached.

That split matters. Without it, the main chat becomes a trash fire of worker trivia. Technical term.

## Standing missions vs ad-hoc dispatches

### Standing missions

A standing mission is a worker's permanent responsibility. Examples:

- Scribe maintains docs and handoffs.
- Reviewer owns the byte-verified review gate.
- Triage works the PR/issues lane.
- Lab runs model/runtime experiments.
- Foundation maintains health and repair infrastructure.

Standing missions are how idle workers stay useful without waiting for Eric to invent busywork.

### Ad-hoc dispatches

An ad-hoc dispatch is a bounded task. It still uses the same profile, same role, same checkpoint format, and same Greenlight Gate.

Examples:

- "Update docs/swarm/QUICKSTART.md for the new Add Swarm dialog."
- "Review PR #42 and return APPROVED/CHANGES_REQUESTED with byte evidence."
- "Reproduce issue #17 and write a minimal failing test."

The system should treat ad-hoc dispatches as missions with smaller blast radius, not as casual chat requests.

## Two-path routing (cost model)

Not every request earns the full graph. The topology is the cost model:

```text
SIMPLE REQUEST  → main agent → quick check → done        (cheap path)
COMPLEX REQUEST → SwarmBrief → orchestrator → workers → review → gate  (deep path)
```

Use cheap models and the short path for bounded extraction, classification, formatting,
and single-shot asks. Reserve the full graph — and the strong models it routes to — for
work that earns it: parallel branches, independent verification, multi-tool authority,
or resumable state. If a request does not clear the non-dispatch rule above AND does not
need the graph's guarantees, it still does not belong in the swarm.

## The three permanent lanes

### Lane A — Launch / demo / creative build lane

Purpose: ship coordinated launch artifacts, demos, media, and release-facing assets.

Typical owners:

- Builder for implementation
- Mirror Integrations for assets
- Sage for narrative and research
- QA for smoke checks
- Scribe for README/showcase copy

### Lane B — Issues + PR autopilot

Purpose: keep open GitHub issues and PRs moving.

Typical owners:

- Triage as primary processor
- Overflow for backup
- Reviewer for gatekeeping
- QA for regression proof

Core loop:

```text
scan -> score -> reproduce -> patch -> test -> PR -> review -> human approval
```

### Lane C — Lab / experiments

Purpose: run experiments without destabilizing the product lane.

Typical owner:

- Lab

Examples:

- local-model benchmark runs
- runtime comparisons
- speculative performance experiments
- prototype loops

Lab gets autonomy because isolation lowers risk. The product lane gets evidence when Lab finds something real.

## Greenlight Gate

The swarm can prepare risky actions. It cannot silently take them.

Require explicit human approval before:

- `git push --force`
- PR merge or close
- issue close without explicit instruction
- release creation
- npm/pnpm publish
- public X/Discord/blog posts
- financial transactions
- destructive file operations
- core service restarts

Docs and local files can be drafted aggressively. Externally visible actions stay gated.

## Auto-repair playbook

The repair playbook maps known failure modes to safe fixes. The orchestrator should consult it before escalating.

Examples of repair classes:

- missing tmux session
- stale worker runtime
- profile path mismatch
- build/test failure with known command
- checkpoint timeout
- auth/token unavailable
- branch drift

Repair is bounded. If a fix would become destructive, externally visible, or speculative, escalate.

## Runtime state

Each worker has a runtime record with fields like:

- worker ID
- role
- state
- phase
- current task
- cwd
- last output time
- last check-in
- last summary/result
- next action
- blocked reason
- checkpoint status
- task counts
- cron counts

The UI uses this to render cards, Reports, Inbox, and runtime attach targets.

## Control-plane endpoints

Important endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/swarm-roster` | Return configured Hermes Agents and role metadata. |
| `GET /api/swarm-runtime` | Return runtime state and tmux attachability. |
| `GET /api/swarm-missions` | Return mission and assignment history. |
| `POST /api/swarm-dispatch` | Send work to one or more Hermes Agents. |
| `POST /api/swarm-tmux-start` | Start a tmux-backed worker session. |
| `POST /api/swarm-tmux-stop` | Stop a worker tmux session. |
| `POST /api/swarm-tmux-scroll` | Scroll a tmux session from the UI. |
| `GET /api/swarm-health` | Summarize local swarm health. |

## Failure philosophy

The system should fail in ways that tell the next actor exactly what to do.

Good blocker:

```text
BLOCKER: gh auth status failed with missing token; cannot create PR.
NEXT_ACTION: Provide a GitHub token or run gh auth login, then re-run PR creation.
```

Bad blocker:

```text
BLOCKER: sandbox issue.
```

No. Absolutely not. The machine either has the tool, token, file, process, or it does not. Name the exact missing piece.

## Review gate

The review lane exists because autonomous work without review is just entropy in a nice jacket.

Reviewer expectations:

- read the diff
- run tests/build/smoke
- byte-check naming-sensitive changes when needed
- verify generated files are intentional
- produce a verdict
- never merge without approval

## Release architecture checklist

Before calling a Swarm v1 release credible:

- Orchestrator can dispatch workers.
- Workers persist in tmux sessions.
- Workers have role metadata and profiles.
- Runtime view can attach or fall back.
- Reports shows checkpoints.
- Inbox surfaces review/input items.
- `NEEDS_INPUT` escalates to the main session.
- Greenlight Gate is documented and respected.
- Docs explain how to run it without tribal knowledge.
