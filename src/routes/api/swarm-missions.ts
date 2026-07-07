import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  SWARM_MISSIONS_PATH,
  cancelSwarmAssignment,
  cancelSwarmMission,
  cancelAllSwarmMissions,
  clearAllBlocked,
  getSwarmMission,
  listSwarmMissions,
  listSwarmReports,
  markMissionAssignmentReady,
  unblockMissionAssignment,
} from '../../server/swarm-missions'
import { resetSwarmWorkerRuntime } from '../../server/swarm-runtime-reset'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function resolveTmuxBin(): string {
  const override = process.env.HERMES_TMUX_BIN || process.env.CLAUDE_TMUX_BIN
  if (override) return override
  for (const c of [
    '/opt/homebrew/bin/tmux',
    '/usr/local/bin/tmux',
    '/usr/bin/tmux',
    join(homedir(), '.local', 'bin', 'tmux'),
  ]) {
    if (existsSync(c)) return c
  }
  return 'tmux'
}

/** Kill a worker's persistent tmux session, if any. Best-effort. */
function killSwarmTmuxSession(workerId: string): Promise<void> {
  return new Promise((resolve) => {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(workerId)) return resolve()
    execFile(
      resolveTmuxBin(),
      ['kill-session', '-t', `swarm-${workerId}`],
      () => resolve(),
    )
  })
}

type CancelPostBody = {
  action?: unknown
  missionId?: unknown
  assignmentId?: unknown
  workerId?: unknown
  reason?: unknown
  actor?: unknown
  resetWorkers?: unknown
  resolution?: unknown
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
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
          body = (await request.json()) as CancelPostBody
        } catch {
          return json(
            { ok: false, error: 'Invalid JSON body' },
            { status: 400 },
          )
        }
        const action = cleanString(body.action)
        if (action === 'unblock') {
          const missionId = cleanString(body.missionId)
          const assignmentId = cleanString(body.assignmentId)
          const resolution = cleanString(body.resolution)
          if (!missionId || !assignmentId)
            return json(
              { ok: false, error: 'missionId and assignmentId required' },
              { status: 400 },
            )
          if (resolution !== 'retry' && resolution !== 'dismiss')
            return json(
              { ok: false, error: "resolution must be 'retry' or 'dismiss'" },
              { status: 400 },
            )
          const result = unblockMissionAssignment({
            missionId,
            assignmentId,
            resolution,
          })
          if (!result)
            return json(
              { ok: false, error: 'Mission or assignment not found' },
              { status: 404 },
            )
          return json({
            ok: true,
            action,
            resolution,
            changed: result.changed,
            mission: result.mission,
            assignment: result.assignment,
            redispatch:
              resolution === 'retry' && result.changed
                ? {
                    workerId: result.assignment.workerId,
                    task: result.assignment.task,
                  }
                : null,
          })
        }
        if (action === 'mark_ready_for_eric') {
          const missionId = cleanString(body.missionId)
          const assignmentId = cleanString(body.assignmentId)
          if (!missionId || !assignmentId)
            return json(
              { ok: false, error: 'missionId and assignmentId required' },
              { status: 400 },
            )
          const result = markMissionAssignmentReady({
            missionId,
            assignmentId,
          })
          if (!result)
            return json(
              { ok: false, error: 'Mission or assignment not found' },
              { status: 404 },
            )
          return json({
            ok: true,
            action,
            changed: result.changed,
            mission: result.mission,
            assignment: result.assignment,
          })
        }
        if (action === 'clear-blocked') {
          const missionId = cleanString(body.missionId)
          const result = clearAllBlocked(
            missionId ? { missionId } : undefined,
          )
          return json({
            ok: true,
            action,
            cleared: result.cleared,
            assignmentIds: result.assignmentIds,
          })
        }
        if (action === 'cancel-all') {
          const actor = cleanString(body.actor) ?? 'workspace-clear-all'
          const reason =
            cleanString(body.reason) ?? 'Cleared all from Workspace Swarm'
          // 1. Cancel every active assignment across all missions.
          const cancelled = cancelAllSwarmMissions({ actor, reason })
          // 2. Wipe the blocked/needs-input board.
          const cleared = clearAllBlocked()
          // 3. Stop each worker: reset its runtime state and kill its live
          //    tmux session so nothing keeps executing.
          const affected = new Set<string>([
            ...cancelled.workerIds,
            ...listSwarmMissions(100).flatMap((m) =>
              m.assignments.map((a) => a.workerId),
            ),
          ])
          for (const id of affected) {
            try {
              resetSwarmWorkerRuntime(id, { actor, reason })
            } catch {
              /* best-effort */
            }
            await killSwarmTmuxSession(id)
          }
          return json({
            ok: true,
            action,
            missionsCancelled: cancelled.missionsCancelled,
            assignmentsCancelled: cancelled.assignmentsCancelled,
            blockedCleared: cleared.cleared,
            workersReset: [...affected],
          })
        }
        if (action !== 'cancel')
          return json(
            { ok: false, error: 'Unsupported action' },
            { status: 400 },
          )
        const missionId = cleanString(body.missionId)
        if (!missionId)
          return json(
            { ok: false, error: 'missionId required' },
            { status: 400 },
          )
        const actor = cleanString(body.actor) ?? 'workspace-cancel'
        const reason =
          cleanString(body.reason) ?? 'Cancelled from Workspace Swarm'
        const assignmentId = cleanString(body.assignmentId)
        const workerId = cleanString(body.workerId)
        const result =
          assignmentId || workerId
            ? cancelSwarmAssignment({
                missionId,
                assignmentId,
                workerId,
                actor,
                reason,
              })
            : cancelSwarmMission({ missionId, actor, reason })
        if (!result)
          return json(
            { ok: false, error: 'Mission or assignment not found' },
            { status: 404 },
          )

        const workerIds = new Set<string>()
        if ('assignment' in result) workerIds.add(result.assignment.workerId)
        if ('cancelledAssignmentIds' in result) {
          const cancelledIds = new Set(result.cancelledAssignmentIds)
          for (const assignment of result.mission.assignments) {
            if (cancelledIds.has(assignment.id))
              workerIds.add(assignment.workerId)
          }
        }
        if (workerId) workerIds.add(workerId)
        const runtimeResets =
          body.resetWorkers !== false
            ? Array.from(workerIds).map((id) =>
                resetSwarmWorkerRuntime(id, { actor, reason }),
              )
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
