import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  archiveSessionCard,
  branchSessionCard,
  fetchSessionCardHistory,
  fetchSessionCards,
  sessionCardQueryKeys,
  updateSessionCardMetadata,
} from './chat-queries'

const card = {
  cardId: 'remote:root',
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
  })
})

describe('Session Card fetchers', () => {
  it('lists Cards through only /api/session-cards and validates the wire payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        cards: [card],
        completeness: 'complete',
        retryable: false,
        sources: [],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSessionCards()).resolves.toEqual({
      cards: [card],
      completeness: 'complete',
      retryable: false,
      sources: [],
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/session-cards')
    expect(fetchMock.mock.calls.flat().join(' ')).not.toContain('/api/sessions')

    fetchMock.mockResolvedValueOnce(
      response({ cards: [{ ...card, archived: 'yes' }] }),
    )
    await expect(fetchSessionCards()).rejects.toThrow(
      'Invalid Session Card response',
    )
  })

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
      },
    ],
    [
      'child session key',
      {
        cardId: 'remote:child-root',
        sessionKey: 'remote:other-root',
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
                  continuationCount: 1,
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

  it('loads bounded parent history by Card route without a legacy history fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        cardId: 'remote:root',
        canonicalSegmentKey: 'remote:tip',
        messages: [{ segmentKey: 'remote:root', message: { id: 'message-1' } }],
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
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchSessionCardHistory({
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:tip',
      cursor: 'signed.cursor',
      limit: 25,
    })

    expect(result.completeness).toBe('partial')
    expect(result.retryable).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/session-cards/remote%3Aroot/history?limit=25&cursor=signed.cursor',
      { signal: undefined },
    )
    expect(fetchMock.mock.calls.flat().join(' ')).not.toContain('/api/history')
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
        body: JSON.stringify({ title: 'Alternate path' }),
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
      branchSessionCard('remote:root', 'remote:tip'),
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
            relationshipKind: 'child',
            title: 'Child',
            status: 'idle',
            updatedAt: 100,
            continuationCount: 1,
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
            relationshipKind: 'child',
            title: 'Child A',
            status: 'idle',
            updatedAt: 100,
            continuationCount: 1,
          },
          {
            cardId: 'remote:child-a-tip',
            sessionKey: 'remote:child-b-tip',
            relationshipKind: 'branch',
            title: 'Child B',
            status: 'idle',
            updatedAt: 101,
            continuationCount: 1,
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
      branchSessionCard('remote:root', 'remote:tip'),
    ).rejects.toThrow('Invalid Session Card response')
  })

  it('rejects an invalid expected canonical parent without fetching', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(branchSessionCard('remote:root', '   ')).rejects.toThrow(
      'Invalid Session Card branch request',
    )
    expect(fetchMock).not.toHaveBeenCalled()
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
      branchSessionCard('remote:root', 'remote:tip'),
    ).rejects.toThrow('Invalid Session Card response')
  })
})
