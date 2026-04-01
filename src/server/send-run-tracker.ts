const ACTIVE_RUNS_KEY = '__hermes_active_send_runs__' as const

function getActiveRuns(): Set<string> {
  const globalValue = globalThis as typeof globalThis & {
    [ACTIVE_RUNS_KEY]?: Set<string>
  }
  if (!globalValue[ACTIVE_RUNS_KEY]) {
    globalValue[ACTIVE_RUNS_KEY] = new Set<string>()
  }
  return globalValue[ACTIVE_RUNS_KEY]!
}

export function registerActiveSendRun(runId: string): void {
  if (!runId) return
  getActiveRuns().add(runId)
}

export function unregisterActiveSendRun(runId: string): void {
  if (!runId) return
  getActiveRuns().delete(runId)
}

export function hasActiveSendRun(runId: string | null | undefined): boolean {
  if (!runId) return false
  return getActiveRuns().has(runId)
}