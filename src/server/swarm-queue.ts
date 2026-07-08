/**
 * Priority task queue for the swarm.
 *
 * Operators dump work here from anywhere (UI, Discord !queue, voice) and the
 * drain step hands the highest-priority queued item to an idle worker via
 * the normal dispatch pipeline. The lifecycle sweep curls the drain endpoint
 * every 10 minutes, so queued work flows without anyone watching.
 *
 * Store: .runtime/swarm-queue.json (atomic write, capped history).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { getProfilesDir } from './claude-paths'
import { SWARM_CANONICAL_REPO } from './swarm-environment'
import { readSwarmRoster } from './swarm-roster'
import { automatedDispatchPausedUntil } from './swarm-runtime-reset'

export type QueuePriority = 1 | 2 | 3 // 1 = highest

export type QueueItem = {
  id: string
  task: string
  worker: string | null // null = auto-pick idle worker at drain time
  priority: QueuePriority
  status: 'queued' | 'dispatched' | 'done' | 'failed' | 'cancelled'
  createdAt: number
  dispatchedAt: number | null
  note: string | null
}

export function swarmQueuePath(): string {
  return (
    process.env.HERMES_SWARM_QUEUE_PATH ||
    join(SWARM_CANONICAL_REPO, '.runtime', 'swarm-queue.json')
  )
}

const MAX_ITEMS = 500
const MAX_TASK_CHARS = 4000

type QueueFile = { items: Array<QueueItem> }

function loadQueue(): QueueFile {
  try {
    if (existsSync(swarmQueuePath())) {
      const parsed = JSON.parse(
        readFileSync(swarmQueuePath(), 'utf8'),
      ) as QueueFile
      if (Array.isArray(parsed.items)) return parsed
    }
  } catch {
    /* corrupt store — start fresh */
  }
  return { items: [] }
}

function saveQueue(queue: QueueFile): void {
  // Cap history: keep all open items plus the most recent closed ones.
  const open = queue.items.filter(
    (i) => i.status === 'queued' || i.status === 'dispatched',
  )
  const closed = queue.items
    .filter((i) => i.status !== 'queued' && i.status !== 'dispatched')
    .slice(-Math.max(0, MAX_ITEMS - open.length))
  const next = { items: [...open, ...closed] }
  mkdirSync(dirname(swarmQueuePath()), { recursive: true })
  const tmp = `${swarmQueuePath()}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(next, null, 2))
  renameSync(tmp, swarmQueuePath())
}

export function listQueue(): Array<QueueItem> {
  return loadQueue().items.sort(
    (a, b) =>
      Number(a.status !== 'queued') - Number(b.status !== 'queued') ||
      a.priority - b.priority ||
      a.createdAt - b.createdAt,
  )
}

export function enqueueTask(input: {
  task: string
  worker?: string | null
  priority?: number
  note?: string | null
}): QueueItem {
  const task = input.task.trim().slice(0, MAX_TASK_CHARS)
  if (!task) throw new Error('task required')
  const priorityRaw = Math.round(input.priority ?? 2)
  const priority = (
    priorityRaw >= 1 && priorityRaw <= 3 ? priorityRaw : 2
  ) as QueuePriority
  const item: QueueItem = {
    id: `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    task,
    worker: input.worker?.trim() || null,
    priority,
    status: 'queued',
    createdAt: Date.now(),
    dispatchedAt: null,
    note: input.note?.trim() || null,
  }
  const queue = loadQueue()
  queue.items.push(item)
  saveQueue(queue)
  return item
}

export function updateQueueItem(
  id: string,
  patch: Partial<Pick<QueueItem, 'status' | 'note' | 'priority' | 'worker'>>,
): QueueItem | null {
  const queue = loadQueue()
  const item = queue.items.find((i) => i.id === id)
  if (!item) return null
  if (patch.status) {
    item.status = patch.status
    if (patch.status === 'dispatched') item.dispatchedAt = Date.now()
  }
  if (patch.note !== undefined) item.note = patch.note
  if (patch.priority) item.priority = patch.priority
  if (patch.worker !== undefined) item.worker = patch.worker
  saveQueue(queue)
  return item
}

// ---------------------------------------------------------------------------
// Drain — pick idle workers, return dispatch plan (dispatch happens in route)
// ---------------------------------------------------------------------------

function workerIsIdle(workerId: string): boolean {
  try {
    const runtimePath = join(getProfilesDir(), workerId, 'runtime.json')
    if (!existsSync(runtimePath)) return true
    const runtime = JSON.parse(readFileSync(runtimePath, 'utf8')) as {
      state?: string
      phase?: string
      currentTask?: string | null
    }
    const busy = ['executing', 'dispatching', 'planning', 'reviewing'].includes(
      runtime.state ?? 'idle',
    )
    // Stale runtime: a finished run can leave state=executing behind with
    // phase=done and no current task — that worker is actually free.
    if (busy && runtime.phase === 'done' && !runtime.currentTask) return true
    return !busy
  } catch {
    return false
  }
}

function knownWorkerIds(): Array<string> {
  try {
    const roster = readSwarmRoster()
    const ids = roster.workers.map((w) => w.id)
    if (ids.length) return ids
  } catch {
    /* fall through to profiles dir */
  }
  try {
    return readdirSync(getProfilesDir()).filter((n) => !n.startsWith('.'))
  } catch {
    return []
  }
}

// Orchestrator/manager roles coordinate; don't hand them queue grunt work.
const NON_EXECUTING = new Set(['orchestrator', 'strategist'])

/**
 * Close out dispatched items whose worker has gone idle again (the dispatch
 * pipeline records the real outcome in swarm-outcomes.jsonl; the queue only
 * needs to know the slot is free). 10-minute grace so we don't mark an item
 * done before its worker has even spun up.
 */
export function reconcileDispatched(): void {
  const queue = loadQueue()
  let changed = false
  for (const item of queue.items) {
    if (item.status !== 'dispatched' || !item.worker) continue
    const age = Date.now() - (item.dispatchedAt ?? item.createdAt)
    if (age < 10 * 60 * 1000) continue
    if (workerIsIdle(item.worker)) {
      item.status = 'done'
      changed = true
    }
  }
  if (changed) saveQueue(queue)
}

export type DrainPlan = {
  item: QueueItem
  workerId: string
}

/**
 * Compute which queued items can dispatch right now. Marks nothing — the
 * caller flips items to 'dispatched' only after dispatch actually succeeds.
 */
export function planQueueDrain(maxDispatches = 2): Array<DrainPlan> {
  // Respect the post-Clear-All pause: operator just wiped the board.
  if (automatedDispatchPausedUntil()) return []
  reconcileDispatched()
  const queued = listQueue().filter((i) => i.status === 'queued')
  if (!queued.length) return []
  const busy = new Set<string>()
  const plans: Array<DrainPlan> = []
  for (const item of queued) {
    if (plans.length >= maxDispatches) break
    if (item.worker) {
      if (!busy.has(item.worker) && workerIsIdle(item.worker)) {
        plans.push({ item, workerId: item.worker })
        busy.add(item.worker)
      }
      continue
    }
    const candidate = knownWorkerIds().find(
      (id) => !NON_EXECUTING.has(id) && !busy.has(id) && workerIsIdle(id),
    )
    if (candidate) {
      plans.push({ item, workerId: candidate })
      busy.add(candidate)
    }
  }
  return plans
}
