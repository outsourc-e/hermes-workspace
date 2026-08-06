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
})
