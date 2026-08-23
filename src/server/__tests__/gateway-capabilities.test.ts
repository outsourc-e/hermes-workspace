import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { existsSync, readFileSync, writeFileSync, mkdirSync } = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
  writeFileSync: vi.fn().mockImplementation(() => {}),
  mkdirSync: vi.fn().mockImplementation(() => {}),
}))

vi.mock('node:fs', () => ({
  default: { existsSync, readFileSync, writeFileSync, mkdirSync },
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
}))

const { homedir } = vi.hoisted(() => ({
  homedir: vi.fn().mockReturnValue('/home/testuser'),
}))

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}))

vi.mock('node:os', () => ({
  default: { homedir },
  homedir,
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  delete process.env.CLAUDE_HOME
  delete process.env.HERMES_HOME
  delete process.env.CLAUDE_API_URL
  delete process.env.HERMES_API_URL
  delete process.env.CLAUDE_DASHBOARD_URL
  delete process.env.HERMES_DASHBOARD_URL
  delete process.env.HERMES_DASHBOARD_TOKEN
  delete process.env.CLAUDE_DASHBOARD_TOKEN
  delete process.env.HERMES_DASHBOARD_BASIC_AUTH_USERNAME
  delete process.env.HERMES_DASHBOARD_BASIC_AUTH_PASSWORD
  delete process.env.HOST
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function loadMod() {
  vi.resetModules()
  return import('../gateway-capabilities')
}

describe('gateway-capabilities', () => {
  it('default port is 8642', async () => {
    const mod = await loadMod()
    expect(mod.CLAUDE_API).toBe('http://127.0.0.1:8642')
  })

  describe('capability warnings', () => {
    it('tells users to start the dashboard when only dashboard-backed APIs are missing', async () => {
      const mod = await loadMod()
      expect(
        mod.getCapabilityWarningMessage(
          {
            health: true,
            chatCompletions: true,
            models: true,
            streaming: true,
            probed: true,
            sessions: false,
            enhancedChat: false,
            skills: false,
            memory: true,
            config: false,
            jobs: true,
            mcp: false,
            mcpFallback: false,
            conductor: false,
            kanban: false,
            dashboard: {
              available: false,
              url: 'http://127.0.0.1:9119',
            },
          },
          ['sessions', 'skills', 'config'],
        ),
      ).toBe(`[gateway] ${mod.DASHBOARD_REQUIRED_INSTRUCTIONS}`)
    })

    it('keeps the upgrade warning for broader capability gaps', async () => {
      const mod = await loadMod()
      expect(
        mod.getCapabilityWarningMessage(
          {
            health: true,
            chatCompletions: false,
            models: true,
            streaming: false,
            probed: true,
            sessions: false,
            enhancedChat: false,
            skills: false,
            memory: true,
            config: false,
            jobs: false,
            mcp: false,
            mcpFallback: false,
            conductor: false,
            kanban: false,
            dashboard: {
              available: false,
              url: 'http://127.0.0.1:9119',
            },
          },
          ['health', 'sessions'],
        ),
      ).toBe(`[gateway] Missing Hermes APIs detected. ${mod.CLAUDE_UPGRADE_INSTRUCTIONS}`)
    })
  })

  it('setGatewayUrl fallback uses 8642 when env override is cleared', async () => {
    const mod = await loadMod()
    mod.setGatewayUrl('http://tailscale:9999')
    expect(mod.CLAUDE_API).toBe('http://tailscale:9999')

    const fallback = mod.setGatewayUrl(null as any)
    expect(fallback).toBe('http://127.0.0.1:8642')
    expect(mod.CLAUDE_API).toBe('http://127.0.0.1:8642')
  })

  it('respects CLAUDE_API_URL env when no override', async () => {
    process.env.CLAUDE_API_URL = 'http://localhost:9000'
    const mod = await loadMod()
    expect(mod.CLAUDE_API).toBe('http://localhost:9000')
  })

  it('does not let dashboard auto-detect override an explicit HERMES_DASHBOARD_URL', async () => {
    // Regression: autoDetectDashboardUrl() only skipped discovery when
    // CLAUDE_DASHBOARD_URL was set, ignoring the documented primary var
    // HERMES_DASHBOARD_URL. With a co-located dashboard answering on the
    // hard-coded :9119 candidate, the probe overwrote the operator's explicit
    // URL — in multi-user setups attaching to another user's dashboard and
    // leaking their session list. The explicit URL must always win.
    process.env.HERMES_DASHBOARD_URL = 'http://127.0.0.1:9120'
    // A default-port dashboard is up and would answer the auto-detect probe.
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'http://127.0.0.1:9119/api/status') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      return new Response(null, { status: 404 })
    })
    const mod = await loadMod()
    await mod.probeGateway({ force: true })
    // The :9119 auto-detect probe must never have run, and the explicit
    // :9120 URL must be preserved.
    expect(
      fetchMock.mock.calls.some(
        ([u]) => u === 'http://127.0.0.1:9119/api/status',
      ),
    ).toBe(false)
    expect(mod.CLAUDE_DASHBOARD_URL).toBe('http://127.0.0.1:9120')
  })

  it('getResolvedUrls reports default source when no env or file override', async () => {
    const mod = await loadMod()
    const resolved = mod.getResolvedUrls()
    expect(resolved.gateway).toBe('http://127.0.0.1:8642')
    expect(resolved.source).toBe('default')
  })

  describe('dashboard session token scraping', () => {
    it('scrapes the inline dashboard session token from root HTML', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '<html><head><script>window.__HERMES_SESSION_TOKEN__="fresh-token";</script></head></html>',
      })

      const mod = await loadMod()
      await expect(mod.fetchDashboardToken()).resolves.toBe('fresh-token')
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:9119/',
        expect.objectContaining({ signal: expect.anything() }),
      )
    })

    it('ignores copied dashboard token env vars and scrapes the current token instead', async () => {
      process.env.HERMES_DASHBOARD_TOKEN = 'stale-token'
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '<html><head><script>window.__HERMES_SESSION_TOKEN__="live-token";</script></head></html>',
      })

      const mod = await loadMod()
      await expect(mod.fetchDashboardToken()).resolves.toBe('live-token')
      expect(fetchMock.mock.calls.some(([url]) => url === 'http://127.0.0.1:9119/')).toBe(true)
    })

    it('returns an empty token instead of throwing when dashboard root fails', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      })

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const mod = await loadMod()

      await expect(mod.fetchDashboardToken()).resolves.toBe('')
      expect(warnSpy).toHaveBeenCalledWith(
        '[gateway] Dashboard index returned 500 — token unavailable',
      )
      warnSpy.mockRestore()
    })
  })

  describe('dashboard login-form auth (basic-auth gated dashboards)', () => {
    // The Agent's "basic auth" dashboard gate is actually a cookie-session
    // login form (POST /auth/password-login), not RFC 7617 HTTP Basic — see
    // hermes-claude-integration-summary.md in the vault for the live repro
    // that found this. These tests cover the login-and-cache path added to
    // dashboardFetch/dashboardAuthHeaders for that case.

    function loginResponse(cookies: Array<string>) {
      return {
        ok: true,
        status: 200,
        headers: { getSetCookie: () => cookies },
        json: async () => ({ ok: true, next: '/' }),
      }
    }

    it('logs in and reuses the session cookie for dashboard requests', async () => {
      process.env.HERMES_DASHBOARD_BASIC_AUTH_USERNAME = 'admin'
      process.env.HERMES_DASHBOARD_BASIC_AUTH_PASSWORD = 'secret'

      fetchMock.mockImplementation(async (url: string) => {
        if (url === 'http://127.0.0.1:9119/auth/password-login') {
          return loginResponse(['hermes_session_at=abc; HttpOnly; Path=/', 'hermes_session_provider=basic; HttpOnly; Path=/'])
        }
        return { ok: true, status: 200, json: async () => ({ sessions: [] }) }
      })

      const mod = await loadMod()
      // The module's own background auto-probe (`void ensureGatewayProbed()`
      // at the bottom of gateway-capabilities.ts, fired on import) runs
      // independently of the calls under test and, once credentials are
      // configured, legitimately exercises this same login path itself.
      // Let it settle and clear the call log before asserting, so these
      // assertions only see the two dashboardFetch calls being tested.
      await mod.ensureGatewayProbed()
      fetchMock.mockClear()

      const r1 = await mod.dashboardFetch('/api/sessions')
      const r2 = await mod.dashboardFetch('/api/sessions')

      expect(r1.status).toBe(200)
      expect(r2.status).toBe(200)
      // The probe above already logged in and cached a session cookie —
      // neither call here should need to log in again.
      expect(
        fetchMock.mock.calls.some(([u]) => u === 'http://127.0.0.1:9119/auth/password-login'),
      ).toBe(false)

      const sessionCalls = fetchMock.mock.calls.filter(([u]) => u === 'http://127.0.0.1:9119/api/sessions')
      expect(sessionCalls).toHaveLength(2)
      for (const [, init] of sessionCalls) {
        const headers = init.headers as Headers
        expect(headers.get('Cookie')).toBe('hermes_session_at=abc; hermes_session_provider=basic')
      }
    })

    it('sends the configured credentials in the login POST body', async () => {
      process.env.HERMES_DASHBOARD_BASIC_AUTH_USERNAME = 'admin'
      process.env.HERMES_DASHBOARD_BASIC_AUTH_PASSWORD = 'secret'

      fetchMock.mockImplementation(async (url: string) => {
        if (url === 'http://127.0.0.1:9119/auth/password-login') {
          return loginResponse(['hermes_session_at=abc; Path=/'])
        }
        return { ok: true, status: 200, json: async () => ({}) }
      })

      const mod = await loadMod()
      await mod.ensureGatewayProbed()

      const loginCalls = fetchMock.mock.calls.filter(
        ([u]) => u === 'http://127.0.0.1:9119/auth/password-login',
      )
      expect(loginCalls.length).toBeGreaterThan(0)
      const body = JSON.parse(loginCalls[0][1].body)
      expect(body).toEqual({ provider: 'basic', username: 'admin', password: 'secret', next: '' })
    })

    it('re-logs in after a 401 (expired/rotated session)', async () => {
      process.env.HERMES_DASHBOARD_BASIC_AUTH_USERNAME = 'admin'
      process.env.HERMES_DASHBOARD_BASIC_AUTH_PASSWORD = 'secret'

      let loginCount = 0
      let sessionCallCount = 0
      fetchMock.mockImplementation(async (url: string) => {
        if (url === 'http://127.0.0.1:9119/auth/password-login') {
          loginCount++
          return loginResponse([`hermes_session_at=token-${loginCount}; Path=/`])
        }
        if (url === 'http://127.0.0.1:9119/api/sessions') {
          sessionCallCount++
          // First attempt: stale/expired cookie rejected. Second: fresh login succeeds.
          return sessionCallCount === 1
            ? { ok: false, status: 401, json: async () => ({ ok: false }) }
            : { ok: true, status: 200, json: async () => ({ sessions: [] }) }
        }
        return { ok: true, status: 200, json: async () => ({}) }
      })

      const mod = await loadMod()
      // Settle the background auto-probe first (see comment above) so the
      // cache starts warm, simulating "this cookie is already stale" —
      // which is exactly the scenario this test exercises.
      await mod.ensureGatewayProbed()
      fetchMock.mockClear()
      sessionCallCount = 0

      const res = await mod.dashboardFetch('/api/sessions')

      expect(res.status).toBe(200)
      expect(sessionCallCount).toBe(2)
      const loginCallsAfterRetry = fetchMock.mock.calls.filter(
        ([u]) => u === 'http://127.0.0.1:9119/auth/password-login',
      )
      expect(loginCallsAfterRetry).toHaveLength(1)
    })

    it('does not attempt a login POST when credentials are not configured', async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url === 'http://127.0.0.1:9119/') {
          return { ok: true, status: 200, text: async () => '<html></html>' }
        }
        return { ok: true, status: 200, json: async () => ({ sessions: [] }) }
      })

      const mod = await loadMod()
      await mod.dashboardFetch('/api/sessions')

      expect(
        fetchMock.mock.calls.some(([u]) => u === 'http://127.0.0.1:9119/auth/password-login'),
      ).toBe(false)
    })
  })

  it('does not mark Conductor available when dashboard returns SPA HTML fallback', async () => {
    process.env.HERMES_API_URL = 'http://gateway.test'
    process.env.CLAUDE_DASHBOARD_URL = 'http://dashboard.test'
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'http://dashboard.test/api/status') {
        return new Response(JSON.stringify({ version: '0.12.0' }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url === 'http://dashboard.test/') {
        return new Response("<script>window.__CLAUDE_SESSION_TOKEN__ = 'test-token'</script>", {
          headers: { 'content-type': 'text/html' },
        })
      }
      if (url === 'http://dashboard.test/api/conductor/missions') {
        return new Response('<!doctype html><div id="root"></div>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }
      if (url === 'http://dashboard.test/api/plugins/kanban/board') {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url === 'http://dashboard.test/api/mcp') {
        return new Response('not found', { status: 404 })
      }
      if (url === 'http://dashboard.test/api/config') {
        return new Response(JSON.stringify({ config: { mcp_servers: {} } }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url === 'http://gateway.test/v1/chat/completions') {
        return new Response('', { status: 405 })
      }
      if (url === 'http://gateway.test/api/sessions/__probe__/chat/stream') {
        return new Response('', { status: 404 })
      }
      if (url === 'http://gateway.test/api/mcp') {
        return new Response('', { status: 404 })
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const mod = await loadMod()
    const caps = await mod.probeGateway({ force: true })

    expect(caps.dashboard.available).toBe(true)
    expect(caps.conductor).toBe(false)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://dashboard.test/api/conductor/missions',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('marks Conductor available when dashboard returns JSON from missions API', async () => {
    process.env.HERMES_API_URL = 'http://gateway.test'
    process.env.CLAUDE_DASHBOARD_URL = 'http://dashboard.test'
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'http://dashboard.test/api/status') {
        return new Response(JSON.stringify({ version: '0.12.0' }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url === 'http://dashboard.test/') {
        return new Response("<script>window.__CLAUDE_SESSION_TOKEN__ = 'test-token'</script>", {
          headers: { 'content-type': 'text/html' },
        })
      }
      if (url === 'http://dashboard.test/api/conductor/missions') {
        return new Response(JSON.stringify({ missions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url === 'http://dashboard.test/api/config') {
        return new Response(JSON.stringify({ config: { mcp_servers: {} } }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url === 'http://gateway.test/v1/chat/completions') return new Response('', { status: 405 })
      if (url === 'http://gateway.test/api/sessions/__probe__/chat/stream') return new Response('', { status: 404 })
      if (url.endsWith('/api/mcp')) return new Response('', { status: 404 })
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      })
    }))

    const mod = await loadMod()
    const caps = await mod.probeGateway({ force: true })

    expect(caps.conductor).toBe(true)
  })

  describe('isLocalhostDeployment', () => {
    afterEach(() => {
      delete process.env.HOST
    })

    it('returns true for default loopback URLs with no HOST', async () => {
      const mod = await loadMod()
      expect(mod.isLocalhostDeployment()).toBe(true)
    })

    it('returns false when HOST is bound to 0.0.0.0', async () => {
      process.env.HOST = '0.0.0.0'
      const mod = await loadMod()
      expect(mod.isLocalhostDeployment()).toBe(false)
    })

    it('returns true when HOST is loopback', async () => {
      process.env.HOST = '127.0.0.1'
      const mod = await loadMod()
      expect(mod.isLocalhostDeployment()).toBe(true)
    })

    it('returns false when gateway URL is rewritten to a non-loopback host', async () => {
      const mod = await loadMod()
      // Use the runtime setter to bypass env-var loading paths that the
      // pre-existing CLAUDE_API_URL test (above) shows are not reliable in
      // vitest's resetModules cycle.
      mod.setGatewayUrl('http://10.0.0.5:8642')
      try {
        expect(mod.isLocalhostDeployment()).toBe(false)
      } finally {
        mod.setGatewayUrl(null as never)
      }
    })
  })
})
