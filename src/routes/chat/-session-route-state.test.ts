import { describe, expect, it } from 'vitest'

import {
  buildSessionReplaceNavigation,
  resolveSessionCardRoute,
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

  it.each(['remote:root', 'remote:tip'])(
    'migrates a validated legacy segment alias %s to its stable card route',
    (routeKey) => {
      const resolution = resolveSessionCardRoute({
        routeKey,
        response: {
          cards: [rootCard],
          completeness: 'complete',
          retryable: false,
          sources: [],
        },
      })

      if (routeKey === rootCard.cardId) {
        expect(resolution).toEqual({ status: 'selected', card: rootCard })
      } else {
        expect(resolution).toEqual({
          status: 'selected',
          card: rootCard,
          navigation: buildSessionReplaceNavigation(rootCard.cardId),
        })
      }
    },
  )

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

  it('rejects an unknown route only after a complete validated list', () => {
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

    expect(
      resolveSessionCardRoute({
        routeKey: 'remote:missing',
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
    ).toEqual({ status: 'legacy-fallback' })
  })

  it.each(['new', 'main', '   '])(
    'preserves the legacy bootstrap route %j',
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
      ).toEqual({ status: 'legacy-fallback' })
    },
  )
})
