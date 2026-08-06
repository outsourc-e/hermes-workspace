export type MessageJournalWriteResult = {
  anyVerified: boolean
  persistentVerified: boolean
}

type JournalRecord<T> = {
  version: 2
  revision: number
  commitId: string
  state: 'prepared' | 'committed'
  value: T
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function journalPrefix(baseKey: string): string {
  if (baseKey.startsWith('workspace.operations-card-')) {
    return `workspace.durable-message-journal.v1:${encodeURIComponent(baseKey)}:entry:`
  }
  return `${baseKey}:entry:`
}

function journalKey(baseKey: string, identity: string): string {
  return `${journalPrefix(baseKey)}${encodeURIComponent(identity)}`
}

function parseRecord<T>(raw: string): JournalRecord<T> | null {
  try {
    const parsed = JSON.parse(raw) as Partial<JournalRecord<T>>
    if (
      parsed.version !== 2 ||
      !positiveSafeInteger(parsed.revision) ||
      typeof parsed.commitId !== 'string' ||
      !parsed.commitId ||
      (parsed.state !== 'prepared' && parsed.state !== 'committed') ||
      parsed.value === undefined
    ) {
      return null
    }
    return parsed as JournalRecord<T>
  } catch {
    return null
  }
}

function commitId(): string {
  const random = Math.random().toString(36).slice(2)
  return `${random || 'commit'}-${Date.now().toString(36)}`
}

export function isPersistentBrowserStorage(storage: Storage): boolean {
  if (typeof window === 'undefined') return false
  try {
    return storage === window.localStorage
  } catch {
    return false
  }
}

export function readMessageJournal<T>(
  baseKey: string,
  storages: Array<Storage>,
  identityOf: (value: T) => string,
  validate: (value: unknown) => T | null,
): Array<T> {
  const newest = new Map<string, JournalRecord<T>>()
  const prefix = journalPrefix(baseKey)
  for (const storage of storages) {
    let keys: Array<string> = []
    try {
      keys = Array.from({ length: storage.length }, (_, index) =>
        storage.key(index),
      ).filter((key): key is string => Boolean(key?.startsWith(prefix)))
    } catch {
      continue
    }
    for (const key of keys) {
      try {
        const raw = storage.getItem(key)
        const parsed = raw ? parseRecord<unknown>(raw) : null
        const value =
          parsed?.state === 'committed' ? validate(parsed.value) : null
        if (!parsed || parsed.state !== 'committed' || !value) {
          storage.removeItem(key)
          continue
        }
        const identity = identityOf(value)
        if (!identity || key !== journalKey(baseKey, identity)) {
          storage.removeItem(key)
          continue
        }
        const candidate: JournalRecord<T> = { ...parsed, value }
        const current = newest.get(identity)
        if (
          !current ||
          candidate.revision > current.revision ||
          (candidate.revision === current.revision &&
            candidate.commitId > current.commitId)
        ) {
          newest.set(identity, candidate)
        }
      } catch {
        // One denied mirror cannot hide valid records in another mirror.
      }
    }
  }
  return [...newest.values()].map((entry) => entry.value)
}

export function writeMessageJournal<T>(
  baseKey: string,
  values: Array<T>,
  storages: Array<Storage>,
  identityOf: (value: T) => string,
): MessageJournalWriteResult {
  if (values.length === 0) {
    return { anyVerified: false, persistentVerified: false }
  }
  let anyVerified = false
  let persistentVerified = true
  for (const value of values) {
    const identity = identityOf(value)
    if (!identity) return { anyVerified: false, persistentVerified: false }
    const key = journalKey(baseKey, identity)
    let newestRevision = 0
    for (const storage of storages) {
      try {
        const current = parseRecord<T>(storage.getItem(key) ?? '')
        if (current && current.revision > newestRevision) {
          newestRevision = current.revision
        }
      } catch {
        // A denied mirror is handled by the verified write result below.
      }
    }
    const revision = newestRevision + 1
    if (!positiveSafeInteger(revision)) {
      return { anyVerified: false, persistentVerified: false }
    }
    const record = {
      version: 2,
      revision,
      commitId: commitId(),
      value,
    } as const
    const prepared = JSON.stringify({
      ...record,
      state: 'prepared',
    } satisfies JournalRecord<T>)
    const committed = JSON.stringify({
      ...record,
      state: 'committed',
    } satisfies JournalRecord<T>)
    let valueVerified = false
    let valuePersistent = false
    for (const storage of storages) {
      try {
        // A prepared row is never recovery authority. Only promote it after an
        // exact readback proves this mirror accepted the candidate bytes.
        storage.setItem(key, prepared)
        if (storage.getItem(key) !== prepared) continue
        storage.setItem(key, committed)
        valueVerified = true
        if (isPersistentBrowserStorage(storage)) valuePersistent = true
      } catch {
        // A setItem that landed before readback failed leaves only a prepared
        // row, which future readers reject instead of resurrecting the send.
      }
    }
    if (!valueVerified) return { anyVerified: false, persistentVerified: false }
    anyVerified = true
    persistentVerified = persistentVerified && valuePersistent
  }
  return { anyVerified, persistentVerified }
}

export function removeMessageJournalValues<T>(
  baseKey: string,
  values: Array<T>,
  storages: Array<Storage>,
  identityOf: (value: T) => string,
): void {
  for (const value of values) {
    const identity = identityOf(value)
    if (!identity) continue
    const key = journalKey(baseKey, identity)
    for (const storage of storages) {
      try {
        storage.removeItem(key)
      } catch {
        // A denied mirror cannot authorize broader cleanup.
      }
    }
  }
}

export function clearMessageJournal(
  baseKey: string,
  storages: Array<Storage>,
): void {
  const prefix = journalPrefix(baseKey)
  for (const storage of storages) {
    try {
      const keys = Array.from({ length: storage.length }, (_, index) =>
        storage.key(index),
      ).filter((key): key is string => Boolean(key?.startsWith(prefix)))
      for (const key of keys) storage.removeItem(key)
    } catch {
      // Cleanup is best effort; unreadable mirrors cannot authorize deletion.
    }
  }
}
