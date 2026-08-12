import type { MissionNode } from '@/server/mission-coordinator/types'
import type { Evidence } from './types'

export const EMPTY_EVIDENCE: Evidence = {
  runId: null,
  runStatus: null,
  outcome: null,
  summary: null,
  checkpoint: null,
  verifiedAt: null,
}

export function evidenceFor(node: MissionNode): Evidence {
  return { ...EMPTY_EVIDENCE, ...node.evidence }
}

export function computeLevels(nodes: Array<MissionNode>): Map<string, number> {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const levels = new Map<string, number>()
  const visiting = new Set<string>()

  function visit(id: string): number {
    if (levels.has(id)) return levels.get(id)!
    if (visiting.has(id)) return 0
    visiting.add(id)
    const node = byId.get(id)
    if (!node) return 0
    if (node.dependsOn.length === 0) {
      levels.set(id, 0)
      return 0
    }
    const parentLevels = node.dependsOn.map((parentId) => visit(parentId))
    const level = Math.max(...parentLevels) + 1
    levels.set(id, level)
    return level
  }

  for (const node of nodes) visit(node.id)
  return levels
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
