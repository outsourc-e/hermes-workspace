import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDeadlines, parseIcsData } from '../calendar-feeds'
import type { FeedConfig } from '../calendar-feeds'

// ── parseIcsData ─────────────────────────────────────────────────────────

const TEST_FEED: FeedConfig = {
  id: 'test-feed',
  name: 'Test',
  url: 'https://example.com/cal.ics',
  source_type: 'http',
  category: 'personal',
  color: '#abcdef',
  enabled: true,
}

function buildIcs(opts: {
  uid?: string
  summary?: string
  dtstart: string
  dtend: string
  location?: string
  description?: string
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `UID:${opts.uid ?? 'test-uid-1'}`,
    `SUMMARY:${opts.summary ?? 'Test Event'}`,
    `DTSTART:${opts.dtstart}`,
    `DTEND:${opts.dtend}`,
  ]
  if (opts.location) lines.push(`LOCATION:${opts.location}`)
  if (opts.description) lines.push(`DESCRIPTION:${opts.description}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

describe('parseIcsData', () => {
  const windowStart = new Date('2026-06-01T00:00:00Z')
  const windowEnd = new Date('2026-06-30T23:59:59Z')

  it('converts a timed VEVENT into a CalendarEvent with feed metadata', () => {
    const ics = buildIcs({
      uid: 'evt-001',
      summary: 'Morning lecture',
      dtstart: '20260610T090000Z',
      dtend: '20260610T100000Z',
      location: 'Lecture Hall A',
    })
    const [ev] = parseIcsData([ics], TEST_FEED, windowStart, windowEnd)

    expect(ev).toBeDefined()
    expect(ev.id).toBe('evt-001')
    expect(ev.summary).toBe('Morning lecture')
    expect(ev.location).toBe('Lecture Hall A')
    expect(ev.feed_id).toBe('test-feed')
    expect(ev.feed_name).toBe('Test')
    expect(ev.feed_color).toBe('#abcdef')
    expect(ev.category).toBe('personal')
    expect(ev.is_all_day).toBe(false)
    expect(ev.start).toBe('2026-06-10T09:00:00.000Z')
  })

  it('falls back to feed.id-prefixed id when UID is missing', () => {
    const icsNoUid = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'SUMMARY:Orphan event',
      'DTSTART:20260615T120000Z',
      'DTEND:20260615T130000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const [ev] = parseIcsData([icsNoUid], TEST_FEED, windowStart, windowEnd)
    expect(ev.id).toMatch(/^test-feed-/)
  })

  it('filters out events that fall outside the time window', () => {
    const before = buildIcs({
      uid: 'before',
      dtstart: '20260101T090000Z',
      dtend: '20260101T100000Z',
    })
    const inside = buildIcs({
      uid: 'inside',
      dtstart: '20260610T090000Z',
      dtend: '20260610T100000Z',
    })
    const after = buildIcs({
      uid: 'after',
      dtstart: '20270101T090000Z',
      dtend: '20270101T100000Z',
    })
    const events = parseIcsData(
      [before, inside, after],
      TEST_FEED,
      windowStart,
      windowEnd,
    )
    expect(events.map((e) => e.id)).toEqual(['inside'])
  })

  it('detects all-day events by exact 24h duration starting at midnight', () => {
    const ics = buildIcs({
      uid: 'allday-1',
      summary: 'Public holiday',
      dtstart: '20260615T000000Z',
      dtend: '20260616T000000Z',
    })
    const [ev] = parseIcsData([ics], TEST_FEED, windowStart, windowEnd)
    expect(ev.is_all_day).toBe(true)
  })

  it('skips non-VEVENT entries without throwing', () => {
    const calWithVtodo = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VTODO',
      'UID:todo-1',
      'SUMMARY:Buy milk',
      'END:VTODO',
      'BEGIN:VEVENT',
      'UID:evt-1',
      'SUMMARY:Real event',
      'DTSTART:20260610T090000Z',
      'DTEND:20260610T100000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const events = parseIcsData(
      [calWithVtodo],
      TEST_FEED,
      windowStart,
      windowEnd,
    )
    expect(events).toHaveLength(1)
    expect(events[0].id).toBe('evt-1')
  })

  it('survives a malformed ICS payload by returning [] for that payload', () => {
    const good = buildIcs({
      uid: 'good',
      dtstart: '20260610T090000Z',
      dtend: '20260610T100000Z',
    })
    const garbage = 'this is not valid ICS data at all'
    const events = parseIcsData(
      [garbage, good],
      TEST_FEED,
      windowStart,
      windowEnd,
    )
    expect(events.map((e) => e.id)).toContain('good')
  })
})

// ── getDeadlines ─────────────────────────────────────────────────────────
//
// getDeadlines reads from $HERMES_HOME/calendar/uni-deadlines.json. We set
// HERMES_HOME to a temp dir, write a synthetic deadlines file, and re-import
// the module so its module-level cache picks up the env var.

describe('getDeadlines', () => {
  let tmpHome: string
  let origHermesHome: string | undefined
  let origClaudeHome: string | undefined

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'hermes-test-'))
    mkdirSync(join(tmpHome, 'calendar'), { recursive: true })
    origHermesHome = process.env.HERMES_HOME
    origClaudeHome = process.env.CLAUDE_HOME
    process.env.HERMES_HOME = tmpHome
    delete process.env.CLAUDE_HOME
  })

  afterEach(() => {
    if (origHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = origHermesHome
    if (origClaudeHome !== undefined) process.env.CLAUDE_HOME = origClaudeHome
    rmSync(tmpHome, { recursive: true, force: true })
  })

  function writeDeadlines(
    deadlines: Array<{
      id: string
      date: string
      assessment?: string
      unit?: string
      type?: string
      is_hurdle?: boolean
      weight?: string
    }>,
  ) {
    writeFileSync(
      join(tmpHome, 'calendar', 'uni-deadlines.json'),
      JSON.stringify({
        semester: { name: 'Semester 1 2026' },
        deadlines: deadlines.map((d) => ({
          assessment: 'Default',
          unit: 'UNIT1',
          type: 'Written',
          is_hurdle: false,
          weight: '20%',
          ...d,
        })),
      }),
    )
  }

  it('computes days_away, sorts ascending, and includes recent past (>= -3 days)', async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const iso = (offsetDays: number) => {
      const d = new Date(today.getTime() + offsetDays * 86400_000)
      return d.toISOString().split('T')[0]
    }
    writeDeadlines([
      { id: 'too-old', date: iso(-10) }, // dropped
      { id: 'recent-past', date: iso(-1) }, // kept
      { id: 'future-far', date: iso(30) },
      { id: 'future-near', date: iso(2) },
    ])

    const result = await getDeadlines()

    expect(result.semester_name).toBe('Semester 1 2026')
    expect(result.deadlines.map((d) => d.id)).toEqual([
      'recent-past',
      'future-near',
      'future-far',
    ])
    expect(
      result.deadlines.find((d) => d.id === 'future-near')?.days_away,
    ).toBe(2)
    expect(
      result.deadlines.find((d) => d.id === 'recent-past')?.days_away,
    ).toBe(-1)
  })

  it('returns empty deadlines + Unknown semester when file missing', async () => {
    const result = await getDeadlines()
    expect(result.deadlines).toEqual([])
    expect(result.semester_name).toBe('Unknown')
  })
})
