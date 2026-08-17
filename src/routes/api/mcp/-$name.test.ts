import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DELETE /api/mcp/$name — hits the real Agent endpoint (/api/mcp/servers/{name})', () => {
  // Regression: this handler called `/api/mcp/${name}` (bare, no /servers
  // prefix), which doesn't exist on Hermes-Agent. Confirmed live: DELETE on
  // that bare path returns 405 "Method Not Allowed" (some other route
  // pattern happens to match it), while the real endpoint
  // `/api/mcp/servers/{name}` correctly returns 404 "Server 'x' not found"
  // for a missing server — verified with a real create+delete round trip.
  it('calls dashboardFetch with /api/mcp/servers/{name}, not /api/mcp/{name}', async () => {
    const dashboardFetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    )
    const fakeCaps = {
      mcp: true,
      mcpFallback: false,
      dashboard: { available: true, url: 'http://127.0.0.1:9119' },
    }
    vi.doMock('../../../server/gateway-capabilities', () => ({
      ensureGatewayProbed: () => Promise.resolve(fakeCaps),
      getCapabilities: () => fakeCaps,
      BEARER_TOKEN: '',
      CLAUDE_API: 'http://127.0.0.1:8642',
      CLAUDE_UPGRADE_INSTRUCTIONS: 'noop',
      dashboardFetch: dashboardFetchMock,
    }))
    vi.doMock('../../../server/auth-middleware', () => ({
      isAuthenticated: () => true,
    }))
    vi.doMock('@tanstack/react-router', () => ({
      createFileRoute: () => (cfg: unknown) => cfg,
    }))

    const mod = await import('./$name')
    const route = mod.Route as unknown as {
      server: {
        handlers: {
          DELETE: (ctx: {
            request: Request
            params: { name: string }
          }) => Promise<Response>
        }
      }
    }
    await route.server.handlers.DELETE({
      request: new Request('http://localhost/api/mcp/linear', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      }),
      params: { name: 'linear' },
    })

    expect(dashboardFetchMock).toHaveBeenCalledWith(
      '/api/mcp/servers/linear',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(dashboardFetchMock).not.toHaveBeenCalledWith(
      '/api/mcp/linear',
      expect.anything(),
    )
  })
})
