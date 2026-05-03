import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isAuthenticated } from '../../server/auth-middleware'
import { ensureGatewayProbed } from '../../server/gateway-capabilities'
import { Route } from './mcp/$name.logs'

// Vitest module-level mocks for the SSE logs route. These let us synthesize
// the auth, capability, and dashboardFetch dependencies without spinning up a
// real gateway.
vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))
vi.mock('../../server/gateway-capabilities', () => ({
  CLAUDE_UPGRADE_INSTRUCTIONS: 'Upgrade your Claude agent.',
  dashboardFetch: vi.fn(),
  ensureGatewayProbed: vi.fn(),
}))

type RouteWithHandlers = typeof Route & {
  options: {
    server: {
      handlers: {
        GET: (ctx: {
          request: Request
          params: { name?: string }
        }) => Promise<Response>
      }
    }
  }
}

const handler = (Route as RouteWithHandlers).options.server.handlers.GET

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/mcp/$name/logs', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)
    const req = new Request('http://localhost/api/mcp/github/logs')
    const res = await handler({ request: req, params: { name: 'github' } })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
  })

  it('returns 400 when name is missing/blank', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    const req = new Request('http://localhost/api/mcp//logs')
    const res = await handler({ request: req, params: { name: '   ' } })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/name/i)
  })

  it('returns 503 with capability_unavailable payload when gateway lacks mcp', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    vi.mocked(ensureGatewayProbed).mockResolvedValue({
      mcp: false,
    } as Awaited<ReturnType<typeof ensureGatewayProbed>>)
    const req = new Request('http://localhost/api/mcp/github/logs')
    const res = await handler({ request: req, params: { name: 'github' } })
    expect(res.status).toBe(503)
    const body = (await res.json()) as {
      ok: boolean
      code: string
      capability: string
    }
    expect(body.ok).toBe(false)
    expect(body.code).toBe('capability_unavailable')
    expect(body.capability).toBe('mcp')
  })
})
