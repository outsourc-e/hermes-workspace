import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Route } from './conductor-stop'

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  deleteSession: vi.fn(),
  ensureGatewayProbed: vi.fn(),
  dashboardFetch: vi.fn(),
  cancelSwarmMission: vi.fn(),
  resetSwarmWorkerRuntime: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: mocks.isAuthenticated,
}))

vi.mock('../../server/claude-api', () => ({
  deleteSession: mocks.deleteSession,
}))

vi.mock('../../server/gateway-capabilities', () => ({
  ensureGatewayProbed: mocks.ensureGatewayProbed,
  dashboardFetch: mocks.dashboardFetch,
}))

vi.mock('../../server/swarm-missions', () => ({
  cancelSwarmMission: mocks.cancelSwarmMission,
}))

vi.mock('../../server/swarm-runtime-reset', () => ({
  resetSwarmWorkerRuntime: mocks.resetSwarmWorkerRuntime,
}))

type StopHandler = (context: { request: Request }) => Promise<Response>
type TestRoute = { server: { handlers: { POST: StopHandler } } }
const handler = (Route as unknown as TestRoute).server.handlers.POST

function request(body: Record<string, unknown>): Request {
  return new Request('http://workspace.test/api/conductor-stop', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isAuthenticated.mockReturnValue(true)
  mocks.ensureGatewayProbed.mockResolvedValue({
    conductor: true,
    dashboard: { available: true },
  })
  mocks.cancelSwarmMission.mockReturnValue(null)
  mocks.dashboardFetch.mockResolvedValue(new Response(null, { status: 204 }))
  mocks.deleteSession.mockResolvedValue(undefined)
})

describe('POST /api/conductor-stop', () => {
  it('reports partial session deletion instead of claiming terminal success', async () => {
    mocks.deleteSession.mockImplementation((sessionKey: string) =>
      sessionKey === 'worker-b'
        ? Promise.reject(new Error('gateway refused worker-b'))
        : Promise.resolve(),
    )

    const response = await handler({
      request: request({
        missionIds: [' mission-1 ', 'mission-1'],
        sessionKeys: ['worker-a', 'worker-b'],
      }),
    })
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(502)
    expect(body).toMatchObject({
      ok: false,
      deleted: 1,
      stoppedMissions: 1,
      failures: [
        {
          operation: 'delete-session',
          id: 'worker-b',
          error: 'gateway refused worker-b',
        },
      ],
    })
    expect(mocks.dashboardFetch).toHaveBeenCalledTimes(1)
    expect(mocks.deleteSession).toHaveBeenCalledTimes(2)
  })

  it('reports a failed mission DELETE while continuing session cleanup', async () => {
    mocks.dashboardFetch.mockResolvedValue(
      new Response('dashboard stop failed', { status: 503 }),
    )

    const response = await handler({
      request: request({
        missionIds: ['mission-1'],
        sessionKeys: ['worker-a'],
      }),
    })
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(502)
    expect(body).toMatchObject({
      ok: false,
      deleted: 1,
      stoppedMissions: 0,
      failures: [
        {
          operation: 'stop-mission',
          id: 'mission-1',
          error: 'dashboard stop failed',
        },
      ],
    })
    expect(mocks.deleteSession).toHaveBeenCalledWith('worker-a')
  })

  it('returns success only when every requested stop operation succeeds', async () => {
    const response = await handler({
      request: request({
        missionIds: ['mission-1'],
        sessionKeys: ['worker-a'],
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      deleted: 1,
      stoppedMissions: 1,
      failures: [],
    })
  })
})
