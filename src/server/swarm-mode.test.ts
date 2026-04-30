import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

let tempRoot = ''

async function loadModule() {
  vi.resetModules()
  tempRoot = mkdtempSync(join(tmpdir(), 'swarm-mode-test-'))
  vi.doMock('./swarm-environment', () => ({
    SWARM_CANONICAL_REPO: tempRoot,
  }))
  return await import('./swarm-mode')
}

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('./swarm-environment')
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true })
  tempRoot = ''
})

describe('swarm-mode', () => {
  it('persists auto/manual mode to disk and reads it back', async () => {
    const mod = await loadModule()

    const written = mod.writeSwarmMode('manual')
    const readBack = mod.readSwarmMode()

    expect(written.mode).toBe('manual')
    expect(readBack).toMatchObject({ mode: 'manual' })
    expect(readBack.updatedAt).toBeTruthy()
  })

  it('forces manual loop requests to report-only mode', async () => {
    const mod = await loadModule()

    expect(mod.applySwarmModeToLoopFlags({
      mode: 'manual',
      autoContinueRequested: true,
      allowExecutionRequested: true,
    })).toEqual({
      autoContinue: false,
      allowExecution: false,
    })

    expect(mod.applySwarmModeToLoopFlags({
      mode: 'auto',
      autoContinueRequested: true,
      allowExecutionRequested: false,
    })).toEqual({
      autoContinue: true,
      allowExecution: false,
    })
  })
})
