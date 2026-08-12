import { existsSync, readFileSync } from 'node:fs'
import { z } from 'zod'
import { createMission } from './coordinator'
import type { Mission } from './types'

const LegacyStoreSchema = z.object({ missions: z.array(z.unknown()).default([]) })

export type MigrationReport = {
  source: string
  dryRun: boolean
  discovered: number
  imported: number
  skipped: number
  errors: Array<string>
}

function readLegacy(source: string): Array<unknown> {
  if (!existsSync(source)) return []
  try {
    const parsed = LegacyStoreSchema.safeParse(JSON.parse(readFileSync(source, 'utf8')))
    return parsed.success ? parsed.data.missions : []
  } catch {
    return []
  }
}

function convertLegacy(value: unknown, index: number): Mission | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id : `legacy-${index}`
  const title = typeof row.title === 'string' ? row.title : 'Imported legacy mission'
  const assignments = Array.isArray(row.assignments) ? row.assignments : []
  const nodes = assignments.flatMap((assignment, assignmentIndex) => {
    if (!assignment || typeof assignment !== 'object') return []
    const item = assignment as Record<string, unknown>
    const workerId = typeof item.workerId === 'string' ? item.workerId : 'orchestrator'
    const task = typeof item.task === 'string' ? item.task : ''
    if (!task) return []
    return [{
      id: typeof item.id === 'string' ? item.id : `assignment-${assignmentIndex}`,
      title: task.slice(0, 120),
      role: workerId,
      objective: task,
      dependsOn: Array.isArray(item.dependsOn) ? item.dependsOn.filter((dependencyId): dependencyId is string => typeof dependencyId === 'string') : [],
      locks: [],
      readOnly: false,
      state: 'blocked_by_dependency' as const,
      hermesTaskId: typeof item.hermesTaskId === 'string' ? item.hermesTaskId : null,
      claimedAt: null,
      dispatchedAt: null,
      retries: 0,
      evidence: { runId: null, runStatus: null, outcome: null, summary: null, checkpoint: null, verifiedAt: null },
    }]
  })
  if (!nodes.length) return null
  return { id, title, version: 1, maxParallelism: 1, nodes }
}

export function migrateLegacyMissions(source: string, dryRun = true): MigrationReport {
  const legacy = readLegacy(source)
  const report: MigrationReport = { source, dryRun, discovered: legacy.length, imported: 0, skipped: 0, errors: [] }
  for (const [index, value] of legacy.entries()) {
    const mission = convertLegacy(value, index)
    if (!mission) { report.skipped += 1; continue }
    if (dryRun) { report.imported += 1; continue }
    const result = createMission(mission)
    if (result.ok) report.imported += 1
    else { report.skipped += 1; report.errors.push(`${mission.id}: ${result.errors.join('; ')}`) }
  }
  return report
}
