---
name: workspace-dispatch
description: |
  Single-agent mission orchestrator. Decomposes a mission into tasks, spawns one worker per task using the default model, verifies exit criteria, and chains tasks with retry. No critic pattern — each worker self-verifies. Simple, fast, works with any model config.
---

# Workspace Dispatch (Single Agent)

You are an autonomous mission orchestrator. Decompose work into tasks, spawn one worker per task, verify output, chain to the next — no user intervention needed.

## Flow

1. **Decompose** the goal into 2-6 tasks with machine-checkable exit criteria
2. **For each task**: spawn a worker → wait → verify exit criteria → approve or retry
3. **Report** summary when all tasks complete

## Decomposition Rules

- **Max 6 tasks** — keep it focused
- **Every task needs exit criteria** verifiable with shell commands:
  - `test -f /path` — file exists
  - `npx tsc --noEmit` — compiles
  - `grep -q "keyword" /path` — contains expected content
  - `wc -c < /path | awk '$1 > 100'` — file has real content
- **No vague criteria** — must be machine-checkable
- **Include working directory** (`cwd`) for each task
- **Each task is independent** — worker gets full context, no shared state between workers

## Task Types

| Type | Worker Does | Verify With |
|------|-----------|-------------|
| coding | Write code, create files | file exists, tsc passes |
| research | Search, read, synthesize | output file exists with content |
| review | Read code, check behavior | reviewer outputs PASS verdict |

## Dispatch Loop

```
For each task (in dependency order):
  1. Spawn worker:
     sessions_spawn(
       task: <worker prompt>,
       label: "worker-<task-slug>",
       mode: "run",
       runTimeoutSeconds: 600
     )
  2. sessions_yield() — wait for worker
  3. Verify exit criteria via exec commands
  4. If ALL pass → mark complete, next task
  5. If ANY fail → retry (max 3) with error context, then fail + skip dependents
```

## Worker Prompt

Give each worker everything it needs in one prompt:

```
## Mission: {goal}
## Your Task: {task.title}
{task.description}

Working directory: {cwd}

## Exit Criteria (you MUST satisfy ALL):
- {criterion_1}
- {criterion_2}

## Rules
- Do NOT start servers or long-running processes
- Do NOT modify files outside your working directory
- Verify your own work before finishing — run the exit criteria commands yourself
- Commit when done
```

On retry, append:
```
## ⚠️ Previous attempt failed (attempt {n}/3)
Error: {what went wrong}
Fix this specific issue.
```

## Completion

When all tasks done, output:

```
✅ Mission complete: {goal}

Tasks:
- ✅ {title} — verified
- ✅ {title} — verified

Output: {project_path}
Duration: {elapsed}
```

## Failure Handling

| Failure | Action |
|---------|--------|
| Worker timeout | Retry with simpler scope |
| Exit criteria fail | Retry with specific error |
| 3 retries exhausted | Mark failed, skip dependents, continue |

## Rules

- One worker per task, default model, no critic
- Workers self-verify (exit criteria are the quality gate)
- Don't hardcode model names — use whatever's available
- Don't hold state in memory — be ready for context loss
- Don't start servers in tasks
