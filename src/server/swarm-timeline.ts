/**
 * Unified swarm timeline.
 *
 * Merges every "something happened" source into one time-sorted feed so the
 * operator gets a single answer to "what happened while I was gone":
 *   - mission events        (.runtime/swarm-missions.json → missions[].events)
 *   - dispatch outcomes     (.runtime/swarm-outcomes.jsonl)
 *   - scheduled agent runs  (~/.hermes/logs/swarm-scheduled-*.jsonl)
 *   - lifecycle sweep + branch guard (~/.hermes/memory/swarm/lifecycle-logs/*.jsonl)
 *
 * Read-only aggregation — no store of its own; each reader is best-effort so
 * a corrupt file never takes down the feed.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { SWARM_MISSIONS_PATH } from './swarm-missions'
import { readSwarmOutcomes } from './swarm-outcomes'

export type TimelineEntry = {
  at: number
  source: 'mission' | 'outcome' | 'scheduled' | 'sweep'
  type: string
  workerId: string | null
  missionId: string | null
  message: string
}

const SCHEDULED_LOG_DIR = join(homedir(), '.hermes', 'logs')
const SWEEP_LOG_DIR = join(
  homedir(),
  '.hermes',
  'memory',
  'swarm',
  'lifecycle-logs',
)

function clip(text: unknown, max = 200): string {
  const t = typeof text === 'string' ? text.trim() : ''
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

function readMissionEvents(): Array<TimelineEntry> {
  try {
    if (!existsSync(SWARM_MISSIONS_PATH)) return []
    const store = JSON.parse(readFileSync(SWARM_MISSIONS_PATH, 'utf8')) as {
      missions?: Array<{
        id: string
        events?: Array<{
          type?: string
          at?: number
          message?: string
          workerId?: string
        }>
      }>
    }
    const out: Array<TimelineEntry> = []
    for (const mission of store.missions ?? []) {
      for (const evt of mission.events ?? []) {
        if (!evt.at) continue
        out.push({
          at: evt.at,
          source: 'mission',
          type: evt.type ?? 'event',
          workerId: evt.workerId ?? null,
          missionId: mission.id,
          message: clip(evt.message),
        })
      }
    }
    return out
  } catch {
    return []
  }
}

function readOutcomeEvents(): Array<TimelineEntry> {
  return readSwarmOutcomes(500).map((r) => ({
    at: r.at,
    source: 'outcome' as const,
    type: r.blocked ? 'blocked' : r.ok ? 'completed' : 'failed',
    workerId: r.workerId,
    missionId: null,
    message: clip(
      r.blocked
        ? `${r.task} — ${r.blockReason ?? 'blocked'}`
        : `${r.task} (${r.mode}, ${r.tier ?? 'default'} tier, ${Math.round(r.durationMs / 1000)}s)`,
    ),
  }))
}

function readJsonlDir(
  dir: string,
  maxFiles: number,
): Array<Record<string, unknown>> {
  try {
    if (!existsSync(dir)) return []
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .sort()
      .slice(-maxFiles)
    const rows: Array<Record<string, unknown>> = []
    for (const file of files) {
      const lines = readFileSync(join(dir, file), 'utf8').split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          rows.push(JSON.parse(line) as Record<string, unknown>)
        } catch {
          /* skip corrupt line */
        }
      }
    }
    return rows
  } catch {
    return []
  }
}

function readScheduledEvents(): Array<TimelineEntry> {
  const out: Array<TimelineEntry> = []
  for (const row of readJsonlDir(SCHEDULED_LOG_DIR, 3)) {
    // Only swarm-scheduled-*.jsonl rows have {at, worker, response}.
    const at = Date.parse(String(row.at ?? ''))
    const worker = typeof row.worker === 'string' ? row.worker : null
    if (!Number.isFinite(at) || !worker) continue
    const response = row.response as
      | { missionId?: string; mission?: { title?: string } }
      | undefined
    out.push({
      at,
      source: 'scheduled',
      type: 'scheduled_run',
      workerId: worker,
      missionId: response?.missionId ?? null,
      message: clip(response?.mission?.title ?? `Scheduled run for ${worker}`),
    })
  }
  return out
}

function readSweepEvents(): Array<TimelineEntry> {
  const out: Array<TimelineEntry> = []
  for (const row of readJsonlDir(SWEEP_LOG_DIR, 2)) {
    const guard = row.branch_guard as
      | { expected?: string; found?: string; restored?: string }
      | undefined
    if (guard) {
      out.push({
        // Sweep rows lack timestamps historically; guard rows are appended at
        // run time — approximate with file-day noon when absent.
        at:
          typeof row.at === 'number'
            ? row.at
            : Date.parse(String(row.at ?? '')) || Date.now(),
        source: 'sweep',
        type: 'branch_guard',
        workerId: null,
        missionId: null,
        message: clip(
          `Branch guard: found ${guard.found}, expected ${guard.expected}, restored=${guard.restored}`,
        ),
      })
    }
  }
  return out
}

export function getSwarmTimeline(limit = 200): {
  entries: Array<TimelineEntry>
  generatedAt: string
} {
  const entries = [
    ...readMissionEvents(),
    ...readOutcomeEvents(),
    ...readScheduledEvents(),
    ...readSweepEvents(),
  ]
    .filter((e) => Number.isFinite(e.at) && e.at > 0)
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
  return { entries, generatedAt: new Date().toISOString() }
}
