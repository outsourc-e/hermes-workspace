import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (opts: any) => opts,
}))

let tmpHome = ''

beforeEach(() => {
  vi.resetModules()
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-auth-refresh-'))
  process.env.HERMES_HOME = tmpHome
})

afterEach(() => {
  delete process.env.HERMES_HOME
  delete process.env.HERMES_PASSWORD
  delete process.env.CLAUDE_PASSWORD
  delete process.env.SESSION_RENEW_INTERVAL_SECONDS
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

async function loadHandlers() {
  const mod = await import('./auth.refresh')
  return (mod as any).Route.server.handlers
}

function postRequest(opts?: { cookie?: string; contentType?: string }) {
  const headers: Record<string, string> = {
    'Content-Type': opts?.contentType ?? 'application/json',
  }
  if (opts?.cookie) headers.cookie = opts.cookie
  return new Request('http://localhost/api/auth/refresh', {
    method: 'POST',
    headers,
    body: '{}',
  })
}

describe('POST /api/auth/refresh', () => {
  it('is a no-op 200 when no password is configured (reverse-proxy mode)', async () => {
    const handlers = await loadHandlers()
    const res = await handlers.POST({ request: postRequest() })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      authRequired: false,
      authenticated: true,
    })
    expect(res.headers.get('Set-Cookie')).toBeNull()
  })

  it('renews outside the throttle window: 200 with Set-Cookie and a numeric expiresAt', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    process.env.SESSION_RENEW_INTERVAL_SECONDS = '0.001'
    vi.useFakeTimers()
    try {
      const { generateSessionToken, storeSessionToken } = await import(
        '../../server/auth-middleware'
      )
      const token = generateSessionToken()
      storeSessionToken(token)
      vi.advanceTimersByTime(10)

      const handlers = await loadHandlers()
      const res = await handlers.POST({
        request: postRequest({ cookie: `claude-auth=${token}` }),
      })
      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(typeof body.expiresAt).toBe('number')
      expect(res.headers.get('Set-Cookie')).toContain(`claude-auth=${token}`)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not renew inside the throttle window: 200 without Set-Cookie', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    const { generateSessionToken, storeSessionToken } = await import(
      '../../server/auth-middleware'
    )
    const token = generateSessionToken()
    storeSessionToken(token)

    const handlers = await loadHandlers()
    const res = await handlers.POST({
      request: postRequest({ cookie: `claude-auth=${token}` }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('Set-Cookie')).toBeNull()
  })

  it('returns 401 with X-Hermes-Auth and an expiring Set-Cookie when the cookie is missing', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    const handlers = await loadHandlers()
    const res = await handlers.POST({ request: postRequest() })
    expect(res.status).toBe(401)
    expect(res.headers.get('X-Hermes-Auth')).toBe('required')
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0')
  })

  it('returns 401 for a revoked token', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    const { generateSessionToken, storeSessionToken, revokeSessionToken } = await import(
      '../../server/auth-middleware'
    )
    const token = generateSessionToken()
    storeSessionToken(token)
    revokeSessionToken(token)

    const handlers = await loadHandlers()
    const res = await handlers.POST({
      request: postRequest({ cookie: `claude-auth=${token}` }),
    })
    expect(res.status).toBe(401)
  })

  it('rejects a non-JSON Content-Type with 415', async () => {
    const handlers = await loadHandlers()
    const res = await handlers.POST({
      request: postRequest({ contentType: 'text/plain' }),
    })
    expect(res.status).toBe(415)
  })

  it('rate-limits the 31st call in a minute with 429', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    const handlers = await loadHandlers()
    let last: Response | undefined
    for (let i = 0; i < 31; i++) {
      last = await handlers.POST({ request: postRequest() })
    }
    expect(last!.status).toBe(429)
  })
})
