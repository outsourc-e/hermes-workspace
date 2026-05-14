import { describe, expect, it } from 'vitest'

import {
  selectPortableConversationHistory,
  shouldReplayPortableHistory,
} from './portable-history'

describe('portable history replay', () => {
  it('skips replay when the gateway can bind portable chat to a server session', () => {
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

  it('falls back to client-sent history when no persisted local session exists', () => {
    expect(
      selectPortableConversationHistory(
        [],
        [{ role: 'user', content: 'fallback' }],
        { bearerToken: '' },
      ),
    ).toEqual([{ role: 'user', content: 'fallback' }])
  })
})
