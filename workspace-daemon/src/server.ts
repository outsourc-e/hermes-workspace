import express from "express";
import cors from "cors";
import { Router } from "express";
import { Tracker } from "./tracker";
import { Orchestrator } from "./orchestrator";
import { createProjectsRouter } from "./routes/projects";
import { createTasksRouter } from "./routes/tasks";
import { createAgentsRouter } from "./routes/agents";
import { createMissionsRouter } from "./routes/missions";
import { registerEventsRoutes } from "./routes/events";
import { createCheckpointsRouter } from "./routes/checkpoints";
import { createPhasesRouter } from "./routes/phases";
import { createDecomposeRouter } from "./routes/decompose";

const PORT = Number(process.env.PORT ?? 3001);

export function createServer(): { app: express.Express; tracker: Tracker; orchestrator: Orchestrator } {
  const app = express();
  const tracker = new Tracker();
  const orchestrator = new Orchestrator(tracker);

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/projects", createProjectsRouter(tracker));
  app.use("/api/phases", createPhasesRouter(tracker));
  app.use("/api/tasks", createTasksRouter(tracker, orchestrator));
  app.use("/api/agents", createAgentsRouter(tracker));
  app.use("/api/missions", createMissionsRouter(tracker));
  app.use("/api/checkpoints", createCheckpointsRouter(tracker));
  app.use("/api/decompose", createDecomposeRouter(tracker));

  const eventsRouter = Router();
  registerEventsRoutes(eventsRouter, tracker);
  app.use("/api/events", eventsRouter);

  return { app, tracker, orchestrator };
}

const { app, orchestrator } = createServer();

orchestrator.start();

app.listen(PORT, () => {
  process.stdout.write(`Workspace daemon listening on http://localhost:${PORT}\n`);
});
