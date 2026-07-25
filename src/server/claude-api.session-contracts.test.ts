import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SessionForkUnavailableError,
  forkSession,
  getLatestDescendant,
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
      forkedFrom: 'parent',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://gateway.test/api/sessions/parent/fork',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Alternate path' }),
      }),
    )
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
