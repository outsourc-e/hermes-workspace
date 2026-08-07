// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  readMessageJournal,
  writeMessageJournal,
} from './durable-message-journal'

describe('durable message journal commit protocol', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('rejects a promotion that cannot be read back as the exact committed bytes', () => {
    const baseKey = 'journal-commit-readback'
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      const parsed = JSON.parse(value) as { state?: string }
      if (
        this === window.localStorage &&
        key.startsWith(`${baseKey}:entry:`) &&
        parsed.state === 'committed'
      ) {
        // Simulate a storage implementation that reports success while retaining
        // the prepared bytes instead of the requested commit promotion.
        return
      }
      return originalSetItem.call(this, key, value)
    })

    expect(
      writeMessageJournal(
        baseKey,
        [{ id: 'candidate', text: 'must remain uncommitted' }],
        [window.localStorage],
        (value) => value.id,
      ),
    ).toEqual({ anyVerified: false, persistentVerified: false })

    vi.mocked(Storage.prototype.setItem).mockRestore()
    expect(
      readMessageJournal<{ id: string; text: string }>(
        baseKey,
        [window.localStorage],
        (value) => value.id,
        (value) =>
          typeof value === 'object' &&
          value !== null &&
          'id' in value &&
          'text' in value &&
          typeof value.id === 'string' &&
          typeof value.text === 'string'
            ? { id: value.id, text: value.text }
            : null,
      ),
    ).toEqual([])
    expect(
      Array.from(
        { length: window.localStorage.length },
        (_, index) => window.localStorage.key(index) ?? '',
      ).filter((key) => key.startsWith(`${baseKey}:entry:`)),
    ).toEqual([])
  })

  it('restores the previous committed checkpoint when a replacement promotion fails', () => {
    const baseKey = 'journal-checkpoint-preservation'
    const acceptedUser = { id: 'user-1', text: 'accepted user turn' }
    const priorCheckpoint = {
      id: 'assistant-run-1',
      text: 'durable assistant prefix',
    }
    expect(
      writeMessageJournal(
        baseKey,
        [acceptedUser, priorCheckpoint],
        [window.localStorage],
        (value) => value.id,
      ),
    ).toEqual({ anyVerified: true, persistentVerified: true })

    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      const parsed = JSON.parse(value) as {
        revision?: number
        state?: string
      }
      if (
        this === window.localStorage &&
        key.endsWith(encodeURIComponent(priorCheckpoint.id)) &&
        parsed.revision === 2 &&
        parsed.state === 'committed'
      ) {
        // Promotion reports success but leaves the prepared replacement behind.
        return
      }
      return originalSetItem.call(this, key, value)
    })

    expect(
      writeMessageJournal(
        baseKey,
        [{ ...priorCheckpoint, text: 'unverified replacement' }],
        [window.localStorage],
        (value) => value.id,
      ),
    ).toEqual({ anyVerified: false, persistentVerified: false })

    vi.mocked(Storage.prototype.setItem).mockRestore()
    expect(
      readMessageJournal<{ id: string; text: string }>(
        baseKey,
        [window.localStorage],
        (value) => value.id,
        (value) =>
          typeof value === 'object' &&
          value !== null &&
          'id' in value &&
          'text' in value &&
          typeof value.id === 'string' &&
          typeof value.text === 'string'
            ? { id: value.id, text: value.text }
            : null,
      ),
    ).toEqual(expect.arrayContaining([acceptedUser, priorCheckpoint]))
  })

  it('reclaims only disposable transcript snapshots before retrying a quota-blocked admission', () => {
    const baseKey = 'journal-quota-recovery'
    const snapshotKey =
      'workspace.card-transcript-snapshot.v1:remote%3Aold-card:commit:stale-context'
    const unrelatedKey = 'workspace.unrelated-preference'
    window.localStorage.setItem(snapshotKey, 'large stale snapshot cache')
    window.localStorage.setItem(unrelatedKey, 'must survive')

    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (
        this === window.localStorage &&
        key.startsWith(`${baseKey}:entry:`) &&
        window.localStorage.getItem(snapshotKey) !== null
      ) {
        throw new DOMException('storage quota exceeded', 'QuotaExceededError')
      }
      return originalSetItem.call(this, key, value)
    })

    expect(
      writeMessageJournal(
        baseKey,
        [{ id: 'new-user-turn', text: 'must be admitted safely' }],
        [window.localStorage],
        (value) => value.id,
      ),
    ).toEqual({ anyVerified: true, persistentVerified: true })

    expect(window.localStorage.getItem(snapshotKey)).toBeNull()
    expect(window.localStorage.getItem(unrelatedKey)).toBe('must survive')
  })
})
