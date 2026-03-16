import fs from "node:fs/promises";
import { execFile, execSync } from "node:child_process";
import { promisify } from "node:util";
import { type Response, Router } from "express";
import {
  cleanupWorktree,
  createPullRequest,
  getBaseBranch,
  getWorktreeBranch,
  hasGitRemote,
  mergeWorktreeToMain,
} from "../git-ops";
import { OpenClawAdapter } from "../adapters/openclaw";
import { Orchestrator } from "../orchestrator";
import { Tracker } from "../tracker";
import { runVerification, runFullVerification, type VerificationResult, type FullVerificationResult } from "../verification";

const execFileAsync = promisify(execFile);

type ParsedDiffStat = {
  raw: string;
  changed_files: string[];
  files_changed: number;
};

type VerificationStatus = "passed" | "failed" | "missing" | "not_configured";

type StoredCheckpointVerification = VerificationResult;

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeout = 10_000,
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(command, args, { cwd, timeout });
  return {
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const result = await runCommand("git", args, cwd);
  return result.stdout;
}

async function tryGit(cwd: string, args: string[]): Promise<string> {
  try {
    return await runGit(cwd, args);
  } catch {
    return "";
  }
}

function parseDiffStat(diffStat: string | null): ParsedDiffStat | null {
  if (!diffStat) return null;

  try {
    const parsed = JSON.parse(diffStat) as Partial<ParsedDiffStat>;
    return {
      raw: typeof parsed.raw === "string" ? parsed.raw : "",
      changed_files: Array.isArray(parsed.changed_files)
        ? parsed.changed_files.filter((value): value is string => typeof value === "string")
        : [],
      files_changed:
        typeof parsed.files_changed === "number" && Number.isFinite(parsed.files_changed)
          ? parsed.files_changed
          : 0,
    };
  } catch {
    return null;
  }
}

function parseRunEventData(value: string | null): Record<string, unknown> | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return { message: value };
  }
}

function parseStoredVerification(value: string | null): StoredCheckpointVerification | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<StoredCheckpointVerification>;
    if (
      typeof parsed.passed !== "boolean" ||
      typeof parsed.output !== "string" ||
      typeof parsed.durationMs !== "number" ||
      !Number.isFinite(parsed.durationMs)
    ) {
      return null;
    }

    return {
      passed: parsed.passed,
      output: parsed.output,
      durationMs: parsed.durationMs,
    };
  } catch {
    return null;
  }
}

function parseFullVerification(value: string | null): FullVerificationResult[] | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (item: unknown): item is FullVerificationResult =>
        typeof item === "object" &&
        item !== null &&
        "check" in item &&
        "passed" in item &&
        "output" in item &&
        "durationMs" in item,
    );
  } catch {
    return null;
  }
}

function formatUntrackedFileDiff(filePath: string, content: string): string {
  const lines = content.split("\n");
  const body = lines.map((line) => `+${line}`).join("\n");
  return [
    `diff --git a/${filePath} b/${filePath}`,
    "new file mode 100644",
    "index 0000000..0000000",
    `--- /dev/null`,
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    body,
  ].join("\n");
}

async function getWorkspaceFileDiff(workspacePath: string, filePath: string): Promise<string> {
  const trackedDiff = await tryGit(workspacePath, ["diff", "--no-ext-diff", "--", filePath]);
  if (trackedDiff) return trackedDiff;

  const status = await tryGit(workspacePath, ["status", "--short", "--", filePath]);
  if (status.startsWith("??")) {
    const absolutePath = `${workspacePath}/${filePath}`;
    const content = await fs.readFile(absolutePath, "utf8");
    return formatUntrackedFileDiff(filePath, content);
  }

  return "";
}

async function getCheckpointFileDiff(input: {
  filePath: string;
  workspacePath: string | null;
  projectPath: string | null;
  commitHash: string | null;
}): Promise<string> {
  const { filePath, workspacePath, projectPath, commitHash } = input;

  if (workspacePath) {
    const diff = await getWorkspaceFileDiff(workspacePath, filePath);
    if (diff) return diff;
  }

  if (commitHash && projectPath) {
    return tryGit(projectPath, ["show", "--format=", commitHash, "--", filePath]);
  }

  return "";
}

async function getCheckpointRawDiff(checkpointId: string, tracker: Tracker): Promise<string> {
  const checkpoint = tracker.getCheckpointDetail(checkpointId);
  if (!checkpoint) {
    throw new Error("Checkpoint not found");
  }

  if (checkpoint.raw_diff) {
    return checkpoint.raw_diff;
  }

  if (!checkpoint.project_path) {
    throw new Error("Project path is unavailable");
  }

  if (!checkpoint.commit_hash) {
    throw new Error("Checkpoint commit hash is unavailable");
  }

  return runGit(checkpoint.project_path, ["show", checkpoint.commit_hash]);
}

async function stageAndCommitWorkspace(workspacePath: string, checkpointId: string): Promise<string> {
  await runGit(workspacePath, ["add", "-A"]);

  let hasStagedChanges = true;
  try {
    await runGit(workspacePath, ["diff", "--cached", "--quiet"]);
    hasStagedChanges = false;
  } catch {
    hasStagedChanges = true;
  }

  if (hasStagedChanges) {
    await runGit(workspacePath, ["commit", "-m", `chore(workspace): approve checkpoint ${checkpointId}`]);
  }

  return runGit(workspacePath, ["rev-parse", "HEAD"]);
}

async function pathExists(targetPath: string | null | undefined): Promise<boolean> {
  if (!targetPath) {
    return false;
  }

  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function applyStoredDiffToProject(
  projectPath: string,
  checkpointId: string,
  rawDiff: string,
): Promise<string | null> {
  const patch = rawDiff.trim();
  if (!patch) {
    return null;
  }

  try {
    execSync("git apply --check --3way", {
      cwd: projectPath,
      input: patch,
      stdio: ["pipe", "ignore", "pipe"],
      timeout: 10_000,
    });
    execSync("git apply --3way", {
      cwd: projectPath,
      input: patch,
      stdio: ["pipe", "ignore", "pipe"],
      timeout: 10_000,
    });

    try {
      await runGit(projectPath, ["diff", "--cached", "--quiet"]);
      return null;
    } catch {
      await runGit(projectPath, ["commit", "-m", `chore: checkpoint ${checkpointId} approved`]);
      return runGit(projectPath, ["rev-parse", "HEAD"]);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to apply stored checkpoint diff";
    throw new Error(message);
  }
}

async function buildCheckpointDetail(tracker: Tracker, checkpointId: string) {
  const checkpoint = tracker.getCheckpointDetail(checkpointId);
  if (!checkpoint) return null;

  const parsedDiffStat = parseDiffStat(checkpoint.diff_stat);
  const changedFiles = parsedDiffStat?.changed_files ?? [];
  const fileDiffs = await Promise.all(
    changedFiles.map(async (filePath) => ({
      path: filePath,
      diff: await getCheckpointFileDiff({
        filePath,
        workspacePath: checkpoint.task_run_workspace_path,
        projectPath: checkpoint.project_path,
        commitHash: checkpoint.commit_hash,
      }),
    })),
  );

  const runEvents = tracker.listRunEvents(checkpoint.task_run_id).map((event) => ({
    id: event.id,
    type: event.type,
    created_at: event.created_at,
    data: parseRunEventData(event.data),
  }));

  const storedVerification = parseStoredVerification(checkpoint.verification);
  const storedFullVerification = parseFullVerification(checkpoint.verification);

  const verificationMap: Record<string, { status: VerificationStatus; label: string; output?: string | null; checked_at?: string | null }> = {
    tsc: { status: "missing", label: "Not run yet" },
    test: { status: "not_configured", label: "Not configured" },
    lint: { status: "not_configured", label: "Not configured" },
    e2e: { status: "not_configured", label: "Not configured" },
  };

  if (storedFullVerification) {
    for (const result of storedFullVerification) {
      verificationMap[result.check] = {
        status: result.passed ? "passed" : "failed",
        label: result.passed ? "Passed" : "Failed",
        output: result.output,
        checked_at: checkpoint.created_at,
      };
    }
  } else if (storedVerification) {
    verificationMap.tsc = {
      status: storedVerification.passed ? "passed" : "failed",
      label: storedVerification.passed ? "Passed" : "Failed",
      output: storedVerification.output,
      checked_at: checkpoint.created_at,
    };
  }

  return {
    checkpoint,
    parsed_diff_stat: parsedDiffStat,
    file_diffs: fileDiffs,
    verification: verificationMap,
    run_events: runEvents,
  };
}

export function createCheckpointsRouter(tracker: Tracker, orchestrator: Orchestrator): Router {
  const router = Router();

  function sendApprovedResponse(
    res: Response,
    checkpoint: ReturnType<Tracker["approveCheckpoint"]>,
    options: {
      commitHash?: string | null;
      targetBranch?: string | null;
      prUrl?: string | null;
    } = {},
  ) {
    if (!checkpoint) {
      res.status(500).json({ error: "Failed to update checkpoint" });
      return;
    }

    res.json({
      ok: true,
      status: "approved",
      checkpoint,
      commit_hash: options.commitHash ?? checkpoint.commit_hash ?? null,
      target_branch: options.targetBranch ?? null,
      pr_url: options.prUrl ?? null,
    });
  }

  router.get("/", (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const projectId = typeof req.query.project_id === "string" ? req.query.project_id : undefined;
    const taskRunId = typeof req.query.task_run_id === "string" ? req.query.task_run_id : undefined;
    res.json(tracker.listCheckpoints(status, projectId, taskRunId));
  });

  router.get("/:id", async (req, res) => {
    const detail = await buildCheckpointDetail(tracker, req.params.id);
    if (!detail) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }

    res.json(detail);
  });

  router.get("/:id/diff", async (req, res) => {
    try {
      const diff = await getCheckpointRawDiff(req.params.id, tracker);
      res.json({ diff });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load checkpoint diff";
      const status = message === "Checkpoint not found" ? 404 : 400;
      res.status(status).json({ error: message });
    }
  });

  router.post("/:id/verify-tsc", async (req, res) => {
    const checkpoint = tracker.getCheckpointDetail(req.params.id);
    if (!checkpoint) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }

    const cwd = checkpoint.task_run_workspace_path ?? checkpoint.project_path;
    if (!cwd) {
      res.status(400).json({ error: "Checkpoint workspace is unavailable" });
      return;
    }

    const result = await runVerification(cwd);
    res.json({
      check: "tsc",
      status: result.passed ? "passed" : "failed",
      label: result.passed ? "Passed" : "Failed",
      output: result.output,
      checked_at: new Date().toISOString(),
    });
  });

  router.post("/:id/verify", async (req, res) => {
    const checkpoint = tracker.getCheckpointDetail(req.params.id);
    if (!checkpoint) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }

    const cwd = checkpoint.task_run_workspace_path ?? checkpoint.project_path;
    if (!cwd) {
      res.status(400).json({ error: "Checkpoint workspace is unavailable" });
      return;
    }

    const results = await runFullVerification(cwd);
    tracker.updateCheckpointVerification(checkpoint.id, JSON.stringify(results));
    res.json({
      results: results.map((r) => ({
        check: r.check,
        status: r.passed ? "passed" : "failed",
        label: r.passed ? "Passed" : "Failed",
        output: r.output,
        duration_ms: r.durationMs,
      })),
      checked_at: new Date().toISOString(),
    });
  });

  router.post("/:id/approve", async (req, res) => {
    const checkpoint = tracker.getCheckpoint(req.params.id);
    if (!checkpoint) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }

    const taskRun = tracker.getTaskRunApprovalContext(checkpoint.task_run_id);
    let commitHash: string | null | undefined;

    if (taskRun?.project_path) {
      const workspaceExists = await pathExists(taskRun.workspace_path);
      if (!workspaceExists && checkpoint.raw_diff) {
        try {
          commitHash = await applyStoredDiffToProject(
            taskRun.project_path,
            checkpoint.id,
            checkpoint.raw_diff,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown error";
          console.warn(
            `[checkpoints] Failed to apply stored diff for checkpoint ${checkpoint.id}: ${message}`,
          );
          res.status(500).json({ error: message });
          return;
        }
      }
    }

    const updatedCheckpoint = tracker.approveCheckpoint(
      checkpoint.id,
      req.body?.reviewer_notes,
      commitHash,
    );
    sendApprovedResponse(res, updatedCheckpoint, {
      commitHash,
      targetBranch: taskRun?.project_path ? await getBaseBranch(taskRun.project_path) : null,
    });
  });

  router.post("/:id/approve-and-commit", async (req, res) => {
    const checkpoint = tracker.getCheckpoint(req.params.id);
    if (!checkpoint) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }

    const taskRun = tracker.getTaskRunApprovalContext(checkpoint.task_run_id);
    if (!taskRun) {
      res.status(404).json({ error: "Task run not found for checkpoint" });
      return;
    }

    if (!taskRun.workspace_path) {
      res.status(400).json({ error: "Checkpoint workspace is unavailable" });
      return;
    }

    try {
      const commitHash = await stageAndCommitWorkspace(taskRun.workspace_path, checkpoint.id);
      const updatedCheckpoint = tracker.approveCheckpoint(
        checkpoint.id,
        req.body?.reviewer_notes,
        commitHash,
      );
      sendApprovedResponse(res, updatedCheckpoint, {
        commitHash,
        targetBranch: getWorktreeBranch(taskRun.id),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to approve and commit checkpoint";
      res.status(500).json({ error: message });
    }
  });

  router.post("/:id/approve-and-pr", async (req, res) => {
    const checkpoint = tracker.getCheckpoint(req.params.id);
    if (!checkpoint) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }

    const taskRun = tracker.getTaskRunApprovalContext(checkpoint.task_run_id);
    if (!taskRun) {
      res.status(404).json({ error: "Task run not found for checkpoint" });
      return;
    }

    if (!taskRun.workspace_path) {
      res.status(400).json({ error: "Checkpoint workspace is unavailable" });
      return;
    }

    if (!taskRun.project_path) {
      res.status(400).json({ error: "Project path is unavailable" });
      return;
    }

    const branch = getWorktreeBranch(taskRun.id);

    try {
      if (!(await hasGitRemote(taskRun.project_path))) {
        res.status(400).json({ error: "No git remote configured for this project" });
        return;
      }

      const commitHash = await stageAndCommitWorkspace(taskRun.workspace_path, checkpoint.id);
      await runGit(taskRun.project_path, ["push", "-u", "origin", branch]);

      const prUrl = await createPullRequest(
        taskRun.project_path,
        branch,
        taskRun.task_name,
        `Automated PR for approved checkpoint ${checkpoint.id}`,
      );

      const updatedCheckpoint = tracker.approveCheckpoint(
        checkpoint.id,
        req.body?.reviewer_notes,
        commitHash,
      );
      sendApprovedResponse(res, updatedCheckpoint, {
        commitHash,
        targetBranch: "main",
        prUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to approve and open PR";
      res.status(500).json({ error: message });
    }
  });

  router.post("/:id/approve-and-merge", async (req, res) => {
    const checkpoint = tracker.getCheckpoint(req.params.id);
    if (!checkpoint) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }

    const taskRun = tracker.getTaskRunApprovalContext(checkpoint.task_run_id);
    if (!taskRun) {
      res.status(404).json({ error: "Task run not found for checkpoint" });
      return;
    }

    if (!taskRun.project_path) {
      res.status(400).json({ error: "Project path is unavailable" });
      return;
    }

    const branch = getWorktreeBranch(taskRun.id);

    try {
      let commitHash: string | null = null;
      const targetBranch = await getBaseBranch(taskRun.project_path);
      const workspaceExists = await pathExists(taskRun.workspace_path);

      if (taskRun.workspace_path && workspaceExists) {
        await stageAndCommitWorkspace(taskRun.workspace_path, checkpoint.id);
        commitHash = await mergeWorktreeToMain(taskRun.project_path, branch, taskRun.task_name);
        await cleanupWorktree(taskRun.project_path, taskRun.workspace_path, branch);
      } else if (checkpoint.raw_diff) {
        commitHash = await applyStoredDiffToProject(
          taskRun.project_path,
          checkpoint.id,
          checkpoint.raw_diff,
        );
      } else {
        res.status(400).json({ error: "Cannot merge: worktree gone and no stored diff" });
        return;
      }

      const updatedCheckpoint = tracker.approveCheckpoint(
        checkpoint.id,
        req.body?.reviewer_notes,
        commitHash,
      );
      tracker.emitCheckpointMerged(checkpoint.id);
      sendApprovedResponse(res, updatedCheckpoint, {
        commitHash,
        targetBranch,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to approve and merge checkpoint";
      res.status(500).json({ error: message });
    }
  });

  router.post("/:id/reject", async (req, res) => {
    const reviewerNotes =
      typeof req.body?.reviewer_notes === "string" ? req.body.reviewer_notes : undefined;
    const checkpoint = tracker.updateCheckpointStatus(req.params.id, "rejected", reviewerNotes);
    if (!checkpoint) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }

    const taskRun = tracker.getTaskRunApprovalContext(checkpoint.task_run_id);
    if (!taskRun) {
      res.status(404).json({ error: "Task run not found for checkpoint" });
      return;
    }

    const sessionId = tracker.getTaskRunSessionId(checkpoint.task_run_id);
    let resumed = false;
    if (sessionId) {
      const reason = reviewerNotes?.trim() || "No reason provided";

      try {
        await new OpenClawAdapter().steerSession(
          sessionId,
          `Checkpoint rejected. Reason: ${reason}. Please revise.`,
        );
        resumed = true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to steer Hermes gateway session";
        res.status(500).json({ error: message });
        return;
      }
    }

    if (sessionId && resumed) {
      tracker.updateTaskRun(checkpoint.task_run_id, {
        status: "running",
        completed_at: null,
        error: null,
      });
      tracker.setTaskStatus(taskRun.task_id, "running");
    } else {
      tracker.updateTaskRun(checkpoint.task_run_id, {
        status: "failed",
        completed_at: new Date().toISOString(),
        error: "Rejected by reviewer",
      });
      tracker.setTaskStatus(taskRun.task_id, "failed");
    }
    res.json(checkpoint);
  });

  router.post("/:id/revise", async (req, res) => {
    const reviewerNotes =
      typeof req.body?.reviewer_notes === "string" ? req.body.reviewer_notes.trim() : "";
    const checkpoint = tracker.updateCheckpointStatus(req.params.id, "revised", req.body?.reviewer_notes);
    if (!checkpoint) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }

    const taskRun = tracker.getTaskRunApprovalContext(checkpoint.task_run_id);
    if (!taskRun) {
      res.status(404).json({ error: "Task run not found for checkpoint" });
      return;
    }

    const task = tracker.getTask(taskRun.task_id);
    if (!task) {
      res.status(404).json({ error: "Task not found for checkpoint" });
      return;
    }

    const revisionSuffix = reviewerNotes
      ? `\n\nReviewer revision notes:\n${reviewerNotes}`
      : "\n\nReviewer revision notes:\nPlease revise the previous checkpoint.";
    const updatedTask = tracker.updateTask(task.id, {
      description: `${task.description ?? ""}${revisionSuffix}`.trim(),
    });
    if (!updatedTask) {
      res.status(500).json({ error: "Failed to update task for revision" });
      return;
    }

    const nextRun = tracker.createPendingTaskRun(
      task.id,
      task.agent_id,
      null,
      taskRun.attempt + 1,
    );
    tracker.setTaskStatus(task.id, "pending");
    const triggered = await orchestrator.triggerTask(task.id);
    if (!triggered) {
      tracker.updateTaskRun(nextRun.id, {
        status: "failed",
        completed_at: new Date().toISOString(),
        error: "Failed to dispatch revision task run",
      });
      res.status(500).json({ error: "Failed to dispatch revision task run" });
      return;
    }

    res.json(checkpoint);
  });

  return router;
}
