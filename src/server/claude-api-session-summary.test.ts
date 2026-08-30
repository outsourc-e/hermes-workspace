import { describe, expect, it } from 'vitest'

import { requireConfirmedPinned, toSessionSummary } from './claude-api'

describe('toSessionSummary', () => {
  it('preserves the durable backend pin flag', () => {
    expect(
      toSessionSummary({
        id: 'session-1',
        pinned: true,
      } as any),
    ).toMatchObject({
      key: 'session-1',
      friendlyId: 'session-1',
      pinned: true,
    })
  })

  it('omits pinned when an older or label-only response has no pin opinion', () => {
    const summary = toSessionSummary({
      id: 'session-2',
      source: 'desktop',
    })

    expect(summary).toMatchObject({ source: 'desktop' })
    expect(summary).not.toHaveProperty('pinned')
  })
})

describe('requireConfirmedPinned', () => {
  it('accepts a matching persisted pin response', () => {
    expect(requireConfirmedPinned({ pinned: true }, true)).toBe(true)
    expect(
      requireConfirmedPinned({ session: { pinned: false } }, false),
    ).toBe(false)
  })

  it('rejects an unconfirmed or contradictory response', () => {
    expect(() => requireConfirmedPinned({}, true)).toThrow('did not confirm')
    expect(() => requireConfirmedPinned({ pinned: false }, true)).toThrow(
      'did not confirm',
    )
  })
})
