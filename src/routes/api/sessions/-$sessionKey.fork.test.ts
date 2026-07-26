import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './$sessionKey.fork'

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  ensureGatewayProbed: vi.fn(),
  forkSession: vi.fn(),
  toSessionSummary: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))

vi.mock('../../../server/auth-middleware', () => ({
  isAuthenticated: mocks.isAuthenticated,
}))

vi.mock('../../../server/claude-api', () => ({
  SessionForkUnavailableError: class SessionForkUnavailableError extends Error {},
  ensureGatewayProbed: mocks.ensureGatewayProbed,
  forkSession: mocks.forkSession,
  toSessionSummary: mocks.toSessionSummary,
}))

type ForkHandler = (context: {
  request: Request
  params: { sessionKey?: string }
}) => Promise<Response>

type TestRoute = {
  server: { handlers: { POST: ForkHandler } }
}

const handler = (Route as unknown as TestRoute).server.handlers.POST

function request(body: string, contentType = 'application/json'): Request {
  return new Request('http://workspace.test/api/sessions/parent/fork', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isAuthenticated.mockReturnValue(true)
  mocks.ensureGatewayProbed.mockResolvedValue({ sessionFork: true })
  mocks.toSessionSummary.mockImplementation(
    (session: { id: string; title?: string; parent_session_id?: string }) => ({
      key: session.id,
      friendlyId: session.id,
      title: session.title,
      lineage: session.parent_session_id
        ? { parentSessionId: session.parent_session_id }
        : undefined,
    }),
  )
})

describe('POST /api/sessions/$sessionKey/fork', () => {
  it('requires Workspace authentication before any mutation', async () => {
    mocks.isAuthenticated.mockReturnValue(false)

    const response = await handler({
      request: request('{}'),
      params: { sessionKey: 'parent' },
    })

    expect(response.status).toBe(401)
    expect(mocks.forkSession).not.toHaveBeenCalled()
  })

  it('requires JSON content type', async () => {
    const response = await handler({
      request: request('{}', 'text/plain'),
      params: { sessionKey: 'parent' },
    })

    expect(response.status).toBe(415)
    expect(mocks.forkSession).not.toHaveBeenCalled()
  })

  it('validates the key and JSON body', async () => {
    const blankKey = await handler({
      request: request('{}'),
      params: { sessionKey: '   ' },
    })
    const invalidJson = await handler({
      request: request('{'),
      params: { sessionKey: 'parent' },
    })
    const invalidTitle = await handler({
      request: request(JSON.stringify({ title: 42 })),
      params: { sessionKey: 'parent' },
    })

    expect(blankKey.status).toBe(400)
    expect(invalidJson.status).toBe(400)
    expect(invalidTitle.status).toBe(400)
    expect(mocks.forkSession).not.toHaveBeenCalled()
  })

  it.each([
    { keepCount: 3 },
    { keep_count: 3 },
    { messageId: 'message-1' },
    { message_id: 'message-1' },
    { targetMessageId: 'message-1' },
  ])('rejects message-targeted branching: %o', async (body) => {
    const response = await handler({
      request: request(JSON.stringify(body)),
      params: { sessionKey: 'parent' },
    })

    expect(response.status).toBe(400)
    expect(mocks.forkSession).not.toHaveBeenCalled()
  })

  it('returns a standard feature-unavailable response without fake success', async () => {
    mocks.ensureGatewayProbed.mockResolvedValue({ sessionFork: false })

    const response = await handler({
      request: request('{}'),
      params: { sessionKey: 'parent' },
    })
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      ok: false,
      code: 'capability_unavailable',
      capability: 'sessionFork',
      supported: false,
    })
    expect(mocks.forkSession).not.toHaveBeenCalled()
  })

  it('returns the normalized child and canonical parent for a whole-session fork', async () => {
    mocks.forkSession.mockResolvedValue({
      session: {
        id: 'child',
        title: 'Alternate path',
        parent_session_id: 'parent',
      },
      forkedFrom: null,
    })

    const response = await handler({
      request: request(JSON.stringify({ title: ' Alternate path ' })),
      params: { sessionKey: 'parent' },
    })
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(201)
    expect(mocks.forkSession).toHaveBeenCalledWith('parent', {
      title: 'Alternate path',
    })
    expect(body).toMatchObject({
      ok: true,
      supported: true,
      parentSessionKey: 'parent',
      sessionKey: 'child',
      entry: {
        key: 'child',
        friendlyId: 'child',
        lineage: {
          parentSessionId: 'parent',
          relationshipKind: 'branch',
          sessionSource: 'fork',
        },
      },
    })
  })

  it('does not publish a child returned for a different parent', async () => {
    mocks.forkSession.mockResolvedValue({
      session: {
        id: 'unrelated-child',
        parent_session_id: 'different-parent',
      },
      forkedFrom: 'requested-parent',
    })

    const response = await handler({
      request: request('{}'),
      params: { sessionKey: 'requested-parent' },
    })

    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ ok: false })
    expect(mocks.toSessionSummary).not.toHaveBeenCalled()
  })
})
