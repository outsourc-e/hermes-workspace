import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const originalCwd = process.cwd()
let temporaryDirectory: string | undefined

afterEach(() => {
  vi.useRealTimers()
  process.chdir(originalCwd)
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true })
  temporaryDirectory = undefined
  vi.resetModules()
})

describe('local session history snapshots', () => {
  it('persists an authoritative truncation and generation fact for its rolling window', async () => {
    vi.useFakeTimers()
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'local-history-'))
    process.chdir(temporaryDirectory)
    vi.resetModules()
    const store = await import('./local-session-store')

    for (let index = 1; index <= 501; index += 1) {
      store.appendLocalMessage('local-card', {
        id: `message-${index}`,
        role: 'user',
        content: `message ${index}`,
        timestamp: index,
      })
    }
    vi.runAllTimers()

    expect(store.getLocalMessagesResult('local-card')).toMatchObject({
      source: 'local',
      truncated: true,
      generation: 501,
    })
    const snapshot = store.getLocalMessagesResult('local-card')
    expect(snapshot.messages).toHaveLength(500)
    expect(snapshot.messages[0]?.id).toBe('message-2')
    expect(snapshot.messages[499]?.id).toBe('message-501')
    expect(snapshot.snapshot).toEqual(expect.any(String))

    vi.resetModules()
    const reloadedStore = await import('./local-session-store')
    expect(reloadedStore.getLocalMessagesResult('local-card')).toMatchObject({
      truncated: true,
      generation: 501,
      snapshot: snapshot.snapshot,
    })
  })
})
