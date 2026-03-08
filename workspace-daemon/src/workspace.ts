import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getWorkflowConfig } from "./config";
import { cleanupWorktree, getWorktreeBranch } from "./git-ops";
import type { Project, Task, WorkflowHooks, WorkspaceInfo } from "./types";

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

function hasGitDirectory(projectPath: string | null): boolean {
  if (!projectPath || !fs.existsSync(projectPath)) {
    return false;
  }

  return fs.existsSync(path.join(projectPath, ".git"));
}

export class WorkspaceManager {
  private async createGitWorktree(projectPath: string, workspacePath: string, taskId: string): Promise<void> {
    await execFileAsync("git", ["worktree", "add", workspacePath, "-b", getWorktreeBranch(taskId)], {
      cwd: projectPath,
    });
  }

  async prepare(project: Project, task: Task): Promise<WorkspaceInfo> {
    const workflowConfig = getWorkflowConfig(project.path);
    const projectKey = sanitizeSegment(project.name || project.id);
    const taskKey = sanitizeSegment(task.name || task.id);
    const workspacePath = path.join(workflowConfig.workspaceRoot, projectKey, `${task.id}-${taskKey}`);
    const createdNow = !fs.existsSync(workspacePath);
    let gitWorktree = false;

    fs.mkdirSync(path.dirname(workspacePath), { recursive: true });

    if (createdNow && project.path && hasGitDirectory(project.path)) {
      try {
        await this.createGitWorktree(project.path, workspacePath, task.id);
        gitWorktree = true;
      } catch {
        fs.mkdirSync(workspacePath, { recursive: true });
      }
    } else {
      fs.mkdirSync(workspacePath, { recursive: true });
    }

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
      git_worktree: gitWorktree,
    };
  }

  async ensureWorkspace(project: Project, task: Task): Promise<WorkspaceInfo> {
    return this.prepare(project, task);
  }

  async cleanup(project: Project, task: Task): Promise<void> {
    if (!project.path || !fs.existsSync(project.path)) {
      return;
    }

    const workflowConfig = getWorkflowConfig(project.path);
    const projectKey = sanitizeSegment(project.name || project.id);
    const taskKey = sanitizeSegment(task.name || task.id);
    const workspacePath = path.join(workflowConfig.workspaceRoot, projectKey, `${task.id}-${taskKey}`);

    await cleanupWorktree(project.path, workspacePath, getWorktreeBranch(task.id));
  }

  async runBeforeRunHooks(workspacePath: string, hooks: WorkflowHooks): Promise<void> {
    await runHooks(hooks.before_run, workspacePath);
  }

  async runAfterRunHooks(workspacePath: string, hooks: WorkflowHooks): Promise<void> {
    await runHooks(hooks.after_run, workspacePath);
  }
}
