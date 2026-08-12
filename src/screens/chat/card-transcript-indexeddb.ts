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

export type WorkspaceChatV4RecordMetadata = {
  schema: 4
  revision: number
  writeId: string
  updatedAt: number
}

export type WorkspaceChatV4RecordCodecOptions = {
  maxSerializedBytes?: number
}

export const WORKSPACE_CHAT_DEFAULT_MAX_RECORD_BYTES = 1024 * 1024
export const WORKSPACE_CHAT_HARD_MAX_RECORD_BYTES = 16 * 1024 * 1024

export type V4LatestCardSnapshotRecord<
  TPayload extends PortableValue = PortableValue,
> = LatestCardSnapshotRecord<TPayload> & WorkspaceChatV4RecordMetadata

export type V4CardRecoveryRecord<
  TPayload extends PortableValue = PortableValue,
> = CardRecoveryRecord<TPayload> & WorkspaceChatV4RecordMetadata

export type V4DurableJournalRecord<
  TPayload extends PortableValue = PortableValue,
> = DurableJournalRecord<TPayload> &
  WorkspaceChatV4RecordMetadata & {
    ordinal: number
  }

export type V4PendingSendRecord<
  TPayload extends PortableValue = PortableValue,
> = PendingSendRecord<TPayload> & WorkspaceChatV4RecordMetadata

export type V4RecoveryMutation<TPayload extends PortableValue = PortableValue> =
  | {
      type: 'append' | 'merge' | 'replace'
      record: V4CardRecoveryRecord<TPayload>
    }
  | { type: 'delete' }

export type V4PendingMutation<TPayload extends PortableValue = PortableValue> =
  | { type: 'merge' | 'replace'; record: V4PendingSendRecord<TPayload> }
  | { type: 'delete' }

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

function hasExactV4Schema(database: IDBDatabase): Promise<boolean> {
  const expectedNames = Object.values(WORKSPACE_CHAT_STORE_NAMES).sort()
  const actualNames = Array.from(database.objectStoreNames).sort()
  if (
    expectedNames.length !== actualNames.length ||
    expectedNames.some((name, index) => name !== actualNames[index])
  ) {
    return Promise.resolve(false)
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
    const matches =
      keyPathMatches(latest.keyPath, 'cardId') &&
      keyPathMatches(recovery.keyPath, 'cardId') &&
      keyPathMatches(journal.keyPath, ['ownerKey', 'entryKey']) &&
      journal.indexNames.contains(JOURNAL_OWNER_INDEX) &&
      keyPathMatches(journal.index(JOURNAL_OWNER_INDEX).keyPath, 'ownerKey') &&
      keyPathMatches(pending.keyPath, 'ownerKey')

    // Opening a transaction solely to inspect key paths still leaves that
    // transaction active until its completion event. Do not hand the database
    // to callers before it settles: tests and production reset callers may
    // close the returned handle immediately, and a hidden validation
    // transaction would otherwise keep that handle alive and block deletion.
    return new Promise((resolve) => {
      let settled = false
      const finish = (result: boolean) => {
        if (settled) return
        settled = true
        resolve(result)
      }
      transaction.oncomplete = () => finish(matches)
      transaction.onerror = () => finish(false)
      transaction.onabort = () => finish(false)
    })
  } catch {
    return Promise.resolve(false)
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
      const database = request.result
      // Reset/version upgrades must never be held hostage by an in-flight
      // operation. Closing on versionchange marks this connection close-pending;
      // IndexedDB then lets its current transaction settle before deletion.
      database.onversionchange = () => database.close()
      if (settled) {
        database.close()
        return
      }
      void hasExactV4Schema(database).then((valid) => {
        if (settled) {
          database.close()
          return
        }
        settled = true
        if (!valid) {
          database.close()
          reject(new Error('Workspace chat database v4 schema is invalid'))
          return
        }
        resolve(database)
      })
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

function portableRecordError(path: string, reason: string): Error {
  return new Error(`Workspace chat v4 record is not portable at ${path}: ${reason}`)
}

function assertPortableValue(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
): void {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw portableRecordError(path, 'numbers must be finite')
    }
    return
  }
  if (typeof value !== 'object') {
    throw portableRecordError(path, `unsupported ${typeof value} value`)
  }
  if (ancestors.has(value)) {
    throw portableRecordError(path, 'cyclic values are unsupported')
  }
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      const ownKeys = Reflect.ownKeys(value)
      if (
        ownKeys.some((key) => {
          if (key === 'length') return false
          if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) {
            return true
          }
          const index = Number(key)
          return (
            !Number.isSafeInteger(index) ||
            index < 0 ||
            index >= value.length ||
            String(index) !== key
          )
        })
      ) {
        throw portableRecordError(path, 'arrays cannot have custom properties')
      }
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw portableRecordError(path, 'sparse arrays are unsupported')
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
        if (
          descriptor === undefined ||
          !descriptor.enumerable ||
          !('value' in descriptor)
        ) {
          throw portableRecordError(path, 'array entries must be plain values')
        }
        assertPortableValue(descriptor.value, `${path}[${index}]`, ancestors)
      }
      return
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw portableRecordError(path, 'objects must be plain objects')
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') {
        throw portableRecordError(path, 'symbol keys are unsupported')
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !('value' in descriptor)
      ) {
        throw portableRecordError(
          `${path}.${key}`,
          'properties must be enumerable plain values',
        )
      }
      assertPortableValue(descriptor.value, `${path}.${key}`, ancestors)
    }
  } finally {
    ancestors.delete(value)
  }
}

function requireOwnProperty(
  record: Record<string, unknown>,
  property: string,
): void {
  if (!Object.prototype.hasOwnProperty.call(record, property)) {
    throw new Error(`Workspace chat v4 record requires ${property}`)
  }
}

function maxSerializedRecordBytes(
  options?: WorkspaceChatV4RecordCodecOptions,
): number {
  const maximum =
    options?.maxSerializedBytes ?? WORKSPACE_CHAT_DEFAULT_MAX_RECORD_BYTES
  if (
    !Number.isSafeInteger(maximum) ||
    maximum <= 0 ||
    maximum > WORKSPACE_CHAT_HARD_MAX_RECORD_BYTES
  ) {
    throw new Error(
      `Workspace chat v4 record size limit must be between 1 and ${WORKSPACE_CHAT_HARD_MAX_RECORD_BYTES} bytes`,
    )
  }
  return maximum
}

/**
 * Validates and JSON-round-trips only new v4 records. This intentionally has no
 * legacy decoder: callers must supply explicit v4 metadata and portable values.
 */
export function encodeWorkspaceChatV4Record<TRecord>(
  record: TRecord,
  options?: WorkspaceChatV4RecordCodecOptions,
): TRecord {
  assertPortableValue(record, '$', new WeakSet())
  if (record === null || Array.isArray(record) || typeof record !== 'object') {
    throw new Error('Workspace chat v4 record must be a plain object')
  }
  const candidate = record as Record<string, unknown>
  for (const property of [
    'schema',
    'revision',
    'writeId',
    'updatedAt',
    'payload',
  ]) {
    requireOwnProperty(candidate, property)
  }
  if (candidate.schema !== WORKSPACE_CHAT_DATABASE_VERSION) {
    throw new Error('Workspace chat v4 record schema must be 4')
  }
  if (
    !Number.isSafeInteger(candidate.revision) ||
    (candidate.revision as number) < 0
  ) {
    throw new Error(
      'Workspace chat v4 record revision must be a non-negative safe integer',
    )
  }
  requireKey('writeId', candidate.writeId as string)
  if (
    !Number.isSafeInteger(candidate.updatedAt) ||
    (candidate.updatedAt as number) < 0
  ) {
    throw new Error(
      'Workspace chat v4 record updatedAt must be a non-negative safe integer',
    )
  }

  const serialized = JSON.stringify(record)
  const serializedBytes = new TextEncoder().encode(serialized).byteLength
  const maximum = maxSerializedRecordBytes(options)
  if (serializedBytes > maximum) {
    throw new Error(
      `Workspace chat v4 record size ${serializedBytes} bytes exceeds limit ${maximum} bytes`,
    )
  }
  return JSON.parse(serialized) as TRecord
}

function requireExpectedWriteId(value: string | null): void {
  if (value !== null) requireKey('expectedWriteId', value)
}

function prepareLatestSnapshotRecord<TPayload extends PortableValue>(
  record: V4LatestCardSnapshotRecord<TPayload>,
  options?: WorkspaceChatV4RecordCodecOptions,
): V4LatestCardSnapshotRecord<TPayload> {
  const encoded = encodeWorkspaceChatV4Record(record, options)
  requireKey('cardId', encoded.cardId)
  return encoded
}

function prepareRecoveryRecord<TPayload extends PortableValue>(
  record: V4CardRecoveryRecord<TPayload>,
  cardId: string,
  options?: WorkspaceChatV4RecordCodecOptions,
): V4CardRecoveryRecord<TPayload> {
  const encoded = encodeWorkspaceChatV4Record(record, options)
  requireKey('cardId', encoded.cardId)
  if (encoded.cardId !== cardId) {
    throw new Error('Card recovery record cardId does not match mutation cardId')
  }
  return encoded
}

function encodePendingRecord<TPayload extends PortableValue>(
  record: V4PendingSendRecord<TPayload>,
  options?: WorkspaceChatV4RecordCodecOptions,
): V4PendingSendRecord<TPayload> {
  const encoded = encodeWorkspaceChatV4Record(record, options)
  requireKey('ownerKey', encoded.ownerKey)
  return encoded
}

function preparePendingRecord<TPayload extends PortableValue>(
  record: V4PendingSendRecord<TPayload>,
  ownerKey: string,
  options?: WorkspaceChatV4RecordCodecOptions,
): V4PendingSendRecord<TPayload> {
  const encoded = encodePendingRecord(record, options)
  if (encoded.ownerKey !== ownerKey) {
    throw new Error('Pending-send record ownerKey does not match destination')
  }
  return encoded
}

function prepareJournalRecord<TPayload extends PortableValue>(
  record: V4DurableJournalRecord<TPayload>,
  ownerKey: string,
  options?: WorkspaceChatV4RecordCodecOptions,
): V4DurableJournalRecord<TPayload> {
  const encoded = encodeWorkspaceChatV4Record(record, options)
  requireKey('ownerKey', encoded.ownerKey)
  requireKey('entryKey', encoded.entryKey)
  if (encoded.ownerKey !== ownerKey) {
    throw new Error('Journal record ownerKey does not match delta ownerKey')
  }
  if (!Number.isSafeInteger(encoded.ordinal) || encoded.ordinal < 0) {
    throw new Error('Journal ordinal must be a non-negative safe integer')
  }
  return encoded
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

function queueVerifiedPut<TResult>(
  store: IDBObjectStore,
  record: unknown,
  key: IDBValidKey,
  controls: TransactionControls<TResult>,
  onVerified: () => void,
): void {
  const putRequest = store.put(record)
  putRequest.onerror = () =>
    controls.abort(
      requestFailure(putRequest, 'Workspace chat IndexedDB atomic write failed'),
    )
  putRequest.onsuccess = () =>
    runTransactionCallback(controls, () => {
      const readRequest = store.get(key)
      readRequest.onerror = () =>
        controls.abort(
          requestFailure(
            readRequest,
            'Workspace chat IndexedDB atomic write readback failed',
          ),
        )
      readRequest.onsuccess = () =>
        runTransactionCallback(controls, () => {
          if (!semanticEquivalent(readRequest.result, record)) {
            controls.abort(
              new Error(
                'Workspace chat IndexedDB atomic write verification failed',
              ),
            )
            return
          }
          onVerified()
        })
    })
}

function queueVerifiedDelete<TResult>(
  store: IDBObjectStore,
  key: IDBValidKey,
  controls: TransactionControls<TResult>,
  onVerified: () => void,
): void {
  const deleteRequest = store.delete(key)
  deleteRequest.onerror = () =>
    controls.abort(
      requestFailure(
        deleteRequest,
        'Workspace chat IndexedDB atomic deletion failed',
      ),
    )
  deleteRequest.onsuccess = () =>
    runTransactionCallback(controls, () => {
      const readRequest = store.get(key)
      readRequest.onerror = () =>
        controls.abort(
          requestFailure(
            readRequest,
            'Workspace chat IndexedDB atomic deletion readback failed',
          ),
        )
      readRequest.onsuccess = () =>
        runTransactionCallback(controls, () => {
          if (readRequest.result !== undefined) {
            controls.abort(
              new Error(
                'Workspace chat IndexedDB atomic deletion verification failed',
              ),
            )
            return
          }
          onVerified()
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

function decodeStoredRecoveryRecord(
  value: unknown,
  cardId: string,
  options?: WorkspaceChatV4RecordCodecOptions,
): V4CardRecoveryRecord {
  const record = encodeWorkspaceChatV4Record(
    value,
    options,
  ) as V4CardRecoveryRecord
  requireKey('stored recovery cardId', record.cardId)
  if (record.cardId !== cardId) {
    throw new Error('Stored Card recovery record has the wrong cardId')
  }
  return record
}

function decodeStoredPendingRecord(
  value: unknown,
  ownerKey: string,
  options?: WorkspaceChatV4RecordCodecOptions,
): V4PendingSendRecord {
  const record = encodeWorkspaceChatV4Record(
    value,
    options,
  ) as V4PendingSendRecord
  requireKey('stored pending ownerKey', record.ownerKey)
  if (record.ownerKey !== ownerKey) {
    throw new Error('Stored pending-send record has the wrong ownerKey')
  }
  return record
}

function decodeStoredJournalRecord(
  value: unknown,
  ownerKey: string,
  options?: WorkspaceChatV4RecordCodecOptions,
): V4DurableJournalRecord {
  const record = encodeWorkspaceChatV4Record(
    value,
    options,
  ) as V4DurableJournalRecord
  requireKey('stored journal ownerKey', record.ownerKey)
  requireKey('stored journal entryKey', record.entryKey)
  if (record.ownerKey !== ownerKey) {
    throw new Error('Stored journal record has the wrong ownerKey')
  }
  if (!Number.isSafeInteger(record.ordinal) || record.ordinal < 0) {
    throw new Error('Stored journal ordinal is invalid')
  }
  return record
}

function requireCompareAndSwap(
  current: WorkspaceChatV4RecordMetadata | undefined,
  expectedWriteId: string | null,
  label: string,
): void {
  if (
    (current === undefined && expectedWriteId !== null) ||
    (current !== undefined && current.writeId !== expectedWriteId)
  ) {
    throw new Error(`${label} compare-and-swap failed for expected writeId`)
  }
}

export async function mutateCardRecoveryAtomically<
  TPayload extends PortableValue = PortableValue,
>(
  input: {
    cardId: string
    expectedWriteId: string | null
    mutation: V4RecoveryMutation<TPayload>
  },
  options?: WorkspaceChatV4RecordCodecOptions,
): Promise<void> {
  requireKey('cardId', input.cardId)
  requireExpectedWriteId(input.expectedWriteId)
  const replacement =
    input.mutation.type === 'delete'
      ? null
      : prepareRecoveryRecord(input.mutation.record, input.cardId, options)

  await withTransaction(
    WORKSPACE_CHAT_STORE_NAMES.cardRecovery,
    'readwrite',
    (transaction, controls) => {
      const store = transaction.objectStore(
        WORKSPACE_CHAT_STORE_NAMES.cardRecovery,
      )
      const readRequest = store.get(input.cardId)
      readRequest.onerror = () =>
        controls.abort(
          requestFailure(readRequest, 'Card recovery CAS read failed'),
        )
      readRequest.onsuccess = () =>
        runTransactionCallback(controls, () => {
          const current =
            readRequest.result === undefined
              ? undefined
              : decodeStoredRecoveryRecord(
                  readRequest.result,
                  input.cardId,
                  options,
                )
          requireCompareAndSwap(
            current,
            input.expectedWriteId,
            'Card recovery',
          )
          if (replacement === null) {
            queueVerifiedDelete(store, input.cardId, controls, () =>
              controls.complete(undefined),
            )
          } else {
            queueVerifiedPut(store, replacement, input.cardId, controls, () =>
              controls.complete(undefined),
            )
          }
        })
    },
  )
}

export async function writeSnapshotAndAcknowledgeRecoveryAtomically<
  TSnapshotPayload extends PortableValue = PortableValue,
  TRecoveryPayload extends PortableValue = PortableValue,
>(
  input: {
    snapshot: V4LatestCardSnapshotRecord<TSnapshotPayload>
    expectedRecoveryWriteId: string | null
    recoveryMutation: V4RecoveryMutation<TRecoveryPayload>
  },
  options?: WorkspaceChatV4RecordCodecOptions,
): Promise<void> {
  const snapshot = prepareLatestSnapshotRecord(input.snapshot, options)
  requireExpectedWriteId(input.expectedRecoveryWriteId)
  const recoveryReplacement =
    input.recoveryMutation.type === 'delete'
      ? null
      : prepareRecoveryRecord(
          input.recoveryMutation.record,
          snapshot.cardId,
          options,
        )

  await withTransaction(
    [
      WORKSPACE_CHAT_STORE_NAMES.latestCardSnapshots,
      WORKSPACE_CHAT_STORE_NAMES.cardRecovery,
    ],
    'readwrite',
    (transaction, controls) => {
      const snapshotStore = transaction.objectStore(
        WORKSPACE_CHAT_STORE_NAMES.latestCardSnapshots,
      )
      const recoveryStore = transaction.objectStore(
        WORKSPACE_CHAT_STORE_NAMES.cardRecovery,
      )
      const recoveryRead = recoveryStore.get(snapshot.cardId)
      recoveryRead.onerror = () =>
        controls.abort(
          requestFailure(
            recoveryRead,
            'Snapshot acknowledgement recovery CAS read failed',
          ),
        )
      recoveryRead.onsuccess = () =>
        runTransactionCallback(controls, () => {
          const currentRecovery =
            recoveryRead.result === undefined
              ? undefined
              : decodeStoredRecoveryRecord(
                  recoveryRead.result,
                  snapshot.cardId,
                  options,
                )
          requireCompareAndSwap(
            currentRecovery,
            input.expectedRecoveryWriteId,
            'Snapshot acknowledgement recovery',
          )
          queueVerifiedPut(
            snapshotStore,
            snapshot,
            snapshot.cardId,
            controls,
            () => {
              if (recoveryReplacement === null) {
                queueVerifiedDelete(
                  recoveryStore,
                  snapshot.cardId,
                  controls,
                  () => controls.complete(undefined),
                )
              } else {
                queueVerifiedPut(
                  recoveryStore,
                  recoveryReplacement,
                  snapshot.cardId,
                  controls,
                  () => controls.complete(undefined),
                )
              }
            },
          )
        })
    },
  )
}

export async function mutatePendingSendAtomically<
  TPayload extends PortableValue = PortableValue,
>(
  input: {
    ownerKey: string
    expectedWriteId: string | null
    mutation: V4PendingMutation<TPayload>
  },
  options?: WorkspaceChatV4RecordCodecOptions,
): Promise<void> {
  requireKey('ownerKey', input.ownerKey)
  requireExpectedWriteId(input.expectedWriteId)
  const replacement =
    input.mutation.type === 'delete'
      ? null
      : preparePendingRecord(input.mutation.record, input.ownerKey, options)

  await withTransaction(
    WORKSPACE_CHAT_STORE_NAMES.pendingSends,
    'readwrite',
    (transaction, controls) => {
      const store = transaction.objectStore(
        WORKSPACE_CHAT_STORE_NAMES.pendingSends,
      )
      const readRequest = store.get(input.ownerKey)
      readRequest.onerror = () =>
        controls.abort(requestFailure(readRequest, 'Pending-send CAS read failed'))
      readRequest.onsuccess = () =>
        runTransactionCallback(controls, () => {
          const current =
            readRequest.result === undefined
              ? undefined
              : decodeStoredPendingRecord(
                  readRequest.result,
                  input.ownerKey,
                  options,
                )
          requireCompareAndSwap(current, input.expectedWriteId, 'Pending send')
          if (replacement === null) {
            queueVerifiedDelete(store, input.ownerKey, controls, () =>
              controls.complete(undefined),
            )
          } else {
            queueVerifiedPut(store, replacement, input.ownerKey, controls, () =>
              controls.complete(undefined),
            )
          }
        })
    },
  )
}

export async function handoffPendingSendAtomically<
  TPayload extends PortableValue = PortableValue,
>(
  input: {
    sourceOwnerKey: string
    expectedSourceWriteId: string
    destination: V4PendingSendRecord<TPayload>
    existingDestinationMerge?: {
      expectedWriteId: string
      record: V4PendingSendRecord<TPayload>
    }
  },
  options?: WorkspaceChatV4RecordCodecOptions,
): Promise<void> {
  requireKey('sourceOwnerKey', input.sourceOwnerKey)
  requireKey('expectedSourceWriteId', input.expectedSourceWriteId)
  const destination = encodePendingRecord(input.destination, options)
  const destinationOwnerKey = destination.ownerKey
  if (destinationOwnerKey === input.sourceOwnerKey) {
    throw new Error('Pending-send handoff destination must differ from source')
  }
  const merge = input.existingDestinationMerge
  if (merge !== undefined) requireKey('merge expectedWriteId', merge.expectedWriteId)
  const mergedDestination =
    merge === undefined
      ? undefined
      : preparePendingRecord(merge.record, destinationOwnerKey, options)

  await withTransaction(
    WORKSPACE_CHAT_STORE_NAMES.pendingSends,
    'readwrite',
    (transaction, controls) => {
      const store = transaction.objectStore(
        WORKSPACE_CHAT_STORE_NAMES.pendingSends,
      )
      const sourceRead = store.get(input.sourceOwnerKey)
      sourceRead.onerror = () =>
        controls.abort(
          requestFailure(sourceRead, 'Pending-send handoff source read failed'),
        )
      sourceRead.onsuccess = () =>
        runTransactionCallback(controls, () => {
          const source =
            sourceRead.result === undefined
              ? undefined
              : decodeStoredPendingRecord(
                  sourceRead.result,
                  input.sourceOwnerKey,
                  options,
                )
          requireCompareAndSwap(
            source,
            input.expectedSourceWriteId,
            'Pending-send handoff source',
          )

          const destinationRead = store.get(destinationOwnerKey)
          destinationRead.onerror = () =>
            controls.abort(
              requestFailure(
                destinationRead,
                'Pending-send handoff destination read failed',
              ),
            )
          destinationRead.onsuccess = () =>
            runTransactionCallback(controls, () => {
              let output = destination
              if (destinationRead.result === undefined) {
                if (merge !== undefined) {
                  controls.abort(
                    new Error(
                      'Pending-send handoff merge output supplied for a missing destination',
                    ),
                  )
                  return
                }
              } else {
                const currentDestination = decodeStoredPendingRecord(
                  destinationRead.result,
                  destinationOwnerKey,
                  options,
                )
                if (merge === undefined || mergedDestination === undefined) {
                  controls.abort(
                    new Error(
                      'Pending-send handoff requires explicit destination merge output',
                    ),
                  )
                  return
                }
                requireCompareAndSwap(
                  currentDestination,
                  merge.expectedWriteId,
                  'Pending-send handoff destination',
                )
                output = mergedDestination
              }

              queueVerifiedPut(
                store,
                output,
                destinationOwnerKey,
                controls,
                () =>
                  queueVerifiedDelete(
                    store,
                    input.sourceOwnerKey,
                    controls,
                    () => controls.complete(undefined),
                  ),
              )
            })
        })
    },
  )
}

export async function handoffPendingSendToCardRecoveryAtomically<
  TPayload extends PortableValue = PortableValue,
>(
  input: {
    sourceOwnerKey: string
    expectedPendingWriteId: string
    recoveryCardId: string
    expectedRecoveryWriteId: string | null
    recoveryMutation: Exclude<V4RecoveryMutation<TPayload>, { type: 'delete' }>
  },
  options?: WorkspaceChatV4RecordCodecOptions,
): Promise<void> {
  requireKey('sourceOwnerKey', input.sourceOwnerKey)
  requireKey('expectedPendingWriteId', input.expectedPendingWriteId)
  requireKey('recoveryCardId', input.recoveryCardId)
  requireExpectedWriteId(input.expectedRecoveryWriteId)
  const recoveryDestination = prepareRecoveryRecord(
    input.recoveryMutation.record,
    input.recoveryCardId,
    options,
  )

  await withTransaction(
    [
      WORKSPACE_CHAT_STORE_NAMES.pendingSends,
      WORKSPACE_CHAT_STORE_NAMES.cardRecovery,
    ],
    'readwrite',
    (transaction, controls) => {
      const pendingStore = transaction.objectStore(
        WORKSPACE_CHAT_STORE_NAMES.pendingSends,
      )
      const recoveryStore = transaction.objectStore(
        WORKSPACE_CHAT_STORE_NAMES.cardRecovery,
      )
      const pendingRead = pendingStore.get(input.sourceOwnerKey)
      pendingRead.onerror = () =>
        controls.abort(
          requestFailure(
            pendingRead,
            'Pending-to-recovery source read failed',
          ),
        )
      pendingRead.onsuccess = () =>
        runTransactionCallback(controls, () => {
          const pending =
            pendingRead.result === undefined
              ? undefined
              : decodeStoredPendingRecord(
                  pendingRead.result,
                  input.sourceOwnerKey,
                  options,
                )
          requireCompareAndSwap(
            pending,
            input.expectedPendingWriteId,
            'Pending-to-recovery source',
          )

          const recoveryRead = recoveryStore.get(input.recoveryCardId)
          recoveryRead.onerror = () =>
            controls.abort(
              requestFailure(
                recoveryRead,
                'Pending-to-recovery destination CAS read failed',
              ),
            )
          recoveryRead.onsuccess = () =>
            runTransactionCallback(controls, () => {
              const currentRecovery =
                recoveryRead.result === undefined
                  ? undefined
                  : decodeStoredRecoveryRecord(
                      recoveryRead.result,
                      input.recoveryCardId,
                      options,
                    )
              requireCompareAndSwap(
                currentRecovery,
                input.expectedRecoveryWriteId,
                'Pending-to-recovery destination',
              )
              queueVerifiedPut(
                recoveryStore,
                recoveryDestination,
                input.recoveryCardId,
                controls,
                () =>
                  queueVerifiedDelete(
                    pendingStore,
                    input.sourceOwnerKey,
                    controls,
                    () => controls.complete(undefined),
                  ),
              )
            })
        })
    },
  )
}

function sortJournalRecords(
  records: Array<V4DurableJournalRecord>,
): Array<V4DurableJournalRecord> {
  return records.sort(
    (left, right) =>
      left.ordinal - right.ordinal || left.entryKey.localeCompare(right.entryKey),
  )
}

function requireUniqueJournalOrdinals(
  records: Array<V4DurableJournalRecord>,
): void {
  const ordinals = new Set<number>()
  for (const record of records) {
    if (ordinals.has(record.ordinal)) {
      throw new Error('Journal owner post-state has duplicate ordinals')
    }
    ordinals.add(record.ordinal)
  }
}

export async function applyDurableJournalDeltaAtomically<
  TPayload extends PortableValue = PortableValue,
>(
  input: {
    ownerKey: string
    upserts: Array<V4DurableJournalRecord<TPayload>>
    removals: Array<string>
  },
  options?: WorkspaceChatV4RecordCodecOptions,
): Promise<Array<V4DurableJournalRecord<TPayload>>> {
  requireKey('ownerKey', input.ownerKey)
  const upserts = input.upserts.map((record) =>
    prepareJournalRecord(record, input.ownerKey, options),
  )
  const upsertKeys = new Set<string>()
  for (const record of upserts) {
    if (upsertKeys.has(record.entryKey)) {
      throw new Error('Journal delta has duplicate upsert entryKey values')
    }
    upsertKeys.add(record.entryKey)
  }
  const removalKeys = new Set<string>()
  for (const entryKey of input.removals) {
    requireKey('journal removal entryKey', entryKey)
    if (removalKeys.has(entryKey)) {
      throw new Error('Journal delta has duplicate removal entryKey values')
    }
    if (upsertKeys.has(entryKey)) {
      throw new Error('Journal delta cannot upsert and remove the same entryKey')
    }
    removalKeys.add(entryKey)
  }

  return withTransaction(
    WORKSPACE_CHAT_STORE_NAMES.durableJournal,
    'readwrite',
    (transaction, controls) => {
      const store = transaction.objectStore(
        WORKSPACE_CHAT_STORE_NAMES.durableJournal,
      )
      const initialRead = store.index(JOURNAL_OWNER_INDEX).getAll(input.ownerKey)
      initialRead.onerror = () =>
        controls.abort(
          requestFailure(initialRead, 'Journal delta initial read failed'),
        )
      initialRead.onsuccess = () =>
        runTransactionCallback(controls, () => {
          const expectedByKey = new Map<string, V4DurableJournalRecord>()
          for (const value of initialRead.result as Array<unknown>) {
            const record = decodeStoredJournalRecord(
              value,
              input.ownerKey,
              options,
            )
            expectedByKey.set(record.entryKey, record)
          }
          for (const entryKey of removalKeys) expectedByKey.delete(entryKey)
          for (const record of upserts) expectedByKey.set(record.entryKey, record)
          const expected = sortJournalRecords([...expectedByKey.values()])
          requireUniqueJournalOrdinals(expected)

          const verifyExactPostState = (): void => {
            const readback = store
              .index(JOURNAL_OWNER_INDEX)
              .getAll(input.ownerKey)
            readback.onerror = () =>
              controls.abort(
                requestFailure(readback, 'Journal delta readback failed'),
              )
            readback.onsuccess = () =>
              runTransactionCallback(controls, () => {
                const actual = sortJournalRecords(
                  (readback.result as Array<unknown>).map((value) =>
                    decodeStoredJournalRecord(value, input.ownerKey, options),
                  ),
                )
                requireUniqueJournalOrdinals(actual)
                if (!semanticEquivalent(actual, expected)) {
                  controls.abort(
                    new Error('Journal delta exact post-state verification failed'),
                  )
                  return
                }
                controls.complete(
                  actual as Array<V4DurableJournalRecord<TPayload>>,
                )
              })
          }

          const requestCount = removalKeys.size + upserts.length
          if (requestCount === 0) {
            verifyExactPostState()
            return
          }
          let completedRequests = 0
          const requestCompleted = (): void => {
            completedRequests += 1
            if (completedRequests === requestCount) verifyExactPostState()
          }
          for (const entryKey of removalKeys) {
            const request = store.delete([input.ownerKey, entryKey])
            request.onerror = () =>
              controls.abort(
                requestFailure(request, 'Journal delta removal failed'),
              )
            request.onsuccess = () =>
              runTransactionCallback(controls, requestCompleted)
          }
          for (const record of upserts) {
            const request = store.put(record)
            request.onerror = () =>
              controls.abort(requestFailure(request, 'Journal delta upsert failed'))
            request.onsuccess = () =>
              runTransactionCallback(controls, requestCompleted)
          }
        })
    },
  )
}

export async function readOrderedDurableJournal<
  TPayload extends PortableValue = PortableValue,
>(
  ownerKey: string,
  options?: WorkspaceChatV4RecordCodecOptions,
): Promise<Array<V4DurableJournalRecord<TPayload>>> {
  requireKey('ownerKey', ownerKey)
  return withTransaction(
    WORKSPACE_CHAT_STORE_NAMES.durableJournal,
    'readonly',
    (transaction, controls) => {
      const request = transaction
        .objectStore(WORKSPACE_CHAT_STORE_NAMES.durableJournal)
        .index(JOURNAL_OWNER_INDEX)
        .getAll(ownerKey)
      request.onerror = () =>
        controls.abort(
          requestFailure(request, 'Ordered journal read failed'),
        )
      request.onsuccess = () =>
        runTransactionCallback(controls, () => {
          const records = sortJournalRecords(
            (request.result as Array<unknown>).map((value) =>
              decodeStoredJournalRecord(value, ownerKey, options),
            ),
          )
          requireUniqueJournalOrdinals(records)
          controls.complete(
            records as Array<V4DurableJournalRecord<TPayload>>,
          )
        })
    },
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
