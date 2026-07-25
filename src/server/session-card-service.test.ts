import { describe, expect, it, vi } from 'vitest'

import {
  SessionCardNotFoundError,
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
      updatedAt: number
      archivedAt?: number
    }
  >()
  const archive = vi.fn((cardId: string) => {
    const value = { ...cards.get(cardId), cardId, updatedAt: 2, archivedAt: 2 }
    cards.set(cardId, value)
    return value
  })
  const update = vi.fn(
    (
      cardId: string,
      patch: { manualTitle?: string | null; autoTitle?: string | null },
    ) => {
      const value = { ...cards.get(cardId), cardId, updatedAt: 1 }
      if (patch.manualTitle === null) delete value.manualTitle
      else if (patch.manualTitle !== undefined)
        value.manualTitle = patch.manualTitle
      if (patch.autoTitle === null) delete value.autoTitle
      else if (patch.autoTitle !== undefined) value.autoTitle = patch.autoTitle
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

    await expect(service.resolveCard('root')).resolves.toMatchObject({
      card: {
        cardId: 'remote:root',
        continuationSegmentKeys: ['remote:root', 'remote:hidden', 'remote:tip'],
      },
      aliases: ['remote:root', 'root'],
    })
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

  it('preserves same-key remote and local conversations as independent source-qualified cards', async () => {
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: () =>
          Promise.resolve(page([session('main', { source: 'cli' }, 20)], 0, 1)),
      },
      localSource: {
        source: 'local',
        listSessions: () => [session('main', { source: 'local' }, 10)],
      },
      metadataStore: metadataStore(),
    })

    const listed = await service.listCards()
    expect(listed.cards).toHaveLength(2)
    expect(new Set(listed.cards.map((card) => card.cardId)).size).toBe(2)
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
          [...card.sourceBySegmentKey.values()][0],
          [...card.upstreamKeyBySegmentKey.values()][0],
        ])
        .sort((left, right) => String(left[1]).localeCompare(String(right[1]))),
    ).toEqual([
      [expect.stringContaining('local'), 'local', 'main'],
      [expect.stringContaining('remote'), 'remote', 'main'],
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
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: vi.fn().mockRejectedValue(new Error('offline')),
      },
      localSource: {
        source: 'local',
        listSessions: () => [session('local-card', { source: 'local' })],
      },
      metadataStore: metadataStore(),
    })

    await expect(service.listCards()).resolves.toMatchObject({
      completeness: 'incomplete',
      retryable: true,
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
})
