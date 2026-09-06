/**
 * Tomorrow widget — surfaces a one-glance summary of the next calendar day
 * so morning planning ("what am I in for tomorrow?") doesn't require opening
 * the full calendar view.
 *
 * Sourced from the multi-feed calendar pipeline; we ask for the week then
 * filter to the next local-day window.
 */
import { getWeekEvents } from '../../calendar-feeds'
import { registerAdapter } from './index'
import type { SourceAdapter } from './index'

export interface TomorrowData {
  label: string
  title: string
  sub?: string
}

function categorise(
  name?: string,
): 'work' | 'uni' | 'clinic' | 'personal' | 'family' {
  const n = (name ?? '').toLowerCase()
  if (n.includes('tadc') || n.includes('hcc') || n.includes('clinic'))
    return 'clinic'
  if (
    n.includes('uni') ||
    n.includes('lect') ||
    n.includes('lab') ||
    n.includes('study')
  )
    return 'uni'
  if (n.includes('family')) return 'family'
  if (n.includes('praxentis') || n.includes('work')) return 'work'
  return 'personal'
}

// Server may run in UTC (it does on hostinger-vm); always render in Nick's
// home timezone so "TOMORROW · 9:30" matches what's on the calendar.
const DISPLAY_TZ = process.env.HERMES_TIMEZONE || 'Australia/Adelaide'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: DISPLAY_TZ,
  })
}

/**
 * Offset of `tz` from UTC, in minutes, for `at`. Honours DST because it
 * derives the offset from the actual instant rather than a fixed assumption.
 * (Adelaide flips between +9:30 and +10:30; ignoring this would shift the
 *  Tomorrow window by an hour every six months.)
 */
function tzOffsetMinutes(at: Date, tz: string): number {
  const localStr = at.toLocaleString('en-US', { timeZone: tz })
  const utcStr = at.toLocaleString('en-US', { timeZone: 'UTC' })
  return (new Date(localStr).getTime() - new Date(utcStr).getTime()) / 60000
}

/**
 * Returns [start, end] of "tomorrow in `tz`" as UTC Date objects suitable
 * for comparison against event.start ISO strings.
 */
function tomorrowWindow(now: Date, tz: string): { start: Date; end: Date } {
  const offsetMs = tzOffsetMinutes(now, tz) * 60_000
  const local = new Date(now.getTime() + offsetMs)
  local.setUTCHours(0, 0, 0, 0)
  local.setUTCDate(local.getUTCDate() + 1)
  const startUtc = new Date(local.getTime() - offsetMs)
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000 - 1)
  return { start: startUtc, end: endUtc }
}

export function deriveTomorrow(
  events: Array<{
    start: string
    end: string
    summary: string
    feed_name: string
    is_all_day: boolean
  }>,
  now: Date = new Date(),
  tz: string = DISPLAY_TZ,
): TomorrowData {
  const { start: tomorrowStart, end: tomorrowEnd } = tomorrowWindow(now, tz)

  const tomorrowEvents = events
    .filter((e) => {
      const s = new Date(e.start).getTime()
      return s >= tomorrowStart.getTime() && s <= tomorrowEnd.getTime()
    })
    .sort((a, b) => a.start.localeCompare(b.start))

  if (tomorrowEvents.length === 0) {
    return {
      label: 'TOMORROW · CLEAR',
      title: 'Nothing scheduled',
    }
  }

  const first = tomorrowEvents[0]
  const firstTime = first.is_all_day ? 'ALL DAY' : formatTime(first.start)
  const tags = new Set(
    tomorrowEvents.map((e) => categorise(e.feed_name).toUpperCase()),
  )
  const tagLabel = Array.from(tags).slice(0, 2).join('·')

  return {
    label: `TOMORROW · ${tomorrowEvents.length} EVT${tomorrowEvents.length > 1 ? 'S' : ''}${tagLabel ? ' · ' + tagLabel : ''}`,
    title: first.summary,
    sub:
      tomorrowEvents.length === 1
        ? `${firstTime} · ${first.feed_name}`
        : `${firstTime} · ${first.feed_name} · +${tomorrowEvents.length - 1} more`,
  }
}

export const tomorrowAdapter: SourceAdapter<TomorrowData> = {
  id: 'tomorrow',
  ttlMs: 60_000,
  async fetch() {
    const { events } = await getWeekEvents()
    return deriveTomorrow(events)
  },
}

registerAdapter(tomorrowAdapter)
