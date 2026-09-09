import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression tests for #123 (Secure cookie attribute) and #125
 * (x-forwarded-for spoofing).
 *
 * We reset the module between tests because the cookie helper captures
 * env-dependent state at call time and rate-limit / middleware paths
 * depend on `TRUST_PROXY`.
 */

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  delete process.env.COOKIE_SECURE
  delete process.env.NODE_ENV
  delete process.env.TRUST_PROXY
  delete process.env.CLAUDE_PASSWORD
})

describe('createSessionCookie (#123)', () => {
  it('omits Secure in development by default', async () => {
    process.env.NODE_ENV = 'development'
    const { createSessionCookie } = await import('./auth-middleware')
    const cookie = createSessionCookie('tok123')
    expect(cookie).toMatch(/^claude-auth=tok123/)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain('Secure')
  })

  it('sets Secure in production by default', async () => {
    process.env.NODE_ENV = 'production'
    const { createSessionCookie } = await import('./auth-middleware')
    const cookie = createSessionCookie('tok123')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
  })

  it('respects COOKIE_SECURE=1 override in development', async () => {
    process.env.NODE_ENV = 'development'
    process.env.COOKIE_SECURE = '1'
    const { createSessionCookie } = await import('./auth-middleware')
    const cookie = createSessionCookie('tok123')
    expect(cookie).toContain('Secure')
  })

  it('respects COOKIE_SECURE=0 override in production', async () => {
    process.env.NODE_ENV = 'production'
    process.env.COOKIE_SECURE = '0'
    const { createSessionCookie } = await import('./auth-middleware')
    const cookie = createSessionCookie('tok123')
    expect(cookie).not.toContain('Secure')
  })
})

describe('clearSessionCookie (logout)', () => {
  it('clears the cookie with Max-Age=0 and matching attributes', async () => {
    process.env.NODE_ENV = 'production'
    const { clearSessionCookie } = await import('./auth-middleware')
    const cookie = clearSessionCookie()
    expect(cookie).toMatch(/^claude-auth=;/)
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('Secure')
  })

  it('omits Secure when COOKIE_SECURE=0 in production', async () => {
    process.env.NODE_ENV = 'production'
    process.env.COOKIE_SECURE = '0'
    const { clearSessionCookie } = await import('./auth-middleware')
    const cookie = clearSessionCookie()
    expect(cookie).toMatch(/^claude-auth=;/)
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).not.toContain('Secure')
  })
})

describe('revokeSessionToken (logout)', () => {
  it('revokes a stored token so it is no longer valid', async () => {
    const { generateSessionToken, storeSessionToken, revokeSessionToken, isValidSessionToken } =
      await import('./auth-middleware')
    const token = generateSessionToken()
    storeSessionToken(token)
    expect(isValidSessionToken(token)).toBe(true)
    revokeSessionToken(token)
    expect(isValidSessionToken(token)).toBe(false)
  })

  it('is a no-op for an unknown token', async () => {
    const { revokeSessionToken } = await import('./auth-middleware')
    expect(() => revokeSessionToken('unknown-token')).not.toThrow()
  })
})

describe('getRequestIp (#125)', () => {
  function makeRequest(headers: Record<string, string>): Request {
    return new Request('http://localhost/', { headers })
  }

  it('ignores x-forwarded-for when TRUST_PROXY is unset', async () => {
    delete process.env.TRUST_PROXY
    const { getRequestIp } = await import('./auth-middleware')
    const ip = getRequestIp(
      makeRequest({ 'x-forwarded-for': '203.0.113.77, 10.0.0.1' }),
    )
    expect(ip).toBe('127.0.0.1')
  })

  it('ignores x-real-ip when TRUST_PROXY is unset', async () => {
    delete process.env.TRUST_PROXY
    const { getRequestIp } = await import('./auth-middleware')
    const ip = getRequestIp(makeRequest({ 'x-real-ip': '203.0.113.77' }))
    expect(ip).toBe('127.0.0.1')
  })

  it('honors x-forwarded-for when TRUST_PROXY=1', async () => {
    process.env.TRUST_PROXY = '1'
    const { getRequestIp } = await import('./auth-middleware')
    const ip = getRequestIp(
      makeRequest({ 'x-forwarded-for': '203.0.113.77, 10.0.0.1' }),
    )
    expect(ip).toBe('203.0.113.77')
  })

  it('honors x-real-ip fallback when TRUST_PROXY=true and x-forwarded-for absent', async () => {
    process.env.TRUST_PROXY = 'true'
    const { getRequestIp } = await import('./auth-middleware')
    const ip = getRequestIp(makeRequest({ 'x-real-ip': '198.51.100.5' }))
    expect(ip).toBe('198.51.100.5')
  })
})
