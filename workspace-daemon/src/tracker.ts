import { EventEmitter } from "node:events";
import type Database from "better-sqlite3";
import { getDatabase } from "./db";
import type {
  ActivityLogEntry,
  AgentRecord,
  Checkpoint,
  CreateProjectInput,
  CreateTaskInput,
  Project,
  ProjectDetail,
  RegisterAgentInput,
  RunEvent,
  RunEventType,
  Task,
  TaskRun,
  TaskRunStatus,
  TaskRunWithRelations,
  TaskStatus,
  TaskWithRelations,
  UpdateTaskInput,
} from "./types";

function parseJsonOrDefault<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export class Tracker extends EventEmitter {
  private readonly db: Database.Database;

  constructor(db = getDatabase()) {
    super();
    this.db = db;
  }

  listProjects(): Project[] {
    return this.db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all() as Project[];
  }

  createProject(input: CreateProjectInput): Project {
    const stmt = this.db.prepare(
      "INSERT INTO projects (name, path, spec) VALUES (@name, @path, @spec) RETURNING *",
    );
    const project = stmt.get({
      name: input.name,
      path: input.path ?? null,
      spec: input.spec ?? null,
    }) as Project;
    this.logActivity("created", "project", project.id, null, project);
    return project;
  }

  getProject(id: string): Project | null {
    return (this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project | undefined) ?? null;
  }

  getProjectDetail(id: string): ProjectDetail | null {
    const project = this.getProject(id);
    if (!project) {
      return null;
    }

    const phases = this.db
      .prepare("SELECT * FROM phases WHERE project_id = ? ORDER BY sort_order ASC, name ASC")
      .all(id) as Array<ProjectDetail["phases"][number]>;
    const missions = this.db
      .prepare(
        `SELECT missions.*, phases.project_id
         FROM missions
         JOIN phases ON phases.id = missions.phase_id
         WHERE phases.project_id = ?
         ORDER BY missions.name ASC`,
      )
      .all(id) as Array<{
      id: string;
      phase_id: string;
      name: string;
      status: ProjectDetail["phases"][number]["missions"][number]["status"];
      progress: number;
      project_id: string;
    }>;
    const tasks = this.db
      .prepare(
        `SELECT tasks.*, missions.phase_id
         FROM tasks
         JOIN missions ON missions.id = tasks.mission_id
         JOIN phases ON phases.id = missions.phase_id
         WHERE phases.project_id = ?
         ORDER BY tasks.sort_order ASC, tasks.created_at ASC`,
      )
      .all(id) as Array<Task & { phase_id: string }>;

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
    };
  }

  updateProject(id: string, updates: Partial<CreateProjectInput>): Project | null {
    const existing = this.getProject(id);
    if (!existing) {
      return null;
    }

    this.db
      .prepare("UPDATE projects SET name = ?, path = ?, spec = ? WHERE id = ?")
      .run(updates.name ?? existing.name, updates.path ?? existing.path, updates.spec ?? existing.spec, id);
    const project = this.getProject(id);
    if (project) {
      this.logActivity("updated", "project", project.id, null, project);
    }
    return project;
  }

  deleteProject(id: string): boolean {
    const result = this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    if (result.changes > 0) {
      this.logActivity("deleted", "project", id, null, {});
      return true;
    }
    return false;
  }

  listTasks(filters: { mission_id?: string; status?: TaskStatus }): TaskWithRelations[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filters.mission_id) {
      clauses.push("tasks.mission_id = ?");
      params.push(filters.mission_id);
    }
    if (filters.status) {
      clauses.push("tasks.status = ?");
      params.push(filters.status);
    }
    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    return this.db
      .prepare(
        `SELECT tasks.*, missions.name AS mission_name, phases.id AS phase_id, projects.id AS project_id, projects.name AS project_name
         FROM tasks
         JOIN missions ON missions.id = tasks.mission_id
         JOIN phases ON phases.id = missions.phase_id
         JOIN projects ON projects.id = phases.project_id
         ${whereSql}
         ORDER BY tasks.sort_order ASC, tasks.created_at ASC`,
      )
      .all(...params) as TaskWithRelations[];
  }

  getTask(id: string): Task | null {
    return (this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined) ?? null;
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
        status: input.status ?? "pending",
        sort_order: input.sort_order ?? 0,
        depends_on: input.depends_on ? JSON.stringify(input.depends_on) : null,
      }) as Task;
    this.logActivity("created", "task", task.id, task.agent_id, task);
    return task;
  }

  updateTask(id: string, updates: UpdateTaskInput): Task | null {
    const existing = this.getTask(id);
    if (!existing) {
      return null;
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
        updates.depends_on ? JSON.stringify(updates.depends_on) : existing.depends_on,
        id,
      );

    const task = this.getTask(id);
    if (task) {
      this.logActivity("updated", "task", task.id, task.agent_id, task);
    }
    return task;
  }

  setTaskStatus(id: string, status: TaskStatus): Task | null {
    this.db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(status, id);
    return this.getTask(id);
  }

  resolveReadyTasks(limit: number): TaskWithRelations[] {
    const tasks = this.listTasks({ status: "pending" });
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const completedTaskIds = new Set(
      (this.db.prepare("SELECT id FROM tasks WHERE status = 'completed'").all() as Array<{ id: string }>).map((row) => row.id),
    );
    const ready: TaskWithRelations[] = [];

    for (const task of tasks) {
      const dependencies = parseJsonOrDefault<string[]>(task.depends_on, []);
      const isReady = dependencies.every((dependencyId) => completedTaskIds.has(dependencyId) || !byId.has(dependencyId));
      if (isReady) {
        this.setTaskStatus(task.id, "ready");
        ready.push({ ...task, status: "ready" });
      }
      if (ready.length >= limit) {
        break;
      }
    }

    return ready;
  }

  createTaskRun(taskId: string, agentId: string | null, workspacePath: string | null, attempt: number): TaskRun {
    const taskRun = this.db
      .prepare(
        `INSERT INTO task_runs (task_id, agent_id, status, attempt, workspace_path, started_at)
         VALUES (?, ?, 'running', ?, ?, datetime('now'))
         RETURNING *`,
      )
      .get(taskId, agentId, attempt, workspacePath) as TaskRun;
    this.emitSse("task_run.started", taskRun);
    return taskRun;
  }

  updateTaskRun(
    id: string,
    updates: Partial<Pick<TaskRun, "status" | "completed_at" | "error" | "input_tokens" | "output_tokens" | "cost_cents">>,
  ): TaskRun | null {
    const current = this.getTaskRun(id);
    if (!current) {
      return null;
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
      );

    const run = this.getTaskRun(id);
    if (run) {
      this.emitSse("task_run.updated", run);
    }
    return run;
  }

  getTaskRun(id: string): TaskRun | null {
    return (this.db.prepare("SELECT * FROM task_runs WHERE id = ?").get(id) as TaskRun | undefined) ?? null;
  }

  getRunningTaskRuns(): TaskRun[] {
    return this.db.prepare("SELECT * FROM task_runs WHERE status = 'running'").all() as TaskRun[];
  }

  listTaskRuns(taskId?: string): TaskRunWithRelations[] {
    const clause = taskId ? "WHERE task_runs.task_id = ?" : "";
    return this.db
      .prepare(
        `SELECT task_runs.*, tasks.name AS task_name, tasks.mission_id, phases.project_id, agents.name AS agent_name
         FROM task_runs
         JOIN tasks ON tasks.id = task_runs.task_id
         JOIN missions ON missions.id = tasks.mission_id
         JOIN phases ON phases.id = missions.phase_id
         LEFT JOIN agents ON agents.id = task_runs.agent_id
         ${clause}
         ORDER BY task_runs.started_at DESC`,
      )
      .all(...(taskId ? [taskId] : [])) as TaskRunWithRelations[];
  }

  appendRunEvent(taskRunId: string, type: RunEventType, data: Record<string, unknown> | null): RunEvent {
    const event = this.db
      .prepare("INSERT INTO run_events (task_run_id, type, data) VALUES (?, ?, ?) RETURNING *")
      .get(taskRunId, type, data ? JSON.stringify(data) : null) as RunEvent;
    this.emitSse("run_event", event);
    return event;
  }

  listRunEvents(taskRunId?: string): RunEvent[] {
    if (taskRunId) {
      return this.db
        .prepare("SELECT * FROM run_events WHERE task_run_id = ? ORDER BY id ASC")
        .all(taskRunId) as RunEvent[];
    }
    return this.db.prepare("SELECT * FROM run_events ORDER BY id DESC LIMIT 200").all() as RunEvent[];
  }

  createCheckpoint(taskRunId: string, summary: string | null, diffStat: Record<string, unknown> | null): Checkpoint {
    const checkpoint = this.db
      .prepare("INSERT INTO checkpoints (task_run_id, summary, diff_stat) VALUES (?, ?, ?) RETURNING *")
      .get(taskRunId, summary, diffStat ? JSON.stringify(diffStat) : null) as Checkpoint;
    this.emitSse("checkpoint.created", checkpoint);
    return checkpoint;
  }

  listCheckpoints(status?: string): Checkpoint[] {
    if (status) {
      return this.db
        .prepare("SELECT * FROM checkpoints WHERE status = ? ORDER BY created_at DESC")
        .all(status) as Checkpoint[];
    }
    return this.db.prepare("SELECT * FROM checkpoints ORDER BY created_at DESC").all() as Checkpoint[];
  }

  updateCheckpointStatus(id: string, status: Checkpoint["status"], reviewerNotes?: string): Checkpoint | null {
    this.db
      .prepare("UPDATE checkpoints SET status = ?, reviewer_notes = ? WHERE id = ?")
      .run(status, reviewerNotes ?? null, id);
    const checkpoint =
      (this.db.prepare("SELECT * FROM checkpoints WHERE id = ?").get(id) as Checkpoint | undefined) ?? null;
    if (checkpoint) {
      this.emitSse("checkpoint.updated", checkpoint);
    }
    return checkpoint;
  }

  listAgents(): AgentRecord[] {
    return this.db.prepare("SELECT * FROM agents ORDER BY created_at DESC").all() as AgentRecord[];
  }

  getAgent(id: string): AgentRecord | null {
    return (this.db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as AgentRecord | undefined) ?? null;
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
        input.role ?? "coder",
        input.adapter_type ?? "codex",
        JSON.stringify(input.adapter_config ?? {}),
        input.model ?? null,
        JSON.stringify(input.capabilities ?? {}),
      ) as AgentRecord;
    this.logActivity("registered", "agent", agent.id, agent.id, agent);
    return agent;
  }

  setAgentStatus(id: string, status: string): AgentRecord | null {
    this.db.prepare("UPDATE agents SET status = ? WHERE id = ?").run(status, id);
    const agent = this.getAgent(id);
    if (agent) {
      this.emitSse("agent.updated", agent);
    }
    return agent;
  }

  getAgentStatus(id: string): { agent: AgentRecord; activeTaskRun: TaskRunWithRelations | null } | null {
    const agent = this.getAgent(id);
    if (!agent) {
      return null;
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
        .get(id) as TaskRunWithRelations | undefined) ?? null;

    return { agent, activeTaskRun };
  }

  startMission(id: string): boolean {
    const result = this.db.prepare("UPDATE missions SET status = 'running' WHERE id = ?").run(id);
    this.db.prepare("UPDATE tasks SET status = 'pending' WHERE mission_id = ? AND status = 'paused'").run(id);
    return result.changes > 0;
  }

  pauseMission(id: string): boolean {
    const result = this.db.prepare("UPDATE missions SET status = 'paused' WHERE id = ?").run(id);
    this.db.prepare("UPDATE tasks SET status = 'paused' WHERE mission_id = ? AND status IN ('pending', 'ready', 'running')").run(id);
    return result.changes > 0;
  }

  resumeMission(id: string): boolean {
    const result = this.db.prepare("UPDATE missions SET status = 'running' WHERE id = ?").run(id);
    this.db.prepare("UPDATE tasks SET status = 'pending' WHERE mission_id = ? AND status = 'paused'").run(id);
    return result.changes > 0;
  }

  stopMission(id: string): boolean {
    const result = this.db.prepare("UPDATE missions SET status = 'stopped' WHERE id = ?").run(id);
    this.db.prepare("UPDATE tasks SET status = 'stopped' WHERE mission_id = ? AND status != 'completed'").run(id);
    return result.changes > 0;
  }

  logActivity(action: string, entityType: string, entityId: string, agentId: string | null, details: unknown): ActivityLogEntry {
    const entry = this.db
      .prepare("INSERT INTO activity_log (action, entity_type, entity_id, agent_id, details) VALUES (?, ?, ?, ?, ?) RETURNING *")
      .get(action, entityType, entityId, agentId, JSON.stringify(details)) as ActivityLogEntry;
    this.emitSse("activity_log", entry);
    return entry;
  }

  private emitSse(event: string, payload: unknown): void {
    this.emit("sse", {
      event,
      data: payload,
    });
  }
}
