import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression tests for #125 — x-forwarded-for trust boundary on rate-limit
 * identity.
 */

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  delete process.env.TRUST_PROXY
})

describe('getClientIp (#125)', () => {
  function makeRequest(headers: Record<string, string>): Request {
    return new Request('http://localhost/', { headers })
  }

  it("falls back to 'local' when TRUST_PROXY is unset", async () => {
    delete process.env.TRUST_PROXY
    const { getClientIp } = await import('./rate-limit')
    const ip = getClientIp(
      makeRequest({ 'x-forwarded-for': '198.51.100.5' }),
    )
    expect(ip).toBe('local')
  })

  it('honors x-forwarded-for when TRUST_PROXY=1', async () => {
    process.env.TRUST_PROXY = '1'
    const { getClientIp } = await import('./rate-limit')
    const ip = getClientIp(
      makeRequest({ 'x-forwarded-for': '198.51.100.5, 10.0.0.1' }),
    )
    expect(ip).toBe('198.51.100.5')
  })

  it('rate-limit key cannot be rotated by header spoofing when TRUST_PROXY is off', async () => {
    delete process.env.TRUST_PROXY
    const { getClientIp } = await import('./rate-limit')
    const a = getClientIp(makeRequest({ 'x-forwarded-for': '1.1.1.1' }))
    const b = getClientIp(makeRequest({ 'x-forwarded-for': '2.2.2.2' }))
    const c = getClientIp(makeRequest({ 'x-forwarded-for': '3.3.3.3' }))
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(a).toBe('local')
  })
})
