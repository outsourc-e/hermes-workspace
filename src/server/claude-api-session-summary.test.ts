import { describe, expect, it } from 'vitest'

import { toSessionSummary } from './claude-api'

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
