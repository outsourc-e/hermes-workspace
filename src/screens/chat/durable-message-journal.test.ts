// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  WORKSPACE_CHAT_STORE_NAMES,
  resetWorkspaceChatIndexedDb,
} from './card-transcript-indexeddb'
import {
  readMessageJournal,
  removeMessageJournalValues,
  writeMessageJournal,
} from './durable-message-journal'

type JournalValue = { id: string; text: string }

function validateJournalValue(value: unknown): JournalValue | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof (value as Record<string, unknown>).id !== 'string' ||
    typeof (value as Record<string, unknown>).text !== 'string'
  ) {
    return null
  }
  return value as JournalValue
}

async function resetDatabase(): Promise<void> {
  const database = await resetWorkspaceChatIndexedDb()
  database.close()
}

describe('durable message journal IndexedDB v4 adapter', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.restoreAllMocks()
    await resetDatabase()
  })

  it('writes, orders, reads, and removes v4 journal rows without browser Storage', async () => {
    window.localStorage.setItem('unrelated.preference', 'keep')
    const getSpy = vi.spyOn(Storage.prototype, 'getItem')
    const setSpy = vi.spyOn(Storage.prototype, 'setItem')
    const removeSpy = vi.spyOn(Storage.prototype, 'removeItem')
    const ownerKey = 'operations-overlay:card-a'
    const first = { id: 'first', text: 'accepted user turn' }
    const second = { id: 'second', text: 'accepted assistant checkpoint' }

    await writeMessageJournal(ownerKey, [first, second], (value) => value.id)
    await expect(
      readMessageJournal(ownerKey, validateJournalValue),
    ).resolves.toEqual([first, second])

    await removeMessageJournalValues(ownerKey, [first], (value) => value.id)
    await expect(
      readMessageJournal(ownerKey, validateJournalValue),
    ).resolves.toEqual([second])

    expect(getSpy).not.toHaveBeenCalled()
    expect(setSpy).not.toHaveBeenCalled()
    expect(removeSpy).not.toHaveBeenCalled()
    expect(window.localStorage.getItem('unrelated.preference')).toBe('keep')
  })

  it('retains the previous committed rows when a replacement transaction fails', async () => {
    const ownerKey = 'operations-overlay:card-b'
    const acceptedUser = { id: 'user-1', text: 'accepted user turn' }
    const priorCheckpoint = {
      id: 'assistant-run-1',
      text: 'durable assistant prefix',
    }
    await writeMessageJournal(
      ownerKey,
      [acceptedUser, priorCheckpoint],
      (value) => value.id,
    )

    const originalPut = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value,
      key,
    ) {
      if (
        this.name === WORKSPACE_CHAT_STORE_NAMES.durableJournal &&
        (value as { entryKey?: string }).entryKey === priorCheckpoint.id
      ) {
        throw new DOMException('journal write denied', 'QuotaExceededError')
      }
      return originalPut.call(this, value, key)
    })

    await expect(
      writeMessageJournal(
        ownerKey,
        [{ ...priorCheckpoint, text: 'unverified replacement' }],
        (value) => value.id,
      ),
    ).rejects.toThrow()

    vi.mocked(IDBObjectStore.prototype.put).mockRestore()
    await expect(
      readMessageJournal(ownerKey, validateJournalValue),
    ).resolves.toEqual([acceptedUser, priorCheckpoint])
  })
})
