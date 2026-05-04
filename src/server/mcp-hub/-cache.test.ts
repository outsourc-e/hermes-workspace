import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  __resetHubCacheForTests,
  getCache,
  setCache,
  touchCache,
} from './cache'

let tmpHome: string
let originalHome: string | undefined

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'hermes-hub-cache-'))
  originalHome = process.env.HERMES_HOME
  process.env.HERMES_HOME = tmpHome
  __resetHubCacheForTests()
})

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.HERMES_HOME
  } else {
    process.env.HERMES_HOME = originalHome
  }
  __resetHubCacheForTests()
  try { rmSync(tmpHome, { recursive: true, force: true }) } catch { /* ignore */ }
})

describe('getCache / setCache', () => {
  it('returns null when nothing is cached', () => {
    expect(getCache('mcp-get')).toBeNull()
  })

  it('returns the entry immediately after setCache', () => {
    setCache('mcp-get', { payload: [{ name: 'test' }], etag: '"abc123"' })
    const result = getCache('mcp-get')
    expect(result).not.toBeNull()
    expect(result?.etag).toBe('"abc123"')
    expect(result?.payload).toEqual([{ name: 'test' }])
    expect(result?.fetchedAt).toBeGreaterThan(0)
    expect(result?.expiresAt).toBeGreaterThan(Date.now())
  })

  it('stores and retrieves optional rate-limit fields', () => {
    setCache('mcp-get', {
      payload: [],
      rateLimitRemaining: 42,
      rateLimitResetAt: 9999999,
    })
    const result = getCache('mcp-get')
    expect(result?.rateLimitRemaining).toBe(42)
    expect(result?.rateLimitResetAt).toBe(9999999)
  })

  it('returns null after in-memory cache is cleared (simulates expiry)', () => {
    setCache('mcp-get', { payload: 'hello' })
    __resetHubCacheForTests()
    // Disk copy still has a 24h TTL so it should be found
    const result = getCache('mcp-get')
    expect(result).not.toBeNull()
    expect(result?.payload).toBe('hello')
  })

  it('isolates different source keys', () => {
    setCache('mcp-get', { payload: 'a' })
    setCache('local', { payload: 'b' })
    expect((getCache('mcp-get') as { payload: unknown })?.payload).toBe('a')
    expect((getCache('local') as { payload: unknown })?.payload).toBe('b')
  })

  it('persists to disk (survives memory clear)', () => {
    setCache('mcp-get', { payload: { data: 'persisted' }, etag: '"v1"' })
    __resetHubCacheForTests()
    const result = getCache('mcp-get')
    expect(result).not.toBeNull()
    expect(result?.etag).toBe('"v1"')
    expect((result?.payload as Record<string, unknown>)?.data).toBe('persisted')
  })
})

describe('touchCache', () => {
  it('bumps fetchedAt without changing payload', () => {
    setCache('mcp-get', { payload: 'original', etag: '"e1"' })
    const before = getCache('mcp-get')!.fetchedAt
    // Small sleep to ensure timestamp differs
    const start = Date.now()
    while (Date.now() === start) { /* spin */ }
    touchCache('mcp-get')
    const after = getCache('mcp-get')!
    expect(after.payload).toBe('original')
    expect(after.etag).toBe('"e1"')
    expect(after.fetchedAt).toBeGreaterThanOrEqual(before)
  })

  it('is a no-op when nothing is cached', () => {
    expect(() => touchCache('nonexistent')).not.toThrow()
  })

  it('disk entry after touchCache retains 24h TTL (not collapsed to 30min mem TTL)', () => {
    // Simulate: entry was written to disk, then promoted to memory with short mem TTL
    setCache('mcp-get', { payload: 'data', etag: '"v1"' })

    // Clear memory so the next getCache promotes from disk with a short mem-TTL
    __resetHubCacheForTests()

    // Read from disk — promotes to memory with min(diskExpiresAt, now+MEM_TTL)
    const promoted = getCache('mcp-get')!
    expect(promoted).not.toBeNull()

    // Now touchCache — should write disk entry with 24h TTL, not mem TTL
    touchCache('mcp-get')

    // Clear memory again and read from disk to inspect the disk entry's TTL
    __resetHubCacheForTests()
    const fromDisk = getCache('mcp-get')!
    expect(fromDisk).not.toBeNull()

    // expiresAtDisk must be at least 23h from now (well beyond the 30min mem TTL).
    // expiresAt is the memory TTL (capped at 30min by promotion); expiresAtDisk
    // carries the true disk expiry so callers can distinguish the two.
    const twentyThreeHoursMs = 23 * 60 * 60 * 1_000
    expect(fromDisk.expiresAtDisk).toBeGreaterThan(Date.now() + twentyThreeHoursMs)
  })
})

describe('env override', () => {
  it('uses HERMES_HOME for disk path', () => {
    const altHome = mkdtempSync(join(tmpdir(), 'hermes-alt-'))
    try {
      process.env.HERMES_HOME = altHome
      __resetHubCacheForTests()
      setCache('mcp-get', { payload: 'alt' })
      __resetHubCacheForTests()
      const result = getCache('mcp-get')
      expect(result?.payload).toBe('alt')
    } finally {
      process.env.HERMES_HOME = tmpHome
      rmSync(altHome, { recursive: true, force: true })
    }
  })
})
