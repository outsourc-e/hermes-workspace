import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

async function runGit(projectPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: projectPath, timeout: 10_000 });
  return stdout.trim();
}

export function getWorktreeBranch(taskId: string): string {
  return `task/${sanitizeSegment(taskId)}`;
}

export async function mergeWorktreeToMain(projectPath: string, branch: string, taskName: string): Promise<string> {
  await runGit(projectPath, ["merge", branch, "--no-ff", "-m", `merge: task ${taskName}`]);
  return runGit(projectPath, ["rev-parse", "HEAD"]);
}

export async function cleanupWorktree(projectPath: string, workspacePath: string, branch: string): Promise<void> {
  try {
    await runGit(projectPath, ["worktree", "remove", workspacePath]);
  } finally {
    try {
      await runGit(projectPath, ["branch", "-d", branch]);
    } catch {
      // Ignore cleanup failures when the branch is already gone or not fully merged.
    }
  }
}

export async function createPullRequest(
  _projectPath: string,
  _branch: string,
  _title: string,
  _body: string,
): Promise<string | null> {
  return null;
}
