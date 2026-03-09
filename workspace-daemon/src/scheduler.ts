import type { ProviderConcurrencyConfig, RunningEntry, TaskWithRelations } from "./types";

function parseDependencies(task: TaskWithRelations): string[] {
  if (!task.depends_on) {
    return [];
  }

  try {
    const parsed = JSON.parse(task.depends_on) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function resolveAdapterType(task: TaskWithRelations): string {
  return task.resolved_adapter_type ?? task.agent_adapter_type ?? "codex";
}

export class Scheduler {
  calculateWaves(tasks: TaskWithRelations[]): TaskWithRelations[][] {
    if (tasks.length === 0) {
      return [];
    }

    const orderedTasks = [...tasks].sort((left, right) => {
      if (left.sort_order !== right.sort_order) {
        return left.sort_order - right.sort_order;
      }

      return left.created_at.localeCompare(right.created_at);
    });
    const taskMap = new Map(orderedTasks.map((task) => [task.id, task] as const));
    const remaining = new Set(orderedTasks.map((task) => task.id));
    const completedInPlan = new Set<string>();
    const waves: TaskWithRelations[][] = [];

    while (remaining.size > 0) {
      const wave = orderedTasks.filter((task) => {
        if (!remaining.has(task.id)) {
          return false;
        }

        return parseDependencies(task).every((dependencyId) => !taskMap.has(dependencyId) || completedInPlan.has(dependencyId));
      });

      if (wave.length === 0) {
        waves.push(
          orderedTasks
            .filter((task) => remaining.has(task.id))
            .map((task) => ({
              ...task,
              wave: waves.length + 1,
            })),
        );
        break;
      }

      waves.push(
        wave.map((task) => ({
          ...task,
          wave: waves.length + 1,
        })),
      );
      for (const task of wave) {
        remaining.delete(task.id);
        completedInPlan.add(task.id);
      }
    }

    return waves;
  }

  getDispatchable(
    tasks: TaskWithRelations[],
    running: Map<string, RunningEntry>,
    config: ProviderConcurrencyConfig,
  ): TaskWithRelations[] {
    const waves = this.calculateWaves(tasks);
    if (waves.length === 0) {
      return [];
    }

    const runningByProvider = new Map<string, number>();
    for (const entry of running.values()) {
      if (!entry.adapterType) {
        continue;
      }

      runningByProvider.set(entry.adapterType, (runningByProvider.get(entry.adapterType) ?? 0) + 1);
    }

    let unlockedWave: TaskWithRelations[] | null = null;
    for (const wave of waves) {
      const allCompleted = wave.every((task) => task.status === "completed");
      if (allCompleted) {
        continue;
      }

      unlockedWave = wave;
      break;
    }

    if (!unlockedWave) {
      return [];
    }

    const dispatchable: TaskWithRelations[] = [];
    for (const task of unlockedWave) {
      if (task.status !== "ready") {
        continue;
      }
      if (running.has(task.id)) {
        continue;
      }

      const adapterType = resolveAdapterType(task);
      const limit = config[adapterType] ?? Number.MAX_SAFE_INTEGER;
      const used = runningByProvider.get(adapterType) ?? 0;
      if (used >= limit) {
        continue;
      }

      runningByProvider.set(adapterType, used + 1);
      dispatchable.push(task);
    }

    return dispatchable;
  }
}
