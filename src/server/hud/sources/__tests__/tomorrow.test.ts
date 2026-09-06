import { describe, expect, it } from 'vitest'
import { deriveTomorrow } from '../tomorrow'

const baseEvent = {
  is_all_day: false,
}

// Pin tz to UTC for tests so windowing is calendar-arithmetic obvious
// (production picks up Australia/Adelaide via HERMES_TIMEZONE / default).
const TEST_TZ = 'UTC'

describe('deriveTomorrow', () => {
  const now = new Date('2026-05-27T03:30:00Z')
  // With tz=UTC, "tomorrow" = 2026-05-28 00:00Z → 23:59Z

  function ev(
    start: string,
    summary: string,
    feed_name = 'Personal',
    is_all_day = false,
  ) {
    return { ...baseEvent, start, end: start, summary, feed_name, is_all_day }
  }

  it('returns CLEAR when nothing scheduled tomorrow', () => {
    const data = deriveTomorrow([], now, TEST_TZ)
    expect(data.label).toMatch(/CLEAR/)
    expect(data.title).toBe('Nothing scheduled')
    expect(data.sub).toBeUndefined()
  })

  it('ignores events from today and beyond tomorrow', () => {
    const tomorrowMid = new Date(now)
    tomorrowMid.setDate(tomorrowMid.getDate() + 1)
    tomorrowMid.setHours(10, 0, 0, 0)
    const dayAfter = new Date(now)
    dayAfter.setDate(dayAfter.getDate() + 2)
    dayAfter.setHours(10, 0, 0, 0)
    const data = deriveTomorrow(
      [
        ev(now.toISOString(), 'Today thing'),
        ev(tomorrowMid.toISOString(), 'Tomorrow thing'),
        ev(dayAfter.toISOString(), 'Day after'),
      ],
      now,
      TEST_TZ,
    )
    expect(data.title).toBe('Tomorrow thing')
    expect(data.label).toMatch(/1 EVT/)
  })

  it('counts multiple events and shows first + remainder', () => {
    const tStart = new Date(now)
    tStart.setDate(tStart.getDate() + 1)
    const t9 = new Date(tStart)
    t9.setHours(9, 30, 0, 0)
    const t13 = new Date(tStart)
    t13.setHours(13, 0, 0, 0)
    const t17 = new Date(tStart)
    t17.setHours(17, 0, 0, 0)
    const data = deriveTomorrow(
      [
        ev(t13.toISOString(), 'Lunch meeting', 'Personal'),
        ev(t9.toISOString(), 'Morning lecture', 'University'),
        ev(t17.toISOString(), 'Evening clinic', 'TADC'),
      ],
      now,
      TEST_TZ,
    )
    expect(data.title).toBe('Morning lecture')
    expect(data.label).toMatch(/3 EVTS/)
    expect(data.sub).toMatch(/\+2 more/)
  })

  it('marks all-day events as ALL DAY', () => {
    const tomorrowMid = new Date(now)
    tomorrowMid.setDate(tomorrowMid.getDate() + 1)
    tomorrowMid.setHours(0, 0, 0, 0)
    const data = deriveTomorrow(
      [
        {
          ...ev(tomorrowMid.toISOString(), 'Public holiday', 'Family'),
          is_all_day: true,
        },
      ],
      now,
      TEST_TZ,
    )
    expect(data.sub).toContain('ALL DAY')
  })
})
