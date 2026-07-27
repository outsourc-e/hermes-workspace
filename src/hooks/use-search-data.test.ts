import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  fetchSearchSessionCards,
  projectSearchSessionCards,
} from './use-search-data'
import type { SessionCardListWire } from '@/screens/chat/chat-queries'
import type { SessionCard } from '@/screens/chat/types'

type SessionCardWithChildAliases = SessionCard & {
  childNodes: Array<
    SessionCard['childNodes'][number] & {
      continuationSegmentKeys: Array<string>
    }
  >
}

function card(
  overrides: Partial<SessionCardWithChildAliases> = {},
): SessionCardWithChildAliases {
  return {
    cardId: 'remote:parent-card',
    canonicalSource: 'remote',
    title: 'Parent Card',
    titleSource: 'manual',
    canonicalSegmentKey: 'remote:parent-tip',
    continuationSegmentKeys: ['remote:parent-root', 'remote:parent-tip'],
    continuationCount: 2,
    relationshipKind: 'root',
    childNodes: [
      {
        cardId: 'remote:child-card',
        sessionKey: 'remote:child-tip',
        continuationSegmentKeys: ['remote:child-card', 'remote:child-tip'],
        relationshipKind: 'child',
        title: 'Child activity',
        status: 'complete',
        updatedAt: 2,
        continuationCount: 2,
      },
    ],
    updatedAt: 3,
    archived: false,
    pinned: false,
    ...overrides,
  }
}

function wire(
  cards: Array<SessionCard>,
  completeness: 'complete' | 'incomplete' = 'complete',
): SessionCardListWire {
  return {
    cards,
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

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('global Search Session Card data', () => {
  it('uses only the authoritative Card endpoint and emits one owning root Card', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(wire([card()])))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSearchSessionCards()).resolves.toEqual([
      {
        cardId: 'remote:parent-card',
        title: 'Parent Card',
        updatedAt: 3,
        inspectableChildren: [
          { cardId: 'remote:child-card', title: 'Child activity' },
        ],
      },
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/session-cards')
    expect(fetchMock.mock.calls.flat().join(' ')).not.toMatch(
      /\/api\/sessions(?:\/search)?/,
    )
  })

  it('does not expose continuation, child session, or preview fields', () => {
    const [result] = projectSearchSessionCards(wire([card()]))

    expect(result).toEqual({
      cardId: 'remote:parent-card',
      title: 'Parent Card',
      updatedAt: 3,
      inspectableChildren: [
        { cardId: 'remote:child-card', title: 'Child activity' },
      ],
    })
    expect(result).not.toHaveProperty('canonicalSegmentKey')
    expect(result).not.toHaveProperty('continuationSegmentKeys')
    expect(result).not.toHaveProperty('preview')
    expect(result).not.toHaveProperty('sessionKey')
    expect(result?.inspectableChildren[0]).not.toHaveProperty('sessionKey')
  })

  it('fails closed for incomplete lists and incomplete per-Card projections', () => {
    const parent = card()
    expect(projectSearchSessionCards(wire([parent], 'incomplete'))).toEqual([])
    expect(
      projectSearchSessionCards({
        ...wire([parent]),
        cardResolutions: [
          {
            cardId: parent.cardId,
            completeness: 'incomplete',
            retryable: true,
          },
        ],
      }),
    ).toEqual([])
  })

  it('returns no authoritative chat results when the Card list errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ error: 'offline' }, 503))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSearchSessionCards()).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledWith('/api/session-cards')
    expect(fetchMock.mock.calls.flat().join(' ')).not.toContain('/api/sessions')
  })

  it('omits non-root projections instead of promoting their identities', () => {
    expect(
      projectSearchSessionCards(
        wire([
          card({
            relationshipKind: 'orphan',
            childNodes: [],
          }),
        ]),
      ),
    ).toEqual([])
  })
})
