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
import { createAdhocTaskRunsRouter, createTaskRunsRouter } from "./routes/task-runs";
import { createTeamsRouter } from "./routes/teams";
import { createSkillsRouter } from "./routes/skills";

const PORT = Number(process.env.PORT ?? 3002);

export function createServer(): { app: express.Express; tracker: Tracker; orchestrator: Orchestrator } {
  const app = express();
  const tracker = new Tracker();
  const orchestrator = new Orchestrator(tracker);

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/workspace/config", (_req, res) => {
    res.json({
      autoApprove: orchestrator.getAutoApprove(),
    });
  });

  app.patch("/api/workspace/config", (req, res) => {
    const autoApprove = req.body?.auto_approve;
    if (typeof autoApprove !== "boolean") {
      res.status(400).json({ error: "auto_approve is required" });
      return;
    }

    orchestrator.setAutoApprove(autoApprove);
    res.json({
      autoApprove: orchestrator.getAutoApprove(),
    });
  });

  app.use("/api/workspace/projects", createProjectsRouter(tracker));
  app.use("/api/workspace/phases", createPhasesRouter(tracker));
  app.use("/api/workspace/tasks", createTasksRouter(tracker, orchestrator));
  app.use("/api/workspace/task-runs/adhoc", createAdhocTaskRunsRouter(tracker, orchestrator));
  app.use("/api/workspace/task-runs", createTaskRunsRouter(tracker, orchestrator));
  app.use("/api/workspace/agents", createAgentsRouter(tracker));
  app.use("/api/workspace/missions", createMissionsRouter(tracker));
  app.use("/api/workspace/checkpoints", createCheckpointsRouter(tracker, orchestrator));
  app.use("/api/workspace/decompose", createDecomposeRouter(tracker));
  app.use("/api/workspace/teams", createTeamsRouter(tracker));
  app.use("/api/workspace/skills", createSkillsRouter());

  const eventsRouter = Router();
  registerEventsRoutes(eventsRouter, tracker);
  app.use("/api/workspace/events", eventsRouter);

  return { app, tracker, orchestrator };
}

const { app, orchestrator } = createServer();

orchestrator.start();

const server = app.listen(PORT, () => {
  process.stdout.write(`Workspace daemon listening on http://localhost:${PORT}\n`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    process.stderr.write(
      `Workspace daemon port ${PORT} is already in use; leaving the existing process running.\n`,
    );
    process.exit(0);
    return;
  }

  process.stderr.write(`Workspace daemon failed to start: ${error.message}\n`);
  process.exit(1);
});
