import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getWorkflowConfig } from "./config";
import type { Project, Task, WorkflowHooks } from "./types";

const execFileAsync = promisify(execFile);

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

async function runHooks(commands: string[] | undefined, cwd: string): Promise<void> {
  if (!commands || commands.length === 0) {
    return;
  }

  for (const command of commands) {
    await execFileAsync("zsh", ["-lc", command], { cwd });
  }
}

export class WorkspaceManager {
  async ensureWorkspace(project: Project, task: Task): Promise<{ path: string; createdNow: boolean; hooks: WorkflowHooks }> {
    const workflowConfig = getWorkflowConfig(project.path);
    const projectKey = sanitizeSegment(project.name || project.id);
    const taskKey = sanitizeSegment(task.name || task.id);
    const workspacePath = path.join(workflowConfig.workspaceRoot, projectKey, `${task.id}-${taskKey}`);
    const createdNow = !fs.existsSync(workspacePath);

    fs.mkdirSync(workspacePath, { recursive: true });

    if (project.path && fs.existsSync(project.path)) {
      const manifestPath = path.join(workspacePath, ".workspace-source");
      if (!fs.existsSync(manifestPath)) {
        fs.writeFileSync(manifestPath, `${project.path}\n`, "utf8");
      }
    }

    if (createdNow) {
      await runHooks(workflowConfig.hooks.after_create, workspacePath);
    }

    return {
      path: workspacePath,
      createdNow,
      hooks: workflowConfig.hooks,
    };
  }

  async runBeforeRunHooks(workspacePath: string, hooks: WorkflowHooks): Promise<void> {
    await runHooks(hooks.before_run, workspacePath);
  }

  async runAfterRunHooks(workspacePath: string, hooks: WorkflowHooks): Promise<void> {
    await runHooks(hooks.after_run, workspacePath);
  }
}
