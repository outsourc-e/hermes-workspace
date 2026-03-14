import { Router } from "express";
import { Tracker } from "../tracker";
import type { Mission } from "../types";

const MISSION_STATUSES: Mission["status"][] = [
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
  "blocked",
  "stopped",
];

function isMissionStatus(value: string): value is Mission["status"] {
  return (MISSION_STATUSES as readonly string[]).includes(value);
}

export function createMissionsRouter(tracker: Tracker): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const phaseId =
      typeof req.query.phase_id === "string" && req.query.phase_id.trim().length > 0
        ? req.query.phase_id.trim()
        : undefined;
    const projectId =
      typeof req.query.project_id === "string" && req.query.project_id.trim().length > 0
        ? req.query.project_id.trim()
        : undefined;
    const statusValue =
      typeof req.query.status === "string" && req.query.status.trim().length > 0
        ? req.query.status.trim()
        : undefined;
    const status = statusValue && isMissionStatus(statusValue) ? statusValue : undefined;

    res.json(
      tracker.listMissions({
        phase_id: phaseId,
        project_id: projectId,
        status,
      }),
    );
  });

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

  router.get("/:id/status", (req, res) => {
    const status = tracker.getMissionStatus(req.params.id);
    if (!status) {
      res.status(404).json({ error: "Mission not found" });
      return;
    }
    res.json(status);
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
