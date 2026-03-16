# Hermes Workspace Daemon

`@hermes-workspace/workspace-daemon` is a local orchestration service for running coding agents against tracked projects. It stores projects, missions, tasks, task runs, checkpoints, and activity in SQLite, prepares per-task workspaces, and exposes an HTTP API for the Hermes Workspace UI or other tooling.

## What it does

- Tracks execution state for projects, phases, missions, tasks, agents, runs, checkpoints, and activity events.
- Polls for ready tasks and dispatches them to registered agents with bounded concurrency.
- Creates per-task workspaces under `.workspaces/`, using `git worktree` when the source project is a git repo.
- Streams activity and run events over Server-Sent Events.
- Captures task output as checkpoints and supports review, verification, commit, PR, and merge flows.
- Can decompose a goal into tasks by calling a Claude CLI decomposition prompt.

## Requirements

- Node.js 20+ recommended.
- npm for package management.
- One or more agent CLIs available locally if you want to execute tasks:
  - `codex` for the Codex adapter
  - `claude` for the Claude adapter and `/api/decompose`
  - an OpenClaw-compatible server for the OpenClaw adapter
- `git` if you want workspace isolation through worktrees or checkpoint merge flows.
- `gh` if you want `approve-and-pr` to open GitHub pull requests.

## Install and run

```bash
cd workspace-daemon
npm install
npm start
```

The server listens on `http://localhost:3002` by default.

For development:

```bash
npm run dev
```

## Configuration

### Environment variables

- `PORT`: HTTP port. Defaults to `3002`.
- `WORKSPACE_DAEMON_DB_PATH`: Optional path to the SQLite database file. Defaults to `.data/workspace-daemon.sqlite` inside `workspace-daemon/`.

### `WORKFLOW.md`

The daemon loads workflow settings from `WORKFLOW.md` in the tracked project root. If there is no project-level file, it falls back to `workspace-daemon/WORKFLOW.md` if present, then to an internal default prompt.

Supported frontmatter keys:

```md
---
poll_interval_ms: 5000
max_concurrent_agents: 4
workspace_root: .workspaces
auto_approve: true
default_adapter: codex
agent_command: codex
agent_args:
  - app-server
env:
  EXAMPLE_FLAG: "1"
hooks:
  after_create:
    - npm install
  before_run:
    - npm test -- --runInBand
  after_run:
    - git status --short
---
You are an autonomous coding agent. Complete the assigned task and report the result.
```

Notes:

- `workspace_root` is resolved relative to the tracked project path when a project path exists.
- `default_adapter` may be `codex`, `claude`, `openclaw`, or `ollama`.
  `openclaw` remains the compatibility adapter name for Hermes gateway sessions.
- The markdown body becomes the task prompt template.
- Template variables: `{{project_name}}`, `{{task_name}}`, `{{task_description}}`, `{{workspace_path}}`.
- If `auto_approve` is `true`, completed runs are checkpointed and marked complete without manual review. Git worktrees created for that task are cleaned up automatically after approval.

## Architecture

### Core pieces

- `src/server.ts`: boots Express, the tracker, and the orchestrator.
- `src/tracker.ts`: SQLite-backed state store and query layer.
- `src/orchestrator.ts`: polling loop, concurrency limits, dispatch, retry handling, and pause/stop control.
- `src/agent-runner.ts`: prepares workspaces, renders prompts, runs adapters, and builds checkpoints.
- `src/workspace.ts`: creates task workspaces and runs workflow hooks.
- `src/checkpoint-builder.ts`: summarizes filesystem changes and records checkpoint metadata.

### Execution flow

1. A project, phase, mission, and task are created through the API.
2. When a mission starts, dependency-free tasks become `ready`.
3. The orchestrator claims ready tasks, creates a task run, and assigns an available agent.
4. The workspace manager creates a dedicated workspace for the task.
5. The selected adapter executes the prompt in that workspace and emits run events.
6. On success, the daemon creates a checkpoint for review or auto-approval.
7. On failure, the task run is marked failed and retried with backoff up to 3 attempts.

## Workspace behavior

Workspaces are created under:

```text
<workspace_root>/<project-slug>/<task-id>-<task-slug>
```

If the tracked project is a git repository, the daemon attempts:

```bash
git worktree add <workspacePath> -b task/<task-id>
```

If that fails, it falls back to creating a normal directory. Every created workspace gets a `.workspace-source` file pointing to the source project path.

## Agent adapters

Built-in adapters:

- `codex`: launches `codex app-server` by default and talks JSON-RPC over stdio.
- `claude`: launches `claude --print --permission-mode bypassPermissions -p <prompt>`.
- `openclaw`: calls `POST /sessions/spawn` on the Hermes-compatible session server, default `http://127.0.0.1:3333`.

Agent records are created through `POST /api/agents`. `adapter_config` is stored as JSON and passed through to the adapter. Common fields include:

- `command`
- `args`
- `timeoutMs`
- `env`
- `model`
- `url` for the Hermes-compatible session server

## API surface

### Health

- `GET /health`

### Projects, phases, missions

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `PUT /api/projects/:id`
- `PATCH /api/projects/:id`
- `DELETE /api/projects/:id`
- `POST /api/phases`
- `POST /api/missions`
- `GET /api/missions/:id/status`
- `POST /api/missions/:id/start`
- `POST /api/missions/:id/pause`
- `POST /api/missions/:id/resume`
- `POST /api/missions/:id/stop`

### Tasks and runs

- `GET /api/tasks`
- `POST /api/tasks`
- `PUT /api/tasks/:id`
- `POST /api/tasks/:id/run`
- `GET /api/tasks/:id/runs`
- `GET /api/task-runs`
- `GET /api/task-runs/:id/events`
- `POST /api/task-runs/:id/pause`
- `POST /api/task-runs/:id/stop`

### Agents

- `GET /api/agents`
- `POST /api/agents`
- `GET /api/agents/:id/status`
- `GET /api/agents/:id/stats`

### Checkpoints

- `GET /api/checkpoints`
- `GET /api/checkpoints/:id`
- `POST /api/checkpoints/:id/verify-tsc`
- `POST /api/checkpoints/:id/approve`
- `POST /api/checkpoints/:id/approve-and-commit`
- `POST /api/checkpoints/:id/approve-and-pr`
- `POST /api/checkpoints/:id/approve-and-merge`
- `POST /api/checkpoints/:id/reject`
- `POST /api/checkpoints/:id/revise`

### Decomposition and events

- `POST /api/decompose`
- `GET /api/events`
- `GET /api/events/:taskRunId`

## Example session

Create a project:

```bash
curl -X POST http://127.0.0.1:3002/api/projects \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Hermes Workspace",
    "path": "/absolute/path/to/repo",
    "spec": "Ship the workspace daemon MVP."
  }'
```

Create a phase and mission, then a task:

```bash
curl -X POST http://127.0.0.1:3002/api/phases \
  -H 'Content-Type: application/json' \
  -d '{"project_id":"<project-id>","name":"Execution","sort_order":1}'

curl -X POST http://127.0.0.1:3002/api/missions \
  -H 'Content-Type: application/json' \
  -d '{"phase_id":"<phase-id>","name":"README work"}'

curl -X POST http://127.0.0.1:3002/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{
    "mission_id":"<mission-id>",
    "name":"Write workspace-daemon README",
    "description":"Replace the stub package README with operator docs."
  }'
```

Register an agent and start the mission:

```bash
curl -X POST http://127.0.0.1:3002/api/agents \
  -H 'Content-Type: application/json' \
  -d '{"name":"local-codex","role":"coder","adapter_type":"codex"}'

curl -X POST http://127.0.0.1:3002/api/missions/<mission-id>/start
```

Watch global activity:

```bash
curl -N http://127.0.0.1:3002/api/events \
  -H 'Accept: text/event-stream'
```

Watch a specific run:

```bash
curl -N http://127.0.0.1:3002/api/events/<task-run-id>
```

## Checkpoint review flows

When a run completes successfully, the daemon builds a checkpoint with:

- a summary
- a diff stat payload
- changed-file metadata
- stored verification output when available
- run events for the task run

Review actions:

- `approve`: mark the checkpoint approved.
- `approve-and-commit`: stage the workspace, create a local commit, and store the commit hash.
- `approve-and-pr`: commit the workspace, push `task/<task-id>`, and try to create a GitHub PR with `gh`.
- `approve-and-merge`: commit the workspace, merge the task branch into `main`, then clean up the worktree.
- `reject`: mark the checkpoint rejected with reviewer notes.
- `revise`: send the task back for another pass.

## Verification

`POST /api/checkpoints/:id/verify-tsc` runs:

```bash
npx tsc --noEmit
```

It executes in the task workspace when available, otherwise in the project root, and stores the result on the checkpoint.

## Development checks

Typecheck:

```bash
npm run typecheck
```

Basic end-to-end smoke test:

```bash
./test/e2e.sh
```

## Current limitations

- The package declares `ollama` as a valid adapter type, but there is no Ollama adapter implementation wired into `AgentRunner`.
- Checkpoint verification currently supports TypeScript only.
- Authentication and multi-user access control are not implemented; this daemon is designed for trusted local use.
