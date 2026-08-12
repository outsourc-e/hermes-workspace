// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'

import {
  readLastSessionCard,
  syncLastSessionCardPersistence,
} from './-last-session-card'
import {
  buildSessionReplaceNavigation,
  resolveSessionCardRouteState,
} from './-session-route-state'
import type { SessionCardListWire } from '@/screens/chat/chat-queries'
import type { SessionCard } from '@/screens/chat/types'

const LAST_SESSION_CARD_KEY = 'hermes-last-session-card'

function card(): SessionCard {
  return {
    cardId: 'card-a',
    canonicalSource: 'remote',
    title: 'Card A',
    titleSource: 'manual',
    canonicalSegmentKey: 'session-a',
    continuationSegmentKeys: ['session-a'],
    continuationCount: 1,
    relationshipKind: 'root',
    childNodes: [],
    updatedAt: 1,
    archived: false,
    pinned: false,
  }
}

function wire(
  cards: Array<SessionCard>,
  completeness: 'complete' | 'incomplete' = 'complete',
): SessionCardListWire {
  return {
    cards,
    cardResolutions: cards.map((sessionCard) => ({
      cardId: sessionCard.cardId,
      completeness,
      retryable: completeness === 'incomplete',
    })),
    completeness,
    retryable: completeness === 'incomplete',
    sources:
      completeness === 'incomplete'
        ? [
            {
              source: 'gateway',
              status: 'incomplete',
              fetched: cards.length,
              retryable: true,
              reason: 'safe-cap',
            },
          ]
        : [],
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('last Session Card route restoration', () => {
  it('clears an externally archived or missing restored Card and requests new bootstrap', () => {
    localStorage.setItem(LAST_SESSION_CARD_KEY, 'card-a')
    const cardRouteResolution = resolveSessionCardRouteState({
      routeKey: 'card-a',
      queryStatus: 'success',
      response: wire([]),
    })

    const persistenceAction = syncLastSessionCardPersistence({
      activeFriendlyId: 'card-a',
      selectedCardId: undefined,
      cardRouteResolution,
    })

    expect(persistenceAction).toBe('bootstrap-new')
    expect(
      persistenceAction === 'bootstrap-new'
        ? buildSessionReplaceNavigation('new')
        : undefined,
    ).toEqual({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'new' },
      search: true,
      hash: true,
      state: true,
      replace: true,
    })
    expect(localStorage.getItem(LAST_SESSION_CARD_KEY)).toBeNull()
    expect(readLastSessionCard()).toBe('new')
  })

  it.each([
    {
      name: 'pending',
      cardRouteResolution: resolveSessionCardRouteState({
        routeKey: 'card-a',
        queryStatus: 'pending',
      }),
    },
    {
      name: 'failed',
      cardRouteResolution: resolveSessionCardRouteState({
        routeKey: 'card-a',
        queryStatus: 'error',
      }),
    },
    {
      name: 'incomplete with the Card absent',
      cardRouteResolution: resolveSessionCardRouteState({
        routeKey: 'card-a',
        queryStatus: 'success',
        response: wire([], 'incomplete'),
      }),
    },
    {
      name: 'incomplete with the Card still unresolved',
      cardRouteResolution: resolveSessionCardRouteState({
        routeKey: 'card-a',
        queryStatus: 'success',
        response: wire([card()], 'incomplete'),
      }),
    },
  ])(
    'retains the restored Card while inventory is $name',
    ({ cardRouteResolution }) => {
      localStorage.setItem(LAST_SESSION_CARD_KEY, 'card-a')

      expect(
        syncLastSessionCardPersistence({
          activeFriendlyId: 'card-a',
          selectedCardId: undefined,
          cardRouteResolution,
        }),
      ).toBe('unchanged')
      expect(localStorage.getItem(LAST_SESSION_CARD_KEY)).toBe('card-a')
    },
  )

  it('keeps a valid restored Card persisted', () => {
    localStorage.setItem(LAST_SESSION_CARD_KEY, 'card-a')
    const cardRouteResolution = resolveSessionCardRouteState({
      routeKey: 'card-a',
      queryStatus: 'success',
      response: wire([card()]),
    })

    expect(
      syncLastSessionCardPersistence({
        activeFriendlyId: 'card-a',
        selectedCardId: 'card-a',
        cardRouteResolution,
      }),
    ).toBe('unchanged')
    expect(localStorage.getItem(LAST_SESSION_CARD_KEY)).toBe('card-a')
  })

  it('does not clear a different valid stored Card for a missing direct route', () => {
    localStorage.setItem(LAST_SESSION_CARD_KEY, 'card-a')
    const cardRouteResolution = resolveSessionCardRouteState({
      routeKey: 'missing-direct-route',
      queryStatus: 'success',
      response: wire([card()]),
    })

    expect(
      syncLastSessionCardPersistence({
        activeFriendlyId: 'missing-direct-route',
        selectedCardId: undefined,
        cardRouteResolution,
      }),
    ).toBe('unchanged')
    expect(localStorage.getItem(LAST_SESSION_CARD_KEY)).toBe('card-a')
  })
})
