import { describe, expect, it } from 'vitest'

import {
  buildResolvedSessionHeaders,
  readResolvedSessionHeaders,
} from './send-stream-session-headers'

describe('send-stream session headers', () => {
  it('publishes both Hermes and legacy Claude session headers for compatibility', () => {
    expect(
      buildResolvedSessionHeaders({
        sessionKey: 'sess-123',
        friendlyId: 'friendly-123',
      }),
    ).toMatchObject({
      'X-Hermes-Session-Key': 'sess-123',
      'X-Hermes-Friendly-Id': 'friendly-123',
      'x-claude-session-key': 'sess-123',
      'x-claude-friendly-id': 'friendly-123',
    })
  })

  it('prefers Hermes headers when both header families are present', () => {
    const headers = new Headers({
      'X-Hermes-Session-Key': 'sess-new',
      'X-Hermes-Friendly-Id': 'friendly-new',
      'x-claude-session-key': 'sess-old',
      'x-claude-friendly-id': 'friendly-old',
    })

    expect(
      readResolvedSessionHeaders(headers, {
        sessionKey: 'fallback-session',
        friendlyId: 'fallback-friendly',
      }),
    ).toEqual({
      sessionKey: 'sess-new',
      friendlyId: 'friendly-new',
    })
  })

  it('falls back to legacy Claude headers when Hermes headers are absent', () => {
    const headers = new Headers({
      'x-claude-session-key': 'sess-legacy',
      'x-claude-friendly-id': 'friendly-legacy',
    })

    expect(
      readResolvedSessionHeaders(headers, {
        sessionKey: 'fallback-session',
        friendlyId: 'fallback-friendly',
      }),
    ).toEqual({
      sessionKey: 'sess-legacy',
      friendlyId: 'friendly-legacy',
    })
  })
})
