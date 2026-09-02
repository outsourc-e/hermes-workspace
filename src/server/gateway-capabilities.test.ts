import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * gateway-capabilities reads workspace-overrides.json at import time via
 * getStateDir(); point the state dir at a temp path so module init stays
 * hermetic, then import the module under test.
 *
 * The module ALSO auto-probes at import (trailing `void ensureGatewayProbed()`).
 * Point it at unreachable port-1 endpoints and swallow its console output so
 * that import-time probe settles fast and deterministically (ECONNREFUSED)
 * instead of racing the per-test fetch stubs against the real local services.
 */
process.env.HERMES_WORKSPACE_STATE_DIR = '/tmp/gateway-capabilities-test-state'
process.env.HERMES_API_URL = 'http://127.0.0.1:1'
process.env.HERMES_DASHBOARD_URL = 'http://127.0.0.1:1'

const importLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
const importWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

const { effectiveProbeTtl, probeDashboard } = await import('./gateway-capabilities')

// Let the import-time auto-probe settle (all probes fail fast on port 1).
await new Promise((resolve) => setTimeout(resolve, 150))
importLogSpy.mockRestore()
importWarnSpy.mockRestore()

describe('effectiveProbeTtl', () => {
  it('uses the long TTL when the full backend is healthy', () => {
    expect(
      effectiveProbeTtl({
        health: true,
        chatCompletions: true,
        dashboard: { available: true },
      }),
    ).toBe(120_000)
  })

  it('uses the short TTL when the dashboard probe failed (degraded state)', () => {
    expect(
      effectiveProbeTtl({
        health: true,
        chatCompletions: true,
        dashboard: { available: false },
      }),
    ).toBe(15_000)
  })

  it('uses the short TTL when disconnected', () => {
    expect(
      effectiveProbeTtl({
        health: false,
        chatCompletions: false,
        dashboard: { available: false },
      }),
    ).toBe(15_000)
    expect(
      effectiveProbeTtl({
        health: false,
        chatCompletions: true,
        dashboard: { available: false },
      }),
    ).toBe(15_000)
  })
})

describe('probeDashboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function okStatusResponse(): Response {
    return new Response(JSON.stringify({ version: '0.20.4' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  it('recovers after one slow failure (retries once)', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        calls += 1
        if (calls === 1) {
          // Simulate a transient stall: first attempt dies slowly (>1s),
          // second attempt succeeds.
          return new Promise<Response>((_, reject) => {
            setTimeout(() => reject(new Error('socket hang up (simulated stall)')), 1_200)
          })
        }
        return Promise.resolve(okStatusResponse())
      }),
    )

    const result = await probeDashboard()

    expect(result.available).toBe(true)
    // attempt 1 (stall) + attempt 2 (status) + dashboard token scrape
    expect(calls).toBeGreaterThanOrEqual(3)
  })

  it('does not retry an instant connection failure', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        calls += 1
        return Promise.reject(new Error('fetch failed'))
      }),
    )

    const result = await probeDashboard()

    expect(result.available).toBe(false)
    expect(calls).toBe(1)
  })

  it('does not retry a fast non-ok status response', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        calls += 1
        return Promise.resolve(new Response('nope', { status: 404 }))
      }),
    )

    const result = await probeDashboard()

    expect(result.available).toBe(false)
    expect(calls).toBe(1)
  })
})
