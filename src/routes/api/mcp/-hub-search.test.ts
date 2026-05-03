/**
 * Tests for GET /api/mcp/hub-search route handler.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))
vi.mock('../../../server/rate-limit', () => ({
  rateLimit: vi.fn(),
  getClientIp: vi.fn(),
  rateLimitResponse: vi.fn(),
  safeErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
}))
vi.mock('../../../server/mcp-hub/index', () => ({
  unifiedSearch: vi.fn(),
}))

import { isAuthenticated } from '../../../server/auth-middleware'
import { rateLimit, getClientIp, rateLimitResponse } from '../../../server/rate-limit'
import { unifiedSearch } from '../../../server/mcp-hub/index'
import { Route } from './hub-search'

const mockIsAuthenticated = vi.mocked(isAuthenticated)
const mockRateLimit = vi.mocked(rateLimit)
const mockGetClientIp = vi.mocked(getClientIp)
const mockRateLimitResponse = vi.mocked(rateLimitResponse)
const mockUnifiedSearch = vi.mocked(unifiedSearch)

function makeRequest(url: string): Request {
  return new Request(url)
}

async function callGet(url: string): Promise<Response> {
  const request = makeRequest(url)
  const handler = Route.options.server?.handlers?.GET
  if (!handler) throw new Error('No GET handler')
  return handler({ request } as Parameters<typeof handler>[0])
}

beforeEach(() => {
  vi.resetAllMocks()
  mockIsAuthenticated.mockReturnValue(true)
  mockGetClientIp.mockReturnValue('127.0.0.1')
  mockRateLimit.mockReturnValue(true)
  mockRateLimitResponse.mockReturnValue(
    new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 }),
  )
})

describe('GET /api/mcp/hub-search — auth', () => {
  it('returns 401 when not authenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false)
    const res = await callGet('http://localhost/api/mcp/hub-search?q=test')
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })

  it('returns 429 when rate limited', async () => {
    mockRateLimit.mockReturnValue(false)
    const res = await callGet('http://localhost/api/mcp/hub-search?q=test')
    expect(res.status).toBe(429)
  })
})

describe('GET /api/mcp/hub-search — query parsing', () => {
  it('passes q, source, limit to unifiedSearch', async () => {
    mockUnifiedSearch.mockResolvedValue({ results: [], source: 'mcp-get', total: 0 })
    await callGet('http://localhost/api/mcp/hub-search?q=github&source=mcp-get&limit=5')
    expect(mockUnifiedSearch).toHaveBeenCalledWith('github', 'mcp-get', 5)
  })

  it('uses defaults when params absent', async () => {
    mockUnifiedSearch.mockResolvedValue({ results: [], source: 'all', total: 0 })
    await callGet('http://localhost/api/mcp/hub-search')
    expect(mockUnifiedSearch).toHaveBeenCalledWith('', 'all', 20)
  })

  it('clamps limit to 100', async () => {
    mockUnifiedSearch.mockResolvedValue({ results: [], source: 'all', total: 0 })
    await callGet('http://localhost/api/mcp/hub-search?limit=9999')
    expect(mockUnifiedSearch).toHaveBeenCalledWith('', 'all', 100)
  })

  it('defaults invalid source to all', async () => {
    mockUnifiedSearch.mockResolvedValue({ results: [], source: 'all', total: 0 })
    await callGet('http://localhost/api/mcp/hub-search?source=invalid')
    expect(mockUnifiedSearch).toHaveBeenCalledWith('', 'all', 20)
  })
})

describe('GET /api/mcp/hub-search — response shape', () => {
  it('returns ok:true with results on success', async () => {
    mockUnifiedSearch.mockResolvedValue({
      results: [{ id: 'mcp-get:github', name: 'github' } as never],
      source: 'mcp-get',
      total: 1,
    })
    const res = await callGet('http://localhost/api/mcp/hub-search?q=github')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.results).toHaveLength(1)
    expect(body.source).toBe('mcp-get')
    expect(body.total).toBe(1)
  })

  it('includes warnings when present', async () => {
    mockUnifiedSearch.mockResolvedValue({
      results: [],
      source: 'local',
      total: 0,
      warnings: ['mcp-get: network error: timeout'],
    })
    const res = await callGet('http://localhost/api/mcp/hub-search')
    const body = await res.json()
    expect(body.warnings).toHaveLength(1)
  })

  it('does not include warnings key when empty', async () => {
    mockUnifiedSearch.mockResolvedValue({ results: [], source: 'all', total: 0 })
    const res = await callGet('http://localhost/api/mcp/hub-search')
    const body = await res.json()
    expect(body.warnings).toBeUndefined()
  })

  it('returns ok:false with empty results (not 5xx) when unifiedSearch throws', async () => {
    mockUnifiedSearch.mockRejectedValue(new Error('unexpected crash'))
    const res = await callGet('http://localhost/api/mcp/hub-search')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.results).toHaveLength(0)
    expect(body.source).toBe('error')
  })
})
