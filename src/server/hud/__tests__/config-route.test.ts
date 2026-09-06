import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'hud-config-route-'))
  process.env.CLAUDE_WORKSPACE_DIR = tmpDir
  vi.resetModules()
})
afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.CLAUDE_WORKSPACE_DIR
  vi.resetModules()
})

describe('config route', () => {
  it('GET returns defaults when no file exists', async () => {
    // Dynamic import AFTER env is set so HUD_CONFIG_PATH resolves to tmpDir
    const { getConfigHandler } = await import('../../../routes/api/hud/config')
    const res = await getConfigHandler()
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, any>
    expect(body.widgets).toBeTypeOf('object')
    expect(body.widgets['brief']).toBe(true)
  })

  it('PATCH writes widget toggles and returns merged config', async () => {
    const { patchConfigHandler } =
      await import('../../../routes/api/hud/config')
    const req = new Request('http://test/api/hud/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widgets: { 'vm-health': false } }),
    })
    const res = await patchConfigHandler({ request: req })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, any>
    expect(body.widgets['vm-health']).toBe(false)
    expect(body.widgets['brief']).toBe(true) // unchanged default
  })

  it('PATCH round-trips: subsequent GET reflects written value', async () => {
    // Both handlers must use the same env-resolved path within the test
    const { patchConfigHandler, getConfigHandler } =
      await import('../../../routes/api/hud/config')
    const patchReq = new Request('http://test/api/hud/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widgets: { sessions: false } }),
    })
    await patchConfigHandler({ request: patchReq })
    const res = await getConfigHandler()
    const body = (await res.json()) as Record<string, any>
    expect(body.widgets['sessions']).toBe(false)
  })
})
