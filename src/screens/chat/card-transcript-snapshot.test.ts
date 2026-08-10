// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  WORKSPACE_CHAT_DATABASE_NAME,
  WORKSPACE_CHAT_STORE_NAMES,
  openWorkspaceChatIndexedDb,
  writeLatestCardSnapshot,
} from './card-transcript-indexeddb'
import {
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

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(WORKSPACE_CHAT_DATABASE_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('test database deletion blocked'))
  })
}

async function latestSnapshotCount(): Promise<number> {
  const database = await openWorkspaceChatIndexedDb()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      WORKSPACE_CHAT_STORE_NAMES.latestCardSnapshots,
      'readonly',
    )
    const request = transaction
      .objectStore(WORKSPACE_CHAT_STORE_NAMES.latestCardSnapshots)
      .count()
    let count: number | undefined
    request.onsuccess = () => {
      count = request.result
    }
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => {
      database.close()
      if (count === undefined) reject(new Error('snapshot count unavailable'))
      else resolve(count)
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error)
    }
  })
}

describe('Card transcript snapshot v4 adapter', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    await deleteDatabase()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps one latest sanitized canonical snapshot per Card and overwrites the prior projection', async () => {
    const first = [
      message('first', {
        id: 'first-message',
        sessionKey: 'remote:raw-transport-session',
      }),
    ]
    const latest = [message('latest', { id: 'latest-message' })]

    await expect(writeCardTranscriptSnapshot(cardId, first)).resolves.toMatchObject({
      version: 4,
      cardId,
      messages: [expect.objectContaining({ id: 'first-message' })],
    })
    await expect(writeCardTranscriptSnapshot(cardId, latest)).resolves.toEqual({
      version: 4,
      cardId,
      messages: latest,
    })

    await expect(readCardTranscriptSnapshot(cardId)).resolves.toEqual({
      version: 4,
      cardId,
      messages: latest,
    })
    await expect(latestSnapshotCount()).resolves.toBe(1)
  })

  it('cold-reads the verified v4 projection after a module reload', async () => {
    const projection = [message('survives reload', { id: 'cold-message' })]
    await writeCardTranscriptSnapshot(cardId, projection)

    vi.resetModules()
    const cold = await import('./card-transcript-snapshot')

    await expect(cold.readCardTranscriptSnapshot(cardId)).resolves.toEqual({
      version: 4,
      cardId,
      messages: projection,
    })
  })

  it('fails closed for malformed and nonportable message projections', async () => {
    const malformed = [{ role: 'assistant', content: 'not-an-array' }] as unknown as Array<ChatMessage>
    const nonportable = [
      message('cannot clone', { callback: () => undefined }),
    ]

    await expect(writeCardTranscriptSnapshot(cardId, malformed)).resolves.toBeNull()
    await expect(writeCardTranscriptSnapshot(cardId, nonportable)).resolves.toBeNull()
    await expect(readCardTranscriptSnapshot(cardId)).resolves.toBeNull()

    await writeLatestCardSnapshot({
      cardId,
      payload: {
        version: 4,
        messages: [{ role: 'assistant', content: 'corrupt' }],
      },
    })
    await expect(readCardTranscriptSnapshot(cardId)).resolves.toBeNull()
  })

  it('surfaces database open failures instead of reporting snapshot success', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new Error('snapshot database offline')
      },
    })

    await expect(
      writeCardTranscriptSnapshot(cardId, [message('not durable')]),
    ).rejects.toThrow('snapshot database offline')
    await expect(readCardTranscriptSnapshot(cardId)).rejects.toThrow(
      'snapshot database offline',
    )
  })

  it('never imports, reads, writes, or removes v1/v3 local or session storage snapshots', async () => {
    const legacyKeys = [
      'workspace.card-transcript-snapshot.v1:remote%3Asnapshot-card',
      'workspace.card-transcript-snapshot.v3:remote%3Asnapshot-card:aggregate',
      'workspace.card-transcript-snapshot.v3:remote%3Asnapshot-card:commit:old',
      'workspace.card-transcript-snapshot.v3:remote%3Asnapshot-card:chunk:old:0',
    ]
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (const key of legacyKeys) storage.setItem(key, `untouched:${key}`)
    }
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem')

    await writeCardTranscriptSnapshot(cardId, [message('v4 only')])
    await readCardTranscriptSnapshot(cardId)

    expect(getItem).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (const key of legacyKeys) {
        expect(storage.getItem(key)).toBe(`untouched:${key}`)
      }
    }
  })
})
