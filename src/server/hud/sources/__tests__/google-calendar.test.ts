import { describe, expect, it } from 'vitest'
import { deriveCalendarData } from '../google-calendar'

describe('deriveCalendarData', () => {
  const t0 = new Date('2026-05-26T03:30:00Z') // fixed reference time for predictable tests

  it('returns null upNext when no future events', () => {
    const cd = deriveCalendarData([], t0)
    expect(cd.upNext).toBeNull()
    expect(cd.timelineEvents).toEqual([])
    expect(cd.urgentItems).toEqual([])
  })

  it('picks soonest future event as upNext', () => {
    const events = [
      {
        id: 'a',
        summary: 'Past',
        start: '2026-05-26T02:00:00Z',
        end: '2026-05-26T03:00:00Z',
      },
      {
        id: 'b',
        summary: 'Soon',
        start: '2026-05-26T04:00:00Z',
        end: '2026-05-26T05:00:00Z',
      },
      {
        id: 'c',
        summary: 'Later',
        start: '2026-05-26T08:00:00Z',
        end: '2026-05-26T09:00:00Z',
      },
    ]
    const cd = deriveCalendarData(events, t0)
    expect(cd.upNext?.title).toBe('Soon')
    expect(cd.upNext?.label).toMatch(/^UP NEXT/)
  })

  it('marks events <60min away as urgent', () => {
    const events = [
      {
        id: 'a',
        summary: 'Imminent',
        start: '2026-05-26T04:00:00Z',
        end: '2026-05-26T05:00:00Z',
      }, // 30min away
      {
        id: 'b',
        summary: 'Later',
        start: '2026-05-26T08:00:00Z',
        end: '2026-05-26T09:00:00Z',
      },
    ]
    const cd = deriveCalendarData(events, t0)
    expect(cd.urgentItems).toHaveLength(1)
    expect(cd.urgentItems[0].body).toContain('Imminent')
  })

  it('categorises events from calendar name', () => {
    const events = [
      {
        id: 'a',
        summary: 'Lab',
        start: '2026-05-26T05:00:00Z',
        end: '2026-05-26T06:00:00Z',
        calendarName: 'uni lectures',
      },
      {
        id: 'b',
        summary: 'Patient',
        start: '2026-05-26T07:00:00Z',
        end: '2026-05-26T08:00:00Z',
        calendarName: 'tadc clinic',
      },
    ]
    const cd = deriveCalendarData(events, t0)
    const cats = cd.timelineEvents.map((e) => e.category)
    expect(cats).toContain('uni')
    expect(cats).toContain('clinic')
  })
})
