import { Router } from "express";
import { Tracker } from "../tracker";

export function createProjectsRouter(tracker: Tracker): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(tracker.listProjects());
  });

  router.post("/", (req, res) => {
    const { name, path, spec } = req.body as { name?: string; path?: string | null; spec?: string | null };
    if (!name || name.trim().length === 0) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const project = tracker.createProject({
      name: name.trim(),
      path: path ?? null,
      spec: spec ?? null,
    });
    res.status(201).json(project);
  });

  router.get("/:id", (req, res) => {
    const project = tracker.getProjectDetail(req.params.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(project);
  });

  router.put("/:id", (req, res) => {
    const project = tracker.updateProject(req.params.id, req.body);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(project);
  });

  router.delete("/:id", (req, res) => {
    const deleted = tracker.deleteProject(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.status(204).send();
  });

  return router;
}
