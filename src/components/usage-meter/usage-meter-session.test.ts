import { describe, expect, it } from 'vitest'
import {
  resolveContextAlertThreshold,
  resolveUsageMeterSessionKey,
  shouldShowUsageMeterContextAlert,
} from './usage-meter-session'

describe('usage meter session targeting', () => {
  it('uses only the active source-qualified Card ID from the route pathname', () => {
    expect(resolveUsageMeterSessionKey('/chat/remote%3Acard-123')).toBe(
      'remote:card-123',
    )
    expect(resolveUsageMeterSessionKey('/chat/local%3Amirror')).toBe(
      'local:mirror',
    )
  })

  it('does not target bootstrap aliases, raw sessions, or non-chat routes as Cards', () => {
    expect(resolveUsageMeterSessionKey('/chat/main')).toBeNull()
    expect(resolveUsageMeterSessionKey('/chat/new')).toBeNull()
    expect(resolveUsageMeterSessionKey('/chat/session-123')).toBeNull()
    expect(resolveUsageMeterSessionKey('/chat/local%2Fmirror')).toBeNull()
    expect(resolveUsageMeterSessionKey('/chat/remote%ZZbad')).toBeNull()
    expect(resolveUsageMeterSessionKey('/settings')).toBeNull()
    expect(resolveUsageMeterSessionKey('/dashboard')).toBeNull()
  })

  it('only allows context alerts for visible source-qualified Card routes', () => {
    expect(
      shouldShowUsageMeterContextAlert({
        pathname: '/chat/main',
        visible: true,
      }),
    ).toBe(false)
    expect(
      shouldShowUsageMeterContextAlert({
        pathname: '/chat/remote%3Acard-123',
        visible: true,
      }),
    ).toBe(true)
    expect(
      shouldShowUsageMeterContextAlert({
        pathname: '/chat/remote%3Acard-123',
        visible: false,
      }),
    ).toBe(false)
    expect(
      shouldShowUsageMeterContextAlert({
        pathname: '/settings',
        visible: true,
      }),
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
