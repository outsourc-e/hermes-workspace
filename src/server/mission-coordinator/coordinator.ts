import { randomUUID } from 'node:crypto'
import {
  deriveReadyNodes,
  findLockConflicts,
  validateMission,
  withDerivedStates,
} from './graph-engine'
import { dispatchNextClaimedNode } from './execution-bridge'
import {
  acquireResourceLeases,
  acquireSchedulerLease,
  appendCoordinationEvent,
  deleteMission,
  getMission,
  listCoordinationEvents,
  listLeases,
  listMissions,
  releaseResourceLeasesForMission,
  releaseSchedulerLeaseForMission,
  saveMission,
} from './coordination-db'
import type { Mission, NodeState, PreflightResult } from './types'

export function createMission(
  input: unknown,
): { ok: true; mission: Mission } | { ok: false; errors: Array<string> } {
  const result = validateMission(input)
  if (!result.mission) return { ok: false, errors: result.errors }
  const mission = withDerivedStates(result.mission)
  saveMission(mission)
  appendCoordinationEvent(mission.id, 'mission_created', {
    version: mission.version,
  })
  return { ok: true, mission }
}

export function preflightMission(
  missionOrId: Mission | string,
): PreflightResult {
  const mission =
    typeof missionOrId === 'string' ? getMission(missionOrId) : missionOrId
  if (!mission)
    return {
      missionId: typeof missionOrId === 'string' ? missionOrId : '',
      version: 0,
      valid: false,
      errors: ['Mission not found'],
      ready: [],
      waiting: [],
      conflicts: [],
    }
  const validation = validateMission(mission)
  if (!validation.mission)
    return {
      missionId: mission.id,
      version: mission.version,
      valid: false,
      errors: validation.errors,
      ready: [],
      waiting: [],
      conflicts: [],
    }
  const normalized = withDerivedStates(validation.mission)
  const readiness = deriveReadyNodes(normalized)
  const activeResources = new Map(
    listLeases()
      .resources
      .map((lease) => [lease.resource, { missionId: lease.missionId, owner: lease.owner }]),
  )
  const conflicts = findLockConflicts(normalized, readiness.ready, activeResources)
  const conflictIds = new Set(conflicts.map((item) => item.nodeId))
  const activeLeased = mission.nodes.filter(
    (node) =>
      node.state === 'leased' ||
      node.state === 'dispatched' ||
      node.state === 'running' ||
      node.state === 'verifying',
  ).length
  const remainingParallelism = Math.max(
    0,
    normalized.maxParallelism - activeLeased,
  )
  return {
    missionId: normalized.id,
    version: normalized.version,
    valid: true,
    errors: [],
    ready: readiness.ready
      .filter((id) => !conflictIds.has(id))
      .slice(0, remainingParallelism),
    waiting: readiness.waiting,
    conflicts,
  }
}

export function claimReadyNodes(
  missionId: string,
  owner: string = randomUUID(),
  ttlMs = 60_000,
): { ok: boolean; owner: string; nodeIds: Array<string>; reason?: string } {
  const mission = getMission(missionId)
  if (!mission)
    return { ok: false, owner, nodeIds: [], reason: 'Mission not found' }
  const schedulerLease = acquireSchedulerLease(missionId, owner, ttlMs)
  if (!schedulerLease)
    return {
      ok: false,
      owner,
      nodeIds: [],
      reason: 'Scheduler lease held by another coordinator',
    }
  const plan = preflightMission(mission)
  if (!plan.valid) {
    releaseSchedulerLeaseForMission(missionId)
    return { ok: false, owner, nodeIds: [], reason: plan.errors.join('; ') }
  }
  const selected = mission.nodes.filter((node) => plan.ready.includes(node.id))
  if (selected.length === 0) {
    releaseSchedulerLeaseForMission(missionId)
    return { ok: true, owner, nodeIds: [] }
  }
  const resources = selected.flatMap((node) => node.locks)
  const resourceLeases = acquireResourceLeases(
    missionId,
    owner,
    resources,
    ttlMs,
  )
  if (!resourceLeases) {
    releaseSchedulerLeaseForMission(missionId)
    return {
      ok: false,
      owner,
      nodeIds: [],
      reason: 'One or more node resources are already leased',
    }
  }
  const now = Date.now()
  const nodeIds = selected.map((node) => node.id)
  const updated: Mission = {
    ...mission,
    nodes: mission.nodes.map((node) =>
      nodeIds.includes(node.id) ? { ...node, state: 'leased', claimedAt: now } : node,
    ),
    version: mission.version + 1,
  }
  saveMission(updated)
  appendCoordinationEvent(missionId, 'nodes_leased', {
    owner,
    nodeIds,
    resources: resourceLeases.map((lease) => lease.resource),
  })
  return { ok: true, owner, nodeIds }
}

export function completeMissionNode(
  missionId: string,
  nodeId: string,
  actor = 'unknown',
): { ok: boolean; reason?: string; mission?: Mission } {
  const mission = getMission(missionId)
  if (!mission) return { ok: false, reason: 'Mission not found' }
  const node = mission.nodes.find((item) => item.id === nodeId)
  if (!node) return { ok: false, reason: 'Node not found' }
  if (node.state === 'done') return { ok: true, mission }
  if (node.state !== 'verifying' && node.state !== 'review') {
    return { ok: false, reason: `Node cannot complete from ${node.state}` }
  }
  if (node.evidence.verifiedAt === null) {
    return {
      ok: false,
      reason:
        'Node requires successful run and verified checkpoint evidence before completion',
    }
  }
  const next = withDerivedStates({
    ...mission,
    version: mission.version + 1,
    nodes: mission.nodes.map((item) =>
      item.id === nodeId ? { ...item, state: 'done' } : item,
    ),
  })
  saveMission(next)
  releaseResourceLeasesForMission(missionId, node.locks)
  releaseSchedulerLeaseForMission(missionId)
  appendCoordinationEvent(missionId, 'node_completed', { nodeId, actor })
  return { ok: true, mission: next }
}

export function completeNode(
  missionId: string,
  nodeId: string,
  owner: string,
): { ok: boolean; reason?: string; mission?: Mission } {
  return completeMissionNode(missionId, nodeId, owner)
}

export function getMissionSnapshot(missionId: string): {
  mission: Mission | null
  preflight: PreflightResult | null
  events: ReturnType<typeof listCoordinationEvents>
  evidence: Array<{
    nodeId: string
    evidence: Mission['nodes'][number]['evidence']
  }>
} {
  const mission = getMission(missionId)
  return {
    mission,
    preflight: mission ? preflightMission(mission) : null,
    events: listCoordinationEvents(missionId),
    evidence:
      mission?.nodes.map((node) => ({
        nodeId: node.id,
        evidence: node.evidence,
      })) ?? [],
  }
}

export function retryMissionNode(
  missionId: string,
  nodeId: string,
  actor = 'conductor-ui',
): { ok: boolean; reason?: string; mission?: Mission } {
  const mission = getMission(missionId)
  if (!mission) return { ok: false, reason: 'Mission not found' }
  const node = mission.nodes.find((item) => item.id === nodeId)
  if (!node) return { ok: false, reason: 'Node not found' }
  if (!['failed', 'blocked', 'needs_input', 'retry_wait'].includes(node.state)) {
    return { ok: false, reason: `Node cannot be retried from ${node.state}` }
  }
  const next = withDerivedStates({
    ...mission,
    version: mission.version + 1,
    nodes: mission.nodes.map((item) =>
      item.id === nodeId
        ? { ...item, state: 'blocked_by_dependency', retries: item.retries + 1, claimedAt: null, dispatchedAt: null, evidence: { ...item.evidence, runStatus: null, outcome: null, summary: null } }
        : item,
    ),
  })
  saveMission(next)
  appendCoordinationEvent(missionId, 'node_retried', { nodeId, actor, retries: node.retries + 1 })
  return { ok: true, mission: next }
}

export function deleteCoordinatorMission(
  missionId: string,
  _actor = 'conductor-stop',
): { ok: boolean; reason?: string } {
  const mission = getMission(missionId)
  if (!mission) return { ok: false, reason: 'Mission not found' }
  deleteMission(missionId)
  return { ok: true }
}

export async function advanceMissionNodes(
  missionId: string,
  owner = 'reconciler',
  ttlMs = 60_000,
): Promise<{
  ok: boolean
  claimed: Array<string>
  dispatched: Array<string>
  reason?: string
}> {
  const mission = getMission(missionId)
  if (!mission)
    return {
      ok: false,
      claimed: [],
      dispatched: [],
      reason: 'Mission not found',
    }
  const hasWork = mission.nodes.some(
    (node) => node.state === 'ready' || node.state === 'leased',
  )
  if (!hasWork) return { ok: true, claimed: [], dispatched: [] }

  const dispatched: Array<string> = []

  // Dispatch any nodes that were previously claimed but not yet handed to Hermes.
  while (mission.nodes.some((node) => node.state === 'leased')) {
    const result = await dispatchNextClaimedNode(missionId, owner)
    if (!result.ok) break
    if (result.nodeId) dispatched.push(result.nodeId)
    else break
  }

  const claim = claimReadyNodes(missionId, owner, ttlMs)
  if (!claim.ok)
    return { ok: false, claimed: [], dispatched, reason: claim.reason }

  for (const nodeId of claim.nodeIds) {
    const result = await dispatchNextClaimedNode(missionId, owner)
    if (!result.ok)
      return {
        ok: false,
        claimed: claim.nodeIds,
        dispatched,
        reason: result.error,
      }
    if (result.nodeId) dispatched.push(result.nodeId)
  }
  return { ok: true, claimed: claim.nodeIds, dispatched }
}

export function getMissionMetrics(): {
  total: number
  active: number
  completed: number
  failed: number
  byState: Record<NodeState, number>
} {
  const missions = listMissions()
  const byState = {
    blocked_by_dependency: 0,
    ready: 0,
    leased: 0,
    dispatched: 0,
    running: 0,
    verifying: 0,
    review: 0,
    done: 0,
    blocked: 0,
    needs_input: 0,
    retry_wait: 0,
    failed: 0,
    cancelled: 0,
  } as Record<NodeState, number>
  let active = 0
  let completed = 0
  let failed = 0
  for (const mission of missions) {
    const states = mission.nodes.map((node) => node.state)
    if (states.some((state) => state === 'failed')) failed += 1
    else if (states.every((state) => state === 'done' || state === 'cancelled')) completed += 1
    else active += 1
    for (const state of states) byState[state] += 1
  }
  return { total: missions.length, active, completed, failed, byState }
}

export { listMissions }
