import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Tracker } from "./tracker";
import type { Checkpoint } from "./types";

const execFileAsync = promisify(execFile);

function isGitDir(workspacePath: string): boolean {
  return fs.existsSync(path.join(workspacePath, ".git")) || fs.existsSync(path.join(workspacePath, ".git", "HEAD"));
}

async function gitExec(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, timeout: 10_000 });
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function buildCheckpoint(
  workspacePath: string,
  taskRunId: string,
  tracker: Tracker,
  autoApprove: boolean,
): Promise<Checkpoint> {
  if (!isGitDir(workspacePath)) {
    const checkpoint = tracker.createCheckpoint(taskRunId, "No git info available", null);
    if (autoApprove) {
      tracker.approveCheckpoint(checkpoint.id);
    }
    return checkpoint;
  }

  // Stage all changes first so we capture untracked files in diff
  await gitExec(["add", "-A"], workspacePath);

  const [diffStat, diffNames] = await Promise.all([
    gitExec(["diff", "--cached", "--stat"], workspacePath),
    gitExec(["diff", "--cached", "--name-only"], workspacePath),
  ]);

  const changedFiles = diffNames.split("\n").filter(Boolean);

  if (changedFiles.length === 0) {
    const checkpoint = tracker.createCheckpoint(taskRunId, "No changes detected", null);
    if (autoApprove) {
      tracker.approveCheckpoint(checkpoint.id);
    }
    return checkpoint;
  }

  const summary = changedFiles.length <= 5
    ? `Changed: ${changedFiles.join(", ")}`
    : `${changedFiles.length} files changed`;
  const diffStatJson = JSON.stringify({
    raw: diffStat,
    changed_files: changedFiles,
    files_changed: changedFiles.length,
  });

  const checkpoint = tracker.createCheckpoint(taskRunId, summary, diffStatJson);

  if (autoApprove) {
    await gitExec(["commit", "-m", `chore(workspace): auto-apply task run ${taskRunId}`], workspacePath);
    tracker.approveCheckpoint(checkpoint.id);
  } else {
    // Unstage so reviewer can inspect before approval
    await gitExec(["reset", "HEAD"], workspacePath);
  }

  return checkpoint;
}
