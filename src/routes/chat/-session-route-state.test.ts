import { describe, expect, it } from 'vitest'

import { buildSessionReplaceNavigation } from './-session-route-state'

describe('chat canonical replace navigation', () => {
  it('preserves search, hash, and route state', () => {
    expect(buildSessionReplaceNavigation('canonical-friendly')).toEqual({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'canonical-friendly' },
      search: true,
      hash: true,
      state: true,
      replace: true,
    })
  })
})
