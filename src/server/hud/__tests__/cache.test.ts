import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { HUDCache } from '../cache'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hud-cache-'))
})

describe('HUDCache', () => {
  it('returns null for unknown key', async () => {
    const cache = new HUDCache(dir)
    expect(await cache.get('missing')).toBeNull()
  })

  it('round-trips a value', async () => {
    const cache = new HUDCache(dir)
    await cache.set('agents', { value: '7' }, 60000)
    const got = await cache.get<{ value: string }>('agents')
    expect(got?.data).toEqual({ value: '7' })
    expect(got?.ttlMs).toBe(60000)
  })

  it('reports staleness when past ttl', async () => {
    const cache = new HUDCache(dir)
    await cache.set('agents', { value: '7' }, 50)
    await new Promise((r) => setTimeout(r, 75))
    const got = await cache.get<{ value: string }>('agents')
    expect(got?.isStale).toBe(true)
    expect(got?.data).toEqual({ value: '7' }) // still returns data
  })
})
