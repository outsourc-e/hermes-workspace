import { Router } from "express";
import { Tracker } from "../tracker";
import { Orchestrator } from "../orchestrator";
import type { TaskStatus } from "../types";

export function createTasksRouter(tracker: Tracker, orchestrator: Orchestrator): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const missionId = typeof req.query.mission_id === "string" ? req.query.mission_id : undefined;
    const status = typeof req.query.status === "string" ? (req.query.status as TaskStatus) : undefined;
    res.json(tracker.listTasks({ mission_id: missionId, status }));
  });

  router.post("/", (req, res) => {
    const { mission_id, name, description, agent_id, status, sort_order, depends_on } = req.body as {
      mission_id?: string;
      name?: string;
      description?: string | null;
      agent_id?: string | null;
      status?: TaskStatus;
      sort_order?: number;
      depends_on?: string[] | null;
    };

    if (!mission_id || !name) {
      res.status(400).json({ error: "mission_id and name are required" });
      return;
    }

    const task = tracker.createTask({
      mission_id,
      name,
      description,
      agent_id,
      status,
      sort_order,
      depends_on,
    });
    res.status(201).json(task);
  });

  router.put("/:id", (req, res) => {
    const task = tracker.updateTask(req.params.id, req.body);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json(task);
  });

  router.post("/:id/run", async (req, res) => {
    const triggered = await orchestrator.triggerTask(req.params.id);
    if (!triggered) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json({ ok: true });
  });

  router.get("/:id/runs", (req, res) => {
    res.json(tracker.listTaskRuns(req.params.id));
  });

  return router;
}
