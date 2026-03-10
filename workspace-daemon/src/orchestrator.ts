import { EventEmitter } from "node:events";
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
  TaskRunStatus,
  TaskWithRelations,
} from "./types";

const MAX_RETRIES = 3;
const BASE_RETRY_MS = 10_000;
const MAX_RETRY_MS = 300_000;

function nowIso(): string {
  return new Date().toISOString();
}

function computeRetryDelay(attempt: number): number {
  return Math.min(BASE_RETRY_MS * 2 ** Math.max(attempt - 1, 0), MAX_RETRY_MS);
}

export class Orchestrator extends EventEmitter {
  private readonly tracker: Tracker;
  private readonly agentRunner: AgentRunner;
  private readonly scheduler: Scheduler;
  private readonly abortControllers: Map<string, AbortController>;
  private readonly controlRequests: Map<string, { status: Extract<TaskRunStatus, "paused" | "stopped">; reason: string }>;
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

    this.tracker.setTaskStatus(taskId, "ready");
    await this.tick();
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

  private async dispatchTask(task: TaskWithRelations): Promise<void> {
    const project = this.tracker.getProject(task.project_id);
    if (!project) {
      return;
    }

    const agent = this.resolveAgent(task.agent_id, project.path);
    if (!agent) {
      this.tracker.setTaskStatus(task.id, "failed");
      this.tracker.logActivity("failed", "task", task.id, null, { reason: "No agent available" });
      return;
    }

    const retryEntry = this.state.retryAttempts.get(task.id);
    const attempt = retryEntry?.attempt ?? 1;
    this.state.claimed.add(task.id);
    this.tracker.setTaskStatus(task.id, "running");
    this.tracker.setAgentStatus(agent.id, "running");

    const taskRun = this.tracker.createTaskRun(task.id, agent.id, null, attempt);
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
    this.emit("dispatch", { taskId: task.id, runId: taskRun.id });

    try {
      const { result, workspacePath, checkpoint, autoApproved } = await this.agentRunner.runTask({
        project,
        task,
        taskRun,
        agent,
        attempt,
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
      } else {
        this.tracker.failTaskRun(taskRun.id, result.error ?? result.summary ?? null, {
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
          cost_cents: result.costCents,
        });
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
      this.tracker.setTaskStatus(task.id, "failed");
      this.queueRetry(task.id, attempt, message);
    } finally {
      this.abortControllers.delete(taskRun.id);
      this.controlRequests.delete(taskRun.id);
      this.state.running.delete(task.id);
      this.state.claimed.delete(task.id);
      this.tracker.setAgentStatus(agent.id, "idle");
      void this.tick();
    }
  }

  private resolveAgent(agentId: string | null, projectPath: string | null): AgentRecord | null {
    if (agentId) {
      return this.tracker.getAgent(agentId);
    }

    const workflowConfig = getWorkflowConfig(projectPath);
    const existing = this.tracker.listAgents().find((agent) => agent.adapter_type === workflowConfig.defaultAdapter);
    if (existing) {
      return existing;
    }

    const name = `${workflowConfig.defaultAdapter}-default`;
    return this.tracker.registerAgent({
      name,
      adapter_type: workflowConfig.defaultAdapter,
      role: "coder",
    });
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
