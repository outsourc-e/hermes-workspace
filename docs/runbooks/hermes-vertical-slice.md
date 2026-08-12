# Hermes Vertical Slice Runbook

Use the native Hermes path for a bounded local repository task.

## Preconditions

1. Hermes gateway and dashboard are healthy.
2. Workspace reports the `hermes-proxy` Kanban backend.
3. OmniRoute is healthy and configured as Hermes's model provider.
4. GBrain MCP is available for the final sourced capture.
5. A repository worktree and allowed path scope are declared on the Kanban task.

## Flow

1. Create one native Hermes Kanban task with an objective, acceptance commands, assigned profile, worktree, scope, risk, and idempotency key.
2. Dispatch it through Hermes gateway/Kanban to `builder`.
3. Require a checkpoint containing task ID, profile, worktree, files changed, commands, results, blocker, next action, approval state, and commit SHA when applicable.
4. For non-low-risk work, send the same task and diff to `reviewer` before completion.
5. Complete local validation and create a local commit within the declared worktree.
6. Capture the final result and reusable lesson in GBrain.
7. Verify the task remains present after gateway, dashboard, or Workspace restarts.

Do not use Workspace-native Swarm dispatch, Workspace-local task stores, a second scheduler, or a second task database for this flow.

## Approval boundary

Local reads, edits, tests, and commits may proceed within the declared scope. Messaging, publishing, deployment, purchases, account changes, remote destructive actions, and scope expansion require explicit Hermes approval.

## Recovery

If execution stops, leave the native Hermes task and checkpoint intact. Inspect the latest checkpoint, keep the task blocked or pending when evidence is incomplete, and resume through Hermes rather than reconstructing state from Workspace or GBrain.
