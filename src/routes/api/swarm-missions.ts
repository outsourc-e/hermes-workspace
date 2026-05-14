import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { SWARM_MISSIONS_PATH, cancelSwarmAssignment, cancelSwarmMission, getSwarmMission, listSwarmMissions, listSwarmReports } from '../../server/swarm-missions'
import { getProfilesDir } from '../../server/claude-paths'

type CancelPostBody = {
  action?: unknown
  missionId?: unknown
  assignmentId?: unknown
  workerId?: unknown
  reason?: unknown
  actor?: unknown
  resetWorkers?: unknown
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function resetWorkerRuntime(workerId: string, reason: string, actor: string): { workerId: string; ok: boolean; error?: string } {
  if (!/^swarm\d+$/i.test(workerId)) return { workerId, ok: false, error: 'invalid worker id' }
  const runtimePath = join(getProfilesDir(), workerId, 'runtime.json')
  if (!existsSync(runtimePath)) return { workerId, ok: true }
  try {
    const raw = JSON.parse(readFileSync(runtimePath, 'utf-8')) as Record<string, unknown>
    const next = {
      ...raw,
      state: 'idle',
      phase: 'cancelled',
      currentTask: null,
      currentMissionId: null,
      currentAssignmentId: null,
      checkpointStatus: 'none',
      needsHuman: false,
      blockedReason: null,
      activeTool: null,
      checkpointRaw: null,
      orchestratorProcessedRaw: null,
      lastSummary: `Cancelled by ${actor}: ${reason}`,
      lastControlMessage: `Cancelled by ${actor}: ${reason}`,
      nextAction: 'Idle. Do not continue cancelled Workspace swarm work unless explicitly re-dispatched.',
      cancelledAt: new Date().toISOString(),
      cancellationReason: reason,
      cancelledBy: actor,
    }
    const tmp = `${runtimePath}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n')
    renameSync(tmp, runtimePath)
    return { workerId, ok: true }
  } catch (err) {
    return { workerId, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export const Route = createFileRoute('/api/swarm-missions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const id = url.searchParams.get('id')?.trim()
        const limitRaw = Number(url.searchParams.get('limit') ?? 20)
        const limit = Number.isFinite(limitRaw) ? limitRaw : 20
        return json({
          ok: true,
          path: SWARM_MISSIONS_PATH,
          mission: id ? getSwarmMission(id) : null,
          missions: id ? [] : listSwarmMissions(limit),
          reports: id ? listSwarmReports({ missionId: id, limit }) : [],
          fetchedAt: Date.now(),
        })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: CancelPostBody
        try {
          body = await request.json() as CancelPostBody
        } catch {
          return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }
        const action = cleanString(body.action)
        if (action !== 'cancel') return json({ ok: false, error: 'Unsupported action' }, { status: 400 })
        const missionId = cleanString(body.missionId)
        if (!missionId) return json({ ok: false, error: 'missionId required' }, { status: 400 })
        const actor = cleanString(body.actor) ?? 'workspace-cancel'
        const reason = cleanString(body.reason) ?? 'Cancelled from Workspace Swarm'
        const assignmentId = cleanString(body.assignmentId)
        const workerId = cleanString(body.workerId)
        const result = assignmentId || workerId
          ? cancelSwarmAssignment({ missionId, assignmentId, workerId, actor, reason })
          : cancelSwarmMission({ missionId, actor, reason })
        if (!result) return json({ ok: false, error: 'Mission or assignment not found' }, { status: 404 })

        const workerIds = new Set<string>()
        if ('assignment' in result) workerIds.add(result.assignment.workerId)
        if ('cancelledAssignmentIds' in result) {
          const cancelledIds = new Set(result.cancelledAssignmentIds)
          for (const assignment of result.mission.assignments) {
            if (cancelledIds.has(assignment.id)) workerIds.add(assignment.workerId)
          }
        }
        if (workerId && /^swarm\d+$/i.test(workerId)) workerIds.add(workerId)
        const runtimeResets = body.resetWorkers !== false
          ? Array.from(workerIds).map((id) => resetWorkerRuntime(id, reason, actor))
          : []

        return json({
          ok: true,
          action,
          result,
          runtimeResets,
          cancelledAt: Date.now(),
        })
      },
    },
  },
})
