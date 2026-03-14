# Workspace Daemon API Reference

Base URL: `http://localhost:3099`

## Projects

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspace/projects` | List all projects |
| POST | `/api/workspace/projects` | Create project |
| GET | `/api/workspace/projects/:id` | Get project detail (includes phases, missions, tasks, git status) |
| PUT | `/api/workspace/projects/:id` | Update project |
| PATCH | `/api/workspace/projects/:id` | Partial update project |
| DELETE | `/api/workspace/projects/:id` | Delete project |
| GET | `/api/workspace/projects/:id/health` | Run verification checks (tsc, tests, lint) — cached 60s |
| GET | `/api/workspace/projects/:id/git-status` | Get git branch, commit, clean status |

## Phases

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspace/phases` | List phases (optional `?project_id=`) |
| POST | `/api/workspace/phases` | Create phase |
| PUT | `/api/workspace/phases/:id` | Update phase |

## Missions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspace/missions` | List missions |
| POST | `/api/workspace/missions` | Create mission |
| PUT | `/api/workspace/missions/:id` | Update mission |
| GET | `/api/workspace/missions/:id/status` | Live mission status (tasks, agents, progress) |
| POST | `/api/workspace/missions/:id/start` | Start mission execution |
| POST | `/api/workspace/missions/:id/pause` | Pause mission |
| POST | `/api/workspace/missions/:id/resume` | Resume mission |
| POST | `/api/workspace/missions/:id/stop` | Stop mission |

## Tasks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspace/tasks` | List tasks |
| POST | `/api/workspace/tasks` | Create task |
| PUT | `/api/workspace/tasks/:id` | Update task |
| POST | `/api/workspace/tasks/:id/run` | Trigger task execution |
| GET | `/api/workspace/tasks/:id/runs` | List runs for task |

## Task Runs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspace/task-runs` | List task runs (optional `?project_id=`, `?task_id=`) |
| GET | `/api/workspace/task-runs/:id/events` | Get run events (live output) |
| POST | `/api/workspace/task-runs/:id/stop` | Stop a running task |

## Checkpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspace/checkpoints` | List checkpoints (optional `?status=`, `?project_id=`) |
| GET | `/api/workspace/checkpoints/:id` | Checkpoint detail (diff files, verification, run events) |
| GET | `/api/workspace/checkpoints/:id/diff` | Raw unified diff |
| POST | `/api/workspace/checkpoints/:id/verify-tsc` | Re-run TypeScript check |
| POST | `/api/workspace/checkpoints/:id/approve` | Approve checkpoint |
| POST | `/api/workspace/checkpoints/:id/approve-and-commit` | Approve + commit to worktree |
| POST | `/api/workspace/checkpoints/:id/approve-and-pr` | Approve + open PR |
| POST | `/api/workspace/checkpoints/:id/approve-and-merge` | Approve + merge to main |
| POST | `/api/workspace/checkpoints/:id/revise` | Send back with instructions |
| POST | `/api/workspace/checkpoints/:id/reject` | Reject with reason |

## Agents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspace/agents` | List registered agents |
| POST | `/api/workspace/agents` | Register agent |
| PUT | `/api/workspace/agents/:id` | Update agent |
| DELETE | `/api/workspace/agents/:id` | Remove agent |

## Teams

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspace/teams` | List teams |
| POST | `/api/workspace/teams` | Create team |
| PUT | `/api/workspace/teams/:id` | Update team (includes approval_config) |

## Skills

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspace/skills` | List discovered skills |
| GET | `/api/workspace/skills/:id/content` | Get SKILL.md content |

## Decompose (AI)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/workspace/decompose` | Decompose spec into phases/missions/tasks |

## Events (SSE)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events` | Server-Sent Events stream for live updates |

### Event Types
- `task_run.started` — task run began
- `task_run.output` — live output from agent
- `task_run.completed` — task run finished
- `task_run.failed` — task run failed
- `checkpoint.created` — new checkpoint for review
- `checkpoint.merged` — checkpoint approved and merged
- `task.stale_cleanup` — stale run detected and cleaned up

## Utility

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspace/recent-paths` | Recently used project paths |

## Authentication

None required (local daemon). For production, add auth middleware.

## Running

```bash
# Development
cd workspace-daemon && npm run dev

# Production
npm run build && node dist/server.js

# CLI
npx @clawsuite/workspace-daemon start --port 3099
```
