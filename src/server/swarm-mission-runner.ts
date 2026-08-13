/**
 * Server-side swarm mission runner.
 *
 * The Tasks board flow (tasks-swarm-run) creates missions and marks cards
 * in_progress, but actual execution was previously driven only by the
 * conductor UI (use-mission-orchestrator, a frontend React hook). This loop
 * runs headless on the dev server: it reads eligible missions from the store,
 * sends each assignment's prompt to the corresponding worker's tmux pane, and
 * marks the assignment dispatched so the board/sync reflect real progress.
 *
 * Concurrency is bounded by each worker's maxConcurrentTasks (roster).
 */
import { execFileSync } from 'node:child_process'
import { readSwarmRoster } from './swarm-roster'
import {
  readStore,
  markMissionAssignmentDispatched,
} from './swarm-missions'
import { SWARM_WORKER_BY_ASSIGNEE } from '../lib/tasks-api'

function capacityByWorker(): Map<string, number> {
  const roster = readSwarmRoster()
  const cap = new Map<string, number>()
  for (const w of roster.workers) cap.set(w.id, Math.max(1, w.maxConcurrentTasks ?? 1))
  for (const a of Object.keys(SWARM_WORKER_BY_ASSIGNEE)) if (!cap.has(a)) cap.set(a, 1)
  return cap
}

function tmuxSessionFor(workerId: string): string {
  return `swarm-${workerId}`
}

function workerPaneReady(workerId: string): boolean {
  try {
    execFileSync('tmux', ['has-session', '-t', tmuxSessionFor(workerId)], {
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

function activeByWorker(): Map<string, number> {
  const store = readStore()
  const cap = capacityByWorker()
  const active = new Map<string, number>()
  for (const m of store.missions) {
    if (m.state === 'complete' || m.state === 'cancelled') continue
    for (const a of m.assignments) {
      if (a.state === 'dispatched' || a.state === 'checkpointed') {
        const wid = a.workerId
        // Only count toward capacity if the worker pane is still alive.
        if (workerPaneReady(wid)) active.set(wid, (active.get(wid) ?? 0) + 1)
      }
    }
  }
  return active
}

function sendToWorker(workerId: string, task: string): boolean {
  if (!workerPaneReady(workerId)) return false
  const prompt = task.replace(/"/g, '\\"').replace(/\n/g, ' ').slice(0, 4000)
  try {
    execFileSync(
      'tmux',
      ['send-keys', '-t', tmuxSessionFor(workerId), `"""${prompt}"""`, 'Enter'],
      { stdio: 'ignore', timeout: 5000 },
    )
    return true
  } catch {
    return false
  }
}

export function runSwarmMissionLoop(): {
  ok: boolean
  dispatched: number
  skipped: number
} {
  const cap = capacityByWorker()
  const active = activeByWorker()
  const store = readStore()
  let dispatched = 0
  let skipped = 0

  for (const m of store.missions) {
    if (m.state === 'complete' || m.state === 'cancelled') continue
    for (const a of m.assignments) {
      if (a.state !== 'queued') continue
      const wid = a.workerId
      const used = active.get(wid) ?? 0
      const limit = cap.get(wid) ?? 1
      if (used >= limit) {
        skipped++
        continue
      }
      if (sendToWorker(wid, a.task)) {
        markMissionAssignmentDispatched({
          missionId: m.id,
          workerId: wid,
          task: a.task,
          source: 'swarm-mission-runner',
          author: 'aurora',
        })
        active.set(wid, used + 1)
        dispatched++
      } else {
        skipped++
      }
    }
  }

  return { ok: true, dispatched, skipped }
}

