import { describe, expect, it } from 'vitest'

import { projectSessionCards } from './session-cards'
import type { SessionLineage, SessionMeta } from './types'

function session(
  key: string,
  lineage?: SessionLineage,
  updatedAt = 0,
): SessionMeta {
  return {
    key,
    friendlyId: key,
    title: `legacy title for ${key}`,
    updatedAt,
    ...(lineage ? { lineage } : {}),
  }
}

function continuationChain(): Array<SessionMeta> {
  return [
    session(
      'root',
      {
        source: 'cli',
        endReason: 'compression',
        endedAt: 100,
        lineageRootId: 'root',
        lineageTipId: 'third',
        compressionSegmentCount: 1,
      },
      100,
    ),
    session(
      'second',
      {
        parentSessionId: 'root',
        source: 'cli',
        startedAt: 100,
        endReason: 'compression',
        endedAt: 200,
        lineageRootId: 'root',
        lineageTipId: 'third',
        compressionSegmentCount: 2,
      },
      200,
    ),
    session(
      'third',
      {
        parentSessionId: 'second',
        source: 'cli',
        startedAt: 200,
        lineageRootId: 'root',
        lineageTipId: 'third',
        compressionSegmentCount: 3,
      },
      300,
    ),
  ]
}

describe('projectSessionCards', () => {
  it('collapses three confirmed continuation segments into one stable card', () => {
    const projection = projectSessionCards(continuationChain())

    expect(projection.cards).toHaveLength(1)
    expect(projection.roots).toHaveLength(1)
    expect(projection.cards[0]).toMatchObject({
      cardId: 'root',
      canonicalSegmentKey: 'third',
      continuationSegmentKeys: ['root', 'second', 'third'],
      continuationCount: 3,
      relationshipKind: 'root',
      childNodes: [],
      title: 'legacy title for third',
      titleSource: 'auto',
      updatedAt: 300,
      archived: false,
      pinned: false,
    })
    expect(projection.cards[0]?.parentCardId).toBeUndefined()
    expect(projection.cardIdBySessionKey.get('root')).toBe('root')
    expect(projection.cardIdBySessionKey.get('second')).toBe('root')
    expect(projection.cardIdBySessionKey.get('third')).toBe('root')
  })

  it('keeps branch and delegate components out of the parent continuation', () => {
    const [root, second] = continuationChain()
    const branch = session(
      'branch',
      {
        parentSessionId: 'root',
        source: 'cli',
        sessionSource: 'fork',
        lineageRootId: 'root',
        lineageTipId: 'branch',
        startedAt: 100,
      },
      500,
    )
    const delegate = session(
      'delegate',
      {
        parentSessionId: 'root',
        relationshipType: 'child_session',
        source: 'cli',
        lineageRootId: 'root',
        lineageTipId: 'delegate',
        startedAt: 100,
      },
      400,
    )

    const projection = projectSessionCards([root!, second!, branch, delegate])
    const parent = projection.indexByCardId.get('root')

    expect(parent?.continuationSegmentKeys).toEqual(['root', 'second'])
    expect(parent?.childNodes).toEqual([
      expect.objectContaining({
        cardId: 'branch',
        sessionKey: 'branch',
        relationshipKind: 'branch',
      }),
      expect.objectContaining({
        cardId: 'delegate',
        sessionKey: 'delegate',
        relationshipKind: 'child',
      }),
    ])
    expect(projection.indexByCardId.get('branch')).toMatchObject({
      parentCardId: 'root',
      continuationSegmentKeys: ['branch'],
    })
    expect(projection.indexByCardId.get('delegate')).toMatchObject({
      parentCardId: 'root',
      continuationSegmentKeys: ['delegate'],
    })
  })

  it('attaches a child whose parent is a hidden continuation to the card', () => {
    const [root, second] = continuationChain()
    const delegate = session(
      'delegate',
      {
        parentSessionId: 'second',
        relationshipType: 'child_session',
      },
      400,
    )

    const projection = projectSessionCards([root!, second!, delegate])

    expect(projection.indexByCardId.get('delegate')?.parentCardId).toBe('root')
    expect(projection.indexByCardId.get('root')?.childNodes).toEqual([
      expect.objectContaining({
        cardId: 'delegate',
        sessionKey: 'delegate',
        relationshipKind: 'child',
      }),
    ])
  })

  it('projects child lifecycle activity only through its validated parent Card', () => {
    const parent = session('parent', undefined, 10)
    const child = session(
      'child',
      { parentSessionId: 'parent', relationshipType: 'child_session' },
      20,
    )

    const projection = projectSessionCards([parent, child], {
      childActivityByParentCardId: new Map<
        string,
        Map<
          string,
          {
            status: 'idle' | 'running' | 'complete' | 'error'
            updatedAt: number
          }
        >
      >([
        [
          'parent',
          new Map([['child', { status: 'running' as const, updatedAt: 100 }]]),
        ],
        [
          'unrelated-parent',
          new Map([['child', { status: 'error' as const, updatedAt: 200 }]]),
        ],
      ]),
    })

    expect(projection.indexByCardId.get('parent')?.childNodes).toEqual([
      expect.objectContaining({
        cardId: 'child',
        status: 'running',
        updatedAt: 100,
      }),
    ])
  })

  it('promotes invalid, cyclic, and missing relationships to safe orphan cards', () => {
    const missing = session(
      'missing',
      { parentSessionId: 'not-loaded', relationshipType: 'child_session' },
      300,
    )
    const invalid = session(
      'invalid',
      { parentSessionId: 'missing', relationshipType: 'unknown' },
      200,
    )
    const cycleA = session(
      'cycle-a',
      { parentSessionId: 'cycle-b', relationshipType: 'child_session' },
      100,
    )
    const cycleB = session(
      'cycle-b',
      { parentSessionId: 'cycle-a', relationshipType: 'child_session' },
      50,
    )

    const projection = projectSessionCards([cycleB, invalid, missing, cycleA])

    expect(projection.roots.map((card) => card.cardId)).toEqual([
      'missing',
      'invalid',
      'cycle-a',
      'cycle-b',
    ])
    for (const card of projection.cards) {
      expect(card).toMatchObject({
        relationshipKind: 'orphan',
        childNodes: [],
      })
      expect(card.parentCardId).toBeUndefined()
    }
  })

  it('keeps card identity, active mapping, title metadata, and ordering stable when the tip refreshes', () => {
    const [root, second, third] = continuationChain()
    const independent = session('independent', undefined, 10)
    const cardMetadata = new Map([
      [
        'root',
        {
          manualTitle: 'Stable logical title',
          autoTitle: 'Ignored automatic title',
        },
      ],
    ])

    const before = projectSessionCards([independent, root!, second!], {
      activeSessionKey: 'second',
      cardMetadata,
    })
    const after = projectSessionCards([third!, independent, second!, root!], {
      activeSessionKey: 'third',
      cardMetadata,
    })

    expect(before.roots.map((card) => card.cardId)).toEqual([
      'root',
      'independent',
    ])
    expect(after.roots.map((card) => card.cardId)).toEqual([
      'root',
      'independent',
    ])
    expect(before.activeCardId).toBe('root')
    expect(after.activeCardId).toBe('root')
    expect(before.indexByCardId.get('root')).toMatchObject({
      cardId: 'root',
      canonicalSegmentKey: 'second',
      title: 'Stable logical title',
      titleSource: 'manual',
    })
    expect(after.indexByCardId.get('root')).toMatchObject({
      cardId: 'root',
      canonicalSegmentKey: 'third',
      title: 'Stable logical title',
      titleSource: 'manual',
    })
  })

  it('orders pinned roots first while refusing pin metadata on children', () => {
    const parent = session('parent', undefined, 10)
    const child = session(
      'child',
      { parentSessionId: 'parent', relationshipType: 'child_session' },
      300,
    )
    const newest = session('newest', undefined, 200)
    const pinnedOlder = session('pinned-older', undefined, 100)
    const metadata = new Map([
      ['pinned-older', { pinned: true }],
      ['child', { pinned: true }],
    ])

    const projection = projectSessionCards(
      [parent, child, newest, pinnedOlder],
      { cardMetadata: metadata },
    )

    expect(projection.roots.map((card) => card.cardId)).toEqual([
      'pinned-older',
      'newest',
      'parent',
    ])
    expect(projection.indexByCardId.get('pinned-older')?.pinned).toBe(true)
    expect(projection.indexByCardId.get('newest')?.pinned).toBe(false)
    expect(projection.indexByCardId.get('child')?.pinned).toBe(false)

    const continuationMetadata = new Map([['second', { pinned: true }]])
    const continuation = projectSessionCards(continuationChain(), {
      cardMetadata: continuationMetadata,
    })
    expect(continuation.roots[0]).toMatchObject({
      cardId: 'root',
      pinned: false,
    })
  })

  it('fails closed for persisted pins on orphaned child, fork, and cross-surface rows', () => {
    const rows = [
      session('root', undefined, 100),
      session(
        'orphan-child',
        { parentSessionId: 'missing', relationshipType: 'child_session' },
        300,
      ),
      session('orphan-fork', { sessionSource: 'fork' }, 200),
      session('orphan-cross-surface', { isCrossSurfaceChild: true }, 150),
    ]
    const projection = projectSessionCards(rows, {
      cardMetadata: new Map([
        ['orphan-child', { pinned: true }],
        ['orphan-fork', { pinned: true }],
        ['orphan-cross-surface', { pinned: true }],
        ['root', { pinned: true }],
      ]),
    })

    expect(projection.roots.map((card) => card.cardId)).toEqual([
      'root',
      'orphan-child',
      'orphan-fork',
      'orphan-cross-surface',
    ])
    expect(projection.roots.map((card) => card.pinned)).toEqual([
      true,
      false,
      false,
      false,
    ])
    expect([...projection.pinEligibleCardIds]).toEqual(['root'])
  })
})
