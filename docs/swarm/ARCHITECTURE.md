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
│ swarm3 / Orchestrator      │
│ routing, drift, escalation │
└───┬────────────────────────┘
    │ dispatches by role + standing mission
    ▼
┌────────────────────────────────────────────────────┐
│ Project Agents                                      │
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
```

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
```

Good checkpoints contain evidence. Bad checkpoints contain adjectives. The swarm optimizes for evidence.

## Notification routing

The notification router lives in `src/server/swarm-notifications.ts`.

Current behavior:

- Checkpoints route to the orchestrator worker by default.
- The default orchestrator worker is `swarm3`.
- The tmux target is `swarm-swarm3`.
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
| `GET /api/swarm-roster` | Return configured Project Agents and role metadata. |
| `GET /api/swarm-runtime` | Return runtime state and tmux attachability. |
| `GET /api/swarm-missions` | Return mission and assignment history. |
| `POST /api/swarm-dispatch` | Send work to one or more Project Agents. |
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
