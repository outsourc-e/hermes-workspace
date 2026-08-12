/**
 * LangGraph ↔ Mission Coordinator Bridge
 *
 * Connects jingr1's LangGraph workflow engine to the existing TS mission
 * coordinator. LangGraph handles workflow routing decisions (which worker
 * goes next, human gates, review loops). The TS coordinator handles
 * persistence (SQLite), resource leases, and Hermes Kanban card provisioning.
 *
 * The bridge is one-directional from LangGraph → TS coordinator:
 * - When LangGraph starts a mission, a corresponding TS mission is created
 * - When checkpoints are harvested, node states are updated
 * - When human gates activate, the TS mission reflects the blocked state
 */

import { createMission, getMissionSnapshot, completeNode } from './coordinator'
import { buildMissionFromTemplate, type MissionTemplateKind } from './templates'
import { appendCoordinationEvent, getMission, saveMission } from './coordination-db'
import { withDerivedStates } from './graph-engine'
import type { Mission, NodeState } from './types'

/**
 * Map a LangGraph workflow ID to a TS coordinator template.
 */
export function workflowToTemplate(workflowId: string | null | undefined): MissionTemplateKind {
  switch (workflowId) {
    case 'design_implement':
      return 'coding'
    case 'research_only':
      return 'research'
    case 'rdi':
      return 'qa'
    case 'radw':
      return 'release'
    default:
      return 'coding'
  }
}

/**
 * Map a LangGraph worker verdict to a TS coordinator NodeState.
 */
export function verdictToNodeState(
  verdict: string,
  reviewOutcome?: string,
): NodeState {
  switch (verdict) {
    case 'DONE':
      return reviewOutcome === 'approved' ? 'done' : 'review'
    case 'BLOCKED':
      return 'blocked'
    case 'NEEDS_INPUT':
      return 'needs_input'
    case 'HANDOFF':
      return 'review'
    case 'IN_PROGRESS':
    case 'SKIP':
      return 'running'
    default:
      return 'running'
  }
}

/**
 * Create a TS coordinator mission to track a LangGraph mission.
 * Returns the created mission, or null if it already exists or fails.
 */
export function createCoordinatorMissionForLanggraph(input: {
  missionId: string
  goal: string
  workflowId?: string | null
}): { ok: boolean; mission?: Mission; error?: string } {
  // Don't create if it already exists
  const existing = getMission(input.missionId)
  if (existing) return { ok: true, mission: existing }

  const template = workflowToTemplate(input.workflowId)
  const missionInput = buildMissionFromTemplate({
    id: input.missionId,
    objective: input.goal,
    template,
  })

  const result = createMission(missionInput)
  if (!result.ok) return { ok: false, error: result.errors.join('; ') }

  appendCoordinationEvent(input.missionId, 'langgraph_mission_linked', {
    workflowId: input.workflowId ?? 'default',
    template,
  })

  return { ok: true, mission: result.mission }
}

/**
 * Update a TS coordinator mission node state based on a LangGraph checkpoint.
 * Finds the node matching the worker's role and updates its state.
 */
export function syncNodeFromCheckpoint(input: {
  missionId: string
  workerId: string
  verdict: string
  reviewOutcome?: string
  checkpointText?: string
  resultSummary?: string
}): { ok: boolean; error?: string } {
  const mission = getMission(input.missionId)
  if (!mission) return { ok: false, error: 'Mission not found' }

  // Find the node matching this worker's role.
  // LangGraph worker IDs (researcher, architect, developer, writer) map to
  // TS coordinator roles (researcher, orchestrator, builder, writer).
  const roleMap: Record<string, string[]> = {
    researcher: ['researcher'],
    architect: ['orchestrator', 'reviewer'],
    developer: ['builder', 'developer'],
    writer: ['writer', 'builder'],
    orchestrator: ['orchestrator'],
    learning: ['qa', 'reviewer'],
  }
  const targetRoles = roleMap[input.workerId] ?? [input.workerId]

  // Find the first non-done node with a matching role
  const targetNode = mission.nodes.find(
    (node) =>
      !['done', 'cancelled'].includes(node.state) &&
      targetRoles.includes(node.role),
  )

  if (!targetNode) return { ok: true } // No matching node — not an error

  const newState = verdictToNodeState(input.verdict, input.reviewOutcome)

  // Only update if the state actually changed
  if (targetNode.state === newState) return { ok: true }

  const updated: Mission = withDerivedStates({
    ...mission,
    version: mission.version + 1,
    nodes: mission.nodes.map((node) =>
      node.id === targetNode.id
        ? {
            ...node,
            state: newState,
            evidence: {
              ...node.evidence,
              checkpoint: input.checkpointText ?? node.evidence.checkpoint,
              summary: input.resultSummary ?? node.evidence.summary,
              outcome: input.verdict,
              verifiedAt:
                newState === 'done' ? Date.now() : node.evidence.verifiedAt,
            },
          }
        : node,
    ),
  })

  saveMission(updated)
  appendCoordinationEvent(input.missionId, 'langgraph_checkpoint_synced', {
    nodeId: targetNode.id,
    workerId: input.workerId,
    verdict: input.verdict,
    newState,
  })

  // If the node is done, complete it in the coordinator (releases leases)
  if (newState === 'done') {
    completeNode(input.missionId, targetNode.id, 'langgraph-orchestrator')
  }

  return { ok: true }
}

/**
 * Get a snapshot of the TS coordinator state for a LangGraph mission.
 * Useful for the UI to show both LangGraph workflow state and TS coordination state.
 */
export function getCoordinatorSnapshot(missionId: string) {
  return getMissionSnapshot(missionId)
}
