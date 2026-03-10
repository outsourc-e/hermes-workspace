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
  return `task-${sanitizeSegment(taskId)}`;
}

export async function getBaseBranch(projectPath: string): Promise<string> {
  try {
    const branch = await runGit(projectPath, ["branch", "--show-current"]);
    if (branch) {
      return branch;
    }
  } catch {
    // Fall through to the default branch fallback.
  }

  return "main";
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

export async function hasGitRemote(projectPath: string): Promise<boolean> {
  try {
    const remotes = await runGit(projectPath, ["remote"]);
    return remotes.length > 0;
  } catch {
    return false;
  }
}

export async function createPullRequest(
  projectPath: string,
  branch: string,
  title: string,
  body: string,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "gh",
      ["pr", "create", "--title", title, "--body", body, "--base", "main", "--head", branch],
      { cwd: projectPath, timeout: 30_000 },
    );
    const url = stdout
      .split("\n")
      .map((line) => line.trim())
      .find((line) => /^https?:\/\//.test(line));
    return url ?? null;
  } catch {
    return null;
  }
}
