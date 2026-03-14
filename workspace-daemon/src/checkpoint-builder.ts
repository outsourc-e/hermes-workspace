import fs from "node:fs";
import path from "node:path";
import { execFile, execSync } from "node:child_process";
import { promisify } from "node:util";
import { getWorktreeBranch, mergeWorktreeToMain } from "./git-ops";
import { QARunner } from "./qa-runner";
import type { Tracker } from "./tracker";
import type { Checkpoint } from "./types";
import { runVerification } from "./verification";

const execFileAsync = promisify(execFile);

function isGitDir(workspacePath: string): boolean {
  return fs.existsSync(path.join(workspacePath, ".git")) || fs.existsSync(path.join(workspacePath, ".git", "HEAD"));
}

async function gitExec(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, timeout: 10_000 });
  return stdout.trim();
}

async function tryGitExec(args: string[], cwd: string): Promise<string> {
  try {
    return await gitExec(args, cwd);
  } catch {
    return "";
  }
}

function notifyCheckpointReady(taskName: string, projectName: string, taskRunId: string): void {
  try {
    const child = execFile(
      "openclaw",
      [
        "system",
        "event",
        "--text",
        `Checkpoint ready for review: ${taskName} (${projectName}). Run ID: ${taskRunId}. Open ClawSuite → Review Queue.`,
        "--mode",
        "now",
      ],
      () => {
        // Best-effort notification only.
      },
    );
    child.unref();
  } catch {
    // Notification failures must not break checkpoint creation.
  }
}

async function attachVerification(
  tracker: Tracker,
  checkpoint: Checkpoint,
  workspacePath: string | null,
): Promise<Checkpoint> {
  if (!workspacePath) {
    return checkpoint;
  }

  tracker.updateCheckpointVerification(
    checkpoint.id,
    JSON.stringify(await runVerification(workspacePath)),
  );
  return tracker.getCheckpoint(checkpoint.id) ?? checkpoint;
}

async function finalizeCheckpoint(
  tracker: Tracker,
  checkpoint: Checkpoint,
  workspacePath: string | null,
  taskName: string,
  projectName: string,
  taskRunId: string,
): Promise<Checkpoint> {
  let latestCheckpoint = tracker.getCheckpoint(checkpoint.id) ?? checkpoint;

  if (workspacePath) {
    const qaResult = await new QARunner().runQA(
      latestCheckpoint.raw_diff ?? "",
      workspacePath,
      latestCheckpoint.id,
    );
    latestCheckpoint =
      tracker.setCheckpointQaResult(latestCheckpoint.id, qaResult) ?? latestCheckpoint;

    if (qaResult.confidence >= 0.9 && qaResult.verdict === "APPROVED") {
      latestCheckpoint =
        tracker.approveCheckpoint(
          latestCheckpoint.id,
          qaResult.issues.length > 0 ? qaResult.issues.join("\n") : undefined,
        ) ?? latestCheckpoint;
      return latestCheckpoint;
    }
  }

  notifyCheckpointReady(taskName, projectName, taskRunId);
  return tracker.getCheckpoint(latestCheckpoint.id) ?? latestCheckpoint;
}

function getRawDiff(workspacePath: string, source: "staged" | "head"): string | null {
  try {
    const command = source === "head" ? "git show --format=" : "git diff --cached";
    const rawDiff = execSync(command, {
      cwd: workspacePath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return rawDiff.length > 0 ? rawDiff : null;
  } catch {
    return null;
  }
}

export async function buildCheckpoint(
  workspacePath: string,
  projectPath: string | null,
  projectName: string,
  taskName: string,
  taskRunId: string,
  tracker: Tracker,
  autoApprove: boolean,
): Promise<Checkpoint> {
  if (!isGitDir(workspacePath)) {
    const checkpoint = tracker.createCheckpoint(taskRunId, "No git info available", null, null, null, null);
    const verifiedCheckpoint = await attachVerification(tracker, checkpoint, workspacePath);
    return finalizeCheckpoint(
      tracker,
      verifiedCheckpoint,
      workspacePath,
      taskName,
      projectName,
      taskRunId,
    );
  }

  // Stage all changes first so we capture untracked files in diff
  await gitExec(["add", "-A"], workspacePath);

  const [diffStat, diffNames] = await Promise.all([
    tryGitExec(["diff", "--cached", "--stat"], workspacePath),
    tryGitExec(["diff", "--cached", "--name-only"], workspacePath),
  ]);

  const changedFiles = diffNames.split("\n").filter(Boolean);

  if (changedFiles.length === 0) {
    const checkpoint = tracker.createCheckpoint(taskRunId, "No changes detected", null, null, null, null);
    const verifiedCheckpoint = await attachVerification(tracker, checkpoint, workspacePath);
    return finalizeCheckpoint(
      tracker,
      verifiedCheckpoint,
      workspacePath,
      taskName,
      projectName,
      taskRunId,
    );
  }

  const summary = changedFiles.length <= 5
    ? `Changed: ${changedFiles.join(", ")}`
    : `${changedFiles.length} files changed`;
  const diffStatJson = JSON.stringify({
    raw: diffStat,
    changed_files: changedFiles,
    files_changed: changedFiles.length,
  });

  if (autoApprove) {
    await gitExec(["commit", "-m", `chore(workspace): auto-apply task run ${taskRunId}`], workspacePath);
    const rawDiff = getRawDiff(workspacePath, "head");
    const commitHash = projectPath
      ? await mergeWorktreeToMain(projectPath, getWorktreeBranch(taskRunId), taskName)
      : null;
    const checkpoint = tracker.createCheckpoint(taskRunId, summary, diffStatJson, commitHash, null, rawDiff);
    const verifiedCheckpoint = await attachVerification(tracker, checkpoint, workspacePath);
    return finalizeCheckpoint(
      tracker,
      verifiedCheckpoint,
      workspacePath,
      taskName,
      projectName,
      taskRunId,
    );
  } else {
    const rawDiff = getRawDiff(workspacePath, "staged");
    const checkpoint = tracker.createCheckpoint(taskRunId, summary, diffStatJson, null, null, rawDiff);
    const verifiedCheckpoint = await attachVerification(tracker, checkpoint, workspacePath);
    // Unstage so reviewer can inspect before approval
    await gitExec(["reset", "HEAD"], workspacePath);
    return finalizeCheckpoint(
      tracker,
      verifiedCheckpoint,
      workspacePath,
      taskName,
      projectName,
      taskRunId,
    );
  }
}
