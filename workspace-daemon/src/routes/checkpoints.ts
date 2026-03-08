import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Router } from "express";
import { cleanupWorktree, getWorktreeBranch, mergeWorktreeToMain } from "../git-ops";
import { Tracker } from "../tracker";

const execFileAsync = promisify(execFile);

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, timeout: 10_000 });
  return stdout.trim();
}

export function createCheckpointsRouter(tracker: Tracker): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json(tracker.listCheckpoints(status));
  });

  router.post("/:id/approve", (req, res) => {
    const checkpoint = tracker.updateCheckpointStatus(req.params.id, "approved", req.body?.reviewer_notes);
    if (!checkpoint) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }
    res.json(checkpoint);
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

    if (!taskRun.workspace_path) {
      res.status(400).json({ error: "Checkpoint workspace is unavailable" });
      return;
    }

    if (!taskRun.project_path) {
      res.status(400).json({ error: "Project path is unavailable" });
      return;
    }

    const branch = getWorktreeBranch(taskRun.task_id);

    try {
      await runGit(taskRun.workspace_path, ["add", "-A"]);

      let hasStagedChanges = true;
      try {
        await runGit(taskRun.workspace_path, ["diff", "--cached", "--quiet"]);
        hasStagedChanges = false;
      } catch {
        hasStagedChanges = true;
      }

      if (hasStagedChanges) {
        await runGit(taskRun.workspace_path, ["commit", "-m", `chore(workspace): approve checkpoint ${checkpoint.id}`]);
      }

      const commitHash = await mergeWorktreeToMain(taskRun.project_path, branch, taskRun.task_name);
      const updatedCheckpoint = tracker.approveCheckpoint(
        checkpoint.id,
        req.body?.reviewer_notes,
        commitHash,
      );

      await cleanupWorktree(taskRun.project_path, taskRun.workspace_path, branch);

      if (!updatedCheckpoint) {
        res.status(500).json({ error: "Failed to update checkpoint" });
        return;
      }

      res.json(updatedCheckpoint);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to approve and merge checkpoint";
      res.status(500).json({ error: message });
    }
  });

  router.post("/:id/reject", (req, res) => {
    const checkpoint = tracker.updateCheckpointStatus(req.params.id, "rejected", req.body?.reviewer_notes);
    if (!checkpoint) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }
    res.json(checkpoint);
  });

  router.post("/:id/revise", (req, res) => {
    const checkpoint = tracker.updateCheckpointStatus(req.params.id, "revised", req.body?.reviewer_notes);
    if (!checkpoint) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }
    res.json(checkpoint);
  });

  return router;
}
