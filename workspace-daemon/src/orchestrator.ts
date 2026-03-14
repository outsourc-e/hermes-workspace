import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { AgentRunner } from "./agent-runner";
import { Scheduler } from "./scheduler";
import { Tracker } from "./tracker";
import { getWorkflowConfig } from "./config";
import type {
  AgentAdapterType,
  AgentRecord,
  OrchestratorState,
  ProviderConcurrencyConfig,
  RetryEntry,
  RunningEntry,
  Task,
  TaskRun,
  TaskRunStatus,
  TaskWithRelations,
} from "./types";

const MAX_RETRIES = 3;
const BASE_RETRY_MS = 10_000;
const MAX_RETRY_MS = 300_000;
const FRONTEND_TASK_PATTERN = /ui|react|screen|component|style|layout|design|frontend/;
const BACKEND_TASK_PATTERN = /api|route|endpoint|db|database|schema|migration|backend|daemon|server/;
const QA_TASK_PATTERN = /review|qa|verify|test|check|audit/;
const PLANNING_TASK_PATTERN = /plan|decompose|spec|roadmap/;

function nowIso(): string {
  return new Date().toISOString();
}

function computeRetryDelay(attempt: number): number {
  return Math.min(BASE_RETRY_MS * 2 ** Math.max(attempt - 1, 0), MAX_RETRY_MS);
}

function isOnlineAgent(agent: AgentRecord): boolean {
  return agent.status === "online" || agent.status === "idle";
}

function getPreferredAgentId(taskName: string): string | null {
  if (FRONTEND_TASK_PATTERN.test(taskName)) {
    return "aurora-coder";
  }

  if (BACKEND_TASK_PATTERN.test(taskName)) {
    return "aurora-daemon";
  }

  if (QA_TASK_PATTERN.test(taskName)) {
    return "aurora-qa";
  }

  if (PLANNING_TASK_PATTERN.test(taskName)) {
    return "aurora-planner";
  }

  return null;
}

export function selectAgent(task: Task, agents: AgentRecord[]): AgentRecord | null {
  if (task.agent_id) {
    return agents.find((agent) => agent.id === task.agent_id) ?? null;
  }

  const onlineAgents = agents.filter(isOnlineAgent);
  const preferredAgentId = getPreferredAgentId(task.name.toLowerCase());
  if (preferredAgentId) {
    const preferredAgent = onlineAgents.find((agent) => agent.id === preferredAgentId);
    if (preferredAgent) {
      return preferredAgent;
    }
  }

  if (task.suggested_agent_type) {
    const suggestedAgent = onlineAgents.find((agent) => agent.adapter_type === task.suggested_agent_type);
    if (suggestedAgent) {
      return suggestedAgent;
    }
  }

  return (
    onlineAgents.find((agent) => agent.adapter_type === "codex") ??
    onlineAgents[0] ??
    null
  );
}

export class Orchestrator extends EventEmitter {
  private readonly tracker: Tracker;
  private readonly agentRunner: AgentRunner;
  private readonly scheduler: Scheduler;
  private readonly abortControllers: Map<string, AbortController>;
  private readonly controlRequests: Map<string, { status: Extract<TaskRunStatus, "paused" | "stopped">; reason: string }>;
  private autoApprove: boolean;
  private timer: NodeJS.Timeout | null = null;
  readonly state: OrchestratorState;

  constructor(tracker: Tracker, agentRunner = new AgentRunner(tracker)) {
    super();
    this.tracker = tracker;
    this.agentRunner = agentRunner;
    this.scheduler = new Scheduler();
    this.abortControllers = new Map();
    this.controlRequests = new Map();
    const workflowConfig = getWorkflowConfig();
    this.autoApprove = workflowConfig.autoApprove;
    this.state = {
      pollIntervalMs: workflowConfig.pollIntervalMs,
      maxConcurrentAgents: workflowConfig.maxConcurrentAgents,
      providerConcurrency: this.resolveProviderConcurrency(workflowConfig.maxConcurrentAgents),
      running: new Map(),
      claimed: new Set(),
      retryAttempts: new Map(),
      completed: new Set(),
    };
  }

  setAutoApprove(enabled: boolean): void {
    this.autoApprove = enabled;
  }

  getAutoApprove(): boolean {
    return this.autoApprove;
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.reconcileRunningTasks();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.state.pollIntervalMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async triggerTask(taskId: string): Promise<boolean> {
    const task = this.tracker.getTask(taskId);
    if (!task) {
      return false;
    }

    const pendingRun = this
      .tracker
      .listTaskRuns({ taskId })
      .find((entry) => entry.status === "pending");
    if (pendingRun) {
      return this.dispatchTaskRun(pendingRun.id);
    }

    this.tracker.setTaskStatus(taskId, "ready");
    await this.tick();
    return true;
  }

  async dispatchTaskRun(runId: string): Promise<boolean> {
    const taskRun = this.tracker.getTaskRun(runId);
    if (!taskRun || taskRun.status !== "pending") {
      return false;
    }

    const task = this.tracker.listTasks({}).find((entry) => entry.id === taskRun.task_id) ?? null;
    if (!task) {
      return false;
    }

    const agent = taskRun.agent_id
      ? this.tracker.getAgent(taskRun.agent_id)
      : selectAgent(task, this.tracker.listAgents());
    if (!agent) {
      return false;
    }

    this.state.retryAttempts.delete(task.id);
    this.state.claimed.add(task.id);
    try {
      await this.dispatchTask(task, {
        taskRun,
        agent,
      });
    } finally {
      this.state.claimed.delete(task.id);
    }

    return true;
  }

  controlTaskRun(runId: string, action: "pause" | "stop"): boolean {
    const runningEntry = [...this.state.running.values()].find((entry) => entry.runId === runId);
    if (!runningEntry) {
      return false;
    }

    const nextStatus: Extract<TaskRunStatus, "paused" | "stopped"> = action === "pause" ? "paused" : "stopped";
    const reason = action === "pause" ? "Paused by user" : "Stopped by user";
    const controller = this.abortControllers.get(runId);
    if (!controller) {
      return false;
    }

    this.controlRequests.set(runId, {
      status: nextStatus,
      reason,
    });
    this.tracker.appendRunEvent(runId, "status", {
      status: nextStatus,
      message: reason,
    });
    controller.abort(reason);
    return true;
  }

  async tick(): Promise<void> {
    const availableSlots = Math.max(this.state.maxConcurrentAgents - this.state.running.size, 0);
    if (availableSlots <= 0) {
      return;
    }

    this.state.providerConcurrency = this.resolveProviderConcurrency(this.state.maxConcurrentAgents);
    this.tracker.refreshReadyTasks();
    const runnableTasks = this.attachResolvedAdapterTypes(
      this.tracker.listTasks({}).filter((task) => task.mission_status === "running" && task.status === "ready"),
    );
    const dispatchableTasks = this.getDispatchableTasks(runnableTasks).slice(0, availableSlots);

    for (const task of dispatchableTasks) {
      if (this.state.running.size >= this.state.maxConcurrentAgents) {
        break;
      }
      if (this.state.claimed.has(task.id)) {
        continue;
      }
      await this.dispatchTask(task);
    }
  }

  private reconcileRunningTasks(): void {
    for (const run of this.tracker.getRunningTaskRuns()) {
      this.tracker.failTaskRun(run.id, "Recovered after daemon restart");
      this.queueRetry(run.task_id, run.attempt, "Recovered after daemon restart");
    }
  }

  private async dispatchTask(
    task: TaskWithRelations,
    options?: {
      taskRun?: TaskRun;
      agent?: AgentRecord;
    },
  ): Promise<void> {
    const project = this.tracker.getProject(task.project_id);
    if (!project) {
      return;
    }

    const agent = options?.agent ?? selectAgent(task, this.tracker.listAgents());
    if (!agent) {
      this.tracker.setTaskStatus(task.id, "failed");
      this.tracker.logActivity("failed", "task", task.id, null, { reason: "No agent available" });
      return;
    }

    const retryEntry = this.state.retryAttempts.get(task.id);
    const attempt = options?.taskRun?.attempt ?? retryEntry?.attempt ?? 1;
    const projectPath = project.path;
    if (!projectPath || !existsSync(projectPath)) {
      const taskRun =
        options?.taskRun ??
        this.tracker.createPendingTaskRun(task.id, agent.id, null, attempt);
      const errorMessage = "Project path no longer exists";
      this.tracker.failTaskRun(taskRun.id, errorMessage);
      this.tracker.logAuditEvent("task.failed", taskRun.id, "task_run");
      this.tracker.setTaskStatus(task.id, "failed");
      this.tracker.setAgentStatus(agent.id, "online");
      return;
    }

    this.tracker.setTaskStatus(task.id, "running");
    this.tracker.setAgentStatus(agent.id, "running");

    const taskRun =
      options?.taskRun ??
      this.tracker.createTaskRun(task.id, agent.id, null, attempt);
    if (options?.taskRun) {
      this.tracker.updateTaskRun(taskRun.id, {
        status: "running",
        completed_at: null,
        error: null,
        input_tokens: 0,
        output_tokens: 0,
        cost_cents: 0,
      });
    }
    const abortController = new AbortController();
    const runningEntry: RunningEntry = {
      taskId: task.id,
      runId: taskRun.id,
      attempt,
      workspacePath: "",
      agentId: agent.id,
      adapterType: agent.adapter_type,
      startedAt: nowIso(),
      session: null,
    };
    this.state.running.set(task.id, runningEntry);
    this.abortControllers.set(taskRun.id, abortController);
    this.tracker.markTaskRunStarted(taskRun.id);
    this.tracker.logAuditEvent("task.started", taskRun.id, "task_run");
    this.emit("dispatch", { taskId: task.id, runId: taskRun.id });

    try {
      const { result, workspacePath, checkpoint, autoApproved } = await this.agentRunner.runTask({
        project,
        task,
        taskRun,
        agent,
        attempt,
        config: {
          autoApprove: this.autoApprove,
        },
        signal: abortController.signal,
      });

      runningEntry.workspacePath = workspacePath;
      const controlRequest = this.controlRequests.get(taskRun.id);

      if (controlRequest || result.status === "stopped") {
        const finalStatus = controlRequest?.status ?? "stopped";
        const finalError = controlRequest?.reason ?? result.error ?? result.summary;
        this.tracker.completeTaskRun(taskRun.id, {
          status: finalStatus,
          error: finalError,
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
          cost_cents: result.costCents,
        });
        this.tracker.setTaskStatus(task.id, finalStatus);
        return;
      }

      const taskRunStatus: TaskRunStatus = result.status === "completed" ? "awaiting_review" : "failed";
      if (result.status === "completed") {
        this.tracker.completeTaskRun(taskRun.id, {
          status: taskRunStatus,
          error: result.error ?? null,
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
          cost_cents: result.costCents,
        });
        this.tracker.logAuditEvent("task.completed", taskRun.id, "task_run");
      } else {
        this.tracker.failTaskRun(taskRun.id, result.error ?? result.summary ?? null, {
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
          cost_cents: result.costCents,
        });
        this.tracker.logAuditEvent("task.failed", taskRun.id, "task_run");
      }

      if (result.status === "completed") {
        if (autoApproved && checkpoint) {
          this.tracker.setTaskStatus(task.id, "completed");
          this.tracker.completeTaskRun(taskRun.id, {
            status: "completed",
          });
          this.state.completed.add(task.id);
        }
      } else {
        this.tracker.setTaskStatus(task.id, "failed");
        this.queueRetry(task.id, attempt, result.error ?? result.summary);
      }
    } catch (error) {
      const controlRequest = this.controlRequests.get(taskRun.id);
      if (controlRequest) {
        this.tracker.completeTaskRun(taskRun.id, {
          status: controlRequest.status,
          error: controlRequest.reason,
        });
        this.tracker.setTaskStatus(task.id, controlRequest.status);
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.tracker.failTaskRun(taskRun.id, message);
      this.tracker.logAuditEvent("task.failed", taskRun.id, "task_run");
      this.tracker.setTaskStatus(task.id, "failed");
      this.queueRetry(task.id, attempt, message);
    } finally {
      this.abortControllers.delete(taskRun.id);
      this.controlRequests.delete(taskRun.id);
      this.state.running.delete(task.id);
      this.tracker.setAgentStatus(agent.id, "idle");
      void this.tick();
    }
  }

  private getDispatchableTasks(tasks: TaskWithRelations[]): TaskWithRelations[] {
    const tasksByProject = new Map<string, TaskWithRelations[]>();

    for (const task of tasks) {
      const projectTasks = tasksByProject.get(task.project_id);
      if (projectTasks) {
        projectTasks.push(task);
      } else {
        tasksByProject.set(task.project_id, [task]);
      }
    }

    const dispatchable: TaskWithRelations[] = [];
    const plannedRunning = new Map(this.state.running);
    const orderedProjectIds = [...tasksByProject.keys()].sort();

    for (const projectId of orderedProjectIds) {
      const projectTasks = tasksByProject.get(projectId);
      if (!projectTasks) {
        continue;
      }

      const projectDispatchable = this.scheduler.getDispatchable(
        projectTasks,
        plannedRunning,
        this.state.providerConcurrency,
      );
      dispatchable.push(...projectDispatchable);

      for (const task of projectDispatchable) {
        plannedRunning.set(task.id, {
          taskId: task.id,
          runId: `planned:${task.id}`,
          attempt: 0,
          workspacePath: "",
          agentId: task.agent_id,
          adapterType: task.resolved_adapter_type ?? task.agent_adapter_type ?? null,
          startedAt: nowIso(),
          session: null,
        });
      }
    }

    return dispatchable.sort((left, right) => {
      const leftWave = left.wave ?? Number.MAX_SAFE_INTEGER;
      const rightWave = right.wave ?? Number.MAX_SAFE_INTEGER;
      if (leftWave !== rightWave) {
        return leftWave - rightWave;
      }
      if (left.sort_order !== right.sort_order) {
        return left.sort_order - right.sort_order;
      }

      return left.created_at.localeCompare(right.created_at);
    });
  }

  private attachResolvedAdapterTypes(tasks: TaskWithRelations[]): TaskWithRelations[] {
    return tasks.map((task) => {
      if (task.agent_adapter_type) {
        return {
          ...task,
          resolved_adapter_type: task.agent_adapter_type,
        };
      }

      const workflowConfig = getWorkflowConfig(task.project_path ?? null);
      return {
        ...task,
        resolved_adapter_type: workflowConfig.defaultAdapter as AgentAdapterType,
      };
    });
  }

  private resolveProviderConcurrency(fallbackLimit: number): ProviderConcurrencyConfig {
    const limits: ProviderConcurrencyConfig = {};

    for (const entry of this.tracker.listAgentDirectory()) {
      const nextLimit = entry.limits.concurrency_limit || fallbackLimit;
      const currentLimit = limits[entry.adapter_type];
      limits[entry.adapter_type] = currentLimit === undefined ? nextLimit : Math.min(currentLimit, nextLimit);
    }

    if (Object.keys(limits).length === 0) {
      limits.codex = fallbackLimit;
    }

    return limits;
  }

  private queueRetry(taskId: string, currentAttempt: number, error: string): void {
    if (currentAttempt >= MAX_RETRIES) {
      this.state.retryAttempts.delete(taskId);
      return;
    }

    const nextAttempt = currentAttempt + 1;
    const retryEntry: RetryEntry = {
      taskId,
      identifier: taskId,
      attempt: nextAttempt,
      dueAtMs: Date.now() + computeRetryDelay(nextAttempt),
      error,
    };
    this.state.retryAttempts.set(taskId, retryEntry);

    setTimeout(() => {
      const current = this.state.retryAttempts.get(taskId);
      if (!current || current.attempt !== nextAttempt) {
        return;
      }
      this.state.retryAttempts.delete(taskId);
      this.tracker.setTaskStatus(taskId, "ready");
      void this.tick();
    }, computeRetryDelay(nextAttempt));
  }
}
