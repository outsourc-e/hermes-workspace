import { expireLeases, listMissions } from './coordination-db'
import { reconcileMissionFromKanban } from './lifecycle-reconciler'
import { advanceMissionNodes } from './coordinator'

let timer: NodeJS.Timeout | null = null
let running = false

export type ReconciliationSummary = {
  expired: { scheduler: number; resources: number }
  checked: number
  updated: number
  awaitingEvidence: number
  errors: Array<{ missionId: string; error: string }>
}

export async function reconcileOnce(limit = 25): Promise<ReconciliationSummary> {
  if (running) return { expired: { scheduler: 0, resources: 0 }, checked: 0, updated: 0, awaitingEvidence: 0, errors: [] }
  running = true
  try {
    const expired = expireLeases()
    const missions = listMissions().slice(0, Math.max(1, Math.min(100, limit)))
    const summary: ReconciliationSummary = { expired, checked: 0, updated: 0, awaitingEvidence: 0, errors: [] }
    for (const mission of missions) {
      if (mission.nodes.some((node) => node.hermesTaskId && ['dispatched', 'running', 'verifying', 'review'].includes(node.state))) {
        const result = await reconcileMissionFromKanban(mission.id)
        summary.checked += 1
        summary.updated += result.updated.length
        summary.awaitingEvidence += result.awaitingEvidence.length
        if (!result.ok) summary.errors.push({ missionId: mission.id, error: result.error ?? 'reconciliation failed' })
      }
      if (mission.nodes.some((node) => node.state === 'ready' || node.state === 'leased')) {
        const advance = await advanceMissionNodes(mission.id)
        if (!advance.ok) summary.errors.push({ missionId: mission.id, error: advance.reason ?? 'advance failed' })
      }
    }
    return summary
  } finally {
    running = false
  }
}

export function startReconciliationLoop(intervalMs = 10_000): void {
  if (timer) return
  timer = setInterval(() => { void reconcileOnce() }, Math.max(2_000, intervalMs))
  timer.unref()
}

export function stopReconciliationLoop(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
