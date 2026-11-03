import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const base = 'http://hermes.test:9119'

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('HERMES_DASHBOARD_USERNAME', 'admin')
  vi.stubEnv('HERMES_DASHBOARD_PASSWORD', 'test-password')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('dashboard basic authentication', () => {
  it('logs in and sends session cookies', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{"ok":true}', {
        headers: {
          'Set-Cookie': 'hermes_session_at=test-token; HttpOnly; Path=/',
        },
      }))
      .mockResolvedValueOnce(new Response('{"sessions":[]}', {
        status: 200,
      }))

    vi.stubGlobal('fetch', fetchMock)

    const { authenticatedDashboardFetch } = await import('../dashboard-auth')
    const res = await authenticatedDashboardFetch(base, '/api/sessions')

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe(`${base}/auth/password-login`)

    const headers = new Headers(fetchMock.mock.calls[1][1].headers)
    expect(headers.get('Cookie')).toContain('hermes_session_at=test-token')
  })

  it('reconnects when the session expires', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', {
        headers: { 'Set-Cookie': 'hermes_session_at=old-token; Path=/' },
      }))
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', {
        headers: { 'Set-Cookie': 'hermes_session_at=new-token; Path=/' },
      }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))

    vi.stubGlobal('fetch', fetchMock)

    const { authenticatedDashboardFetch } = await import('../dashboard-auth')
    const res = await authenticatedDashboardFetch(base, '/api/sessions')

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})

describe('dashboard authentication security', () => {
  it('does not send credentials when authentication is disabled', async () => {
    vi.stubEnv('HERMES_DASHBOARD_USERNAME', '')
    vi.stubEnv('HERMES_DASHBOARD_PASSWORD', '')

    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { authenticatedDashboardFetch } = await import('../dashboard-auth')
    await authenticatedDashboardFetch(base, '/api/status')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers)
    expect(headers.has('Cookie')).toBe(false)
    expect(headers.has('Authorization')).toBe(false)
  })

  it('rejects invalid dashboard credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('{}', { status: 401 }),
    ))

    const { authenticatedDashboardFetch } = await import('../dashboard-auth')

    await expect(
      authenticatedDashboardFetch(base, '/api/sessions'),
    ).rejects.toThrow('HTTP 401')
  })

  it('does not expose the password in authentication errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('{}', { status: 503 }),
    ))

    const { authenticatedDashboardFetch } = await import('../dashboard-auth')

    await expect(
      authenticatedDashboardFetch(base, '/api/sessions'),
    ).rejects.not.toThrow('test-password')
  })
})

describe('dashboard session isolation', () => {
  it('keeps session cookies separate between servers', async () => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input)

      if (url.endsWith('/auth/password-login')) {
        const token = url.includes('hermes-a.test') ? 'token-A' : 'token-B'
        return new Response('{}', {
          headers: {
            'Set-Cookie': `hermes_session_at=${token}; HttpOnly; Path=/`,
          },
        })
      }

      return new Response('{}', { status: 200 })
    })

    vi.stubGlobal('fetch', fetchMock)

    const { authenticatedDashboardFetch } = await import('../dashboard-auth')

    await authenticatedDashboardFetch('http://hermes-a.test:9119', '/api/sessions')
    await authenticatedDashboardFetch('http://hermes-b.test:9119', '/api/sessions')

    const requests = fetchMock.mock.calls.filter(
      ([url]) => String(url).endsWith('/api/sessions'),
    )

    expect(new Headers(requests[0][1]?.headers).get('Cookie'))
      .toContain('hermes_session_at=token-A')

    expect(new Headers(requests[1][1]?.headers).get('Cookie'))
      .toContain('hermes_session_at=token-B')
  })
})

describe('dashboard cookie rotation', () => {
  it('updates access and refresh cookies returned by Hermes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', {
        headers: {
          'Set-Cookie': 'hermes_session_at=initial; Path=/',
        },
      }))
      .mockResolvedValueOnce(new Response('{}', {
        headers: [
          ['Set-Cookie', 'hermes_session_at=rotated; Path=/'],
          ['Set-Cookie', 'hermes_session_rt=refresh-new; Path=/'],
        ],
      }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))

    vi.stubGlobal('fetch', fetchMock)

    const { authenticatedDashboardFetch } = await import('../dashboard-auth')

    await authenticatedDashboardFetch(base, '/api/sessions')
    await authenticatedDashboardFetch(base, '/api/config')

    const headers = new Headers(fetchMock.mock.calls[2][1].headers)

    expect(headers.get('Cookie')).toContain('hermes_session_at=rotated')
    expect(headers.get('Cookie')).toContain('hermes_session_rt=refresh-new')
  })
})
