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
