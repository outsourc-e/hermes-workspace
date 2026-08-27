import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchMock, getCapabilitiesMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getCapabilitiesMock: vi.fn(),
}))

vi.mock('../gateway-capabilities', () => ({
  BEARER_TOKEN: 'test-token',
  CLAUDE_API: 'http://hermes-agent:8642',
  SESSIONS_API_UNAVAILABLE_MESSAGE: 'sessions unavailable',
  dashboardFetch: vi.fn(),
  ensureGatewayProbed: vi.fn(),
  getCapabilities: getCapabilitiesMock,
  probeGateway: vi.fn(),
}))

vi.mock('../claude-dashboard-api', () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  forkSession: vi.fn(),
  getSession: vi.fn(),
  getSessionMessages: vi.fn(),
  listSessions: vi.fn(),
  searchSessions: vi.fn(),
  updateSession: vi.fn(),
}))

describe('claude-api session routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('uses the gateway session API when it is available', async () => {
    getCapabilitiesMock.mockReturnValue({
      sessions: true,
      dashboard: { available: true },
    })

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          object: 'list',
          data: [
            {
              id: 'session-1',
              title: 'Gateway session',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    )

    const { listSessions } = await import('../claude-api')

    const sessions = await listSessions(2, 0)

    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.id).toBe('session-1')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://hermes-agent:8642/api/sessions?limit=2&offset=0',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }),
    )
  })

  it('falls back to the dashboard when the gateway session request fails', async () => {
    const dashboardListSessions = (
      await import('../claude-dashboard-api')
    ).listSessions

    getCapabilitiesMock.mockReturnValue({
      sessions: true,
      dashboard: { available: true },
    })

    fetchMock.mockRejectedValueOnce(new Error('gateway unavailable'))

    vi.mocked(dashboardListSessions).mockResolvedValue({
      sessions: [
        {
          id: 'dashboard-session',
        },
      ],
      total: 1,
      limit: 2,
      offset: 0,
    })

    const { listSessions } = await import('../claude-api')

    const sessions = await listSessions(2, 0)

    expect(sessions[0]?.id).toBe('dashboard-session')
    expect(dashboardListSessions).toHaveBeenCalledWith(2, 0)
  })
})
