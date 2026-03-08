import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { Decomposer } from "../decomposer";
import { Tracker } from "../tracker";
import type { DecomposedTask } from "../types";

const MAX_CONTEXT_FILES = 200;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", ".data", "dist"]);

async function collectExistingFiles(projectPath: string, maxFiles = MAX_CONTEXT_FILES): Promise<string[]> {
  const files: string[] = [];
  const queue = [projectPath];

  while (queue.length > 0 && files.length < maxFiles) {
    const currentPath = queue.shift();
    if (!currentPath) continue;

    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) {
          queue.push(path.join(currentPath, entry.name));
        }
      } else if (entry.isFile()) {
        files.push(path.relative(projectPath, path.join(currentPath, entry.name)));
      }
    }
  }

  return files.sort();
}

async function createTasksForMission(tracker: Tracker, missionId: string, tasks: DecomposedTask[]): Promise<void> {
  const createdTasks = tasks.map((task, index) =>
    tracker.createTask({
      mission_id: missionId,
      name: task.name,
      description: task.description,
      sort_order: index,
      depends_on: [],
    }),
  );

  const idByName = new Map(createdTasks.map((task, i) => [tasks[i]?.name, task.id] as const));

  createdTasks.forEach((createdTask, index) => {
    const depIds = (tasks[index]?.depends_on ?? [])
      .map((name) => idByName.get(name))
      .filter((id): id is string => typeof id === "string");

    if (depIds.length > 0) {
      tracker.updateTask(createdTask.id, { depends_on: depIds });
    }
  });
}

export function createDecomposeRouter(tracker: Tracker): Router {
  const router = Router();
  const decomposer = new Decomposer();

  router.post("/", async (req, res) => {
    const { goal, project_id, mission_id } = req.body as {
      goal?: string;
      project_id?: string;
      mission_id?: string;
    };

    if (!goal || goal.trim().length === 0) {
      res.status(400).json({ error: "goal is required" });
      return;
    }

    const missionContext = mission_id ? tracker.getMissionWithProjectContext(mission_id) : null;
    if (mission_id && !missionContext) {
      res.status(404).json({ error: "Mission not found" });
      return;
    }

    const project = project_id ? tracker.getProject(project_id) : null;
    if (project_id && !project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const projectPath = project?.path ?? missionContext?.project_path ?? null;
    const projectSpec = project?.spec ?? missionContext?.project_spec ?? null;

    try {
      const existingFiles = projectPath ? await collectExistingFiles(projectPath) : [];
      const result = await decomposer.decompose(goal, {
        project_path: projectPath,
        project_spec: projectSpec,
        existing_files: existingFiles,
      });

      if (mission_id) {
        await createTasksForMission(tracker, mission_id, result.tasks);
      }

      res.json({
        tasks: result.tasks,
        ...(result.parsed ? {} : { raw_response: result.rawResponse }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
