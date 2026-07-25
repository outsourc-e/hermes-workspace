import { describe, expect, it } from 'vitest'

import {
  resolveAuthoritativeBootstrapHandoff,
  resolveAuthoritativeStreamHandoff,
} from './-send-stream-session-handoff'

describe('resolveAuthoritativeBootstrapHandoff', () => {
  it.each(['new', 'main'])(
    'promotes bootstrap key %s to a concrete id',
    (key) => {
      expect(resolveAuthoritativeBootstrapHandoff(key, ' concrete ')).toEqual({
        fromSessionKey: key,
        sessionKey: 'concrete',
      })
    },
  )

  it.each([
    ['parent', 'child'],
    ['new', 'main'],
    ['main', 'new'],
    ['new', '   '],
  ])(
    'does not synthesize an unsafe bootstrap handoff from %j to %j',
    (from, to) => {
      expect(resolveAuthoritativeBootstrapHandoff(from, to)).toBeNull()
    },
  )
})

describe('resolveAuthoritativeStreamHandoff', () => {
  it('recognizes an authoritative successor session id', () => {
    expect(
      resolveAuthoritativeStreamHandoff('parent', {
        session_id: ' child ',
        parent_session_id: 'unrelated',
      }),
    ).toEqual({ fromSessionKey: 'parent', sessionKey: 'child' })
  })

  it('ignores parent lineage facts without an effective session id', () => {
    expect(
      resolveAuthoritativeStreamHandoff('parent', {
        parent_session_id: 'root',
      }),
    ).toBeNull()
  })

  it.each([undefined, null, '', '   ', 42, {}, 'parent', 'main', 'new'])(
    'safely ignores malformed or unchanged session ids (%j)',
    (sessionId) => {
      expect(
        resolveAuthoritativeStreamHandoff('parent', {
          session_id: sessionId,
        }),
      ).toBeNull()
    },
  )
})
