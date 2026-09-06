/**
 * MC tile adapter for the multi-source calendar pipeline (Google + iCloud
 * via CalDAV). Surfaces feed health — how many of the configured iCal feeds
 * are returning fresh data vs. stale or erroring.
 */
import { getFeedStatus } from '../../calendar-feeds'
import { registerAdapter } from './index'
import type { SourceAdapter } from './index'

interface CalendarFeedsHealthData {
  value: string
  sub: string
  tone: 'ok' | 'warn' | 'err'
}

export const calendarFeedsAdapter: SourceAdapter<CalendarFeedsHealthData> = {
  id: 'calendar-feeds',
  ttlMs: 60_000,
  async fetch() {
    const { summary } = await getFeedStatus()
    const { total, healthy, stale, errors } = summary

    const tone: 'ok' | 'warn' | 'err' =
      errors > 0 ? 'err' : stale > 0 ? 'warn' : 'ok'

    const subParts: Array<string> = []
    if (stale > 0) subParts.push(`${stale} stale`)
    if (errors > 0) subParts.push(`${errors} err`)
    const sub = subParts.length > 0 ? subParts.join(' · ') : 'all healthy'

    return {
      value: `${healthy}/${total}`,
      sub,
      tone,
    }
  },
}

registerAdapter(calendarFeedsAdapter)
