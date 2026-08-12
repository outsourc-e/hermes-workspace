import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './sessions/send'

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
}))

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: mocks.isAuthenticated,
}))

const handler = (Route.options.server?.handlers as any).POST as (args: {
  request: Request
}) => Promise<Response>

function request(body: BodyInit, contentType = 'application/json'): Request {
  return new Request('http://localhost/api/sessions/send', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  })
}

describe('POST /api/sessions/send retirement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isAuthenticated.mockReturnValue(true)
  })

  it('returns 410 for every raw session send without forwarding it', async () => {
    const response = await handler({
      request: request(
        JSON.stringify({
          sessionKey: 'remote:raw-runtime',
          message: 'this must not be delivered',
        }),
      ),
    })

    expect(response.status).toBe(410)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Legacy session send is retired; use a Session Card operation',
    })
  })

  it('rejects attachment-shaped legacy requests rather than silently retiring upload behavior', async () => {
    const response = await handler({
      request: request(
        JSON.stringify({
          sessionKey: 'remote:raw-runtime',
          message: 'upload',
          attachments: [],
        }),
      ),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Attachments are not supported by the retired session endpoint',
    })
  })

  it('authenticates before parsing the retired request body', async () => {
    mocks.isAuthenticated.mockReturnValue(false)

    const response = await handler({
      request: request('not json'),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Unauthorized',
    })
  })
})
