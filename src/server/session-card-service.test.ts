import { describe, expect, it, vi } from 'vitest'

import {
  SessionCardNotFoundError,
  SessionCardPinNotEligibleError,
  SessionCardProjectionIncompleteError,
  SessionCardService,
} from './session-card-service'
import type {
  SessionCardMetadataStore,
  SessionCardSessionPage,
} from './session-card-service'
import type { SessionLineage, SessionMeta } from '../screens/chat/types'

function session(
  key: string,
  lineage?: SessionLineage,
  updatedAt = 0,
): SessionMeta {
  return { key, friendlyId: key, updatedAt, ...(lineage ? { lineage } : {}) }
}

function continuationSessions(): Array<SessionMeta> {
  return [
    session(
      'root',
      {
        source: 'cli',
        endReason: 'compression',
        endedAt: 100,
        lineageRootId: 'root',
        lineageTipId: 'tip',
      },
      100,
    ),
    session(
      'hidden',
      {
        parentSessionId: 'root',
        source: 'cli',
        startedAt: 100,
        endReason: 'compression',
        endedAt: 200,
        lineageRootId: 'root',
        lineageTipId: 'tip',
      },
      200,
    ),
    session(
      'tip',
      {
        parentSessionId: 'hidden',
        source: 'cli',
        startedAt: 200,
        lineageRootId: 'root',
        lineageTipId: 'tip',
      },
      300,
    ),
  ]
}

function metadataStore(): SessionCardMetadataStore & {
  archive: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
} {
  const cards = new Map<
    string,
    {
      cardId: string
      manualTitle?: string
      autoTitle?: string
      pinned?: boolean
      updatedAt: number
      archivedAt?: number
    }
  >()
  const archive = vi.fn((cardId: string) => {
    const value = { ...cards.get(cardId), cardId, updatedAt: 2, archivedAt: 2 }
    delete value.pinned
    cards.set(cardId, value)
    return value
  })
  const update = vi.fn(
    (
      cardId: string,
      patch: {
        manualTitle?: string | null
        autoTitle?: string | null
        pinned?: boolean
      },
    ) => {
      const value = { ...cards.get(cardId), cardId, updatedAt: 1 }
      if (patch.manualTitle === null) delete value.manualTitle
      else if (patch.manualTitle !== undefined)
        value.manualTitle = patch.manualTitle
      if (patch.autoTitle === null) delete value.autoTitle
      else if (patch.autoTitle !== undefined) value.autoTitle = patch.autoTitle
      if (patch.pinned !== undefined) value.pinned = patch.pinned
      cards.set(cardId, value)
      return value
    },
  )
  return {
    list: () => [...cards.values()],
    update,
    archive,
  }
}

function page(
  sessions: Array<SessionMeta>,
  offset: number,
  total: number,
  snapshot?: string,
): SessionCardSessionPage {
  return {
    sessions,
    offset,
    limit: sessions.length,
    total,
    ...(snapshot === undefined ? {} : { snapshot }),
    hasMore: offset + sessions.length < total,
    pagination: 'supported',
  }
}

function topologySession(
  id: string,
  relationship:
    | 'root'
    | 'continuation'
    | 'branch'
    | 'delegate'
    | 'child'
    | 'orphan',
  parentSessionId: string | null = null,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    parent_session_id: parentSessionId,
    source: relationship === 'delegate' ? 'tool' : 'cli',
    started_at: '2026-07-27T10:00:00+00:00',
    ended_at: null,
    end_reason: null,
    archived: false,
    relationship,
    ...overrides,
  }
}

describe('SessionCardService collection and resolution', () => {
  it('collects every supported page and reports a complete projection', async () => {
    const all = ['a', 'b', 'c', 'd', 'e'].map((key, index) =>
      session(key, undefined, index),
    )
    const listPage = vi.fn((limit: number, offset: number) =>
      Promise.resolve(
        page(
          all.slice(offset, offset + limit),
          offset,
          all.length,
          'stable-snapshot',
        ),
      ),
    )
    const service = new SessionCardService({
      remoteSource: { source: 'remote', listPage },
      localSource: null,
      metadataStore: metadataStore(),
      pageSize: 2,
      maxSessions: 10,
    })

    const result = await service.listCards()

    expect(listPage.mock.calls).toEqual([
      [2, 0, undefined],
      [2, 2, 'remote'],
      [2, 4, 'remote'],
    ])
    expect(result.cards.map((card) => card.cardId).sort()).toEqual(
      all.map((row) => `remote:${row.key}`).sort(),
    )
    expect(result.completeness).toBe('complete')
    expect(result.sources).toEqual([
      expect.objectContaining({
        source: 'remote',
        status: 'complete',
        fetched: 5,
      }),
    ])
  })

  it('reuses a bounded projection cache while retaining an explicit refresh boundary', async () => {
    let now = 10_000
    const listPage = vi.fn(() =>
      Promise.resolve(page([session('cached')], 0, 1, 'stable-snapshot')),
    )
    const service = new SessionCardService({
      remoteSource: { source: 'remote', listPage },
      localSource: null,
      metadataStore: metadataStore(),
      now: () => now,
      projectionCacheTtlMs: 30_000,
    })

    await service.listCards()
    await service.listCards()
    expect(listPage).toHaveBeenCalledTimes(1)

    now += 30_000
    await service.listCards()
    expect(listPage).toHaveBeenCalledTimes(2)
  })

  it.each(['gateway', 'dashboard'] as const)(
    'projects the canonical %s transport from the adapter-owned canonical segment',
    async (transport) => {
      const spoofedSession = {
        ...session('owned-root'),
        canonicalTransport: transport === 'gateway' ? 'dashboard' : 'gateway',
      } as SessionMeta
      const service = new SessionCardService({
        remoteSource: {
          source: 'hermes',
          listPage: () =>
            Promise.resolve({
              ...page([spoofedSession], 0, 1),
              source: transport,
            }),
        },
        localSource: null,
        metadataStore: metadataStore(),
      })

      await expect(service.listCards()).resolves.toMatchObject({
        cards: [
          {
            cardId: 'remote:owned-root',
            canonicalSource: 'remote',
            canonicalTransport: transport,
          },
        ],
      })
      await expect(
        service.resolveCard('remote:owned-root'),
      ).resolves.toMatchObject({
        card: {
          cardId: 'remote:owned-root',
          canonicalSource: 'remote',
          canonicalTransport: transport,
        },
      })
    },
  )

  it('qualifies upstream lineage identities without losing remote continuations or nested children', async () => {
    const rows = [
      session(
        'a',
        {
          source: 'slack',
          endReason: 'compression',
          startedAt: 10,
          endedAt: 20,
          lineageRootId: 'a',
          lineageTipId: 'c',
          compressionSegmentCount: 1,
        },
        20,
      ),
      session(
        'b',
        {
          source: 'slack',
          parentSessionId: 'a',
          relationshipType: 'continuation',
          endReason: 'compression',
          startedAt: 20,
          endedAt: 30,
          lineageRootId: 'a',
          lineageTipId: 'c',
          compressionSegmentCount: 2,
        },
        30,
      ),
      session(
        'c',
        {
          source: 'slack',
          parentSessionId: 'b',
          relationshipType: 'continuation',
          startedAt: 30,
          lineageRootId: 'a',
          lineageTipId: 'c',
          compressionSegmentCount: 3,
        },
        40,
      ),
      session(
        'fork',
        {
          source: 'slack',
          parentSessionId: 'a',
          relationshipType: 'child_session',
          sessionSource: 'fork',
          startedAt: 20,
          lineageRootId: 'a',
          lineageTipId: 'fork',
        },
        60,
      ),
      session(
        'delegate',
        {
          source: 'slack',
          parentSessionId: 'b',
          relationshipType: 'child_session',
          startedAt: 30,
          lineageRootId: 'a',
          lineageTipId: 'delegate',
        },
        50,
      ),
    ]
    const service = new SessionCardService({
      remoteSource: {
        source: 'hermes',
        listPage: () =>
          Promise.resolve({
            ...page(rows, 0, rows.length),
            source: 'dashboard',
          }),
      },
      localSource: null,
      metadataStore: metadataStore(),
    })

    const collection = await service.collectSessions()
    expect(
      collection.sessions.map((row) => [
        row.key,
        row.lineage?.parentSessionId,
        row.lineage?.lineageRootId,
        row.lineage?.lineageTipId,
      ]),
    ).toEqual([
      ['remote:a', undefined, 'remote:a', 'remote:c'],
      ['remote:b', 'remote:a', 'remote:a', 'remote:c'],
      ['remote:c', 'remote:b', 'remote:a', 'remote:c'],
      ['remote:fork', 'remote:a', 'remote:a', 'remote:fork'],
      ['remote:delegate', 'remote:b', 'remote:a', 'remote:delegate'],
    ])

    await expect(service.listCards()).resolves.toMatchObject({
      cards: [
        {
          cardId: 'remote:a',
          canonicalSource: 'remote',
          canonicalTransport: 'dashboard',
          canonicalSegmentKey: 'remote:c',
          continuationSegmentKeys: ['remote:a', 'remote:b', 'remote:c'],
          continuationCount: 3,
          childNodes: [
            {
              cardId: 'remote:fork',
              sessionKey: 'remote:fork',
              continuationSegmentKeys: ['remote:fork'],
              relationshipKind: 'branch',
            },
            {
              cardId: 'remote:delegate',
              sessionKey: 'remote:delegate',
              continuationSegmentKeys: ['remote:delegate'],
              relationshipKind: 'child',
            },
          ],
        },
      ],
      completeness: 'complete',
    })
  })

  it.each([
    {
      name: 'local adapter',
      remoteSource: null,
      localSource: {
        source: 'local',
        listSessions: () => [session('local-root', { source: 'local' })],
      },
      cardId: 'local:local-root',
    },
    {
      name: 'unsupported remote adapter source',
      remoteSource: {
        source: 'unverified',
        listPage: () => Promise.resolve(page([session('remote-root')], 0, 1)),
      },
      localSource: null,
      cardId: 'remote:remote-root',
    },
  ])('omits canonical transport for $name', async (options) => {
    const service = new SessionCardService({
      remoteSource: options.remoteSource,
      localSource: options.localSource,
      metadataStore: metadataStore(),
    })

    const listed = await service.listCards()
    const resolved = await service.resolveCard(options.cardId)

    expect(listed.cards[0]).not.toHaveProperty('canonicalTransport')
    expect(resolved.card).not.toHaveProperty('canonicalTransport')
  })

  it('keeps a one-page collection complete without requiring a snapshot', async () => {
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () =>
          Promise.resolve(page([session('only-a'), session('only-b')], 0, 2)),
      },
      localSource: null,
      metadataStore: metadataStore(),
      pageSize: 2,
    })

    await expect(service.listCards()).resolves.toMatchObject({
      completeness: 'complete',
      retryable: false,
      sources: [
        expect.objectContaining({
          source: 'remote',
          status: 'complete',
          fetched: 2,
        }),
      ],
    })
  })

  it('uses the bounded safe cap in one request for a snapshot-less default source', async () => {
    const listPage = vi.fn((limit: number, offset: number) =>
      Promise.resolve(
        page(
          [session('a'), session('b'), session('c')].slice(
            offset,
            offset + limit,
          ),
          offset,
          3,
        ),
      ),
    )
    const service = new SessionCardService({
      remoteSource: { source: 'remote', listPage },
      localSource: null,
      metadataStore: metadataStore(),
    })

    await expect(service.listCards()).resolves.toMatchObject({
      completeness: 'complete',
      retryable: false,
      sources: [
        expect.objectContaining({
          source: 'remote',
          status: 'complete',
          fetched: 3,
        }),
      ],
    })
    expect(listPage).toHaveBeenCalledTimes(1)
    expect(listPage).toHaveBeenCalledWith(2000, 0, undefined)
  })

  it('never declares a same-total mutable offset collection complete without a source snapshot', async () => {
    const listPage = vi
      .fn()
      .mockResolvedValueOnce(page([session('a'), session('b')], 0, 4))
      // The backing collection changed from [A,B,C,D] to [X,A,C,D] while
      // preserving its total. Offset validation cannot detect that B no longer
      // belongs to the second source state.
      .mockResolvedValueOnce(page([session('c'), session('d')], 2, 4))
    const service = new SessionCardService({
      remoteSource: { source: 'remote', listPage },
      localSource: null,
      metadataStore: metadataStore(),
      pageSize: 2,
    })

    const result = await service.listCards()

    expect(result.cards.map((card) => card.cardId).sort()).toEqual([
      'remote:a',
      'remote:b',
      'remote:c',
      'remote:d',
    ])
    expect(result).toMatchObject({
      completeness: 'incomplete',
      retryable: true,
    })
    expect(listPage).toHaveBeenCalledTimes(2)
    expect(result.sources[0]).toMatchObject({
      source: 'remote',
      status: 'incomplete',
      fetched: 4,
      retryable: true,
      reason: 'unstable-pagination',
    })
  })

  it('rejects a source snapshot version change before retaining the changed page', async () => {
    const listPage = vi
      .fn()
      .mockResolvedValueOnce({
        ...page([session('a'), session('b')], 0, 4),
        snapshot: 'version-1',
      })
      .mockResolvedValueOnce({
        ...page([session('c'), session('d')], 2, 4),
        snapshot: 'version-2',
      })
    const service = new SessionCardService({
      remoteSource: { source: 'remote', listPage },
      localSource: null,
      metadataStore: metadataStore(),
      pageSize: 2,
    })

    const result = await service.listCards()

    expect(result.cards.map((card) => card.cardId).sort()).toEqual([
      'remote:a',
      'remote:b',
    ])
    expect(result.sources[0]).toMatchObject({
      source: 'remote',
      status: 'incomplete',
      fetched: 2,
      retryable: true,
      error: expect.stringMatching(/snapshot.*version-1.*version-2/i),
    })
  })

  it('rejects an overlapping page without counting duplicate logical identities as fetched', async () => {
    const listPage = vi
      .fn()
      .mockResolvedValueOnce(page([session('a'), session('b')], 0, 3))
      .mockResolvedValueOnce(page([session('b')], 2, 3))
    const service = new SessionCardService({
      remoteSource: { source: 'remote', listPage },
      localSource: null,
      metadataStore: metadataStore(),
      pageSize: 2,
    })

    const result = await service.listCards()

    expect(result.cards.map((card) => card.cardId).sort()).toEqual([
      'remote:a',
      'remote:b',
    ])
    expect(result).toMatchObject({
      completeness: 'incomplete',
      retryable: true,
    })
    expect(result.sources[0]).toMatchObject({
      status: 'incomplete',
      fetched: 2,
      retryable: true,
      error: expect.stringMatching(/duplicate.*remote:b/i),
    })
  })

  it.each([
    ['overlap', 1],
    ['gap', 3],
  ])(
    'rejects a page %s whose reported offset does not match exact progression',
    async (_caseName, reportedOffset) => {
      const listPage = vi
        .fn()
        .mockResolvedValueOnce(page([session('a'), session('b')], 0, 4))
        .mockResolvedValueOnce(
          page([session('c'), session('d')], reportedOffset, 4),
        )
      const service = new SessionCardService({
        remoteSource: { source: 'remote', listPage },
        localSource: null,
        metadataStore: metadataStore(),
        pageSize: 2,
      })

      const result = await service.listCards()

      expect(result.cards.map((card) => card.cardId).sort()).toEqual([
        'remote:a',
        'remote:b',
      ])
      expect(result.sources[0]).toMatchObject({
        status: 'incomplete',
        fetched: 2,
        retryable: true,
        error: expect.stringMatching(
          new RegExp(`offset.*2.*${reportedOffset}`, 'i'),
        ),
      })
    },
  )

  it('rejects a changed page total instead of declaring a mixed snapshot complete', async () => {
    const listPage = vi
      .fn()
      .mockResolvedValueOnce(page([session('a'), session('b')], 0, 4))
      .mockResolvedValueOnce(page([session('c')], 2, 3))
    const service = new SessionCardService({
      remoteSource: { source: 'remote', listPage },
      localSource: null,
      metadataStore: metadataStore(),
      pageSize: 2,
    })

    const result = await service.listCards()

    expect(result.cards.map((card) => card.cardId).sort()).toEqual([
      'remote:a',
      'remote:b',
    ])
    expect(result.sources[0]).toMatchObject({
      status: 'incomplete',
      fetched: 2,
      retryable: true,
      error: expect.stringMatching(/total.*4.*3/i),
    })
  })

  it('rejects an unexpectedly short nonterminal page', async () => {
    const listPage = vi.fn().mockResolvedValueOnce({
      ...page([session('a')], 0, 3),
      limit: 2,
      hasMore: true,
    })
    const service = new SessionCardService({
      remoteSource: { source: 'remote', listPage },
      localSource: null,
      metadataStore: metadataStore(),
      pageSize: 2,
    })

    const result = await service.listCards()

    expect(result.cards).toEqual([])
    expect(result.sources[0]).toMatchObject({
      status: 'unavailable',
      fetched: 0,
      retryable: true,
      error: expect.stringMatching(/short/i),
    })
  })

  it('stops at the safe cap and explicitly reports an incomplete collection', async () => {
    const all = ['a', 'b', 'c', 'd', 'e'].map((key) => session(key))
    const listPage = vi.fn((limit: number, offset: number) =>
      Promise.resolve(
        page(all.slice(offset, offset + limit), offset, all.length),
      ),
    )
    const service = new SessionCardService({
      remoteSource: { source: 'remote', listPage },
      localSource: null,
      metadataStore: metadataStore(),
      pageSize: 2,
      maxSessions: 3,
    })

    const result = await service.listCards()

    expect(listPage.mock.calls).toEqual([
      [2, 0, undefined],
      [1, 2, 'remote'],
    ])
    expect(result.cards).toHaveLength(3)
    expect(result.completeness).toBe('incomplete')
    expect(result.retryable).toBe(true)
    expect(result.sources[0]).toMatchObject({
      source: 'remote',
      status: 'incomplete',
      fetched: 3,
      reason: 'safe-cap',
    })
  })

  it('keeps local cards available when the remote source is unavailable', async () => {
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: vi.fn().mockRejectedValue(new Error('offline')),
      },
      localSource: {
        source: 'local',
        listSessions: () => [session('local-card', { source: 'local' }, 10)],
      },
      metadataStore: metadataStore(),
    })

    const result = await service.listCards()

    expect(result.cards).toEqual([
      expect.objectContaining({
        cardId: 'local:local-card',
        canonicalSegmentKey: 'local:local-card',
      }),
    ])
    expect(result.completeness).toBe('incomplete')
    expect(result.retryable).toBe(true)
    expect(result.sources).toEqual([
      expect.objectContaining({
        source: 'remote',
        status: 'unavailable',
        fetched: 0,
      }),
      expect.objectContaining({
        source: 'local',
        status: 'complete',
        fetched: 1,
      }),
    ])
  })

  it('merges only persisted card metadata and filters archived cards by default', async () => {
    const store = metadataStore()
    store.update('remote:visible', { manualTitle: 'Persisted title' })
    store.update('remote:archived', { autoTitle: 'Archived title' })
    store.archive('remote:archived')
    const rows = [
      { ...session('visible', undefined, 2), title: 'Legacy backend title' },
      { ...session('archived', undefined, 1), title: 'Another legacy title' },
    ]
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () => Promise.resolve(page(rows, 0, rows.length)),
      },
      localSource: null,
      metadataStore: store,
    })

    const visible = await service.listCards()
    const all = await service.listCards({ includeArchived: true })

    expect(visible.cards).toEqual([
      expect.objectContaining({
        cardId: 'remote:visible',
        title: 'Persisted title',
        titleSource: 'manual',
      }),
    ])
    expect(all.cards).toEqual([
      expect.objectContaining({
        cardId: 'remote:visible',
        title: 'Persisted title',
      }),
      expect.objectContaining({
        cardId: 'remote:archived',
        title: 'Archived title',
        archived: true,
      }),
    ])
  })

  it('projects and deterministically sorts pinned root metadata before activity order', async () => {
    const store = metadataStore()
    store.update('remote:older', { pinned: true })
    const rows = [
      session('newer', undefined, 200),
      session('older', undefined, 100),
    ]
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () => Promise.resolve(page(rows, 0, rows.length)),
      },
      localSource: null,
      metadataStore: store,
    })

    const result = await service.listCards()

    expect(
      result.cards.map(({ cardId, pinned }) => ({ cardId, pinned })),
    ).toEqual([
      { cardId: 'remote:older', pinned: true },
      { cardId: 'remote:newer', pinned: false },
    ])
  })

  it('resolves only a fresh root card ID and rejects hidden, child, and arbitrary IDs', async () => {
    const child = session(
      'child',
      {
        parentSessionId: 'hidden',
        relationshipType: 'child_session',
        source: 'cli',
      },
      400,
    )
    const rows = [...continuationSessions(), child]
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () => Promise.resolve(page(rows, 0, rows.length)),
      },
      localSource: null,
      metadataStore: metadataStore(),
    })

    const resolved = await service.resolveCard('root')
    expect(resolved).toMatchObject({
      card: {
        cardId: 'remote:root',
        continuationSegmentKeys: ['remote:root', 'remote:hidden', 'remote:tip'],
        childNodes: [
          expect.objectContaining({
            cardId: 'remote:child',
            sessionKey: 'remote:child',
            continuationSegmentKeys: ['remote:child'],
            continuationCount: 1,
          }),
        ],
      },
      aliases: ['remote:root', 'root'],
    })
    expect((await service.listCards()).cards[0]?.childNodes).toEqual([
      expect.objectContaining({
        cardId: 'remote:child',
        sessionKey: 'remote:child',
        continuationSegmentKeys: ['remote:child'],
        continuationCount: 1,
      }),
    ])
    expect(resolved.sourceBySegmentKey.get('remote:child')).toBe('remote')
    expect(resolved.upstreamKeyBySegmentKey.get('remote:child')).toBe('child')
    await expect(service.resolveCard('hidden')).rejects.toBeInstanceOf(
      SessionCardNotFoundError,
    )
    await expect(service.resolveCard('child')).rejects.toBeInstanceOf(
      SessionCardNotFoundError,
    )
    await expect(service.resolveCard('made-up')).rejects.toBeInstanceOf(
      SessionCardNotFoundError,
    )
  })

  it('resolves any validated descendant Card through its owning root', async () => {
    const child = session(
      'child',
      {
        parentSessionId: 'hidden',
        relationshipType: 'child_session',
        source: 'cli',
      },
      400,
    )
    const grandchild = session(
      'grandchild',
      {
        parentSessionId: 'child',
        relationshipType: 'child_session',
        sessionSource: 'fork',
        source: 'cli',
      },
      500,
    )
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () =>
          Promise.resolve(
            page(
              [
                ...continuationSessions(),
                child,
                grandchild,
                session('other-root'),
              ],
              0,
              6,
            ),
          ),
      },
      localSource: null,
      metadataStore: metadataStore(),
    })

    await expect(
      service.resolveChildCard('remote:root', 'remote:child'),
    ).resolves.toMatchObject({
      card: {
        cardId: 'remote:child',
        parentCardId: 'remote:root',
        canonicalSegmentKey: 'remote:child',
        continuationSegmentKeys: ['remote:child'],
      },
      pinEligible: false,
      aliases: ['remote:child'],
    })
    await expect(
      service.resolveChildCard('remote:root', 'remote:grandchild'),
    ).resolves.toMatchObject({
      card: {
        cardId: 'remote:grandchild',
        parentCardId: 'remote:child',
        canonicalSegmentKey: 'remote:grandchild',
        continuationSegmentKeys: ['remote:grandchild'],
      },
      pinEligible: false,
      aliases: ['remote:grandchild'],
    })

    await expect(
      service.resolveChildCard('remote:other-root', 'remote:child'),
    ).rejects.toBeInstanceOf(SessionCardNotFoundError)
    await expect(
      service.resolveChildCard('remote:root', 'child'),
    ).rejects.toBeInstanceOf(SessionCardNotFoundError)
    await expect(
      service.resolveChildCard('remote:root', 'remote:missing'),
    ).rejects.toBeInstanceOf(SessionCardNotFoundError)
  })

  it('persists validated child lifecycle observations through fresh list projections', async () => {
    const rows = [
      session('parent', { source: 'cli' }, 10),
      session(
        'child',
        {
          parentSessionId: 'parent',
          relationshipType: 'child_session',
          source: 'cli',
          startedAt: 20,
        },
        20,
      ),
    ]
    let now = 100
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () => Promise.resolve(page(rows, 0, rows.length)),
      },
      localSource: null,
      metadataStore: metadataStore(),
      now: () => now,
    })

    await expect(
      service.observeChildLifecycle({
        parentCardId: 'remote:parent',
        childUpstreamSessionKey: 'child',
        runId: 'child-run-1',
        status: 'running',
      }),
    ).resolves.toMatchObject({
      cardId: 'remote:parent',
      childCardId: 'remote:child',
      childSessionKey: 'remote:child',
      runId: 'child-run-1',
      status: 'running',
      updatedAt: 100,
    })
    await expect(service.listCards()).resolves.toMatchObject({
      cards: [
        {
          cardId: 'remote:parent',
          childNodes: [
            expect.objectContaining({
              cardId: 'remote:child',
              status: 'running',
              updatedAt: 100,
            }),
          ],
        },
      ],
    })

    now = 200
    await service.observeChildLifecycle({
      parentCardId: 'remote:parent',
      childUpstreamSessionKey: 'child',
      runId: 'child-run-1',
      status: 'complete',
    })
    expect((await service.listCards()).cards[0]?.childNodes[0]?.status).toBe(
      'complete',
    )

    now = 300
    await service.observeChildLifecycle({
      parentCardId: 'remote:parent',
      childUpstreamSessionKey: 'child',
      runId: 'child-run-2',
      status: 'running',
    })
    now = 400
    await service.observeChildLifecycle({
      parentCardId: 'remote:parent',
      childUpstreamSessionKey: 'child',
      runId: 'child-run-2',
      status: 'error',
    })
    expect((await service.listCards()).cards[0]?.childNodes[0]?.status).toBe(
      'error',
    )
  })

  it('rejects superseded terminals and terminal-to-running regressions for one child binding', async () => {
    const rows = [
      session('parent', { source: 'cli' }, 10),
      session(
        'child',
        {
          parentSessionId: 'parent',
          relationshipType: 'child_session',
          source: 'cli',
          startedAt: 20,
        },
        20,
      ),
    ]
    let now = 100
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () => Promise.resolve(page(rows, 0, rows.length)),
      },
      localSource: null,
      metadataStore: metadataStore(),
      now: () => now++,
    })
    const observe = (runId: string, status: 'running' | 'complete' | 'error') =>
      service.observeChildLifecycle({
        parentCardId: 'remote:parent',
        childUpstreamSessionKey: 'child',
        runId,
        status,
      })

    await expect(observe('run-a', 'running')).resolves.toMatchObject({
      runId: 'run-a',
      status: 'running',
    })
    await expect(observe('run-b', 'running')).resolves.toMatchObject({
      runId: 'run-b',
      status: 'running',
    })
    await expect(observe('run-a', 'complete')).resolves.toBeNull()
    await expect(observe('run-a', 'error')).resolves.toBeNull()
    await expect(observe('run-a', 'running')).resolves.toBeNull()
    await expect(service.listCards()).resolves.toMatchObject({
      cards: [
        {
          childNodes: [
            expect.objectContaining({
              cardId: 'remote:child',
              status: 'running',
            }),
          ],
        },
      ],
    })

    await expect(observe('run-b', 'complete')).resolves.toMatchObject({
      runId: 'run-b',
      status: 'complete',
    })
    await expect(observe('run-b', 'running')).resolves.toBeNull()
    expect((await service.listCards()).cards[0]?.childNodes[0]).toMatchObject({
      cardId: 'remote:child',
      status: 'complete',
    })
  })

  it('fails closed and clears stale child activity when the validated relationship changes', async () => {
    let rows = [
      session('parent', { source: 'cli' }, 10),
      session(
        'child',
        {
          parentSessionId: 'parent',
          relationshipType: 'child_session',
          source: 'cli',
          startedAt: 20,
        },
        20,
      ),
      session('other-parent', { source: 'cli' }, 5),
    ]
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () => Promise.resolve(page(rows, 0, rows.length)),
      },
      localSource: null,
      metadataStore: metadataStore(),
    })

    await expect(
      service.observeChildLifecycle({
        parentCardId: 'remote:other-parent',
        childUpstreamSessionKey: 'child',
        runId: 'wrong-parent-run',
        status: 'running',
      }),
    ).resolves.toBeNull()
    await service.observeChildLifecycle({
      parentCardId: 'remote:parent',
      childUpstreamSessionKey: 'child',
      runId: 'valid-run',
      status: 'running',
    })

    rows = [
      session('parent', { source: 'cli' }, 10),
      session(
        'child',
        {
          parentSessionId: 'parent',
          relationshipType: 'child_session',
          source: 'cli',
          startedAt: 30,
        },
        30,
      ),
      session('other-parent', { source: 'cli' }, 5),
    ]
    expect((await service.listCards()).cards[0]?.childNodes[0]?.status).toBe(
      'idle',
    )

    rows = [
      session('parent', { source: 'cli' }, 10),
      session(
        'child',
        {
          parentSessionId: 'other-parent',
          relationshipType: 'child_session',
          source: 'cli',
          startedAt: 30,
        },
        30,
      ),
      session('other-parent', { source: 'cli' }, 5),
    ]

    const listed = await service.listCards()
    expect(
      listed.cards.find((card) => card.cardId === 'remote:parent'),
    ).toMatchObject({ childNodes: [] })
    expect(
      listed.cards.find((card) => card.cardId === 'remote:other-parent')
        ?.childNodes[0]?.status,
    ).toBe('idle')
  })

  it('accepts only an unambiguous server-validated cold continuation alias', async () => {
    const coldTip = session('tip', {
      parentSessionId: 'previous-tip',
      relationshipType: 'continuation',
      source: 'cli',
      startedAt: 300,
      lineageRootId: 'root',
      lineageTipId: 'tip',
      parentLineageRootId: 'root',
      parentLineageTipId: 'previous-tip',
    })
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () => Promise.resolve(page([coldTip], 0, 1)),
      },
      localSource: null,
      metadataStore: metadataStore(),
    })

    await expect(service.listCards()).resolves.toMatchObject({
      completeness: 'complete',
      retryable: false,
      cardResolutions: [
        {
          cardId: 'remote:root',
          completeness: 'incomplete',
          retryable: true,
        },
      ],
    })
    await expect(
      service.resolveCard('remote:previous-tip'),
    ).resolves.toMatchObject({
      card: {
        cardId: 'remote:root',
        canonicalSegmentKey: 'remote:tip',
        continuationSegmentKeys: [
          'remote:root',
          'remote:previous-tip',
          'remote:tip',
        ],
      },
      aliases: expect.arrayContaining(['remote:root', 'remote:previous-tip']),
      collection: {
        completeness: 'incomplete',
        retryable: true,
      },
    })
  })

  it('does not promote an arbitrary missing lineage root from a lone row to a Card ID', async () => {
    const loneTip = session('tip', {
      source: 'cli',
      lineageRootId: 'arbitrary-root',
      lineageTipId: 'tip',
    })
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () => Promise.resolve(page([loneTip], 0, 1)),
      },
      localSource: null,
      metadataStore: metadataStore(),
    })

    await expect(service.resolveCard('arbitrary-root')).rejects.toBeInstanceOf(
      SessionCardNotFoundError,
    )
    await expect(service.resolveCard('tip')).resolves.toMatchObject({
      card: { cardId: 'remote:tip', canonicalSegmentKey: 'remote:tip' },
      aliases: ['remote:tip', 'tip'],
    })
  })

  it('resolves a raw remote bootstrap session only through its authoritative Card identity', async () => {
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () =>
          Promise.resolve(
            page([session('created-session', { source: 'cli' }, 20)], 0, 1),
          ),
      },
      localSource: {
        source: 'local',
        listSessions: () => [
          session('created-session', { source: 'local' }, 10),
        ],
      },
      metadataStore: metadataStore(),
    })

    await expect(
      service.resolveRemoteCardByUpstreamSession('created-session'),
    ).resolves.toMatchObject({
      card: {
        cardId: 'remote:created-session',
        canonicalSegmentKey: 'remote:created-session',
      },
      collection: { completeness: 'complete' },
    })
    await expect(
      service.resolveRemoteCardByUpstreamSession('missing-session'),
    ).rejects.toBeInstanceOf(SessionCardNotFoundError)
  })

  it('resolves a raw local bootstrap session only through one complete local parent Card', async () => {
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () =>
          Promise.resolve(
            page([session('created-session', { source: 'cli' }, 20)], 0, 1),
          ),
      },
      localSource: {
        source: 'local',
        listSessions: () => [
          session('created-session', { source: 'local' }, 10),
        ],
      },
      metadataStore: metadataStore(),
    })

    await expect(
      service.resolveLocalCardByUpstreamSession('created-session'),
    ).resolves.toMatchObject({
      card: {
        cardId: 'local:created-session',
        canonicalSegmentKey: 'local:created-session',
        canonicalSource: 'local',
        relationshipKind: 'root',
      },
      collection: { completeness: 'complete' },
    })
    await expect(
      service.resolveLocalCardByUpstreamSession('missing-session'),
    ).rejects.toBeInstanceOf(SessionCardNotFoundError)
  })

  it('prefers a complete remote record over a local cache with the same explicit upstream identity', async () => {
    const remote = {
      ...session('shared', { source: 'cli' }, 20),
      backendKey: 'shared',
      title: 'Remote authoritative title',
    }
    const cached = {
      ...session('cache-shared', { source: 'local' }, 10),
      backendKey: 'shared',
      title: 'Cached local title',
    }
    const service = new SessionCardService({
      remoteSource: {
        source: 'hermes',
        listPage: () =>
          Promise.resolve({
            ...page([remote], 0, 1),
            source: 'gateway',
          }),
      },
      localSource: {
        source: 'local',
        listSessions: () => [
          cached,
          session('local-only', { source: 'local' }, 5),
        ],
      },
      metadataStore: metadataStore(),
    })

    const collection = await service.collectSessions()
    expect(collection.sessions.map((row) => row.key).sort()).toEqual([
      'local:local-only',
      'remote:shared',
    ])

    const listed = await service.listCards()
    expect(listed.cards).toEqual([
      expect.objectContaining({
        cardId: 'remote:shared',
        canonicalSource: 'remote',
        title: 'Remote authoritative title',
      }),
      expect.objectContaining({
        cardId: 'local:local-only',
        canonicalSource: 'local',
      }),
    ])
    await expect(service.resolveCard('remote:shared')).resolves.toMatchObject({
      sourceBySegmentKey: new Map([['remote:shared', 'gateway']]),
      upstreamKeyBySegmentKey: new Map([['remote:shared', 'shared']]),
      collection: { completeness: 'complete', retryable: false },
    })
  })

  it.each([
    {
      name: 'unavailable',
      expectedStatus: 'unavailable',
      listPage: vi.fn().mockRejectedValue(new Error('remote offline')),
    },
    {
      name: 'incomplete',
      expectedStatus: 'incomplete',
      listPage: vi.fn().mockResolvedValue({
        ...page(
          [
            {
              ...session('shared', { source: 'cli' }, 20),
              backendKey: 'shared',
            },
          ],
          0,
          2,
        ),
        hasMore: true,
        pagination: 'unsupported' as const,
      }),
    },
  ])(
    'preserves an explicit local cache fallback when remote collection is $name',
    async ({ expectedStatus, listPage }) => {
      const cached = {
        ...session('cache-shared', { source: 'local' }, 10),
        backendKey: 'shared',
      }
      const service = new SessionCardService({
        remoteSource: { source: 'remote', listPage },
        localSource: {
          source: 'local',
          listSessions: () => [cached],
        },
        metadataStore: metadataStore(),
        pageSize: 1,
      })

      const collection = await service.collectSessions()
      expect(collection.sessions.map((row) => row.key)).toEqual([
        'local:cache-shared',
      ])
      expect(collection.sourceBySessionKey.get('local:cache-shared')).toBe(
        'local',
      )
      expect(
        collection.sourceStatusBySessionKey.get('local:cache-shared'),
      ).toMatchObject({
        status: expectedStatus,
        retryable: true,
      })

      await expect(service.listCards()).resolves.toMatchObject({
        cards: [
          {
            cardId: 'local:cache-shared',
            canonicalSource: 'local',
          },
        ],
        cardResolutions: [
          {
            cardId: 'local:cache-shared',
            completeness: 'incomplete',
            retryable: true,
          },
        ],
        completeness: 'incomplete',
        retryable: true,
      })
    },
  )

  it.each([
    {
      fallback: 'root',
      local: {
        ...session('cached-root', { source: 'local' }, 10),
        backendKey: 'root',
      },
      excludedRemoteCardId: 'remote:root',
      retainedRemoteCardId: 'remote:child',
    },
    {
      fallback: 'child',
      local: {
        ...session('cached-child', { source: 'local' }, 10),
        backendKey: 'child',
      },
      excludedRemoteCardId: 'remote:child',
      retainedRemoteCardId: 'remote:root',
    },
  ])(
    'does not reintroduce an excluded remote $fallback identity during topology closure',
    async ({ local, excludedRemoteCardId, retainedRemoteCardId }) => {
      const remoteRows = [
        { ...session('root', undefined, 20), backendKey: 'root' },
        { ...session('child', undefined, 30), backendKey: 'child' },
      ]
      const service = new SessionCardService({
        remoteSource: {
          source: 'remote',
          listPage: () =>
            Promise.resolve({
              ...page(remoteRows, 0, 3),
              hasMore: true,
              pagination: 'unsupported',
            }),
        },
        localSource: { source: 'local', listSessions: () => [local] },
        metadataStore: metadataStore(),
        pageSize: 2,
        topologySource: {
          listAll: () =>
            Promise.resolve({
              snapshot: 'topology-source-precedence',
              sessions: [
                topologySession('root', 'root'),
                topologySession('child', 'child', 'root'),
              ],
            }),
          invalidate: vi.fn(),
        },
      })

      const collection = await service.collectSessions()
      const keys = collection.sessions.map((row) => row.key)
      expect(keys).not.toContain(excludedRemoteCardId)
      expect(keys).toContain(retainedRemoteCardId)
      expect(keys).toContain(`local:${local.key}`)
      expect(
        keys.filter(
          (key) => key === excludedRemoteCardId || key === `local:${local.key}`,
        ),
      ).toHaveLength(1)

      const listed = await service.listCards()
      expect(JSON.stringify(listed.cards)).not.toContain(excludedRemoteCardId)
      expect(listed.cards.map((card) => card.cardId)).toContain(
        `local:${local.key}`,
      )
    },
  )

  it('preserves remote and local topology members when shared identity is unproven', async () => {
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () =>
          Promise.resolve({
            ...page([session('root'), session('child')], 0, 3),
            hasMore: true,
            pagination: 'unsupported',
          }),
      },
      localSource: {
        source: 'local',
        listSessions: () => [session('root', { source: 'local' })],
      },
      metadataStore: metadataStore(),
      pageSize: 2,
      topologySource: {
        listAll: () =>
          Promise.resolve({
            snapshot: 'topology-unproven-precedence',
            sessions: [
              topologySession('root', 'root'),
              topologySession('child', 'child', 'root'),
            ],
          }),
        invalidate: vi.fn(),
      },
    })

    const collection = await service.collectSessions()
    expect(collection.sessions.map((row) => row.key).sort()).toEqual([
      'local:root',
      'remote:child',
      'remote:root',
    ])
  })

  it('preserves same-key remote and local conversations as independent source-qualified cards', async () => {
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () =>
          Promise.resolve(
            page(
              [
                {
                  ...session('main', { source: 'cli' }, 10),
                  title: 'Identical display title',
                },
              ],
              0,
              1,
            ),
          ),
      },
      localSource: {
        source: 'local',
        listSessions: () => [
          {
            ...session('main', { source: 'local' }, 10),
            title: 'Identical display title',
          },
        ],
      },
      metadataStore: metadataStore(),
    })

    const listed = await service.listCards()
    expect(listed.cards).toHaveLength(2)
    expect(new Set(listed.cards.map((card) => card.cardId)).size).toBe(2)
    expect(new Set(listed.cards.map((card) => card.canonicalSource))).toEqual(
      new Set(['local', 'remote']),
    )
    await expect(service.resolveCard('main')).rejects.toBeInstanceOf(
      SessionCardNotFoundError,
    )

    const resolved = await Promise.all(
      listed.cards.map((card) => service.resolveCard(card.cardId)),
    )
    expect(
      resolved
        .map((card) => [
          card.card.cardId,
          card.card.canonicalSource,
          [...card.sourceBySegmentKey.values()][0],
          [...card.upstreamKeyBySegmentKey.values()][0],
        ])
        .sort((left, right) => String(left[2]).localeCompare(String(right[2]))),
    ).toEqual([
      [expect.stringContaining('local'), 'local', 'local', 'main'],
      [expect.stringContaining('remote'), 'remote', 'remote', 'main'],
    ])
  })

  it('keeps local identity and metadata stable when a same-key remote source disappears', async () => {
    let remoteAvailable = true
    const store = metadataStore()
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () =>
          remoteAvailable
            ? Promise.resolve(
                page([session('main', { source: 'cli' }, 20)], 0, 1),
              )
            : Promise.reject(new Error('remote offline')),
      },
      localSource: {
        source: 'local',
        listSessions: () => [session('main', { source: 'local' }, 10)],
      },
      metadataStore: store,
    })

    const colliding = await service.listCards({ includeArchived: true })
    const localCard = (
      await Promise.all(
        colliding.cards.map((card) => service.resolveCard(card.cardId)),
      )
    ).find((card) => [...card.sourceBySegmentKey.values()][0] === 'local')
    expect(localCard).toBeDefined()

    await service.updateCardMetadata(localCard!.card.cardId, {
      manualTitle: 'Local title',
    })
    await service.archiveCard(localCard!.card.cardId)
    remoteAvailable = false

    const recovered = await service.listCards({ includeArchived: true })
    expect(recovered.cards).toContainEqual(
      expect.objectContaining({
        cardId: localCard!.card.cardId,
        title: 'Local title',
        archived: true,
      }),
    )
    await expect(
      service.resolveCard(localCard!.card.cardId, { includeArchived: true }),
    ).resolves.toMatchObject({ card: { cardId: localCard!.card.cardId } })
  })

  it('marks a collection incomplete instead of combining pages from different sources', async () => {
    const listPage = vi
      .fn()
      .mockResolvedValueOnce({
        ...page([session('dashboard-row')], 0, 2),
        source: 'dashboard',
      })
      .mockResolvedValueOnce({
        ...page([session('gateway-row')], 1, 2),
        source: 'gateway',
      })
    const service = new SessionCardService({
      remoteSource: { source: 'hermes', listPage },
      localSource: null,
      metadataStore: metadataStore(),
      pageSize: 1,
    })

    const result = await service.listCards()

    expect(listPage.mock.calls).toEqual([
      [1, 0, undefined],
      [1, 1, 'dashboard'],
    ])
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]).toMatchObject({
      canonicalSegmentKey: 'remote:dashboard-row',
    })
    expect(result).toMatchObject({
      completeness: 'incomplete',
      retryable: true,
    })
    expect(result.sources[0]).toMatchObject({
      source: 'dashboard',
      status: 'incomplete',
      fetched: 1,
      retryable: true,
    })
  })

  it('ties resolved-card completeness only to the source required by that card', async () => {
    const store = metadataStore()
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: vi.fn().mockRejectedValue(new Error('offline')),
      },
      localSource: {
        source: 'local',
        listSessions: () => [session('local-card', { source: 'local' })],
      },
      metadataStore: store,
    })

    await expect(service.listCards()).resolves.toMatchObject({
      completeness: 'incomplete',
      retryable: true,
      cardResolutions: [
        {
          cardId: 'local:local-card',
          completeness: 'complete',
          retryable: false,
        },
      ],
    })
    await expect(
      service.resolveCard('local:local-card'),
    ).resolves.toMatchObject({
      collection: {
        completeness: 'complete',
        retryable: false,
        sources: [
          expect.objectContaining({ source: 'local', status: 'complete' }),
        ],
      },
    })
    await expect(
      service.updateCardMetadata('local:local-card', {
        manualTitle: 'Still authoritative',
      }),
    ).resolves.toMatchObject({
      cardId: 'local:local-card',
      manualTitle: 'Still authoritative',
    })
    expect(store.update).toHaveBeenCalledTimes(1)
  })

  it('rejects metadata and archive mutations when the required Card projection is incomplete', async () => {
    const store = metadataStore()
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () =>
          Promise.resolve({
            ...page([session('root')], 0, 2),
            hasMore: true,
            pagination: 'unsupported',
          }),
      },
      localSource: null,
      metadataStore: store,
      maxSessions: 1,
    })

    await expect(
      service.updateCardMetadata('root', { manualTitle: 'Unsafe' }),
    ).rejects.toBeInstanceOf(SessionCardProjectionIncompleteError)
    await expect(service.archiveCard('root')).rejects.toBeInstanceOf(
      SessionCardProjectionIncompleteError,
    )
    expect(store.update).not.toHaveBeenCalled()
    expect(store.archive).not.toHaveBeenCalled()
  })

  it('archives by fresh card ID without invoking any backend deletion', async () => {
    const deleteSession = vi.fn()
    const store = metadataStore()
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () => Promise.resolve(page([session('root')], 0, 1)),
        deleteSession,
      },
      localSource: null,
      metadataStore: store,
    })

    await expect(service.archiveCard('root')).resolves.toMatchObject({
      cardId: 'remote:root',
      archivedAt: 2,
    })
    expect(store.archive).toHaveBeenCalledWith('remote:root')
    expect(deleteSession).not.toHaveBeenCalled()
    await expect(service.listCards()).resolves.toMatchObject({ cards: [] })
  })

  it('resolves a root alias before pinning and never invokes an upstream mutation', async () => {
    const updateSession = vi.fn()
    const store = metadataStore()
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () => Promise.resolve(page([session('root')], 0, 1)),
        updateSession,
      },
      localSource: null,
      metadataStore: store,
    })

    await expect(
      service.updateCardMetadata('root', { pinned: true }),
    ).resolves.toMatchObject({ cardId: 'remote:root', pinned: true })
    expect(store.update).toHaveBeenCalledWith('remote:root', { pinned: true })
    expect(updateSession).not.toHaveBeenCalled()
    await expect(
      service.updateCardMetadata('remote:missing', { pinned: true }),
    ).rejects.toBeInstanceOf(SessionCardNotFoundError)
    expect(store.update).toHaveBeenCalledTimes(1)
  })

  it('rejects pinning an orphan with child relationship provenance', async () => {
    const store = metadataStore()
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () =>
          Promise.resolve(
            page(
              [
                session('orphan-child', {
                  parentSessionId: 'not-loaded',
                  relationshipType: 'child_session',
                }),
              ],
              0,
              1,
            ),
          ),
      },
      localSource: null,
      metadataStore: store,
    })

    await expect(
      service.updateCardMetadata('orphan-child', { pinned: true }),
    ).rejects.toBeInstanceOf(SessionCardPinNotEligibleError)
    expect(store.update).not.toHaveBeenCalled()
    await expect(
      service.updateCardMetadata('orphan-child', { pinned: false }),
    ).resolves.toMatchObject({ cardId: 'remote:orphan-child', pinned: false })
  })

  it('clears durable pin metadata atomically when archiving', async () => {
    const store = metadataStore()
    store.update('remote:root', { pinned: true })
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () => Promise.resolve(page([session('root')], 0, 1)),
      },
      localSource: null,
      metadataStore: store,
    })

    await service.archiveCard('remote:root')
    const listed = await service.listCards({ includeArchived: true })

    expect(listed.cards).toEqual([
      expect.objectContaining({
        cardId: 'remote:root',
        archived: true,
        pinned: false,
      }),
    ])
    expect(store.list()[0]).not.toHaveProperty('pinned')
  })

  it('uses adapter topology as the only remote relationship graph, including hidden nodes and orphans', async () => {
    const topologySource = {
      listAll: vi.fn().mockResolvedValue({
        snapshot: 'authoritative-snapshot',
        sessions: [
          topologySession('root', 'root', null, {
            ended_at: '2026-07-27T10:10:00+00:00',
            end_reason: 'compression',
            archived: true,
          }),
          topologySession('continuation', 'continuation', 'root', {
            started_at: '2026-07-27T10:09:00+00:00',
            ended_at: '2026-07-27T10:20:00+00:00',
            end_reason: 'compression',
          }),
          topologySession('tip', 'continuation', 'continuation', {
            started_at: '2026-07-27T10:20:00+00:00',
          }),
          topologySession('branch', 'branch', 'root'),
          topologySession('delegate', 'delegate', 'root'),
          topologySession('child-parent', 'root'),
          topologySession('child', 'child', 'child-parent'),
          topologySession('orphan', 'orphan'),
        ],
      }),
      invalidate: vi.fn(),
    }
    const remoteRows = [
      session('tip', undefined, 30),
      session('child-parent', undefined, 20),
      session('orphan', undefined, 5),
      session(
        'projected-fallback-child',
        { parentSessionId: 'root', relationshipType: 'child_session' },
        40,
      ),
    ]
    const service = new SessionCardService({
      remoteSource: {
        source: 'hermes',
        listPage: () =>
          Promise.resolve({
            ...page(remoteRows, 0, remoteRows.length),
            source: 'gateway',
          }),
      },
      localSource: null,
      metadataStore: metadataStore(),
      topologySource,
    })

    const listed = await service.listCards({ includeArchived: true })

    expect(topologySource.listAll).toHaveBeenCalledTimes(1)
    expect(listed.completeness).toBe('complete')
    expect(listed.sources).toContainEqual(
      expect.objectContaining({
        source: 'session-topology-adapter',
        status: 'complete',
        fetched: 8,
      }),
    )
    expect(listed.cards).toContainEqual(
      expect.objectContaining({
        cardId: 'remote:root',
        canonicalSegmentKey: 'remote:tip',
        continuationSegmentKeys: [
          'remote:root',
          'remote:continuation',
          'remote:tip',
        ],
        childNodes: [
          expect.objectContaining({
            cardId: 'remote:branch',
            relationshipKind: 'branch',
          }),
          expect.objectContaining({
            cardId: 'remote:delegate',
            relationshipKind: 'child',
          }),
        ],
      }),
    )
    expect(listed.cards).toContainEqual(
      expect.objectContaining({
        cardId: 'remote:child-parent',
        childNodes: [
          expect.objectContaining({
            cardId: 'remote:child',
            relationshipKind: 'child',
          }),
        ],
      }),
    )
    expect(listed.cards).toContainEqual(
      expect.objectContaining({
        cardId: 'remote:orphan',
        relationshipKind: 'orphan',
      }),
    )
    expect(listed.cards).toContainEqual(
      expect.objectContaining({
        cardId: 'remote:projected-fallback-child',
        relationshipKind: 'root',
      }),
    )
    expect(
      listed.cards
        .flatMap((card) => card.childNodes)
        .map((child) => child.cardId),
    ).not.toContain('remote:projected-fallback-child')
  })

  it('fails closed for remote consolidation when topology is unavailable while preserving standalone local cards', async () => {
    const topologySource = {
      listAll: vi
        .fn()
        .mockRejectedValue(
          new Error('Bearer private-token at private.internal'),
        ),
      invalidate: vi.fn(),
    }
    const service = new SessionCardService({
      remoteSource: {
        source: 'hermes',
        listPage: () =>
          Promise.resolve({
            ...page(
              [
                session('root', undefined, 10),
                session(
                  'projected-child',
                  {
                    parentSessionId: 'root',
                    relationshipType: 'child_session',
                  },
                  20,
                ),
              ],
              0,
              2,
            ),
            source: 'gateway',
          }),
      },
      localSource: {
        source: 'local',
        listSessions: () => [session('local-root', { source: 'local' })],
      },
      metadataStore: metadataStore(),
      topologySource,
    })

    const listed = await service.listCards()

    expect(listed.completeness).toBe('incomplete')
    expect(listed.retryable).toBe(true)
    expect(listed.cards.map((card) => card.cardId).sort()).toEqual([
      'local:local-root',
      'remote:projected-child',
      'remote:root',
    ])
    expect(listed.cards.every((card) => card.childNodes.length === 0)).toBe(
      true,
    )
    expect(listed.sources).toContainEqual({
      source: 'session-topology-adapter',
      status: 'unavailable',
      fetched: 0,
      retryable: true,
      error: 'Session topology is unavailable.',
    })
    expect(JSON.stringify(listed.sources)).not.toMatch(
      /private-token|private\.internal|Bearer/,
    )
    expect(listed.cardResolutions).toContainEqual({
      cardId: 'local:local-root',
      completeness: 'complete',
      retryable: false,
    })
    expect(listed.cardResolutions).toContainEqual({
      cardId: 'remote:root',
      completeness: 'incomplete',
      retryable: true,
    })
  })

  it('forwards topology invalidation to the configured private source', () => {
    const topologySource = {
      listAll: vi.fn(),
      invalidate: vi.fn(),
    }
    const service = new SessionCardService({
      remoteSource: null,
      localSource: null,
      metadataStore: metadataStore(),
      topologySource,
    })

    service.invalidateTopology()

    expect(topologySource.invalidate).toHaveBeenCalledTimes(1)
  })
})
