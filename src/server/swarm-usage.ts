import { execFile } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { getProfilesDir } from './claude-paths'

const execFileAsync = promisify(execFile)

export type SwarmUsageWindow = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
}

export type SwarmWorkerUsage = {
  workerId: string
  model: string | null
  today: SwarmUsageWindow
  last7d: SwarmUsageWindow
  sessions: number
}

export type SwarmUsage = {
  workers: Array<SwarmWorkerUsage>
  generatedAt: string
}

export type SessionUsageRow = {
  started_at: number
  model: string | null
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
}

function emptyWindow(): SwarmUsageWindow {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
}

function addRow(w: SwarmUsageWindow, r: SessionUsageRow): void {
  w.input += r.input_tokens || 0
  w.output += r.output_tokens || 0
  w.cacheRead += r.cache_read_tokens || 0
  w.cacheWrite += r.cache_write_tokens || 0
  w.total +=
    (r.input_tokens || 0) +
    (r.output_tokens || 0) +
    (r.cache_read_tokens || 0) +
    (r.cache_write_tokens || 0)
}

/**
 * Pure aggregation over parsed session rows (started_at = epoch seconds).
 * Exported for unit testing.
 */
export function aggregateWorkerUsage(
  workerId: string,
  rows: Array<SessionUsageRow>,
  nowMs: number = Date.now(),
): SwarmWorkerUsage {
  const startOfDay = new Date(nowMs)
  startOfDay.setHours(0, 0, 0, 0)
  const todayStartSec = startOfDay.getTime() / 1000
  const weekStartSec = nowMs / 1000 - 7 * 24 * 3600

  const today = emptyWindow()
  const last7d = emptyWindow()
  let model: string | null = null
  let latestStart = -Infinity

  for (const r of rows) {
    if (r.model && r.started_at > latestStart) {
      latestStart = r.started_at
      model = r.model
    }
    if (r.started_at >= weekStartSec) addRow(last7d, r)
    if (r.started_at >= todayStartSec) addRow(today, r)
  }

  return { workerId, model, today, last7d, sessions: rows.length }
}

const USAGE_QUERY =
  'SELECT started_at, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens ' +
  "FROM sessions WHERE started_at >= strftime('%s','now') - 7*24*3600;"

async function readSessionRows(dbPath: string): Promise<Array<SessionUsageRow>> {
  try {
    const { stdout } = await execFileAsync(
      'sqlite3',
      ['-json', '-readonly', dbPath, USAGE_QUERY],
      { timeout: 10_000, maxBuffer: 16 * 1024 * 1024 },
    )
    const trimmed = stdout.trim()
    if (!trimmed) return []
    return JSON.parse(trimmed) as Array<SessionUsageRow>
  } catch {
    return []
  }
}

export async function getSwarmUsage(): Promise<SwarmUsage> {
  const profilesDir = getProfilesDir()
  const workers: Array<SwarmWorkerUsage> = []
  let profileIds: Array<string> = []
  try {
    profileIds = readdirSync(profilesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
  } catch {
    profileIds = []
  }

  for (const workerId of profileIds) {
    const dbPath = join(profilesDir, workerId, 'state.db')
    if (!existsSync(dbPath)) continue
    const rows = await readSessionRows(dbPath)
    workers.push(aggregateWorkerUsage(workerId, rows))
  }

  return { workers, generatedAt: new Date().toISOString() }
}
