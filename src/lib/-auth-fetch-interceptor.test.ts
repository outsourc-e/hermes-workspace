/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  classifyAuthResponse,
  installAuthFetchInterceptor,
} from './auth-fetch-interceptor'

type FakeResponseInit = {
  status?: number
  redirected?: boolean
  url?: string
  contentType?: string
  headers?: Record<string, string>
  body?: string
}

function fakeResponse(init: FakeResponseInit = {}): Response {
  const status = init.status ?? 200
  const headers = new Headers(init.headers ?? {})
  if (init.contentType) headers.set('content-type', init.contentType)
  return {
    ok: status >= 200 && status < 300,
    status,
    redirected: init.redirected ?? false,
    url: init.url ?? 'http://localhost/api/foo',
    headers,
    text: async () => init.body ?? '',
    json: async () => JSON.parse(init.body ?? '{}'),
  } as Response
}

describe('classifyAuthResponse', () => {
  it('classifies a marked 401 on /api/foo as session-expired', () => {
    const res = fakeResponse({ status: 401, headers: { 'X-Hermes-Auth': 'required' } })
    expect(classifyAuthResponse('/api/foo', res)).toBe('session-expired')
  })

  it('ignores 401s on the auth endpoints themselves', () => {
    expect(classifyAuthResponse('/api/auth', fakeResponse({ status: 401 }))).toBe('ignore')
    expect(classifyAuthResponse('/api/auth/refresh', fakeResponse({ status: 401 }))).toBe(
      'ignore',
    )
    expect(classifyAuthResponse('/api/auth-check', fakeResponse({ status: 401 }))).toBe(
      'ignore',
    )
  })

  it('ignores a bare 400 but treats a marked 400 as session-expired', () => {
    expect(classifyAuthResponse('/api/foo', fakeResponse({ status: 400 }))).toBe('ignore')
    expect(
      classifyAuthResponse(
        '/api/foo',
        fakeResponse({ status: 400, headers: { 'X-Hermes-Auth': 'required' } }),
      ),
    ).toBe('session-expired')
  })

  it('ignores a bare 403 but treats a marked 403 as session-expired', () => {
    expect(classifyAuthResponse('/api/foo', fakeResponse({ status: 403 }))).toBe('ignore')
    expect(
      classifyAuthResponse(
        '/api/foo',
        fakeResponse({ status: 403, headers: { 'X-Hermes-Auth': 'required' } }),
      ),
    ).toBe('session-expired')
  })

  it('ignores cross-origin and non-/api/ paths', () => {
    expect(
      classifyAuthResponse('https://autre-domaine.example/x', fakeResponse({ status: 401 })),
    ).toBe('ignore')
    expect(classifyAuthResponse('/assets/app.js', fakeResponse({ status: 401 }))).toBe('ignore')
  })

  it('treats a 200 text/html response on /api/foo as auth-probe only when JSON was requested', () => {
    const html = fakeResponse({ status: 200, contentType: 'text/html' })
    expect(
      classifyAuthResponse('/api/foo', html, { accept: 'application/json' }),
    ).toBe('auth-probe')
    expect(classifyAuthResponse('/api/foo', html, { accept: null })).toBe('ignore')
  })

  it('ignores a normal 200 application/json response', () => {
    const json = fakeResponse({ status: 200, contentType: 'application/json' })
    expect(classifyAuthResponse('/api/foo', json, { accept: 'application/json' })).toBe(
      'ignore',
    )
  })

  it('classifies a cross-origin redirected response as proxy-redirect regardless of final status', () => {
    const redirected200 = fakeResponse({
      status: 200,
      redirected: true,
      url: 'https://keycloak.example.com/login',
    })
    const redirected401 = fakeResponse({
      status: 401,
      redirected: true,
      url: 'https://keycloak.example.com/login',
    })
    expect(classifyAuthResponse('/api/foo', redirected200)).toBe('proxy-redirect')
    expect(classifyAuthResponse('/api/foo', redirected401)).toBe('proxy-redirect')
  })

  describe('third-party 401 vs workspace 401 (§2.4, P6bis)', () => {
    it('a bare 401 from a pass-through route (claude-proxy) is auth-probe, never session-expired', () => {
      const res = fakeResponse({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { type: 'authentication_error', message: 'invalid x-api-key' },
        }),
      })
      const action = classifyAuthResponse('/api/claude-proxy/v1/messages', res)
      expect(action).toBe('auth-probe')
      expect(action).not.toBe('session-expired')
    })

    it('the same path with the marker is session-expired — the marker decides, not the URL', () => {
      const res = fakeResponse({
        status: 401,
        headers: { 'X-Hermes-Auth': 'required' },
      })
      expect(classifyAuthResponse('/api/claude-proxy/v1/messages', res)).toBe(
        'session-expired',
      )
    })

    it('other pass-through routes also degrade to auth-probe on a bare 401', () => {
      expect(
        classifyAuthResponse('/api/playground-npc', fakeResponse({ status: 401 })),
      ).toBe('auth-probe')
      expect(classifyAuthResponse('/api/transcribe', fakeResponse({ status: 401 }))).toBe(
        'auth-probe',
      )
      expect(classifyAuthResponse('/api/mcp', fakeResponse({ status: 401 }))).toBe(
        'auth-probe',
      )
    })
  })
})

describe('installAuthFetchInterceptor', () => {
  let originalFetch: typeof fetch

  beforeEach(() => {
    originalFetch = window.fetch
    vi.useFakeTimers()
  })

  afterEach(() => {
    window.fetch = originalFetch
    vi.useRealTimers()
  })

  it('is idempotent: two installs keep a single wrapper, and uninstall restores the real fetch', async () => {
    const baseFetch = vi.fn().mockResolvedValue(fakeResponse())
    window.fetch = baseFetch as unknown as typeof fetch

    const uninstall1 = installAuthFetchInterceptor()
    const wrappedOnce = window.fetch
    const uninstall2 = installAuthFetchInterceptor()
    expect(window.fetch).toBe(wrappedOnce)

    uninstall2()
    expect(window.fetch).not.toBe(wrappedOnce)
    await window.fetch('/api/foo')
    expect(baseFetch).toHaveBeenCalledTimes(1)
    // second uninstall (already restored) must not throw
    expect(() => uninstall1()).not.toThrow()
  })

  it('leaves the response body readable by the caller', async () => {
    window.fetch = vi
      .fn()
      .mockResolvedValue(fakeResponse({ body: '{"hello":"world"}' })) as unknown as typeof fetch
    const uninstall = installAuthFetchInterceptor()
    const res = await window.fetch('/api/foo')
    expect(await res.json()).toEqual({ hello: 'world' })
    uninstall()
  })

  it('dedupes session-expired: 5 concurrent marked 401s call onSessionExpired once', async () => {
    window.fetch = vi
      .fn()
      .mockResolvedValue(
        fakeResponse({ status: 401, headers: { 'X-Hermes-Auth': 'required' } }),
      ) as unknown as typeof fetch
    const onSessionExpired = vi.fn()
    const uninstall = installAuthFetchInterceptor({ onSessionExpired })

    await Promise.all(
      Array.from({ length: 5 }, () => window.fetch('/api/foo')),
    )
    expect(onSessionExpired).toHaveBeenCalledTimes(1)
    uninstall()
  })

  it('throttles auth-probe: 5 concurrent bare 401s call onAuthProbe once, a 6th after 6s calls it again', async () => {
    window.fetch = vi
      .fn()
      .mockResolvedValue(fakeResponse({ status: 401 })) as unknown as typeof fetch
    const onAuthProbe = vi.fn()
    const uninstall = installAuthFetchInterceptor({ onAuthProbe })

    await Promise.all(
      Array.from({ length: 5 }, () => window.fetch('/api/foo')),
    )
    expect(onAuthProbe).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(6_000)
    await window.fetch('/api/foo')
    expect(onAuthProbe).toHaveBeenCalledTimes(2)
    uninstall()
  })

  it('adds Accept: application/json on /api/* when absent, without overwriting an explicit one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse())
    window.fetch = fetchMock as unknown as typeof fetch
    const uninstall = installAuthFetchInterceptor()

    await window.fetch('/api/foo')
    const firstInit = fetchMock.mock.calls[0][1] as RequestInit
    expect(new Headers(firstInit.headers).get('Accept')).toBe('application/json')

    await window.fetch('/api/foo', { headers: { Accept: 'text/plain' } })
    const secondInit = fetchMock.mock.calls[1][1] as RequestInit
    expect(new Headers(secondInit.headers).get('Accept')).toBe('text/plain')

    uninstall()
  })

  it('reloads once on proxy-redirect and skips a second occurrence within the cooldown', async () => {
    window.fetch = vi
      .fn()
      .mockResolvedValue(
        fakeResponse({ redirected: true, url: 'https://keycloak.example.com/login' }),
      ) as unknown as typeof fetch
    const reload = vi.fn()
    const uninstall = installAuthFetchInterceptor({ reload, reloadCooldownMs: 15_000 })

    await window.fetch('/api/foo')
    expect(reload).toHaveBeenCalledTimes(1)

    await window.fetch('/api/foo')
    expect(reload).toHaveBeenCalledTimes(1)

    uninstall()
  })

  it('propagates network errors without calling onSessionExpired or onAuthProbe', async () => {
    window.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch
    const onSessionExpired = vi.fn()
    const onAuthProbe = vi.fn()
    const uninstall = installAuthFetchInterceptor({ onSessionExpired, onAuthProbe })

    await expect(window.fetch('/api/foo')).rejects.toThrow('network down')
    expect(onSessionExpired).not.toHaveBeenCalled()
    expect(onAuthProbe).not.toHaveBeenCalled()

    uninstall()
  })

  it('defaults to no-op callbacks: a marked 401 does not throw when no options are passed', async () => {
    window.fetch = vi
      .fn()
      .mockResolvedValue(
        fakeResponse({ status: 401, headers: { 'X-Hermes-Auth': 'required' } }),
      ) as unknown as typeof fetch
    const uninstall = installAuthFetchInterceptor()
    await expect(window.fetch('/api/foo')).resolves.toBeDefined()
    uninstall()
  })

  it('integration: a bare 401 from claude-proxy triggers onAuthProbe, not onSessionExpired, and the response reaches the caller intact', async () => {
    window.fetch = vi.fn().mockResolvedValue(
      fakeResponse({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'invalid x-api-key' } }),
      }),
    ) as unknown as typeof fetch
    const onSessionExpired = vi.fn()
    const onAuthProbe = vi.fn()
    const uninstall = installAuthFetchInterceptor({ onSessionExpired, onAuthProbe })

    const res = await window.fetch('/api/claude-proxy/v1/messages')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: { message: 'invalid x-api-key' } })
    expect(onSessionExpired).not.toHaveBeenCalled()
    expect(onAuthProbe).toHaveBeenCalledTimes(1)

    uninstall()
  })
})
