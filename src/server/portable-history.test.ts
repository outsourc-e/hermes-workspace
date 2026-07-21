import { describe, expect, it } from 'vitest'

import {
  selectPortableConversationHistory,
  shouldReplayPortableHistory,
} from './portable-history'

describe('portable history replay', () => {
  it('skips replay when the Hermes gateway can continue the server-side session', () => {
    expect(
      shouldReplayPortableHistory({
        bearerToken: 'token',
      }),
    ).toBe(false)

    expect(
      selectPortableConversationHistory(
        [{ role: 'assistant', content: 'old reply' }],
        [{ role: 'user', content: 'fallback' }],
        { bearerToken: 'token' },
      ),
    ).toEqual([])
  })

  it('replays persisted history for direct local-provider requests', () => {
    expect(
      selectPortableConversationHistory(
        [{ role: 'assistant', content: 'old reply' }],
        [{ role: 'user', content: 'fallback' }],
        { localBaseUrl: 'http://127.0.0.1:11434', bearerToken: 'token' },
      ),
    ).toEqual([{ role: 'assistant', content: 'old reply' }])
  })

  it('falls back to client-sent history for direct local-provider requests when no persisted local session exists', () => {
    expect(
      selectPortableConversationHistory(
        [],
        [{ role: 'user', content: 'fallback' }],
        { localBaseUrl: 'http://127.0.0.1:11434', bearerToken: '' },
      ),
    ).toEqual([{ role: 'user', content: 'fallback' }])
  })
})
