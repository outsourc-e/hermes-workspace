import { getWeekEvents } from '../../calendar-feeds'
import { registerAdapter } from './index'
import type { SourceAdapter } from './index'

interface RawCalEvent {
  id: string
  summary: string
  start: string
  end: string
  calendarName?: string
}

interface TimelineEvent {
  id: string
  startMin: number
  durationMin: number
  title: string
  category: 'work' | 'uni' | 'clinic' | 'personal' | 'urgent'
}

interface UpNext {
  label: string
  title: string
  sub?: string
}
interface UrgentItem {
  id: string
  tag: string
  body: string
  when: string
  severity: 'urgent'
}

export interface CalendarData {
  upNext: UpNext | null
  timelineEvents: Array<TimelineEvent>
  urgentItems: Array<UrgentItem>
  nextUniEvent: { title: string; daysOut: number; calendarName?: string } | null
}

function categorise(name?: string): TimelineEvent['category'] {
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
  if (n.includes('work') || n.includes('praxentis') || n.includes('project'))
    return 'work'
  if (n.includes('critical')) return 'urgent'
  return 'personal'
}

function formatUntil(deltaMs: number): string {
  const min = Math.round(deltaMs / 60000)
  if (min < 60) return `${Math.max(0, min)} MIN`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}H`
  const d = Math.round(hr / 24)
  return d === 1 ? 'TOMORROW' : `${d}D`
}

export function deriveCalendarData(
  raw: Array<RawCalEvent>,
  now: Date = new Date(),
): CalendarData {
  const sixAm = new Date(now)
  sixAm.setHours(6, 0, 0, 0)

  const enriched = raw.map((e) => ({
    ...e,
    startDate: new Date(e.start),
    endDate: new Date(e.end),
  }))

  const upcoming = enriched
    .filter((e) => e.endDate.getTime() > now.getTime())
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())

  const next = upcoming[0] as (typeof enriched)[number] | undefined
  const upNext: UpNext | null = next
    ? {
        label: `UP NEXT · ${formatUntil(next.startDate.getTime() - now.getTime())}`,
        title: next.summary,
        sub: next.calendarName,
      }
    : null

  const today = now.toDateString()
  const timelineEvents: Array<TimelineEvent> = enriched
    .filter((e) => e.startDate.toDateString() === today)
    .map((e) => ({
      id: e.id,
      startMin: Math.max(0, (e.startDate.getTime() - sixAm.getTime()) / 60000),
      durationMin: Math.max(
        15,
        (e.endDate.getTime() - e.startDate.getTime()) / 60000,
      ),
      title: e.summary,
      category: categorise(e.calendarName),
    }))
    .filter((e) => e.startMin >= 0 && e.startMin < 840)

  const urgentItems: Array<UrgentItem> = upcoming
    .filter(
      (e) =>
        e.startDate.getTime() - now.getTime() < 3600_000 &&
        e.startDate.getTime() - now.getTime() > 0,
    )
    .map((e) => ({
      id: `cal-${e.id}`,
      tag: 'URGENT',
      body: `${e.summary} in ${Math.round((e.startDate.getTime() - now.getTime()) / 60000)}min`,
      when: e.startDate.toLocaleTimeString('en-AU', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
      severity: 'urgent' as const,
    }))

  // Next uni event derived from any calendar with "uni" or "study" in its name
  const uniUpcoming = upcoming.filter((e) => {
    const cat = categorise(e.calendarName)
    return cat === 'uni'
  })
  const nextUni = uniUpcoming[0] as (typeof uniUpcoming)[number] | undefined
  const nextUniEvent = nextUni
    ? {
        title: nextUni.summary,
        daysOut: Math.max(
          0,
          Math.ceil((nextUni.startDate.getTime() - now.getTime()) / 86400_000),
        ),
        calendarName: nextUni.calendarName,
      }
    : null

  return { upNext, timelineEvents, urgentItems, nextUniEvent }
}

export const googleCalendarAdapter: SourceAdapter<CalendarData> = {
  id: 'timeline',
  ttlMs: 60_000,
  async fetch() {
    // Multi-source pipeline (Google iCal exports + iCloud CalDAV) — replaces
    // the old single-feed /root/.hermes/hud-cache/google-events-today.json
    // file cache so today's HUD timeline / up-next reflect every enabled
    // feed in ~/.hermes/calendar/feeds.json, not just one.
    //
    // 7-day window so deriveCalendarData has enough horizon to populate
    // upNext (next event, even if it's tomorrow) and nextUniEvent (days out).
    // timelineEvents filters back down to strictly today inside the derive.
    const { events } = await getWeekEvents()
    const raw: Array<RawCalEvent> = events.map((e) => ({
      id: e.id,
      summary: e.summary,
      start: e.start,
      end: e.end,
      calendarName: e.feed_name,
    }))
    return deriveCalendarData(raw)
  },
}

registerAdapter(googleCalendarAdapter)
