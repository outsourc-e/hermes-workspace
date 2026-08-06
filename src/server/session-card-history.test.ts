import { describe, expect, it, vi } from 'vitest'

import {
  SessionCardHistoryCursorError,
  SessionCardHistoryService,
} from './session-card-history'
import { SessionCardService } from './session-card-service'
import type { SessionCardHistoryMessageSource } from './session-card-history'
import type { SessionCardMetadataStore } from './session-card-service'
import type { SessionLineage, SessionMeta } from '../screens/chat/types'

function session(
  key: string,
  lineage?: SessionLineage,
  updatedAt = 0,
): SessionMeta {
  return { key, friendlyId: key, updatedAt, ...(lineage ? { lineage } : {}) }
}

function chain(tip = 'third'): Array<SessionMeta> {
  const rows = [
    session('first', {
      source: 'cli',
      endReason: 'compression',
      endedAt: 100,
      lineageRootId: 'first',
      lineageTipId: tip,
    }),
    session('second', {
      parentSessionId: 'first',
      source: 'cli',
      startedAt: 100,
      endReason: 'compression',
      endedAt: 200,
      lineageRootId: 'first',
      lineageTipId: tip,
    }),
    session(tip, {
      parentSessionId: 'second',
      source: 'cli',
      startedAt: 200,
      lineageRootId: 'first',
      lineageTipId: tip,
    }),
  ]
  return rows
}

function numberedChain(
  count: number,
  keyFor = (index: number) => `segment-${index + 1}`,
): Array<SessionMeta> {
  return Array.from({ length: count }, (_, index) => {
    const key = keyFor(index)
    const previous = index > 0 ? keyFor(index - 1) : undefined
    return session(key, {
      ...(previous ? { parentSessionId: previous } : {}),
      source: 'cli',
      ...(index < count - 1
        ? { endReason: 'compression', endedAt: index + 1 }
        : {}),
      ...(index > 0 ? { startedAt: index } : {}),
      lineageRootId: keyFor(0),
      lineageTipId: keyFor(count - 1),
    })
  })
}

const noMetadata: SessionCardMetadataStore = {
  list: () => [],
  update: () => {
    throw new Error('not used')
  },
  archive: () => {
    throw new Error('not used')
  },
}

function cardService(rows: () => Array<SessionMeta>): SessionCardService {
  return new SessionCardService({
    remoteSource: {
      source: 'remote',
      listPage: (limit, offset) => {
        const all = rows()
        const sessions = all.slice(offset, offset + limit)
        return Promise.resolve({
          sessions,
          total: all.length,
          limit,
          offset,
          hasMore: offset + sessions.length < all.length,
          pagination: 'supported',
        })
      },
    },
    localSource: null,
    metadataStore: noMetadata,
  })
}

function source(
  messages: Record<string, Array<Record<string, unknown>> | Error>,
): SessionCardHistoryMessageSource & {
  getMessages: ReturnType<typeof vi.fn>
  setMessages: (
    segmentKey: string,
    value: Array<Record<string, unknown>> | Error,
  ) => void
} {
  return {
    getMessages: vi.fn((segmentKey: string) => {
      const value = messages[segmentKey]
      return value instanceof Error
        ? Promise.reject(value)
        : Promise.resolve({
            messages: value ?? [],
            source: 'remote',
            resolvedSegmentKey: segmentKey,
          })
    }),
    setMessages(segmentKey, value) {
      messages[segmentKey] = value
    },
  }
}

describe('SessionCardHistoryService', () => {
  it('assembles three validated segments oldest-to-newest and preserves each upstream order', async () => {
    const messages = source({
      first: [
        { id: '1a', role: 'user', content: 'first-a' },
        { id: '1b', role: 'assistant', content: 'first-b' },
      ],
      second: [
        { id: '2a', role: 'user', content: 'second-a' },
        { id: '2b', role: 'assistant', content: 'second-b' },
      ],
      third: [{ id: '3a', role: 'user', content: 'third-a' }],
    })
    const history = new SessionCardHistoryService({
      cardService: cardService(() => chain()),
      messageSource: messages,
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const result = await history.fetch({ cardId: 'first', limit: 20 })

    expect(messages.getMessages.mock.calls.map(([key]) => key)).toEqual([
      'first',
      'second',
      'third',
    ])
    expect(
      result.messages.map((entry) => [entry.segmentKey, entry.message.content]),
    ).toEqual([
      ['remote:first', 'first-a'],
      ['remote:first', 'first-b'],
      ['remote:second', 'second-a'],
      ['remote:second', 'second-b'],
      ['remote:third', 'third-a'],
    ])
    expect(result).toMatchObject({
      cardId: 'remote:first',
      canonicalSegmentKey: 'remote:third',
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    })
  })

  it.each([3, 5, 7])(
    'reaches the root through every page of an odd %i-segment chain',
    async (count) => {
      const entries = Object.fromEntries(
        Array.from({ length: count }, (_, index) => {
          const key = `segment-${index + 1}`
          return [
            key,
            [{ id: key, role: 'user', content: key, timestamp: index }],
          ]
        }),
      )
      const messages = source(entries)
      const history = new SessionCardHistoryService({
        cardService: cardService(() => numberedChain(count)),
        messageSource: messages,
        cursorSecret: Buffer.from('history-test-secret'),
      })

      let page = await history.fetch({
        cardId: 'segment-1',
        window: 'recent',
      })
      const seen = new Set(page.messages.map((message) => message.segmentKey))
      while (page.previousCursor) {
        page = await history.fetch({
          cardId: 'segment-1',
          window: 'recent',
          cursor: page.previousCursor,
        })
        for (const message of page.messages) seen.add(message.segmentKey)
      }

      expect([...seen].sort()).toEqual(
        Array.from(
          { length: count },
          (_, index) => `remote:segment-${index + 1}`,
        ).sort(),
      )
    },
  )

  it('keeps issued recent cursors below the accepted URL limit on long chains', async () => {
    const count = 61
    const keyFor = (index: number) =>
      `${String(index).padStart(2, '0')}-${'x'.repeat(40)}`
    const entries = Object.fromEntries(
      Array.from({ length: count }, (_, index) => {
        const key = keyFor(index)
        return [
          key,
          [{ id: key, role: 'user', content: key, timestamp: index }],
        ]
      }),
    )
    const history = new SessionCardHistoryService({
      cardService: cardService(() => numberedChain(count, keyFor)),
      messageSource: source(entries),
      cursorSecret: Buffer.from('history-test-secret'),
    })

    let page = await history.fetch({ cardId: keyFor(0), window: 'recent' })
    while (page.previousCursor) {
      expect(page.previousCursor.length).toBeLessThanOrEqual(4096)
      page = await history.fetch({
        cardId: keyFor(0),
        window: 'recent',
        cursor: page.previousCursor,
      })
    }
  })

  it('loads two recent continuation segments and pages two older segments without reading the full Card', async () => {
    const segments = ['first', 'second', 'third', 'fourth', 'fifth']
    let rows = segments.map((key, index) =>
      session(key, {
        source: 'cli',
        ...(index > 0 ? { parentSessionId: segments[index - 1] } : {}),
        ...(index < segments.length - 1
          ? { endReason: 'compression', endedAt: (index + 1) * 100 }
          : {}),
        ...(index > 0 ? { startedAt: index * 100 } : {}),
        lineageRootId: 'first',
        lineageTipId: 'fifth',
      }),
    )
    rows.push(session('other'))
    const messages = source({
      first: [{ id: 'first', content: 'first' }],
      second: [{ id: 'second', content: 'second' }],
      third: [{ id: 'third', role: 'user', content: 'third', timestamp: 3 }],
      fourth: [
        // A cloned prefix with a changed row ID can only be proven duplicate
        // by reading the already-visible boundary segment.
        {
          id: 'third-clone',
          role: 'user',
          content: 'third',
          timestamp: 3,
        },
        { id: 'fourth', role: 'assistant', content: 'fourth', timestamp: 4 },
      ],
      fifth: [{ id: 'fifth', content: 'fifth' }],
      other: [{ id: 'other', content: 'other' }],
    })
    const history = new SessionCardHistoryService({
      cardService: cardService(() => rows),
      messageSource: messages,
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const recent = await history.fetch({ cardId: 'first', window: 'recent' })

    expect(messages.getMessages.mock.calls.map(([key]) => key)).toEqual([
      'fourth',
      'fifth',
    ])
    expect(recent).toMatchObject({
      completeness: 'partial',
      retryable: false,
      missingSegments: [],
      loadedSegmentKeys: ['remote:fourth', 'remote:fifth'],
      previousCursor: expect.any(String),
    })

    const older = await history.fetch({
      cardId: 'first',
      window: 'recent',
      cursor: recent.previousCursor,
    })

    // The prior two visible segments are re-read before the page, and the
    // prospective full window is re-read after it to reject source changes
    // that occur during a multi-segment older request.
    expect(messages.getMessages.mock.calls.map(([key]) => key)).toEqual([
      'fourth',
      'fifth',
      'fourth',
      'fifth',
      'second',
      'third',
      'fourth',
      'second',
      'third',
      'fourth',
      'fifth',
    ])
    expect(older).toMatchObject({
      loadedSegmentKeys: ['remote:second', 'remote:third', 'remote:fourth'],
      previousCursor: expect.any(String),
    })
    expect(older.messages.map((entry) => entry.message.content)).toEqual([
      'second',
      'third',
      'fourth',
    ])

    messages.setMessages('fourth', [
      {
        id: 'third-clone',
        role: 'user',
        content: 'third',
        timestamp: 3,
      },
      {
        id: 'fourth-updated-after-cursor',
        role: 'assistant',
        content: 'fourth updated',
        timestamp: 4,
      },
    ])
    await expect(
      history.fetch({
        cardId: 'first',
        window: 'recent',
        cursor: recent.previousCursor,
      }),
    ).rejects.toBeInstanceOf(SessionCardHistoryCursorError)
    messages.setMessages('fourth', [
      {
        id: 'third-clone',
        role: 'user',
        content: 'third',
        timestamp: 3,
      },
      { id: 'fourth', role: 'assistant', content: 'fourth', timestamp: 4 },
    ])

    messages.setMessages('fifth', [
      {
        id: 'fifth-rewritten-without-list-generation',
        role: 'assistant',
        content: 'fifth rewritten',
        timestamp: 5,
      },
    ])
    await expect(
      history.fetch({
        cardId: 'first',
        window: 'recent',
        cursor: recent.previousCursor,
      }),
    ).rejects.toBeInstanceOf(SessionCardHistoryCursorError)
    messages.setMessages('fifth', [
      { id: 'fifth', role: 'assistant', content: 'fifth', timestamp: 5 },
    ])

    rows = rows.map((row) =>
      row.key === 'fifth' ? { ...row, updatedAt: 1 } : row,
    )
    await expect(
      history.fetch({
        cardId: 'first',
        window: 'recent',
        cursor: recent.previousCursor,
      }),
    ).rejects.toBeInstanceOf(SessionCardHistoryCursorError)

    const cursor = recent.previousCursor!
    const replacement = cursor.endsWith('a') ? 'b' : 'a'
    await expect(
      history.fetch({
        cardId: 'first',
        window: 'recent',
        cursor: `${cursor.slice(0, -1)}${replacement}`,
      }),
    ).rejects.toBeInstanceOf(SessionCardHistoryCursorError)
    await expect(
      history.fetch({ cardId: 'other', window: 'recent', cursor }),
    ).rejects.toBeInstanceOf(SessionCardHistoryCursorError)
    await expect(
      history.fetch({ cardId: 'first', cursor }),
    ).rejects.toBeInstanceOf(SessionCardHistoryCursorError)

    rows = rows.map((row) =>
      row.key === 'second'
        ? session(row.key, { ...row.lineage, source: 'gateway' }, row.updatedAt)
        : row,
    )
    await expect(
      history.fetch({ cardId: 'first', window: 'recent', cursor }),
    ).rejects.toBeInstanceOf(SessionCardHistoryCursorError)

    rows = [
      ...rows.filter((row) => row.key !== 'other'),
      session('sixth', {
        parentSessionId: 'fifth',
        source: 'cli',
        startedAt: 500,
        lineageRootId: 'first',
        lineageTipId: 'sixth',
      }),
      session('other'),
    ].map((row) =>
      row.key === 'fifth'
        ? session(
            'fifth',
            {
              ...row.lineage,
              endReason: 'compression',
              endedAt: 500,
              lineageTipId: 'sixth',
            },
            row.updatedAt,
          )
        : row.key === 'other'
          ? row
          : session(
              row.key,
              { ...row.lineage, lineageTipId: 'sixth' },
              row.updatedAt,
            ),
    )
    await expect(
      history.fetch({ cardId: 'first', window: 'recent', cursor }),
    ).rejects.toBeInstanceOf(SessionCardHistoryCursorError)
  })

  it('loads a nonempty standalone Card through the same one-segment aggregation path', async () => {
    const messages = source({
      only: [
        { id: 'only-user', role: 'user', content: 'standalone question' },
        {
          id: 'only-assistant',
          role: 'assistant',
          content: 'standalone answer',
        },
      ],
    })
    const history = new SessionCardHistoryService({
      cardService: cardService(() => [session('only')]),
      messageSource: messages,
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const result = await history.fetch({ cardId: 'only' })

    expect(messages.getMessages.mock.calls).toEqual([['only', 'remote']])
    expect(
      result.messages.map((entry) => [entry.segmentKey, entry.message.id]),
    ).toEqual([
      ['remote:only', 'only-user'],
      ['remote:only', 'only-assistant'],
    ])
    expect(result).toMatchObject({
      cardId: 'remote:only',
      canonicalSegmentKey: 'remote:only',
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    })
  })

  it('retains equal text with different stable IDs', async () => {
    const messages = source({
      first: [{ id: 'upstream-a', content: 'same text' }],
      second: [{ id: 'upstream-b', content: 'same text' }],
      third: [],
    })
    const history = new SessionCardHistoryService({
      cardService: cardService(() => chain()),
      messageSource: messages,
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const result = await history.fetch({ cardId: 'first' })

    expect(result.messages.map((entry) => entry.message.id)).toEqual([
      'upstream-a',
      'upstream-b',
    ])
  })

  it('retains colliding boundary IDs when role or content evidence differs', async () => {
    const messages = source({
      first: [{ id: 'boundary', role: 'user', content: 'original' }],
      second: [
        { id: 'boundary', role: 'user', content: 'different content' },
        { id: 'boundary', role: 'assistant', content: 'original' },
        { id: '', content: 'empty ID text' },
      ],
      third: [{ id: '', content: 'empty ID text' }],
    })
    const history = new SessionCardHistoryService({
      cardService: cardService(() => chain()),
      messageSource: messages,
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const result = await history.fetch({ cardId: 'first' })

    expect(result.messages.map((entry) => entry.message.content)).toEqual([
      'original',
      'different content',
      'original',
      'empty ID text',
      'empty ID text',
    ])
  })

  it('removes an exact adjacent boundary duplicate with matching evidence', async () => {
    const messages = source({
      first: [
        {
          id: 'boundary',
          role: 'assistant',
          content: 'same response',
          timestamp: 10,
        },
      ],
      second: [
        {
          id: 'boundary',
          role: 'assistant',
          content: 'same response',
          timestamp: 10,
        },
        { id: 'retained', role: 'user', content: 'next', timestamp: 11 },
      ],
      third: [],
    })
    const history = new SessionCardHistoryService({
      cardService: cardService(() => chain()),
      messageSource: messages,
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const result = await history.fetch({ cardId: 'first' })

    expect(result.messages.map((entry) => entry.message.id)).toEqual([
      'boundary',
      'retained',
    ])
  })

  it('retains a colliding ID when the timestamp differs', async () => {
    const messages = source({
      first: [{ id: 'boundary', role: 'user', content: 'same', timestamp: 10 }],
      second: [
        { id: 'boundary', role: 'user', content: 'same', timestamp: 11 },
      ],
      third: [],
    })
    const history = new SessionCardHistoryService({
      cardService: cardService(() => chain()),
      messageSource: messages,
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const result = await history.fetch({ cardId: 'first' })

    expect(result.messages.map((entry) => entry.message.timestamp)).toEqual([
      10, 11,
    ])
  })

  it('retains otherwise matching boundary rows when client identity differs', async () => {
    const messages = source({
      first: [
        {
          id: 'boundary',
          clientId: 'client-a',
          role: 'user',
          content: 'same',
          timestamp: 10,
        },
      ],
      second: [
        {
          id: 'boundary',
          clientId: 'client-b',
          role: 'user',
          content: 'same',
          timestamp: 10,
        },
      ],
      third: [],
    })
    const history = new SessionCardHistoryService({
      cardService: cardService(() => chain()),
      messageSource: messages,
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const result = await history.fetch({ cardId: 'first' })

    expect(result.messages.map((entry) => entry.message.clientId)).toEqual([
      'client-a',
      'client-b',
    ])
  })

  it('removes a cloned continuation prefix even when persisted row IDs change', async () => {
    const messages = source({
      first: [
        { id: 'parent-1', role: 'user', content: 'first', timestamp: 10 },
        {
          id: 'parent-2',
          role: 'assistant',
          content: 'second',
          timestamp: 11,
        },
      ],
      second: [
        { id: 'child-1', role: 'user', content: 'first', timestamp: 10 },
        {
          id: 'child-2',
          role: 'assistant',
          content: 'second',
          timestamp: 11,
        },
        { id: 'child-3', role: 'user', content: 'third', timestamp: 12 },
      ],
      third: [],
    })
    const history = new SessionCardHistoryService({
      cardService: cardService(() => chain()),
      messageSource: messages,
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const result = await history.fetch({ cardId: 'first' })

    expect(result.messages.map((entry) => entry.message.id)).toEqual([
      'parent-1',
      'parent-2',
      'child-3',
    ])
  })

  it('deduplicates exact overlap across successful empty continuation segments', async () => {
    const messages = source({
      first: [
        { id: 'boundary', role: 'user', content: 'original', timestamp: 10 },
      ],
      second: [],
      third: [
        { id: 'boundary', role: 'user', content: 'original', timestamp: 10 },
        {
          id: 'retained',
          role: 'assistant',
          content: 'retained',
          timestamp: 11,
        },
      ],
    })
    const history = new SessionCardHistoryService({
      cardService: cardService(() => chain()),
      messageSource: messages,
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const result = await history.fetch({ cardId: 'first' })

    expect(result.messages.map((entry) => entry.message.content)).toEqual([
      'original',
      'retained',
    ])
  })

  it('does not deduplicate across an unavailable empty-segment gap', async () => {
    const messages = source({
      first: [{ id: 'boundary', content: 'original' }],
      second: new Error('gap unavailable'),
      third: [
        { id: 'boundary', content: 'must be retained after gap' },
        { id: 'retained', content: 'retained' },
      ],
    })
    const history = new SessionCardHistoryService({
      cardService: cardService(() => chain()),
      messageSource: messages,
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const result = await history.fetch({ cardId: 'first' })

    expect(result.messages.map((entry) => entry.message.content)).toEqual([
      'original',
      'must be retained after gap',
      'retained',
    ])
    expect(result).toMatchObject({ completeness: 'partial', retryable: true })
  })

  it('does not remove cloned-prefix rows across an unavailable segment gap', async () => {
    const messages = source({
      first: [{ id: 'parent', content: 'same', timestamp: 10 }],
      second: new Error('gap unavailable'),
      third: [
        { id: 'child', content: 'same', timestamp: 10 },
        { id: 'retained', content: 'later', timestamp: 11 },
      ],
    })
    const history = new SessionCardHistoryService({
      cardService: cardService(() => chain()),
      messageSource: messages,
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const result = await history.fetch({ cardId: 'first' })

    expect(result.messages.map((entry) => entry.message.id)).toEqual([
      'parent',
      'child',
      'retained',
    ])
    expect(result).toMatchObject({ completeness: 'partial', retryable: true })
  })

  it('falls back to a nonempty id when stableId is blank and all boundary evidence matches', async () => {
    const messages = source({
      first: [
        {
          stableId: 'boundary',
          id: 'first-id',
          role: 'user',
          content: 'original',
          timestamp: 10,
        },
      ],
      second: [
        {
          stableId: ' ',
          id: 'boundary',
          role: 'user',
          content: 'original',
          timestamp: 10,
        },
        { id: 'second-message', content: 'retained' },
      ],
      third: [],
    })
    const history = new SessionCardHistoryService({
      cardService: cardService(() => chain()),
      messageSource: messages,
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const result = await history.fetch({ cardId: 'first' })

    expect(result.messages.map((entry) => entry.message.content)).toEqual([
      'original',
      'retained',
    ])
  })

  it('never fetches branch or delegate child transcripts', async () => {
    const rows = [
      ...chain(),
      session('branch', {
        parentSessionId: 'third',
        source: 'cli',
        sessionSource: 'fork',
      }),
      session('delegate', {
        parentSessionId: 'second',
        source: 'cli',
        relationshipType: 'child_session',
      }),
    ]
    const messages = source({
      first: [],
      second: [],
      third: [],
      branch: [],
      delegate: [],
    })
    const history = new SessionCardHistoryService({
      cardService: cardService(() => rows),
      messageSource: messages,
      cursorSecret: Buffer.from('history-test-secret'),
    })

    await history.fetch({ cardId: 'first' })

    expect(messages.getMessages.mock.calls.map(([key]) => key)).toEqual([
      'first',
      'second',
      'third',
    ])
    expect(messages.getMessages).not.toHaveBeenCalledWith(
      'branch',
      expect.anything(),
    )
    expect(messages.getMessages).not.toHaveBeenCalledWith(
      'delegate',
      expect.anything(),
    )
  })

  it('loads only a validated child Card component when its parent is supplied', async () => {
    const rows = [
      ...chain(),
      session('delegate', {
        parentSessionId: 'second',
        source: 'cli',
        relationshipType: 'child_session',
      }),
      session('other-root'),
    ]
    const messages = source({
      first: [{ id: 'parent', content: 'parent content' }],
      second: [],
      third: [],
      delegate: [{ id: 'child', content: 'child content' }],
      'other-root': [],
    })
    const history = new SessionCardHistoryService({
      cardService: cardService(() => rows),
      messageSource: messages,
      cursorSecret: Buffer.from('history-test-secret'),
    })

    await expect(
      history.fetch({
        parentCardId: 'remote:first',
        cardId: 'remote:delegate',
      }),
    ).resolves.toMatchObject({
      cardId: 'remote:delegate',
      canonicalSegmentKey: 'remote:delegate',
      messages: [
        {
          segmentKey: 'remote:delegate',
          message: { id: 'child', content: 'child content' },
        },
      ],
    })
    expect(messages.getMessages.mock.calls.map(([key]) => key)).toEqual([
      'delegate',
    ])

    await expect(
      history.fetch({
        parentCardId: 'remote:other-root',
        cardId: 'remote:delegate',
      }),
    ).rejects.toThrow('Session Card not found')
    expect(messages.getMessages).toHaveBeenCalledTimes(1)
  })

  it('reports unavailable segments as partial and retryable without hiding the failure', async () => {
    const messages = source({
      first: [{ id: 'first-message', content: 'available' }],
      second: new Error('temporarily unavailable'),
      third: [{ id: 'third-message', content: 'also available' }],
    })
    const history = new SessionCardHistoryService({
      cardService: cardService(() => chain()),
      messageSource: messages,
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const result = await history.fetch({ cardId: 'first' })

    expect(result.messages.map((entry) => entry.segmentKey)).toEqual([
      'remote:first',
      'remote:third',
    ])
    expect(result).toMatchObject({
      completeness: 'partial',
      retryable: true,
      missingSegments: [
        {
          segmentKey: 'remote:second',
          source: 'remote',
          retryable: true,
          reason: 'read-failed',
          error: 'Session history segment could not be read.',
        },
      ],
    })
  })

  it('surfaces every failed segment while retaining only available aggregate rows without a tip fallback', async () => {
    const messages = source({
      first: new Error('root unavailable'),
      second: new Error('middle unavailable'),
      third: [{ id: 'tip-message', content: 'available tip segment' }],
    })
    const history = new SessionCardHistoryService({
      cardService: cardService(() => chain()),
      messageSource: messages,
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const result = await history.fetch({ cardId: 'first', limit: 1 })

    expect(messages.getMessages.mock.calls.map(([key]) => key)).toEqual([
      'first',
      'second',
      'third',
    ])
    expect(result.messages).toEqual([
      {
        segmentKey: 'remote:third',
        message: { id: 'tip-message', content: 'available tip segment' },
      },
    ])
    expect(result).toMatchObject({
      cardId: 'remote:first',
      canonicalSegmentKey: 'remote:third',
      completeness: 'partial',
      retryable: true,
      missingSegments: [
        expect.objectContaining({
          segmentKey: 'remote:first',
          reason: 'read-failed',
        }),
        expect.objectContaining({
          segmentKey: 'remote:second',
          reason: 'read-failed',
        }),
      ],
    })
    expect(result.nextCursor).toBeUndefined()
    expect(messages.getMessages).toHaveBeenCalledTimes(3)
  })

  it('reports a truncated 100-row remote message page as partial and retryable', async () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      id: `message-${index + 1}`,
      content: String(index + 1),
    }))
    const history = new SessionCardHistoryService({
      cardService: cardService(() => [session('only')]),
      messageSource: {
        getMessages: vi.fn(() =>
          Promise.resolve({
            messages: rows,
            source: 'remote',
            resolvedSegmentKey: 'only',
            truncated: true,
          }),
        ),
      },
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const result = await history.fetch({ cardId: 'only', limit: 25 })

    // A partial snapshot cannot safely issue an offset cursor, so preserve every
    // currently available row even when that exceeds the requested page size.
    expect(result.messages).toHaveLength(100)
    expect(result.messages[0]?.message.id).toBe('message-1')
    expect(result.messages[99]?.message.id).toBe('message-100')
    expect(result).toMatchObject({ completeness: 'partial', retryable: true })
    expect(result.missingSegments).toEqual([
      {
        segmentKey: 'remote:only',
        source: 'remote',
        retryable: true,
        reason: 'source-incomplete',
        error: 'Session history segment is incomplete at its source.',
      },
    ])
    expect(result.nextCursor).toBeUndefined()
  })

  it('never emits or consumes an offset cursor while a segment snapshot is partial', async () => {
    let secondAvailable = false
    const getMessages = vi.fn((segmentKey: string) => {
      if (segmentKey === 'second' && !secondAvailable) {
        return Promise.reject(new Error('temporarily unavailable'))
      }
      const messagesBySegment: Record<
        string,
        Array<Record<string, unknown>>
      > = {
        first: [
          { id: '1', content: 'one' },
          { id: '2', content: 'two' },
        ],
        second: [{ id: '3', content: 'three' }],
        third: [{ id: '4', content: 'four' }],
      }
      return Promise.resolve({
        messages: messagesBySegment[segmentKey] ?? [],
        source: 'remote',
        resolvedSegmentKey: segmentKey,
      })
    })
    const history = new SessionCardHistoryService({
      cardService: cardService(() => chain()),
      messageSource: { getMessages },
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const partial = await history.fetch({ cardId: 'first', limit: 1 })
    expect(partial).toMatchObject({
      completeness: 'partial',
      retryable: true,
    })
    expect(partial.nextCursor).toBeUndefined()

    secondAvailable = true
    const recoveredFirstPage = await history.fetch({
      cardId: 'first',
      limit: 2,
    })
    const recoveredSecondPage = await history.fetch({
      cardId: 'first',
      limit: 2,
      cursor: recoveredFirstPage.nextCursor,
    })
    expect(
      [...recoveredFirstPage.messages, ...recoveredSecondPage.messages].map(
        (entry) => entry.message.id,
      ),
    ).toEqual(['1', '2', '3', '4'])
  })

  it('keeps a cold-loaded continuation tip readable but partial until its known predecessors load', async () => {
    const coldTip = session('tip', {
      parentSessionId: 'previous',
      relationshipType: 'continuation',
      source: 'cli',
      startedAt: 200,
      lineageRootId: 'root',
      lineageTipId: 'tip',
      parentLineageRootId: 'root',
      parentLineageTipId: 'previous',
    })
    const messages = source({
      tip: [
        { id: 'tip-1', content: 'safe tip content' },
        { id: 'tip-2', content: 'more tip content' },
      ],
    })
    const history = new SessionCardHistoryService({
      cardService: cardService(() => [coldTip]),
      messageSource: messages,
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const result = await history.fetch({ cardId: 'remote:root', limit: 1 })

    expect(messages.getMessages.mock.calls.map(([key]) => key)).toEqual(['tip'])
    expect(result.messages.map((entry) => entry.message.content)).toEqual([
      'safe tip content',
      'more tip content',
    ])
    expect(result).toMatchObject({
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:tip',
      completeness: 'partial',
      retryable: true,
      missingSegments: [
        expect.objectContaining({ segmentKey: 'remote:root', retryable: true }),
        expect.objectContaining({
          segmentKey: 'remote:previous',
          retryable: true,
        }),
      ],
    })
    expect(result.nextCursor).toBeUndefined()
  })

  it('does not relabel tip messages when a predecessor request canonicalizes to the tip', async () => {
    const getMessages = vi.fn((segmentKey: string) =>
      Promise.resolve({
        messages: [{ id: `tip-via-${segmentKey}`, content: 'tip content' }],
        source: 'remote',
        resolvedSegmentKey: 'third',
      }),
    )
    const history = new SessionCardHistoryService({
      cardService: cardService(() => chain()),
      messageSource: { getMessages },
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const result = await history.fetch({ cardId: 'first', limit: 1 })

    expect(getMessages.mock.calls.map(([key]) => key)).toEqual([
      'first',
      'second',
      'third',
    ])
    expect(result.messages).toEqual([
      {
        segmentKey: 'remote:third',
        message: { id: 'tip-via-third', content: 'tip content' },
      },
    ])
    expect(result).toMatchObject({
      completeness: 'partial',
      retryable: true,
      missingSegments: [
        expect.objectContaining({ segmentKey: 'remote:first' }),
        expect.objectContaining({ segmentKey: 'remote:second' }),
      ],
    })
    expect(result.nextCursor).toBeUndefined()
  })

  it('rejects a previously issued cursor when the current segment snapshot is partial', async () => {
    let secondAvailable = true
    const getMessages = vi.fn((segmentKey: string) => {
      if (segmentKey === 'second' && !secondAvailable) {
        return Promise.reject(new Error('temporarily unavailable'))
      }
      return Promise.resolve({
        messages: [{ id: segmentKey, content: segmentKey }],
        source: 'remote',
        resolvedSegmentKey: segmentKey,
      })
    })
    const history = new SessionCardHistoryService({
      cardService: cardService(() => chain()),
      messageSource: { getMessages },
      cursorSecret: Buffer.from('history-test-secret'),
    })
    const complete = await history.fetch({ cardId: 'first', limit: 1 })
    expect(complete.nextCursor).toEqual(expect.any(String))

    secondAvailable = false
    await expect(
      history.fetch({
        cardId: 'first',
        limit: 1,
        cursor: complete.nextCursor,
      }),
    ).rejects.toBeInstanceOf(SessionCardHistoryCursorError)
  })

  it('keeps local card history complete when only an unrelated remote source is unavailable', async () => {
    const service = new SessionCardService({
      remoteSource: {
        source: 'remote',
        listPage: vi.fn().mockRejectedValue(new Error('offline')),
      },
      localSource: {
        source: 'local',
        listSessions: () => [session('local-card', { source: 'local' })],
      },
      metadataStore: noMetadata,
    })
    const history = new SessionCardHistoryService({
      cardService: service,
      messageSource: {
        getMessages: vi.fn(() =>
          Promise.resolve({
            messages: [{ id: 'local-message', content: 'available' }],
            source: 'local',
            resolvedSegmentKey: 'local-card',
          }),
        ),
      },
      cursorSecret: Buffer.from('history-test-secret'),
    })

    await expect(
      history.fetch({ cardId: 'local:local-card' }),
    ).resolves.toMatchObject({
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
      messages: [
        {
          segmentKey: 'local:local-card',
          message: { id: 'local-message' },
        },
      ],
    })
  })

  it('rejects tampered and stale cursors tied to a changed fresh component', async () => {
    let rows = chain()
    const messages = source({
      first: [{ id: '1', content: 'one' }],
      second: [{ id: '2', content: 'two' }],
      third: [{ id: '3', content: 'three' }],
      fourth: [{ id: '4', content: 'four' }],
    })
    const service = cardService(() => rows)
    const history = new SessionCardHistoryService({
      cardService: service,
      messageSource: messages,
      cursorSecret: Buffer.from('history-test-secret'),
    })
    const firstPage = await history.fetch({ cardId: 'first', limit: 1 })
    expect(firstPage.nextCursor).toEqual(expect.any(String))

    const cursor = firstPage.nextCursor!
    const replacement = cursor.endsWith('a') ? 'b' : 'a'
    const tampered = `${cursor.slice(0, -1)}${replacement}`
    await expect(
      history.fetch({ cardId: 'first', limit: 1, cursor: tampered }),
    ).rejects.toBeInstanceOf(SessionCardHistoryCursorError)

    rows = [
      session('first', {
        source: 'cli',
        endReason: 'compression',
        endedAt: 100,
        lineageRootId: 'first',
        lineageTipId: 'fourth',
      }),
      session('second', {
        parentSessionId: 'first',
        source: 'cli',
        startedAt: 100,
        endReason: 'compression',
        endedAt: 200,
        lineageRootId: 'first',
        lineageTipId: 'fourth',
      }),
      session('third', {
        parentSessionId: 'second',
        source: 'cli',
        startedAt: 200,
        endReason: 'compression',
        endedAt: 300,
        lineageRootId: 'first',
        lineageTipId: 'fourth',
      }),
      session('fourth', {
        parentSessionId: 'third',
        source: 'cli',
        startedAt: 300,
        lineageRootId: 'first',
        lineageTipId: 'fourth',
      }),
    ]

    await expect(
      history.fetch({ cardId: 'first', limit: 1, cursor }),
    ).rejects.toBeInstanceOf(SessionCardHistoryCursorError)
  })

  it('rejects a cursor when the source and retrieved message snapshot change under the same component keys', async () => {
    let activeSource = 'dashboard'
    const service = new SessionCardService({
      remoteSource: {
        source: 'hermes',
        listPage: (limit, offset) => {
          const all = chain()
          const sessions = all.slice(offset, offset + limit)
          return Promise.resolve({
            sessions,
            source: activeSource,
            total: all.length,
            limit,
            offset,
            hasMore: offset + sessions.length < all.length,
            pagination: 'supported',
          })
        },
      },
      localSource: null,
      metadataStore: noMetadata,
    })
    const getMessages = vi.fn((segmentKey: string, sourceName?: string) =>
      Promise.resolve({
        messages: [
          { id: `${sourceName}-${segmentKey}-1`, content: 'one' },
          { id: `${sourceName}-${segmentKey}-2`, content: 'two' },
        ],
        source: sourceName,
        resolvedSegmentKey: segmentKey,
      }),
    )
    const history = new SessionCardHistoryService({
      cardService: service,
      messageSource: { getMessages },
      cursorSecret: Buffer.from('history-test-secret'),
    })
    const first = await history.fetch({ cardId: 'first', limit: 1 })
    expect(first.nextCursor).toEqual(expect.any(String))

    activeSource = 'gateway'
    await expect(
      history.fetch({
        cardId: first.cardId,
        limit: 1,
        cursor: first.nextCursor,
      }),
    ).rejects.toBeInstanceOf(SessionCardHistoryCursorError)
    expect(getMessages).toHaveBeenCalledWith('first', 'gateway')
  })

  it('treats a message batch from the wrong source as unavailable', async () => {
    const history = new SessionCardHistoryService({
      cardService: cardService(() => chain()),
      messageSource: {
        getMessages: vi.fn(() =>
          Promise.resolve({
            messages: [{ id: 'wrong', content: 'wrong source' }],
            source: 'gateway',
          }),
        ),
      },
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const result = await history.fetch({ cardId: 'first' })

    expect(result.messages).toEqual([])
    expect(result).toMatchObject({ completeness: 'partial', retryable: true })
    expect(result.missingSegments).toHaveLength(3)
  })

  it('treats a message batch without resolved segment identity as unavailable', async () => {
    const history = new SessionCardHistoryService({
      cardService: cardService(() => chain()),
      messageSource: {
        getMessages: vi.fn(() =>
          Promise.resolve({
            messages: [{ id: 'ambiguous', content: 'ambiguous segment' }],
            source: 'remote',
          }),
        ),
      },
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const result = await history.fetch({ cardId: 'first', limit: 1 })

    expect(result.messages).toEqual([])
    expect(result).toMatchObject({ completeness: 'partial', retryable: true })
    expect(result.missingSegments).toHaveLength(3)
    expect(result.missingSegments[0]).toMatchObject({
      reason: 'identity-mismatch',
      error: 'Session history source returned a different segment identity.',
    })
    expect(result.nextCursor).toBeUndefined()
  })

  it('rejects a cursor when message boundaries change within the same source and component', async () => {
    let revision = 'first-snapshot'
    const history = new SessionCardHistoryService({
      cardService: cardService(() => chain()),
      messageSource: {
        getMessages: vi.fn((segmentKey: string) =>
          Promise.resolve({
            messages: [
              { id: `${revision}-${segmentKey}-1` },
              { id: `${revision}-${segmentKey}-2` },
            ],
            source: 'remote',
            resolvedSegmentKey: segmentKey,
          }),
        ),
      },
      cursorSecret: Buffer.from('history-test-secret'),
    })
    const first = await history.fetch({ cardId: 'first', limit: 1 })
    expect(first.nextCursor).toEqual(expect.any(String))

    revision = 'replacement-snapshot'

    await expect(
      history.fetch({
        cardId: first.cardId,
        limit: 1,
        cursor: first.nextCursor,
      }),
    ).rejects.toBeInstanceOf(SessionCardHistoryCursorError)
  })

  it('returns an evicted local window as partial without issuing an unsafe cursor', async () => {
    const retained = Array.from({ length: 500 }, (_, index) => ({
      id: `message-${index + 2}`,
      content: `message ${index + 2}`,
    }))
    const service = new SessionCardService({
      remoteSource: null,
      localSource: {
        source: 'local',
        listSessions: () => [session('local-card', { source: 'local' })],
      },
      metadataStore: noMetadata,
    })
    const history = new SessionCardHistoryService({
      cardService: service,
      messageSource: {
        getMessages: vi.fn(() =>
          Promise.resolve({
            messages: retained,
            source: 'local',
            resolvedSegmentKey: 'local-card',
            snapshot: 'generation-501',
            truncated: true,
          }),
        ),
      },
      cursorSecret: Buffer.from('history-test-secret'),
    })

    const result = await history.fetch({ cardId: 'local-card', limit: 500 })

    expect(result.messages).toHaveLength(500)
    expect(result.messages[0]?.message.id).toBe('message-2')
    expect(result).toMatchObject({ completeness: 'partial', retryable: true })
    expect(result.nextCursor).toBeUndefined()
  })

  it('rejects an offset cursor after an append evicts the local window boundary', async () => {
    let generation = 500
    let retained = Array.from({ length: 500 }, (_, index) => ({
      id: `message-${index + 1}`,
    }))
    const service = new SessionCardService({
      remoteSource: null,
      localSource: {
        source: 'local',
        listSessions: () => [session('local-card', { source: 'local' })],
      },
      metadataStore: noMetadata,
    })
    const history = new SessionCardHistoryService({
      cardService: service,
      messageSource: {
        getMessages: vi.fn(() =>
          Promise.resolve({
            messages: retained,
            source: 'local',
            resolvedSegmentKey: 'local-card',
            snapshot: `generation-${generation}`,
            truncated: generation > 500,
          }),
        ),
      },
      cursorSecret: Buffer.from('history-test-secret'),
    })
    const first = await history.fetch({ cardId: 'local-card', limit: 1 })
    expect(first.nextCursor).toEqual(expect.any(String))

    generation += 1
    retained = [...retained.slice(1), { id: 'message-501' }]

    await expect(
      history.fetch({
        cardId: first.cardId,
        limit: 1,
        cursor: first.nextCursor,
      }),
    ).rejects.toBeInstanceOf(SessionCardHistoryCursorError)
  })
})
