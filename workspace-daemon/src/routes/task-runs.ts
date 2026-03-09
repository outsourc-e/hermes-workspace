import { Router } from "express";
import { Orchestrator } from "../orchestrator";
import { Tracker } from "../tracker";

export function createTaskRunsRouter(tracker: Tracker, orchestrator: Orchestrator): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(tracker.listTaskRuns());
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
