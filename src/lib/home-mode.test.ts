import { describe, expect, it } from 'vitest'
import { classifyHomeMode } from './home-mode'

const timezone = 'America/Chicago'

describe('classifyHomeMode', () => {
  it('classifies the 5-6am window as morning ramp-up', () => {
    const context = classifyHomeMode({
      now: '2026-07-06T10:30:00.000Z',
      timezone,
      location: 'West Texas',
    })

    expect(context.now_local).toContain('05:30:00')
    expect(context.lane).toBe('morning_ramp_up')
    expect(context.recommended_intensity).toBe('low')
  })

  it('protects 5-8:30pm after-work time as home/family by default', () => {
    const context = classifyHomeMode({
      now: '2026-07-06T23:15:00.000Z',
      timezone,
      location: 'West Texas',
    })

    expect(context.now_local).toContain('18:15:00')
    expect(context.lane).toBe('family_evening')
    expect(context.recommended_intensity).toBe('none')
  })

  it('keeps 8:30-10pm as light creative/planning', () => {
    const context = classifyHomeMode({
      now: '2026-07-07T02:00:00.000Z',
      timezone,
      location: 'West Texas',
    })

    expect(context.now_local).toContain('21:00:00')
    expect(context.lane).toBe('light_creative_planning')
    expect(context.recommended_intensity).toBe('low')
  })

  it('uses 10pm+ as the parking-lot late-night guardrail', () => {
    const context = classifyHomeMode({
      now: '2026-07-07T03:30:00.000Z',
      timezone,
      location: 'West Texas',
    })

    expect(context.now_local).toContain('22:30:00')
    expect(context.lane).toBe('late_night_danger_zone')
    expect(context.suggested_boundary).toContain('park')
  })

  it('lets Taylor explicitly choose bounded build mode after hours', () => {
    const context = classifyHomeMode({
      now: '2026-07-07T03:30:00.000Z',
      timezone,
      explicitBuildMode: true,
    })

    expect(context.lane).toBe('override_build_mode')
    expect(context.recommended_intensity).toBe('bounded')
  })

  it('uses current calendar context when available', () => {
    const context = classifyHomeMode({
      now: '2026-07-06T20:00:00.000Z',
      timezone,
      calendar: [
        {
          title: 'Family dinner',
          startsAt: '2026-07-06T19:30:00.000Z',
          endsAt: '2026-07-06T21:00:00.000Z',
        },
      ],
    })

    expect(context.lane).toBe('family_evening')
    expect(context.reason).toContain('Family dinner')
  })
})
