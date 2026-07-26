import { describe, expect, it } from 'vitest'

import { activeRunCheckUrl } from './use-active-run-check'

describe('activeRunCheckUrl', () => {
  it('uses the stable Card identity for Card-aware recovery', () => {
    expect(activeRunCheckUrl('remote:tip', 'remote:parent card')).toBe(
      '/api/sessions/remote%3Atip/active-run?cardId=remote%3Aparent%20card',
    )
  })

  it('retains the legacy session recovery path when no Card is selected', () => {
    expect(activeRunCheckUrl('main')).toBe('/api/sessions/main/active-run')
  })
})
