import { Router } from "express";
import { Tracker } from "../tracker";

export function createAgentsRouter(tracker: Tracker): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(tracker.listAgents());
  });

  router.post("/", (req, res) => {
    const { name, role, adapter_type, adapter_config, model, capabilities } = req.body as {
      name?: string;
      role?: string;
      adapter_type?: "codex" | "claude" | "openclaw" | "ollama";
      adapter_config?: Record<string, unknown>;
      model?: string | null;
      capabilities?: Record<string, unknown>;
    };
    if (!name || name.trim().length === 0) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const agent = tracker.registerAgent({
      name: name.trim(),
      role,
      adapter_type,
      adapter_config,
      model,
      capabilities,
    });
    res.status(201).json(agent);
  });

  router.get("/:id/status", (req, res) => {
    const status = tracker.getAgentStatus(req.params.id);
    if (!status) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json(status);
  });

  return router;
}
