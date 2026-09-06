/**
 * Calendar feed fetch/parse/cache layer.
 *
 * Fetches CalDAV reports from iCloud calendars, parses ICS responses
 * with node-ical, and caches results in memory with TTL.
 *
 * Feeds configured in ~/.hermes/calendar/feeds.json
 * Credentials in ~/.hermes/calendar/.env (Basic auth)
 *
 * Caching: Map keyed by feed id, refreshed every N minutes.
 * On fetch failure, serves stale data with a warning flag.
 */

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import nodeIcal from 'node-ical'

// Pull off named members via the default export — `import * as ical from 'node-ical'`
// resolves to an interop namespace whose runtime shape varies between vite-bundled
// SSR and plain Node ESM (tsx), where `parseICS` lands on `default` rather than
// the namespace itself. Bind via the default to work in both.

const parseICS = nodeIcal.parseICS
const expandRecurringEvent = nodeIcal.expandRecurringEvent

// ── Types ────────────────────────────────────────────────────────────────

export type FeedConfig = {
  id: string
  name: string
  url: string
  source_type: string
  category: string
  color: string
  enabled: boolean
  auth_type?: string
  auth_env?: { user_var: string; pass_var: string }
  cache_ttl_minutes?: number
  note?: string
}

export type FeedStatus = 'ok' | 'stale' | 'error' | 'disabled'

export type CalendarEvent = {
  id: string
  summary: string
  start: string
  end: string
  location?: string
  description?: string
  category: string
  feed_id: string
  feed_name: string
  feed_color: string
  is_today: boolean
  is_all_day: boolean
}

export type FeedFetchResult = {
  feed_id: string
  events: Array<CalendarEvent>
  status: FeedStatus
  last_fetched: number
  error?: string
}

// ── Config loading ───────────────────────────────────────────────────────

function hermesHome(): string {
  return (
    process.env.HERMES_HOME ??
    process.env.CLAUDE_HOME ??
    join(homedir(), '.hermes')
  )
}

function loadFeedsConfig(): Array<FeedConfig> {
  const cfgPath = join(hermesHome(), 'calendar', 'feeds.json')
  if (!existsSync(cfgPath)) return []
  try {
    const raw = readFileSync(cfgPath, 'utf8')
    const parsed = JSON.parse(raw) as { feeds?: Array<FeedConfig> }
    return parsed.feeds?.filter((f) => f.enabled) ?? []
  } catch {
    console.error('[calendar-feeds] Failed to parse feeds.json')
    return []
  }
}

function loadEnvVar(varName: string): string | null {
  // First check process.env
  if (process.env[varName]) return process.env[varName] ?? null

  // Then try ~/.hermes/calendar/.env
  const envPath = join(hermesHome(), 'calendar', '.env')
  if (!existsSync(envPath)) return null
  try {
    const raw = readFileSync(envPath, 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || trimmed.length === 0) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0 && trimmed.substring(0, eqIdx) === varName) {
        return trimmed.substring(eqIdx + 1).trim()
      }
    }
  } catch {
    // ignore
  }
  return null
}

// ── CalDAV fetching ──────────────────────────────────────────────────────

/**
 * Build the CalDAV REPORT request body for a time range.
 * This uses the standard calendar-query with time-range filter.
 */
function buildCaldavQuery(start: Date, end: Date): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${formatCalDate(start)}" end="${formatCalDate(end)}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`
}

function formatCalDate(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
}

async function fetchFeedEvents(
  feed: FeedConfig,
  start: Date,
  end: Date,
): Promise<{ icsData: Array<string>; status: FeedStatus; error?: string }> {
  if (feed.source_type === 'caldav') {
    return fetchCaldavFeed(feed, start, end)
  }

  // For google_export_ical or simple http-based ical URLs
  return fetchHttpIcalFeed(feed, start, end)
}

async function fetchCaldavFeed(
  feed: FeedConfig,
  start: Date,
  end: Date,
): Promise<{ icsData: Array<string>; status: FeedStatus; error?: string }> {
  const username = loadEnvVar(feed.auth_env?.user_var ?? 'ICLOUD_APPLE_ID')
  const password = loadEnvVar(feed.auth_env?.pass_var ?? 'ICLOUD_APP_PASSWORD')

  if (!username || !password) {
    return { icsData: [], status: 'error', error: 'Missing credentials' }
  }

  const body = buildCaldavQuery(start, end)
  // CalDAV collection URL must end with / for the REPORT
  const collectionUrl = feed.url.replace(/\/+$/, '') + '/'

  try {
    const r = await fetch(collectionUrl, {
      method: 'REPORT',
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        Depth: '1',
        Authorization:
          'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      },
      body,
    })

    if (!r.ok) {
      const text = await r.text().catch(() => '')
      return {
        icsData: [],
        status: 'error',
        error: `HTTP ${r.status}: ${text.substring(0, 200)}`,
      }
    }

    const xml = await r.text()
    // Parse multi-status XML response to extract calendar-data elements
    const icsData: Array<string> = []
    const regex = /<C:calendar-data[^>]*>([\s\S]*?)<\/C:calendar-data>/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(xml)) !== null) {
      icsData.push(match[1].trim())
    }

    return { icsData, status: 'ok' }
  } catch (err: unknown) {
    return {
      icsData: [],
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function fetchHttpIcalFeed(
  feed: FeedConfig,
  start: Date,
  end: Date,
): Promise<{ icsData: Array<string>; status: FeedStatus; error?: string }> {
  try {
    const url = feed.url.startsWith('webcal://')
      ? feed.url.replace('webcal://', 'https://')
      : feed.url
    const r = await fetch(url)
    if (!r.ok) {
      return {
        icsData: [],
        status: 'error',
        error: `HTTP ${r.status}`,
      }
    }
    const text = await r.text()
    return { icsData: [text], status: 'ok' }
  } catch (err: unknown) {
    return {
      icsData: [],
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── ICS parsing ──────────────────────────────────────────────────────────

function buildCalendarEvent(
  feed: FeedConfig,
  vevent: {
    uid?: string
    summary?: string
    location?: string
    description?: string
  },
  instanceStart: Date,
  instanceEnd: Date,
  isFullDay: boolean,
  // Recurring-event instances need an instance-suffix on the id so each
  // expansion is unique; single-occurrence events keep the bare uid.
  isRecurringInstance: boolean,
): CalendarEvent {
  const startIso = isFullDay
    ? instanceStart.toISOString().split('T')[0]
    : instanceStart.toISOString()
  const endIso = isFullDay
    ? instanceEnd.toISOString().split('T')[0]
    : instanceEnd.toISOString()

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)
  const isToday = instanceStart <= todayEnd && instanceEnd >= todayStart

  const id = vevent.uid
    ? isRecurringInstance
      ? `${vevent.uid}@${instanceStart.toISOString()}`
      : vevent.uid
    : `${feed.id}-${instanceStart.toISOString()}`

  return {
    id,
    summary: vevent.summary ?? '(No title)',
    start: startIso,
    end: endIso,
    location: vevent.location,
    description: vevent.description,
    category: feed.category,
    feed_id: feed.id,
    feed_name: feed.name,
    feed_color: feed.color,
    is_today: isToday,
    is_all_day: isFullDay,
  }
}

export function parseIcsData(
  icsArray: Array<string>,
  feed: FeedConfig,
  start: Date,
  end: Date,
): Array<CalendarEvent> {
  const events: Array<CalendarEvent> = []

  for (const icsText of icsArray) {
    try {
      const parsed = parseICS(icsText)
      for (const [_key, obj] of Object.entries(parsed)) {
        if (obj?.type !== 'VEVENT') continue
        const ev = obj as {
          uid?: string
          summary?: string
          location?: string
          description?: string
          start?: Date
          end?: Date
          dateType?: string
          rrule?: unknown
        }

        const detectFullDay = (s: Date, e: Date | undefined): boolean => {
          if (ev.dateType === 'date') return true
          if (!e) return false
          const dur = e.getTime() - s.getTime()
          return dur === 86400000 && s.getHours() === 0 && s.getMinutes() === 0
        }

        // Recurring event — expand all instances within the [start, end] window
        // (node-ical handles RRULE / EXDATE / RECURRENCE-ID overrides).
        if (ev.rrule) {
          try {
            const instances = expandRecurringEvent(
              ev as Parameters<typeof expandRecurringEvent>[0],
              {
                from: start,
                to: end,
                expandOngoing: true,
              },
            ) as Array<{ start: Date; end: Date; isFullDay: boolean }>
            for (const inst of instances) {
              events.push(
                buildCalendarEvent(
                  feed,
                  ev,
                  inst.start,
                  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety: TS narrows incorrectly, the LHS can be null/undefined at runtime
                  inst.end ?? inst.start,
                  inst.isFullDay,
                  true,
                ),
              )
            }
            continue
          } catch (expandErr) {
            console.error(
              `[calendar-feeds] expandRecurringEvent failed for ${feed.id} uid=${ev.uid}:`,
              expandErr,
            )
            // Fall through to single-occurrence handling below
          }
        }

        // Single-occurrence event
        const startDate = ev.start ?? ev.end
        const endDate = ev.end ?? ev.start
        if (!startDate) continue
        if (startDate > end || (endDate ?? startDate) < start) continue
        events.push(
          buildCalendarEvent(
            feed,
            ev,
            startDate,
            endDate ?? startDate,
            detectFullDay(startDate, endDate),
            false,
          ),
        )
      }
    } catch (parseErr: unknown) {
      console.error(
        `[calendar-feeds] Failed to parse ICS for ${feed.id}:`,
        parseErr,
      )
    }
  }

  return events
}

// ── Cache layer ──────────────────────────────────────────────────────────

type CacheEntry = {
  data: FeedFetchResult
  fetched_at: number
  ttl_ms: number
}

const cache = new Map<string, CacheEntry>()
const activeFetches = new Map<string, Promise<FeedFetchResult>>()

const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 minutes

function getTtl(feed: FeedConfig): number {
  return (feed.cache_ttl_minutes ?? 5) * 60 * 1000
}

function getCached(feedId: string): FeedFetchResult | null {
  const entry = cache.get(feedId)
  if (!entry) return null
  if (Date.now() - entry.fetched_at > entry.ttl_ms) {
    cache.delete(feedId)
    return null
  }
  return entry.data
}

function setCached(
  feedId: string,
  data: FeedFetchResult,
  ttl_ms: number,
): void {
  cache.set(feedId, { data, fetched_at: Date.now(), ttl_ms })
}

export async function fetchSingleFeed(
  feed: FeedConfig,
  start: Date,
  end: Date,
): Promise<FeedFetchResult> {
  const cached = getCached(feed.id)
  if (cached) return cached

  // Deduplicate concurrent fetches
  const existing = activeFetches.get(feed.id)
  if (existing) return existing

  const promise = (async (): Promise<FeedFetchResult> => {
    let result: FeedFetchResult
    try {
      const { icsData, status, error } = await fetchFeedEvents(feed, start, end)

      if (status === 'error' || icsData.length === 0) {
        // Try to serve stale data
        const stale = getCached(feed.id)
        if (stale) {
          result = {
            ...stale,
            status: 'stale',
            error: undefined,
            last_fetched: Date.now(),
          }
        } else {
          result = {
            feed_id: feed.id,
            events: [],
            status,
            last_fetched: Date.now(),
            error: error || 'No data returned',
          }
        }
      } else {
        const events = parseIcsData(icsData, feed, start, end)
        result = {
          feed_id: feed.id,
          events,
          status: 'ok',
          last_fetched: Date.now(),
        }
        setCached(feed.id, result, getTtl(feed))
      }
    } catch (err: unknown) {
      const stale = getCached(feed.id)
      if (stale) {
        result = {
          ...stale,
          status: 'stale',
          error: err instanceof Error ? err.message : String(err),
          last_fetched: Date.now(),
        }
      } else {
        result = {
          feed_id: feed.id,
          events: [],
          status: 'error',
          last_fetched: Date.now(),
          error: err instanceof Error ? err.message : String(err),
        }
      }
    } finally {
      activeFetches.delete(feed.id)
    }
    return result
  })()

  activeFetches.set(feed.id, promise)
  return promise
}

export async function fetchAllFeeds(
  start: Date,
  end: Date,
): Promise<Array<FeedFetchResult>> {
  const feeds = loadFeedsConfig()
  return Promise.all(feeds.map((f) => fetchSingleFeed(f, start, end)))
}

// ── Public API ───────────────────────────────────────────────────────────

export async function getWeekEvents(): Promise<{
  events: Array<CalendarEvent>
  feed_statuses: Record<string, FeedStatus>
  last_updated: number
}> {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setDate(end.getDate() + 7)
  end.setHours(23, 59, 59, 999)

  const results = await fetchAllFeeds(start, end)

  const allEvents: Array<CalendarEvent> = []
  const feedStatuses: Record<string, FeedStatus> = {}

  for (const r of results) {
    allEvents.push(...r.events)
    feedStatuses[r.feed_id] = r.status
  }

  // Sort by start time
  allEvents.sort((a, b) => a.start.localeCompare(b.start))

  return {
    events: allEvents,
    feed_statuses: feedStatuses,
    last_updated: Date.now(),
  }
}

const ADELAIDE_TZ = 'Australia/Adelaide'
const adelaideDateKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: ADELAIDE_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
function adelaideDateKey(d: Date): string {
  return adelaideDateKeyFmt.format(d)
}

export async function getTodayEvents(): Promise<{
  events: Array<CalendarEvent>
  feed_statuses: Record<string, FeedStatus>
  last_updated: number
}> {
  const now = new Date()
  // Server may be in UTC while clients live in Adelaide. Widen the fetch
  // window to ±1 day so Adelaide-today is always covered, then filter
  // strictly by Adelaide-local date key.
  const start = new Date(now)
  start.setDate(start.getDate() - 1)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setDate(end.getDate() + 1)
  end.setHours(23, 59, 59, 999)

  const results = await fetchAllFeeds(start, end)

  let allEvents: Array<CalendarEvent> = []
  const feedStatuses: Record<string, FeedStatus> = {}

  for (const r of results) {
    allEvents.push(...r.events)
    feedStatuses[r.feed_id] = r.status
  }

  // Strict filter: an event counts as "today" iff its start, end, or any
  // moment in between lands on Adelaide-today.
  const todayKey = adelaideDateKey(now)
  allEvents = allEvents.filter((e) => {
    const sKey = adelaideDateKey(new Date(e.start))
    const eKey = adelaideDateKey(new Date(e.end))
    return sKey <= todayKey && eKey >= todayKey
  })

  allEvents.sort((a, b) => a.start.localeCompare(b.start))

  return {
    events: allEvents,
    feed_statuses: feedStatuses,
    last_updated: Date.now(),
  }
}

export async function getFeedStatus(): Promise<{
  feeds: Array<{
    id: string
    name: string
    category: string
    color: string
    status: FeedStatus
    last_fetched: number | null
    error?: string
  }>
  summary: { total: number; healthy: number; stale: number; errors: number }
}> {
  const feeds = loadFeedsConfig()
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setDate(end.getDate() + 1)

  // Only fetch missing/outdated feeds
  const results = await fetchAllFeeds(start, end)

  const feedInfos = results.map((r) => {
    const cfg = feeds.find((f) => f.id === r.feed_id)
    return {
      id: r.feed_id,
      name: cfg?.name ?? r.feed_id,
      category: cfg?.category ?? '',
      color: cfg?.color ?? '#888',
      status: r.status,
      last_fetched: r.last_fetched,
      error: r.error,
    }
  })

  const summary = {
    total: feedInfos.length,
    healthy: feedInfos.filter((f) => f.status === 'ok').length,
    stale: feedInfos.filter((f) => f.status === 'stale').length,
    errors: feedInfos.filter((f) => f.status === 'error').length,
  }

  return { feeds: feedInfos, summary }
}

export async function getDeadlines(): Promise<{
  deadlines: Array<{
    id: string
    assessment: string
    unit: string
    unit_name: string
    date: string
    type: string
    is_hurdle: boolean
    weight: string
    days_away: number
  }>
  semester_name: string
}> {
  const deadlinesPath = join(hermesHome(), 'calendar', 'uni-deadlines.json')
  if (!existsSync(deadlinesPath)) {
    return { deadlines: [], semester_name: 'Unknown' }
  }

  const raw = JSON.parse(readFileSync(deadlinesPath, 'utf8')) as {
    semester?: { name: string }
    deadlines: Array<{
      id: string
      assessment: string
      unit: string
      unit_name?: string
      date: string
      type: string
      is_hurdle: boolean
      weight: string
    }>
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const deadlines = raw.deadlines
    .map((d) => {
      const dateMs = Date.parse(d.date)
      const daysAway = Number.isFinite(dateMs)
        ? Math.ceil((dateMs - today.getTime()) / 86400000)
        : -1
      return {
        ...d,
        unit_name: d.unit_name ?? d.unit,
        days_away: daysAway,
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  // Only include future deadlines or ones within the last 3 days
  const active = deadlines.filter((d) => d.days_away >= -3)

  return {
    deadlines: active,
    semester_name: raw.semester?.name ?? 'Unknown',
  }
}

// Periodic refresh: pre-fetch all feeds so the first request is fast
function scheduleRefresh() {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setDate(end.getDate() + 7)
  fetchAllFeeds(start, end).catch(() => {})
}

// Skip the warm-up + interval when running under vitest so tests don't kick
// off real network fetches or leave timers running past the test process.
if (!process.env.VITEST) {
  scheduleRefresh()
  setInterval(scheduleRefresh, 5 * 60 * 1000)
}
