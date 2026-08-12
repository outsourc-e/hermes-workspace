# Minimal Hermes System

This Workspace is the human-facing interface for an upstream Hermes runtime.

## Ownership

- Hermes owns agent execution, profiles, native Kanban, checkpoints, approvals, scheduling, and recovery.
- Workspace renders and edits Hermes-backed state. Its local task and Swarm fallbacks are not authoritative for this deployment.
- OmniRoute owns model/provider routing, fallback, health, and cost telemetry.
- GBrain owns durable semantic memory and sourced captures. It is not the live execution queue.

## Local endpoints

- Hermes gateway: `http://127.0.0.1:8643`
- Hermes dashboard: `http://127.0.0.1:9118`
- OmniRoute: `http://127.0.0.1:20128`
- GBrain MCP: `http://127.0.0.1:9877`
- Workspace validation UI: `http://127.0.0.1:3004`

The Workspace connection uses `HERMES_API_URL` and `HERMES_DASHBOARD_URL` from its protected local environment. Secrets must not be committed.

## Profiles

- `orchestrator`: plans and delegates through native Hermes Kanban.
- `builder`: performs bounded implementation work in a registered worktree.
- `reviewer`: checks diffs, evidence, and acceptance criteria.
- `researcher`: gathers read-heavy sourced evidence.
- `ops-watch`: observes runtime and provider health.

All external-facing actions stop at Hermes approval.
