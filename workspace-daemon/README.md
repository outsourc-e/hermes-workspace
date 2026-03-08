# ClawSuite Workspace Daemon

Local orchestration engine for AI coding agents

## Quick start

```bash
npm install
npm start
PORT=3002 npm start
```

## API endpoints

- `GET /health`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `PUT /api/projects/:id`
- `DELETE /api/projects/:id`
- `POST /api/phases`
- `GET /api/tasks`
- `POST /api/tasks`
- `PUT /api/tasks/:id`
- `POST /api/tasks/:id/run`
- `GET /api/tasks/:id/runs`
- `GET /api/agents`
- `POST /api/agents`
- `GET /api/agents/:id/status`
- `POST /api/missions`
- `POST /api/missions/:id/start`
- `POST /api/missions/:id/pause`
- `POST /api/missions/:id/resume`
- `POST /api/missions/:id/stop`
- `GET /api/checkpoints`
- `POST /api/checkpoints/:id/approve`
- `POST /api/checkpoints/:id/reject`
- `POST /api/checkpoints/:id/revise`
- `POST /api/decompose`
- `GET /api/events`
- `GET /api/events/:taskRunId`

## Architecture overview

- Orchestrator poll loop: `Orchestrator` runs a timed polling loop, resolves ready tasks, dispatches work to available agents, and manages retries.
- Agent adapters: task execution is delegated through adapter implementations for supported agent types such as Codex, Claude, OpenClaw, and Ollama.
- SQLite persistence: `Tracker` stores projects, phases, missions, tasks, runs, checkpoints, agents, and activity in SQLite.

## Configuration

- `PORT`: HTTP port for the daemon. Defaults to `3002`.
- `WORKSPACE_DAEMON_DB_PATH`: optional path to the SQLite database file.
