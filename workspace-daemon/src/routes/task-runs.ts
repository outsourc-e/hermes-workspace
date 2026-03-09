import { Router } from "express";
import { Orchestrator } from "../orchestrator";
import { Tracker } from "../tracker";

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
