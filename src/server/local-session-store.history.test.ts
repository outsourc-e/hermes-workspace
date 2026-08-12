import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
  it('archives beyond the 500-message hot window without losing authoritative history', async () => {
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
      truncated: false,
      generation: 501,
    })
    const snapshot = store.getLocalMessagesResult('local-card')
    expect(snapshot.messages).toHaveLength(501)
    expect(snapshot.messages[0]?.id).toBe('message-1')
    expect(snapshot.messages[500]?.id).toBe('message-501')
    expect(snapshot.snapshot).toEqual(expect.any(String))

    vi.resetModules()
    const reloadedStore = await import('./local-session-store')
    expect(reloadedStore.getLocalMessagesResult('local-card')).toMatchObject({
      truncated: false,
      generation: 501,
      snapshot: snapshot.snapshot,
    })
    expect(reloadedStore.getLocalMessages('local-card')).toHaveLength(501)
  })

  it('retains a bounded archive and exposes explicit partial history after the durable limit', async () => {
    vi.useFakeTimers()
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'local-history-'))
    process.chdir(temporaryDirectory)
    vi.resetModules()
    const store = await import('./local-session-store')

    for (let index = 1; index <= 5_001; index += 1) {
      store.appendLocalMessage('local-card', {
        id: `message-${index}`,
        role: 'user',
        content: `message ${index}`,
        timestamp: index,
      })
    }
    vi.runAllTimers()

    const snapshot = store.getLocalMessagesResult('local-card')
    expect(snapshot).toMatchObject({
      source: 'local',
      truncated: true,
      generation: 5_001,
    })
    expect(snapshot.messages).toHaveLength(5_000)
    expect(snapshot.messages[0]?.id).toBe('message-2')
    expect(snapshot.messages[4_999]?.id).toBe('message-5001')
  })

  it('migrates a legacy full 500-row window conservatively without discarding it', async () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'local-history-'))
    const runtimeDirectory = join(temporaryDirectory, '.runtime')
    mkdirSync(runtimeDirectory, { recursive: true })
    const messages = Array.from({ length: 500 }, (_, index) => ({
      id: `legacy-${index + 1}`,
      role: 'user',
      content: `legacy ${index + 1}`,
      timestamp: index + 1,
    }))
    writeFileSync(
      join(runtimeDirectory, 'local-sessions.json'),
      JSON.stringify({
        sessions: {
          legacy: {
            id: 'legacy',
            title: null,
            model: null,
            createdAt: 1,
            updatedAt: 1,
            messageCount: 500,
          },
        },
        messages: { legacy: messages },
      }),
    )
    process.chdir(temporaryDirectory)
    vi.resetModules()

    const store = await import('./local-session-store')
    const migrated = store.getLocalMessagesResult('legacy')
    expect(migrated.messages).toHaveLength(500)
    expect(migrated.messages[0]?.id).toBe('legacy-1')
    expect(migrated).toMatchObject({ generation: 500, truncated: true })
  })
})
