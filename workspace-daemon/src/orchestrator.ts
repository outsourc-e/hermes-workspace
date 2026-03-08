import { EventEmitter } from "node:events";
import { AgentRunner } from "./agent-runner";
import { Tracker } from "./tracker";
import { getWorkflowConfig } from "./config";
import type { AgentRecord, OrchestratorState, RetryEntry, RunningEntry, TaskRunStatus, TaskWithRelations } from "./types";

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
  private timer: NodeJS.Timeout | null = null;
  readonly state: OrchestratorState;

  constructor(tracker: Tracker, agentRunner = new AgentRunner(tracker)) {
    super();
    this.tracker = tracker;
    this.agentRunner = agentRunner;
    const workflowConfig = getWorkflowConfig();
    this.state = {
      pollIntervalMs: workflowConfig.pollIntervalMs,
      maxConcurrentAgents: workflowConfig.maxConcurrentAgents,
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

  async tick(): Promise<void> {
    const availableSlots = Math.max(this.state.maxConcurrentAgents - this.state.running.size, 0);
    if (availableSlots <= 0) {
      return;
    }

    const readyTasks = this.tracker.resolveReadyTasks(availableSlots * 2);
    for (const task of readyTasks) {
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
      this.tracker.updateTaskRun(run.id, {
        status: "failed",
        completed_at: nowIso(),
        error: "Recovered after daemon restart",
      });
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
    const runningEntry: RunningEntry = {
      taskId: task.id,
      runId: taskRun.id,
      attempt,
      workspacePath: "",
      agentId: agent.id,
      startedAt: nowIso(),
      session: null,
    };
    this.state.running.set(task.id, runningEntry);
    this.emit("dispatch", { taskId: task.id, runId: taskRun.id });

    try {
      const { result, workspacePath } = await this.agentRunner.runTask({
        project,
        task,
        taskRun,
        agent,
        attempt,
      });

      runningEntry.workspacePath = workspacePath;

      const taskRunStatus: TaskRunStatus = result.status === "completed" ? "awaiting_review" : "failed";
      this.tracker.updateTaskRun(taskRun.id, {
        status: taskRunStatus,
        completed_at: nowIso(),
        error: result.error ?? null,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        cost_cents: result.costCents,
      });

      if (result.status === "completed") {
        const checkpoint = this.tracker.createCheckpoint(
          taskRun.id,
          result.checkpointSummary ?? result.summary,
          result.diffStat ? { ...result.diffStat } : null,
        );
        const autoApprove = getWorkflowConfig(project.path).autoApprove;
        if (autoApprove) {
          this.tracker.updateCheckpointStatus(checkpoint.id, "approved");
          this.tracker.setTaskStatus(task.id, "completed");
          this.tracker.updateTaskRun(taskRun.id, {
            status: "completed",
            completed_at: nowIso(),
          });
          this.state.completed.add(task.id);
        }
      } else {
        this.tracker.setTaskStatus(task.id, "failed");
        this.queueRetry(task.id, attempt, result.error ?? result.summary);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.tracker.updateTaskRun(taskRun.id, {
        status: "failed",
        completed_at: nowIso(),
        error: message,
      });
      this.tracker.setTaskStatus(task.id, "failed");
      this.queueRetry(task.id, attempt, message);
    } finally {
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
