import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome = ''

beforeEach(() => {
  vi.resetModules()
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-session-renewal-'))
  process.env.HERMES_HOME = tmpHome
})

afterEach(() => {
  delete process.env.HERMES_HOME
  delete process.env.HERMES_PASSWORD
  delete process.env.CLAUDE_PASSWORD
  delete process.env.SESSION_RENEW_INTERVAL_SECONDS
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

function makeRequest(cookieHeader?: string): Request {
  return new Request('http://localhost/api/whatever', {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  })
}

describe('renewSessionCookie', () => {
  it('returns null when no password is configured (reverse-proxy mode)', async () => {
    const { renewSessionCookie } = await import('./session-renewal')
    expect(renewSessionCookie(makeRequest('claude-auth=whatever'))).toBeNull()
  })

  it('returns null without a cookie header', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    const { renewSessionCookie } = await import('./session-renewal')
    expect(renewSessionCookie(makeRequest())).toBeNull()
  })

  it('returns null with a cookie of another name', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    const { renewSessionCookie } = await import('./session-renewal')
    expect(renewSessionCookie(makeRequest('other=abc'))).toBeNull()
  })

  it('returns null with an unknown token', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    const { renewSessionCookie } = await import('./session-renewal')
    expect(renewSessionCookie(makeRequest('claude-auth=unknown'))).toBeNull()
  })

  it('returns null inside the renewal throttle window, a Set-Cookie string outside of it', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    process.env.SESSION_RENEW_INTERVAL_SECONDS = '0.001'
    vi.useFakeTimers()
    try {
      const { generateSessionToken, storeSessionToken } = await import('./auth-middleware')
      const { renewSessionCookie } = await import('./session-renewal')
      const token = generateSessionToken()
      storeSessionToken(token)

      expect(renewSessionCookie(makeRequest(`claude-auth=${token}`))).toBeNull()

      vi.advanceTimersByTime(10)
      const cookie = renewSessionCookie(makeRequest(`claude-auth=${token}`))
      expect(cookie).toContain(`claude-auth=${token}`)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('withRenewedSession', () => {
  it('returns the identical Response object when there is nothing to renew', async () => {
    const { withRenewedSession } = await import('./session-renewal')
    const original = new Response('hi')
    const result = withRenewedSession(makeRequest(), original)
    expect(result).toBe(original)
  })

  it('preserves status/statusText/body and appends Set-Cookie + Cache-Control when renewing', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    process.env.SESSION_RENEW_INTERVAL_SECONDS = '0.001'
    vi.useFakeTimers()
    try {
      const { generateSessionToken, storeSessionToken } = await import('./auth-middleware')
      const { withRenewedSession } = await import('./session-renewal')
      const token = generateSessionToken()
      storeSessionToken(token)
      vi.advanceTimersByTime(10)

      const original = new Response(JSON.stringify({ ok: true }), {
        status: 201,
        statusText: 'Created',
        headers: { 'Set-Cookie': 'other-cookie=1', 'Content-Type': 'application/json' },
      })
      const result = withRenewedSession(makeRequest(`claude-auth=${token}`), original)

      expect(result.status).toBe(201)
      expect(result.statusText).toBe('Created')
      expect(await result.json()).toEqual({ ok: true })
      expect(result.headers.getSetCookie()).toHaveLength(2)
      expect(result.headers.get('Cache-Control')).toBe('no-store')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not consume or buffer a streamed body (SSE)', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    process.env.SESSION_RENEW_INTERVAL_SECONDS = '0.001'
    vi.useFakeTimers()
    try {
      const { generateSessionToken, storeSessionToken } = await import('./auth-middleware')
      const { withRenewedSession } = await import('./session-renewal')
      const token = generateSessionToken()
      storeSessionToken(token)
      vi.advanceTimersByTime(10)

      let emitSecond: () => void = () => {}
      const secondChunkGate = new Promise<void>((resolve) => {
        emitSecond = resolve
      })
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(new TextEncoder().encode('data: 1\n\n'))
          await secondChunkGate
          controller.enqueue(new TextEncoder().encode('data: 2\n\n'))
          controller.close()
        },
      })
      const original = new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream' },
      })

      const result = withRenewedSession(makeRequest(`claude-auth=${token}`), original)
      const reader = result.body!.getReader()

      const first = await reader.read()
      expect(new TextDecoder().decode(first.value)).toBe('data: 1\n\n')

      emitSecond()
      const second = await reader.read()
      expect(new TextDecoder().decode(second.value)).toBe('data: 2\n\n')

      const done = await reader.read()
      expect(done.done).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('preserves framing headers unchanged and only adds Set-Cookie', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    process.env.SESSION_RENEW_INTERVAL_SECONDS = '0.001'
    vi.useFakeTimers()
    try {
      const { generateSessionToken, storeSessionToken } = await import('./auth-middleware')
      const { withRenewedSession } = await import('./session-renewal')
      const token = generateSessionToken()
      storeSessionToken(token)
      vi.advanceTimersByTime(10)

      const original = new Response('event: ping\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      })
      const originalHeadersSnapshot = new Headers(original.headers)
      const result = withRenewedSession(makeRequest(`claude-auth=${token}`), original)

      for (const key of ['content-type', 'content-length', 'transfer-encoding']) {
        expect(result.headers.get(key)).toBe(originalHeadersSnapshot.get(key))
      }
      expect(originalHeadersSnapshot.get('cache-control')).toBeNull()
      expect(result.headers.get('Cache-Control')).toBe('no-store')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps an explicit Content-Length consistent with the body when renewing', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    process.env.SESSION_RENEW_INTERVAL_SECONDS = '0.001'
    vi.useFakeTimers()
    try {
      const { generateSessionToken, storeSessionToken } = await import('./auth-middleware')
      const { withRenewedSession } = await import('./session-renewal')
      const token = generateSessionToken()
      storeSessionToken(token)
      vi.advanceTimersByTime(10)

      const body = 'hello world'
      const original = new Response(body, {
        headers: { 'Content-Length': String(body.length) },
      })
      const result = withRenewedSession(makeRequest(`claude-auth=${token}`), original)
      expect(result.headers.get('Content-Length')).toBe(String(body.length))
      expect((await result.text()).length).toBe(body.length)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not throw on bodyless statuses (204, 304)', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    process.env.SESSION_RENEW_INTERVAL_SECONDS = '0.001'
    vi.useFakeTimers()
    try {
      const { generateSessionToken, storeSessionToken } = await import('./auth-middleware')
      const { withRenewedSession } = await import('./session-renewal')
      const token = generateSessionToken()
      storeSessionToken(token)
      vi.advanceTimersByTime(10)

      const req = makeRequest(`claude-auth=${token}`)
      expect(() => withRenewedSession(req, new Response(null, { status: 204 }))).not.toThrow()
      expect(() => withRenewedSession(req, new Response(null, { status: 304 }))).not.toThrow()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('requireAuth', () => {
  it('returns null when authenticated', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    const { generateSessionToken, storeSessionToken } = await import('./auth-middleware')
    const { requireAuth } = await import('./session-renewal')
    const token = generateSessionToken()
    storeSessionToken(token)
    expect(requireAuth(makeRequest(`claude-auth=${token}`))).toBeNull()
  })

  it('returns a 401 with X-Hermes-Auth: required and the expected JSON body when not authenticated', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    const { requireAuth } = await import('./session-renewal')
    const denied = requireAuth(makeRequest())
    expect(denied).not.toBeNull()
    expect(denied!.status).toBe(401)
    expect(denied!.headers.get('X-Hermes-Auth')).toBe('required')
    expect(denied!.headers.get('Cache-Control')).toBe('no-store')
    expect(await denied!.json()).toEqual({
      ok: false,
      error: 'Unauthorized',
      authRequired: true,
      authenticated: false,
    })
  })
})
