import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requireJsonContentType } from '../../server/rate-limit'
import {
  maskSecretsInPlace,
  normalizeMcpServer,
  payloadContainsString,
} from '../../server/mcp-normalize'
import { parseMcpServerInput, toConfigEntry, unavailableListPayload } from './mcp'

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseMcpServerInput (POST validation)', () => {
  it('rejects payloads without a name', () => {
    expect(parseMcpServerInput({}).ok).toBe(false)
    expect(parseMcpServerInput({ name: '   ' }).ok).toBe(false)
    expect(parseMcpServerInput(null).ok).toBe(false)
  })

  it('preserves http transport with url + bearer secret on the input', () => {
    const result = parseMcpServerInput({
      name: 'linear',
      transportType: 'http',
      url: 'https://mcp.linear.app/sse',
      authType: 'bearer',
      bearerToken: 'sk-INPUT-SENTINEL',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.transportType).toBe('http')
    expect(result.value.bearerToken).toBe('sk-INPUT-SENTINEL')
  })

  it('coerces stdio transport with args + env strings', () => {
    const result = parseMcpServerInput({
      name: 'fs',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      env: { ROOT: '/tmp', NUMERIC: 42 },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.transportType).toBe('stdio')
    expect(result.value.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem'])
    expect(result.value.env).toEqual({ ROOT: '/tmp', NUMERIC: '42' })
  })
})

describe('unavailableListPayload (capability fall-open)', () => {
  it('matches the createCapabilityUnavailablePayload shape with empty list', () => {
    const payload = unavailableListPayload()
    expect(payload).toMatchObject({
      ok: false,
      code: 'capability_unavailable',
      capability: 'mcp',
      servers: [],
      total: 0,
    })
    expect(payload.categories).toContain('All')
  })
})

describe('CSRF gate (requireJsonContentType)', () => {
  it('rejects POST without application/json Content-Type', () => {
    const req = new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'name=evil',
    })
    const res = requireJsonContentType(req)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(415)
  })

  it('passes POST with application/json', () => {
    const req = new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(requireJsonContentType(req)).toBeNull()
  })

  it('passes GET regardless of Content-Type', () => {
    const req = new Request('http://localhost/api/mcp', { method: 'GET' })
    expect(requireJsonContentType(req)).toBeNull()
  })
})

describe('Phase 1.5 fallback — toConfigEntry mapping', () => {
  it('maps stdio input → config-yaml entry with command/args/env', () => {
    const entry = toConfigEntry({
      name: 'fs',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', 'fs-mcp'],
      env: { ROOT: '/tmp' },
    })
    expect(entry).toEqual({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'fs-mcp'],
      env: { ROOT: '/tmp' },
    })
  })

  it('maps http input → entry with url + nested auth.token', () => {
    const entry = toConfigEntry({
      name: 'linear',
      transportType: 'http',
      url: 'https://mcp.linear.app/sse',
      authType: 'bearer',
      bearerToken: 'sk-WRITE-PATH',
    })
    expect(entry).toMatchObject({
      transport: 'http',
      url: 'https://mcp.linear.app/sse',
      auth: { type: 'bearer', token: 'sk-WRITE-PATH' },
    })
  })

  it('omits empty arrays, default tool_mode, none auth', () => {
    const entry = toConfigEntry({
      name: 'bare',
      transportType: 'stdio',
      args: [],
      includeTools: [],
      excludeTools: [],
      toolMode: 'all',
      authType: 'none',
    })
    expect(entry).toEqual({ transport: 'stdio' })
  })
})

describe('Phase 1.5 fallback — capability gating shape', () => {
  it('unavailableListPayload preserves the legacy off-state contract', () => {
    const payload = unavailableListPayload()
    // Workspace contract: when neither mcp nor mcpFallback is true, GET /api/mcp
    // returns this structured payload (status 200) so the UI renders an empty
    // installed list + the upgrade banner instead of erroring.
    expect(payload).toMatchObject({
      ok: false,
      code: 'capability_unavailable',
      capability: 'mcp',
      servers: [],
      total: 0,
    })
  })

  it('mcpFallback mode returns a different shape (server list, not capability_unavailable)', async () => {
    // Mock the gateway-capabilities module to advertise fallback mode + the
    // dashboard-config response. The route handler should walk
    // `config.mcp_servers` through normalizeMcpListFromConfig and emit a
    // populated `servers` array — the OPPOSITE of the capability_unavailable
    // shape — proving the fallback transport is wired end-to-end.
    const fakeCaps = {
      mcp: false,
      mcpFallback: true,
      dashboard: { available: true, url: 'http://127.0.0.1:9119' },
    }
    vi.doMock('../../server/gateway-capabilities', () => ({
      ensureGatewayProbed: () => Promise.resolve(fakeCaps),
      getCapabilities: () => fakeCaps,
      BEARER_TOKEN: '',
      CLAUDE_API: 'http://127.0.0.1:8642',
      CLAUDE_UPGRADE_INSTRUCTIONS: 'noop',
      dashboardFetch: () => Promise.resolve(new Response(null, { status: 404 })),
    }))
    vi.doMock('../../server/auth-middleware', () => ({
      isAuthenticated: () => true,
    }))
    vi.doMock('../../server/claude-dashboard-api', () => ({
      getConfig: () =>
        Promise.resolve({
          mcp_servers: {
            fs: { transport: 'stdio', command: 'npx', args: ['fs-mcp'] },
          },
        }),
      saveConfig: () => Promise.resolve({ ok: true }),
    }))
    vi.doMock('@tanstack/react-router', () => ({
      createFileRoute: () => (cfg: unknown) => cfg,
    }))

    const mod = await import('./mcp')
    const route = mod.Route as unknown as {
      server: { handlers: { GET: (ctx: { request: Request }) => Promise<Response> } }
    }
    const res = await route.server.handlers.GET({
      request: new Request('http://localhost/api/mcp'),
    })
    const body = (await res.json()) as {
      servers?: Array<{ name: string }>
      total?: number
      code?: string
    }
    expect(body.code).toBeUndefined()
    expect(body.servers).toEqual([expect.objectContaining({ name: 'fs' })])
    expect(body.total).toBe(1)
  })
})

describe('secret echo guard (PR4 acceptance contract)', () => {
  it('round-trip server payload never echoes the submitted bearerToken', () => {
    // 1. User submits an input with a bearer token.
    const parsed = parseMcpServerInput({
      name: 'linear',
      transportType: 'http',
      url: 'https://mcp.linear.app/sse',
      authType: 'bearer',
      bearerToken: 'sk-DO-NOT-LEAK-2026',
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) throw new Error('expected ok')
    const input = parsed.value
    expect(input.bearerToken).toBe('sk-DO-NOT-LEAK-2026')

    // 2. Agent stores it and returns its read shape (with secret presence flag,
    //    NOT the raw secret). We simulate that and run it through the pipeline
    //    the route uses before json(...).
    const agentEcho = {
      name: input.name,
      transportType: input.transportType,
      url: input.url,
      authType: input.authType,
      hasBearerToken: true,
      // Worst case: agent erroneously echoes secret. Normalizer must strip it.
      bearerToken: input.bearerToken,
      env: { LEAK: input.bearerToken },
      headers: { Authorization: `Bearer ${input.bearerToken}` },
    }
    const normalized = normalizeMcpServer(agentEcho)
    expect(normalized).not.toBeNull()
    maskSecretsInPlace(normalized!)

    // 3. The string the user submitted must NOT appear anywhere in the
    //    response object the workspace returns to the browser.
    expect(payloadContainsString(normalized, 'sk-DO-NOT-LEAK-2026')).toBe(false)
    expect(normalized!.hasBearerToken).toBe(true)
  })
})
