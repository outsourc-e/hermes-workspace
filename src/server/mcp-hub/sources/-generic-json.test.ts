/**
 * Tests for generic-json source adapter — Phase 3.2.
 * Fixture-based — no live network.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../cache', () => ({
  getCache: vi.fn(),
  setCache: vi.fn(),
  touchCache: vi.fn(),
}))

// Mock SSRF guard so unit tests don't hit DNS; specific SSRF tests are in
// src/server/mcp-hub/lib/-ssrf-guard.test.ts. Here we default to allowing all
// URLs so existing tests continue to work.
vi.mock('../lib/ssrf-guard', () => ({
  assertNotPrivate: vi.fn().mockResolvedValue(undefined),
}))

import { getCache, setCache, touchCache } from '../cache'
import { assertNotPrivate } from '../lib/ssrf-guard'
import { fetchGenericJson } from './generic-json'

const mockGetCache = vi.mocked(getCache)
const mockSetCache = vi.mocked(setCache)
const mockTouchCache = vi.mocked(touchCache)
const mockAssertNotPrivate = vi.mocked(assertNotPrivate)

function mockFetch(status: number, body: unknown, headers?: Record<string, string>): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (key: string) => (headers ?? {})[key] ?? null,
    },
    body: null, // streaming tests override this
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  }))
}

/**
 * Build a mock Response whose body is a ReadableStream yielding `chunks`.
 * Used for response-size-cap tests.
 */
function mockFetchWithStream(chunks: Uint8Array[]): void {
  let idx = 0
  const reader = {
    read: vi.fn(async () => {
      if (idx >= chunks.length) return { done: true, value: undefined }
      return { done: false, value: chunks[idx++] }
    }),
    cancel: vi.fn().mockResolvedValue(undefined),
    releaseLock: vi.fn(),
  }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    status: 200,
    ok: true,
    headers: { get: () => null },
    body: { getReader: () => reader },
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetCache.mockReturnValue(null)
  // Default: SSRF guard passes
  mockAssertNotPrivate.mockResolvedValue(undefined)
})

describe('fetchGenericJson', () => {
  describe('shape parsing', () => {
    it('parses { servers: [] } shape', async () => {
      mockFetch(200, {
        servers: [{ name: 'my-server', description: 'test', command: 'npx', args: ['-y', 'my-server'] }],
      })
      const result = await fetchGenericJson('test-source', 'https://example.com', 'community')
      expect(result.entries.length).toBeGreaterThan(0)
      expect(result.entries[0].name).toBe('my-server')
    })

    it('parses top-level array []', async () => {
      mockFetch(200, [
        { name: 'srv-a', description: 'A', command: 'npx', args: ['-y', 'srv-a'] },
      ])
      const result = await fetchGenericJson('test-source', 'https://example.com', 'community')
      expect(result.entries.length).toBeGreaterThan(0)
      expect(result.entries[0].name).toBe('srv-a')
    })

    it('parses { manifests: [] } shape', async () => {
      mockFetch(200, {
        manifests: [{ name: 'manifest-server', description: 'desc', command: 'node', args: ['server.js'] }],
      })
      const result = await fetchGenericJson('test-source', 'https://example.com', 'community')
      expect(result.entries.some((e) => e.name === 'manifest-server')).toBe(true)
    })

    it('parses { packages: [] } shape', async () => {
      mockFetch(200, {
        packages: [{ name: 'pkg-server', description: 'desc', command: 'npx', args: ['-y', 'pkg-server'] }],
      })
      const result = await fetchGenericJson('test-source', 'https://example.com', 'community')
      expect(result.entries.some((e) => e.name === 'pkg-server')).toBe(true)
    })

    it('parses { items: [] } shape', async () => {
      mockFetch(200, {
        items: [{ name: 'item-server', description: 'desc', command: 'npx', args: ['-y', 'item-server'] }],
      })
      const result = await fetchGenericJson('test-source', 'https://example.com', 'community')
      expect(result.entries.some((e) => e.name === 'item-server')).toBe(true)
    })

    it('skips entries without a name', async () => {
      mockFetch(200, {
        servers: [
          { name: 'valid', description: 'ok', command: 'npx', args: ['-y', 'valid'] },
          { description: 'no name here', command: 'npx', args: [] },
        ],
      })
      const result = await fetchGenericJson('test-source', 'https://example.com', 'community')
      expect(result.entries).toHaveLength(1)
    })

    it('uses default trust from source when item has no trust field', async () => {
      mockFetch(200, [{ name: 'unverified-server', command: 'npx', args: ['-y', 'unverified-server'] }])
      const result = await fetchGenericJson('test-source', 'https://example.com', 'unverified')
      expect(result.entries[0].trust).toBe('unverified')
    })

    it('promotes verified:true entries to community (trust cap prevents official)', async () => {
      mockFetch(200, [{ name: 'verified-server', command: 'npx', args: ['-y', 'verified-server'], verified: true }])
      const result = await fetchGenericJson('test-source', 'https://example.com', 'community')
      // MEDIUM-3: user sources cannot emit 'official' — capped to 'community'
      expect(result.entries[0].trust).toBe('community')
    })
  })

  describe('conditional GET / ETag', () => {
    it('sends If-None-Match when cached etag exists', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        status: 304,
        ok: false,
        headers: { get: () => null },
        body: null,
        json: () => Promise.resolve(null),
      })
      vi.stubGlobal('fetch', fetchSpy)
      mockGetCache.mockReturnValue({
        etag: '"abc123"',
        fetchedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        payload: [{ id: 'test:cached', name: 'cached', description: '', source: 'mcp-get' as const, homepage: null, tags: [], trust: 'community' as const, template: { name: 'cached', transportType: 'stdio' as const, command: 'npx', args: [] }, installed: false }],
      })

      await fetchGenericJson('test-source', 'https://example.com', 'community')
      const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>
      expect(headers['If-None-Match']).toBe('"abc123"')
    })

    it('returns cached payload on 304', async () => {
      const cachedEntries = [{ id: 'test:cached', name: 'cached', description: '', source: 'mcp-get' as const, homepage: null, tags: [], trust: 'community' as const, template: { name: 'cached', transportType: 'stdio' as const, command: 'npx', args: [] }, installed: false }]
      mockGetCache.mockReturnValue({ etag: '"abc"', fetchedAt: Date.now(), expiresAt: Date.now() + 60_000, payload: cachedEntries })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 304, ok: false, headers: { get: () => null }, body: null, json: () => Promise.resolve(null) }))

      const result = await fetchGenericJson('test-source', 'https://example.com', 'community')
      expect(result.entries).toBe(cachedEntries)
      expect(mockTouchCache).toHaveBeenCalledWith('test-source:https://example.com')
    })

    it('calls setCache with new etag on 200', async () => {
      mockFetch(200, [{ name: 'server-a', command: 'npx', args: ['-y', 'server-a'] }], { ETag: '"newetag"' })
      await fetchGenericJson('test-source', 'https://example.com', 'community')
      expect(mockSetCache).toHaveBeenCalledWith(
        'test-source:https://example.com',
        expect.objectContaining({ etag: '"newetag"' }),
      )
    })
  })

  describe('error handling', () => {
    it('returns degraded=true on network error, returns empty when no cache', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))
      const result = await fetchGenericJson('test-source', 'https://unreachable.example.com', 'community')
      expect(result.degraded).toBe(true)
      expect(result.entries).toHaveLength(0)
      expect(result.warnings?.some((w) => w.includes('network error'))).toBe(true)
    })

    it('returns cached payload on network error when cache exists', async () => {
      const cachedEntries = [{ id: 'test:old', name: 'old', description: '', source: 'mcp-get' as const, homepage: null, tags: [], trust: 'community' as const, template: { name: 'old', transportType: 'stdio' as const, command: 'npx', args: [] }, installed: false }]
      mockGetCache.mockReturnValue({ fetchedAt: Date.now(), expiresAt: Date.now() + 60_000, payload: cachedEntries })
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

      const result = await fetchGenericJson('test-source', 'https://example.com', 'community')
      expect(result.degraded).toBe(true)
      expect(result.entries).toBe(cachedEntries)
    })

    it('returns degraded on non-200 status', async () => {
      mockFetch(500, { error: 'server error' })
      const result = await fetchGenericJson('test-source', 'https://example.com', 'community')
      expect(result.degraded).toBe(true)
      expect(result.warnings?.some((w) => w.includes('500'))).toBe(true)
    })

    it('skips malicious templates (shell metachar in command)', async () => {
      // Commands containing ; | & $ ` < > are rejected by normalizeTemplate
      mockFetch(200, [{ name: 'evil', command: 'sh;rm${IFS}-rf/', args: [] }])
      const result = await fetchGenericJson('test-source', 'https://example.com', 'community')
      // normalizeTemplate rejects shell metachar — entry should be skipped
      expect(result.entries.some((e) => e.name === 'evil')).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // HIGH-1: SSRF guard
  // ---------------------------------------------------------------------------
  describe('SSRF guard', () => {
    it('returns degraded when SSRF guard rejects the URL', async () => {
      mockAssertNotPrivate.mockRejectedValue(
        new Error('SSRF guard: hostname "internal.corp" resolves to private address "10.0.0.1"'),
      )
      const result = await fetchGenericJson('priv-source', 'https://internal.corp/feed', 'community')
      expect(result.degraded).toBe(true)
      expect(result.entries).toHaveLength(0)
      expect(result.warnings?.some((w) => w.includes('SSRF guard'))).toBe(true)
    })

    it('does not call fetch when SSRF guard rejects', async () => {
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)
      mockAssertNotPrivate.mockRejectedValue(new Error('SSRF guard: blocked'))

      await fetchGenericJson('priv-source', 'https://internal.corp/feed', 'community')
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('proceeds normally when SSRF guard passes', async () => {
      mockAssertNotPrivate.mockResolvedValue(undefined)
      mockFetch(200, [{ name: 'public-server', command: 'npx', args: ['-y', 'public-server'] }])
      const result = await fetchGenericJson('pub-source', 'https://pub.example.com/feed', 'community')
      expect(result.entries).toHaveLength(1)
      expect(result.degraded).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // HIGH-2: Response-size cap
  // ---------------------------------------------------------------------------
  describe('response size cap', () => {
    it('returns warning + empty entries when response exceeds 5 MB', async () => {
      // Produce a 6 MB chunk in one read to trigger the size cap
      const SIX_MB = 6 * 1024 * 1024
      const bigChunk = new Uint8Array(SIX_MB)
      // Fill with valid-looking JSON bytes (doesn't matter — truncation happens before parse)
      bigChunk.fill(0x20) // spaces
      mockFetchWithStream([bigChunk])

      const result = await fetchGenericJson('big-source', 'https://big.example.com/feed', 'community')
      expect(result.degraded).toBe(true)
      expect(result.entries).toHaveLength(0)
      expect(result.warnings?.some((w) => w.includes('>5MB'))).toBe(true)
    })

    it('returns entries normally when response is under 5 MB', async () => {
      const payload = JSON.stringify([{ name: 'small-server', command: 'npx', args: ['-y', 'small-server'] }])
      const chunk = new TextEncoder().encode(payload)
      mockFetchWithStream([chunk])

      const result = await fetchGenericJson('small-source', 'https://small.example.com/feed', 'community')
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].name).toBe('small-server')
      expect(result.degraded).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // MEDIUM-2: Cache key includes URL
  // ---------------------------------------------------------------------------
  describe('cache key includes URL', () => {
    it('uses sourceId:url as cache key', async () => {
      mockFetch(200, [{ name: 'key-server', command: 'npx', args: ['-y', 'key-server'] }])
      await fetchGenericJson('my-source', 'https://v2.example.com/feed', 'community')
      expect(mockSetCache).toHaveBeenCalledWith(
        'my-source:https://v2.example.com/feed',
        expect.any(Object),
      )
    })

    it('gets cache with sourceId:url composite key', async () => {
      const url = 'https://cached.example.com/feed'
      const cachedEntries = [{ id: 'src:server', name: 'server', description: '', source: 'user:src' as const, homepage: null, tags: [], trust: 'community' as const, template: { name: 'server', transportType: 'stdio' as const, command: 'npx', args: [] }, installed: false }]
      // getCache is called with the composite key
      mockGetCache.mockImplementation((key) => {
        if (key === `my-source:${url}`) {
          return { fetchedAt: Date.now(), expiresAt: Date.now() + 60_000, payload: cachedEntries, etag: '"v1"' }
        }
        return null
      })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        status: 304, ok: false, headers: { get: () => null }, body: null, json: () => Promise.resolve(null),
      }))

      const result = await fetchGenericJson('my-source', url, 'community')
      expect(result.entries).toBe(cachedEntries)
    })
  })

  // ---------------------------------------------------------------------------
  // MEDIUM-3: Trust cap
  // ---------------------------------------------------------------------------
  describe('trust cap for user sources', () => {
    it('caps verified:true entries at community (prevents official trust laundering)', async () => {
      mockFetch(200, [
        { name: 'laundered', command: 'npx', args: ['-y', 'laundered'], verified: true },
      ])
      const result = await fetchGenericJson('corp-source', 'https://corp.example.com/feed', 'community')
      const entry = result.entries.find((e) => e.name === 'laundered')
      expect(entry).toBeDefined()
      expect(entry!.trust).toBe('community')
    })

    it('caps explicit trust:"official" from payload at community', async () => {
      mockFetch(200, [
        { name: 'self-promoted', command: 'npx', args: ['-y', 'self-promoted'], trust: 'official' },
      ])
      const result = await fetchGenericJson('corp-source', 'https://corp.example.com/feed', 'community')
      const entry = result.entries.find((e) => e.name === 'self-promoted')
      expect(entry).toBeDefined()
      expect(entry!.trust).toBe('community')
    })

    it('keeps community trust as-is', async () => {
      mockFetch(200, [
        { name: 'community-server', command: 'npx', args: ['-y', 'community-server'], trust: 'community' },
      ])
      const result = await fetchGenericJson('corp-source', 'https://corp.example.com/feed', 'community')
      expect(result.entries[0].trust).toBe('community')
    })

    it('keeps unverified trust as-is', async () => {
      mockFetch(200, [
        { name: 'unverified-server', command: 'npx', args: ['-y', 'unverified-server'] },
      ])
      const result = await fetchGenericJson('corp-source', 'https://corp.example.com/feed', 'unverified')
      expect(result.entries[0].trust).toBe('unverified')
    })

    it('source field uses user:<sourceId> format for user sources', async () => {
      mockFetch(200, [{ name: 'tagged-server', command: 'npx', args: ['-y', 'tagged-server'] }])
      const result = await fetchGenericJson('my-corp', 'https://corp.example.com/feed', 'community')
      expect(result.entries[0].source).toBe('user:my-corp')
    })
  })
})
