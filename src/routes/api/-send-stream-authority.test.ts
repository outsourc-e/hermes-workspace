import { describe, expect, it } from 'vitest'

import { isExplicitSendStreamBootstrap } from './-send-stream-authority'

describe('isExplicitSendStreamBootstrap', () => {
  it.each(['main', 'new'])(
    'allows the explicit %s first/bootstrap identity',
    (sessionKey) => {
      expect(isExplicitSendStreamBootstrap(sessionKey, sessionKey)).toBe(true)
    },
  )

  it.each([
    ['existing session', 'session-a', 'session-a'],
    ['missing key', '', undefined],
    ['trimmed alias', 'main', ' main '],
    ['wrong bootstrap alias', 'new', 'main'],
  ])('rejects %s', (_label, rawSessionKey, bodySessionKey) => {
    expect(isExplicitSendStreamBootstrap(rawSessionKey, bodySessionKey)).toBe(
      false,
    )
  })
})
