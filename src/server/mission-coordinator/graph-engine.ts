import {   MissionSchema  } from './types'
import type {Mission, MissionNode, NodeState} from './types';

export function validateMission(input: unknown): { mission: Mission | null; errors: Array<string> } {
  const parsed = MissionSchema.safeParse(input)
  if (!parsed.success) return { mission: null, errors: parsed.error.issues.map((issue) => issue.message) }
  const mission = parsed.data
  const ids = new Set<string>()
  const errors: Array<string> = []
  for (const node of mission.nodes) {
    if (ids.has(node.id)) errors.push(`Duplicate node id: ${node.id}`)
    ids.add(node.id)
  }
  for (const node of mission.nodes) {
    for (const dependency of node.dependsOn) {
      if (!ids.has(dependency)) errors.push(`Node ${node.id} depends on missing node ${dependency}`)
      if (dependency === node.id) errors.push(`Node ${node.id} cannot depend on itself`)
    }
  }
  if (errors.length === 0 && hasCycle(mission.nodes)) errors.push('Mission graph contains a dependency cycle')
  return { mission: errors.length ? null : mission, errors }
}

function hasCycle(nodes: Array<MissionNode>): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    for (const dependency of byId.get(id)?.dependsOn ?? []) if (visit(dependency)) return true
    visiting.delete(id)
    visited.add(id)
    return false
  }
  return nodes.some((node) => visit(node.id))
}

export function deriveReadyNodes(mission: Mission): { ready: Array<string>; waiting: Array<{ nodeId: string; dependsOn: Array<string> }> } {
  const byId = new Map(mission.nodes.map((node) => [node.id, node]))
  const ready: Array<string> = []
  const waiting: Array<{ nodeId: string; dependsOn: Array<string> }> = []
  for (const node of mission.nodes) {
    if (node.state !== 'blocked_by_dependency' && node.state !== 'ready') continue
    const unresolved = node.dependsOn.filter((id) => byId.get(id)?.state !== 'done')
    if (unresolved.length === 0) ready.push(node.id)
    else waiting.push({ nodeId: node.id, dependsOn: unresolved })
  }
  return { ready, waiting }
}

export function withDerivedStates(mission: Mission): Mission {
  const byId = new Map(mission.nodes.map((node) => [node.id, node]))
  const nodes = mission.nodes.map((node) => {
    if (!['blocked_by_dependency', 'ready'].includes(node.state)) return node
    const unresolved = node.dependsOn.some((id) => byId.get(id)?.state !== 'done')
    return { ...node, state: (unresolved ? 'blocked_by_dependency' : 'ready') as NodeState }
  })
  return { ...mission, nodes }
}

type ActiveLease = { missionId: string; owner: string }

export function findLockConflicts(
  mission: Mission,
  candidateIds: Array<string>,
  activeLeases?: Map<string, ActiveLease>,
): Array<{ nodeId: string; locks: Array<string>; reason: string }> {
  const selected = mission.nodes.filter((node) => candidateIds.includes(node.id))
  const conflicts: Array<{ nodeId: string; locks: Array<string>; reason: string }> = []
  const owners = new Map<string, string>()
  for (const node of selected) {
    for (const lock of node.locks) {
      const active = activeLeases?.get(lock)
      if (active) {
        const holder = active.missionId === mission.id ? 'another node in this mission' : `mission ${active.missionId}`
        conflicts.push({ nodeId: node.id, locks: [lock], reason: `Lock ${lock} is currently held by ${holder}` })
        continue
      }
      const existing = owners.get(lock)
      if (existing) conflicts.push({ nodeId: node.id, locks: [lock], reason: `Lock ${lock} is also requested by ${existing}` })
      else owners.set(lock, node.id)
    }
  }
  return conflicts
}
