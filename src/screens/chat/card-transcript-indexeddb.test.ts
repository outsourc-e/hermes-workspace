// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  WORKSPACE_CHAT_DATABASE_NAME,
  WORKSPACE_CHAT_DATABASE_VERSION,
  WORKSPACE_CHAT_STORE_NAMES,
  applyDurableJournalDeltaAtomically,
  encodeWorkspaceChatV4Record,
  deleteCardRecovery,
  deleteLatestCardSnapshot,
  deletePendingSend,
  getWorkspaceChatStorageHealth,
  handoffPendingSendAtomically,
  handoffPendingSendToCardRecoveryAtomically,
  initializeWorkspaceChatIndexedDb,
  isObsoleteWorkspaceChatStorageKey,
  movePendingSend,
  mutateCardRecoveryAtomically,
  mutatePendingSendAtomically,
  openWorkspaceChatIndexedDb,
  readCardRecovery,
  readDurableJournal,
  readLatestCardSnapshot,
  readOrderedDurableJournal,
  readPendingSend,
  removeDurableJournal,
  replaceCardRecovery,
  resetWorkspaceChatIndexedDb,
  writeCardRecovery,
  writeDurableJournalEntry,
  writeLatestCardSnapshot,
  writePendingSend,
  writeSnapshotAndAcknowledgeRecoveryAtomically,
} from './card-transcript-indexeddb'

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(WORKSPACE_CHAT_DATABASE_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () =>
      reject(new Error('test database deletion blocked'))
  })
}

function storageKeys(storage: Storage): Array<string> {
  return Array.from({ length: storage.length }, (_, index) =>
    storage.key(index),
  ).filter((key): key is string => key !== null)
}

function v4Metadata(writeId: string, revision = 1) {
  return {
    schema: 4 as const,
    revision,
    writeId,
    updatedAt: 1_700_000_000_000 + revision,
  }
}

describe('Workspace chat IndexedDB v4 authority', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    await deleteDatabase()
    vi.restoreAllMocks()
  })

  it('initializes an empty v4 schema by deleting only exact obsolete browser keys without reading or migrating values', async () => {
    const obsoleteLocalKeys = [
      'workspace.card-transcript-snapshot.v1:card:chunk:0',
      'workspace.card-transcript-snapshot.v3:card:aggregate',
      'workspace.card-transcript-recovery.v1:card:segment',
      'workspace.card-transcript-recovery.v2:card',
      'workspace.chat-provisional-send.v1:new-chat',
      'workspace.chat-provisional-send.v2:new-chat:tab',
      'claude_pending_msg_card',
      'workspace.operations-card-chat.v1:remote%3Acard',
      'workspace.operations-card-complete-history.v1:remote%3Acard',
      'workspace.durable-message-journal.v1:workspace.operations-card-chat.v1%3Aremote%253Acard:entry:user',
      'workspace.durable-message-journal.v1:workspace.operations-card-complete-history.v1%3Aremote%253Acard:entry:assistant',
    ]
    const obsoleteSessionKeys = [
      'workspace.card-transcript-snapshot.v1:session-card',
      'workspace.card-transcript-snapshot.v3:session-card:aggregate',
      'workspace.card-transcript-recovery.v1:session-card:segment',
      'workspace.card-transcript-recovery.v2:session-card',
      'workspace.chat-provisional-owner.v1',
      'workspace.operations-card-chat.v1:local%3Acard',
      'workspace.operations-card-complete-history.v1:local%3Acard',
      'workspace.durable-message-journal.v1:workspace.operations-card-chat.v1%3Alocal%253Acard:entry:user',
      'workspace.durable-message-journal.v1:workspace.operations-card-complete-history.v1%3Alocal%253Acard:entry:assistant',
    ]
    const survivingKeys = [
      'workspace.card-transcript-snapshot.v99:card:aggregate',
      'workspace.card-transcript-recovery.v99:card',
      'workspace.chat-provisional-send.v99:new-chat:tab',
      'workspace.chat-provisional-send.v1:new-chat:tab',
      'workspace.chat-provisional-owner.v1:future',
      'workspace.operations-card-chat.v99:card',
      'workspace.operations-card-complete-history.v99:card',
      'workspace.durable-message-journal.v1:workspace.unknown-chat.v99%3Acard:entry:user',
      'workspace.sidebar.collapsed',
      'workspace.card-draft.v1:card',
      'workspace.chat-unknown.v99:card',
      'workspace.chat-card-streaming.v1:card',
      'workspace.pending-send.v2:card',
      'claude_portable_chat_main',
      'unrelated.application.key',
    ]

    for (const [storage, obsoleteKeys] of [
      [window.localStorage, obsoleteLocalKeys],
      [window.sessionStorage, obsoleteSessionKeys],
    ] as const) {
      for (const key of obsoleteKeys) storage.setItem(key, `secret:${key}`)
      for (const key of survivingKeys) storage.setItem(key, `keep:${key}`)
    }

    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem')
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    const database = await initializeWorkspaceChatIndexedDb()

    expect(database.version).toBe(WORKSPACE_CHAT_DATABASE_VERSION)
    expect(Array.from(database.objectStoreNames).sort()).toEqual(
      Object.values(WORKSPACE_CHAT_STORE_NAMES).sort(),
    )
    database.close()
    expect(getItemSpy).not.toHaveBeenCalled()
    expect(setItemSpy).not.toHaveBeenCalled()
    getItemSpy.mockRestore()
    setItemSpy.mockRestore()

    await expect(getWorkspaceChatStorageHealth()).resolves.toMatchObject({
      stores: {
        latestCardSnapshots: { recordCount: 0, serializedBytes: 0 },
        cardRecovery: { recordCount: 0, serializedBytes: 0 },
        durableJournal: { recordCount: 0, serializedBytes: 0 },
        pendingSends: { recordCount: 0, serializedBytes: 0 },
      },
    })

    for (const storage of [window.localStorage, window.sessionStorage]) {
      expect(storageKeys(storage).sort()).toEqual([...survivingKeys].sort())
    }
  })

  it('exports a narrow, documented obsolete-key predicate', () => {
    const obsoleteKeys = [
      'workspace.card-transcript-snapshot.v1:x',
      'workspace.card-transcript-snapshot.v3:x',
      'workspace.card-transcript-recovery.v1:x',
      'workspace.card-transcript-recovery.v2:x',
      'workspace.chat-provisional-send.v1:new-chat',
      'workspace.chat-provisional-send.v2:new-chat:x',
      'claude_pending_msg_x',
      'workspace.chat-provisional-owner.v1',
      'workspace.operations-card-chat.v1:x',
      'workspace.operations-card-complete-history.v1:x',
      'workspace.durable-message-journal.v1:workspace.operations-card-chat.v1%3Ax:entry:y',
      'workspace.durable-message-journal.v1:workspace.operations-card-complete-history.v1%3Ax:entry:y',
    ]
    const survivingKeys = [
      'workspace.card-transcript-snapshot.v99:x',
      'workspace.card-transcript-recovery.v99:x',
      'workspace.chat-provisional-send.v99:new-chat:x',
      'workspace.chat-provisional-send.v1:new-chat:x',
      'workspace.chat-provisional-owner.v1:x',
      'workspace.operations-card-chat.v99:x',
      'workspace.operations-card-complete-history.v99:x',
      'workspace.durable-message-journal.v1:workspace.unknown-chat.v1%3Ax:entry:y',
      'workspace.card-draft.v1:x',
      'workspace.sidebar.preference.v1',
      'workspace.chat-card-streaming.v1:x',
      'workspace.pending-send.v2:x',
      'claude_portable_chat_main',
      'unknown.application.key',
    ]

    for (const key of obsoleteKeys) {
      expect(isObsoleteWorkspaceChatStorageKey(key), key).toBe(true)
    }
    for (const key of survivingKeys) {
      expect(isObsoleteWorkspaceChatStorageKey(key), key).toBe(false)
    }
  })

  it('writes, semantically verifies, reads, and deletes one latest snapshot per Card', async () => {
    const record = {
      cardId: 'remote:card-a',
      payload: {
        messages: [{ role: 'assistant', text: 'hello' }],
        revision: 3,
      },
    }

    await writeLatestCardSnapshot(record)
    const stored = await readLatestCardSnapshot<typeof record.payload>(
      record.cardId,
    )
    expect(stored).toEqual(record)
    expect(stored).not.toBe(record)

    await writeLatestCardSnapshot({
      ...record,
      payload: { messages: [], revision: 4 },
    })
    await expect(readLatestCardSnapshot(record.cardId)).resolves.toEqual({
      cardId: record.cardId,
      payload: { messages: [], revision: 4 },
    })

    await deleteLatestCardSnapshot(record.cardId)
    await expect(readLatestCardSnapshot(record.cardId)).resolves.toBeNull()
  })

  it('queues dependent write readback in the originating request callback', async () => {
    const events: Array<string> = []
    const originalPut = IDBObjectStore.prototype.put
    const originalGet = IDBObjectStore.prototype.get
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value,
      key,
    ) {
      const request =
        key === undefined
          ? originalPut.call(this, value)
          : originalPut.call(this, value, key)
      request.addEventListener(
        'success',
        () => {
          events.push('put-success')
          queueMicrotask(() => events.push('put-success-microtask'))
        },
        { once: true },
      )
      return request
    })
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (
      this: IDBObjectStore,
      query,
    ) {
      events.push(`get:${String(query)}`)
      return originalGet.call(this, query)
    })

    await writeLatestCardSnapshot({
      cardId: 'card-dependent-readback',
      payload: { value: 'verified' },
    })

    // fake-indexeddb does not reproduce Safari's microtask auto-commit boundary.
    // Ordering the get before the listener's microtask proves the dependent
    // request is queued synchronously from put.onsuccess instead of a Promise.
    expect(events).toEqual([
      'put-success',
      'get:card-dependent-readback',
      'put-success-microtask',
    ])
  })

  it('writes, replaces, reads, and deletes Card recovery records', async () => {
    await writeCardRecovery({
      cardId: 'card-a',
      payload: { messages: ['first'] },
    })
    await expect(readCardRecovery('card-a')).resolves.toEqual({
      cardId: 'card-a',
      payload: { messages: ['first'] },
    })

    await replaceCardRecovery({
      cardId: 'card-a',
      payload: { messages: ['replacement'] },
    })
    await expect(readCardRecovery('card-a')).resolves.toEqual({
      cardId: 'card-a',
      payload: { messages: ['replacement'] },
    })

    await deleteCardRecovery('card-a')
    await expect(readCardRecovery('card-a')).resolves.toBeNull()
  })

  it('keeps generic durable journals keyed by owner and entry and removes one or all entries', async () => {
    await writeDurableJournalEntry({
      ownerKey: 'card-a',
      entryKey: 'entry-b',
      payload: { sequence: 2 },
    })
    await writeDurableJournalEntry({
      ownerKey: 'card-a',
      entryKey: 'entry-a',
      payload: { sequence: 1 },
    })
    await writeDurableJournalEntry({
      ownerKey: 'card-b',
      entryKey: 'entry-a',
      payload: { sequence: 99 },
    })

    await expect(readDurableJournal('card-a')).resolves.toEqual([
      { ownerKey: 'card-a', entryKey: 'entry-a', payload: { sequence: 1 } },
      { ownerKey: 'card-a', entryKey: 'entry-b', payload: { sequence: 2 } },
    ])

    await removeDurableJournal('card-a', ['entry-a'])
    await expect(readDurableJournal('card-a')).resolves.toEqual([
      { ownerKey: 'card-a', entryKey: 'entry-b', payload: { sequence: 2 } },
    ])
    await removeDurableJournal('card-a')
    await expect(readDurableJournal('card-a')).resolves.toEqual([])
    await expect(readDurableJournal('card-b')).resolves.toHaveLength(1)
  })

  it('writes, reads, atomically moves, and deletes pending-send ownership', async () => {
    await writePendingSend({
      ownerKey: 'bootstrap:tab-a',
      payload: { text: 'send me', attachments: [] },
    })

    await movePendingSend('bootstrap:tab-a', 'remote:card-a')
    await expect(readPendingSend('bootstrap:tab-a')).resolves.toBeNull()
    await expect(readPendingSend('remote:card-a')).resolves.toEqual({
      ownerKey: 'remote:card-a',
      payload: { text: 'send me', attachments: [] },
    })

    await deletePendingSend('remote:card-a')
    await expect(readPendingSend('remote:card-a')).resolves.toBeNull()
    await expect(movePendingSend('missing', 'destination')).rejects.toThrow(
      'Pending send source does not exist',
    )
  })

  it('aborts a pending move before source deletion when destination verification cannot be queued', async () => {
    const source = {
      ownerKey: 'bootstrap:verification-failure',
      payload: { text: 'must survive', attachments: [] },
    }
    const destinationOwnerKey = 'remote:verification-failure'
    await writePendingSend(source)

    const originalGet = IDBObjectStore.prototype.get
    const getSpy = vi
      .spyOn(IDBObjectStore.prototype, 'get')
      .mockImplementation(function (this: IDBObjectStore, query) {
        if (query === destinationOwnerKey) {
          throw new Error('forced destination verification failure')
        }
        return originalGet.call(this, query)
      })

    await expect(
      movePendingSend(source.ownerKey, destinationOwnerKey),
    ).rejects.toThrow('forced destination verification failure')
    getSpy.mockRestore()

    await expect(readPendingSend(source.ownerKey)).resolves.toEqual(source)
    await expect(readPendingSend(destinationOwnerKey)).resolves.toBeNull()
  })

  it('fails closed for nonportable, sparse, non-finite, and over-limit new v4 records', () => {
    const valid = {
      ...v4Metadata('codec-valid'),
      payload: { nested: [null, true, 4, 'portable'] },
    }
    const encoded = encodeWorkspaceChatV4Record(valid)
    expect(encoded).toEqual(valid)
    expect(encoded).not.toBe(valid)

    const sparse = Array<unknown>(2)
    sparse[1] = 'present'
    for (const payload of [
      { value: Number.NaN },
      sparse,
      { value: undefined },
      { value: new Date(0) },
    ]) {
      expect(() =>
        encodeWorkspaceChatV4Record({
          ...v4Metadata('codec-invalid'),
          payload,
        }),
      ).toThrow(/portable|sparse|finite/i)
    }

    expect(() =>
      encodeWorkspaceChatV4Record(
        {
          ...v4Metadata('codec-over-limit'),
          payload: { text: 'x'.repeat(512) },
        },
        { maxSerializedBytes: 128 },
      ),
    ).toThrow(/size|bytes|limit/i)
  })

  it('rejects a recovery CAS after a late append without overwriting the winner', async () => {
    const initial = {
      cardId: 'card-recovery-cas',
      ...v4Metadata('recovery-write-1', 1),
      payload: { messages: ['initial'] },
    }
    const lateAppend = {
      cardId: initial.cardId,
      ...v4Metadata('recovery-write-2', 2),
      payload: { messages: ['initial', 'late'] },
    }
    await writeCardRecovery(initial)
    await mutateCardRecoveryAtomically({
      cardId: initial.cardId,
      expectedWriteId: initial.writeId,
      mutation: { type: 'append', record: lateAppend },
    })

    await expect(
      mutateCardRecoveryAtomically({
        cardId: initial.cardId,
        expectedWriteId: initial.writeId,
        mutation: {
          type: 'append',
          record: {
            cardId: initial.cardId,
            ...v4Metadata('stale-write', 2),
            payload: { messages: ['initial', 'stale'] },
          },
        },
      }),
    ).rejects.toThrow(/compare-and-swap|writeId/i)
    await expect(readCardRecovery(initial.cardId)).resolves.toEqual(lateAppend)
  })

  it('rolls back both records when snapshot plus recovery acknowledgement verification fails', async () => {
    const cardId = 'card-snapshot-ack-rollback'
    const oldSnapshot = {
      cardId,
      ...v4Metadata('snapshot-old', 1),
      payload: { messages: ['old snapshot'] },
    }
    const recovery = {
      cardId,
      ...v4Metadata('recovery-old', 1),
      payload: { messages: ['recover me'] },
    }
    await writeLatestCardSnapshot(oldSnapshot)
    await writeCardRecovery(recovery)

    const originalGet = IDBObjectStore.prototype.get
    let recoveryReads = 0
    const getSpy = vi
      .spyOn(IDBObjectStore.prototype, 'get')
      .mockImplementation(function (this: IDBObjectStore, query) {
        if (
          this.name === WORKSPACE_CHAT_STORE_NAMES.cardRecovery &&
          query === cardId &&
          ++recoveryReads === 2
        ) {
          throw new Error('forced recovery acknowledgement readback failure')
        }
        return originalGet.call(this, query)
      })

    await expect(
      writeSnapshotAndAcknowledgeRecoveryAtomically({
        snapshot: {
          cardId,
          ...v4Metadata('snapshot-new', 2),
          payload: { messages: ['durable snapshot'] },
        },
        expectedRecoveryWriteId: recovery.writeId,
        recoveryMutation: {
          type: 'replace',
          record: {
            cardId,
            ...v4Metadata('recovery-replacement', 2),
            payload: { messages: ['remaining'] },
          },
        },
      }),
    ).rejects.toThrow('forced recovery acknowledgement readback failure')
    getSpy.mockRestore()

    await expect(readLatestCardSnapshot(cardId)).resolves.toEqual(oldSnapshot)
    await expect(readCardRecovery(cardId)).resolves.toEqual(recovery)
  })

  it('requires explicit destination merge output for pending handoff and never retains stale ownership fields', async () => {
    const source = {
      ownerKey: 'bootstrap:pending-handoff',
      ...v4Metadata('pending-source', 1),
      payload: { embeddedOwner: 'bootstrap:pending-handoff', text: 'new' },
    }
    const existingDestination = {
      ownerKey: 'remote:pending-handoff',
      ...v4Metadata('pending-destination-old', 1),
      payload: { embeddedOwner: 'stale-owner', text: 'old' },
    }
    const transformedDestination = {
      ownerKey: existingDestination.ownerKey,
      ...v4Metadata('pending-destination-new', 2),
      payload: { embeddedOwner: existingDestination.ownerKey, text: 'new' },
    }
    const mergedDestination = {
      ownerKey: existingDestination.ownerKey,
      ...v4Metadata('pending-destination-merged', 3),
      payload: {
        embeddedOwner: existingDestination.ownerKey,
        text: 'old + new',
      },
    }
    await writePendingSend(source)
    await writePendingSend(existingDestination)

    await expect(
      handoffPendingSendAtomically({
        sourceOwnerKey: source.ownerKey,
        expectedSourceWriteId: source.writeId,
        destination: transformedDestination,
      }),
    ).rejects.toThrow(/merge output/i)
    await expect(readPendingSend(source.ownerKey)).resolves.toEqual(source)
    await expect(
      readPendingSend(existingDestination.ownerKey),
    ).resolves.toEqual(existingDestination)

    await handoffPendingSendAtomically({
      sourceOwnerKey: source.ownerKey,
      expectedSourceWriteId: source.writeId,
      destination: transformedDestination,
      existingDestinationMerge: {
        expectedWriteId: existingDestination.writeId,
        record: mergedDestination,
      },
    })
    await expect(readPendingSend(source.ownerKey)).resolves.toBeNull()
    await expect(
      readPendingSend(existingDestination.ownerKey),
    ).resolves.toEqual(mergedDestination)
  })

  it('atomically mutates pending records by writeId', async () => {
    const initial = {
      ownerKey: 'pending-cas',
      ...v4Metadata('pending-write-1', 1),
      payload: { text: 'first' },
    }
    const replacement = {
      ownerKey: initial.ownerKey,
      ...v4Metadata('pending-write-2', 2),
      payload: { text: 'second' },
    }
    await writePendingSend(initial)
    await mutatePendingSendAtomically({
      ownerKey: initial.ownerKey,
      expectedWriteId: initial.writeId,
      mutation: { type: 'replace', record: replacement },
    })
    await expect(
      mutatePendingSendAtomically({
        ownerKey: initial.ownerKey,
        expectedWriteId: initial.writeId,
        mutation: { type: 'delete' },
      }),
    ).rejects.toThrow(/compare-and-swap|writeId/i)
    await expect(readPendingSend(initial.ownerKey)).resolves.toEqual(
      replacement,
    )
  })

  it('retains pending source when pending to recovery destination verification fails', async () => {
    const source = {
      ownerKey: 'bootstrap:pending-to-recovery',
      ...v4Metadata('pending-to-recovery-source', 1),
      payload: { embeddedOwner: 'bootstrap:pending-to-recovery', text: 'send' },
    }
    const recoveryCardId = 'remote:pending-to-recovery'
    await writePendingSend(source)

    const originalGet = IDBObjectStore.prototype.get
    let recoveryReads = 0
    const getSpy = vi
      .spyOn(IDBObjectStore.prototype, 'get')
      .mockImplementation(function (this: IDBObjectStore, query) {
        if (
          this.name === WORKSPACE_CHAT_STORE_NAMES.cardRecovery &&
          query === recoveryCardId &&
          ++recoveryReads === 2
        ) {
          throw new Error('forced recovery destination verification failure')
        }
        return originalGet.call(this, query)
      })

    await expect(
      handoffPendingSendToCardRecoveryAtomically({
        sourceOwnerKey: source.ownerKey,
        expectedPendingWriteId: source.writeId,
        recoveryCardId,
        expectedRecoveryWriteId: null,
        recoveryMutation: {
          type: 'replace',
          record: {
            cardId: recoveryCardId,
            ...v4Metadata('pending-to-recovery-destination', 1),
            payload: {
              embeddedOwner: recoveryCardId,
              messages: ['send'],
            },
          },
        },
      }),
    ).rejects.toThrow('forced recovery destination verification failure')
    getSpy.mockRestore()

    await expect(readPendingSend(source.ownerKey)).resolves.toEqual(source)
    await expect(readCardRecovery(recoveryCardId)).resolves.toBeNull()
  })

  it('rolls back every entry when one write in a multi-entry journal delta fails', async () => {
    const ownerKey = 'journal-delta-rollback'
    const existing = {
      ownerKey,
      entryKey: 'existing',
      ordinal: 0,
      ...v4Metadata('journal-existing', 1),
      payload: { text: 'keep' },
    }
    await writeDurableJournalEntry(existing)

    const originalPut = IDBObjectStore.prototype.put
    let journalPuts = 0
    const putSpy = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementation(function (this: IDBObjectStore, value, key) {
        if (
          this.name === WORKSPACE_CHAT_STORE_NAMES.durableJournal &&
          ++journalPuts === 2
        ) {
          throw new Error('forced second journal write failure')
        }
        return key === undefined
          ? originalPut.call(this, value)
          : originalPut.call(this, value, key)
      })

    await expect(
      applyDurableJournalDeltaAtomically({
        ownerKey,
        removals: [existing.entryKey],
        upserts: [
          {
            ownerKey,
            entryKey: 'entry-a',
            ordinal: 1,
            ...v4Metadata('journal-a', 2),
            payload: { text: 'a' },
          },
          {
            ownerKey,
            entryKey: 'entry-b',
            ordinal: 2,
            ...v4Metadata('journal-b', 2),
            payload: { text: 'b' },
          },
        ],
      }),
    ).rejects.toThrow('forced second journal write failure')
    putSpy.mockRestore()

    await expect(readDurableJournal(ownerKey)).resolves.toEqual([existing])
  })

  it('orders generic journal post-state by explicit ordinal independently of entry IDs', async () => {
    const ownerKey = 'journal-explicit-order'
    const result = await applyDurableJournalDeltaAtomically({
      ownerKey,
      removals: [],
      upserts: [
        {
          ownerKey,
          entryKey: 'entry-a-sorts-first',
          ordinal: 20,
          ...v4Metadata('journal-later', 1),
          payload: { text: 'later' },
        },
        {
          ownerKey,
          entryKey: 'entry-z-sorts-last',
          ordinal: 10,
          ...v4Metadata('journal-earlier', 1),
          payload: { text: 'earlier' },
        },
      ],
    })

    expect(result.map(({ entryKey }) => entryKey)).toEqual([
      'entry-z-sorts-last',
      'entry-a-sorts-first',
    ])
    await expect(readOrderedDurableJournal(ownerKey)).resolves.toEqual(result)
  })

  it('queues every dependent CAS write and readback synchronously inside request callbacks', async () => {
    const cardId = 'callback-queued-recovery-cas'
    const initial = {
      cardId,
      ...v4Metadata('callback-write-1', 1),
      payload: { messages: ['first'] },
    }
    await writeCardRecovery(initial)

    const events: Array<string> = []
    const originalGet = IDBObjectStore.prototype.get
    const originalPut = IDBObjectStore.prototype.put
    let recoveryGets = 0
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (
      this: IDBObjectStore,
      query,
    ) {
      if (
        this.name === WORKSPACE_CHAT_STORE_NAMES.cardRecovery &&
        query === cardId
      ) {
        recoveryGets += 1
        const getNumber = recoveryGets
        events.push(`get-${getNumber}-call`)
        const request = originalGet.call(this, query)
        request.addEventListener(
          'success',
          () => {
            events.push(`get-${getNumber}-success`)
            queueMicrotask(() => events.push(`get-${getNumber}-microtask`))
          },
          { once: true },
        )
        return request
      }
      return originalGet.call(this, query)
    })
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value,
      key,
    ) {
      if (this.name === WORKSPACE_CHAT_STORE_NAMES.cardRecovery) {
        events.push('put-call')
        const request =
          key === undefined
            ? originalPut.call(this, value)
            : originalPut.call(this, value, key)
        request.addEventListener(
          'success',
          () => {
            events.push('put-success')
            queueMicrotask(() => events.push('put-microtask'))
          },
          { once: true },
        )
        return request
      }
      return key === undefined
        ? originalPut.call(this, value)
        : originalPut.call(this, value, key)
    })

    await mutateCardRecoveryAtomically({
      cardId,
      expectedWriteId: initial.writeId,
      mutation: {
        type: 'merge',
        record: {
          cardId,
          ...v4Metadata('callback-write-2', 2),
          payload: { messages: ['first', 'second'] },
        },
      },
    })

    expect(events.indexOf('put-call')).toBeLessThan(
      events.indexOf('get-1-microtask'),
    )
    expect(events.indexOf('get-2-call')).toBeLessThan(
      events.indexOf('put-microtask'),
    )
  })

  it('reports content-free health metrics only', async () => {
    await writeLatestCardSnapshot({
      cardId: 'secret-card-id',
      payload: { messages: ['secret-message-value'] },
    })
    await writePendingSend({
      ownerKey: 'secret-owner-key',
      payload: { attachment: 'secret-attachment-data' },
    })
    const estimate = vi.fn().mockResolvedValue({ usage: 1234, quota: 5678 })
    const persist = vi.fn().mockResolvedValue(true)
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate, persist },
    })

    const health = await getWorkspaceChatStorageHealth()
    expect(Object.keys(health).sort()).toEqual([
      'databaseAvailable',
      'persistGranted',
      'storageEstimate',
      'stores',
    ])
    expect(Object.keys(health.storageEstimate ?? {}).sort()).toEqual([
      'quota',
      'usage',
    ])
    expect(Object.keys(health.stores).sort()).toEqual(
      Object.keys(WORKSPACE_CHAT_STORE_NAMES).sort(),
    )
    for (const storeHealth of Object.values(health.stores)) {
      expect(Object.keys(storeHealth).sort()).toEqual([
        'recordCount',
        'serializedBytes',
      ])
    }
    expect(health).toMatchObject({
      databaseAvailable: true,
      storageEstimate: { usage: 1234, quota: 5678 },
      persistGranted: true,
      stores: {
        latestCardSnapshots: { recordCount: 1 },
        cardRecovery: { recordCount: 0, serializedBytes: 0 },
        durableJournal: { recordCount: 0, serializedBytes: 0 },
        pendingSends: { recordCount: 1 },
      },
    })
    expect(estimate).toHaveBeenCalledOnce()
    expect(persist).toHaveBeenCalledOnce()
    const serializedHealth = JSON.stringify(health)
    for (const secret of [
      'secret-card-id',
      'secret-message-value',
      'secret-owner-key',
      'secret-attachment-data',
    ]) {
      expect(serializedHealth).not.toContain(secret)
    }
  })

  it('resets v4 records destructively while preserving unrelated browser keys', async () => {
    await writeLatestCardSnapshot({
      cardId: 'card-a',
      payload: { value: 'old' },
    })
    window.localStorage.setItem(
      'workspace.card-transcript-recovery.v2:old',
      'do-not-read',
    )
    window.localStorage.setItem('workspace.sidebar.collapsed', 'true')
    window.sessionStorage.setItem('workspace.chat-future.v9:keep', 'yes')

    const database = await resetWorkspaceChatIndexedDb()
    database.close()

    await expect(readLatestCardSnapshot('card-a')).resolves.toBeNull()
    expect(
      window.localStorage.getItem('workspace.card-transcript-recovery.v2:old'),
    ).toBeNull()
    expect(window.localStorage.getItem('workspace.sidebar.collapsed')).toBe(
      'true',
    )
    expect(window.sessionStorage.getItem('workspace.chat-future.v9:keep')).toBe(
      'yes',
    )

    const reopened = await openWorkspaceChatIndexedDb()
    expect(reopened.version).toBe(4)
    reopened.close()
  })
})
