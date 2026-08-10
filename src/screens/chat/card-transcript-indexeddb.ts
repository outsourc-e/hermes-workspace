export const WORKSPACE_CHAT_DATABASE_NAME = 'workspace-chat'
export const WORKSPACE_CHAT_DATABASE_VERSION = 4 as const

export const WORKSPACE_CHAT_STORE_NAMES = {
  latestCardSnapshots: 'latest-card-snapshots',
  cardRecovery: 'card-recovery',
  durableJournal: 'durable-journal',
  pendingSends: 'pending-sends',
} as const

const JOURNAL_OWNER_INDEX = 'ownerKey'

export type PortableValue =
  | null
  | boolean
  | number
  | string
  | Array<PortableValue>
  | { [key: string]: PortableValue }

export type LatestCardSnapshotRecord<
  TPayload extends PortableValue = PortableValue,
> = {
  cardId: string
  payload: TPayload
}

export type CardRecoveryRecord<TPayload extends PortableValue = PortableValue> =
  {
    cardId: string
    payload: TPayload
  }

export type DurableJournalRecord<
  TPayload extends PortableValue = PortableValue,
> = {
  ownerKey: string
  entryKey: string
  payload: TPayload
}

export type PendingSendRecord<TPayload extends PortableValue = PortableValue> =
  {
    ownerKey: string
    payload: TPayload
  }

export type WorkspaceChatStoreHealth = {
  recordCount: number
  serializedBytes: number
}

export type WorkspaceChatStorageHealth = {
  databaseAvailable: boolean
  storageEstimate: {
    usage: number | null
    quota: number | null
  } | null
  persistGranted: boolean | null
  stores: Record<
    keyof typeof WORKSPACE_CHAT_STORE_NAMES,
    WorkspaceChatStoreHealth
  >
}

/**
 * Exact clean-slate allowlist for browser-storage chat authorities superseded by
 * IndexedDB v4. The predicate is intentionally not a broad `workspace.chat.*`
 * match: drafts, preferences, unrelated products, and unknown future keys must
 * survive initialization and reset.
 */
const OBSOLETE_OPERATIONS_STORAGE_PREFIXES = [
  'workspace.operations-card-chat.v1:',
  'workspace.operations-card-complete-history.v1:',
] as const

const OBSOLETE_WORKSPACE_CHAT_STORAGE_PREFIXES = [
  'workspace.card-transcript-snapshot.v1:',
  'workspace.card-transcript-snapshot.v3:',
  'workspace.card-transcript-recovery.v1:',
  'workspace.card-transcript-recovery.v2:',
  'workspace.chat-provisional-send.v2:new-chat:',
  'claude_pending_msg_',
  ...OBSOLETE_OPERATIONS_STORAGE_PREFIXES,
  ...OBSOLETE_OPERATIONS_STORAGE_PREFIXES.map(
    (prefix) =>
      `workspace.durable-message-journal.v1:${encodeURIComponent(prefix)}`,
  ),
] as const

export function isObsoleteWorkspaceChatStorageKey(key: string): boolean {
  return (
    key === 'workspace.chat-provisional-send.v1:new-chat' ||
    key === 'workspace.chat-provisional-owner.v1' ||
    OBSOLETE_WORKSPACE_CHAT_STORAGE_PREFIXES.some((prefix) =>
      key.startsWith(prefix),
    )
  )
}

function indexedDbFactory(): IDBFactory {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is unavailable')
  }
  return indexedDB
}

function createV4Schema(database: IDBDatabase): void {
  for (const storeName of Array.from(database.objectStoreNames)) {
    database.deleteObjectStore(storeName)
  }

  database.createObjectStore(WORKSPACE_CHAT_STORE_NAMES.latestCardSnapshots, {
    keyPath: 'cardId',
  })
  database.createObjectStore(WORKSPACE_CHAT_STORE_NAMES.cardRecovery, {
    keyPath: 'cardId',
  })
  const journal = database.createObjectStore(
    WORKSPACE_CHAT_STORE_NAMES.durableJournal,
    { keyPath: ['ownerKey', 'entryKey'] },
  )
  journal.createIndex(JOURNAL_OWNER_INDEX, 'ownerKey', { unique: false })
  database.createObjectStore(WORKSPACE_CHAT_STORE_NAMES.pendingSends, {
    keyPath: 'ownerKey',
  })
}

function keyPathMatches(
  actual: string | Array<string> | null,
  expected: string | Array<string>,
): boolean {
  if (typeof expected === 'string') return actual === expected
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  )
}

function hasExactV4Schema(database: IDBDatabase): boolean {
  const expectedNames = Object.values(WORKSPACE_CHAT_STORE_NAMES).sort()
  const actualNames = Array.from(database.objectStoreNames).sort()
  if (
    expectedNames.length !== actualNames.length ||
    expectedNames.some((name, index) => name !== actualNames[index])
  ) {
    return false
  }

  try {
    const transaction = database.transaction(expectedNames, 'readonly')
    const latest = transaction.objectStore(
      WORKSPACE_CHAT_STORE_NAMES.latestCardSnapshots,
    )
    const recovery = transaction.objectStore(
      WORKSPACE_CHAT_STORE_NAMES.cardRecovery,
    )
    const journal = transaction.objectStore(
      WORKSPACE_CHAT_STORE_NAMES.durableJournal,
    )
    const pending = transaction.objectStore(
      WORKSPACE_CHAT_STORE_NAMES.pendingSends,
    )
    return (
      keyPathMatches(latest.keyPath, 'cardId') &&
      keyPathMatches(recovery.keyPath, 'cardId') &&
      keyPathMatches(journal.keyPath, ['ownerKey', 'entryKey']) &&
      journal.indexNames.contains(JOURNAL_OWNER_INDEX) &&
      keyPathMatches(journal.index(JOURNAL_OWNER_INDEX).keyPath, 'ownerKey') &&
      keyPathMatches(pending.keyPath, 'ownerKey')
    )
  } catch {
    return false
  }
}

export function openWorkspaceChatIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false
    let request: IDBOpenDBRequest
    try {
      request = indexedDbFactory().open(
        WORKSPACE_CHAT_DATABASE_NAME,
        WORKSPACE_CHAT_DATABASE_VERSION,
      )
    } catch (error) {
      reject(error)
      return
    }

    request.onupgradeneeded = () => createV4Schema(request.result)
    request.onerror = () => {
      if (settled) return
      settled = true
      reject(request.error ?? new Error('Workspace chat database open failed'))
    }
    request.onblocked = () => {
      if (settled) return
      settled = true
      reject(new Error('Workspace chat database open was blocked'))
    }
    request.onsuccess = () => {
      if (settled) {
        request.result.close()
        return
      }
      if (!hasExactV4Schema(request.result)) {
        settled = true
        request.result.close()
        reject(new Error('Workspace chat database v4 schema is invalid'))
        return
      }
      settled = true
      resolve(request.result)
    }
  })
}

function obsoleteKeys(storage: Storage): Array<string> {
  const keys: Array<string> = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key !== null && isObsoleteWorkspaceChatStorageKey(key)) keys.push(key)
  }
  return keys
}

function deleteObsoleteBrowserStorageKeys(): void {
  if (typeof window === 'undefined') return
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (const key of obsoleteKeys(storage)) storage.removeItem(key)
  }
}

export async function initializeWorkspaceChatIndexedDb(): Promise<IDBDatabase> {
  deleteObsoleteBrowserStorageKeys()
  return openWorkspaceChatIndexedDb()
}

function deleteWorkspaceChatDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDbFactory().deleteDatabase(WORKSPACE_CHAT_DATABASE_NAME)
    } catch (error) {
      reject(error)
      return
    }
    request.onsuccess = () => resolve()
    request.onerror = () =>
      reject(
        request.error ?? new Error('Workspace chat database deletion failed'),
      )
    request.onblocked = () =>
      reject(new Error('Workspace chat database deletion was blocked'))
  })
}

export async function resetWorkspaceChatIndexedDb(): Promise<IDBDatabase> {
  deleteObsoleteBrowserStorageKeys()
  await deleteWorkspaceChatDatabase()
  return openWorkspaceChatIndexedDb()
}

type TransactionControls<TResult> = {
  complete: (result: TResult) => void
  abort: (error: unknown) => void
}

function requestFailure(request: IDBRequest, fallback: string): Error {
  return request.error ?? new Error(fallback)
}

function runTransactionCallback<TResult>(
  controls: TransactionControls<TResult>,
  callback: () => void,
): void {
  try {
    callback()
  } catch (error) {
    controls.abort(error)
  }
}

async function withTransaction<TResult>(
  storeNames: string | Array<string>,
  mode: IDBTransactionMode,
  operation: (
    transaction: IDBTransaction,
    controls: TransactionControls<TResult>,
  ) => void,
): Promise<TResult> {
  const database = await openWorkspaceChatIndexedDb()
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction
    let result: TResult
    let hasResult = false
    let failure: unknown
    let hasFailure = false
    let settled = false

    const settle = (callback: () => void): void => {
      if (settled) return
      settled = true
      database.close()
      callback()
    }
    const controls: TransactionControls<TResult> = {
      complete: (nextResult) => {
        if (hasFailure) return
        result = nextResult
        hasResult = true
      },
      abort: (error) => {
        if (!hasFailure) {
          failure = error
          hasFailure = true
        }
        try {
          transaction.abort()
        } catch {
          // Completion/abort may already be queued; its handler settles the call.
        }
      },
    }

    try {
      transaction = database.transaction(storeNames, mode)
      transaction.oncomplete = () => {
        if (hasFailure) {
          settle(() => reject(failure))
        } else if (!hasResult) {
          settle(() =>
            reject(
              new Error(
                'Workspace chat IndexedDB transaction completed without a result',
              ),
            ),
          )
        } else {
          settle(() => resolve(result))
        }
      }
      transaction.onerror = () => {
        if (!hasFailure) {
          failure =
            transaction.error ??
            new Error('Workspace chat IndexedDB transaction failed')
          hasFailure = true
        }
      }
      transaction.onabort = () =>
        settle(() =>
          reject(
            hasFailure
              ? failure
              : (transaction.error ??
                  new Error('Workspace chat IndexedDB transaction aborted')),
          ),
        )

      runTransactionCallback(controls, () => operation(transaction, controls))
    } catch (error) {
      settle(() => reject(error))
    }
  })
}

function requireKey(label: string, value: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
}

function semanticEquivalent(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => semanticEquivalent(value, right[index]))
    )
  }
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) {
    return false
  }
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord).sort()
  const rightKeys = Object.keys(rightRecord).sort()
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        semanticEquivalent(leftRecord[key], rightRecord[key]),
    )
  )
}

function putAndVerify<TRecord>(
  store: IDBObjectStore,
  record: TRecord,
  key: IDBValidKey,
  controls: TransactionControls<void>,
): void {
  const putRequest = store.put(record)
  putRequest.onerror = () =>
    controls.abort(
      requestFailure(putRequest, 'Workspace chat IndexedDB write failed'),
    )
  putRequest.onsuccess = () =>
    runTransactionCallback(controls, () => {
      const readRequest = store.get(key)
      readRequest.onerror = () =>
        controls.abort(
          requestFailure(
            readRequest,
            'Workspace chat IndexedDB write readback failed',
          ),
        )
      readRequest.onsuccess = () =>
        runTransactionCallback(controls, () => {
          if (!semanticEquivalent(readRequest.result, record)) {
            controls.abort(
              new Error('Workspace chat IndexedDB write verification failed'),
            )
            return
          }
          controls.complete(undefined)
        })
    })
}

function deleteAndVerify(
  store: IDBObjectStore,
  key: IDBValidKey,
  controls: TransactionControls<void>,
): void {
  const deleteRequest = store.delete(key)
  deleteRequest.onerror = () =>
    controls.abort(
      requestFailure(deleteRequest, 'Workspace chat IndexedDB deletion failed'),
    )
  deleteRequest.onsuccess = () =>
    runTransactionCallback(controls, () => {
      const readRequest = store.get(key)
      readRequest.onerror = () =>
        controls.abort(
          requestFailure(
            readRequest,
            'Workspace chat IndexedDB deletion readback failed',
          ),
        )
      readRequest.onsuccess = () =>
        runTransactionCallback(controls, () => {
          if (readRequest.result !== undefined) {
            controls.abort(
              new Error(
                'Workspace chat IndexedDB deletion verification failed',
              ),
            )
            return
          }
          controls.complete(undefined)
        })
    })
}

function readAndComplete<TResult>(
  request: IDBRequest,
  controls: TransactionControls<TResult>,
  readResult: () => TResult,
): void {
  request.onerror = () =>
    controls.abort(
      requestFailure(request, 'Workspace chat IndexedDB read failed'),
    )
  request.onsuccess = () =>
    runTransactionCallback(controls, () => controls.complete(readResult()))
}

export async function writeLatestCardSnapshot<TPayload extends PortableValue>(
  record: LatestCardSnapshotRecord<TPayload>,
): Promise<void> {
  requireKey('cardId', record.cardId)
  await withTransaction(
    WORKSPACE_CHAT_STORE_NAMES.latestCardSnapshots,
    'readwrite',
    (transaction, controls) =>
      putAndVerify(
        transaction.objectStore(WORKSPACE_CHAT_STORE_NAMES.latestCardSnapshots),
        record,
        record.cardId,
        controls,
      ),
  )
}

export async function readLatestCardSnapshot<TPayload extends PortableValue>(
  cardId: string,
): Promise<LatestCardSnapshotRecord<TPayload> | null> {
  requireKey('cardId', cardId)
  return withTransaction(
    WORKSPACE_CHAT_STORE_NAMES.latestCardSnapshots,
    'readonly',
    (transaction, controls) => {
      const request = transaction
        .objectStore(WORKSPACE_CHAT_STORE_NAMES.latestCardSnapshots)
        .get(cardId)
      readAndComplete(request, controls, () =>
        request.result === undefined
          ? null
          : (request.result as LatestCardSnapshotRecord<TPayload>),
      )
    },
  )
}

export async function deleteLatestCardSnapshot(cardId: string): Promise<void> {
  requireKey('cardId', cardId)
  await withTransaction(
    WORKSPACE_CHAT_STORE_NAMES.latestCardSnapshots,
    'readwrite',
    (transaction, controls) =>
      deleteAndVerify(
        transaction.objectStore(WORKSPACE_CHAT_STORE_NAMES.latestCardSnapshots),
        cardId,
        controls,
      ),
  )
}

async function putCardRecovery<TPayload extends PortableValue>(
  record: CardRecoveryRecord<TPayload>,
): Promise<void> {
  requireKey('cardId', record.cardId)
  await withTransaction(
    WORKSPACE_CHAT_STORE_NAMES.cardRecovery,
    'readwrite',
    (transaction, controls) =>
      putAndVerify(
        transaction.objectStore(WORKSPACE_CHAT_STORE_NAMES.cardRecovery),
        record,
        record.cardId,
        controls,
      ),
  )
}

export async function writeCardRecovery<TPayload extends PortableValue>(
  record: CardRecoveryRecord<TPayload>,
): Promise<void> {
  await putCardRecovery(record)
}

export async function replaceCardRecovery<TPayload extends PortableValue>(
  record: CardRecoveryRecord<TPayload>,
): Promise<void> {
  await putCardRecovery(record)
}

export async function readCardRecovery<TPayload extends PortableValue>(
  cardId: string,
): Promise<CardRecoveryRecord<TPayload> | null> {
  requireKey('cardId', cardId)
  return withTransaction(
    WORKSPACE_CHAT_STORE_NAMES.cardRecovery,
    'readonly',
    (transaction, controls) => {
      const request = transaction
        .objectStore(WORKSPACE_CHAT_STORE_NAMES.cardRecovery)
        .get(cardId)
      readAndComplete(request, controls, () =>
        request.result === undefined
          ? null
          : (request.result as CardRecoveryRecord<TPayload>),
      )
    },
  )
}

export async function deleteCardRecovery(cardId: string): Promise<void> {
  requireKey('cardId', cardId)
  await withTransaction(
    WORKSPACE_CHAT_STORE_NAMES.cardRecovery,
    'readwrite',
    (transaction, controls) =>
      deleteAndVerify(
        transaction.objectStore(WORKSPACE_CHAT_STORE_NAMES.cardRecovery),
        cardId,
        controls,
      ),
  )
}

export async function writeDurableJournalEntry<TPayload extends PortableValue>(
  record: DurableJournalRecord<TPayload>,
): Promise<void> {
  requireKey('ownerKey', record.ownerKey)
  requireKey('entryKey', record.entryKey)
  await withTransaction(
    WORKSPACE_CHAT_STORE_NAMES.durableJournal,
    'readwrite',
    (transaction, controls) =>
      putAndVerify(
        transaction.objectStore(WORKSPACE_CHAT_STORE_NAMES.durableJournal),
        record,
        [record.ownerKey, record.entryKey],
        controls,
      ),
  )
}

export async function readDurableJournal<TPayload extends PortableValue>(
  ownerKey: string,
): Promise<Array<DurableJournalRecord<TPayload>>> {
  requireKey('ownerKey', ownerKey)
  return withTransaction(
    WORKSPACE_CHAT_STORE_NAMES.durableJournal,
    'readonly',
    (transaction, controls) => {
      const request = transaction
        .objectStore(WORKSPACE_CHAT_STORE_NAMES.durableJournal)
        .index(JOURNAL_OWNER_INDEX)
        .getAll(ownerKey)
      readAndComplete(request, controls, () =>
        (request.result as Array<DurableJournalRecord<TPayload>>).sort(
          (left, right) => left.entryKey.localeCompare(right.entryKey),
        ),
      )
    },
  )
}

function removeJournalEntries(
  store: IDBObjectStore,
  ownerKey: string,
  entryKeys: Array<string>,
  controls: TransactionControls<void>,
): void {
  if (entryKeys.length === 0) {
    controls.complete(undefined)
    return
  }

  let verifiedCount = 0
  for (const entryKey of entryKeys) {
    const key: Array<IDBValidKey> = [ownerKey, entryKey]
    const deleteRequest = store.delete(key)
    deleteRequest.onerror = () =>
      controls.abort(
        requestFailure(
          deleteRequest,
          'Workspace chat IndexedDB journal removal failed',
        ),
      )
    deleteRequest.onsuccess = () =>
      runTransactionCallback(controls, () => {
        const readRequest = store.get(key)
        readRequest.onerror = () =>
          controls.abort(
            requestFailure(
              readRequest,
              'Workspace chat IndexedDB journal removal readback failed',
            ),
          )
        readRequest.onsuccess = () =>
          runTransactionCallback(controls, () => {
            if (readRequest.result !== undefined) {
              controls.abort(
                new Error(
                  'Workspace chat IndexedDB journal removal verification failed',
                ),
              )
              return
            }
            verifiedCount += 1
            if (verifiedCount === entryKeys.length) controls.complete(undefined)
          })
      })
  }
}

export async function removeDurableJournal(
  ownerKey: string,
  entryKeys?: Array<string>,
): Promise<void> {
  requireKey('ownerKey', ownerKey)
  entryKeys?.forEach((entryKey) => requireKey('entryKey', entryKey))
  await withTransaction(
    WORKSPACE_CHAT_STORE_NAMES.durableJournal,
    'readwrite',
    (transaction, controls) => {
      const store = transaction.objectStore(
        WORKSPACE_CHAT_STORE_NAMES.durableJournal,
      )
      if (entryKeys !== undefined) {
        removeJournalEntries(store, ownerKey, entryKeys, controls)
        return
      }

      const keysRequest = store.index(JOURNAL_OWNER_INDEX).getAllKeys(ownerKey)
      keysRequest.onerror = () =>
        controls.abort(
          requestFailure(
            keysRequest,
            'Workspace chat IndexedDB journal key lookup failed',
          ),
        )
      keysRequest.onsuccess = () =>
        runTransactionCallback(controls, () => {
          const keys = (keysRequest.result as Array<Array<IDBValidKey>>).map(
            (key) => String(key[1]),
          )
          removeJournalEntries(store, ownerKey, keys, controls)
        })
    },
  )
}

export async function writePendingSend<TPayload extends PortableValue>(
  record: PendingSendRecord<TPayload>,
): Promise<void> {
  requireKey('ownerKey', record.ownerKey)
  await withTransaction(
    WORKSPACE_CHAT_STORE_NAMES.pendingSends,
    'readwrite',
    (transaction, controls) =>
      putAndVerify(
        transaction.objectStore(WORKSPACE_CHAT_STORE_NAMES.pendingSends),
        record,
        record.ownerKey,
        controls,
      ),
  )
}

export async function readPendingSend<TPayload extends PortableValue>(
  ownerKey: string,
): Promise<PendingSendRecord<TPayload> | null> {
  requireKey('ownerKey', ownerKey)
  return withTransaction(
    WORKSPACE_CHAT_STORE_NAMES.pendingSends,
    'readonly',
    (transaction, controls) => {
      const request = transaction
        .objectStore(WORKSPACE_CHAT_STORE_NAMES.pendingSends)
        .get(ownerKey)
      readAndComplete(request, controls, () =>
        request.result === undefined
          ? null
          : (request.result as PendingSendRecord<TPayload>),
      )
    },
  )
}

export async function movePendingSend(
  sourceOwnerKey: string,
  destinationOwnerKey: string,
): Promise<void> {
  requireKey('sourceOwnerKey', sourceOwnerKey)
  requireKey('destinationOwnerKey', destinationOwnerKey)
  await withTransaction(
    WORKSPACE_CHAT_STORE_NAMES.pendingSends,
    'readwrite',
    (transaction, controls) => {
      const store = transaction.objectStore(
        WORKSPACE_CHAT_STORE_NAMES.pendingSends,
      )
      const sourceRequest = store.get(sourceOwnerKey)
      sourceRequest.onerror = () =>
        controls.abort(
          requestFailure(
            sourceRequest,
            'Workspace chat IndexedDB pending-send source read failed',
          ),
        )
      sourceRequest.onsuccess = () =>
        runTransactionCallback(controls, () => {
          const source = sourceRequest.result as PendingSendRecord | undefined
          if (source === undefined) {
            controls.abort(new Error('Pending send source does not exist'))
            return
          }

          if (sourceOwnerKey === destinationOwnerKey) {
            const verificationRequest = store.get(sourceOwnerKey)
            verificationRequest.onerror = () =>
              controls.abort(
                requestFailure(
                  verificationRequest,
                  'Workspace chat IndexedDB pending-send move readback failed',
                ),
              )
            verificationRequest.onsuccess = () =>
              runTransactionCallback(controls, () => {
                if (!semanticEquivalent(source, verificationRequest.result)) {
                  controls.abort(
                    new Error(
                      'Workspace chat IndexedDB pending-send move verification failed',
                    ),
                  )
                  return
                }
                controls.complete(undefined)
              })
            return
          }

          const destination: PendingSendRecord = {
            ownerKey: destinationOwnerKey,
            payload: source.payload,
          }
          const putRequest = store.put(destination)
          putRequest.onerror = () =>
            controls.abort(
              requestFailure(
                putRequest,
                'Workspace chat IndexedDB pending-send destination write failed',
              ),
            )
          putRequest.onsuccess = () =>
            runTransactionCallback(controls, () => {
              const destinationRequest = store.get(destinationOwnerKey)
              destinationRequest.onerror = () =>
                controls.abort(
                  requestFailure(
                    destinationRequest,
                    'Workspace chat IndexedDB pending-send destination readback failed',
                  ),
                )
              destinationRequest.onsuccess = () =>
                runTransactionCallback(controls, () => {
                  if (
                    !semanticEquivalent(destinationRequest.result, destination)
                  ) {
                    controls.abort(
                      new Error(
                        'Workspace chat IndexedDB pending-send move verification failed',
                      ),
                    )
                    return
                  }

                  const deleteRequest = store.delete(sourceOwnerKey)
                  deleteRequest.onerror = () =>
                    controls.abort(
                      requestFailure(
                        deleteRequest,
                        'Workspace chat IndexedDB pending-send source deletion failed',
                      ),
                    )
                  deleteRequest.onsuccess = () =>
                    runTransactionCallback(controls, () => {
                      const sourceReadbackRequest = store.get(sourceOwnerKey)
                      sourceReadbackRequest.onerror = () =>
                        controls.abort(
                          requestFailure(
                            sourceReadbackRequest,
                            'Workspace chat IndexedDB pending-send source deletion readback failed',
                          ),
                        )
                      sourceReadbackRequest.onsuccess = () =>
                        runTransactionCallback(controls, () => {
                          if (sourceReadbackRequest.result !== undefined) {
                            controls.abort(
                              new Error(
                                'Workspace chat IndexedDB pending-send move verification failed',
                              ),
                            )
                            return
                          }
                          controls.complete(undefined)
                        })
                    })
                })
            })
        })
    },
  )
}

export async function deletePendingSend(ownerKey: string): Promise<void> {
  requireKey('ownerKey', ownerKey)
  await withTransaction(
    WORKSPACE_CHAT_STORE_NAMES.pendingSends,
    'readwrite',
    (transaction, controls) =>
      deleteAndVerify(
        transaction.objectStore(WORKSPACE_CHAT_STORE_NAMES.pendingSends),
        ownerKey,
        controls,
      ),
  )
}

function serializedByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function collectStoreHealth<TResult>(
  store: IDBObjectStore,
  controls: TransactionControls<TResult>,
  onComplete: (health: WorkspaceChatStoreHealth) => void,
): void {
  let recordCount = 0
  let serializedBytes = 0
  const request = store.openCursor()
  request.onerror = () =>
    controls.abort(
      requestFailure(request, 'Workspace chat health cursor failed'),
    )
  request.onsuccess = () =>
    runTransactionCallback(controls, () => {
      const cursor = request.result
      if (cursor === null) {
        onComplete({ recordCount, serializedBytes })
        return
      }
      recordCount += 1
      serializedBytes += serializedByteLength(cursor.value)
      cursor.continue()
    })
}

function emptyStoreHealth(): WorkspaceChatStorageHealth['stores'] {
  return {
    latestCardSnapshots: { recordCount: 0, serializedBytes: 0 },
    cardRecovery: { recordCount: 0, serializedBytes: 0 },
    durableJournal: { recordCount: 0, serializedBytes: 0 },
    pendingSends: { recordCount: 0, serializedBytes: 0 },
  }
}

async function browserStorageHealth(): Promise<
  Pick<WorkspaceChatStorageHealth, 'storageEstimate' | 'persistGranted'>
> {
  const storage =
    typeof navigator === 'undefined' ? undefined : navigator.storage
  let storageEstimate: WorkspaceChatStorageHealth['storageEstimate'] = null
  let persistGranted: boolean | null = null

  if (typeof storage?.estimate === 'function') {
    try {
      const estimate = await storage.estimate()
      storageEstimate = {
        usage: typeof estimate.usage === 'number' ? estimate.usage : null,
        quota: typeof estimate.quota === 'number' ? estimate.quota : null,
      }
    } catch {
      storageEstimate = null
    }
  }
  if (typeof storage?.persist === 'function') {
    try {
      persistGranted = await storage.persist()
    } catch {
      persistGranted = null
    }
  }
  return { storageEstimate, persistGranted }
}

export async function getWorkspaceChatStorageHealth(): Promise<WorkspaceChatStorageHealth> {
  const browserHealthPromise = browserStorageHealth()
  try {
    const stores = await withTransaction<WorkspaceChatStorageHealth['stores']>(
      Object.values(WORKSPACE_CHAT_STORE_NAMES),
      'readonly',
      (transaction, controls) => {
        const results: Partial<WorkspaceChatStorageHealth['stores']> = {}
        let completedStores = 0
        const recordResult = (
          storeName: keyof typeof WORKSPACE_CHAT_STORE_NAMES,
          health: WorkspaceChatStoreHealth,
        ): void => {
          results[storeName] = health
          completedStores += 1
          if (
            completedStores === Object.keys(WORKSPACE_CHAT_STORE_NAMES).length
          ) {
            controls.complete(results as WorkspaceChatStorageHealth['stores'])
          }
        }

        for (const storeName of Object.keys(
          WORKSPACE_CHAT_STORE_NAMES,
        ) as Array<keyof typeof WORKSPACE_CHAT_STORE_NAMES>) {
          collectStoreHealth(
            transaction.objectStore(WORKSPACE_CHAT_STORE_NAMES[storeName]),
            controls,
            (health) => recordResult(storeName, health),
          )
        }
      },
    )
    return {
      databaseAvailable: true,
      ...(await browserHealthPromise),
      stores,
    }
  } catch {
    return {
      databaseAvailable: false,
      ...(await browserHealthPromise),
      stores: emptyStoreHealth(),
    }
  }
}
