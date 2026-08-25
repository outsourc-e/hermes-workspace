/**
 * Session routing + shape normalization tests.
 *
 * Covers the remote-deployment failure mode where the dashboard is reachable
 * (/api/status is public) but its session APIs are cookie-gated and return
 * 401 {"error":"unauthenticated","reason":"no_cookie"}: the workspace must
 * fall back to the gateway instead of surfacing the 401 in the Sessions tab,
 * and list-returning adapters must never return undefined (callers .map).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const GATEWAY = 'http://gateway.test:8642'
const DASHBOARD = 'http://dashboard.test:9119'

const { state, dashboardFetchMock, markMock } = vi.hoisted(() => {
  const state = {
    dashboard: { available: false, authenticated: false, url: 'http://dashboard.test:9119' },
  }
  return {
    state,
    dashboardFetchMock: vi.fn(),
    markMock: vi.fn(() => {
      state.dashboard.authenticated = false
    }),
  }
})

vi.mock('../gateway-capabilities', () => ({
  BEARER_TOKEN: '',
  CLAUDE_API: 'http://gateway.test:8642',
  CLAUDE_DASHBOARD_URL: 'http://dashboard.test:9119',
  SESSIONS_API_UNAVAILABLE_MESSAGE: 'sessions unavailable',
  dashboardFetch: dashboardFetchMock,
  ensureGatewayProbed: vi.fn(),
  probeGateway: vi.fn(),
  getCapabilities: () => ({ dashboard: state.dashboard }),
  markDashboardUnauthenticated: markMock,
}))

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const NO_COOKIE_BODY = {
  error: 'unauthenticated',
  detail: 'Unauthorized',
  reason: 'no_cookie',
  login_url: '/login',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  state.dashboard.available = false
  state.dashboard.authenticated = false
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function importClaudeApi() {
  return import('../claude-api')
}

describe('listSessions routing', () => {
  it('uses the gateway when the dashboard is reachable but not authenticated', async () => {
    state.dashboard.available = true
    state.dashboard.authenticated = false
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ object: 'list', data: [{ id: 's1' }], has_more: false }),
    )

    const { listSessions } = await importClaudeApi()
    const sessions = await listSessions(3, 0)

    expect(sessions).toEqual([{ id: 's1' }])
    expect(dashboardFetchMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      `${GATEWAY}/api/sessions?limit=3&offset=0`,
      expect.anything(),
    )
  })

  it('falls back to the gateway when a dashboard call 401s mid-flight, and degrades the capability', async () => {
    state.dashboard.available = true
    state.dashboard.authenticated = true
    dashboardFetchMock.mockResolvedValueOnce(jsonResponse(NO_COOKIE_BODY, 401))
    // A fresh Response per call — this test invokes listSessions() twice, and a
    // Response body can only be read once.
    fetchMock.mockImplementation(async () =>
      jsonResponse({ object: 'list', data: [{ id: 's1' }] }),
    )

    const { listSessions } = await importClaudeApi()
    const sessions = await listSessions()

    expect(sessions).toEqual([{ id: 's1' }])
    expect(markMock).toHaveBeenCalledTimes(1)

    // Second call: capability degraded — dashboard must be skipped entirely.
    dashboardFetchMock.mockClear()
    await listSessions()
    expect(dashboardFetchMock).not.toHaveBeenCalled()
  })

  it('uses the dashboard when authenticated and normalizes {sessions:[...]}', async () => {
    state.dashboard.available = true
    state.dashboard.authenticated = true
    dashboardFetchMock.mockResolvedValueOnce(
      jsonResponse({ sessions: [{ id: 'd1' }], total: 1, limit: 50, offset: 0 }),
    )

    const { listSessions } = await importClaudeApi()
    expect(await listSessions()).toEqual([{ id: 'd1' }])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rethrows non-auth dashboard errors instead of silently falling back', async () => {
    state.dashboard.available = true
    state.dashboard.authenticated = true
    dashboardFetchMock.mockResolvedValueOnce(
      new Response('boom', { status: 500 }),
    )

    const { listSessions } = await importClaudeApi()
    await expect(listSessions()).rejects.toThrow(/500/)
    expect(markMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('response shape normalization (never undefined)', () => {
  it('accepts the OpenAI-compat gateway shape {object:"list", data:[...]}', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ object: 'list', data: [{ id: 'a' }, { id: 'b' }] }),
    )
    const { listSessions } = await importClaudeApi()
    expect(await listSessions()).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  it('accepts the older gateway shape {items:[...]}', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [{ id: 'a' }] }))
    const { listSessions } = await importClaudeApi()
    expect(await listSessions()).toEqual([{ id: 'a' }])
  })

  it.each([
    ['empty object', {}],
    ['null body', null],
    ['null list key', { sessions: null, items: null, data: null }],
    ['non-array list key', { data: 'not-an-array' }],
  ])('returns [] for %s from the gateway', async (_label, body) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(body))
    const { listSessions } = await importClaudeApi()
    const result = await listSessions()
    expect(result).toEqual([])
    expect(Array.isArray(result)).toBe(true)
  })

  it('getMessages accepts data/items/messages shapes and never returns undefined', async () => {
    const { getMessages } = await importClaudeApi()

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ object: 'list', data: [{ id: 1, role: 'user' }] }),
    )
    expect(await getMessages('s1')).toEqual([{ id: 1, role: 'user' }])

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ messages: [{ id: 2, role: 'assistant' }] }),
    )
    expect(await getMessages('s1')).toEqual([{ id: 2, role: 'assistant' }])

    fetchMock.mockResolvedValueOnce(jsonResponse({}))
    expect(await getMessages('s1')).toEqual([])
  })

  it('searchSessions always returns a results array', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ query: 'q', count: 0 }))
    const { searchSessions } = await importClaudeApi()
    const resp = await searchSessions('q')
    expect(resp.results).toEqual([])
  })
})
