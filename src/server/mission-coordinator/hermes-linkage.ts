import {
  createKanbanCard,
  listKanbanCards,
  updateKanbanCard,
} from '../kanban-backend'
import {
  appendCoordinationEvent,
  getMission,
  saveMission,
} from './coordination-db'
import { withDerivedStates } from './graph-engine'
import type { Mission } from './types'

export async function provisionHermesTasks(
  missionId: string,
): Promise<{
  ok: boolean
  mission?: Mission
  created: Array<string>
  error?: string
}> {
  const mission = getMission(missionId)
  if (!mission) return { ok: false, created: [], error: 'Mission not found' }
  const created: Array<string> = []
  try {
    const nodes = [...mission.nodes]
    for (const node of nodes) {
      if (node.hermesTaskId) continue
      const card = await createKanbanCard({
        title: `${mission.title}: ${node.title}`,
        spec: [
          `Mission: ${mission.id}`,
          `Node: ${node.id}`,
          `Role: ${node.role}`,
          '',
          node.objective,
        ].join('\n'),
        assignedWorker: node.role,
        status: 'backlog',
        parents: [],
        missionId: mission.id,
        createdBy: 'mission-coordinator',
        idempotencyKey: `${mission.id}:${node.id}`,
      })
      node.hermesTaskId = card.id
      created.push(node.id)
    }
    const byId = new Map(nodes.map((node) => [node.id, node]))
    for (const node of nodes) {
      if (!node.hermesTaskId) continue
      const parents = node.dependsOn.flatMap((dependency) => {
        const parent = byId.get(dependency)
        return parent?.hermesTaskId ? [parent.hermesTaskId] : []
      })
      if (parents.length) await updateKanbanCard(node.hermesTaskId, { parents })
    }
    const linked = withDerivedStates({
      ...mission,
      version: mission.version + 1,
      nodes,
    })
    saveMission(linked)
    appendCoordinationEvent(mission.id, 'hermes_tasks_provisioned', {
      created,
      backend: 'kanban',
    })
    return { ok: true, mission: linked, created }
  } catch (error) {
    appendCoordinationEvent(mission.id, 'hermes_task_provision_failed', {
      created,
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      ok: false,
      created,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function reconcileHermesTasks(
  missionId: string,
): Promise<{ ok: boolean; updated: Array<string>; error?: string }> {
  const mission = getMission(missionId)
  if (!mission) return { ok: false, updated: [], error: 'Mission not found' }
  try {
    const cards = await listKanbanCards()
    const byId = new Map(cards.map((card) => [card.id, card]))
    const updated: Array<string> = []
    for (const node of mission.nodes) {
      if (!node.hermesTaskId) continue
      const card = byId.get(node.hermesTaskId)
      if (!card) {
        appendCoordinationEvent(mission.id, 'hermes_task_drift', {
          nodeId: node.id,
          hermesTaskId: node.hermesTaskId,
          reason: 'Native task missing',
        })
        continue
      }
      if (node.state === 'done') continue
      const dependenciesDone = node.dependsOn.every(
        (dep) => mission.nodes.find((candidate) => candidate.id === dep)?.state === 'done',
      )
      const desiredState =
        card.status === 'done'
          ? 'verifying'
          : card.status === 'blocked'
            ? 'blocked'
            : card.status === 'review'
              ? 'review'
              : card.status === 'running'
                ? 'running'
                : node.state
      const nextState =
        desiredState === 'verifying' || desiredState === 'review'
          ? dependenciesDone
            ? desiredState
            : 'blocked'
          : desiredState === 'running'
            ? dependenciesDone
              ? 'running'
              : 'blocked_by_dependency'
            : desiredState
      if (nextState !== node.state) {
        node.state = nextState
        updated.push(node.id)
      }
    }
    if (updated.length) {
      saveMission(
        withDerivedStates({ ...mission, version: mission.version + 1 }),
      )
      appendCoordinationEvent(mission.id, 'hermes_reconciled', { updated })
    }
    return { ok: true, updated }
  } catch (error) {
    return {
      ok: false,
      updated: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function updateHermesTaskStatus(
  missionId: string,
  nodeId: string,
  status: 'ready' | 'running' | 'review' | 'blocked' | 'done',
): Promise<{ ok: boolean; error?: string }> {
  const mission = getMission(missionId)
  const node = mission?.nodes.find((candidate) => candidate.id === nodeId)
  if (!mission || !node)
    return { ok: false, error: 'Mission or node not found' }
  if (!node.hermesTaskId) return { ok: false, error: 'Node has no Hermes task' }
  try {
    const card = await updateKanbanCard(node.hermesTaskId, { status })
    if (!card) return { ok: false, error: 'Hermes task not found' }
    appendCoordinationEvent(mission.id, 'hermes_task_status_updated', {
      nodeId,
      status,
    })
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
