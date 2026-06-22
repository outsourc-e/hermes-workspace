import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const originalCwd = process.cwd()
let tempDir: string | null = null

async function loadStore() {
  tempDir = mkdtempSync(join(tmpdir(), 'hermes-local-session-store-'))
  process.chdir(tempDir)
  vi.resetModules()
  return import('./local-session-store')
}

afterEach(() => {
  process.chdir(originalCwd)
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  tempDir = null
})

describe('local-session-store', () => {
  it('persists model updates on the session without touching other sessions', async () => {
    const store = await loadStore()

    store.ensureLocalSession('session-a', 'openai/gpt-5.5')
    store.ensureLocalSession('session-b', 'anthropic/claude-sonnet-4-5')

    store.updateLocalSessionModel('session-a', 'zai/glm-4.6')

    expect(store.getLocalSession('session-a')?.model).toBe('zai/glm-4.6')
    expect(store.getLocalSession('session-b')?.model).toBe(
      'anthropic/claude-sonnet-4-5',
    )
  })

  it('clears a local session model when given a blank value', async () => {
    const store = await loadStore()

    store.ensureLocalSession('session-a', 'openai/gpt-5.5')
    store.updateLocalSessionModel('session-a', '   ')

    expect(store.getLocalSession('session-a')?.model).toBeNull()
  })
})
