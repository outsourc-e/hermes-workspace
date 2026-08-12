import { updateKanbanCard } from '../kanban-backend'
import { appendCoordinationEvent, getMission, saveMission } from './coordination-db'
import type { Mission } from './types'

export async function dispatchClaimedNode(
  missionId: string,
  nodeId: string,
  owner: string,
): Promise<{ ok: boolean; mission?: Mission; error?: string }> {
  const mission = getMission(missionId)
  const node = mission?.nodes.find((candidate) => candidate.id === nodeId)
  if (!mission || !node) return { ok: false, error: 'Mission or node not found' }
  if (node.state !== 'leased') return { ok: false, error: `Node must be leased before dispatch, current state: ${node.state}` }
  if (!node.hermesTaskId) return { ok: false, error: 'Node has no Hermes task; provision native tasks first' }
  try {
    const card = await updateKanbanCard(node.hermesTaskId, { status: 'ready' })
    if (!card) return { ok: false, error: 'Hermes task not found' }
    const next: Mission = {
      ...mission,
      version: mission.version + 1,
      nodes: mission.nodes.map((candidate) => candidate.id === nodeId ? { ...candidate, state: 'dispatched', dispatchedAt: Date.now() } : candidate),
    }
    saveMission(next)
    appendCoordinationEvent(missionId, 'node_dispatched', { nodeId, owner, hermesTaskId: node.hermesTaskId })
    return { ok: true, mission: next }
  } catch (error) {
    appendCoordinationEvent(missionId, 'node_dispatch_failed', { nodeId, owner, error: error instanceof Error ? error.message : String(error) })
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function dispatchNextClaimedNode(
  missionId: string,
  owner: string,
): Promise<{ ok: boolean; nodeId?: string; mission?: Mission; error?: string }> {
  const mission = getMission(missionId)
  const leased = mission?.nodes.filter((candidate) => candidate.state === 'leased')
    .sort((a, b) => (a.claimedAt ?? 0) - (b.claimedAt ?? 0)) ?? []
  const node = leased[0]
  if (!node) return { ok: false, error: 'No leased node ready for dispatch' }
  const result = await dispatchClaimedNode(missionId, node.id, owner)
  return { ...result, nodeId: node.id }
}
