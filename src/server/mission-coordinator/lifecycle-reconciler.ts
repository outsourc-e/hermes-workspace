import { fetchDashboardKanbanTaskDetails } from '../kanban-dashboard-proxy'
import { listKanbanCards } from '../kanban-backend'
import { parseSwarmCheckpoint } from '../swarm-checkpoints'
import { appendCoordinationEvent, getMission, saveMission } from './coordination-db'
import { completeMissionNode } from './coordinator'
import { withDerivedStates } from './graph-engine'
import type { Mission, MissionNode, NodeState } from './types'

type TaskDetailFetcher = (taskId: string) => Promise<{
  task: { status?: string | null; result?: string | null; latest_summary?: string | null }
  runs?: Array<{ id?: number | null; status?: string | null; outcome?: string | null; summary?: string | null; error?: string | null }>
  comments?: Array<{ body?: string | null; created_at?: number | null }>
} | null>

function stateFromTask(status: string | null | undefined, current: NodeState): NodeState {
  const normalized = (status ?? '').toLowerCase()
  if (normalized === 'blocked') return 'blocked'
  if (normalized === 'review') return 'review'
  if (normalized === 'running' || normalized === 'claimed' || normalized === 'in_progress') return 'running'
  if (normalized === 'done' || normalized === 'complete' || normalized === 'completed') return 'verifying'
  return current
}

function latestCheckpoint(comments: Array<{ body?: string | null }> | undefined): string | null {
  for (const comment of [...(comments ?? [])].reverse()) {
    if (typeof comment.body !== 'string') continue
    if (parseSwarmCheckpoint(comment.body)) return comment.body
  }
  return null
}

function applyDetail(node: MissionNode, detail: NonNullable<Awaited<ReturnType<TaskDetailFetcher>>>): { node: MissionNode; changed: boolean } {
  if (node.state === 'done') return { node, changed: false }
  const run = [...(detail.runs ?? [])].reverse().find((candidate) => candidate.status || candidate.outcome || candidate.summary || candidate.error)
  const checkpoint = latestCheckpoint(detail.comments)
  const parsed = checkpoint ? parseSwarmCheckpoint(checkpoint) : null
  const runComplete = ['done', 'completed', 'complete', 'success', 'succeeded'].includes((run?.status ?? run?.outcome ?? '').toLowerCase())
  const checkpointComplete = parsed?.stateLabel === 'DONE'
  const nextState = runComplete ? 'verifying' : stateFromTask(detail.task.status, node.state)
  const nextEvidence = {
    runId: run?.id ?? null,
    runStatus: run?.status ?? null,
    outcome: run?.outcome ?? null,
    summary: run?.summary ?? detail.task.latest_summary ?? detail.task.result ?? null,
    checkpoint,
    verifiedAt: checkpointComplete ? Date.now() : node.evidence.verifiedAt,
  }
  const changed = nextState !== node.state || JSON.stringify(nextEvidence) !== JSON.stringify(node.evidence)
  return { node: { ...node, state: nextState, evidence: nextEvidence }, changed }
}

export async function reconcileMissionLifecycle(
  missionId: string,
  fetchDetails: TaskDetailFetcher = fetchDashboardKanbanTaskDetails,
): Promise<{ ok: boolean; updated: Array<string>; awaitingEvidence: Array<string>; error?: string }> {
  const mission = getMission(missionId)
  if (!mission) return { ok: false, updated: [], awaitingEvidence: [], error: 'Mission not found' }
  const updated: Array<string> = []
  const awaitingEvidence: Array<string> = []
  try {
    const nextNodes: Array<MissionNode> = []
    for (const node of mission.nodes) {
      if (!node.hermesTaskId) { nextNodes.push(node); continue }
      const detail = await fetchDetails(node.hermesTaskId)
      if (!detail) {
        appendCoordinationEvent(missionId, 'hermes_task_drift', { nodeId: node.id, hermesTaskId: node.hermesTaskId, reason: 'Task detail unavailable' })
        nextNodes.push(node)
        continue
      }
      const result = applyDetail(node, detail)
      nextNodes.push(result.node)
      if (result.changed) updated.push(node.id)
      if (result.node.state === 'verifying' && result.node.evidence.verifiedAt === null) awaitingEvidence.push(node.id)
    }
    if (updated.length) {
      saveMission(withDerivedStates({ ...mission, version: mission.version + 1, nodes: nextNodes }))
      appendCoordinationEvent(missionId, 'lifecycle_reconciled', { updated, awaitingEvidence })
      for (const nextNode of nextNodes) {
        if ((nextNode.state === 'verifying' || nextNode.state === 'review') && nextNode.evidence.verifiedAt !== null) {
          completeMissionNode(missionId, nextNode.id, 'reconciler')
        }
      }
    }
    return { ok: true, updated, awaitingEvidence }
  } catch (error) {
    return { ok: false, updated, awaitingEvidence, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function reconcileMissionFromKanban(missionId: string): Promise<ReturnType<typeof reconcileMissionLifecycle>> {
  return reconcileMissionLifecycle(missionId)
}

export async function listLinkedTaskIds(missionId: string): Promise<Array<string>> {
  const mission = getMission(missionId)
  if (!mission) return []
  const cards = await listKanbanCards()
  const ids = new Set(cards.map((card) => card.id))
  return mission.nodes.flatMap((node) => node.hermesTaskId && ids.has(node.hermesTaskId) ? [node.hermesTaskId] : [])
}
