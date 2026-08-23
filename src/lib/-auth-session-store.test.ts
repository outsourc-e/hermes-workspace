/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ClaudeAuthModule from './claude-auth'

vi.mock('./claude-auth', async () => {
  const actual = await vi.importActual<typeof ClaudeAuthModule>('./claude-auth')
  return {
    ...actual,
    refreshSession: vi.fn().mockResolvedValue({
      ok: true,
      authRequired: false,
      authenticated: true,
    }),
  }
})

type FakeResponseInit = {
  status?: number
  ok?: boolean
  redirected?: boolean
  url?: string
  contentType?: string
  body?: unknown
}

function fakeResponse(init: FakeResponseInit = {}): Response {
  const status = init.status ?? 200
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    redirected: init.redirected ?? false,
    url: init.url ?? 'http://localhost/api/auth-check',
    headers: new Headers({
      'content-type': init.contentType ?? 'application/json',
    }),
    json: async () => init.body ?? {},
  } as Response
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload: vi.fn() },
    writable: true,
  })
  window.sessionStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function importStore() {
  return await import('./auth-session-store')
}

describe('subscribeAuthSession — single poller (règle 1)', () => {
  it('performs a single /api/auth-check fetch regardless of subscriber count, and stops the interval on last unsubscribe', async () => {
    const store = await importStore()
    fetchMock.mockResolvedValue(
      fakeResponse({ body: { authenticated: true, authRequired: false } }),
    )

    const unsub1 = store.subscribeAuthSession(() => {})
    const unsub2 = store.subscribeAuthSession(() => {})
    const unsub3 = store.subscribeAuthSession(() => {})

    await store.checkAuthNow('flush-initial')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    unsub1()
    unsub2()
    unsub3()

    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('phase derivation', () => {
  it('sets phase to expired when authRequired && !authenticated', async () => {
    const store = await importStore()
    fetchMock.mockResolvedValue(
      fakeResponse({ body: { authenticated: false, authRequired: true } }),
    )
    const unsub = store.subscribeAuthSession(() => {})
    await store.checkAuthNow('flush')
    expect(store.getAuthSessionState().phase).toBe('expired')
    unsub()
  })

  it('treats a gateway 503 as unreachable, never expired (piège P11)', async () => {
    const store = await importStore()
    fetchMock.mockResolvedValue(
      fakeResponse({
        status: 503,
        body: {
          authenticated: false,
          authRequired: false,
          error: 'claude_agent_unreachable',
        },
      }),
    )
    const unsub = store.subscribeAuthSession(() => {})
    await store.checkAuthNow('flush')
    expect(store.getAuthSessionState().phase).toBe('unreachable')
    unsub()
  })
})

describe('backoff (règle 5)', () => {
  it('backs off after a failure and resets to nominal interval on success', async () => {
    const store = await importStore()
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    const unsub = store.subscribeAuthSession(() => {})
    await store.checkAuthNow('flush')
    expect(store.getAuthSessionState().phase).toBe('unreachable')
    expect(store.getAuthSessionState().consecutiveFailures).toBe(1)

    fetchMock.mockResolvedValue(
      fakeResponse({ body: { authenticated: true, authRequired: false } }),
    )
    await vi.advanceTimersByTimeAsync(store.AUTH_POLL_BACKOFF_MS[0])
    expect(store.getAuthSessionState().phase).toBe('ok')
    expect(store.getAuthSessionState().consecutiveFailures).toBe(0)
    unsub()
  })
})

describe('backoff cap (règle 5bis)', () => {
  it('suspends polling after AUTH_POLL_MAX_CONSECUTIVE_FAILURES and stops issuing fetches', async () => {
    const store = await importStore()
    fetchMock.mockRejectedValue(new Error('network down'))

    const unsub = store.subscribeAuthSession(() => {})
    await store.checkAuthNow('flush-first')

    for (let i = 1; i < store.AUTH_POLL_MAX_CONSECUTIVE_FAILURES; i++) {
      const idx = Math.min(i - 1, store.AUTH_POLL_BACKOFF_MS.length - 1)
      await vi.advanceTimersByTimeAsync(store.AUTH_POLL_BACKOFF_MS[idx])
    }

    expect(store.getAuthSessionState().phase).toBe('suspended')
    const callsAtSuspend = fetchMock.mock.calls.length
    expect(callsAtSuspend).toBe(store.AUTH_POLL_MAX_CONSECUTIVE_FAILURES)

    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
    expect(fetchMock.mock.calls.length).toBe(callsAtSuspend)

    unsub()
  })

  it('a failed visibilitychange wake leaves phase suspended without restarting the timer', async () => {
    const store = await importStore()
    fetchMock.mockRejectedValue(new Error('network down'))
    const unsub = store.subscribeAuthSession(() => {})
    await store.checkAuthNow('flush-first')
    for (let i = 1; i < store.AUTH_POLL_MAX_CONSECUTIVE_FAILURES; i++) {
      const idx = Math.min(i - 1, store.AUTH_POLL_BACKOFF_MS.length - 1)
      await vi.advanceTimersByTimeAsync(store.AUTH_POLL_BACKOFF_MS[idx])
    }
    expect(store.getAuthSessionState().phase).toBe('suspended')
    const callsAtSuspend = fetchMock.mock.calls.length

    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getAuthSessionState().phase).toBe('suspended')
    expect(fetchMock.mock.calls.length).toBe(callsAtSuspend + 1)

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(fetchMock.mock.calls.length).toBe(callsAtSuspend + 1)

    unsub()
  })

  it('a successful visibilitychange wake resets failures and resumes the nominal interval', async () => {
    const store = await importStore()
    fetchMock.mockRejectedValue(new Error('network down'))
    const unsub = store.subscribeAuthSession(() => {})
    await store.checkAuthNow('flush-first')
    for (let i = 1; i < store.AUTH_POLL_MAX_CONSECUTIVE_FAILURES; i++) {
      const idx = Math.min(i - 1, store.AUTH_POLL_BACKOFF_MS.length - 1)
      await vi.advanceTimersByTimeAsync(store.AUTH_POLL_BACKOFF_MS[idx])
    }
    expect(store.getAuthSessionState().phase).toBe('suspended')

    fetchMock.mockResolvedValue(
      fakeResponse({ body: { authenticated: true, authRequired: false } }),
    )
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)

    expect(store.getAuthSessionState().phase).toBe('ok')
    expect(store.getAuthSessionState().consecutiveFailures).toBe(0)

    const callsAfterRecovery = fetchMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(store.AUTH_POLL_INTERVAL_MS)
    expect(fetchMock.mock.calls.length).toBe(callsAfterRecovery + 1)

    unsub()
  })
})

describe('markSessionExpired', () => {
  it('switches to expired immediately and emits hermes:auth-expired', async () => {
    const store = await importStore()
    fetchMock.mockResolvedValue(
      fakeResponse({ body: { authenticated: true, authRequired: false } }),
    )
    const eventListener = vi.fn()
    window.addEventListener('hermes:auth-expired', eventListener)

    store.markSessionExpired('test')
    expect(store.getAuthSessionState().phase).toBe('expired')
    expect(eventListener).toHaveBeenCalledTimes(1)

    window.removeEventListener('hermes:auth-expired', eventListener)
  })
})

describe('probeAuthSession', () => {
  it('does not itself change the phase, dedupes to a single /api/auth-check across 5 calls, and lets the response arbitrate', async () => {
    const store = await importStore()
    fetchMock.mockResolvedValue(
      fakeResponse({ body: { authenticated: false, authRequired: true } }),
    )
    const before = store.getAuthSessionState().phase

    for (let i = 0; i < 5; i++) store.probeAuthSession('test')
    // Synchronous call: no phase change until the async check resolves.
    expect(store.getAuthSessionState().phase).toBe(before)

    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(store.getAuthSessionState().phase).toBe('expired')
  })

  it('resolves to ok when the third-party 401 turns out to be authenticated:true', async () => {
    const store = await importStore()
    fetchMock.mockResolvedValue(
      fakeResponse({ body: { authenticated: true, authRequired: true } }),
    )
    store.probeAuthSession('test')
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getAuthSessionState().phase).toBe('ok')
  })

  it('resolves to unreachable on a network error', async () => {
    const store = await importStore()
    fetchMock.mockRejectedValue(new Error('down'))
    store.probeAuthSession('test')
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getAuthSessionState().phase).toBe('unreachable')
  })
})

describe('escalade 6bis — /api/auth-check itself intercepted by the proxy', () => {
  it('reloads once when /api/auth-check answers 200 text/html', async () => {
    const store = await importStore()
    fetchMock.mockResolvedValue(fakeResponse({ contentType: 'text/html' }))
    store.probeAuthSession('test')
    await vi.advanceTimersByTimeAsync(0)
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })

  it('reloads once when /api/auth-check is redirected cross-origin', async () => {
    const store = await importStore()
    fetchMock.mockResolvedValue(
      fakeResponse({ redirected: true, url: 'https://keycloak.example.com/login' }),
    )
    store.probeAuthSession('test')
    await vi.advanceTimersByTimeAsync(0)
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload when /api/auth-check answers normal JSON', async () => {
    const store = await importStore()
    fetchMock.mockResolvedValue(
      fakeResponse({ body: { authenticated: true, authRequired: false } }),
    )
    store.probeAuthSession('test')
    await vi.advanceTimersByTimeAsync(0)
    expect(window.location.reload).not.toHaveBeenCalled()
  })
})

describe('visibilitychange — opportunistic re-check with a 5s guard', () => {
  it('triggers an immediate check, throttled to at most one per 5s', async () => {
    const store = await importStore()
    fetchMock.mockResolvedValue(
      fakeResponse({ body: { authenticated: true, authRequired: false } }),
    )
    const unsub = store.subscribeAuthSession(() => {})
    await store.checkAuthNow('flush-initial')
    const callsAfterSubscribe = fetchMock.mock.calls.length

    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock.mock.calls.length).toBe(callsAfterSubscribe + 1)

    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock.mock.calls.length).toBe(callsAfterSubscribe + 1)

    await vi.advanceTimersByTimeAsync(5_000)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock.mock.calls.length).toBe(callsAfterSubscribe + 2)

    unsub()
  })
})
