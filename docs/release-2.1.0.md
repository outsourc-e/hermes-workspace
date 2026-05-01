# Hermes-Workspace v2.1.0 — Swarm

Hermes-Workspace 2.1.0 introduces **Swarm**, a built-in multi-agent orchestration surface for running a main HermesAgent with persistent worker agents.

## Highlights

- **Swarm Mode**
  - route work from a main HermesAgent into a live worker swarm
  - persistent tmux-backed workers
  - role-aware dispatch and orchestration surfaces

- **Board, reports, and inbox flow**
  - Board / Kanban support for swarm work
  - reports and checkpoint routing
  - inbox-style handling for blocked and review-ready work

- **Orchestrator routing**
  - worker checkpoints route through the orchestrator first
  - cleaner reviewer flow and better control over escalation

- **Reliability improvements**
  - long-running SSE chat streams survive silent agent processing windows
  - approval banner wiring is fixed so tool approvals are visible again
  - local-only portable sessions can be deleted correctly
  - dashboard fallback added for session create/update/fork flows
  - workspace reliability patches preserved

- **Hermes path + environment fixes**
  - canonical Hermes root handling
  - improved home/env handling for profiles and run storage

- **Docs and security**
  - Swarm docs added
  - Docker Skills Hub fallback docs clarified
  - SECURITY disclosure path updated

## Included PRs

- #192
- #196
- #198
- #202
- #204
- #205
- #206
- #207
- #208
- #211
- #215

## Suggested short release description

Hermes-Workspace 2.1.0 ships Swarm: a built-in multi-agent control surface for persistent worker agents, orchestrator-first routing, Board + reports + inbox flows, and a set of reliability fixes across chat streaming, approvals, sessions, and Hermes path handling.

## Suggested launch post

Hermes-Workspace 2.1.0 is out.

It ships **Swarm**: a built-in multi-agent workspace where one HermesAgent can orchestrate persistent worker agents with live checkpoints, Board, inbox/review flow, and better routing between orchestrator and workers.

Also in 2.1.0:
- stronger long-run SSE chat reliability
- approval banner fix
- portable session deletion fix
- dashboard fallback for session actions
- Hermes path handling improvements

If you want multi-agent control without leaving your workspace, this is the release.
