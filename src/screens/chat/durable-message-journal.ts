import {
  applyDurableJournalDeltaAtomically,
  readOrderedDurableJournal,
} from './card-transcript-indexeddb'
import type {
  PortableValue,
  V4DurableJournalRecord,
} from './card-transcript-indexeddb'

function requireIdentity(identity: string): void {
  if (!identity) throw new Error('Durable message journal identity is required')
}

function createWriteId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }
  return `journal-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Reads only verified IndexedDB v4 journal rows. Invalid domain payloads fail
 * closed instead of becoming recovery authority.
 */
export async function readMessageJournal<T>(
  ownerKey: string,
  validate: (value: unknown) => T | null,
): Promise<Array<T>> {
  const records = await readOrderedDurableJournal(ownerKey)
  return records.map((record) => {
    const value = validate(record.payload)
    if (value === null) {
      throw new Error('Durable message journal contains an invalid v4 payload')
    }
    return value
  })
}

/**
 * Upserts a complete set of message checkpoints through the generic v4 journal
 * transaction. Existing identities retain their ordinal; new identities append
 * after the current durable order. Transaction completion is the only success
 * authority.
 */
export async function writeMessageJournal<T>(
  ownerKey: string,
  values: Array<T>,
  identityOf: (value: T) => string,
): Promise<void> {
  if (values.length === 0) return
  const current = await readOrderedDurableJournal(ownerKey)
  const currentByKey = new Map(
    current.map((record) => [record.entryKey, record]),
  )
  let nextOrdinal = current.reduce(
    (highest, record) => Math.max(highest, record.ordinal + 1),
    0,
  )
  const identities = new Set<string>()
  const updatedAt = Date.now()
  const upserts: Array<V4DurableJournalRecord<PortableValue>> = values.map(
    (value) => {
      const entryKey = identityOf(value)
      requireIdentity(entryKey)
      if (identities.has(entryKey)) {
        throw new Error('Durable message journal identities must be unique')
      }
      identities.add(entryKey)
      const existing = currentByKey.get(entryKey)
      const ordinal = existing?.ordinal ?? nextOrdinal++
      const revision = (existing?.revision ?? 0) + 1
      if (!Number.isSafeInteger(revision)) {
        throw new Error('Durable message journal revision overflow')
      }
      return {
        ownerKey,
        entryKey,
        schema: 4,
        revision,
        writeId: createWriteId(),
        updatedAt,
        ordinal,
        payload: value as PortableValue,
      }
    },
  )

  await applyDurableJournalDeltaAtomically({
    ownerKey,
    upserts,
    removals: [],
  })
}

export async function removeMessageJournalValues<T>(
  ownerKey: string,
  values: Array<T>,
  identityOf: (value: T) => string,
): Promise<void> {
  const removals = values.map((value) => {
    const identity = identityOf(value)
    requireIdentity(identity)
    return identity
  })
  if (new Set(removals).size !== removals.length) {
    throw new Error('Durable message journal removals must be unique')
  }
  await applyDurableJournalDeltaAtomically({
    ownerKey,
    upserts: [],
    removals,
  })
}

export async function clearMessageJournal(ownerKey: string): Promise<void> {
  const current = await readOrderedDurableJournal(ownerKey)
  await applyDurableJournalDeltaAtomically({
    ownerKey,
    upserts: [],
    removals: current.map((record) => record.entryKey),
  })
}
