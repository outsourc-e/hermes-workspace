# Swarm Mode

Swarm Mode is the Hermes Workspace control plane for Hermes Agents: persistent workers, a standing orchestrator, a review gate, and enough runtime visibility that the system is understandable instead of mystical.

The release promise is simple:

- Unlimited Hermes Agents can exist.
- One orchestrator translates intent into dispatch.
- Zero humans have to manually route every task.
- Every worker has a role, a profile, a mission, and a checkpoint contract.
- Every risky action still routes through the Greenlight Gate.

This is not a chat wrapper with tabs. It is the operating surface for a local agent swarm.

## Start here

- [QUICKSTART.md](./QUICKSTART.md) — clone, run, detect profiles, spawn workers, dispatch the first task.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — loop, SwarmBrief shape, notification routing, lanes, review, repair.
- [SKILLS.md](./SKILLS.md) — bundled swarm skills, auto-loading, and custom skill conventions.
- [ROLES.md](./ROLES.md) — role presets used by the Add Swarm dialog and the canonical project specs.

## The 30-second model

Eric talks to Aurora. Aurora turns intent into a brief. The orchestrator routes that brief to the right Hermes Agent. Workers execute inside persistent tmux sessions, checkpoint with proof, and the orchestrator decides whether to continue, repair, escalate, or put a card in the Inbox.

```text
Eric -> Aurora -> swarm3/orchestrator -> role workers -> checkpoints -> reports/inbox -> review/escalation
```

The important move is that dispatch becomes a system, not a vibe. The worker is not just "another model call." It is a named lane with memory, runtime state, default skills, a profile, and a job.

## What ships in v1

### Orchestrator Chat

The orchestrator chat is the main command surface. Use it to ask for one action, a decomposed plan, or a broadcast. It can route to specific workers, create missions, wait for checkpoints, and push follow-up prompts when a worker drifts.

### Multi-Agent Control Plane

The Swarm surface shows workers as operational cards: role, state, current task, model, recent signal, room membership, and action affordances. You can inspect the topology instead of guessing which agent is alive.

### Kanban TaskBoard

The TaskBoard gives the swarm a planning surface: backlog, ready, running, review, blocked, done. It is intentionally boring. Boring task state beats a beautiful graveyard of half-finished chats.

### Reports + Inbox

Reports and Inbox are where the swarm becomes reviewable. Checkpoints with `NEEDS_REVIEW`, blockers, handoffs, and escalation-worthy summaries land here so Eric can approve the few things that need judgment.

### TUI View built in

Runtime view attaches to tmux-backed workers when available. If tmux is not available, the workspace falls back to a shell or log tail. The goal is direct observability: if a Hermes Agent is doing something, you can see the lane.

## Core terms

| Term | Meaning |
| --- | --- |
| Hermes Agent | A named, persistent worker with a role, profile, skills, and runtime state. |
| Orchestrator | The Hermes Agent responsible for dispatch, drift detection, routing, and escalation. |
| SwarmBrief | The canonical task shape sent from orchestrator to worker. |
| Standing mission | A permanent responsibility a worker resumes when idle. |
| Ad-hoc dispatch | A one-off task sent through the same checkpoint contract. |
| Checkpoint | The proof-bearing status block returned by a worker. |
| Greenlight Gate | Human approval boundary for irreversible or externally visible actions. |
| Repair playbook | Known failures mapped to safe repairs before escalation. |

## Mental model for users

The workspace gives you three levels of control:

1. Ask the orchestrator for an outcome.
2. Inspect and steer the mission from the control plane.
3. Drop into the worker runtime only when you need exact evidence.

You should not need to babysit every step. You should be able to ask for a release doc pass, see the docs worker take it, watch the checkpoint land, send the reviewer lane next, and approve the PR only when the review says it is real.

## What Swarm Mode is good at

- Release trains with docs, build, review, QA, and PR steps.
- Autonomous issue triage with bounded repair lanes.
- Research + build loops where one worker scouts and another ships.
- Long-running lab experiments that should not pollute the product lane.
- Handoffs where context preservation matters more than raw model cleverness.

## What Swarm Mode deliberately does not do

- It does not remove human approval for irreversible external actions.
- It does not make workers talk directly to Eric.
- It does not require every worker to run on the same machine forever.
- It does not pretend chat history is a project management system.
- It does not solve bad specs. It makes bad specs visible faster. Which is less romantic, but more useful.

## Release-path docs

Read these in order if you are testing the v1 release:

1. [QUICKSTART.md](./QUICKSTART.md)
2. [ARCHITECTURE.md](./ARCHITECTURE.md)
3. [ROLES.md](./ROLES.md)
4. [SKILLS.md](./SKILLS.md)

## Canonical spec

The canonical runtime contract is `SWARM_SPEC.md` in the swarm specs directory. This docs set explains the public surface; the spec wins when implementation details conflict.
