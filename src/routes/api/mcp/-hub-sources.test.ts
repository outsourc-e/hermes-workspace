/**
 * Tests for /api/mcp/hub-sources REST endpoints — Phase 3.2.
 *
 * Uses vi.mock to isolate store functions from real filesystem I/O.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../../server/mcp-hub-sources-store', () => ({
  readHubSources: vi.fn(),
  addHubSource: vi.fn(),
  updateHubSource: vi.fn(),
  deleteHubSource: vi.fn(),
}))
vi.mock('../../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

import { readHubSources, addHubSource, updateHubSource, deleteHubSource } from '../../../server/mcp-hub-sources-store'
import { isAuthenticated } from '../../../server/auth-middleware'
import { Route as HubSourcesRoute } from './hub-sources'
import { Route as HubSourcesIdRoute } from './hub-sources.$id'

const mockReadHubSources = vi.mocked(readHubSources)
const mockAddHubSource = vi.mocked(addHubSource)
const mockUpdateHubSource = vi.mocked(updateHubSource)
const mockDeleteHubSource = vi.mocked(deleteHubSource)
const mockIsAuthenticated = vi.mocked(isAuthenticated)

const BUILTIN_SOURCES = [
  { id: 'mcp-get', name: 'Smithery Registry', url: 'https://registry.smithery.ai/servers', trust: 'community', format: 'smithery', enabled: true, builtin: true },
  { id: 'local-file', name: 'Local Presets', url: 'file://~/.hermes/mcp-presets.json', trust: 'official', format: 'generic-json', enabled: true, builtin: true },
]

function makeRequest(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

async function callGet(request: Request) {
  const handlers = HubSourcesRoute.options.server?.handlers as Record<string, (ctx: { request: Request }) => Promise<Response>>
  return handlers['GET']({ request })
}

async function callPost(request: Request) {
  const handlers = HubSourcesRoute.options.server?.handlers as Record<string, (ctx: { request: Request }) => Promise<Response>>
  return handlers['POST']({ request })
}

async function callPut(request: Request, id: string) {
  const handlers = HubSourcesIdRoute.options.server?.handlers as Record<string, (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>>
  return handlers['PUT']({ request, params: { id } })
}

async function callDelete(request: Request, id: string) {
  const handlers = HubSourcesIdRoute.options.server?.handlers as Record<string, (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>>
  return handlers['DELETE']({ request, params: { id } })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsAuthenticated.mockReturnValue(true)
  mockReadHubSources.mockResolvedValue({ sources: BUILTIN_SOURCES as never, source: 'seed' })
})

describe('GET /api/mcp/hub-sources', () => {
  it('returns 401 when not authenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false)
    const res = await callGet(makeRequest('GET', 'http://localhost/api/mcp/hub-sources'))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })

  it('returns built-in sources on seed', async () => {
    const res = await callGet(makeRequest('GET', 'http://localhost/api/mcp/hub-sources'))
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.sources).toHaveLength(2)
    expect(body.source).toBe('seed')
  })

  it('returns ok:false with error fields when source is invalid', async () => {
    mockReadHubSources.mockResolvedValue({
      sources: BUILTIN_SOURCES as never,
      source: 'invalid',
      error: 'Validation failed',
      validationErrors: [{ path: 'version', message: 'version must be 1' }],
    })
    const res = await callGet(makeRequest('GET', 'http://localhost/api/mcp/hub-sources'))
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toBeTruthy()
    expect(body.validationErrors).toHaveLength(1)
  })
})

describe('POST /api/mcp/hub-sources', () => {
  it('returns 401 when not authenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false)
    const res = await callPost(makeRequest('POST', 'http://localhost/api/mcp/hub-sources', {}))
    expect(res.status).toBe(401)
  })

  it('adds a valid source and returns updated list', async () => {
    const newSource = { id: 'corp', name: 'Corp', url: 'https://corp.example.com', trust: 'official', format: 'generic-json', enabled: true }
    mockAddHubSource.mockResolvedValue({ ok: true, sources: [...BUILTIN_SOURCES, newSource] as never })
    const res = await callPost(makeRequest('POST', 'http://localhost/api/mcp/hub-sources', newSource))
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.sources).toHaveLength(3)
  })

  it('returns ok:false + errors on bad input', async () => {
    mockAddHubSource.mockResolvedValue({ ok: false, errors: [{ path: 'url', message: 'url must use https://' }] })
    const res = await callPost(makeRequest('POST', 'http://localhost/api/mcp/hub-sources', { id: 'bad', url: 'http://insecure.com' }))
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.errors).toHaveLength(1)
  })

  it('returns error on invalid JSON body', async () => {
    const req = new Request('http://localhost/api/mcp/hub-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{{',
    })
    const res = await callPost(req)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })
})

describe('PUT /api/mcp/hub-sources/:id', () => {
  it('returns 401 when not authenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false)
    const res = await callPut(makeRequest('PUT', 'http://localhost/api/mcp/hub-sources/corp', {}), 'corp')
    expect(res.status).toBe(401)
  })

  it('updates a source and returns updated list', async () => {
    mockUpdateHubSource.mockResolvedValue({ ok: true, sources: BUILTIN_SOURCES as never })
    const res = await callPut(
      makeRequest('PUT', 'http://localhost/api/mcp/hub-sources/corp', { name: 'New', url: 'https://new.example.com', trust: 'community', format: 'generic-json', enabled: true }),
      'corp',
    )
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('returns 404 for unknown id', async () => {
    mockUpdateHubSource.mockResolvedValue({ ok: false, errors: [{ path: 'id', message: 'source "nope" not found' }], status: 404 })
    const res = await callPut(makeRequest('PUT', 'http://localhost/api/mcp/hub-sources/nope', { name: 'X', url: 'https://x.com', trust: 'community', format: 'generic-json', enabled: true }), 'nope')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })

  it('returns ok:false + errors on validation failure', async () => {
    mockUpdateHubSource.mockResolvedValue({ ok: false, errors: [{ path: 'url', message: 'url must use https://' }] })
    const res = await callPut(makeRequest('PUT', 'http://localhost/api/mcp/hub-sources/corp', { url: 'http://insecure.com' }), 'corp')
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.errors).toBeDefined()
  })
})

describe('DELETE /api/mcp/hub-sources/:id', () => {
  it('returns 401 when not authenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false)
    const res = await callDelete(makeRequest('DELETE', 'http://localhost/api/mcp/hub-sources/corp'), 'corp')
    expect(res.status).toBe(401)
  })

  it('deletes a source and returns updated list', async () => {
    mockDeleteHubSource.mockResolvedValue({ ok: true, sources: BUILTIN_SOURCES as never })
    const res = await callDelete(makeRequest('DELETE', 'http://localhost/api/mcp/hub-sources/corp'), 'corp')
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('returns 404 for unknown id', async () => {
    mockDeleteHubSource.mockResolvedValue({ ok: false, errors: [{ path: 'id', message: 'source "nope" not found' }], status: 404 })
    const res = await callDelete(makeRequest('DELETE', 'http://localhost/api/mcp/hub-sources/nope'), 'nope')
    expect(res.status).toBe(404)
  })

  it('rejects deletion of built-in sources', async () => {
    mockDeleteHubSource.mockResolvedValue({ ok: false, errors: [{ path: 'id', message: '"mcp-get" is a built-in source and cannot be removed' }], status: 400 })
    const res = await callDelete(makeRequest('DELETE', 'http://localhost/api/mcp/hub-sources/mcp-get'), 'mcp-get')
    const body = await res.json()
    expect(body.ok).toBe(false)
  })
})
