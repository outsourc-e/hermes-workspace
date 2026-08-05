import { describe, expect, it } from 'vitest'
import {
  resolveAuthoritativeCardHandoffEvent,
  resolveAuthoritativeSessionHandoffEvent,
  shouldApplyCardHandoff,
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

describe('stream card handoff authority', () => {
  it('accepts a complete server-authoritative card handoff event', () => {
    expect(
      resolveAuthoritativeCardHandoffEvent('card_handoff', {
        cardId: 'remote:parent-card',
        fromSegmentKey: 'remote:parent-segment',
        canonicalSegmentKey: 'remote:continuation-segment',
        runId: 'run-1',
      }),
    ).toEqual({
      cardId: 'remote:parent-card',
      fromSegmentKey: 'remote:parent-segment',
      canonicalSegmentKey: 'remote:continuation-segment',
      runId: 'run-1',
    })
  })

  it('advances only the selected Card from its current canonical segment', () => {
    const handoff = resolveAuthoritativeCardHandoffEvent('card_handoff', {
      cardId: 'remote:parent-card',
      fromSegmentKey: 'remote:parent-segment',
      canonicalSegmentKey: 'remote:continuation-segment',
      runId: 'run-1',
    })!
    const activeCard = {
      cardId: 'remote:parent-card',
      canonicalSource: 'remote' as const,
      canonicalSegmentKey: 'remote:parent-segment',
      continuationSegmentKeys: ['remote:parent-segment'],
      relationshipKind: 'root' as const,
      childNodes: [],
    }

    expect(
      shouldApplyCardHandoff({
        handoff,
        activeCard,
        currentSegmentKey: 'remote:parent-segment',
        activeRunId: 'run-1',
      }),
    ).toBe(true)
    expect(
      shouldApplyCardHandoff({
        handoff,
        activeCard: {
          ...activeCard,
          canonicalSegmentKey: 'remote:continuation-segment',
          continuationSegmentKeys: [
            'remote:parent-segment',
            'remote:continuation-segment',
          ],
        },
        currentSegmentKey: 'remote:parent-segment',
        activeRunId: 'run-1',
      }),
    ).toBe(true)
    expect(
      shouldApplyCardHandoff({
        handoff,
        activeCard,
        currentSegmentKey: 'remote:parent-segment',
        activeRunId: null,
      }),
    ).toBe(false)
    expect(
      shouldApplyCardHandoff({
        handoff,
        activeCard: { ...activeCard, cardId: 'remote:another-card' },
        currentSegmentKey: 'remote:parent-segment',
        activeRunId: 'run-1',
      }),
    ).toBe(false)
    expect(
      shouldApplyCardHandoff({
        handoff,
        activeCard,
        currentSegmentKey: 'remote:stale-segment',
        activeRunId: 'run-1',
      }),
    ).toBe(false)
    expect(
      shouldApplyCardHandoff({
        handoff,
        currentSegmentKey: 'remote:parent-segment',
        activeRunId: 'run-1',
      }),
    ).toBe(false)
  })

  it.each([
    ['cardId', ' remote:parent-card '],
    ['fromSegmentKey', ' remote:parent-segment '],
    ['canonicalSegmentKey', ' remote:continuation-segment '],
    ['runId', ' run-1 '],
  ])('rejects whitespace-padded %s identities', (field, value) => {
    expect(
      resolveAuthoritativeCardHandoffEvent('card_handoff', {
        cardId: 'remote:parent-card',
        fromSegmentKey: 'remote:parent-segment',
        canonicalSegmentKey: 'remote:continuation-segment',
        runId: 'run-1',
        [field]: value,
      }),
    ).toBeNull()
  })

  it('requires an exact nonblank active Card identity', () => {
    const handoff = resolveAuthoritativeCardHandoffEvent('card_handoff', {
      cardId: 'remote:parent-card',
      fromSegmentKey: 'remote:parent-segment',
      canonicalSegmentKey: 'remote:continuation-segment',
      runId: 'run-1',
    })!
    const activeCard = {
      cardId: ' remote:parent-card ',
      canonicalSource: 'remote' as const,
      canonicalSegmentKey: 'remote:parent-segment',
      continuationSegmentKeys: ['remote:parent-segment'],
      relationshipKind: 'root' as const,
      childNodes: [],
    }

    expect(
      shouldApplyCardHandoff({
        handoff,
        activeCard,
        currentSegmentKey: 'remote:parent-segment',
        activeRunId: 'run-1',
      }),
    ).toBe(false)
    expect(
      shouldApplyCardHandoff({
        handoff,
        currentSegmentKey: 'remote:parent-segment',
        activeRunId: 'run-1',
      }),
    ).toBe(false)
  })

  it.each([
    [
      'cross-source successor',
      {
        cardId: 'remote:parent-card',
        fromSegmentKey: 'remote:parent-segment',
        canonicalSegmentKey: 'local:continuation-segment',
        runId: 'run-1',
      },
    ],
    [
      'raw successor identity',
      {
        cardId: 'remote:parent-card',
        fromSegmentKey: 'remote:parent-segment',
        canonicalSegmentKey: 'raw-successor',
        runId: 'run-1',
      },
    ],
    [
      'missing run relationship',
      {
        cardId: 'remote:parent-card',
        fromSegmentKey: 'remote:parent-segment',
        canonicalSegmentKey: 'remote:continuation-segment',
      },
    ],
  ])('rejects $0', (_name, payload) => {
    expect(
      resolveAuthoritativeCardHandoffEvent('card_handoff', payload),
    ).toBeNull()
  })

  it.each([
    ['session_handoff', {}],
    ['card_handoff', {}],
    ['card_handoff', { cardId: 'card', fromSegmentKey: 'parent' }],
    [
      'card_handoff',
      {
        cardId: 'remote:card',
        fromSegmentKey: 'remote:parent',
        canonicalSegmentKey: 'remote:parent',
        runId: 'run-1',
      },
    ],
    [
      'card_handoff',
      {
        cardId: 'remote:card',
        fromSegmentKey: 'remote:parent',
        canonicalSegmentKey: 'main',
        runId: 'run-1',
      },
    ],
  ])('rejects stale or malformed %s payloads', (event, data) => {
    expect(resolveAuthoritativeCardHandoffEvent(event, data)).toBeNull()
  })
})
