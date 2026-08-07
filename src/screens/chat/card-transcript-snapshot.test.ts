// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CARD_TRANSCRIPT_SNAPSHOT_PREFIX,
  cardTranscriptSnapshotStorageKey,
  readCardTranscriptSnapshot,
  writeCardTranscriptSnapshot,
} from './card-transcript-snapshot'
import type { ChatMessage } from './types'

const cardId = 'remote:snapshot-card'

function message(text: string, fields: Partial<ChatMessage> = {}): ChatMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    ...fields,
  }
}

function keys(prefix = ''): Array<string> {
  return Array.from({ length: window.localStorage.length }, (_, index) =>
    window.localStorage.key(index),
  ).filter((key): key is string => key !== null && key.startsWith(prefix))
}

function cardKeys(kind: 'aggregate' | 'commit' | 'chunk'): Array<string> {
  const base = cardTranscriptSnapshotStorageKey(cardId)
  return keys(kind === 'aggregate' ? `${base}:aggregate` : `${base}:${kind}:`)
}

function installLocks(): void {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: vi.fn(async <T>(_name: string, callback: () => T | Promise<T>) =>
        callback(),
      ),
    },
  })
}

function removeLocks(): void {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  })
}

describe('Card transcript snapshot v3', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    removeLocks()
    vi.restoreAllMocks()
  })

  it('discards only obsolete v1 snapshot keys without reading their values', async () => {
    const obsoleteBase =
      'workspace.card-transcript-snapshot.v1:remote%3Aobsolete'
    const obsoleteChunk = `${obsoleteBase}:chunk:secret:0`
    const recoveryKey = 'workspace.card-transcript-recovery.v2:remote%3Akeep'
    const pendingKey = 'workspace.pending-send.v2:keep'
    const preferenceKey = 'workspace.sidebar.collapsed'
    const unrelatedV3 = `${CARD_TRANSCRIPT_SNAPSHOT_PREFIX}:remote%3Aother:aggregate`
    for (const storage of [window.localStorage, window.sessionStorage]) {
      storage.setItem(obsoleteBase, 'legacy-secret-base')
      storage.setItem(obsoleteChunk, 'legacy-secret-chunk')
      storage.setItem(recoveryKey, 'recovery')
      storage.setItem(pendingKey, 'pending')
      storage.setItem(preferenceKey, 'true')
      storage.setItem(unrelatedV3, 'unrelated-v3')
    }
    const originalGetItem = Storage.prototype.getItem
    const reads: Array<string> = []
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      key,
    ) {
      reads.push(key)
      return originalGetItem.call(this, key)
    })

    expect(
      await writeCardTranscriptSnapshot(cardId, [message('fresh')]),
    ).not.toBeNull()

    expect(reads).not.toContain(obsoleteBase)
    expect(reads).not.toContain(obsoleteChunk)
    for (const storage of [window.localStorage, window.sessionStorage]) {
      expect(storage.getItem(obsoleteBase)).toBeNull()
      expect(storage.getItem(obsoleteChunk)).toBeNull()
      expect(storage.getItem(recoveryKey)).toBe('recovery')
      expect(storage.getItem(pendingKey)).toBe('pending')
      expect(storage.getItem(preferenceKey)).toBe('true')
      expect(storage.getItem(unrelatedV3)).toBe('unrelated-v3')
    }
  })

  it('reuses exact same-Card chunks across large commits from different contexts', async () => {
    const projection = [
      message('large complete projection', {
        id: 'large-row',
        attachments: [
          {
            id: 'large-file',
            name: 'large.bin',
            contentType: 'application/octet-stream',
            dataUrl: `data:application/octet-stream;base64,${'a'.repeat(1_200_000)}`,
          },
        ],
      }),
    ]

    expect(
      await writeCardTranscriptSnapshot(cardId, projection, {
        contextId: 'context-a',
      }),
    ).not.toBeNull()
    const firstChunks = cardKeys('chunk')
    expect(firstChunks.length).toBeGreaterThan(1)

    expect(
      await writeCardTranscriptSnapshot(cardId, projection, {
        contextId: 'context-b',
      }),
    ).not.toBeNull()

    expect(cardKeys('chunk')).toEqual(firstChunks)
    expect(cardKeys('commit')).toHaveLength(2)
    expect(readCardTranscriptSnapshot(cardId)?.messages).toEqual(projection)
  })

  it('reuses the stable tab context after a module reload', async () => {
    const projection = [message('stable across reload', { id: 'stable' })]
    expect(await writeCardTranscriptSnapshot(cardId, projection)).not.toBeNull()

    vi.resetModules()
    const reloaded = await import('./card-transcript-snapshot')
    expect(
      await reloaded.writeCardTranscriptSnapshot(cardId, projection),
    ).not.toBeNull()

    expect(cardKeys('commit')).toHaveLength(1)
    expect(reloaded.readCardTranscriptSnapshot(cardId)?.messages).toEqual(
      projection,
    )
  })

  it('does not compact divergent identity, repetition, order, or attachment projections', async () => {
    installLocks()
    const a = message('same text', { id: 'a', runId: 'run-a' })
    const b = message('same text', { id: 'b', runId: 'run-b' })
    const repeatedIdentity = [a, a]
    const reversed = [b, a]
    const attachmentDifference = [
      {
        ...a,
        attachments: [
          {
            id: 'attachment',
            name: 'evidence.txt',
            contentType: 'text/plain',
            dataUrl: 'data:text/plain;base64,YQ==',
          },
        ],
      },
    ]

    for (const projection of [
      [a, b],
      repeatedIdentity,
      reversed,
      attachmentDifference,
    ]) {
      expect(
        await writeCardTranscriptSnapshot(cardId, projection),
      ).not.toBeNull()
    }

    expect(cardKeys('commit')).toHaveLength(4)
    expect(cardKeys('chunk')).toHaveLength(4)
    expect(readCardTranscriptSnapshot(cardId)?.messages).toEqual([
      attachmentDifference[0],
      b,
      a,
    ])
  })

  it('retains every commit when aggregate read-back fails before compaction', async () => {
    installLocks()
    const projection = [message('duplicate', { id: 'duplicate' })]
    expect(
      await writeCardTranscriptSnapshot(cardId, projection, {
        contextId: 'readback-a',
      }),
    ).not.toBeNull()
    const aggregate = `${cardTranscriptSnapshotStorageKey(cardId)}:aggregate`
    const originalSetItem = Storage.prototype.setItem
    const originalGetItem = Storage.prototype.getItem
    let aggregateWrites = 0
    let failNextRead = false
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      originalSetItem.call(this, key, value)
      if (this === window.localStorage && key === aggregate) {
        aggregateWrites += 1
        if (aggregateWrites === 2) failNextRead = true
      }
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      key,
    ) {
      if (this === window.localStorage && key === aggregate && failNextRead) {
        failNextRead = false
        return '{"corrupt":true}'
      }
      return originalGetItem.call(this, key)
    })

    expect(
      await writeCardTranscriptSnapshot(cardId, projection, {
        contextId: 'readback-b',
      }),
    ).not.toBeNull()

    expect(cardKeys('commit')).toHaveLength(2)
    expect(cardKeys('chunk')).toHaveLength(1)
    expect(readCardTranscriptSnapshot(cardId)?.messages).toEqual(projection)
  })

  it('fails closed and retains the aggregate when existing v3 chunks are unreadable', async () => {
    installLocks()
    const original = [message('known good', { id: 'good' })]
    expect(await writeCardTranscriptSnapshot(cardId, original)).not.toBeNull()
    const aggregate = `${cardTranscriptSnapshotStorageKey(cardId)}:aggregate`
    const aggregateBefore = window.localStorage.getItem(aggregate)
    const [chunkKey] = cardKeys('chunk')
    expect(chunkKey).toBeDefined()
    window.localStorage.setItem(chunkKey!, '{"corrupt":true}')

    expect(
      await writeCardTranscriptSnapshot(cardId, [
        message('must not replace unreadable state', { id: 'new' }),
      ]),
    ).toBeNull()

    expect(window.localStorage.getItem(aggregate)).toBe(aggregateBefore)
    expect(cardKeys('commit')).toHaveLength(1)
    expect(readCardTranscriptSnapshot(cardId)).toBeNull()
  })

  it('rolls quota compaction back when the one retry still cannot fit', async () => {
    const duplicate = [message('reclaimable duplicate', { id: 'duplicate' })]
    expect(
      await writeCardTranscriptSnapshot(cardId, duplicate, {
        contextId: 'quota-a',
      }),
    ).not.toBeNull()
    expect(
      await writeCardTranscriptSnapshot(cardId, duplicate, {
        contextId: 'quota-b',
      }),
    ).not.toBeNull()
    const before = new Map(
      keys().map((key) => [key, localStorage.getItem(key)]),
    )
    installLocks()
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (
        this === window.localStorage &&
        key.includes(':chunk:') &&
        !before.has(key)
      ) {
        throw new DOMException('quota', 'QuotaExceededError')
      }
      originalSetItem.call(this, key, value)
    })

    expect(
      await writeCardTranscriptSnapshot(cardId, [
        message('will not fit', { id: 'new-row' }),
      ]),
    ).toBeNull()

    expect(
      new Map(keys().map((key) => [key, localStorage.getItem(key)])),
    ).toEqual(before)
    expect(readCardTranscriptSnapshot(cardId)?.messages).toEqual(duplicate)
  })

  it('never deletes v3 data when Web Locks are unavailable', async () => {
    const remove = vi.spyOn(Storage.prototype, 'removeItem')
    const projection = [message('same payload', { id: 'same' })]

    expect(
      await writeCardTranscriptSnapshot(cardId, projection, {
        contextId: 'no-lock-a',
      }),
    ).not.toBeNull()
    remove.mockClear()
    expect(
      await writeCardTranscriptSnapshot(cardId, projection, {
        contextId: 'no-lock-b',
      }),
    ).not.toBeNull()

    expect(remove).not.toHaveBeenCalled()
    expect(cardKeys('commit')).toHaveLength(2)
  })

  it('supports another locked write after duplicate compaction', async () => {
    installLocks()
    const first = [message('first durable payload', { id: 'first' })]
    expect(
      await writeCardTranscriptSnapshot(cardId, first, {
        contextId: 'compact-a',
      }),
    ).not.toBeNull()
    expect(
      await writeCardTranscriptSnapshot(cardId, first, {
        contextId: 'compact-b',
      }),
    ).not.toBeNull()
    expect(cardKeys('commit')).toHaveLength(1)

    const second = [
      ...first,
      message('future durable payload', { id: 'second' }),
    ]
    expect(await writeCardTranscriptSnapshot(cardId, second)).not.toBeNull()
    expect(readCardTranscriptSnapshot(cardId)?.messages).toEqual(second)
    expect(cardKeys('commit')).toHaveLength(2)
  })
})
