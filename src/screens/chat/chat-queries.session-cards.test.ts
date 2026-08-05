import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { SessionCardService } from '../../server/session-card-service'
import {
  appendSessionCardHistoryMessage,
  archiveSessionCard,
  branchSessionCard,
  chatQueryKeys,
  fetchChatSessionCardsPage,
  fetchCompleteSessionCardHistory,
  fetchSessionCard,
  fetchSessionCardHistory,
  fetchSessionCards,
  isAuthoritativeCompleteSessionCardHistory,
  mergeChatSessionCardPages,
  mergeSessionCardDetail,
  mergeSessionCardHistoryResponse,
  moveLegacyHistoryMessagesToSessionCard,
  moveSessionCardHistoryMessages,
  reconcileSessionCardHistoryResponse,
  sessionCardQueryKeys,
  updateSessionCardMetadata,
} from './chat-queries'
import { isWholeCardBranchAvailable } from './types'
import {
  readCardTranscriptRecovery,
  replaceCardTranscriptRecoveryMessages,
} from './card-transcript-recovery'
import type { SessionCardHistoryResponse } from './chat-queries'
import type { SessionCard } from './types'

const card = {
  cardId: 'remote:root',
  canonicalSource: 'remote',
  canonicalTransport: 'gateway',
  title: 'Root',
  titleSource: 'manual',
  canonicalSegmentKey: 'remote:tip',
  continuationSegmentKeys: ['remote:root', 'remote:tip'],
  continuationCount: 2,
  relationshipKind: 'root',
  childNodes: [],
  updatedAt: 123,
  archived: false,
  pinned: false,
} satisfies SessionCard

function response(body: unknown, status = 200) {
  const responseBody =
    typeof body === 'object' &&
    body !== null &&
    Array.isArray((body as { cards?: unknown }).cards) &&
    !Object.hasOwn(body, 'cardResolutions')
      ? {
          ...body,
          cardResolutions: completeCardResolutions(
            (body as { cards: Array<unknown> }).cards.flatMap((candidate) =>
              typeof candidate === 'object' &&
              candidate !== null &&
              typeof (candidate as { cardId?: unknown }).cardId === 'string'
                ? [{ cardId: (candidate as { cardId: string }).cardId }]
                : [],
            ),
          ),
        }
      : body
  return new Response(JSON.stringify(responseBody), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function completeCardResolutions(cards: Array<{ cardId: string }>) {
  return cards.map(({ cardId }) => ({
    cardId,
    completeness: 'complete' as const,
    retryable: false,
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Session Card query keys', () => {
  it('keys history by Card, canonical segment, and cursor', () => {
    expect(
      sessionCardQueryKeys.history(
        'remote:root',
        'remote:tip',
        'signed.cursor',
      ),
    ).toEqual([
      'chat',
      'session-cards',
      'history',
      'remote:root',
      'remote:tip',
      'signed.cursor',
    ])
    expect(sessionCardQueryKeys.metadata('remote:root')).toEqual([
      'chat',
      'session-cards',
      'metadata',
      'remote:root',
    ])
    expect(sessionCardQueryKeys.archive('remote:root')).toEqual([
      'chat',
      'session-cards',
      'archive',
      'remote:root',
    ])
    expect(sessionCardQueryKeys.branch('remote:root')).toEqual([
      'chat',
      'session-cards',
      'branch',
      'remote:root',
    ])
    expect(
      sessionCardQueryKeys.childHistory(
        'remote:root',
        'remote:child',
        'remote:child-tip',
      ),
    ).toEqual([
      'chat',
      'session-cards',
      'child-history',
      'remote:root',
      'remote:child',
      'remote:child-tip',
      '',
    ])
  })
})

describe('Session Card fetchers', () => {
  it('lists Cards through only /api/session-cards and validates the wire payload', async () => {
    const cardResolutions = [
      {
        cardId: 'remote:root',
        completeness: 'complete',
        retryable: false,
      },
    ] as const
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        response({
          cards: [card],
          cardResolutions,
          completeness: 'complete',
          retryable: false,
          sources: [],
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchSessionCards()
    expect(result).toEqual({
      cards: [card],
      cardResolutions,
      completeness: 'complete',
      retryable: false,
      sources: [],
    })
    expect(isWholeCardBranchAvailable(result.cards[0]!, true)).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/api/session-cards')
    expect(fetchMock.mock.calls.flat().join(' ')).not.toContain('/api/sessions')

    fetchMock.mockResolvedValueOnce(
      response({ cards: [{ ...card, archived: 'yes' }] }),
    )
    await expect(fetchSessionCards()).resolves.toEqual({
      cards: [card],
      cardResolutions,
      completeness: 'complete',
      retryable: false,
      sources: [],
    })

    fetchMock
      .mockResolvedValueOnce(
        response({ cards: [{ ...card, archived: 'yes' }] }),
      )
      .mockResolvedValueOnce(
        response({ cards: [{ ...card, archived: 'yes' }] }),
      )
    await expect(fetchSessionCards()).rejects.toThrow(
      'Invalid Session Card response',
    )
  })

  it('retains only validated authoritative Card activity from the wire', async () => {
    const activeCard = {
      ...card,
      activity: { state: 'pending_approval', updatedAt: 456 },
    }
    const validResponse = {
      cards: [activeCard],
      cardResolutions: completeCardResolutions([activeCard]),
      completeness: 'complete' as const,
      retryable: false,
      sources: [],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(validResponse)))

    await expect(fetchSessionCards()).resolves.toMatchObject({
      cards: [
        expect.objectContaining({
          cardId: card.cardId,
          activity: { state: 'pending_approval', updatedAt: 456 },
        }),
      ],
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          ...validResponse,
          cards: [
            { ...activeCard, activity: { state: 'unknown', updatedAt: 456 } },
          ],
        }),
      ),
    )
    await expect(fetchSessionCards()).rejects.toThrow(
      'Invalid Session Card response',
    )
  })

  it('retains a pinned Card order timestamp from the session-card wire response', async () => {
    const pinnedCard = { ...card, pinned: true, pinnedAt: 123 }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          cards: [pinnedCard],
          cardResolutions: completeCardResolutions([pinnedCard]),
          completeness: 'complete',
          retryable: false,
          sources: [],
        }),
      ),
    )

    await expect(fetchSessionCards()).resolves.toMatchObject({
      cards: [expect.objectContaining({ cardId: card.cardId, pinnedAt: 123 })],
    })
  })

  it('fetches, validates, and merges bounded chat pages without duplicating roots', async () => {
    const olderCard = {
      ...card,
      cardId: 'remote:older',
      canonicalSegmentKey: 'remote:older',
      continuationSegmentKeys: ['remote:older'],
      continuationCount: 1,
      updatedAt: 100,
    }
    const firstPage = {
      cards: [card],
      totalCards: 2,
      cardResolutions: completeCardResolutions([card]),
      completeness: 'complete' as const,
      retryable: false,
      sources: [],
      nextCursor: 'cursor_1',
    }
    const secondPage = {
      cards: [card, olderCard],
      totalCards: 2,
      cardResolutions: completeCardResolutions([card, olderCard]),
      completeness: 'complete' as const,
      retryable: false,
      sources: [],
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(firstPage))
      .mockResolvedValueOnce(response(secondPage))
    vi.stubGlobal('fetch', fetchMock)

    const parsedFirst = await fetchChatSessionCardsPage()
    const parsedSecond = await fetchChatSessionCardsPage(parsedFirst.nextCursor)
    expect(fetchMock.mock.calls).toEqual([
      ['/api/session-cards?view=chat'],
      ['/api/session-cards?view=chat&cursor=cursor_1'],
    ])
    expect(
      mergeChatSessionCardPages([parsedFirst, parsedSecond]),
    ).toMatchObject({
      cards: [card, olderCard],
      totalCards: 2,
      cardResolutions: completeCardResolutions([card, olderCard]),
    })
  })

  it('validates direct Card responses, preserves targeted detail, and types retryable failures', async () => {
    const detail = {
      card,
      resolution: {
        cardId: card.cardId,
        completeness: 'complete' as const,
        retryable: false,
      },
      completeness: 'incomplete' as const,
      retryable: true,
      sources: [
        {
          source: 'gateway',
          status: 'unavailable',
          fetched: 0,
          retryable: true,
        },
      ],
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(detail))
      .mockResolvedValueOnce(
        response({ error: 'temporarily unavailable', retryable: true }, 503),
      )
    vi.stubGlobal('fetch', fetchMock)

    const parsedDetail = await fetchSessionCard('root alias')
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/session-cards/root%20alias',
    )
    expect(mergeSessionCardDetail(undefined, parsedDetail)).toMatchObject({
      cards: [card],
      cardResolutions: [detail.resolution],
    })
    await expect(fetchSessionCard('missing')).rejects.toMatchObject({
      name: 'SessionCardLookupError',
      status: 503,
      retryable: true,
    })
  })

  it('keeps newer inventory activity when a detail response is stale', () => {
    const inventoryCard: SessionCard = {
      ...card,
      canonicalSource: 'remote',
      canonicalTransport: 'gateway',
      titleSource: 'manual',
      relationshipKind: 'root',
      activity: { state: 'completed', updatedAt: 600 },
    }
    const detailCard: SessionCard = {
      ...card,
      canonicalSource: 'remote',
      canonicalTransport: 'gateway',
      titleSource: 'manual',
      relationshipKind: 'root',
      title: 'Stale detail title',
      activity: { state: 'running', updatedAt: 500 },
    }
    const merged = mergeSessionCardDetail(
      {
        cards: [inventoryCard],
        totalCards: 1,
        cardResolutions: completeCardResolutions([inventoryCard]),
        completeness: 'complete',
        retryable: false,
        sources: [],
      },
      {
        card: detailCard,
        resolution: completeCardResolutions([detailCard])[0]!,
        completeness: 'complete',
        retryable: false,
        sources: [],
      },
    )

    expect(merged?.cards).toEqual([
      expect.objectContaining({
        title: 'Stale detail title',
        activity: { state: 'completed', updatedAt: 600 },
      }),
    ])
  })

  it('accepts an actual service projection with authoritative child continuation aliases', async () => {
    const sessions = [
      {
        key: 'parent',
        friendlyId: 'parent',
        updatedAt: 1,
        lineage: { source: 'cli' as const },
      },
      {
        key: 'child-root',
        friendlyId: 'child-root',
        updatedAt: 2,
        lineage: {
          parentSessionId: 'parent',
          relationshipType: 'child_session' as const,
          source: 'cli' as const,
          endReason: 'compression' as const,
          endedAt: 3,
          lineageRootId: 'child-root',
          lineageTipId: 'child-tip',
        },
      },
      {
        key: 'child-tip',
        friendlyId: 'child-tip',
        updatedAt: 3,
        lineage: {
          parentSessionId: 'child-root',
          source: 'cli' as const,
          startedAt: 3,
          lineageRootId: 'child-root',
          lineageTipId: 'child-tip',
        },
      },
    ]
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () =>
          Promise.resolve({
            sessions,
            offset: 0,
            limit: sessions.length,
            total: sessions.length,
            hasMore: false,
            pagination: 'supported',
          }),
      },
      localSource: null,
      metadataStore: {
        list: () => [],
        update: () => {
          throw new Error('not used')
        },
        archive: () => {
          throw new Error('not used')
        },
      },
    })
    const projected = await service.listCards()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(projected)))

    await expect(fetchSessionCards()).resolves.toMatchObject({
      cards: [
        {
          cardId: 'remote:parent',
          childNodes: [
            {
              cardId: 'remote:child-root',
              sessionKey: 'remote:child-tip',
              continuationSegmentKeys: [
                'remote:child-root',
                'remote:child-tip',
              ],
              continuationCount: 2,
            },
          ],
        },
      ],
      cardResolutions: [
        {
          cardId: 'remote:parent',
          completeness: 'complete',
          retryable: false,
        },
      ],
    })
  })

  it('rejects invalid identities at arbitrary recursive child depth', async () => {
    const child = {
      cardId: 'remote:child',
      sessionKey: 'remote:child',
      continuationSegmentKeys: ['remote:child'],
      relationshipKind: 'child',
      title: 'Child',
      status: 'idle',
      updatedAt: 2,
      continuationCount: 1,
      childNodes: [
        {
          cardId: 'local:grandchild',
          sessionKey: 'local:grandchild',
          continuationSegmentKeys: ['local:grandchild'],
          relationshipKind: 'branch',
          title: 'Spoofed grandchild',
          status: 'idle',
          updatedAt: 3,
          continuationCount: 1,
          childNodes: [],
        },
      ],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          cards: [{ ...card, childNodes: [child] }],
          completeness: 'complete',
          retryable: false,
          sources: [],
        }),
      ),
    )

    await expect(fetchSessionCards()).rejects.toThrow(
      'Invalid Session Card response',
    )
  })

  it('rejects a Card list without exact per-Card resolution evidence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            cards: [card],
            completeness: 'complete',
            retryable: false,
            sources: [],
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    await expect(fetchSessionCards()).rejects.toThrow(
      'Invalid Session Card response',
    )
  })

  it('rejects an archived Card that is also pinned', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          cards: [{ ...card, archived: true, pinned: true }],
          cardResolutions: [
            {
              cardId: card.cardId,
              completeness: 'complete',
              retryable: false,
            },
          ],
          completeness: 'complete',
          retryable: false,
          sources: [],
        }),
      ),
    )

    await expect(fetchSessionCards()).rejects.toThrow(
      'Invalid Session Card response',
    )
  })

  it.each([
    [
      'unknown Card ID',
      [
        {
          cardId: 'remote:other',
          completeness: 'complete',
          retryable: false,
        },
      ],
    ],
    [
      'duplicate Card ID',
      [
        {
          cardId: 'remote:root',
          completeness: 'complete',
          retryable: false,
        },
        {
          cardId: 'remote:root',
          completeness: 'complete',
          retryable: false,
        },
      ],
    ],
    [
      'contradictory complete status',
      [
        {
          cardId: 'remote:root',
          completeness: 'complete',
          retryable: true,
        },
      ],
    ],
    [
      'contradictory incomplete status',
      [
        {
          cardId: 'remote:root',
          completeness: 'incomplete',
          retryable: false,
        },
      ],
    ],
  ])(
    'rejects unsafe per-Card resolution metadata: %s',
    async (_name, cardResolutions) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          response({
            cards: [card],
            cardResolutions,
            completeness: 'complete',
            retryable: false,
            sources: [],
          }),
        ),
      )

      await expect(fetchSessionCards()).rejects.toThrow(
        'Invalid Session Card response',
      )
    },
  )

  it('preserves a top-level orphan relationship instead of promoting it to root', async () => {
    const orphan = { ...card, relationshipKind: 'orphan' }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          cards: [orphan],
          cardResolutions: completeCardResolutions([orphan]),
          completeness: 'complete',
          retryable: false,
          sources: [],
        }),
      ),
    )

    await expect(fetchSessionCards()).resolves.toMatchObject({
      cards: [{ cardId: 'remote:root', relationshipKind: 'orphan' }],
    })
  })

  it.each([undefined, null, '', 'gateway', 'portable', []])(
    'rejects a missing or unverified canonical Card source: %j',
    async (canonicalSource) => {
      const candidate: Record<string, unknown> = { ...card, canonicalSource }
      if (canonicalSource === undefined) delete candidate.canonicalSource
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          response({
            cards: [candidate],
            completeness: 'complete',
            retryable: false,
            sources: [],
          }),
        ),
      )

      await expect(fetchSessionCards()).rejects.toThrow(
        'Invalid Session Card response',
      )
    },
  )

  it.each([
    ['dashboard', 'dashboard'],
    ['missing', undefined],
  ] as const)(
    'keeps branching disabled for a %s canonical transport',
    async (_name: string, canonicalTransport: 'dashboard' | undefined) => {
      const candidate: Record<string, unknown> = {
        ...card,
        canonicalTransport,
      }
      if (canonicalTransport === undefined) delete candidate.canonicalTransport
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          response({
            cards: [candidate],
            cardResolutions: completeCardResolutions([
              candidate as { cardId: string },
            ]),
            completeness: 'complete',
            retryable: false,
            sources: [],
          }),
        ),
      )

      const result = await fetchSessionCards()
      expect(isWholeCardBranchAvailable(result.cards[0]!, true)).toBe(false)
      expect(result.cards[0]).toEqual(candidate)
    },
  )

  it.each([null, '', 'local', 'Gateway', 'gateway ', [], {}])(
    'rejects a malformed or unsupported canonical transport: %j',
    async (canonicalTransport: unknown) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          response({
            cards: [{ ...card, canonicalTransport }],
            completeness: 'complete',
            retryable: false,
            sources: [],
          }),
        ),
      )

      await expect(fetchSessionCards()).rejects.toThrow(
        'Invalid Session Card response',
      )
    },
  )

  it.each([
    {
      name: 'local canonical source claiming gateway transport',
      candidate: { ...card, canonicalSource: 'local' },
    },
    {
      name: 'local-qualified identity claiming a remote gateway source',
      candidate: {
        ...card,
        cardId: 'local:root',
        canonicalSegmentKey: 'local:tip',
        continuationSegmentKeys: ['local:root', 'local:tip'],
      },
    },
  ])(
    'rejects a spoofed transport binding: $name',
    async ({ candidate }: { candidate: Record<string, unknown> }) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          response({
            cards: [candidate],
            completeness: 'complete',
            retryable: false,
            sources: [],
          }),
        ),
      )

      await expect(fetchSessionCards()).rejects.toThrow(
        'Invalid Session Card response',
      )
    },
  )

  it.each([undefined, null, 0, 1, 'true', [], {}])(
    'rejects a non-primitive-boolean pinned value: %j',
    async (pinned) => {
      const candidate: Record<string, unknown> = { ...card, pinned }
      if (pinned === undefined) delete candidate.pinned
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          response({
            cards: [candidate],
            completeness: 'complete',
            retryable: false,
            sources: [],
          }),
        ),
      )

      await expect(fetchSessionCards()).rejects.toThrow(
        'Invalid Session Card response',
      )
    },
  )

  it.each([
    ['branch root', { cards: [{ ...card, relationshipKind: 'branch' }] }],
    ['child root', { cards: [{ ...card, relationshipKind: 'child' }] }],
    ['root parent', { cards: [{ ...card, parentCardId: 'remote:parent' }] }],
    ['retryable complete list', { retryable: true }],
    [
      'failed source in a complete list',
      {
        sources: [
          {
            source: 'gateway',
            status: 'unavailable',
            fetched: 0,
            retryable: true,
            error: 'safe public error',
          },
        ],
      },
    ],
    [
      'retryable complete source',
      {
        sources: [
          {
            source: 'gateway',
            status: 'complete',
            fetched: 1,
            retryable: true,
          },
        ],
      },
    ],
    [
      'contradictory continuation count',
      { cards: [{ ...card, continuationCount: 1 }] },
    ],
    [
      'canonical key outside continuation',
      { cards: [{ ...card, canonicalSegmentKey: 'remote:other' }] },
    ],
  ])('rejects contradictory list payload: %s', async (_name, patch) => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        cards: [card],
        completeness: 'complete',
        retryable: false,
        sources: [],
        ...patch,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSessionCards()).rejects.toThrow(
      'Invalid Session Card response',
    )
  })

  it.each([
    [
      'Card relationship kind',
      { cards: [{ ...card, relationshipKind: ['root'] }] },
    ],
    ['Card title source', { cards: [{ ...card, titleSource: ['manual'] }] }],
    [
      'child status',
      {
        cards: [
          {
            ...card,
            childNodes: [
              {
                cardId: 'remote:child',
                sessionKey: 'remote:child',
                continuationSegmentKeys: ['remote:child'],
                relationshipKind: 'child',
                title: 'Child',
                status: ['idle'],
                updatedAt: 100,
                continuationCount: 1,
              },
            ],
          },
        ],
      },
    ],
    [
      'source status',
      {
        completeness: 'incomplete',
        retryable: true,
        sources: [
          {
            source: 'gateway',
            status: ['unavailable'],
            fetched: 0,
            retryable: true,
            error: 'safe public error',
          },
        ],
      },
    ],
    [
      'source reason',
      {
        completeness: 'incomplete',
        retryable: true,
        sources: [
          {
            source: 'gateway',
            status: 'incomplete',
            fetched: 100,
            retryable: true,
            reason: ['safe-cap'],
          },
        ],
      },
    ],
  ])('rejects an array-valued %s from the Card list', async (_name, patch) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          cards: [card],
          completeness: 'complete',
          retryable: false,
          sources: [],
          ...patch,
        }),
      ),
    )

    await expect(fetchSessionCards()).rejects.toThrow(
      'Invalid Session Card response',
    )
  })

  it.each([
    [
      'canonical segment owned by another Card',
      {
        ...card,
        cardId: 'remote:other-root',
        title: 'Other root',
        canonicalSegmentKey: 'remote:tip',
        continuationSegmentKeys: ['remote:other-root', 'remote:tip'],
      },
    ],
    [
      'continuation segment owned by another Card',
      {
        ...card,
        cardId: 'remote:other-root',
        title: 'Other root',
        canonicalSegmentKey: 'remote:other-tip',
        continuationSegmentKeys: ['remote:tip', 'remote:other-tip'],
      },
    ],
  ])('rejects a %s', async (_name, conflictingCard) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          cards: [card, conflictingCard],
          completeness: 'complete',
          retryable: false,
          sources: [],
        }),
      ),
    )

    await expect(fetchSessionCards()).rejects.toThrow(
      'Invalid Session Card response',
    )
  })

  it.each([
    [
      'child Card ID',
      {
        cardId: 'remote:other-root',
        sessionKey: 'remote:child-tip',
        continuationSegmentKeys: ['remote:other-root', 'remote:child-tip'],
      },
    ],
    [
      'child session key',
      {
        cardId: 'remote:child-root',
        sessionKey: 'remote:other-root',
        continuationSegmentKeys: ['remote:child-root', 'remote:other-root'],
      },
    ],
  ])('rejects a %s that collides with root ownership', async (_name, child) => {
    const otherCard = {
      ...card,
      cardId: 'remote:other-root',
      title: 'Other root',
      canonicalSegmentKey: 'remote:other-tip',
      continuationSegmentKeys: ['remote:other-root', 'remote:other-tip'],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          cards: [
            {
              ...card,
              childNodes: [
                {
                  ...child,
                  relationshipKind: 'child',
                  title: 'Child',
                  status: 'idle',
                  updatedAt: 100,
                  continuationCount: child.continuationSegmentKeys.length,
                },
              ],
            },
            otherCard,
          ],
          completeness: 'complete',
          retryable: false,
          sources: [],
        }),
      ),
    )

    await expect(fetchSessionCards()).rejects.toThrow(
      'Invalid Session Card response',
    )
  })

  it('preserves distinct Card ownership and documented same-Card aliases', async () => {
    const otherCard = {
      ...card,
      cardId: 'remote:other-root',
      title: 'Other root',
      canonicalSegmentKey: 'remote:other-tip',
      continuationSegmentKeys: ['remote:other-root', 'remote:other-tip'],
      childNodes: [
        {
          cardId: 'remote:child',
          sessionKey: 'remote:child',
          continuationSegmentKeys: ['remote:child'],
          relationshipKind: 'branch',
          title: 'Branch',
          status: 'idle',
          updatedAt: 100,
          continuationCount: 1,
        },
      ],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          cards: [card, otherCard],
          cardResolutions: completeCardResolutions([card, otherCard]),
          completeness: 'complete',
          retryable: false,
          sources: [],
        }),
      ),
    )

    await expect(fetchSessionCards()).resolves.toMatchObject({
      cards: [card, otherCard],
    })
  })

  it('retains validated source-qualified child continuation aliases', async () => {
    const child = {
      cardId: 'remote:child-root',
      sessionKey: 'remote:child-tip',
      continuationSegmentKeys: [
        'remote:child-root',
        'remote:child-middle',
        'remote:child-tip',
      ],
      relationshipKind: 'child',
      title: 'Child',
      status: 'idle',
      updatedAt: 100,
      continuationCount: 3,
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          cards: [{ ...card, childNodes: [child] }],
          cardResolutions: completeCardResolutions([card]),
          completeness: 'complete',
          retryable: false,
          sources: [],
        }),
      ),
    )

    await expect(fetchSessionCards()).resolves.toMatchObject({
      cards: [{ childNodes: [child] }],
    })
  })

  it.each([
    ['missing aliases', undefined, undefined],
    [
      'bare alias',
      ['remote:child-root', 'child-middle', 'remote:child-tip'],
      undefined,
    ],
    [
      'wrong source alias',
      ['remote:child-root', 'local:child-middle', 'remote:child-tip'],
      undefined,
    ],
    [
      'duplicate alias',
      ['remote:child-root', 'remote:child-root', 'remote:child-tip'],
      undefined,
    ],
    [
      'wrong count',
      ['remote:child-root', 'remote:child-middle', 'remote:child-tip'],
      2,
    ],
    ['wrong root', ['remote:other-root', 'remote:child-tip'], undefined],
    ['wrong tip', ['remote:child-root', 'remote:other-tip'], undefined],
  ])(
    'rejects malformed child continuation aliases: %s',
    async (_name, aliases, continuationCount) => {
      const child: Record<string, unknown> = {
        cardId: 'remote:child-root',
        sessionKey: 'remote:child-tip',
        continuationSegmentKeys: aliases,
        relationshipKind: 'child',
        title: 'Child',
        status: 'idle',
        updatedAt: 100,
        continuationCount:
          continuationCount ?? (Array.isArray(aliases) ? aliases.length : 3),
      }
      if (aliases === undefined) delete child.continuationSegmentKeys
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          response({
            cards: [{ ...card, childNodes: [child] }],
            completeness: 'complete',
            retryable: false,
            sources: [],
          }),
        ),
      )

      await expect(fetchSessionCards()).rejects.toThrow(
        'Invalid Session Card response',
      )
    },
  )

  it('rejects a child continuation alias owned by its parent Card', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          cards: [
            {
              ...card,
              childNodes: [
                {
                  cardId: 'remote:child-root',
                  sessionKey: 'remote:child-tip',
                  continuationSegmentKeys: [
                    'remote:child-root',
                    'remote:tip',
                    'remote:child-tip',
                  ],
                  relationshipKind: 'child',
                  title: 'Child',
                  status: 'idle',
                  updatedAt: 100,
                  continuationCount: 3,
                },
              ],
            },
          ],
          completeness: 'complete',
          retryable: false,
          sources: [],
        }),
      ),
    )

    await expect(fetchSessionCards()).rejects.toThrow(
      'Invalid Session Card response',
    )
  })

  it('retries one invalid parent history response by Card route without a legacy fallback', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        response({
          cardId: 'remote:root',
          canonicalSegmentKey: 'remote:tip',
          messages: [
            { segmentKey: 'remote:root', message: { id: 'message-1' } },
          ],
          completeness: 'partial',
          retryable: true,
          missingSegments: [
            {
              segmentKey: 'remote:tip',
              source: 'gateway',
              retryable: true,
              error: 'temporarily unavailable',
            },
          ],
        }),
      ),
    )
    fetchMock.mockResolvedValueOnce(response({ messages: [null] }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchSessionCardHistory({
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:tip',
      cursor: 'signed.cursor',
      limit: 25,
    })

    expect(result.completeness).toBe('partial')
    expect(result.retryable).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/session-cards/remote%3Aroot/history?limit=25&cursor=signed.cursor',
      { signal: undefined },
    )
    expect(fetchMock.mock.calls.flat().join(' ')).not.toContain('/api/history')
  })

  it('loads child Card history with explicit parent ownership and no raw-session fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        cardId: 'remote:child',
        canonicalSegmentKey: 'remote:child-tip',
        messages: [
          {
            segmentKey: 'remote:child-tip',
            message: { id: 'child-message' },
          },
        ],
        completeness: 'partial',
        retryable: true,
        missingSegments: [
          {
            segmentKey: 'remote:child-root',
            retryable: true,
            error: 'temporarily unavailable',
          },
        ],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchSessionCardHistory({
        parentCardId: 'remote:root',
        cardId: 'remote:child',
        canonicalSegmentKey: 'remote:child-tip',
        limit: 25,
      }),
    ).resolves.toMatchObject({
      cardId: 'remote:child',
      completeness: 'partial',
      retryable: true,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/session-cards/remote%3Achild/history?parentCardId=remote%3Aroot&limit=25',
      { signal: undefined },
    )
    expect(fetchMock.mock.calls.flat().join(' ')).not.toContain('/api/history')
  })

  it('rejects malformed child history identity before any request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchSessionCardHistory({
        parentCardId: 'remote:root',
        cardId: 'remote:root',
        canonicalSegmentKey: 'remote:child-tip',
      }),
    ).rejects.toThrow('Invalid Session Card history request')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('loads every Card history cursor page in parent order', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          cardId: 'remote:root',
          canonicalSegmentKey: 'remote:tip',
          messages: [
            {
              segmentKey: 'remote:root',
              message: { id: 'm1', role: 'user', content: [] },
            },
          ],
          completeness: 'complete',
          retryable: false,
          missingSegments: [],
          nextCursor: 'page-2',
        }),
      )
      .mockResolvedValueOnce(
        response({
          cardId: 'remote:root',
          canonicalSegmentKey: 'remote:tip',
          messages: [
            {
              segmentKey: 'remote:tip',
              message: { id: 'm2', role: 'assistant', content: [] },
            },
          ],
          completeness: 'complete',
          retryable: false,
          missingSegments: [],
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchCompleteSessionCardHistory({
        cardId: 'remote:root',
        canonicalSegmentKey: 'remote:tip',
      }),
    ).resolves.toMatchObject({
      sessionKey: 'remote:tip',
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:tip',
      messages: [
        { id: 'm1', __segmentKey: 'remote:root' },
        { id: 'm2', __segmentKey: 'remote:tip' },
      ],
      completeness: 'complete',
      retryable: false,
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/session-cards/remote%3Aroot/history?limit=500',
      { signal: undefined },
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/session-cards/remote%3Aroot/history?limit=500&cursor=page-2',
      { signal: undefined },
    )
  })

  it('normalizes string-backed Card history content into renderable text parts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        cardId: 'remote:root',
        canonicalSegmentKey: 'remote:tip',
        messages: [
          {
            segmentKey: 'remote:tip',
            message: {
              id: 'assistant-message',
              role: 'assistant',
              content: 'A persisted assistant reply',
            },
          },
        ],
        completeness: 'complete',
        retryable: false,
        missingSegments: [],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchCompleteSessionCardHistory({
        cardId: 'remote:root',
        canonicalSegmentKey: 'remote:tip',
      }),
    ).resolves.toMatchObject({
      messages: [
        {
          id: 'assistant-message',
          role: 'assistant',
          content: [{ type: 'text', text: 'A persisted assistant reply' }],
          __segmentKey: 'remote:tip',
        },
      ],
    })
  })

  it('accepts only complete non-retryable Card history as an authoritative transcript', () => {
    const base = {
      sessionKey: 'remote:tip',
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:tip',
      messages: [{ id: 'message', role: 'assistant', content: [] }],
    }

    expect(
      isAuthoritativeCompleteSessionCardHistory({
        ...base,
        completeness: 'complete',
        retryable: false,
        missingSegments: [],
      }),
    ).toBe(true)
    expect(
      isAuthoritativeCompleteSessionCardHistory({
        ...base,
        completeness: 'partial',
        retryable: true,
        missingSegments: [
          {
            segmentKey: 'remote:missing',
            retryable: true,
            error: 'temporarily unavailable',
          },
        ],
      }),
    ).toBe(false)
    expect(
      isAuthoritativeCompleteSessionCardHistory({
        ...base,
        completeness: 'complete',
        retryable: true,
        missingSegments: [],
      } as any),
    ).toBe(false)
  })

  it('merges only an explicit Card recovery overlay when server history is partial', () => {
    const server = {
      sessionKey: 'remote:tip',
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:tip',
      messages: [
        {
          id: 'server-partial',
          role: 'assistant' as const,
          content: [],
        },
      ],
      completeness: 'partial' as const,
      retryable: true as const,
      missingSegments: [
        {
          segmentKey: 'remote:missing',
          retryable: true,
          error: 'temporarily unavailable',
        },
      ],
    }
    const recoveryMessages = [
      {
        id: 'cached-optimistic',
        role: 'user' as const,
        content: [],
        __optimistic: true,
      },
    ]

    expect(
      mergeSessionCardHistoryResponse(server as any, recoveryMessages).messages,
    ).toEqual([
      expect.objectContaining({ id: 'server-partial' }),
      expect.objectContaining({ id: 'cached-optimistic' }),
    ])
  })

  it('retains prior persisted Card rows after a subsequent partial response and keeps recovery last', () => {
    const prior = {
      sessionKey: 'remote:tip',
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:tip',
      messages: [
        {
          id: 'persisted-root',
          role: 'user' as const,
          content: [],
          __segmentKey: 'remote:root',
        },
        {
          id: 'persisted-tip',
          role: 'assistant' as const,
          content: [],
          __segmentKey: 'remote:tip',
        },
        {
          id: 'recovery-last',
          role: 'assistant' as const,
          content: [],
        },
      ],
      persistedMessages: [
        {
          id: 'persisted-root',
          role: 'user' as const,
          content: [],
          __segmentKey: 'remote:root',
        },
        {
          id: 'persisted-tip',
          role: 'assistant' as const,
          content: [],
          __segmentKey: 'remote:tip',
        },
      ],
      completeness: 'partial' as const,
      retryable: true,
      missingSegments: [
        {
          segmentKey: 'remote:tip',
          retryable: true as const,
          error: 'temporarily unavailable',
        },
      ],
    }
    const subsequent = {
      ...prior,
      messages: [prior.messages[0]!],
      persistedMessages: [prior.persistedMessages[0]!],
    }

    expect(
      reconcileSessionCardHistoryResponse(subsequent, {
        previous: prior,
        continuationSegmentKeys: ['remote:root', 'remote:tip'],
        recoveryMessages: [prior.messages[2]!],
      }).messages,
    ).toEqual([
      expect.objectContaining({ id: 'persisted-root' }),
      expect.objectContaining({ id: 'persisted-tip' }),
      expect.objectContaining({ id: 'recovery-last' }),
    ])
  })

  it('does not reintroduce a local recovery copy after an acknowledged server row', () => {
    const acknowledged = {
      id: 'server-acknowledged',
      client_id: 'client-acknowledged',
      role: 'user' as const,
      content: [],
      __segmentKey: 'remote:tip',
    }
    const previousComplete = {
      sessionKey: 'remote:tip',
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:tip',
      messages: [acknowledged],
      persistedMessages: [acknowledged],
      completeness: 'complete' as const,
      retryable: false,
      missingSegments: [],
    }
    const subsequentPartial = {
      ...previousComplete,
      messages: [],
      persistedMessages: [],
      completeness: 'partial' as const,
      retryable: true,
      missingSegments: [
        {
          segmentKey: 'remote:tip',
          retryable: true as const,
          error: 'temporarily unavailable',
        },
      ],
    }

    expect(
      reconcileSessionCardHistoryResponse(subsequentPartial, {
        previous: previousComplete,
        continuationSegmentKeys: ['remote:root', 'remote:tip'],
        recoveryMessages: [],
      }).messages,
    ).toEqual([acknowledged])
  })

  it.each([
    ['a cross-source segment', 'local:tip'],
    ['a same-source segment owned by another Card', 'remote:other-card'],
  ])('rejects %s from Card history', async (_name, segmentKey) => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        cardId: 'remote:root',
        canonicalSegmentKey: 'remote:tip',
        messages: [
          { segmentKey, message: { id: 'foreign', role: 'assistant' } },
        ],
        completeness: 'complete',
        retryable: false,
        missingSegments: [],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchCompleteSessionCardHistory({
        cardId: 'remote:root',
        canonicalSegmentKey: 'remote:tip',
        continuationSegmentKeys: ['remote:root', 'remote:tip'],
      }),
    ).rejects.toThrow('Invalid Session Card response')
    expect(fetchMock.mock.calls.flat().join(' ')).not.toContain('/api/history')
  })

  it('keeps an accepted local user message while complete Card history catches up', () => {
    const server = {
      sessionKey: 'remote:tip',
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:tip',
      messages: [
        { id: 'assistant-1', role: 'assistant' as const, content: [] },
      ],
      completeness: 'complete' as const,
      retryable: false,
      missingSegments: [],
    }
    const recoveryMessages = [
      {
        role: 'user' as const,
        content: [{ type: 'text' as const, text: 'still here' }],
        clientId: 'client-1',
        status: 'done',
      },
    ]

    expect(
      mergeSessionCardHistoryResponse(server, recoveryMessages),
    ).toMatchObject({
      completeness: 'complete',
      messages: [
        { id: 'assistant-1' },
        { role: 'user', clientId: 'client-1', status: 'done' },
      ],
    })
  })

  it('moves bootstrap transient messages from legacy history into Card history', () => {
    const queryClient = new QueryClient()
    const legacyKey = chatQueryKeys.history('remote:root', 'remote:tip')
    const cardKey = sessionCardQueryKeys.history('remote:root', 'remote:tip')
    queryClient.setQueryData(legacyKey, {
      sessionKey: 'remote:tip',
      messages: [
        {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: 'bootstrap prompt' }],
          clientId: 'client-bootstrap',
          status: 'queued',
        },
      ],
    })

    moveLegacyHistoryMessagesToSessionCard(
      queryClient,
      'remote:root',
      'remote:tip',
    )

    expect(queryClient.getQueryData(legacyKey)).toBeUndefined()
    expect(queryClient.getQueryData(cardKey)).toMatchObject({
      completeness: 'partial',
      retryable: true,
      messages: [
        { role: 'user', clientId: 'client-bootstrap', status: 'queued' },
      ],
    })
    queryClient.clear()
  })

  it('keeps optimistic-only and partial caches non-authoritative', () => {
    const queryClient = new QueryClient()
    const key = sessionCardQueryKeys.history('remote:root', 'remote:tip')
    const optimisticMessage = {
      id: 'cached-optimistic',
      role: 'user' as const,
      content: [],
      __optimistic: true,
    }

    appendSessionCardHistoryMessage(
      queryClient,
      'remote:root',
      'remote:tip',
      optimisticMessage,
    )
    expect(queryClient.getQueryData(key)).toMatchObject({
      completeness: 'partial',
      retryable: true,
      messages: [{ id: 'cached-optimistic' }],
    })
    expect(
      isAuthoritativeCompleteSessionCardHistory(queryClient.getQueryData(key)),
    ).toBe(false)

    const partial = {
      sessionKey: 'remote:tip',
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:tip',
      messages: [{ id: 'server-partial', role: 'assistant', content: [] }],
      completeness: 'partial',
      retryable: true,
      missingSegments: [
        {
          segmentKey: 'remote:missing',
          retryable: true,
          error: 'temporarily unavailable',
        },
      ],
    }
    queryClient.setQueryData(key, partial)
    appendSessionCardHistoryMessage(
      queryClient,
      'remote:root',
      'remote:tip',
      optimisticMessage,
    )
    expect(queryClient.getQueryData(key)).toMatchObject({
      completeness: 'partial',
      retryable: true,
      messages: [{ id: 'server-partial' }, { id: 'cached-optimistic' }],
    })
    queryClient.clear()
  })

  it('moves Card history cache across canonical handoff without changing Card identity', () => {
    const queryClient = new QueryClient()
    const sourceKey = sessionCardQueryKeys.history('remote:root', 'remote:tip')
    const targetKey = sessionCardQueryKeys.history('remote:root', 'remote:next')
    queryClient.setQueryData(sourceKey, {
      sessionKey: 'remote:tip',
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:tip',
      messages: [{ id: 'optimistic', role: 'user', content: [] }],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    })
    queryClient.setQueryData(targetKey, {
      sessionKey: 'remote:next',
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:next',
      messages: [
        { id: 'optimistic', role: 'user', content: [] },
        { id: 'server', role: 'assistant', content: [] },
      ],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    })

    moveSessionCardHistoryMessages(
      queryClient,
      {
        cardId: 'remote:root',
        fromSegmentKey: 'remote:tip',
        canonicalSegmentKey: 'remote:next',
        runId: 'run-1',
      },
      {
        ...card,
        canonicalSegmentKey: 'remote:tip',
        continuationSegmentKeys: ['remote:tip'],
      },
      [card],
    )

    expect(queryClient.getQueryData(sourceKey)).toBeUndefined()
    expect(queryClient.getQueryData(targetKey)).toMatchObject({
      sessionKey: 'remote:next',
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:next',
      messages: [{ id: 'optimistic' }, { id: 'server' }],
    })
    queryClient.clear()
  })

  it('moves the persisted baseline so a partial successor refetch keeps prior segments', () => {
    const queryClient = new QueryClient()
    const sourceKey = sessionCardQueryKeys.history('remote:root', 'remote:tip')
    const targetKey = sessionCardQueryKeys.history('remote:root', 'remote:next')
    const sourcePersisted = {
      id: 'source-persisted',
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text: 'source history' }],
      __segmentKey: 'remote:tip',
    }
    const targetPersisted = {
      id: 'target-persisted',
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text: 'target history' }],
      __segmentKey: 'remote:next',
    }
    queryClient.setQueryData(sourceKey, {
      sessionKey: 'remote:tip',
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:tip',
      messages: [sourcePersisted],
      persistedMessages: [sourcePersisted],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    } satisfies SessionCardHistoryResponse)
    queryClient.setQueryData(targetKey, {
      sessionKey: 'remote:next',
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:next',
      messages: [targetPersisted],
      persistedMessages: [targetPersisted],
      completeness: 'partial',
      retryable: true,
      missingSegments: [
        {
          segmentKey: 'remote:tip',
          retryable: true,
          error: 'temporarily unavailable',
        },
      ],
    } satisfies SessionCardHistoryResponse)

    expect(
      moveSessionCardHistoryMessages(
        queryClient,
        {
          cardId: 'remote:root',
          fromSegmentKey: 'remote:tip',
          canonicalSegmentKey: 'remote:next',
          runId: 'run-1',
        },
        card,
        [card],
      ),
    ).toBe(true)

    const moved =
      queryClient.getQueryData<SessionCardHistoryResponse>(targetKey)!
    expect(moved.persistedMessages).toEqual([sourcePersisted, targetPersisted])
    const partialRefetch = reconcileSessionCardHistoryResponse(
      {
        sessionKey: 'remote:next',
        cardId: 'remote:root',
        canonicalSegmentKey: 'remote:next',
        messages: [targetPersisted],
        persistedMessages: [targetPersisted],
        completeness: 'partial',
        retryable: true,
        missingSegments: [
          {
            segmentKey: 'remote:tip',
            retryable: true,
            error: 'temporarily unavailable',
          },
        ],
      },
      {
        previous: moved,
        continuationSegmentKeys: ['remote:tip', 'remote:next'],
        recoveryMessages: [],
      },
    )
    expect(partialRefetch.persistedMessages).toEqual([
      sourcePersisted,
      targetPersisted,
    ])
    expect(partialRefetch.messages).toEqual([sourcePersisted, targetPersisted])
    queryClient.clear()
  })

  it('does not advance Card history when recovery persistence cannot move', () => {
    const queryClient = new QueryClient()
    const sourceKey = sessionCardQueryKeys.history('remote:root', 'remote:tip')
    const targetKey = sessionCardQueryKeys.history('remote:root', 'remote:next')
    const records = new Map<string, string>()
    const storage: Storage = {
      get length() {
        return records.size
      },
      clear: () => records.clear(),
      getItem: (key) => records.get(key) ?? null,
      key: (index) => [...records.keys()][index] ?? null,
      removeItem: (key) => {
        records.delete(key)
      },
      setItem: (key, value) => {
        if (key.includes(encodeURIComponent('remote:next'))) {
          throw new DOMException('Quota exceeded', 'QuotaExceededError')
        }
        records.set(key, value)
      },
    }
    const overlay = {
      role: 'user' as const,
      content: [{ type: 'text' as const, text: 'must survive' }],
      clientId: 'client-recovery',
    }
    replaceCardTranscriptRecoveryMessages(
      { cardId: 'remote:root', canonicalSegmentKey: 'remote:tip' },
      [overlay],
      { storage, now: 100 },
    )
    queryClient.setQueryData(sourceKey, {
      sessionKey: 'remote:tip',
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:tip',
      messages: [overlay],
      completeness: 'partial',
      retryable: true,
      missingSegments: [],
    } satisfies SessionCardHistoryResponse)

    expect(
      moveSessionCardHistoryMessages(
        queryClient,
        {
          cardId: 'remote:root',
          fromSegmentKey: 'remote:tip',
          canonicalSegmentKey: 'remote:next',
          runId: 'run-1',
        },
        card,
        [card],
        { recoveryStorage: storage, now: 100 },
      ),
    ).toBe(false)
    expect(queryClient.getQueryData(sourceKey)).toBeDefined()
    expect(queryClient.getQueryData(targetKey)).toBeUndefined()
    expect(
      readCardTranscriptRecovery(
        { cardId: 'remote:root', canonicalSegmentKey: 'remote:tip' },
        { storage, now: 100 },
      )?.messages,
    ).toEqual([overlay])
    queryClient.clear()
  })

  it.each([
    [
      'retryable complete history',
      { completeness: 'complete', retryable: true, missingSegments: [] },
    ],
    [
      'missing segment in complete history',
      {
        completeness: 'complete',
        retryable: false,
        missingSegments: [
          {
            segmentKey: 'remote:tip',
            retryable: true,
            error: 'safe public error',
          },
        ],
      },
    ],
    [
      'non-retryable partial history',
      { completeness: 'partial', retryable: false, missingSegments: [] },
    ],
    [
      'cursor on partial history',
      {
        completeness: 'partial',
        retryable: true,
        missingSegments: [],
        nextCursor: 'unsafe.cursor',
      },
    ],
  ])('rejects contradictory history payload: %s', async (_name, patch) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(
          Object.assign(
            {
              cardId: 'remote:root',
              canonicalSegmentKey: 'remote:tip',
              messages: [],
              completeness: 'complete',
              retryable: false,
              missingSegments: [],
            },
            patch,
          ),
        ),
      ),
    )

    await expect(
      fetchSessionCardHistory({
        cardId: 'remote:root',
        canonicalSegmentKey: 'remote:tip',
      }),
    ).rejects.toThrow('Invalid Session Card response')
  })

  it('rejects unbounded Card history requests without fetching', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchSessionCardHistory({
        cardId: 'remote:root',
        canonicalSegmentKey: 'remote:tip',
        limit: 501,
      }),
    ).rejects.toThrow('Invalid Session Card history request')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses strict Card-only metadata, archive, and branch mutations', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ card: { ...card, title: 'Renamed' } }))
      .mockResolvedValueOnce(
        response({ ok: true, cardId: 'remote:root', archived: true }),
      )
      .mockResolvedValueOnce(
        response(
          {
            ok: true,
            cardId: 'remote:root',
            canonicalSegmentKey: 'remote:tip',
            childSessionKey: 'remote:child',
            supported: true,
          },
          201,
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await updateSessionCardMetadata('remote:root', { manualTitle: 'Renamed' })
    await archiveSessionCard('remote:root')
    await branchSessionCard('remote:root', 'remote:tip', {
      idempotencyKey: 'branch-client-test',
      title: 'Alternate path',
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/session-cards/remote%3Aroot',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualTitle: 'Renamed' }),
      },
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/session-cards/remote%3Aroot/archive',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      },
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/session-cards/remote%3Aroot/branch',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedCanonicalSegmentKey: 'remote:tip',
          idempotencyKey: 'branch-client-test',
          title: 'Alternate path',
        }),
      },
    )
    expect(fetchMock.mock.calls.flat().join(' ')).not.toContain('/api/sessions')
    expect(fetchMock.mock.calls.flat().join(' ')).not.toContain('/api/history')
  })

  it('sends a primitive pin update and requires pinned in the mutation response', async () => {
    const withoutPinned: Record<string, unknown> = { ...card }
    delete withoutPinned.pinned
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ card: { ...card, pinned: true } }))
      .mockResolvedValueOnce(response({ card: withoutPinned }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      updateSessionCardMetadata('remote:root', { pinned: true }),
    ).resolves.toEqual({ card: { ...card, pinned: true } })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/session-cards/remote%3Aroot',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: true }),
      },
    )
    await expect(
      updateSessionCardMetadata('remote:root', { pinned: false }),
    ).rejects.toThrow('Invalid Session Card response')
  })

  it.each([
    ['missing child key', undefined],
    ['blank child key', '   '],
    ['self child key', 'remote:root'],
  ])('rejects successful branches with %s', async (_name, childSessionKey) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(
          {
            ok: true,
            cardId: 'remote:root',
            canonicalSegmentKey: 'remote:tip',
            ...(childSessionKey === undefined ? {} : { childSessionKey }),
            supported: true,
          },
          201,
        ),
      ),
    )

    await expect(
      branchSessionCard('remote:root', 'remote:tip', {
        idempotencyKey: 'branch-response-test',
      }),
    ).rejects.toThrow('Invalid Session Card response')
  })

  it.each([
    ['a branch relationship', { relationshipKind: 'branch' }],
    ['a child relationship', { relationshipKind: 'child' }],
    ['a parent Card', { parentCardId: 'remote:parent' }],
  ])('rejects metadata mutation responses with %s', async (_name, patch) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ card: { ...card, ...patch } })),
    )

    await expect(
      updateSessionCardMetadata('remote:root', { manualTitle: 'Renamed' }),
    ).rejects.toThrow('Invalid Session Card response')
  })

  it.each([
    ['relationship kind', { relationshipKind: ['root'] }],
    ['title source', { titleSource: ['manual'] }],
    [
      'child status',
      {
        childNodes: [
          {
            cardId: 'remote:child',
            sessionKey: 'remote:child',
            continuationSegmentKeys: ['remote:child'],
            relationshipKind: 'child',
            title: 'Child',
            status: ['idle'],
            updatedAt: 100,
            continuationCount: 1,
          },
        ],
      },
    ],
  ])(
    'rejects metadata mutation responses with an array-valued %s',
    async (_name, patch) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(response({ card: { ...card, ...patch } })),
      )

      await expect(
        updateSessionCardMetadata('remote:root', { manualTitle: 'Renamed' }),
      ).rejects.toThrow('Invalid Session Card response')
    },
  )

  it.each([
    [
      'child session key claiming a root continuation alias',
      {
        childNodes: [
          {
            cardId: 'remote:child',
            sessionKey: 'remote:root',
            continuationSegmentKeys: ['remote:child', 'remote:root'],
            relationshipKind: 'child',
            title: 'Child',
            status: 'idle',
            updatedAt: 100,
            continuationCount: 2,
          },
        ],
      },
    ],
    [
      'cross-child identity collision',
      {
        childNodes: [
          {
            cardId: 'remote:child-a',
            sessionKey: 'remote:child-a-tip',
            continuationSegmentKeys: ['remote:child-a', 'remote:child-a-tip'],
            relationshipKind: 'child',
            title: 'Child A',
            status: 'idle',
            updatedAt: 100,
            continuationCount: 2,
          },
          {
            cardId: 'remote:child-a-tip',
            sessionKey: 'remote:child-b-tip',
            continuationSegmentKeys: [
              'remote:child-a-tip',
              'remote:child-b-tip',
            ],
            relationshipKind: 'branch',
            title: 'Child B',
            status: 'idle',
            updatedAt: 101,
            continuationCount: 2,
          },
        ],
      },
    ],
  ])('rejects metadata mutation responses with a %s', async (_name, patch) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ card: { ...card, ...patch } })),
    )

    await expect(
      updateSessionCardMetadata('remote:root', { manualTitle: 'Renamed' }),
    ).rejects.toThrow('Invalid Session Card response')
  })

  it('accepts metadata mutation responses with distinct root and child aliases', async () => {
    const cardWithDistinctAliases = {
      ...card,
      childNodes: [
        {
          cardId: 'remote:child',
          sessionKey: 'remote:child',
          continuationSegmentKeys: ['remote:child'],
          relationshipKind: 'branch',
          title: 'Branch',
          status: 'idle',
          updatedAt: 100,
          continuationCount: 1,
        },
      ],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ card: cardWithDistinctAliases })),
    )

    await expect(
      updateSessionCardMetadata('remote:root', { manualTitle: 'Renamed' }),
    ).resolves.toEqual({ card: cardWithDistinctAliases })
  })

  it('rejects a branch response for the wrong expected canonical parent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(
          {
            ok: true,
            cardId: 'remote:root',
            canonicalSegmentKey: 'remote:other-tip',
            childSessionKey: 'remote:child',
            supported: true,
          },
          201,
        ),
      ),
    )

    await expect(
      branchSessionCard('remote:root', 'remote:tip', {
        idempotencyKey: 'branch-response-test',
      }),
    ).rejects.toThrow('Invalid Session Card response')
  })

  it('rejects an invalid expected canonical parent without fetching', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      branchSessionCard('remote:root', '   ', {
        idempotencyKey: 'branch-invalid-parent-test',
      }),
    ).rejects.toThrow('Invalid Session Card branch request')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['malformed', 'not valid because spaces'],
    ['oversized', 'a'.repeat(129)],
  ] as const)(
    'rejects a %s branch idempotency key without fetching',
    async (_name, idempotencyKey) => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      await expect(
        branchSessionCard('remote:root', 'remote:tip', { idempotencyKey }),
      ).rejects.toThrow('Invalid Session Card branch request')
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('uses the same caller-owned key when the same branch intent is retried', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        response(
          {
            ok: true,
            cardId: 'remote:root',
            canonicalSegmentKey: 'remote:tip',
            childSessionKey: 'remote:child',
            supported: true,
          },
          201,
        ),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const intent = { idempotencyKey: 'same-client-intent' }

    await branchSessionCard('remote:root', 'remote:tip', intent)
    await branchSessionCard('remote:root', 'remote:tip', intent)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstBody = (fetchMock.mock.calls[0]?.[1] as RequestInit).body
    const secondBody = (fetchMock.mock.calls[1]?.[1] as RequestInit).body
    expect(secondBody).toBe(firstBody)
    expect(JSON.parse(String(firstBody))).toEqual({
      expectedCanonicalSegmentKey: 'remote:tip',
      idempotencyKey: 'same-client-intent',
    })
  })

  it('rejects a branch child equal to the canonical parent even when the Card ID differs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(
          {
            ok: true,
            cardId: 'remote:root',
            canonicalSegmentKey: 'remote:tip',
            childSessionKey: 'remote:tip',
            supported: true,
          },
          201,
        ),
      ),
    )

    await expect(
      branchSessionCard('remote:root', 'remote:tip', {
        idempotencyKey: 'branch-response-test',
      }),
    ).rejects.toThrow('Invalid Session Card response')
  })
})
