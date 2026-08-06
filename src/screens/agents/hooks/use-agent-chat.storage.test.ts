// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { operationsChatStorageForTests } from './use-agent-chat'

const cardId = 'remote:operations-concurrency'
const overlayKey =
  'workspace.operations-card-chat.v1:remote%3Aoperations-concurrency'

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

describe('Operations Card storage concurrency', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('unions divergent overlay writers when the stale aggregate commits last', () => {
    const baseline = overlay('baseline', 'shared baseline')
    expect(operationsChatStorageForTests.writeOverlay(cardId, [baseline])).toBe(
      true,
    )
    const staleRaw = window.localStorage.getItem(overlayKey)
    const first = overlay('first-tab', 'first tab accepted')
    expect(
      operationsChatStorageForTests.writeOverlay(cardId, [baseline, first]),
    ).toBe(true)
    const originalGetItem = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      key,
    ) {
      if (this === window.localStorage && key === overlayKey) return staleRaw
      return originalGetItem.call(this, key)
    })
    const second = overlay('second-tab', 'second tab accepted')

    expect(
      operationsChatStorageForTests.writeOverlay(cardId, [baseline, second]),
    ).toBe(true)
    vi.mocked(Storage.prototype.getItem).mockRestore()

    expect(
      operationsChatStorageForTests
        .readOverlay(cardId)
        .map((entry) => entry.id),
    ).toEqual(expect.arrayContaining(['baseline', 'first-tab', 'second-tab']))
  })

  it('unions divergent complete snapshots across local/session mirror order', () => {
    const first = complete('complete-first', 'first complete projection')
    const second = complete('complete-second', 'second complete projection')
    expect(
      operationsChatStorageForTests.writeCompleteSnapshot(cardId, [first]),
    ).toBe(true)

    const key =
      'workspace.operations-card-complete-history.v1:remote%3Aoperations-concurrency'
    const firstLocal = window.localStorage.getItem(key)
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        version: 2,
        revision: 99,
        owner: { cardId },
        messages: [second],
      }),
    )
    expect(firstLocal).not.toBeNull()

    expect(
      operationsChatStorageForTests
        .readCompleteSnapshot(cardId)
        .map((entry) => entry.id),
    ).toEqual(expect.arrayContaining(['complete-first', 'complete-second']))
  })

  it('does not report a session-only overlay write as durable', () => {
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (
        this === window.localStorage &&
        key.startsWith('workspace.operations-card-chat.')
      ) {
        throw new DOMException('persistent mirror denied', 'QuotaExceededError')
      }
      return originalSetItem.call(this, key, value)
    })

    expect(
      operationsChatStorageForTests.writeOverlay(cardId, [
        overlay('session-only', 'must not authorize send'),
      ]),
    ).toBe(false)
  })
})
