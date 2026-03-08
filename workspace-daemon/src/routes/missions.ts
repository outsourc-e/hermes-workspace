import { Router } from "express";
import { Tracker } from "../tracker";
import { Orchestrator } from "../orchestrator";

export function createMissionsRouter(tracker: Tracker, orchestrator: Orchestrator): Router {
  const router = Router();

  router.post("/:id/start", async (req, res) => {
    const ok = tracker.startMission(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Mission not found" });
      return;
    }
    await orchestrator.tick();
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

  router.post("/:id/resume", async (req, res) => {
    const ok = tracker.resumeMission(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Mission not found" });
      return;
    }
    await orchestrator.tick();
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
