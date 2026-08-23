import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (opts: any) => opts,
}))

vi.mock('../../../server/auth-middleware', () => ({
  isAuthenticated: () => true,
}))

vi.mock('../../../server/gateway-capabilities', () => ({
  BEARER_TOKEN: 'test-bearer',
  CLAUDE_API: 'http://upstream.local',
}))

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetModules()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('proxyRequest header hygiene (piège P6ter)', () => {
  it('never lets an upstream response inject X-Hermes-Auth through the proxy', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'invalid x-api-key' } }), {
        status: 401,
        headers: {
          'content-type': 'application/json',
          // An upstream backend cannot forge the workspace auth marker —
          // proxyRequest() must not propagate arbitrary upstream headers.
          'X-Hermes-Auth': 'required',
        },
      }),
    )

    const mod = await import('./$')
    const res = await mod.Route.server.handlers.GET({
      request: new Request('http://localhost/api/claude-proxy/v1/messages'),
      params: { _splat: 'v1/messages' },
    })

    expect(res.status).toBe(401)
    expect(res.headers.get('X-Hermes-Auth')).toBeNull()
    expect(res.headers.get('content-type')).toBe('application/json')
  })
})
