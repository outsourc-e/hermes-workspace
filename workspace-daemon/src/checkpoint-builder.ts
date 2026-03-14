import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getBaseBranch, getWorktreeBranch, mergeWorktreeToMain } from "./git-ops";
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

interface DiffSnapshot {
  diffStat: string;
  changedFiles: string[];
  rawDiff: string | null;
}

async function getMergeBase(workspacePath: string, projectPath: string | null): Promise<string | null> {
  if (!projectPath) {
    return null;
  }

  const baseBranch = await getBaseBranch(projectPath);
  if (!baseBranch) {
    return null;
  }

  const mergeBase = await tryGitExec(["merge-base", "HEAD", baseBranch], workspacePath);
  return mergeBase || null;
}

function combineDiffs(primary: DiffSnapshot, secondary: DiffSnapshot): DiffSnapshot {
  const changedFiles = Array.from(new Set([...primary.changedFiles, ...secondary.changedFiles]));
  const diffStatParts = [primary.diffStat, secondary.diffStat].filter((value) => value.trim().length > 0);
  const rawDiffParts = [primary.rawDiff, secondary.rawDiff].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );

  return {
    diffStat: diffStatParts.join("\n").trim(),
    changedFiles,
    rawDiff: rawDiffParts.length > 0 ? rawDiffParts.join("\n").trim() : null,
  };
}

async function getCommittedDiff(workspacePath: string, projectPath: string | null): Promise<DiffSnapshot> {
  const mergeBase = await getMergeBase(workspacePath, projectPath);
  if (!mergeBase) {
    return { diffStat: "", changedFiles: [], rawDiff: null };
  }

  const [diffStat, diffNames, rawDiff] = await Promise.all([
    tryGitExec(["diff", "--stat", mergeBase, "HEAD"], workspacePath),
    tryGitExec(["diff", "--name-only", mergeBase, "HEAD"], workspacePath),
    tryGitExec(["diff", mergeBase, "HEAD"], workspacePath),
  ]);

  return {
    diffStat,
    changedFiles: diffNames.split("\n").filter(Boolean),
    rawDiff: rawDiff.length > 0 ? rawDiff : null,
  };
}

async function getStagedDiff(workspacePath: string): Promise<DiffSnapshot> {
  const [diffStat, diffNames, rawDiff] = await Promise.all([
    tryGitExec(["diff", "--cached", "--stat"], workspacePath),
    tryGitExec(["diff", "--cached", "--name-only"], workspacePath),
    tryGitExec(["diff", "--cached"], workspacePath),
  ]);

  return {
    diffStat,
    changedFiles: diffNames.split("\n").filter(Boolean),
    rawDiff: rawDiff.length > 0 ? rawDiff : null,
  };
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

  const diffSnapshot = combineDiffs(
    await getCommittedDiff(workspacePath, projectPath),
    await getStagedDiff(workspacePath),
  );
  const changedFiles = diffSnapshot.changedFiles;

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
    raw: diffSnapshot.diffStat,
    changed_files: changedFiles,
    files_changed: changedFiles.length,
  });

  if (autoApprove) {
    await gitExec(["commit", "-m", `chore(workspace): auto-apply task run ${taskRunId}`], workspacePath);
    const rawDiff = (await getCommittedDiff(workspacePath, projectPath)).rawDiff;
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
    const checkpoint = tracker.createCheckpoint(taskRunId, summary, diffStatJson, null, null, diffSnapshot.rawDiff);
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
