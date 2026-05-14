import { describe, expect, it } from 'vitest'
import {
  resolveContextAlertThreshold,
  resolveUsageMeterSessionKey,
  shouldShowUsageMeterContextAlert,
} from './usage-meter-session'

describe('usage meter session targeting', () => {
  it('uses the active chat session from the route pathname', () => {
    expect(resolveUsageMeterSessionKey('/chat/main')).toBe('main')
    expect(resolveUsageMeterSessionKey('/chat/new')).toBe('new')
    expect(resolveUsageMeterSessionKey('/chat/session-123')).toBe('session-123')
  })

  it('decodes route params for chat sessions', () => {
    expect(resolveUsageMeterSessionKey('/chat/local%2Fmirror')).toBe('local/mirror')
  })

  it('falls back to main outside chat routes', () => {
    expect(resolveUsageMeterSessionKey('/settings')).toBe('main')
    expect(resolveUsageMeterSessionKey('/dashboard')).toBe('main')
  })

  it('only allows context alerts when the usage meter is visible on chat routes', () => {
    expect(
      shouldShowUsageMeterContextAlert({ pathname: '/chat/main', visible: true }),
    ).toBe(true)
    expect(
      shouldShowUsageMeterContextAlert({ pathname: '/chat/main', visible: false }),
    ).toBe(false)
    expect(
      shouldShowUsageMeterContextAlert({ pathname: '/settings', visible: true }),
    ).toBe(false)
  })

  it('does not alert on the first high reading without crossing a threshold', () => {
    expect(
      resolveContextAlertThreshold({
        previous: null,
        current: 85,
        thresholds: [50, 75, 90],
        sent: {},
      }),
    ).toBeNull()
  })

  it('alerts with the highest newly crossed threshold', () => {
    expect(
      resolveContextAlertThreshold({
        previous: 40,
        current: 85,
        thresholds: [50, 75, 90],
        sent: {},
      }),
    ).toBe(75)
  })

  it('skips thresholds already sent today', () => {
    expect(
      resolveContextAlertThreshold({
        previous: 70,
        current: 92,
        thresholds: [50, 75, 90],
        sent: { 75: true },
      }),
    ).toBe(90)
  })
})
