import { Router } from "express";
import { Tracker } from "../tracker";

export function createMissionsRouter(tracker: Tracker): Router {
  const router = Router();

  router.post("/", (req, res) => {
    const { phase_id, name } = req.body as {
      phase_id?: string;
      name?: string;
    };

    if (!phase_id || !name || name.trim().length === 0) {
      res.status(400).json({ error: "phase_id and name are required" });
      return;
    }

    if (!tracker.getPhase(phase_id)) {
      res.status(404).json({ error: "Phase not found" });
      return;
    }

    const mission = tracker.createMission({
      phase_id,
      name: name.trim(),
    });
    res.status(201).json(mission);
  });

  router.post("/:id/start", (req, res) => {
    const ok = tracker.startMission(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Mission not found" });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/:id/pause", (req, res) => {
    const ok = tracker.pauseMission(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Mission not found" });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/:id/resume", (req, res) => {
    const ok = tracker.resumeMission(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Mission not found" });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/:id/stop", (req, res) => {
    const ok = tracker.stopMission(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Mission not found" });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
