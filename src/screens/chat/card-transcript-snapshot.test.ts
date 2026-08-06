// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cardTranscriptSnapshotStorageKey,
  readCardTranscriptSnapshot,
  writeCardTranscriptSnapshot,
} from './card-transcript-snapshot'
import type { ChatMessage } from './types'

const cardId = 'remote:snapshot-card'

function message(text: string): ChatMessage {
  return { role: 'assistant', content: [{ type: 'text', text }] }
}

function raw(savedAt: number, revision: number, text: string): string {
  return JSON.stringify({
    version: 1,
    cardId,
    savedAt,
    revision,
    messages: [message(text)],
  })
}

describe('Card transcript snapshot mirror arbitration', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('reads every durable store and selects revision before savedAt', () => {
    const key = cardTranscriptSnapshotStorageKey(cardId)
    window.localStorage.setItem(key, raw(200, 4, 'stale primary'))
    window.sessionStorage.setItem(key, raw(100, 5, 'newer fallback'))

    expect(readCardTranscriptSnapshot(cardId)?.messages).toEqual([
      message('newer fallback'),
    ])
  })

  it('does not destructively reject a snapshot after arbitrary clock rollback', () => {
    const key = cardTranscriptSnapshotStorageKey(cardId)
    window.localStorage.setItem(key, raw(9_000_000, 4, 'accepted earlier'))
    vi.spyOn(Date, 'now').mockReturnValue(1)

    expect(readCardTranscriptSnapshot(cardId)?.messages).toEqual([
      message('accepted earlier'),
    ])
    expect(window.localStorage.getItem(key)).not.toBeNull()
  })

  it('unions divergent complete projections when a stale browser context commits last', () => {
    const key = cardTranscriptSnapshotStorageKey(cardId)
    expect(
      writeCardTranscriptSnapshot(cardId, [message('shared baseline')], {
        contextId: 'baseline-context',
      }),
    ).not.toBeNull()
    const staleIndex = window.localStorage.getItem(key)
    expect(
      writeCardTranscriptSnapshot(
        cardId,
        [
          message('shared baseline'),
          { ...message('first tab accepted'), id: 'first-tab' },
        ],
        { contextId: 'first-tab-context' },
      ),
    ).not.toBeNull()
    const originalGetItem = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      storageKey,
    ) {
      if (storageKey === key) return staleIndex
      return originalGetItem.call(this, storageKey)
    })

    expect(
      writeCardTranscriptSnapshot(
        cardId,
        [
          message('shared baseline'),
          { ...message('second tab accepted'), id: 'second-tab' },
        ],
        { contextId: 'second-tab-context' },
      ),
    ).not.toBeNull()
    vi.mocked(Storage.prototype.getItem).mockRestore()

    const texts = readCardTranscriptSnapshot(cardId)?.messages.map(
      (entry) => (entry.content?.[0] as { text?: string } | undefined)?.text,
    )
    expect(texts).toEqual(
      expect.arrayContaining([
        'shared baseline',
        'first tab accepted',
        'second tab accepted',
      ]),
    )
  })

  it('writes a newer revision to every available mirror', () => {
    const key = cardTranscriptSnapshotStorageKey(cardId)
    window.localStorage.setItem(key, raw(200, 4, 'stale primary'))
    window.sessionStorage.setItem(key, raw(100, 9_999_999, 'newer fallback'))

    const written = writeCardTranscriptSnapshot(cardId, [message('fresh')])

    expect(written?.revision).toBeGreaterThan(9_999_999)
    expect(window.localStorage.getItem(key)).toBe(
      window.sessionStorage.getItem(key),
    )
    expect(readCardTranscriptSnapshot(cardId)?.messages).toEqual([
      message('fresh'),
    ])
  })

  it('round-trips complete histories beyond the former message and single-value caps', () => {
    const messages = Array.from({ length: 2_101 }, (_, index) => ({
      ...message(`history row ${index}`),
      id: `history-${index}`,
      ...(index === 1_050
        ? {
            attachments: [
              {
                id: 'large-attachment',
                name: 'complete-history.bin',
                contentType: 'application/octet-stream',
                dataUrl: `data:application/octet-stream;base64,${'a'.repeat(4_600_000)}`,
              },
            ],
          }
        : {}),
    }))

    const written = writeCardTranscriptSnapshot(cardId, messages)

    expect(written?.messages).toHaveLength(2_101)
    expect(readCardTranscriptSnapshot(cardId)?.messages).toEqual(messages)
    const key = cardTranscriptSnapshotStorageKey(cardId)
    const index = JSON.parse(window.localStorage.getItem(key) ?? '{}') as {
      version?: number
      chunkCount?: number
    }
    expect(index.version).toBe(2)
    expect(index.chunkCount).toBeGreaterThan(1)
  })

  it('derives each revision from the maximum valid persistent mirror despite clock rollback and one failed mirror', () => {
    const key = cardTranscriptSnapshotStorageKey(cardId)
    window.localStorage.setItem(key, raw(200, 40_000, 'local baseline'))
    window.sessionStorage.setItem(key, raw(100, 90_000, 'session baseline'))
    vi.spyOn(Date, 'now').mockReturnValue(50)
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      storageKey,
      value,
    ) {
      if (this === window.localStorage) {
        throw new DOMException('local mirror unavailable', 'QuotaExceededError')
      }
      return originalSetItem.call(this, storageKey, value)
    })

    const first = writeCardTranscriptSnapshot(cardId, [message('first write')])
    expect(first).toBeNull()
    expect(readCardTranscriptSnapshot(cardId)?.revision).toBe(90_001)

    vi.mocked(Storage.prototype.setItem).mockRestore()
    vi.spyOn(Date, 'now').mockReturnValue(25)
    const second = writeCardTranscriptSnapshot(cardId, [
      message('after restart'),
    ])

    expect(second?.revision).toBe(90_002)
    expect(readCardTranscriptSnapshot(cardId)?.messages).toEqual([
      message('after restart'),
    ])
  })

  it('fails closed on an interrupted index commit and keeps the prior complete snapshot readable', () => {
    expect(
      writeCardTranscriptSnapshot(cardId, [message('last durable baseline')]),
    ).not.toBeNull()
    const key = cardTranscriptSnapshotStorageKey(cardId)
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      storageKey,
      value,
    ) {
      if (storageKey === key || storageKey.startsWith(`${key}:commit:`)) {
        throw new DOMException('interrupted commit', 'QuotaExceededError')
      }
      return originalSetItem.call(this, storageKey, value)
    })

    expect(
      writeCardTranscriptSnapshot(cardId, [message('uncommitted replacement')]),
    ).toBeNull()
    expect(readCardTranscriptSnapshot(cardId)?.messages).toEqual([
      message('last durable baseline'),
    ])
  })
})
