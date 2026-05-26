/**
 * Reads the latest Whoop snapshot the personal-projects pipeline writes
 * to `~/.hermes/repos/nw-personal-projects/whoop/latest.json`.
 *
 * Returns `null` when the file is missing or unparseable so the
 * dashboard hides the card rather than failing the whole overview.
 * Individual metric fields are nullable because the Whoop API itself
 * returns nulls when a cycle is incomplete (e.g. recovery hasn't been
 * scored yet for last night).
 */
import fs from 'node:fs/promises'
import path from 'node:path'

export const DEFAULT_WHOOP_PATH = path.join(
  process.env.HOME || '/root',
  '.hermes/repos/nw-personal-projects/whoop/latest.json',
)

export type WhoopSnapshot = {
  date: string | null
  generatedAt: string | null
  recoveryPct: number | null
  hrvMs: number | null
  restingHrBpm: number | null
  sleepPerformancePct: number | null
  sleepHours: number | null
  sleepEfficiencyPct: number | null
  dayStrain: number | null
  avgHrBpm: number | null
  source: string | null
  partialErrors: Array<string> | null
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export async function readWhoopSnapshot(
  filePath: string = DEFAULT_WHOOP_PATH,
): Promise<WhoopSnapshot | null> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf-8')
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const r = parsed as Record<string, unknown>
  const partial = Array.isArray(r.partial_errors)
    ? r.partial_errors.filter((e): e is string => typeof e === 'string')
    : null
  return {
    date: strOrNull(r.date),
    generatedAt: strOrNull(r.generated_at),
    recoveryPct: numOrNull(r.recovery_pct),
    hrvMs: numOrNull(r.hrv_ms),
    restingHrBpm: numOrNull(r.resting_hr_bpm),
    sleepPerformancePct: numOrNull(r.sleep_performance_pct),
    sleepHours: numOrNull(r.sleep_hours),
    sleepEfficiencyPct: numOrNull(r.sleep_efficiency_pct),
    dayStrain: numOrNull(r.day_strain),
    avgHrBpm: numOrNull(r.avg_hr_bpm),
    source: strOrNull(r.source),
    partialErrors: partial && partial.length > 0 ? partial : null,
  }
}
