import { Router } from "express";
import { Tracker } from "../tracker";

export function createCheckpointsRouter(tracker: Tracker): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json(tracker.listCheckpoints(status));
  });

  router.post("/:id/approve", (req, res) => {
    const checkpoint = tracker.updateCheckpointStatus(req.params.id, "approved", req.body?.reviewer_notes);
    if (!checkpoint) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }
    res.json(checkpoint);
  });

  router.post("/:id/reject", (req, res) => {
    const checkpoint = tracker.updateCheckpointStatus(req.params.id, "rejected", req.body?.reviewer_notes);
    if (!checkpoint) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }
    res.json(checkpoint);
  });

  router.post("/:id/revise", (req, res) => {
    const checkpoint = tracker.updateCheckpointStatus(req.params.id, "revised", req.body?.reviewer_notes);
    if (!checkpoint) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }
    res.json(checkpoint);
  });

  return router;
}
