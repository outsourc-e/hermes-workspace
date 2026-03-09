import { Router } from "express";
import { Tracker } from "../tracker";

export function createTaskRunsRouter(tracker: Tracker): Router {
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

  return router;
}
