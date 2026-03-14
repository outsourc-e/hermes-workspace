import { Router } from "express";
import { Orchestrator } from "../orchestrator";
import { Tracker } from "../tracker";

const ADHOC_PROJECT_NAME = "__adhoc__";
const ADHOC_PROJECT_PATH = "/tmp/adhoc-workspace";
const ADHOC_PHASE_NAME = "Ad-hoc";

async function waitForTaskRun(tracker: Tracker, taskId: string, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const [taskRun] = tracker.listTaskRuns({ taskId });
    if (taskRun) {
      return taskRun;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return null;
}

export function createAdhocTaskRunsRouter(
  tracker: Tracker,
  orchestrator: Orchestrator,
): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const { agent_id, task_name, description, project_id } = req.body as {
      agent_id?: string;
      task_name?: string;
      description?: string;
      project_id?: string;
    };

    const agentId = agent_id?.trim();
    const taskName = task_name?.trim();
    const taskDescription =
      typeof description === "string" && description.trim().length > 0
        ? description.trim()
        : null;
    const projectId = project_id?.trim();

    if (!agentId) {
      res.status(400).json({ error: "agent_id is required" });
      return;
    }

    if (!taskName) {
      res.status(400).json({ error: "task_name is required" });
      return;
    }

    const agent = tracker.getAgent(agentId);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    let project = projectId ? tracker.getProject(projectId) : null;
    if (projectId && !project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    if (!project) {
      project =
        tracker.listProjects().find((entry) => entry.name === ADHOC_PROJECT_NAME) ??
        tracker.createProject({
          name: ADHOC_PROJECT_NAME,
          path: ADHOC_PROJECT_PATH,
        });
    }

    const projectDetail = tracker.getProjectDetail(project.id);
    if (!projectDetail) {
      res.status(500).json({ error: "Failed to load project detail" });
      return;
    }

    const phase =
      projectDetail.phases.find((entry) => entry.status === "active") ??
      projectDetail.phases.find((entry) => entry.status === "pending") ??
      tracker.createPhase({
        project_id: project.id,
        name: ADHOC_PHASE_NAME,
        sort_order: projectDetail.phases.length,
      });

    const mission = tracker.createMission({
      phase_id: phase.id,
      name: taskName,
    });
    const task = tracker.createTask({
      mission_id: mission.id,
      name: taskName,
      description: taskDescription,
      agent_id: agent.id,
    });

    tracker.startMission(mission.id);
    await orchestrator.triggerTask(task.id);

    const taskRun = await waitForTaskRun(tracker, task.id);
    if (!taskRun) {
      res.status(503).json({ error: "Task queued but task run was not created yet" });
      return;
    }

    res.status(201).json({
      ok: true,
      run_id: taskRun.id,
      mission_id: mission.id,
      task_id: task.id,
    });
  });

  return router;
}

export function createTaskRunsRouter(tracker: Tracker, orchestrator: Orchestrator): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const projectId = typeof req.query.project_id === "string" ? req.query.project_id : undefined;
    res.json(tracker.listTaskRuns({ projectId }));
  });

  router.get("/:id/events", (req, res) => {
    if (!tracker.getTaskRun(req.params.id)) {
      res.status(404).json({ error: "Task run not found" });
      return;
    }

    res.json(tracker.listRunEvents(req.params.id));
  });

  router.delete("/purge", (_req, res) => {
    const deleted = tracker.deletePurgeFailedRuns();
    res.json({
      ok: true,
      deleted,
    });
  });

  router.post("/:id/retry", async (req, res) => {
    const taskRun = tracker.getTaskRun(req.params.id);
    if (!taskRun) {
      res.status(404).json({ error: "Task run not found" });
      return;
    }

    if (taskRun.status !== "failed") {
      res.status(400).json({ error: "Only failed task runs can be retried" });
      return;
    }

    const retriedRun = tracker.createPendingTaskRun(
      taskRun.task_id,
      taskRun.agent_id,
      null,
      taskRun.attempt + 1,
    );
    const dispatched = await orchestrator.dispatchTaskRun(retriedRun.id);
    if (!dispatched) {
      tracker.updateTaskRun(retriedRun.id, {
        status: "failed",
        completed_at: new Date().toISOString(),
        error: "Failed to dispatch retried task run",
      });
      res.status(500).json({ error: "Failed to dispatch retried task run" });
      return;
    }

    res.status(201).json({
      ok: true,
      run_id: retriedRun.id,
    });
  });

  router.post("/:id/pause", (req, res) => {
    if (!orchestrator.controlTaskRun(req.params.id, "pause")) {
      res.status(404).json({ error: "Active task run not found" });
      return;
    }

    res.json({ ok: true });
  });

  router.post("/:id/stop", (req, res) => {
    if (!orchestrator.controlTaskRun(req.params.id, "stop")) {
      res.status(404).json({ error: "Active task run not found" });
      return;
    }

    res.json({ ok: true });
  });

  return router;
}
