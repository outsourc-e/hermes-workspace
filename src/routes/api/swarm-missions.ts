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
import {
  existsSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function swarmProfilesDir(): string {
  const base = process.env.HERMES_HOME ?? process.env.CLAUDE_HOME
  if (base) {
    const parts = base.split('/').filter(Boolean)
    if (parts.length >= 2 && parts.at(-2) === 'profiles') {
      return base.split('/').slice(0, -1).join('/')
    }
    return join(base, 'profiles')
  }
  return join(homedir(), '.hermes', 'profiles')
}

/** All worker profile ids present on disk. */
function listWorkerProfileIds(): Array<string> {
  try {
    return readdirSync(swarmProfilesDir(), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((n) => /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(n))
  } catch {
    return []
  }
}

/**
 * Clear a worker's chat/session history for a truly fresh start. Moves its
 * SQLite session store aside (single recoverable `.cleared.bak`, overwriting
 * any prior backup) — hermes recreates an empty state.db on next launch. This
 * avoids FTS5 corruption from a partial in-place delete. Best-effort.
 */
function clearWorkerChatHistory(workerId: string): void {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(workerId)) return
  const dir = join(swarmProfilesDir(), workerId)
  const db = join(dir, 'state.db')
  if (existsSync(db)) {
    const bak = `${db}.cleared.bak`
    try {
      if (existsSync(bak)) rmSync(bak, { force: true })
      renameSync(db, bak)
      // SQLite WAL/SHM sidecars would otherwise re-attach to a stale db.
      for (const side of ['-wal', '-shm']) {
        const p = `${db}${side}`
        if (existsSync(p)) rmSync(p, { force: true })
      }
    } catch {
      /* best-effort */
    }
  }
  // The log files are the "agent logs" surfaced in the TUI/runtime view
  // (swarm-runtime reads logs/agent.log). Clearing state.db alone leaves the
  // visible chat log intact — truncate the log files too for a real fresh start.
  const logsDir = join(dir, 'logs')
  for (const name of [
    'agent.log',
    'errors.log',
    'tui_gateway_crash.log',
    'swarm-dispatch-startup.log',
  ]) {
    const p = join(logsDir, name)
    try {
      if (existsSync(p)) writeFileSync(p, '')
    } catch {
      /* best-effort */
    }
  }
}

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

/**
 * Kill in-flight oneshot dispatch processes. Every swarm oneshot runs
 * `hermes chat -q … --source swarm-dispatch`, so pkill on that marker stops
 * any task still executing without touching unrelated hermes processes (the
 * gateway, TUI sessions already killed via tmux, the user's own chats).
 * pkill is macOS/Linux; no-ops elsewhere.
 */
function killInflightDispatches(): Promise<void> {
  return new Promise((resolve) => {
    execFile('pkill', ['-f', '--source swarm-dispatch'], () => resolve())
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
          // Kill any in-flight oneshot dispatch processes — a running
          // `hermes chat -q ... --source swarm-dispatch` child keeps executing
          // after the mission is cancelled unless it's killed. This is what
          // left "tasks still running" after Clear All.
          await killInflightDispatches()
          // Fresh session: kill sessions + clear chat history + logs for EVERY
          // worker profile on disk, not just those with active tasks.
          const allWorkerIds = listWorkerProfileIds()
          for (const id of allWorkerIds) {
            await killSwarmTmuxSession(id)
            clearWorkerChatHistory(id)
          }
          return json({
            ok: true,
            action,
            missionsCancelled: cancelled.missionsCancelled,
            assignmentsCancelled: cancelled.assignmentsCancelled,
            blockedCleared: cleared.cleared,
            workersReset: [...affected],
            chatsCleared: allWorkerIds,
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
