import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './$sessionKey.latest-descendant'

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  getLatestDescendant: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))

vi.mock('../../../server/auth-middleware', () => ({
  isAuthenticated: mocks.isAuthenticated,
}))

vi.mock('../../../server/claude-api', () => ({
  getLatestDescendant: mocks.getLatestDescendant,
}))

type LatestDescendantHandler = (context: {
  request: Request
  params: { sessionKey?: string }
}) => Promise<Response>

type TestRoute = {
  server: { handlers: { GET: LatestDescendantHandler } }
}

const handler = (Route as unknown as TestRoute).server.handlers.GET

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isAuthenticated.mockReturnValue(true)
})

describe('GET /api/sessions/$sessionKey/latest-descendant', () => {
  it('requires Workspace authentication', async () => {
    mocks.isAuthenticated.mockReturnValue(false)

    const response = await handler({
      request: new Request(
        'http://workspace.test/api/sessions/parent/latest-descendant',
      ),
      params: { sessionKey: 'parent' },
    })

    expect(response.status).toBe(401)
    expect(mocks.getLatestDescendant).not.toHaveBeenCalled()
  })

  it('validates a nonempty session key', async () => {
    const response = await handler({
      request: new Request(
        'http://workspace.test/api/sessions/%20/latest-descendant',
      ),
      params: { sessionKey: '   ' },
    })

    expect(response.status).toBe(400)
    expect(mocks.getLatestDescendant).not.toHaveBeenCalled()
  })

  it('returns the canonical descendant contract when supported', async () => {
    mocks.getLatestDescendant.mockResolvedValue({
      requestedSessionId: 'parent',
      sessionId: 'tip',
      path: ['parent', 'tip'],
      changed: true,
      supported: true,
    })

    const response = await handler({
      request: new Request(
        'http://workspace.test/api/sessions/parent/latest-descendant',
      ),
      params: { sessionKey: 'parent' },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      requestedSessionKey: 'parent',
      sessionKey: 'tip',
      path: ['parent', 'tip'],
      changed: true,
      supported: true,
    })
  })

  it('returns the requested key instead of a route error when unsupported', async () => {
    mocks.getLatestDescendant.mockResolvedValue({
      requestedSessionId: 'parent',
      sessionId: 'parent',
      path: ['parent'],
      changed: false,
      supported: false,
    })

    const response = await handler({
      request: new Request(
        'http://workspace.test/api/sessions/parent/latest-descendant',
      ),
      params: { sessionKey: 'parent' },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      requestedSessionKey: 'parent',
      sessionKey: 'parent',
      path: ['parent'],
      changed: false,
      supported: false,
    })
  })
})
