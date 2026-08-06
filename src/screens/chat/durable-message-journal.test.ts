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
})
