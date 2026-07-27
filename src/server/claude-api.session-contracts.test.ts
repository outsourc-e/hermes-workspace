import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SessionForkUnavailableError,
  forkSession,
  getLatestDescendant,
  getMessages,
  getMessagesResult,
  listSessions,
  listSessionsPage,
} from './claude-api'
import type { GatewayCapabilities } from './gateway-capabilities'

const gatewayMocks = vi.hoisted(() => ({
  ensureGatewayProbed: vi.fn(),
  getCapabilities: vi.fn(),
}))

const dashboardMocks = vi.hoisted(() => ({
  getLatestDescendant: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
  getSessionMessages: vi.fn(),
  listSessions: vi.fn(),
  searchSessions: vi.fn(),
  updateSession: vi.fn(),
}))

vi.mock('./gateway-capabilities', () => ({
  BEARER_TOKEN: 'test-token',
  CLAUDE_API: 'http://gateway.test',
  SESSIONS_API_UNAVAILABLE_MESSAGE: 'Sessions unavailable',
  dashboardFetch: vi.fn(),
  ensureGatewayProbed: gatewayMocks.ensureGatewayProbed,
  getCapabilities: gatewayMocks.getCapabilities,
  probeGateway: vi.fn(),
}))

vi.mock('./claude-dashboard-api', () => dashboardMocks)

function capabilities(
  overrides: Partial<GatewayCapabilities> = {},
): GatewayCapabilities {
  return {
    health: true,
    chatCompletions: true,
    models: true,
    streaming: true,
    probed: true,
    sessions: true,
    enhancedChat: false,
    latestDescendant: false,
    sessionFork: false,
    skills: true,
    memory: true,
    config: true,
    jobs: true,
    mcp: false,
    mcpFallback: false,
    conductor: false,
    kanban: false,
    dashboard: { available: true, url: 'http://dashboard.test' },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  const caps = capabilities()
  gatewayMocks.getCapabilities.mockReturnValue(caps)
  gatewayMocks.ensureGatewayProbed.mockResolvedValue(caps)
})

describe('Session Card adapter foundations', () => {
  it('preserves dashboard page metadata while retaining the generic list wrapper', async () => {
    dashboardMocks.listSessions.mockResolvedValue({
      sessions: [{ id: 'first' }, { id: 'second' }],
      total: 3,
      limit: 2,
      offset: 0,
      snapshot: 'sessions-v1',
    })

    await expect(listSessionsPage(2, 0)).resolves.toEqual({
      sessions: [{ id: 'first' }, { id: 'second' }],
      source: 'dashboard',
      total: 3,
      limit: 2,
      offset: 0,
      snapshot: 'sessions-v1',
      hasMore: true,
      pagination: 'supported',
    })
    await expect(listSessions(2, 0)).resolves.toEqual([
      { id: 'first' },
      { id: 'second' },
    ])
  })

  it('keeps using an explicitly pinned page source when capabilities change', async () => {
    dashboardMocks.listSessions
      .mockResolvedValueOnce({
        sessions: [{ id: 'first' }],
        total: 2,
        limit: 1,
        offset: 0,
      })
      .mockResolvedValueOnce({
        sessions: [{ id: 'second' }],
        total: 2,
        limit: 1,
        offset: 1,
      })
    const first = await listSessionsPage(1, 0)
    gatewayMocks.getCapabilities.mockReturnValue(
      capabilities({ dashboard: { available: false, url: 'offline' } }),
    )
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const second = await listSessionsPage(1, 1, first.source)

    expect(second).toMatchObject({
      sessions: [{ id: 'second' }],
      source: 'dashboard',
      offset: 1,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('preserves optional stable message IDs, source, and retrieval failures', async () => {
    dashboardMocks.getSessionMessages.mockResolvedValue({
      session_id: 'resolved-tip',
      messages: [
        { id: 'stable-string', role: 'user', content: 'one' },
        { role: 'assistant', content: 'two' },
      ],
    })

    await expect(getMessagesResult('session')).resolves.toEqual({
      messages: [
        { id: 'stable-string', role: 'user', content: 'one' },
        { role: 'assistant', content: 'two' },
      ],
      source: 'dashboard',
      resolvedSessionId: 'resolved-tip',
    })
    await expect(getMessages('session')).resolves.toEqual([
      { id: 'stable-string', role: 'user', content: 'one' },
      { role: 'assistant', content: 'two' },
    ])

    const failure = new Error('message backend unavailable')
    dashboardMocks.getSessionMessages.mockRejectedValue(failure)
    await expect(getMessagesResult('session')).rejects.toBe(failure)
    await expect(getMessages('session')).rejects.toBe(failure)
  })

  it('preserves the gateway canonical session identity without changing the legacy wrapper', async () => {
    gatewayMocks.getCapabilities.mockReturnValue(
      capabilities({ dashboard: { available: false, url: 'offline' } }),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              object: 'list',
              session_id: 'resolved-tip',
              data: [{ id: 'tip-message', role: 'assistant' }],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    )

    await expect(getMessagesResult('requested-root')).resolves.toEqual({
      messages: [{ id: 'tip-message', role: 'assistant' }],
      source: 'gateway',
      resolvedSessionId: 'resolved-tip',
    })
    await expect(getMessages('requested-root')).resolves.toEqual([
      { id: 'tip-message', role: 'assistant' },
    ])
  })

  it('marks a 100-row gateway message page incomplete when the returned total is 150', async () => {
    gatewayMocks.getCapabilities.mockReturnValue(
      capabilities({ dashboard: { available: false, url: 'offline' } }),
    )
    const messages = Array.from({ length: 100 }, (_, index) => ({
      id: `message-${index + 1}`,
      session_id: 'requested-root',
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: String(index + 1),
      timestamp: index + 1,
    }))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            object: 'list',
            session_id: 'requested-root',
            data: messages,
            total: 150,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    await expect(getMessagesResult('requested-root')).resolves.toMatchObject({
      messages,
      source: 'gateway',
      resolvedSessionId: 'requested-root',
      total: 150,
      truncated: true,
    })
  })
})

describe('getLatestDescendant', () => {
  it('uses the supported dashboard resolver and normalizes its response', async () => {
    const caps = capabilities({ latestDescendant: true })
    gatewayMocks.getCapabilities.mockReturnValue(caps)
    gatewayMocks.ensureGatewayProbed.mockResolvedValue(caps)
    dashboardMocks.getLatestDescendant.mockResolvedValue({
      requested_session_id: 'parent',
      session_id: 'tip',
      path: ['parent', 'tip'],
      changed: true,
    })

    await expect(getLatestDescendant('parent')).resolves.toEqual({
      requestedSessionId: 'parent',
      sessionId: 'tip',
      path: ['parent', 'tip'],
      changed: true,
      supported: true,
    })
    expect(dashboardMocks.getLatestDescendant).toHaveBeenCalledWith('parent')
  })

  it.each([
    ['unsupported capability', false, undefined],
    ['404 or backend failure', true, new Error('404 Session not found')],
    ['malformed response', true, { session_id: '', path: 'not-an-array' }],
  ])('falls back safely for %s', async (_label, supported, result) => {
    const caps = capabilities({ latestDescendant: supported })
    gatewayMocks.getCapabilities.mockReturnValue(caps)
    gatewayMocks.ensureGatewayProbed.mockResolvedValue(caps)
    if (result instanceof Error) {
      dashboardMocks.getLatestDescendant.mockRejectedValue(result)
    } else if (result !== undefined) {
      dashboardMocks.getLatestDescendant.mockResolvedValue(result)
    }

    await expect(getLatestDescendant('parent')).resolves.toEqual({
      requestedSessionId: 'parent',
      sessionId: 'parent',
      path: ['parent'],
      changed: false,
      supported: false,
    })
  })
})

describe('forkSession', () => {
  it('uses the enhanced gateway transport when sessionFork is advertised', async () => {
    const caps = capabilities({ sessionFork: true })
    gatewayMocks.getCapabilities.mockReturnValue(caps)
    gatewayMocks.ensureGatewayProbed.mockResolvedValue(caps)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          object: 'hermes.session',
          session: {
            id: 'child',
            parent_session_id: 'parent',
            title: 'Alternate path',
          },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      forkSession('parent', { title: 'Alternate path' }),
    ).resolves.toEqual({
      session: {
        id: 'child',
        parent_session_id: 'parent',
        title: 'Alternate path',
      },
      forkedFrom: null,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://gateway.test/api/sessions/parent/fork',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Alternate path' }),
      }),
    )
  })

  it('rejects a fork child whose returned parent does not match the requested session', async () => {
    const caps = capabilities({ sessionFork: true })
    gatewayMocks.getCapabilities.mockReturnValue(caps)
    gatewayMocks.ensureGatewayProbed.mockResolvedValue(caps)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            object: 'hermes.session',
            session: {
              id: 'unrelated-child',
              parent_session_id: 'different-parent',
            },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    await expect(forkSession('requested-parent')).rejects.toThrow(
      'did not identify the requested parent',
    )
  })

  it.each([
    ['blank forked_from', { forked_from: '   ' }],
    ['array forked_from', { forked_from: ['parent'] }],
    ['object forked_from', { forked_from: { id: 'parent' } }],
    ['numeric forked_from', { forked_from: 1 }],
  ])('rejects %s alongside a valid parent_session_id', async (_name, patch) => {
    const caps = capabilities({ sessionFork: true })
    gatewayMocks.getCapabilities.mockReturnValue(caps)
    gatewayMocks.ensureGatewayProbed.mockResolvedValue(caps)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            object: 'hermes.session',
            session: { id: 'child', parent_session_id: 'parent' },
            ...patch,
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    await expect(forkSession('parent')).rejects.toThrow(
      'did not identify the requested parent',
    )
  })

  it.each([
    ['blank parent_session_id', '   '],
    ['array parent_session_id', ['parent']],
    ['object parent_session_id', { id: 'parent' }],
    ['numeric parent_session_id', 1],
  ])(
    'rejects %s alongside a valid forked_from',
    async (_name, parentSessionId) => {
      const caps = capabilities({ sessionFork: true })
      gatewayMocks.getCapabilities.mockReturnValue(caps)
      gatewayMocks.ensureGatewayProbed.mockResolvedValue(caps)
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              object: 'hermes.session',
              forked_from: 'parent',
              session: { id: 'child', parent_session_id: parentSessionId },
            }),
            { status: 201, headers: { 'content-type': 'application/json' } },
          ),
        ),
      )

      await expect(forkSession('parent')).rejects.toThrow(
        'did not identify the requested parent',
      )
    },
  )

  it('preserves an explicit forked_from when parent_session_id is null', async () => {
    const caps = capabilities({ sessionFork: true })
    gatewayMocks.getCapabilities.mockReturnValue(caps)
    gatewayMocks.ensureGatewayProbed.mockResolvedValue(caps)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            object: 'hermes.session',
            forked_from: 'parent',
            session: { id: 'child', parent_session_id: null },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    await expect(forkSession('parent')).resolves.toEqual({
      session: { id: 'child', parent_session_id: null },
      forkedFrom: 'parent',
    })
  })

  it('does not mutate either transport when sessionFork is unavailable', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(forkSession('parent')).rejects.toBeInstanceOf(
      SessionForkUnavailableError,
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(dashboardMocks.createSession).not.toHaveBeenCalled()
  })
})
