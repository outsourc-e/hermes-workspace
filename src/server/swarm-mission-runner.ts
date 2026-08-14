/**
 * Server-side swarm mission runner.
 *
 * Reads eligible missions from the store, sends each assignment's prompt to the
 * corresponding worker's tmux pane, and marks it dispatched so the board/sync
 * reflect real progress — all WITHOUT the conductor UI open.
 *
 * IMPORTANT: every tmux call is async (execFile, not execFileSync). The dev
 * server is single-threaded; a synchronous child_process spawn inside the tick
 * would block the event loop and stall every in-flight HTTP request (the exact
 * "requests stuck in pending" symptom). This module never blocks.
 *
 * Concurrency is bounded by each worker's maxConcurrentTasks (roster).
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readSwarmRoster } from './swarm-roster'
import { readStore, markMissionAssignmentDispatched } from './swarm-missions'
import { SWARM_WORKER_BY_ASSIGNEE } from '../lib/tasks-api'

const execFileAsync = promisify(execFile)
const TMUX_TIMEOUT_MS = 3000

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

async function workerPaneReady(workerId: string): Promise<boolean> {
  try {
    await execFileAsync('tmux', ['has-session', '-t', tmuxSessionFor(workerId)], {
      timeout: TMUX_TIMEOUT_MS,
    })
    return true
  } catch {
    return false
  }
}

async function activeByWorker(): Promise<Map<string, number>> {
  const store = readStore()
  const cap = capacityByWorker()
  const active = new Map<string, number>()
  for (const m of store.missions) {
    if (m.state === 'complete' || m.state === 'cancelled') continue
    for (const a of m.assignments) {
      if (a.state === 'dispatched' || a.state === 'checkpointed') {
        const wid = a.workerId
        if (await workerPaneReady(wid)) active.set(wid, (active.get(wid) ?? 0) + 1)
      }
    }
  }
  return active
}

async function sendToWorker(workerId: string, task: string): Promise<boolean> {
  if (!(await workerPaneReady(workerId))) return false
  const prompt = task.replace(/"/g, '\\"').replace(/\n/g, ' ').slice(0, 4000)
  try {
    await execFileAsync(
      'tmux',
      ['send-keys', '-t', tmuxSessionFor(workerId), `"""${prompt}"""`, 'Enter'],
      { timeout: TMUX_TIMEOUT_MS },
    )
    return true
  } catch {
    return false
  }
}

let isRunning = false

export async function runSwarmMissionLoop(): Promise<{
  ok: boolean
  dispatched: number
  skipped: number
}> {
  if (isRunning) return { ok: true, dispatched: 0, skipped: 0 }
  isRunning = true
  const cap = capacityByWorker()
  const active = await activeByWorker()
  const store = readStore()
  let dispatched = 0
  let skipped = 0

  try {
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
        if (await sendToWorker(wid, a.task)) {
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
  } finally {
    isRunning = false
  }

  return { ok: true, dispatched, skipped }
}
