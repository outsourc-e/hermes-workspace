import { CodexAdapter } from "./adapters/codex";
import { ClaudeAdapter } from "./adapters/claude";
import { OpenClawAdapter } from "./adapters/openclaw";
import type { AgentAdapter } from "./adapters/types";
import { getWorkflowConfig, loadWorkflowDefinition, renderTaskPrompt } from "./config";
import { WorkspaceManager } from "./workspace";
import { Tracker } from "./tracker";
import type { AgentExecutionResult, AgentRecord, Project, Task, TaskRun } from "./types";

export class AgentRunner {
  private readonly adapters: Map<string, AgentAdapter>;
  private readonly workspaceManager: WorkspaceManager;
  private readonly tracker: Tracker;

  constructor(tracker: Tracker, workspaceManager = new WorkspaceManager()) {
    this.tracker = tracker;
    this.workspaceManager = workspaceManager;
    this.adapters = new Map<string, AgentAdapter>([
      ["codex", new CodexAdapter()],
      ["claude", new ClaudeAdapter()],
      ["openclaw", new OpenClawAdapter()],
    ]);
  }

  getAdapter(type: string): AgentAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(`Unsupported adapter type: ${type}`);
    }
    return adapter;
  }

  async runTask(input: {
    project: Project;
    task: Task;
    taskRun: TaskRun;
    agent: AgentRecord;
    attempt: number;
    signal?: AbortSignal;
  }): Promise<{ result: AgentExecutionResult; workspacePath: string }> {
    const workflow = loadWorkflowDefinition(input.project.path);
    const workflowConfig = getWorkflowConfig(input.project.path);
    const workspace = await this.workspaceManager.ensureWorkspace(input.project, input.task);

    await this.workspaceManager.runBeforeRunHooks(workspace.path, workspace.hooks);

    const prompt = renderTaskPrompt(workflow.promptTemplate, {
      projectName: input.project.name,
      taskName: input.task.name,
      taskDescription: input.task.description,
      workspacePath: workspace.path,
    });
    const adapter = this.getAdapter(input.agent.adapter_type || workflowConfig.defaultAdapter);

    this.tracker.appendRunEvent(input.taskRun.id, "started", {
      taskId: input.task.id,
      agentId: input.agent.id,
      workspacePath: workspace.path,
      attempt: input.attempt,
    });

    const result = await adapter.execute(
      {
        task: input.task,
        taskRun: input.taskRun,
        agent: input.agent,
        workspacePath: workspace.path,
        prompt,
      },
      {
        signal: input.signal,
        onEvent: (event) => {
          this.tracker.appendRunEvent(input.taskRun.id, event.type === "agent_message" ? "output" : (event.type as any), {
            message: event.message ?? null,
            ...event.data,
          });
        },
      },
    );

    await this.workspaceManager.runAfterRunHooks(workspace.path, workspace.hooks);

    return {
      result,
      workspacePath: workspace.path,
    };
  }
}
