import { promises as fs } from 'node:fs'
import { registerAdapter } from './index'
import type { SourceAdapter } from './index'

interface RawWhoop {
  date?: string
  recovery_pct?: number
  sleep_hours?: number
  sleep_performance_pct?: number
  hrv_ms?: number
  resting_hr_bpm?: number
  day_strain?: number
}

export type RecommendedActivity = 'Gym' | 'Walk' | 'Yoga' | 'Rest' | 'Day off'

export interface ActivityRecommendation {
  activity: RecommendedActivity
  reason: string
}

export interface WhoopData {
  label: string
  title: string
  sub: string
  details?: {
    recovery_pct: number
    hrv_ms: number
    resting_hr_bpm: number
    sleep_hours: number
    sleep_performance_pct: number
    day_strain: number
  }
  recommendation?: ActivityRecommendation
}

/**
 * Heuristic mapping from WHOOP recovery / sleep / strain → recommended
 * activity for the day. Follows WHOOP's own recovery banding:
 *   0–33%  red    — body under strain
 *   34–66% yellow — moderate
 *   67%+   green  — well-recovered
 * Sleep <6h overrides everything: never push under that much debt.
 *
 * day_strain is *yesterday's* strain (WHOOP reports the previous day's
 * strain in the morning), so a high value flags "you went hard yesterday,
 * dial it back" even if recovery looks green.
 */
export function recommendActivity(w: RawWhoop): ActivityRecommendation {
  const sleep = w.sleep_hours ?? 0
  const recovery = w.recovery_pct ?? 0
  const strain = w.day_strain ?? 0

  if (sleep > 0 && sleep < 6) {
    return {
      activity: 'Rest',
      reason: `Only ${sleep.toFixed(1)}h sleep — recovery day`,
    }
  }

  if (recovery >= 67) {
    if (strain >= 16) {
      return {
        activity: 'Walk',
        reason: `Green recovery but yesterday was heavy (S${strain.toFixed(1)})`,
      }
    }
    return {
      activity: 'Gym',
      reason: `Green recovery — push hard (${Math.round(recovery)}%)`,
    }
  }

  if (recovery >= 34) {
    if (strain >= 14) {
      return {
        activity: 'Walk',
        reason: `Yellow recovery + heavy yesterday — moderate only`,
      }
    }
    return {
      activity: 'Walk',
      reason: `Yellow recovery (${Math.round(recovery)}%) — moderate cardio`,
    }
  }

  if (recovery > 0) {
    return {
      activity: 'Yoga',
      reason: `Red recovery (${Math.round(recovery)}%) — gentle movement only`,
    }
  }

  return {
    activity: 'Day off',
    reason: 'No recovery data — default to rest',
  }
}

export function computeWhoopData(w: RawWhoop): WhoopData {
  const recovery = w.recovery_pct ?? 0
  const rec = recommendActivity(w)

  const statsParts: Array<string> = []
  if (w.hrv_ms !== undefined) statsParts.push(`HRV ${Math.round(w.hrv_ms)}`)
  if (w.resting_hr_bpm !== undefined)
    statsParts.push(`RHR ${Math.round(w.resting_hr_bpm)}`)
  if (w.sleep_hours !== undefined)
    statsParts.push(`Sleep ${w.sleep_hours.toFixed(1)}h`)
  if (w.day_strain !== undefined)
    statsParts.push(`Strain ${w.day_strain.toFixed(1)}`)

  // Recovery band as label tag.
  const band =
    recovery >= 67
      ? 'GREEN'
      : recovery >= 34
        ? 'YELLOW'
        : recovery > 0
          ? 'RED'
          : '—'

  return {
    label: `RECOVERY · ${Math.round(recovery)}% · ${band}`,
    title: rec.activity,
    sub: statsParts.length > 0 ? statsParts.join(' · ') : '—',
    details: {
      recovery_pct: recovery,
      hrv_ms: w.hrv_ms ?? 0,
      resting_hr_bpm: w.resting_hr_bpm ?? 0,
      sleep_hours: w.sleep_hours ?? 0,
      sleep_performance_pct: w.sleep_performance_pct ?? 0,
      day_strain: w.day_strain ?? 0,
    },
    recommendation: rec,
  }
}

export const whoopAdapter: SourceAdapter<WhoopData> = {
  id: 'recovery',
  ttlMs: 5 * 60_000,
  async fetch() {
    const raw = await fs.readFile(
      '/root/.hermes/repos/nw-personal-projects/whoop/latest.json',
      'utf8',
    )
    return computeWhoopData(JSON.parse(raw))
  },
}

registerAdapter(whoopAdapter)
