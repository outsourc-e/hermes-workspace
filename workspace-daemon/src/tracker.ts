import { EventEmitter } from 'node:events'
import type Database from 'better-sqlite3'
import { getDatabase } from './db'
import type {
  ActivityLogEntry,
  ActivityEvent,
  AgentDirectoryRecord,
  AgentDirectoryStats,
  AgentRecord,
  Checkpoint,
  CreateMissionInput,
  CreatePhaseInput,
  CreateProjectInput,
  CreateTaskInput,
  Mission,
  MissionProgressEvent,
  MissionStatus,
  MissionWithProjectContext,
  Phase,
  Project,
  ProjectDetail,
  RegisterAgentInput,
  RunEvent,
  RunEventType,
  Task,
  TaskRun,
  TaskRunWithRelations,
  TaskStatus,
  TaskWithRelations,
  UpdateTaskInput,
} from './types'

function parseJsonOrDefault<T>(
  value: string | null | undefined,
  fallback: T,
): T {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

const DEFAULT_AGENT_DIRECTORY: AgentDirectoryRecord[] = [
  {
    id: 'codex-backend',
    name: 'Codex',
    role: 'Backend',
    adapter_type: 'codex',
    model: 'gpt-5.4',
    provider: 'OpenAI',
    status: 'online',
    avatar: '🤖',
    avatar_tone: 'green',
    description:
      'Primary backend implementation agent for multi-file TypeScript work.',
    system_prompt: [
      '# Codex',
      '',
      'You are the backend implementation agent for ClawSuite workspaces.',
      '',
      'Rules:',
      '- Read all relevant files before editing.',
      '- Make coherent multi-file changes when needed.',
      '- Run TypeScript validation before handing work back.',
      '- Prefer concrete fixes over speculative refactors.',
    ].join('\n'),
    prompt_updated_at: '2026-03-08T10:00:00.000Z',
    limits: {
      max_tokens: 200_000,
      cost_label: 'ChatGPT Pro',
      concurrency_limit: 2,
      memory_scope: 'Global + Project',
    },
    capabilities: {
      repo_write: true,
      shell_commands: true,
      git_operations: true,
      browser: true,
      network: true,
    },
    assigned_projects: ['ClawSuite', 'Workspace Daemon'],
    skills: ['TypeScript', 'API routes', 'Refactors', 'Validation'],
  },
  {
    id: 'claude-sonnet-fullstack',
    name: 'Claude Sonnet',
    role: 'Full-stack',
    adapter_type: 'claude',
    model: 'sonnet-4.6',
    provider: 'Anthropic',
    status: 'online',
    avatar: '🧠',
    avatar_tone: 'primary',
    description:
      'Full-stack implementation agent for UI polish and product flows.',
    system_prompt: [
      '# Claude Sonnet',
      '',
      'You are the full-stack execution agent.',
      '',
      'Focus:',
      '- End-to-end UI changes that stay consistent with the existing design system.',
      '- Clean handoffs between frontend and backend work.',
      '- Clear status reporting and low-churn edits.',
    ].join('\n'),
    prompt_updated_at: '2026-03-08T10:15:00.000Z',
    limits: {
      max_tokens: 200_000,
      cost_label: 'Anthropic API',
      concurrency_limit: 2,
      memory_scope: 'Project scoped',
    },
    capabilities: {
      repo_write: true,
      shell_commands: true,
      git_operations: true,
      browser: true,
      network: true,
    },
    assigned_projects: ['ClawSuite', 'Client Portal'],
    skills: ['React', 'UX polish', 'State flows', 'Docs'],
  },
  {
    id: 'qa-agent-reviewer',
    name: 'QA Agent',
    role: 'Reviewer',
    adapter_type: 'claude',
    model: 'sonnet-4.6',
    provider: 'Anthropic',
    status: 'online',
    avatar: '🔍',
    avatar_tone: 'primary',
    description:
      'Review-focused agent for checkpoint triage and regression hunting.',
    system_prompt: [
      '# QA Agent',
      '',
      'You review changes for correctness and regression risk.',
      '',
      'Priorities:',
      '- Catch missing validation.',
      '- Verify acceptance criteria and edge cases.',
      '- Push for explicit evidence when behavior changes.',
    ].join('\n'),
    prompt_updated_at: '2026-03-08T10:30:00.000Z',
    limits: {
      max_tokens: 120_000,
      cost_label: 'Anthropic API',
      concurrency_limit: 1,
      memory_scope: 'Project + Review queue',
    },
    capabilities: {
      repo_write: false,
      shell_commands: true,
      git_operations: false,
      browser: true,
      network: true,
    },
    assigned_projects: ['ClawSuite'],
    skills: ['Code review', 'Regression checks', 'Acceptance testing'],
  },
  {
    id: 'aurora-orchestrator',
    name: 'Aurora',
    role: 'Orchestrator',
    adapter_type: 'claude',
    model: 'opus-4.6',
    provider: 'Anthropic',
    status: 'online',
    avatar: '⚡',
    avatar_tone: 'accent',
    description:
      'Orchestrator for planning, delegation, and multi-agent coordination.',
    system_prompt: [
      '# Aurora',
      '',
      'You coordinate the workspace and route work to the right agents.',
      '',
      'Directives:',
      '- Maintain a coherent plan.',
      '- Keep execution parallel where it is safe.',
      '- Resolve blockers with the minimum viable coordination overhead.',
    ].join('\n'),
    prompt_updated_at: '2026-03-08T10:45:00.000Z',
    limits: {
      max_tokens: 200_000,
      cost_label: 'Anthropic API',
      concurrency_limit: 4,
      memory_scope: 'Global workspace',
    },
    capabilities: {
      repo_write: true,
      shell_commands: true,
      git_operations: true,
      browser: true,
      network: true,
    },
    assigned_projects: ['ClawSuite', 'LuxeLab', 'Client Portal'],
    skills: ['Planning', 'Delegation', 'Risk triage', 'Coordination'],
  },
  {
    id: 'forge-pc1',
    name: 'Forge (PC1)',
    role: 'Heavy builds',
    adapter_type: 'ollama',
    model: 'qwen3.5-35b',
    provider: 'Ollama',
    status: 'offline',
    avatar: '🔧',
    avatar_tone: 'yellow',
    description:
      'Local heavyweight execution node for long-running builds and batch work.',
    system_prompt: [
      '# Forge',
      '',
      'You handle large local build and validation jobs.',
      '',
      'Rules:',
      '- Prefer deterministic command execution.',
      '- Surface build logs clearly.',
      '- Avoid network-dependent workflows unless explicitly requested.',
    ].join('\n'),
    prompt_updated_at: '2026-03-08T11:00:00.000Z',
    limits: {
      max_tokens: 64_000,
      cost_label: 'Local inference',
      concurrency_limit: 1,
      memory_scope: 'Project scoped',
    },
    capabilities: {
      repo_write: true,
      shell_commands: true,
      git_operations: true,
      browser: false,
      network: false,
    },
    assigned_projects: ['Workspace Daemon'],
    skills: ['Builds', 'Compiles', 'Bulk verification'],
  },
]

function normalizeDirectoryStatus(
  status: string | null | undefined,
): AgentDirectoryRecord['status'] {
  const value = (status ?? '').toLowerCase()
  if (value === 'running' || value === 'active' || value === 'completed')
    return 'online'
  if (
    value === 'idle' ||
    value === 'paused' ||
    value === 'pending' ||
    value === 'ready'
  )
    return 'away'
  if (value === 'online' || value === 'away' || value === 'offline')
    return value
  return 'offline'
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
}

export class Tracker extends EventEmitter {
  private readonly db: Database.Database

  constructor(db = getDatabase()) {
    super()
    this.db = db
  }

  listProjects(): Array<
    Project & { phase_count: number; mission_count: number; task_count: number }
  > {
    return this.db
      .prepare(
        `
      SELECT p.*,
        (SELECT COUNT(*) FROM phases WHERE project_id = p.id) AS phase_count,
        (SELECT COUNT(*) FROM missions m JOIN phases ph ON m.phase_id = ph.id WHERE ph.project_id = p.id) AS mission_count,
        (SELECT COUNT(*) FROM tasks t JOIN missions m ON t.mission_id = m.id JOIN phases ph ON m.phase_id = ph.id WHERE ph.project_id = p.id) AS task_count
      FROM projects p ORDER BY p.created_at DESC
    `,
      )
      .all() as Array<
      Project & {
        phase_count: number
        mission_count: number
        task_count: number
      }
    >
  }

  createProject(input: CreateProjectInput): Project {
    const stmt = this.db.prepare(
      `INSERT INTO projects (
        name,
        path,
        spec,
        auto_approve,
        max_concurrent,
        required_checks,
        allowed_tools
      ) VALUES (
        @name,
        @path,
        @spec,
        @auto_approve,
        @max_concurrent,
        @required_checks,
        @allowed_tools
      ) RETURNING *`,
    )
    const project = stmt.get({
      name: input.name,
      path: input.path ?? null,
      spec: input.spec ?? null,
      auto_approve: input.auto_approve ?? 0,
      max_concurrent: input.max_concurrent ?? 2,
      required_checks: input.required_checks ?? 'tsc',
      allowed_tools: input.allowed_tools ?? 'git,shell',
    }) as Project
    this.logActivity('created', 'project', project.id, null, project)
    return project
  }

  createPhase(input: CreatePhaseInput): Phase {
    const phase = this.db
      .prepare(
        'INSERT INTO phases (project_id, name, sort_order) VALUES (@project_id, @name, @sort_order) RETURNING *',
      )
      .get({
        project_id: input.project_id,
        name: input.name,
        sort_order: input.sort_order ?? 0,
      }) as Phase
    this.logActivity('created', 'phase', phase.id, null, phase)
    return phase
  }

  createMission(input: CreateMissionInput): Mission {
    const mission = this.db
      .prepare(
        'INSERT INTO missions (phase_id, name) VALUES (@phase_id, @name) RETURNING *',
      )
      .get({
        phase_id: input.phase_id,
        name: input.name,
      }) as Mission
    this.logActivity('created', 'mission', mission.id, null, mission)
    return mission
  }

  getPhase(id: string): Phase | null {
    return (
      (this.db.prepare('SELECT * FROM phases WHERE id = ?').get(id) as
        | Phase
        | undefined) ?? null
    )
  }

  getMission(id: string): Mission | null {
    return (
      (this.db.prepare('SELECT * FROM missions WHERE id = ?').get(id) as
        | Mission
        | undefined) ?? null
    )
  }

  getMissionWithProjectContext(id: string): MissionWithProjectContext | null {
    return (
      (this.db
        .prepare(
          `SELECT missions.*, phases.project_id, projects.path AS project_path, projects.spec AS project_spec
           FROM missions
           JOIN phases ON phases.id = missions.phase_id
           JOIN projects ON projects.id = phases.project_id
           WHERE missions.id = ?`,
        )
        .get(id) as MissionWithProjectContext | undefined) ?? null
    )
  }

  getProject(id: string): Project | null {
    return (
      (this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
        | Project
        | undefined) ?? null
    )
  }

  getProjectDetail(id: string): ProjectDetail | null {
    const project = this.getProject(id)
    if (!project) {
      return null
    }

    const phases = this.db
      .prepare(
        'SELECT * FROM phases WHERE project_id = ? ORDER BY sort_order ASC, name ASC',
      )
      .all(id) as Array<ProjectDetail['phases'][number]>
    const missions = this.db
      .prepare(
        `SELECT missions.*, phases.project_id
         FROM missions
         JOIN phases ON phases.id = missions.phase_id
         WHERE phases.project_id = ?
         ORDER BY missions.name ASC`,
      )
      .all(id) as Array<{
      id: string
      phase_id: string
      name: string
      status: ProjectDetail['phases'][number]['missions'][number]['status']
      progress: number
      project_id: string
    }>
    const tasks = this.db
      .prepare(
        `SELECT tasks.*, missions.phase_id
         FROM tasks
         JOIN missions ON missions.id = tasks.mission_id
         JOIN phases ON phases.id = missions.phase_id
         WHERE phases.project_id = ?
         ORDER BY tasks.sort_order ASC, tasks.created_at ASC`,
      )
      .all(id) as Array<Task & { phase_id: string }>

    return {
      ...project,
      phases: phases.map((phase) => ({
        ...phase,
        missions: missions
          .filter((mission) => mission.phase_id === phase.id)
          .map((mission) => ({
            ...mission,
            tasks: tasks.filter((task) => task.mission_id === mission.id),
          })),
      })),
    }
  }

  updateProject(
    id: string,
    updates: Partial<CreateProjectInput>,
  ): Project | null {
    const existing = this.getProject(id)
    if (!existing) {
      return null
    }

    const nextName = Object.prototype.hasOwnProperty.call(updates, 'name')
      ? updates.name
      : existing.name
    const nextPath = Object.prototype.hasOwnProperty.call(updates, 'path')
      ? updates.path
      : existing.path
    const nextSpec = Object.prototype.hasOwnProperty.call(updates, 'spec')
      ? updates.spec
      : existing.spec
    const nextAutoApprove = Object.prototype.hasOwnProperty.call(
      updates,
      'auto_approve',
    )
      ? updates.auto_approve
      : existing.auto_approve
    const nextMaxConcurrent = Object.prototype.hasOwnProperty.call(
      updates,
      'max_concurrent',
    )
      ? updates.max_concurrent
      : existing.max_concurrent
    const nextRequiredChecks = Object.prototype.hasOwnProperty.call(
      updates,
      'required_checks',
    )
      ? updates.required_checks
      : existing.required_checks
    const nextAllowedTools = Object.prototype.hasOwnProperty.call(
      updates,
      'allowed_tools',
    )
      ? updates.allowed_tools
      : existing.allowed_tools

    this.db
      .prepare(
        `UPDATE projects
         SET name = ?, path = ?, spec = ?, auto_approve = ?, max_concurrent = ?, required_checks = ?, allowed_tools = ?
         WHERE id = ?`,
      )
      .run(
        nextName,
        nextPath,
        nextSpec,
        nextAutoApprove,
        nextMaxConcurrent,
        nextRequiredChecks,
        nextAllowedTools,
        id,
      )
    const project = this.getProject(id)
    if (project) {
      this.logActivity('updated', 'project', project.id, null, project)
    }
    return project
  }

  deleteProject(id: string): boolean {
    const result = this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    if (result.changes > 0) {
      this.logActivity('deleted', 'project', id, null, {})
      return true
    }
    return false
  }

  listTasks(filters: {
    mission_id?: string
    status?: TaskStatus
  }): TaskWithRelations[] {
    const clauses: string[] = []
    const params: unknown[] = []
    if (filters.mission_id) {
      clauses.push('tasks.mission_id = ?')
      params.push(filters.mission_id)
    }
    if (filters.status) {
      clauses.push('tasks.status = ?')
      params.push(filters.status)
    }
    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

    return this.db
      .prepare(
        `SELECT tasks.*,
                missions.name AS mission_name,
                missions.status AS mission_status,
                phases.id AS phase_id,
                projects.id AS project_id,
                projects.name AS project_name,
                projects.path AS project_path,
                agents.adapter_type AS agent_adapter_type
         FROM tasks
         JOIN missions ON missions.id = tasks.mission_id
         JOIN phases ON phases.id = missions.phase_id
         JOIN projects ON projects.id = phases.project_id
         LEFT JOIN agents ON agents.id = tasks.agent_id
         ${whereSql}
         ORDER BY tasks.sort_order ASC, tasks.created_at ASC`,
      )
      .all(...params) as TaskWithRelations[]
  }

  getTask(id: string): Task | null {
    return (
      (this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as
        | Task
        | undefined) ?? null
    )
  }

  createTask(input: CreateTaskInput): Task {
    const task = this.db
      .prepare(
        `INSERT INTO tasks (mission_id, name, description, agent_id, status, sort_order, depends_on)
         VALUES (@mission_id, @name, @description, @agent_id, @status, @sort_order, @depends_on)
         RETURNING *`,
      )
      .get({
        mission_id: input.mission_id,
        name: input.name,
        description: input.description ?? null,
        agent_id: input.agent_id ?? null,
        status: input.status ?? 'pending',
        sort_order: input.sort_order ?? 0,
        depends_on: input.depends_on ? JSON.stringify(input.depends_on) : null,
      }) as Task
    this.logActivity('created', 'task', task.id, task.agent_id, task)
    return task
  }

  updateTask(id: string, updates: UpdateTaskInput): Task | null {
    const existing = this.getTask(id)
    if (!existing) {
      return null
    }

    this.db
      .prepare(
        `UPDATE tasks
         SET name = ?, description = ?, agent_id = ?, status = ?, sort_order = ?, depends_on = ?
         WHERE id = ?`,
      )
      .run(
        updates.name ?? existing.name,
        updates.description ?? existing.description,
        updates.agent_id ?? existing.agent_id,
        updates.status ?? existing.status,
        updates.sort_order ?? existing.sort_order,
        updates.depends_on
          ? JSON.stringify(updates.depends_on)
          : existing.depends_on,
        id,
      )

    const task = this.getTask(id)
    if (task) {
      this.logActivity('updated', 'task', task.id, task.agent_id, task)
    }
    return task
  }

  setTaskStatus(id: string, status: TaskStatus): Task | null {
    const current = this.getTask(id)
    if (!current) {
      return null
    }

    this.db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, id)
    const task = this.getTask(id)
    if (task && task.status !== current.status) {
      if (
        status === 'running' ||
        status === 'completed' ||
        status === 'failed'
      ) {
        this.logActivity(
          status === 'running' ? 'task.started' : `task.${status}`,
          'task',
          task.id,
          task.agent_id,
          {
            task_id: task.id,
            task_name: task.name,
            mission_id: task.mission_id,
            previous_status: current.status,
            status,
            ...this.getTaskProjectContext(task.id),
          },
        )
      }
      this.emitSse('task.updated', task)
      this.emitMissionProgress(task.mission_id)

      // Auto-complete mission when all its tasks are completed
      if (status === 'completed') {
        this.checkMissionCompletion(task.mission_id)
      }
    }
    return task
  }

  private checkMissionCompletion(missionId: string): void {
    const tasks = this.db
      .prepare('SELECT status FROM tasks WHERE mission_id = ?')
      .all(missionId) as Array<{ status: string }>

    if (tasks.length === 0) return

    const allCompleted = tasks.every((t) => t.status === 'completed')
    if (!allCompleted) return

    const mission = this.db
      .prepare('SELECT * FROM missions WHERE id = ?')
      .get(missionId) as { id: string; status: string } | undefined
    if (!mission || mission.status === 'completed') return

    this.db
      .prepare("UPDATE missions SET status = 'completed' WHERE id = ?")
      .run(missionId)
    this.logActivity('mission.completed', 'mission', missionId, null, {
      mission_id: missionId,
      status: 'completed',
      ...this.getMissionProjectContext(missionId),
    })
    this.emitSse('mission.updated', { id: missionId, status: 'completed' })

    // Also check if the parent phase is complete
    const phase = this.db
      .prepare(
        'SELECT phases.id FROM phases JOIN missions ON missions.phase_id = phases.id WHERE missions.id = ?',
      )
      .get(missionId) as { id: string } | undefined
    if (phase) {
      this.checkPhaseCompletion(phase.id)
    }
  }

  private checkPhaseCompletion(phaseId: string): void {
    const missions = this.db
      .prepare('SELECT status FROM missions WHERE phase_id = ?')
      .all(phaseId) as Array<{ status: string }>

    if (missions.length === 0) return

    const allCompleted = missions.every((m) => m.status === 'completed')
    if (!allCompleted) return

    this.db
      .prepare("UPDATE phases SET status = 'completed' WHERE id = ?")
      .run(phaseId)
    this.emitSse('phase.updated', { id: phaseId, status: 'completed' })
  }

  refreshMissionTaskStatuses(missionId: string): TaskWithRelations[] {
    const tasks = this.listTasks({ mission_id: missionId })
    const completedTaskIds = new Set(
      tasks
        .filter((task) => task.status === 'completed')
        .map((task) => task.id),
    )
    const ready: TaskWithRelations[] = []

    for (const task of tasks) {
      if (task.status !== 'pending') {
        continue
      }

      const dependencies = parseJsonOrDefault<string[]>(task.depends_on, [])
      const isReady = dependencies.every((dependencyId) =>
        completedTaskIds.has(dependencyId),
      )
      if (!isReady) {
        continue
      }

      const updated = this.setTaskStatus(task.id, 'ready')
      ready.push(
        updated
          ? { ...task, status: updated.status }
          : { ...task, status: 'ready' },
      )
    }

    return ready
  }

  refreshReadyTasks(): TaskWithRelations[] {
    // Only promote pending tasks whose parent mission is explicitly running
    const runningMissionIds = new Set(
      (
        this.db
          .prepare("SELECT id FROM missions WHERE status = 'running'")
          .all() as Array<{ id: string }>
      ).map((row) => row.id),
    )

    const pendingTasks = this.listTasks({ status: 'pending' }).filter((task) =>
      runningMissionIds.has(task.mission_id),
    )
    const completedTaskIds = new Set(
      (
        this.db
          .prepare("SELECT id FROM tasks WHERE status = 'completed'")
          .all() as Array<{ id: string }>
      ).map((row) => row.id),
    )
    for (const task of pendingTasks) {
      const dependencies = parseJsonOrDefault<string[]>(task.depends_on, [])
      const isReady =
        dependencies.length === 0 ||
        dependencies.every((dependencyId) => completedTaskIds.has(dependencyId))
      if (isReady) {
        this.setTaskStatus(task.id, 'ready')
      }
    }

    return this.listTasks({ status: 'ready' })
  }

  createTaskRun(
    taskId: string,
    agentId: string | null,
    workspacePath: string | null,
    attempt: number,
  ): TaskRun {
    const taskRun = this.db
      .prepare(
        `INSERT INTO task_runs (task_id, agent_id, status, attempt, workspace_path)
         VALUES (?, ?, 'running', ?, ?)
         RETURNING *`,
      )
      .get(taskId, agentId, attempt, workspacePath) as TaskRun
    this.emitSse('task_run.started', taskRun)
    return taskRun
  }

  markTaskRunStarted(id: string): TaskRun | null {
    const current = this.getTaskRun(id)
    if (!current) {
      return null
    }

    this.db
      .prepare(`UPDATE task_runs SET started_at = datetime('now') WHERE id = ?`)
      .run(id)

    const run = this.getTaskRun(id)
    if (run) {
      this.emitSse('task_run.updated', run)
    }
    return run
  }

  completeTaskRun(
    id: string,
    updates: Partial<
      Pick<TaskRun, 'status' | 'error' | 'input_tokens' | 'output_tokens' | 'cost_cents'>
    >,
  ): TaskRun | null {
    const current = this.getTaskRun(id)
    if (!current) {
      return null
    }

    this.db
      .prepare(
        `UPDATE task_runs
         SET completed_at = datetime('now'),
             status = ?,
             error = ?,
             input_tokens = ?,
             output_tokens = ?,
             cost_cents = ?
         WHERE id = ?`,
      )
      .run(
        updates.status ?? current.status,
        updates.error ?? current.error,
        updates.input_tokens ?? current.input_tokens,
        updates.output_tokens ?? current.output_tokens,
        updates.cost_cents ?? current.cost_cents,
        id,
      )

    const run = this.getTaskRun(id)
    if (run) {
      this.emitSse('task_run.updated', run)
    }
    return run
  }

  failTaskRun(
    id: string,
    error: string | null,
    updates: Partial<Pick<TaskRun, 'input_tokens' | 'output_tokens' | 'cost_cents'>> = {},
  ): TaskRun | null {
    const current = this.getTaskRun(id)
    if (!current) {
      return null
    }

    this.db
      .prepare(
        `UPDATE task_runs
         SET completed_at = datetime('now'),
             status = 'failed',
             error = ?,
             input_tokens = ?,
             output_tokens = ?,
             cost_cents = ?
         WHERE id = ?`,
      )
      .run(
        error,
        updates.input_tokens ?? current.input_tokens,
        updates.output_tokens ?? current.output_tokens,
        updates.cost_cents ?? current.cost_cents,
        id,
      )

    const run = this.getTaskRun(id)
    if (run) {
      this.emitSse('task_run.updated', run)
    }
    return run
  }

  updateTaskRun(
    id: string,
    updates: Partial<
      Pick<
        TaskRun,
        | 'status'
        | 'completed_at'
        | 'error'
        | 'input_tokens'
        | 'output_tokens'
        | 'cost_cents'
      >
    >,
  ): TaskRun | null {
    const current = this.getTaskRun(id)
    if (!current) {
      return null
    }

    this.db
      .prepare(
        `UPDATE task_runs
         SET status = ?, completed_at = ?, error = ?, input_tokens = ?, output_tokens = ?, cost_cents = ?
         WHERE id = ?`,
      )
      .run(
        updates.status ?? current.status,
        updates.completed_at ?? current.completed_at,
        updates.error ?? current.error,
        updates.input_tokens ?? current.input_tokens,
        updates.output_tokens ?? current.output_tokens,
        updates.cost_cents ?? current.cost_cents,
        id,
      )

    const run = this.getTaskRun(id)
    if (run) {
      this.emitSse('task_run.updated', run)
    }
    return run
  }

  updateTaskRunWorkspacePath(id: string, workspacePath: string): TaskRun | null {
    this.db
      .prepare(
        `UPDATE task_runs
         SET workspace_path = ?
         WHERE id = ?`,
      )
      .run(workspacePath, id)

    const run = this.getTaskRun(id)
    if (run) {
      this.emitSse('task_run.updated', run)
    }
    return run
  }

  getTaskRun(id: string): TaskRun | null {
    return (
      (this.db.prepare('SELECT * FROM task_runs WHERE id = ?').get(id) as
        | TaskRun
        | undefined) ?? null
    )
  }

  getTaskRunApprovalContext(id: string):
    | (TaskRun & {
        task_name: string
        task_id: string
        project_id: string
        project_name: string
        project_path: string | null
      })
    | null {
    return (
      (this.db
        .prepare(
          `SELECT tr.*,
            t.id AS task_id,
            t.name AS task_name,
            p.id AS project_id,
            p.name AS project_name,
            p.path AS project_path
           FROM task_runs tr
           JOIN tasks t ON t.id = tr.task_id
           JOIN missions m ON m.id = t.mission_id
           JOIN phases ph ON ph.id = m.phase_id
           JOIN projects p ON p.id = ph.project_id
           WHERE tr.id = ?`,
        )
        .get(id) as
        | (TaskRun & {
            task_name: string
            task_id: string
            project_id: string
            project_name: string
            project_path: string | null
          })
        | undefined) ?? null
    )
  }

  getRunningTaskRuns(): TaskRun[] {
    return this.db
      .prepare("SELECT * FROM task_runs WHERE status = 'running'")
      .all() as TaskRun[]
  }

  listTaskRuns(
    filters: { taskId?: string; projectId?: string } = {},
  ): TaskRunWithRelations[] {
    const clauses: string[] = []
    const params: string[] = []

    if (filters.taskId) {
      clauses.push('task_runs.task_id = ?')
      params.push(filters.taskId)
    }

    if (filters.projectId) {
      clauses.push('phases.project_id = ?')
      params.push(filters.projectId)
    }

    const clause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    return this.db
      .prepare(
        `SELECT task_runs.*,
            tasks.name AS task_name,
            missions.name AS mission_name,
            tasks.mission_id,
            phases.project_id,
            projects.name AS project_name,
            agents.name AS agent_name
         FROM task_runs
         JOIN tasks ON tasks.id = task_runs.task_id
         JOIN missions ON missions.id = tasks.mission_id
         JOIN phases ON phases.id = missions.phase_id
         JOIN projects ON projects.id = phases.project_id
         LEFT JOIN agents ON agents.id = task_runs.agent_id
         ${clause}
         ORDER BY task_runs.started_at DESC`,
      )
      .all(...params) as TaskRunWithRelations[]
  }

  appendRunEvent(
    taskRunId: string,
    type: RunEventType,
    data: Record<string, unknown> | null,
  ): RunEvent {
    const event = this.db
      .prepare(
        'INSERT INTO run_events (task_run_id, type, data) VALUES (?, ?, ?) RETURNING *',
      )
      .get(taskRunId, type, data ? JSON.stringify(data) : null) as RunEvent
    this.emitSse('run_event', event)
    return event
  }

  listRunEvents(taskRunId?: string): RunEvent[] {
    if (taskRunId) {
      return this.db
        .prepare(
          'SELECT * FROM run_events WHERE task_run_id = ? ORDER BY id ASC',
        )
        .all(taskRunId) as RunEvent[]
    }
    return this.db
      .prepare('SELECT * FROM run_events ORDER BY id DESC LIMIT 200')
      .all() as RunEvent[]
  }

  listActivityEvents(
    filters: { project_id?: string; limit?: number } = {},
  ): ActivityEvent[] {
    const params: unknown[] = []
    const clauses = [
      "activity_log.action IN ('task.started', 'task.completed', 'task.failed', 'checkpoint.created', 'mission.started', 'mission.completed')",
    ]

    if (filters.project_id) {
      clauses.push("json_extract(activity_log.details, '$.project_id') = ?")
      params.push(filters.project_id)
    }

    const limit = Number.isFinite(filters.limit)
      ? Math.max(1, Math.min(200, Math.trunc(filters.limit ?? 50)))
      : 50
    params.push(limit)

    const rows = this.db
      .prepare(
        `SELECT activity_log.id, activity_log.action, activity_log.entity_type, activity_log.entity_id, activity_log.details, activity_log.created_at
         FROM activity_log
         WHERE ${clauses.join(' AND ')}
         ORDER BY activity_log.created_at DESC, activity_log.id DESC
         LIMIT ?`,
      )
      .all(...params) as Array<{
      id: number
      action: string
      entity_type: string
      entity_id: string
      details: string | null
      created_at: string
    }>

    return rows.map((row) => ({
      id: row.id,
      type: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      data: parseJsonOrDefault<Record<string, unknown> | null>(
        row.details,
        null,
      ),
      timestamp: row.created_at,
    }))
  }

  createCheckpoint(
    taskRunId: string,
    summary: string | null,
    diffStat: string | null,
    commitHash?: string | null,
    verification?: string | null,
  ): Checkpoint {
    const checkpoint = this.db
      .prepare(
        'INSERT INTO checkpoints (task_run_id, summary, diff_stat, commit_hash, verification) VALUES (?, ?, ?, ?, ?) RETURNING *',
      )
      .get(
        taskRunId,
        summary,
        diffStat,
        commitHash ?? null,
        verification ?? null,
      ) as Checkpoint
    this.logActivity('checkpoint.created', 'checkpoint', checkpoint.id, null, {
      checkpoint_id: checkpoint.id,
      task_run_id: taskRunId,
      summary,
      diff_stat: diffStat,
      commit_hash: commitHash ?? null,
      verification: verification ?? null,
      ...this.getCheckpointProjectContext(checkpoint.id),
    })
    this.emitSse('checkpoint.created', checkpoint)
    return checkpoint
  }

  getCheckpoint(id: string): Checkpoint | null {
    return (
      (this.db.prepare('SELECT * FROM checkpoints WHERE id = ?').get(id) as
        | Checkpoint
        | undefined) ?? null
    )
  }

  updateCheckpointVerification(
    id: string,
    verification: string | null,
  ): Checkpoint | null {
    this.db
      .prepare('UPDATE checkpoints SET verification = ? WHERE id = ?')
      .run(verification, id)
    const checkpoint =
      (this.db.prepare('SELECT * FROM checkpoints WHERE id = ?').get(id) as
        | Checkpoint
        | undefined) ?? null
    if (checkpoint) {
      this.emitSse('checkpoint.updated', checkpoint)
    }
    return checkpoint
  }

  getCheckpointDetail(id: string):
    | (Checkpoint & {
        task_id: string | null
        task_name: string | null
        mission_name: string | null
        project_name: string | null
        project_id: string | null
        project_path: string | null
        agent_name: string | null
        agent_model: string | null
        agent_adapter_type: string | null
        task_run_status: string | null
        task_run_attempt: number | null
        task_run_workspace_path: string | null
        task_run_started_at: string | null
        task_run_completed_at: string | null
        task_run_error: string | null
        task_run_input_tokens: number | null
        task_run_output_tokens: number | null
        task_run_cost_cents: number | null
      })
    | null {
    return (
      (this.db
        .prepare(
          `SELECT c.*,
            t.id AS task_id,
            t.name AS task_name,
            m.name AS mission_name,
            p.id AS project_id,
            p.name AS project_name,
            p.path AS project_path,
            a.name AS agent_name,
            a.model AS agent_model,
            a.adapter_type AS agent_adapter_type,
            tr.status AS task_run_status,
            tr.attempt AS task_run_attempt,
            tr.workspace_path AS task_run_workspace_path,
            tr.started_at AS task_run_started_at,
            tr.completed_at AS task_run_completed_at,
            tr.error AS task_run_error,
            tr.input_tokens AS task_run_input_tokens,
            tr.output_tokens AS task_run_output_tokens,
            tr.cost_cents AS task_run_cost_cents
           FROM checkpoints c
           LEFT JOIN task_runs tr ON c.task_run_id = tr.id
           LEFT JOIN tasks t ON tr.task_id = t.id
           LEFT JOIN missions m ON t.mission_id = m.id
           LEFT JOIN phases ph ON m.phase_id = ph.id
           LEFT JOIN projects p ON ph.project_id = p.id
           LEFT JOIN agents a ON tr.agent_id = a.id
           WHERE c.id = ?`,
        )
        .get(id) as
        | (Checkpoint & {
            task_id: string | null
            task_name: string | null
            mission_name: string | null
            project_name: string | null
            project_id: string | null
            project_path: string | null
            agent_name: string | null
            agent_model: string | null
            agent_adapter_type: string | null
            task_run_status: string | null
            task_run_attempt: number | null
            task_run_workspace_path: string | null
            task_run_started_at: string | null
            task_run_completed_at: string | null
            task_run_error: string | null
            task_run_input_tokens: number | null
            task_run_output_tokens: number | null
            task_run_cost_cents: number | null
          })
        | undefined) ?? null
    )
  }

  listCheckpoints(
    status?: string,
    projectId?: string,
  ): Array<
    Checkpoint & {
      task_name?: string
      mission_name?: string
      project_name?: string
      project_id?: string
      agent_name?: string
    }
  > {
    const whereClauses: string[] = []
    const params: string[] = []

    if (status) {
      whereClauses.push('c.status = ?')
      params.push(status)
    }

    if (projectId) {
      whereClauses.push('p.id = ?')
      params.push(projectId)
    }

    const query = `
      SELECT c.*,
        t.name AS task_name,
        m.name AS mission_name,
        p.id AS project_id,
        p.name AS project_name,
        a.name AS agent_name
      FROM checkpoints c
      LEFT JOIN task_runs tr ON c.task_run_id = tr.id
      LEFT JOIN tasks t ON tr.task_id = t.id
      LEFT JOIN missions m ON t.mission_id = m.id
      LEFT JOIN phases ph ON m.phase_id = ph.id
      LEFT JOIN projects p ON ph.project_id = p.id
      LEFT JOIN agents a ON tr.agent_id = a.id
      ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''}
      ORDER BY c.created_at DESC
    `
    return this.db.prepare(query).all(...params) as Array<
      Checkpoint & {
        task_name?: string
        mission_name?: string
        project_name?: string
        project_id?: string
        agent_name?: string
      }
    >
  }

  updateCheckpointStatus(
    id: string,
    status: Checkpoint['status'],
    reviewerNotes?: string,
  ): Checkpoint | null {
    this.db
      .prepare(
        'UPDATE checkpoints SET status = ?, reviewer_notes = ? WHERE id = ?',
      )
      .run(status, reviewerNotes ?? null, id)
    const checkpoint =
      (this.db.prepare('SELECT * FROM checkpoints WHERE id = ?').get(id) as
        | Checkpoint
        | undefined) ?? null
    if (checkpoint) {
      this.emitSse('checkpoint.updated', checkpoint)
    }
    return checkpoint
  }

  approveCheckpoint(
    id: string,
    reviewerNotes?: string,
    commitHash?: string | null,
  ): Checkpoint | null {
    if (commitHash !== undefined) {
      this.db
        .prepare(
          "UPDATE checkpoints SET status = 'approved', reviewer_notes = ?, commit_hash = ? WHERE id = ?",
        )
        .run(reviewerNotes ?? null, commitHash, id)
      const checkpoint = this.getCheckpoint(id)
      if (checkpoint) {
        this.emitSse('checkpoint.updated', checkpoint)
      }
      return checkpoint
    }

    return this.updateCheckpointStatus(id, 'approved', reviewerNotes)
  }

  listAgents(): AgentRecord[] {
    return this.db
      .prepare('SELECT * FROM agents ORDER BY created_at DESC')
      .all() as AgentRecord[]
  }

  listAgentDirectory(): AgentDirectoryRecord[] {
    const storedAgents = this.listAgents()
    const agentsByKey = new Map<string, AgentRecord>()

    for (const agent of storedAgents) {
      agentsByKey.set(normalizeKey(agent.id), agent)
      agentsByKey.set(normalizeKey(agent.name), agent)
    }

    const mergedDefaults = DEFAULT_AGENT_DIRECTORY.map((seed) => {
      const stored =
        agentsByKey.get(normalizeKey(seed.id)) ??
        agentsByKey.get(normalizeKey(seed.name)) ??
        null
      if (!stored) return seed

      const parsedCapabilities = parseJsonOrDefault<
        Partial<AgentDirectoryRecord['capabilities']>
      >(stored.capabilities, {})

      return {
        ...seed,
        name: stored.name || seed.name,
        role: stored.role || seed.role,
        adapter_type: stored.adapter_type || seed.adapter_type,
        model: stored.model ?? seed.model,
        status: normalizeDirectoryStatus(stored.status || seed.status),
        capabilities: {
          ...seed.capabilities,
          ...parsedCapabilities,
        },
      }
    })

    const knownNames = new Set(
      mergedDefaults.map((agent) => normalizeKey(agent.name)),
    )
    const extras = storedAgents
      .filter((agent) => !knownNames.has(normalizeKey(agent.name)))
      .map((agent) => {
        const capabilities = parseJsonOrDefault<
          Partial<AgentDirectoryRecord['capabilities']>
        >(agent.capabilities, {})
        return {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          adapter_type: agent.adapter_type,
          model: agent.model,
          provider:
            agent.adapter_type === 'codex'
              ? 'OpenAI'
              : agent.adapter_type === 'claude'
                ? 'Anthropic'
                : agent.adapter_type === 'ollama'
                  ? 'Ollama'
                  : 'OpenClaw',
          status: normalizeDirectoryStatus(agent.status),
          avatar: '🛰️',
          avatar_tone: 'primary' as const,
          description: `${agent.role} agent registered in the workspace daemon.`,
          system_prompt:
            '# Custom agent\n\nThis agent was registered in the workspace daemon.',
          prompt_updated_at: agent.created_at,
          limits: {
            max_tokens: 64_000,
            cost_label: 'Workspace default',
            concurrency_limit: 1,
            memory_scope: 'Project scoped',
          },
          capabilities: {
            repo_write: capabilities.repo_write ?? true,
            shell_commands: capabilities.shell_commands ?? true,
            git_operations: capabilities.git_operations ?? true,
            browser: capabilities.browser ?? false,
            network: capabilities.network ?? false,
          },
          assigned_projects: [],
          skills: [],
        }
      })

    return [...mergedDefaults, ...extras]
  }

  getAgentDirectoryStats(id: string): AgentDirectoryStats | null {
    const agent = this.listAgentDirectory().find((entry) => entry.id === id)
    if (!agent) return null

    const exactMatch = this.db
      .prepare(
        `SELECT
            COUNT(*) AS run_count,
            COALESCE(SUM(CASE WHEN date(COALESCE(tr.started_at, tr.completed_at)) = date('now')
              THEN COALESCE(tr.input_tokens, 0) + COALESCE(tr.output_tokens, 0)
              ELSE 0 END), 0) AS tokens_today,
            COALESCE(SUM(CASE WHEN date(COALESCE(tr.started_at, tr.completed_at)) = date('now')
              THEN COALESCE(tr.cost_cents, 0)
              ELSE 0 END), 0) AS cost_cents_today,
            COALESCE(SUM(CASE WHEN date(COALESCE(tr.started_at, tr.completed_at)) = date('now') THEN 1 ELSE 0 END), 0) AS runs_today,
            COALESCE(SUM(CASE WHEN tr.status IN ('completed', 'awaiting_review') THEN 1 ELSE 0 END), 0) AS success_count,
            COALESCE(SUM(CASE WHEN tr.status IN ('completed', 'awaiting_review', 'failed', 'stopped') THEN 1 ELSE 0 END), 0) AS finished_count,
            AVG(CASE
              WHEN tr.started_at IS NOT NULL
               AND tr.completed_at IS NOT NULL
               AND tr.status IN ('completed', 'awaiting_review')
              THEN (julianday(tr.completed_at) - julianday(tr.started_at)) * 86400000.0
              ELSE NULL
            END) AS avg_response_ms
         FROM task_runs tr
         LEFT JOIN agents a ON a.id = tr.agent_id
         WHERE a.name = ? OR a.id = ?`,
      )
      .get(agent.name, agent.id) as
      | {
          run_count: number | null
          tokens_today: number | null
          cost_cents_today: number | null
          runs_today: number | null
          success_count: number | null
          finished_count: number | null
          avg_response_ms: number | null
        }
      | undefined

    const shouldFallback = !exactMatch || (exactMatch.run_count ?? 0) === 0
    const fallbackAggregate = this.db
      .prepare(
        `SELECT
            COUNT(*) AS run_count,
            COALESCE(SUM(CASE WHEN date(COALESCE(tr.started_at, tr.completed_at)) = date('now')
              THEN COALESCE(tr.input_tokens, 0) + COALESCE(tr.output_tokens, 0)
              ELSE 0 END), 0) AS tokens_today,
            COALESCE(SUM(CASE WHEN date(COALESCE(tr.started_at, tr.completed_at)) = date('now')
              THEN COALESCE(tr.cost_cents, 0)
              ELSE 0 END), 0) AS cost_cents_today,
            COALESCE(SUM(CASE WHEN date(COALESCE(tr.started_at, tr.completed_at)) = date('now') THEN 1 ELSE 0 END), 0) AS runs_today,
            COALESCE(SUM(CASE WHEN tr.status IN ('completed', 'awaiting_review') THEN 1 ELSE 0 END), 0) AS success_count,
            COALESCE(SUM(CASE WHEN tr.status IN ('completed', 'awaiting_review', 'failed', 'stopped') THEN 1 ELSE 0 END), 0) AS finished_count,
            AVG(CASE
              WHEN tr.started_at IS NOT NULL
               AND tr.completed_at IS NOT NULL
               AND tr.status IN ('completed', 'awaiting_review')
              THEN (julianday(tr.completed_at) - julianday(tr.started_at)) * 86400000.0
              ELSE NULL
            END) AS avg_response_ms
         FROM task_runs tr
         LEFT JOIN agents a ON a.id = tr.agent_id
         WHERE a.adapter_type = ?`,
      )
      .get(agent.adapter_type) as
      | {
          run_count: number | null
          tokens_today: number | null
          cost_cents_today: number | null
          runs_today: number | null
          success_count: number | null
          finished_count: number | null
          avg_response_ms: number | null
        }
      | undefined
    const aggregate = shouldFallback ? fallbackAggregate : exactMatch

    const finishedCount = aggregate?.finished_count ?? 0
    const successRate =
      finishedCount > 0
        ? ((aggregate?.success_count ?? 0) / finishedCount) * 100
        : 0

    return {
      agent_id: agent.id,
      runs_today: aggregate?.runs_today ?? 0,
      tokens_today: aggregate?.tokens_today ?? 0,
      cost_cents_today: aggregate?.cost_cents_today ?? 0,
      success_rate: Number.isFinite(successRate) ? successRate : 0,
      avg_response_ms: aggregate?.avg_response_ms ?? null,
    }
  }

  getAgent(id: string): AgentRecord | null {
    return (
      (this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as
        | AgentRecord
        | undefined) ?? null
    )
  }

  registerAgent(input: RegisterAgentInput): AgentRecord {
    const agent = this.db
      .prepare(
        `INSERT INTO agents (name, role, adapter_type, adapter_config, model, capabilities)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING *`,
      )
      .get(
        input.name,
        input.role ?? 'coder',
        input.adapter_type ?? 'codex',
        JSON.stringify(input.adapter_config ?? {}),
        input.model ?? null,
        JSON.stringify(input.capabilities ?? {}),
      ) as AgentRecord
    this.logActivity('registered', 'agent', agent.id, agent.id, agent)
    return agent
  }

  setAgentStatus(id: string, status: string): AgentRecord | null {
    this.db.prepare('UPDATE agents SET status = ? WHERE id = ?').run(status, id)
    const agent = this.getAgent(id)
    if (agent) {
      this.emitSse('agent.updated', agent)
    }
    return agent
  }

  getAgentStatus(
    id: string,
  ): { agent: AgentRecord; activeTaskRun: TaskRunWithRelations | null } | null {
    const agent = this.getAgent(id)
    if (!agent) {
      return null
    }

    const activeTaskRun =
      (this.db
        .prepare(
          `SELECT task_runs.*, tasks.name AS task_name, tasks.mission_id, phases.project_id, agents.name AS agent_name
           FROM task_runs
           JOIN tasks ON tasks.id = task_runs.task_id
           JOIN missions ON missions.id = tasks.mission_id
           JOIN phases ON phases.id = missions.phase_id
           LEFT JOIN agents ON agents.id = task_runs.agent_id
           WHERE task_runs.agent_id = ? AND task_runs.status = 'running'
           ORDER BY task_runs.started_at DESC
           LIMIT 1`,
        )
        .get(id) as TaskRunWithRelations | undefined) ?? null

    return { agent, activeTaskRun }
  }

  getMissionStatus(id: string): MissionStatus | null {
    const mission = this.getMission(id)
    if (!mission) {
      return null
    }

    const taskBreakdown = this.db
      .prepare(
        `SELECT
           tasks.id,
           tasks.name,
           tasks.status,
           tasks.agent_id,
           latest_run.started_at,
           latest_run.completed_at
         FROM tasks
         LEFT JOIN (
           SELECT tr1.task_id, tr1.started_at, tr1.completed_at
           FROM task_runs tr1
           INNER JOIN (
             SELECT task_id, MAX(id) AS max_id
             FROM task_runs
             GROUP BY task_id
           ) latest ON latest.max_id = tr1.id
         ) AS latest_run ON latest_run.task_id = tasks.id
         WHERE tasks.mission_id = ?
         ORDER BY tasks.sort_order ASC, tasks.created_at ASC`,
      )
      .all(id) as MissionStatus['task_breakdown']

    const totalCount = taskBreakdown.length
    const completedCount = taskBreakdown.filter(
      (task) => task.status === 'completed',
    ).length
    const progress =
      totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

    this.db
      .prepare('UPDATE missions SET progress = ? WHERE id = ?')
      .run(progress, id)

    const runningAgents = this.db
      .prepare(
        `SELECT DISTINCT COALESCE(agents.name, task_runs.agent_id) AS agent_name
         FROM task_runs
         JOIN tasks ON tasks.id = task_runs.task_id
         LEFT JOIN agents ON agents.id = task_runs.agent_id
         WHERE tasks.mission_id = ? AND task_runs.status = 'running'
         ORDER BY agent_name ASC`,
      )
      .all(id) as Array<{ agent_name: string | null }>

    const averageTiming = this.db
      .prepare(
        `SELECT AVG((julianday(task_runs.completed_at) - julianday(task_runs.started_at)) * 86400000.0) AS avg_ms
         FROM task_runs
         JOIN tasks ON tasks.id = task_runs.task_id
         WHERE tasks.mission_id = ?
           AND task_runs.started_at IS NOT NULL
           AND task_runs.completed_at IS NOT NULL
           AND task_runs.status = 'completed'`,
      )
      .get(id) as { avg_ms: number | null } | undefined

    const remainingCount = Math.max(totalCount - completedCount, 0)
    const estimatedCompletion =
      averageTiming?.avg_ms && remainingCount > 0
        ? new Date(
            Date.now() + averageTiming.avg_ms * remainingCount,
          ).toISOString()
        : null

    const updatedMission = this.getMission(id)
    if (!updatedMission) {
      return null
    }

    return {
      mission: {
        id: updatedMission.id,
        name: updatedMission.name,
        status: updatedMission.status,
        progress: updatedMission.progress,
      },
      task_breakdown: taskBreakdown,
      running_agents: runningAgents.flatMap((row) =>
        row.agent_name ? [row.agent_name] : [],
      ),
      completed_count: completedCount,
      total_count: totalCount,
      estimated_completion: estimatedCompletion,
    }
  }

  startMission(id: string): boolean {
    const result = this.db
      .prepare("UPDATE missions SET status = 'running' WHERE id = ?")
      .run(id)
    this.db
      .prepare(
        "UPDATE tasks SET status = 'pending' WHERE mission_id = ? AND status = 'paused'",
      )
      .run(id)
    if (result.changes > 0) {
      this.logActivity('mission.started', 'mission', id, null, {
        mission_id: id,
        status: 'running',
        source: 'start',
        ...this.getMissionProjectContext(id),
      })
      this.refreshMissionTaskStatuses(id)
      this.emitMissionProgress(id)
    }
    return result.changes > 0
  }

  pauseMission(id: string): boolean {
    const result = this.db
      .prepare("UPDATE missions SET status = 'paused' WHERE id = ?")
      .run(id)
    this.db
      .prepare(
        "UPDATE tasks SET status = 'paused' WHERE mission_id = ? AND status IN ('pending', 'ready', 'running')",
      )
      .run(id)
    if (result.changes > 0) {
      this.emitMissionProgress(id)
    }
    return result.changes > 0
  }

  resumeMission(id: string): boolean {
    const result = this.db
      .prepare("UPDATE missions SET status = 'running' WHERE id = ?")
      .run(id)
    this.db
      .prepare(
        "UPDATE tasks SET status = 'pending' WHERE mission_id = ? AND status = 'paused'",
      )
      .run(id)
    if (result.changes > 0) {
      this.logActivity('mission.started', 'mission', id, null, {
        mission_id: id,
        status: 'running',
        source: 'resume',
        ...this.getMissionProjectContext(id),
      })
      this.refreshMissionTaskStatuses(id)
      this.emitMissionProgress(id)
    }
    return result.changes > 0
  }

  stopMission(id: string): boolean {
    const result = this.db
      .prepare("UPDATE missions SET status = 'stopped' WHERE id = ?")
      .run(id)
    this.db
      .prepare(
        "UPDATE tasks SET status = 'stopped' WHERE mission_id = ? AND status != 'completed'",
      )
      .run(id)
    if (result.changes > 0) {
      this.emitMissionProgress(id)
    }
    return result.changes > 0
  }

  logActivity(
    action: string,
    entityType: string,
    entityId: string,
    agentId: string | null,
    details: unknown,
  ): ActivityLogEntry {
    const entry = this.db
      .prepare(
        'INSERT INTO activity_log (action, entity_type, entity_id, agent_id, details) VALUES (?, ?, ?, ?, ?) RETURNING *',
      )
      .get(
        action,
        entityType,
        entityId,
        agentId,
        JSON.stringify(details),
      ) as ActivityLogEntry
    this.emitSse('activity_log', entry)
    return entry
  }

  private getTaskProjectContext(taskId: string): Record<string, unknown> {
    const row = this.db
      .prepare(
        `SELECT tasks.name AS task_name, missions.id AS mission_id, missions.name AS mission_name, phases.id AS phase_id, projects.id AS project_id, projects.name AS project_name
         FROM tasks
         JOIN missions ON missions.id = tasks.mission_id
         JOIN phases ON phases.id = missions.phase_id
         JOIN projects ON projects.id = phases.project_id
         WHERE tasks.id = ?`,
      )
      .get(taskId) as
      | {
          task_name: string
          mission_id: string
          mission_name: string
          phase_id: string
          project_id: string
          project_name: string
        }
      | undefined

    return row ?? {}
  }

  private getMissionProjectContext(missionId: string): Record<string, unknown> {
    const row = this.db
      .prepare(
        `SELECT missions.name AS mission_name, phases.id AS phase_id, projects.id AS project_id, projects.name AS project_name
         FROM missions
         JOIN phases ON phases.id = missions.phase_id
         JOIN projects ON projects.id = phases.project_id
         WHERE missions.id = ?`,
      )
      .get(missionId) as
      | {
          mission_name: string
          phase_id: string
          project_id: string
          project_name: string
        }
      | undefined

    return row ?? {}
  }

  private getCheckpointProjectContext(
    checkpointId: string,
  ): Record<string, unknown> {
    const row = this.db
      .prepare(
        `SELECT checkpoints.task_run_id, tasks.id AS task_id, tasks.name AS task_name, missions.id AS mission_id, missions.name AS mission_name, projects.id AS project_id, projects.name AS project_name
         FROM checkpoints
         JOIN task_runs ON task_runs.id = checkpoints.task_run_id
         JOIN tasks ON tasks.id = task_runs.task_id
         JOIN missions ON missions.id = tasks.mission_id
         JOIN phases ON phases.id = missions.phase_id
         JOIN projects ON projects.id = phases.project_id
         WHERE checkpoints.id = ?`,
      )
      .get(checkpointId) as
      | {
          task_run_id: string
          task_id: string
          task_name: string
          mission_id: string
          mission_name: string
          project_id: string
          project_name: string
        }
      | undefined

    return row ?? {}
  }

  private emitSse(event: string, payload: unknown): void {
    this.emit('sse', {
      event,
      data: payload,
    })
  }

  private emitMissionProgress(missionId: string): void {
    const status = this.getMissionStatus(missionId)
    if (!status) {
      return
    }

    const event: MissionProgressEvent = {
      mission_id: missionId,
      progress: status.mission.progress,
      completed_count: status.completed_count,
      total_count: status.total_count,
    }
    this.emitSse('mission.progress', event)
  }
}
