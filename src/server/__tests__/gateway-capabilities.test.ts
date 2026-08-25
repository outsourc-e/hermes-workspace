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
              authenticated: false,
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
              authenticated: false,
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

  describe('dashboard reachable vs authenticated split', () => {
    const routeFetch = (sessionsStatus: number) =>
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === 'http://dashboard.test/api/status') {
          return new Response(JSON.stringify({ version: '0.12.0' }), {
            headers: { 'content-type': 'application/json' },
          })
        }
        if (url === 'http://dashboard.test/') {
          // Cookie-gated dashboards serve the login shell — no inline token.
          return new Response('<html><body>login</body></html>', {
            headers: { 'content-type': 'text/html' },
          })
        }
        if (url.startsWith('http://dashboard.test/api/sessions')) {
          return new Response(
            JSON.stringify(
              sessionsStatus === 200
                ? { sessions: [], total: 0 }
                : {
                    error: 'unauthenticated',
                    detail: 'Unauthorized',
                    reason: 'no_cookie',
                    login_url: '/login',
                  },
            ),
            {
              status: sessionsStatus,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        if (url === 'http://gateway.test/v1/chat/completions')
          return new Response('', { status: 405 })
        if (url === 'http://gateway.test/api/sessions/__probe__/chat/stream')
          return new Response('', { status: 404 })
        if (url.endsWith('/api/mcp')) return new Response('', { status: 404 })
        if (url === 'http://dashboard.test/api/conductor/missions')
          return new Response('', { status: 404 })
        if (url === 'http://dashboard.test/api/plugins/kanban/board')
          return new Response('', { status: 404 })
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json' },
        })
      })

    it('classifies a cookie-gated dashboard as reachable but NOT authenticated, keeping sessions via the gateway', async () => {
      process.env.HERMES_API_URL = 'http://gateway.test'
      process.env.HERMES_DASHBOARD_URL = 'http://dashboard.test'
      vi.stubGlobal('fetch', routeFetch(401))

      const mod = await loadMod()
      const caps = await mod.probeGateway({ force: true })

      expect(caps.dashboard.available).toBe(true)
      expect(caps.dashboard.authenticated).toBe(false)
      // Gateway /api/sessions probe (generic 200 fallback) keeps the composite
      // capability alive without the dashboard.
      expect(caps.sessions).toBe(true)
    })

    it('marks the dashboard authenticated when the sessions probe succeeds', async () => {
      process.env.HERMES_API_URL = 'http://gateway.test'
      process.env.HERMES_DASHBOARD_URL = 'http://dashboard.test'
      vi.stubGlobal('fetch', routeFetch(200))

      const mod = await loadMod()
      const caps = await mod.probeGateway({ force: true })

      expect(caps.dashboard.available).toBe(true)
      expect(caps.dashboard.authenticated).toBe(true)
    })

    it('markDashboardUnauthenticated degrades a previously authenticated dashboard', async () => {
      process.env.HERMES_API_URL = 'http://gateway.test'
      process.env.HERMES_DASHBOARD_URL = 'http://dashboard.test'
      vi.stubGlobal('fetch', routeFetch(200))

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const mod = await loadMod()
      await mod.probeGateway({ force: true })
      expect(mod.getCapabilities().dashboard.authenticated).toBe(true)

      mod.markDashboardUnauthenticated()
      expect(mod.getCapabilities().dashboard.authenticated).toBe(false)
      expect(mod.getCapabilities().dashboard.available).toBe(true)
      warnSpy.mockRestore()
    })
  })

  describe('dashboard password-login (Option d)', () => {
    afterEach(() => {
      delete process.env.HERMES_USERNAME
      delete process.env.HERMES_PASSWORD
      delete process.env.HERMES_DASHBOARD_USERNAME
      delete process.env.HERMES_DASHBOARD_PASSWORD
    })

    const routeFetch = (opts: { loginStatus: number }) => {
      const calls = { login: 0 }
      const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === 'http://dashboard.test/api/status') {
          return new Response(JSON.stringify({ version: '0.18.0' }), {
            headers: { 'content-type': 'application/json' },
          })
        }
        if (url === 'http://dashboard.test/') {
          return new Response('<html>login form</html>', {
            headers: { 'content-type': 'text/html' },
          })
        }
        if (url === 'http://dashboard.test/auth/password-login') {
          calls.login++
          if (opts.loginStatus !== 200) {
            return new Response(JSON.stringify({ error: 'invalid' }), {
              status: opts.loginStatus,
              headers: { 'content-type': 'application/json' },
            })
          }
          return new Response(JSON.stringify({ next: '/' }), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'set-cookie': 'hermes_session_at=tok123; Path=/; HttpOnly',
            },
          })
        }
        if (url.startsWith('http://dashboard.test/api/sessions')) {
          const cookie = new Headers(init?.headers).get('cookie') || ''
          return cookie.includes('hermes_session_at')
            ? new Response(JSON.stringify({ sessions: [], total: 0 }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
              })
            : new Response(
                JSON.stringify({ error: 'unauthenticated', reason: 'no_cookie' }),
                { status: 401, headers: { 'content-type': 'application/json' } },
              )
        }
        if (url === 'http://gateway.test/v1/chat/completions')
          return new Response('', { status: 405 })
        if (url === 'http://gateway.test/api/sessions/__probe__/chat/stream')
          return new Response('', { status: 404 })
        if (url.endsWith('/api/mcp')) return new Response('', { status: 404 })
        if (url === 'http://dashboard.test/api/conductor/missions')
          return new Response('', { status: 404 })
        if (url === 'http://dashboard.test/api/plugins/kanban/board')
          return new Response('', { status: 404 })
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json' },
        })
      })
      return { fn, calls }
    }

    it('logs into the basic provider, reuses the cookie, and reports authenticated', async () => {
      process.env.HERMES_API_URL = 'http://gateway.test'
      process.env.HERMES_DASHBOARD_URL = 'http://dashboard.test'
      process.env.HERMES_DASHBOARD_USERNAME = 'admin'
      process.env.HERMES_DASHBOARD_PASSWORD = 'pw-123456789012345678'
      const { fn, calls } = routeFetch({ loginStatus: 200 })
      vi.stubGlobal('fetch', fn)

      const mod = await loadMod()
      const caps = await mod.probeGateway({ force: true })

      expect(caps.dashboard.available).toBe(true)
      expect(caps.dashboard.authenticated).toBe(true)
      expect(calls.login).toBeGreaterThanOrEqual(1)
      // POST body carries the documented contract
      const loginCall = fn.mock.calls.find(
        ([u]) => String(u) === 'http://dashboard.test/auth/password-login',
      )
      const body = JSON.parse(String((loginCall?.[1] as RequestInit)?.body))
      expect(body).toMatchObject({ provider: 'basic', username: 'admin' })
    })

    it('degrades to unauthenticated when login is rejected', async () => {
      process.env.HERMES_API_URL = 'http://gateway.test'
      process.env.HERMES_DASHBOARD_URL = 'http://dashboard.test'
      process.env.HERMES_DASHBOARD_PASSWORD = 'wrong-pw-000000000000'
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { fn } = routeFetch({ loginStatus: 401 })
      vi.stubGlobal('fetch', fn)

      const mod = await loadMod()
      const caps = await mod.probeGateway({ force: true })

      expect(caps.dashboard.available).toBe(true)
      expect(caps.dashboard.authenticated).toBe(false)
      warn.mockRestore()
    })

    it('dashboardLogin returns empty when no password is configured', async () => {
      process.env.HERMES_DASHBOARD_URL = 'http://dashboard.test'
      vi.stubGlobal('fetch', vi.fn())
      const mod = await loadMod()
      await expect(mod.dashboardLogin()).resolves.toBe('')
    })
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
