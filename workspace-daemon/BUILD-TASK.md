# Workspace Daemon — Build Task

## What You're Building
A standalone TypeScript daemon that orchestrates AI coding agents. It runs on `localhost:3001`, accepts tasks via REST API, spawns agents in isolated workspaces, tracks progress, and streams events via SSE.

This is the backend framework for ClawSuite Workspace. No UI — just the engine.

## Architecture Sources (READ THESE)
1. **Symphony SPEC.md** (`~/.openclaw/workspace/symphony/SPEC.md`) — The orchestration logic. Reimplement the orchestrator state machine, workspace manager, agent runner, and WORKFLOW.md parser in TypeScript.
2. **Paperclip DB schema** (`~/.openclaw/workspace/paperclip/packages/db/src/schema/`) — Reference for data model patterns (projects, agents, issues, approvals, costs, activity_log). We adapt these for SQLite with better-sqlite3.
3. **Paperclip adapters** (`~/.openclaw/workspace/paperclip/packages/adapters/`) — Agent adapter patterns for Claude, Codex, OpenClaw.
4. **ClawSuite Workspace Spec** (`~/.openclaw/workspace/CLAWSUITE-WORKSPACE-SPEC.md`) — Our full product spec with data model.

## File Structure
```
workspace-daemon/
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts              # Express server, port 3001, SSE endpoint
│   ├── orchestrator.ts        # Poll-dispatch loop (from Symphony)
│   ├── workspace.ts           # Per-task workspace isolation + lifecycle hooks
│   ├── agent-runner.ts        # Spawn agents, stream events back
│   ├── config.ts              # WORKFLOW.md parser (YAML frontmatter + prompt)
│   ├── tracker.ts             # Local task store (replaces Symphony's Linear adapter)
│   ├── db/
│   │   ├── index.ts           # better-sqlite3 setup
│   │   └── schema.sql         # CREATE TABLE statements
│   ├── adapters/
│   │   ├── types.ts           # AgentAdapter interface
│   │   ├── codex.ts           # Codex App Server JSON-RPC over stdio
│   │   ├── claude.ts          # Claude Code CLI (--print mode)
│   │   └── openclaw.ts        # OpenClaw Gateway sessions_spawn
│   ├── routes/
│   │   ├── projects.ts        # CRUD for projects
│   │   ├── tasks.ts           # CRUD for tasks + task runs
│   │   ├── agents.ts          # Agent registry
│   │   ├── missions.ts        # Mission lifecycle (start/pause/resume/stop)
│   │   └── events.ts          # SSE stream endpoint
│   └── types.ts               # Shared types
```

## SQLite Schema (better-sqlite3, NOT Drizzle)
Use raw SQL with better-sqlite3. Tables needed:

```sql
-- Core hierarchy
CREATE TABLE projects (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  path TEXT,              -- git repo path
  spec TEXT,              -- PRD/spec markdown
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE phases (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE missions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  phase_id TEXT NOT NULL REFERENCES phases(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress REAL NOT NULL DEFAULT 0
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mission_id TEXT NOT NULL REFERENCES missions(id),
  name TEXT NOT NULL,
  description TEXT,
  agent_id TEXT REFERENCES agents(id),
  status TEXT NOT NULL DEFAULT 'pending',
  sort_order INTEGER NOT NULL DEFAULT 0,
  depends_on TEXT,        -- JSON array of task IDs
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Execution
CREATE TABLE task_runs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  agent_id TEXT REFERENCES agents(id),
  status TEXT NOT NULL DEFAULT 'pending',
  attempt INTEGER NOT NULL DEFAULT 1,
  workspace_path TEXT,
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0
);

CREATE TABLE run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_run_id TEXT NOT NULL REFERENCES task_runs(id),
  type TEXT NOT NULL,     -- 'started', 'output', 'tool_use', 'checkpoint', 'completed', 'error'
  data TEXT,              -- JSON payload
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Checkpoints (review gates)
CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_run_id TEXT NOT NULL REFERENCES task_runs(id),
  summary TEXT,
  diff_stat TEXT,         -- JSON: files changed, insertions, deletions
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, approved, rejected, revised
  reviewer_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id),
  type TEXT NOT NULL,     -- 'screenshot', 'diff', 'log'
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Agents
CREATE TABLE agents (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'coder',
  adapter_type TEXT NOT NULL DEFAULT 'codex',  -- codex, claude, openclaw, ollama
  adapter_config TEXT DEFAULT '{}',            -- JSON
  model TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  capabilities TEXT DEFAULT '{}',              -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Activity log
CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  agent_id TEXT,
  details TEXT,           -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Orchestrator (from Symphony SPEC.md)

The orchestrator is a poll-dispatch loop. Key behaviors:

### State (in-memory, like Symphony)
```typescript
interface OrchestratorState {
  pollIntervalMs: number;          // default 5000
  maxConcurrentAgents: number;     // default 4
  running: Map<string, RunningEntry>;  // taskId -> run info
  claimed: Set<string>;            // task IDs reserved/running/retrying
  retryAttempts: Map<string, RetryEntry>;
  completed: Set<string>;
}
```

### Poll Loop
1. Query DB for tasks with status='ready' (all dependencies met)
2. Skip if task ID is in `claimed` set
3. Respect `maxConcurrentAgents` concurrency limit
4. For each eligible task: create workspace → spawn agent → track run
5. On agent completion: create checkpoint → wait for approval (or auto-approve)
6. On approval: mark task done → check if new tasks are unblocked

### Retry Logic (from Symphony)
- On agent failure: exponential backoff (base 10s, max 5min)
- Max 3 retries per task
- On retry: reuse workspace, increment attempt counter

### Reconciliation on Restart
- On startup: scan `task_runs` for status='running'
- If process not alive: mark as 'failed', queue retry
- No external DB needed for recovery (SQLite is the source of truth)

## Agent Runner

### Codex Adapter (PRIMARY)
Spawn `codex app-server` as child process, communicate via JSON-RPC over stdio:

```typescript
// Simplified flow:
const proc = spawn('codex', ['app-server'], { stdio: ['pipe', 'pipe', 'inherit'], cwd: workspacePath });
// Send: initialize → thread/start → turn/start
// Stream: item/started, item/agentMessage/delta, item/completed, turn/completed
```

Thread lifecycle: thread/start → turn/start with task prompt → stream events → turn/completed

### Claude Adapter
```typescript
// Use Claude Code CLI in print mode
spawn('claude', ['--print', '--permission-mode', 'bypassPermissions', '-m', taskPrompt], { cwd: workspacePath });
```

### OpenClaw Adapter
```typescript
// Use OpenClaw gateway sessions_spawn
// POST to gateway API to create session, stream SSE events
```

## REST API Routes

### Projects
- `GET /api/projects` — list all
- `POST /api/projects` — create (name, path, spec)
- `GET /api/projects/:id` — detail with phases/missions/tasks
- `PUT /api/projects/:id` — update
- `DELETE /api/projects/:id` — delete

### Tasks
- `GET /api/tasks` — list (filter by mission_id, status)
- `POST /api/tasks` — create
- `PUT /api/tasks/:id` — update
- `POST /api/tasks/:id/run` — manually trigger a task run

### Missions
- `POST /api/missions/:id/start` — start mission (resolve deps → dispatch wave 1)
- `POST /api/missions/:id/pause` — pause all running tasks
- `POST /api/missions/:id/resume` — resume paused tasks
- `POST /api/missions/:id/stop` — stop and cleanup

### Agents
- `GET /api/agents` — list registered agents
- `POST /api/agents` — register new agent
- `GET /api/agents/:id/status` — current status + active task

### Checkpoints
- `GET /api/checkpoints` — list pending checkpoints
- `POST /api/checkpoints/:id/approve` — approve
- `POST /api/checkpoints/:id/reject` — reject
- `POST /api/checkpoints/:id/revise` — revise with notes

### Events (SSE)
- `GET /api/events` — SSE stream of all orchestrator events
- `GET /api/events/:taskRunId` — SSE stream for specific task run

## Dependencies
```json
{
  "dependencies": {
    "express": "^4.21.0",
    "better-sqlite3": "^11.0.0",
    "cors": "^2.8.5",
    "yaml": "^2.4.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/express": "^4.17.21",
    "@types/better-sqlite3": "^7.6.8",
    "@types/cors": "^2.8.17",
    "tsx": "^4.19.0"
  }
}
```

## Key Design Decisions
1. **SQLite, not Postgres** — local-first, zero config, single file
2. **better-sqlite3, not Drizzle** — synchronous API, simpler for a daemon
3. **In-memory orchestrator state + SQLite persistence** — fast dispatch, durable recovery
4. **WORKFLOW.md per project** — teams version their agent config with code (from Symphony)
5. **SSE for live events** — same pattern ClawSuite already uses for chat streaming
6. **No auth** — single user, local daemon. Auth comes later.

## How to Run
```bash
cd workspace-daemon
npm install
npx tsx src/server.ts
# Daemon runs on http://localhost:3001
```

## Verification
After building, verify:
1. `npx tsc --noEmit` passes
2. Server starts on port 3001
3. `curl http://localhost:3001/api/projects` returns `[]`
4. Can create a project via POST
5. Can create tasks and trigger a run
6. SSE endpoint streams events
