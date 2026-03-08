import { Router } from "express";
import { Tracker } from "../tracker";

export function createPhasesRouter(tracker: Tracker): Router {
  const router = Router();

  router.post("/", (req, res) => {
    const { project_id, name, sort_order } = req.body as {
      project_id?: string;
      name?: string;
      sort_order?: number;
    };

    if (!project_id || !name || name.trim().length === 0) {
      res.status(400).json({ error: "project_id and name are required" });
      return;
    }

    const project = tracker.getProject(project_id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const phase = tracker.createPhase({
      project_id,
      name: name.trim(),
      sort_order,
    });
    res.status(201).json(phase);
  });

  return router;
}
