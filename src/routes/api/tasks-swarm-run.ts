/**
 * Tasks → Swarm automation runner.
 *
 * Scans the Tasks board for tasks that have a swarm assignee (builder, km-agent,
 * ops-watch, orchestrator, reviewer, workspace) and dispatches them to the
 * matching swarm worker, marking the board task as in_progress.
 *
 * Concurrency is bounded by each worker's `maxConcurrentTasks` (from the swarm
 * roster, default 1). At most `capacity` tasks per worker may be in_progress at
 * once; everything else waits in `todo` until a slot frees up. This keeps the
 * board honest: "running" means a worker is actually on it, not that it was
 * blindly fanned out to every eligible card.
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { listTasks, updateTask, type TaskColumn } from '../../server/tasks-store'
import { createOrUpdateMission, readStore } from '../../server/swarm-missions'
import { SWARM_WORKER_BY_ASSIGNEE } from '../../lib/tasks-api'
import { readSwarmRoster } from '../../server/swarm-roster'
import type { SwarmMission } from '../../server/swarm-missions'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

function isSwarmAssignee(assignee: string | null | undefined): assignee is string {
  return Boolean(assignee && SWARM_WORKER_BY_ASSIGNEE[assignee])
}

function missionIsDone(mission: SwarmMission | undefined): boolean {
  if (!mission) return false
  if (mission.state === 'complete') return true
  return mission.assignments.every(
    (a) => a.state === 'checkpointed' || a.state === 'done' || a.state === 'cancelled',
  )
}

// Per-worker concurrency capacity from the swarm roster.
function capacityByWorker(): Map<string, number> {
  const roster = readSwarmRoster()
  const cap = new Map<string, number>()
  for (const w of roster.workers) {
    cap.set(w.id, Math.max(1, w.maxConcurrentTasks ?? 1))
  }
  for (const assignee of Object.keys(SWARM_WORKER_BY_ASSIGNEE)) {
    if (!cap.has(assignee)) cap.set(assignee, 1)
  }
  return cap
}

function findMission(store: { missions: SwarmMission[] }, id: string | null | undefined) {
  if (!id) return undefined
  return store.missions.find((mm) => mm.id === id)
}

/**
 * Core dispatch routine. Rebalances over-capacity in_progress tasks back to the
 * queue and dispatches eligible tasks up to each worker's concurrency limit.
 * Exported so the dev server can drive it on a timer (auto-dispatch loop).
 */
export async function runSwarmDispatch(opts: { onlyReady?: boolean; dryRun?: boolean } = {}) {
  const onlyReady = opts.onlyReady === true
  const dryRun = opts.dryRun === true

  const all = listTasks({ includeDone: true })
  const store = readStore()
  const cap = capacityByWorker()

  // Count tasks already occupying a worker's in_progress slot. Skip any whose
  // mission is already done (slot is effectively free).
  const activeByWorker = new Map<string, number>()
  for (const t of all) {
    if (t.column === 'in_progress' && isSwarmAssignee(t.assignee)) {
      const wid = SWARM_WORKER_BY_ASSIGNEE[t.assignee as string]
      const m = findMission(store, t.session_id)
      if (missionIsDone(m)) continue
      activeByWorker.set(wid, (activeByWorker.get(wid) ?? 0) + 1)
    }
  }

  // Rebalance: in_progress tasks beyond a worker's capacity go back to `todo`
  // so the board reflects reality (only `capacity` per worker run).
  const rebalanced: Array<{ taskId: string; workerId: string }> = []
  const keptInProgress = new Map<string, number>()
  for (const t of all) {
    if (t.column !== 'in_progress' || !isSwarmAssignee(t.assignee)) continue
    const wid = SWARM_WORKER_BY_ASSIGNEE[t.assignee as string]
    const used = keptInProgress.get(wid) ?? 0
    const limit = cap.get(wid) ?? 1
    if (used >= limit) {
      if (!dryRun) updateTask(t.id, { column: 'todo' as TaskColumn })
      rebalanced.push({ taskId: t.id, workerId: wid })
    } else {
      keptInProgress.set(wid, used + 1)
    }
  }
  for (const [wid, n] of keptInProgress) activeByWorker.set(wid, n)

  const eligible = all.filter((t) => {
    if (!isSwarmAssignee(t.assignee)) return false
    if (t.column === 'done' || t.column === 'blocked') return false
    if (onlyReady && t.column !== 'todo' && t.column !== 'backlog') return false
    if (t.session_id) {
      const m = findMission(store, t.session_id)
      if (m && !missionIsDone(m)) return false
    }
    return true
  })

  const skipped = all.filter(
    (t) => isSwarmAssignee(t.assignee) && !eligible.includes(t),
  ).length
  const dispatched: Array<{ taskId: string; missionId: string; workerId: string; title: string }> = []

  const tryDispatch = (task: (typeof all)[number]) => {
    const workerId = SWARM_WORKER_BY_ASSIGNEE[task.assignee as string]
    const used = activeByWorker.get(workerId) ?? 0
    const limit = cap.get(workerId) ?? 1
    if (used >= limit) return false
    if (!dryRun) {
      const res = createOrUpdateMission({
        title: `Board: ${task.title}`.slice(0, 140),
        assignments: [
          {
            workerId,
            task: `${task.title}${task.description ? `\n\n${task.description}` : ''}`,
            rationale: `Auto-run from Tasks board (task ${task.id})`,
            reviewRequired: task.column === 'review',
          },
        ],
      })
      updateTask(task.id, { column: 'in_progress', session_id: res.id })
      activeByWorker.set(workerId, used + 1)
      dispatched.push({ taskId: task.id, missionId: res.id, workerId, title: task.title })
    } else {
      dispatched.push({ taskId: task.id, missionId: '(dry)', workerId, title: task.title })
    }
    return true
  }

  for (const task of eligible) tryDispatch(task)

  return {
    ok: true,
    scanned: all.length,
    eligible: eligible.length,
    dispatched: dispatched.length,
    rebalancedToTodo: rebalanced.length,
    skipped,
    dryRun,
  }
}

export const Route = createFileRoute('/api/tasks-swarm-run')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)
        const all = listTasks({ includeDone: true })
        const store = readStore()
        const linked = all.filter((t) => t.session_id)
        const live = linked.filter((t) => {
          const m = findMission(store, t.session_id)
          return m && !missionIsDone(m)
        })
        return jsonResponse({ linked: linked.length, liveMissions: live.length, total: all.length })
      },

      POST: async ({ request }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)
        try {
          const body = (await request.json().catch(() => ({}))) as {
            onlyReady?: boolean
            dryRun?: boolean
          }
          const result = await runSwarmDispatch(body)
          return jsonResponse(result)
        } catch (err) {
          return jsonResponse({ error: String(err) }, 500)
        }
      },
    },
  },
})
