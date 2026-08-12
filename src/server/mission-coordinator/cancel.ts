import { updateKanbanCard } from '../kanban-backend'
import { appendCoordinationEvent, getMission, releaseResourceLeasesForMission, releaseSchedulerLeaseForMission, saveMission } from './coordination-db'
import type { Mission } from './types'

export async function cancelCoordinatorMission(missionId: string, owner = 'conductor-stop'): Promise<{ ok: boolean; mission?: Mission; error?: string }> {
  const mission = getMission(missionId)
  if (!mission) return { ok: false, error: 'Mission not found' }
  const taskErrors: Array<string> = []
  for (const node of mission.nodes) {
    if (!node.hermesTaskId || ['done', 'cancelled'].includes(node.state)) continue
    try { await updateKanbanCard(node.hermesTaskId, { status: 'blocked' }) } catch (error) { taskErrors.push(`${node.id}: ${error instanceof Error ? error.message : String(error)}`) }
  }
  const next: Mission = { ...mission, version: mission.version + 1, nodes: mission.nodes.map((node) => ['done', 'cancelled'].includes(node.state) ? node : { ...node, state: 'cancelled' }) }
  saveMission(next)
  releaseResourceLeasesForMission(missionId, mission.nodes.flatMap((node) => node.locks))
  releaseSchedulerLeaseForMission(missionId)
  appendCoordinationEvent(missionId, 'mission_cancelled', { owner, taskErrors })
  return { ok: true, mission: next, ...(taskErrors.length ? { error: taskErrors.join('; ') } : {}) }
}
