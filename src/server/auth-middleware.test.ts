import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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
  delete process.env.COOKIE_SAMESITE
  delete process.env.SESSION_RENEW_INTERVAL_SECONDS
  delete process.env.HERMES_PASSWORD
  delete process.env.HERMES_HOME
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

describe('createSessionCookie maxAgeSeconds (Solution A §2.1c)', () => {
  it('defaults Max-Age to SESSION_TTL_SECONDS (30 days)', async () => {
    const { createSessionCookie } = await import('./auth-middleware')
    const cookie = createSessionCookie('tok123')
    expect(cookie).toContain('Max-Age=2592000')
  })

  it('accepts a custom maxAgeSeconds', async () => {
    const { createSessionCookie } = await import('./auth-middleware')
    const cookie = createSessionCookie('tok123', 60)
    expect(cookie).toContain('Max-Age=60')
  })
})

describe('createExpiredSessionCookie', () => {
  it('expires immediately with an empty token value', async () => {
    const { createExpiredSessionCookie } = await import('./auth-middleware')
    const cookie = createExpiredSessionCookie()
    expect(cookie).toMatch(/^claude-auth=;/)
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).toContain('HttpOnly')
  })
})

describe('COOKIE_SAMESITE (Solution A §2.1c, piège P5)', () => {
  it('defaults to Strict when unset', async () => {
    const { createSessionCookie } = await import('./auth-middleware')
    expect(createSessionCookie('tok123')).toContain('SameSite=Strict')
  })

  it('honors COOKIE_SAMESITE=lax', async () => {
    process.env.COOKIE_SAMESITE = 'lax'
    const { createSessionCookie } = await import('./auth-middleware')
    expect(createSessionCookie('tok123')).toContain('SameSite=Lax')
  })

  it('honors COOKIE_SAMESITE=none and forces Secure even without COOKIE_SECURE', async () => {
    process.env.NODE_ENV = 'development'
    process.env.COOKIE_SAMESITE = 'none'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { createSessionCookie } = await import('./auth-middleware')
    const cookie = createSessionCookie('tok123')
    expect(cookie).toContain('SameSite=None')
    expect(cookie).toContain('Secure')
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('session token store (Solution A §2.1b — expiration glissante)', () => {
  let tmpHome = ''

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-auth-mw-'))
    process.env.HERMES_HOME = tmpHome
  })

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  it('SESSION_TTL_SECONDS * 1000 matches the store TTL applied by storeSessionToken (piège P2)', async () => {
    const { SESSION_TTL_SECONDS, generateSessionToken, storeSessionToken, getSessionExpiry } =
      await import('./auth-middleware')
    const token = generateSessionToken()
    storeSessionToken(token)
    const expiry = getSessionExpiry(token)
    expect(expiry).not.toBeNull()
    expect(expiry as number).toBeGreaterThan(Date.now() + SESSION_TTL_SECONDS * 1000 - 2000)
    expect(expiry as number).toBeLessThanOrEqual(Date.now() + SESSION_TTL_SECONDS * 1000 + 2000)
  })

  it('touchSessionToken returns false for an unknown token', async () => {
    const { touchSessionToken } = await import('./auth-middleware')
    expect(touchSessionToken('inconnu')).toBe(false)
  })

  it('touchSessionToken returns false and removes an expired token from the store', async () => {
    vi.useFakeTimers()
    try {
      const { generateSessionToken, storeSessionToken, touchSessionToken, isValidSessionToken } =
        await import('./auth-middleware')
      const token = generateSessionToken()
      storeSessionToken(token)
      vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000)
      expect(touchSessionToken(token)).toBe(false)
      expect(isValidSessionToken(token)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('touchSessionToken is throttled: no renewal right after storeSessionToken', async () => {
    const { generateSessionToken, storeSessionToken, touchSessionToken } = await import(
      './auth-middleware'
    )
    const token = generateSessionToken()
    storeSessionToken(token)
    expect(touchSessionToken(token)).toBe(false)
  })

  it('touchSessionToken renews once the renewal window has elapsed', async () => {
    process.env.SESSION_RENEW_INTERVAL_SECONDS = '0.001'
    vi.useFakeTimers()
    try {
      const {
        generateSessionToken,
        storeSessionToken,
        touchSessionToken,
        getSessionExpiry,
      } = await import('./auth-middleware')
      const token = generateSessionToken()
      storeSessionToken(token)
      const before = getSessionExpiry(token)
      vi.advanceTimersByTime(10)
      expect(touchSessionToken(token)).toBe(true)
      const after = getSessionExpiry(token)
      expect(after as number).toBeGreaterThan(before as number)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not write to disk more than once across two consecutive renewals (piège P3)', async () => {
    process.env.SESSION_RENEW_INTERVAL_SECONDS = '0.001'
    vi.useFakeTimers()
    try {
      const { generateSessionToken, storeSessionToken, touchSessionToken } = await import(
        './auth-middleware'
      )
      const token = generateSessionToken()
      storeSessionToken(token)
      vi.advanceTimersByTime(10)

      expect(touchSessionToken(token)).toBe(true)
      const storeFile = path.join(tmpHome, 'workspace-sessions.json')
      const mtimeAfterFirstRenewal = fs.statSync(storeFile).mtimeMs

      // Second call lands inside the fresh renewal window: throttled, no extra write.
      expect(touchSessionToken(token)).toBe(false)
      expect(fs.statSync(storeFile).mtimeMs).toBe(mtimeAfterFirstRenewal)
    } finally {
      vi.useRealTimers()
    }
  })
})
