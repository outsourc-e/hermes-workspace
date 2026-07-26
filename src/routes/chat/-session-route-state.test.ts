import { describe, expect, it } from 'vitest'

import {
  buildSessionReplaceNavigation,
  resolveSessionCardProducerNavigation,
  resolveSessionCardRoute,
  resolveSessionCardRouteState,
  validatedInspectedChildCardId,
} from './-session-route-state'

const rootCard = {
  cardId: 'remote:root',
  title: 'Root card',
  titleSource: 'manual' as const,
  canonicalSegmentKey: 'remote:tip',
  continuationSegmentKeys: ['remote:root', 'remote:tip'],
  continuationCount: 2,
  relationshipKind: 'root' as const,
  childNodes: [
    {
      cardId: 'remote:child-card',
      sessionKey: 'remote:child-tip',
      relationshipKind: 'child' as const,
      title: 'Delegate',
      status: 'running' as const,
      updatedAt: 2,
      continuationCount: 1,
    },
  ],
  updatedAt: 2,
  archived: false,
  pinned: false,
}

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

describe('Session Card route resolution', () => {
  it('maps raw producer identities to a parent Card route or child inspection state', () => {
    const response = {
      cards: [rootCard],
      completeness: 'complete' as const,
      retryable: false,
      sources: [],
    }
    expect(
      resolveSessionCardProducerNavigation(response, ['remote:tip']),
    ).toEqual({ cardId: 'remote:root' })
    expect(
      resolveSessionCardProducerNavigation(response, ['remote:child-tip']),
    ).toEqual({
      cardId: 'remote:root',
      inspectedChildCardId: 'remote:child-card',
    })
    expect(
      resolveSessionCardProducerNavigation(
        {
          ...response,
          cards: [
            {
              ...rootCard,
              cardId: 'remote:other',
              canonicalSegmentKey: 'remote:other-tip',
              continuationSegmentKeys: ['remote:friendly-alias'],
              childNodes: [],
            },
            rootCard,
          ],
        },
        ['remote:tip', 'remote:friendly-alias'],
      ),
    ).toEqual({ cardId: 'remote:root' })
    expect(
      resolveSessionCardProducerNavigation(response, ['remote:missing']),
    ).toBeUndefined()
    expect(
      resolveSessionCardProducerNavigation(
        { ...response, completeness: 'incomplete', retryable: true },
        ['remote:tip'],
      ),
    ).toBeUndefined()
  })

  it('accepts inspection only for a child Card of the selected parent', () => {
    expect(validatedInspectedChildCardId(rootCard, 'remote:child-card')).toBe(
      'remote:child-card',
    )
    expect(
      validatedInspectedChildCardId(rootCard, 'remote:child-tip'),
    ).toBeUndefined()
    expect(
      validatedInspectedChildCardId(rootCard, 'remote:missing'),
    ).toBeUndefined()
    expect(
      validatedInspectedChildCardId(undefined, 'remote:child-card'),
    ).toBeUndefined()
  })

  it('selects a root by stable cardId without exposing its canonical segment', () => {
    expect(
      resolveSessionCardRoute({
        routeKey: 'remote:root',
        response: {
          cards: [rootCard],
          completeness: 'complete',
          retryable: false,
          sources: [],
        },
      }),
    ).toEqual({ status: 'selected', card: rootCard })
  })

  it('rejects direct navigation to a continuation segment', () => {
    expect(
      resolveSessionCardRoute({
        routeKey: 'remote:tip',
        response: {
          cards: [rootCard],
          completeness: 'complete',
          retryable: false,
          sources: [],
        },
      }),
    ).toEqual({ status: 'rejected', reason: 'continuation' })
  })

  it.each(['remote:child-card', 'remote:child-tip'])(
    'rejects child/branch identity %s as a parent route',
    (routeKey) => {
      expect(
        resolveSessionCardRoute({
          routeKey,
          response: {
            cards: [rootCard],
            completeness: 'complete',
            retryable: false,
            sources: [],
          },
        }),
      ).toEqual({ status: 'rejected', reason: 'child' })
    },
  )

  it('rejects an unknown route after a complete validated list', () => {
    expect(
      resolveSessionCardRoute({
        routeKey: 'remote:missing',
        response: {
          cards: [rootCard],
          completeness: 'complete',
          retryable: false,
          sources: [],
        },
      }),
    ).toEqual({ status: 'rejected', reason: 'missing' })
  })

  it.each(['new', 'main'])(
    'preserves the explicit bootstrap route %j',
    (routeKey) => {
      expect(
        resolveSessionCardRoute({
          routeKey,
          response: {
            cards: [rootCard],
            completeness: 'complete',
            retryable: false,
            sources: [],
          },
        }),
      ).toEqual({ status: 'bootstrap' })
    },
  )

  it('fails closed when the Card projection is incomplete', () => {
    expect(
      resolveSessionCardRoute({
        routeKey: 'remote:root',
        response: {
          cards: [rootCard],
          completeness: 'incomplete',
          retryable: true,
          sources: [
            {
              source: 'gateway',
              status: 'unavailable',
              fetched: 0,
              retryable: true,
              error: 'temporarily unavailable',
            },
          ],
        },
      }),
    ).toEqual({ status: 'unavailable', reason: 'projection' })
  })

  it('fails closed when the Card query fails instead of choosing a raw session', () => {
    expect(
      resolveSessionCardRouteState({
        routeKey: 'remote:root',
        queryStatus: 'error',
      }),
    ).toEqual({ status: 'unavailable', reason: 'query' })
  })

  it('keeps bootstrap routes available even while the Card query is disabled', () => {
    expect(
      resolveSessionCardRouteState({
        routeKey: 'new',
        queryStatus: 'pending',
      }),
    ).toEqual({ status: 'bootstrap' })
    expect(
      resolveSessionCardRouteState({
        routeKey: 'main',
        queryStatus: 'error',
      }),
    ).toEqual({ status: 'bootstrap' })
  })

  it('waits for a pending Card query without selecting a raw session', () => {
    expect(
      resolveSessionCardRouteState({
        routeKey: 'remote:root',
        queryStatus: 'pending',
      }),
    ).toBeNull()
  })
})
