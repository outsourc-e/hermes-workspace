// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { operationsChatStorageForTests } from './use-agent-chat'
import {
  WORKSPACE_CHAT_STORE_NAMES,
  resetWorkspaceChatIndexedDb,
} from '@/screens/chat/card-transcript-indexeddb'

const cardId = 'remote:operations-concurrency'
const legacyOverlayKey =
  'workspace.operations-card-chat.v1:remote%3Aoperations-concurrency'
const legacySnapshotKey =
  'workspace.operations-card-complete-history.v1:remote%3Aoperations-concurrency'

function overlay(id: string, content: string) {
  return {
    id,
    role: 'user' as const,
    content,
    acknowledgementOrdinal: 1,
  }
}

function complete(id: string, content: string) {
  return { id, role: 'assistant' as const, content }
}

async function resetDatabase(): Promise<void> {
  const database = await resetWorkspaceChatIndexedDb()
  database.close()
}

describe('Operations Card IndexedDB v4 storage', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.restoreAllMocks()
    await resetDatabase()
  })

  it('never reads, copies, rewrites, or removes exact legacy browser values', async () => {
    const legacyLocal = JSON.stringify({
      version: 2,
      revision: 99,
      owner: { cardId },
      messages: [overlay('legacy-local', 'must not migrate')],
    })
    const legacySession = JSON.stringify({
      version: 1,
      owner: { cardId },
      messages: [complete('legacy-session', 'must not hydrate')],
    })
    window.localStorage.setItem(legacyOverlayKey, legacyLocal)
    window.sessionStorage.setItem(legacySnapshotKey, legacySession)
    window.localStorage.setItem('workspace.sidebar.collapsed', 'true')
    window.sessionStorage.setItem('workspace.card-draft.v1:keep', 'draft')

    const getSpy = vi.spyOn(Storage.prototype, 'getItem')
    const setSpy = vi.spyOn(Storage.prototype, 'setItem')
    const removeSpy = vi.spyOn(Storage.prototype, 'removeItem')
    const acceptedOverlay = overlay('v4-user', 'IndexedDB only')
    const acceptedSnapshot = complete('v4-assistant', 'latest v4 snapshot')

    await expect(
      operationsChatStorageForTests.writeOverlay(cardId, [acceptedOverlay]),
    ).resolves.toBe(true)
    await expect(
      operationsChatStorageForTests.writeCompleteSnapshot(cardId, [
        acceptedSnapshot,
      ]),
    ).resolves.toBe(true)
    await expect(
      operationsChatStorageForTests.readOverlay(cardId),
    ).resolves.toEqual([acceptedOverlay])
    await expect(
      operationsChatStorageForTests.readCompleteSnapshot(cardId),
    ).resolves.toEqual([acceptedSnapshot])

    expect(getSpy).not.toHaveBeenCalled()
    expect(setSpy).not.toHaveBeenCalled()
    expect(removeSpy).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(legacyOverlayKey)).toBe(legacyLocal)
    expect(window.sessionStorage.getItem(legacySnapshotKey)).toBe(legacySession)
    expect(window.localStorage.getItem('workspace.sidebar.collapsed')).toBe(
      'true',
    )
    expect(window.sessionStorage.getItem('workspace.card-draft.v1:keep')).toBe(
      'draft',
    )
  })

  it('keeps only the latest verified complete snapshot for an Operations owner', async () => {
    const first = complete('complete-first', 'first complete projection')
    const second = complete('complete-second', 'second complete projection')

    await expect(
      operationsChatStorageForTests.writeCompleteSnapshot(cardId, [first]),
    ).resolves.toBe(true)
    await expect(
      operationsChatStorageForTests.writeCompleteSnapshot(cardId, [second]),
    ).resolves.toBe(true)

    await expect(
      operationsChatStorageForTests.readCompleteSnapshot(cardId),
    ).resolves.toEqual([second])
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('denies overlay admission when the durable IndexedDB transaction cannot write', async () => {
    const originalPut = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value,
      key,
    ) {
      if (this.name === WORKSPACE_CHAT_STORE_NAMES.durableJournal) {
        throw new DOMException('IndexedDB denied', 'SecurityError')
      }
      return originalPut.call(this, value, key)
    })

    await expect(
      operationsChatStorageForTests.writeOverlay(cardId, [
        overlay('rejected', 'must not authorize send'),
      ]),
    ).resolves.toBe(false)
    await expect(
      operationsChatStorageForTests.readOverlay(cardId),
    ).resolves.toEqual([])
  })
})
