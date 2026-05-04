/**
 * Tests for the mcp-get source adapter.
 * Uses vi.mock for cache and undici-style fetch interceptor (vi.stubGlobal)
 * so no live network calls are made.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Mock cache module
vi.mock('../cache', () => ({
  getCache: vi.fn(),
  setCache: vi.fn(),
  touchCache: vi.fn(),
}))

import { getCache, setCache, touchCache } from '../cache'
import { fetchMcpGet } from './mcp-get'
import type { CachePayload } from '../cache'

const mockGetCache = vi.mocked(getCache)
const mockSetCache = vi.mocked(setCache)
const mockTouchCache = vi.mocked(touchCache)

const SAMPLE_MANIFEST = [
  {
    name: 'github-mcp',
    description: 'GitHub MCP server',
    homepage: 'https://github.com/modelcontextprotocol/servers',
    tags: ['dev', 'git'],
    transportType: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
  },
  {
    name: 'slack-mcp',
    description: 'Slack MCP server',
    homepage: 'https://github.com/modelcontextprotocol/servers',
    tags: ['communication'],
    transportType: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    env: { SLACK_BOT_TOKEN: '' },
  },
]

let originalFetch: typeof global.fetch

beforeEach(() => {
  vi.resetAllMocks()
  originalFetch = global.fetch
})

afterEach(() => {
  global.fetch = originalFetch
})

function makeFetchMock(status: number, body: unknown, headers: Record<string, string> = {}): typeof fetch {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null,
    },
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch
}

describe('fetchMcpGet — 200 OK', () => {
  it('parses manifest array and returns entries', async () => {
    mockGetCache.mockReturnValue(null)
    global.fetch = makeFetchMock(200, SAMPLE_MANIFEST)

    const result = await fetchMcpGet()
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0].name).toBe('github-mcp')
    expect(result.entries[0].source).toBe('mcp-get')
    expect(result.entries[0].trust).toBe('community')
    expect(result.entries[0].id).toBe('mcp-get:github-mcp')
    expect(result.warnings).toBeUndefined()
  })

  it('parses manifest wrapped in {manifests:[...]}', async () => {
    mockGetCache.mockReturnValue(null)
    global.fetch = makeFetchMock(200, { manifests: SAMPLE_MANIFEST })

    const result = await fetchMcpGet()
    expect(result.entries).toHaveLength(2)
  })

  it('persists new etag and lastModified to cache', async () => {
    mockGetCache.mockReturnValue(null)
    global.fetch = makeFetchMock(200, SAMPLE_MANIFEST, {
      ETag: '"abc123"',
      'Last-Modified': 'Thu, 01 May 2026 00:00:00 GMT',
    })

    await fetchMcpGet()
    expect(mockSetCache).toHaveBeenCalledWith(
      'mcp-get',
      expect.objectContaining({
        etag: '"abc123"',
        lastModified: 'Thu, 01 May 2026 00:00:00 GMT',
      }),
    )
  })

  it('sends If-None-Match header when cached etag present', async () => {
    const cachedEntry: CachePayload = {
      etag: '"cached-etag"',
      fetchedAt: Date.now() - 1000,
      expiresAt: Date.now() + 1_800_000,
      payload: [],
    }
    mockGetCache.mockReturnValue(cachedEntry)
    const fetchSpy = makeFetchMock(200, SAMPLE_MANIFEST)
    global.fetch = fetchSpy

    await fetchMcpGet()
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'If-None-Match': '"cached-etag"' }),
      }),
    )
  })

  it('skips entries that fail trust normalization (shell metachar in command)', async () => {
    mockGetCache.mockReturnValue(null)
    global.fetch = makeFetchMock(200, [
      {
        name: 'malicious',
        transportType: 'stdio',
        command: 'npx; rm -rf /',
        args: [],
      },
      ...SAMPLE_MANIFEST,
    ])

    const result = await fetchMcpGet()
    // malicious entry skipped; only SAMPLE_MANIFEST entries remain
    expect(result.entries).toHaveLength(2)
    expect(result.entries.every((e) => e.name !== 'malicious')).toBe(true)
  })
})

describe('fetchMcpGet — 304 Not Modified', () => {
  it('returns cached payload and calls touchCache', async () => {
    const cachedEntries = [{ id: 'mcp-get:old', name: 'old', source: 'mcp-get' }]
    const cachedEntry: CachePayload = {
      etag: '"old-etag"',
      fetchedAt: Date.now() - 1000,
      expiresAt: Date.now() + 1_800_000,
      payload: cachedEntries,
    }
    mockGetCache.mockReturnValue(cachedEntry)
    global.fetch = makeFetchMock(304, null)

    const result = await fetchMcpGet()
    expect(result.entries).toEqual(cachedEntries)
    expect(mockTouchCache).toHaveBeenCalledWith('mcp-get')
    expect(mockSetCache).not.toHaveBeenCalled()
  })
})

describe('fetchMcpGet — 403 rate limited', () => {
  it('returns cached payload and a warning string', async () => {
    const cachedEntry: CachePayload = {
      fetchedAt: Date.now() - 1000,
      expiresAt: Date.now() + 1_800_000,
      payload: SAMPLE_MANIFEST,
    }
    mockGetCache.mockReturnValue(cachedEntry)
    global.fetch = makeFetchMock(403, null, {
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': '1746129999',
    })

    const result = await fetchMcpGet()
    expect(result.entries).toEqual(SAMPLE_MANIFEST)
    expect(result.warnings).toBeDefined()
    expect(result.warnings![0]).toMatch(/rate limited/)
  })

  it('returns empty entries when 403 and no cache', async () => {
    mockGetCache.mockReturnValue(null)
    global.fetch = makeFetchMock(403, null)

    const result = await fetchMcpGet()
    expect(result.entries).toHaveLength(0)
    expect(result.warnings).toBeDefined()
  })
})

describe('fetchMcpGet — network error', () => {
  it('returns cached payload + warning on fetch throw', async () => {
    const cachedEntry: CachePayload = {
      fetchedAt: Date.now() - 1000,
      expiresAt: Date.now() + 1_800_000,
      payload: [{ name: 'cached' }],
    }
    mockGetCache.mockReturnValue(cachedEntry)
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch

    const result = await fetchMcpGet()
    expect(result.entries).toEqual([{ name: 'cached' }])
    expect(result.warnings![0]).toMatch(/network error/)
  })

  it('returns empty entries + warning when no cache and network fails', async () => {
    mockGetCache.mockReturnValue(null)
    global.fetch = vi.fn().mockRejectedValue(new Error('timeout')) as unknown as typeof fetch

    const result = await fetchMcpGet()
    expect(result.entries).toHaveLength(0)
    expect(result.warnings).toBeDefined()
  })
})

describe('fetchMcpGet — degraded flag', () => {
  it('sets degraded=true on 403 with no cache', async () => {
    mockGetCache.mockReturnValue(null)
    global.fetch = makeFetchMock(403, null, {
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': '9999999',
    })

    const result = await fetchMcpGet()
    expect(result.degraded).toBe(true)
    expect(result.entries).toHaveLength(0)
    expect(result.warnings).toBeDefined()
    expect(result.warnings![0]).toMatch(/rate limited/)
  })

  it('sets degraded=true on 403 with cached payload', async () => {
    const cachedEntry: CachePayload = {
      fetchedAt: Date.now() - 1000,
      expiresAt: Date.now() + 1_800_000,
      payload: [{ name: 'stale' }],
    }
    mockGetCache.mockReturnValue(cachedEntry)
    global.fetch = makeFetchMock(403, null)

    const result = await fetchMcpGet()
    expect(result.degraded).toBe(true)
    expect(result.entries).toHaveLength(1)
  })

  it('sets degraded=true on network error', async () => {
    mockGetCache.mockReturnValue(null)
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch

    const result = await fetchMcpGet()
    expect(result.degraded).toBe(true)
  })

  it('does NOT set degraded on clean 200 OK', async () => {
    mockGetCache.mockReturnValue(null)
    global.fetch = makeFetchMock(200, [])

    const result = await fetchMcpGet()
    expect(result.degraded).toBeUndefined()
  })

  it('does NOT set degraded on 304 Not Modified', async () => {
    const cachedEntry: CachePayload = {
      etag: '"v1"',
      fetchedAt: Date.now() - 1000,
      expiresAt: Date.now() + 1_800_000,
      payload: [],
    }
    mockGetCache.mockReturnValue(cachedEntry)
    global.fetch = makeFetchMock(304, null)

    const result = await fetchMcpGet()
    expect(result.degraded).toBeUndefined()
  })
})
