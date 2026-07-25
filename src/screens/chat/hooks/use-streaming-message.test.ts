import { describe, expect, it } from 'vitest'
import {
  resolveAuthoritativeSessionHandoffEvent,
  shouldResolveStreamSession,
} from './use-streaming-message'

describe('shouldResolveStreamSession', () => {
  it('hands concrete sessions off to an authoritative successor session', () => {
    expect(
      shouldResolveStreamSession({
        requestedSessionKey: 'api-original-workspace',
        currentSessionKey: 'api-original-workspace',
        resolvedSessionKey: 'api-derived-backend',
      }),
    ).toBe(true)
  })

  it('allows bootstrap new chats to resolve once to a concrete session', () => {
    expect(
      shouldResolveStreamSession({
        requestedSessionKey: 'new',
        currentSessionKey: 'new',
        resolvedSessionKey: 'api-created-session',
      }),
    ).toBe(true)
  })

  it('keeps portable main chats pinned instead of promoting a backend session id', () => {
    expect(
      shouldResolveStreamSession({
        requestedSessionKey: 'main',
        currentSessionKey: 'main',
        resolvedSessionKey: 'existing-main-session',
        pinMainSession: true,
      }),
    ).toBe(false)
  })

  it('still resolves main chats when the route is not pinned to a portable session', () => {
    expect(
      shouldResolveStreamSession({
        requestedSessionKey: 'main',
        currentSessionKey: 'main',
        resolvedSessionKey: 'existing-main-session',
        pinMainSession: false,
      }),
    ).toBe(true)
  })
})

describe('stream session handoff authority', () => {
  it('accepts only a concrete authoritative handoff event', () => {
    expect(
      resolveAuthoritativeSessionHandoffEvent('session_handoff', {
        fromSessionKey: ' backend-parent ',
        sessionKey: ' successor ',
        friendlyId: ' friendly ',
        runId: ' run-1 ',
      }),
    ).toEqual({
      fromSessionKey: 'backend-parent',
      sessionKey: 'successor',
      friendlyId: 'friendly',
      runId: 'run-1',
    })
  })

  it.each(['main', 'new'])(
    'accepts bootstrap source %s when the target is concrete',
    (fromSessionKey) => {
      expect(
        resolveAuthoritativeSessionHandoffEvent('session_handoff', {
          fromSessionKey,
          sessionKey: 'concrete-session',
        }),
      ).toEqual({
        fromSessionKey,
        sessionKey: 'concrete-session',
        friendlyId: 'concrete-session',
        runId: null,
      })
    },
  )

  it.each([
    ['started', { sessionKey: 'successor' }],
    ['session_handoff', { parent_session_id: 'successor' }],
    ['session_handoff', { fromSessionKey: 'parent', sessionKey: '   ' }],
    ['session_handoff', { fromSessionKey: 'parent', sessionKey: 'main' }],
    ['session_handoff', { fromSessionKey: 'parent', sessionKey: 'new' }],
    ['session_handoff', { sessionKey: 'successor' }],
    ['session_handoff', null],
  ])('ignores non-authoritative or malformed %s payloads', (event, data) => {
    expect(resolveAuthoritativeSessionHandoffEvent(event, data)).toBeNull()
  })
})
