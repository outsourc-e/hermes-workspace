import type { Request, Response, Router } from "express";
import { Tracker } from "../tracker";

function writeSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function setupSseHeaders(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
}

export function registerEventsRoutes(router: Router, tracker: Tracker): void {
  router.get("/", (req: Request, res: Response) => {
    const wantsStream =
      req.accepts("text/event-stream") &&
      !("limit" in req.query) &&
      !("project_id" in req.query);

    if (!wantsStream) {
      const projectId =
        typeof req.query.project_id === "string" ? req.query.project_id : undefined;
      const limit =
        typeof req.query.limit === "string"
          ? Number.parseInt(req.query.limit, 10)
          : undefined;
      res.json(tracker.listActivityEvents({ project_id: projectId, limit }));
      return;
    }

    setupSseHeaders(res);

    const listener = (payload: { event: string; data: unknown }) => {
      writeSse(res, payload.event, payload.data);
    };

    writeSse(res, "hello", { ok: true });
    tracker.on("sse", listener);

    const keepAlive = setInterval(() => {
      res.write(": ping\n\n");
    }, 15_000);

    res.on("close", () => {
      clearInterval(keepAlive);
      tracker.off("sse", listener);
    });
  });

  router.get("/:taskRunId", (req: Request, res: Response) => {
    setupSseHeaders(res);

    for (const event of tracker.listRunEvents(req.params.taskRunId)) {
      writeSse(res, event.type, event);
    }

    const listener = (payload: { event: string; data: any }) => {
      if (payload.event !== "run_event" || payload.data.task_run_id !== req.params.taskRunId) {
        return;
      }
      writeSse(res, payload.event, payload.data);
    };

    tracker.on("sse", listener);
    const keepAlive = setInterval(() => {
      res.write(": ping\n\n");
    }, 15_000);

    res.on("close", () => {
      clearInterval(keepAlive);
      tracker.off("sse", listener);
    });
  });
}
