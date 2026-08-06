import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Route } from './conductor-stop'

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  deleteSession: vi.fn(),
  ensureGatewayProbed: vi.fn(),
  dashboardFetch: vi.fn(),
  cancelSwarmMission: vi.fn(),
  swarmMissionHasExactCardAuthority: vi.fn(),
  resetSwarmWorkerRuntime: vi.fn(),
  resolveCard: vi.fn(),
  resolveChildCard: vi.fn(),
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
vi.mock('../../server/session-card-service', () => ({
  sessionCardService: {
    resolveCard: mocks.resolveCard,
    resolveChildCard: mocks.resolveChildCard,
  },
}))
vi.mock('../../server/swarm-missions', () => ({
  cancelSwarmMission: mocks.cancelSwarmMission,
  swarmMissionHasExactCardAuthority: mocks.swarmMissionHasExactCardAuthority,
}))
vi.mock('../../server/swarm-runtime-reset', () => ({
  resetSwarmWorkerRuntime: mocks.resetSwarmWorkerRuntime,
}))

type StopHandler = (context: { request: Request }) => Promise<Response>
type TestRoute = { server: { handlers: { POST: StopHandler } } }
const handler = (Route as unknown as TestRoute).server.handlers.POST

const binding = {
  kind: 'session-card-owner',
  cardId: 'remote:mission-card',
  parentCardId: null,
  canonicalSource: 'remote',
  canonicalSegmentKey: 'remote:worker-a',
  canonicalTransport: 'gateway',
}

function resolvedRemoteCard(overrides: Record<string, unknown> = {}) {
  const cardId = (overrides.cardId as string | undefined) ?? binding.cardId
  const segment =
    (overrides.canonicalSegmentKey as string | undefined) ??
    binding.canonicalSegmentKey
  return {
    card: {
      cardId,
      canonicalSource: 'remote',
      canonicalTransport: 'gateway',
      canonicalSegmentKey: segment,
      continuationSegmentKeys: [cardId, segment],
      continuationCount: 2,
      relationshipKind: 'root',
      ...overrides,
    },
    collection: { completeness: 'complete', retryable: false },
  }
}

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
  mocks.swarmMissionHasExactCardAuthority.mockReturnValue(true)
  mocks.dashboardFetch.mockResolvedValue(new Response(null, { status: 204 }))
  mocks.deleteSession.mockResolvedValue(undefined)
  mocks.resolveCard.mockResolvedValue(resolvedRemoteCard())
  mocks.resolveChildCard.mockResolvedValue(resolvedRemoteCard())
})

describe('POST /api/conductor-stop Card authority', () => {
  it('stops a mission and deletes only the exact current Card canonical session', async () => {
    const response = await handler({
      request: request({
        cardBindings: [binding],
        missionIds: ['mission-1'],
        missionCardId: binding.cardId,
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      deleted: 1,
      stoppedMissions: 1,
      failures: [],
    })
    expect(mocks.resolveCard).toHaveBeenCalledTimes(2)
    expect(mocks.dashboardFetch).toHaveBeenCalledWith(
      '/api/conductor/missions/mission-1',
      { method: 'DELETE' },
    )
    expect(mocks.deleteSession).toHaveBeenCalledWith('worker-a')
  })

  it('fails closed for direct raw alias injection', async () => {
    const response = await handler({
      request: request({ sessionKeys: ['worker-a'], missionIds: [] }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Invalid Session Card stop binding',
    })
    expect(mocks.ensureGatewayProbed).not.toHaveBeenCalled()
    expect(mocks.deleteSession).not.toHaveBeenCalled()
  })

  it('re-resolves exact ownership after capability setup and refuses stale deletion', async () => {
    mocks.resolveCard.mockResolvedValue(
      resolvedRemoteCard({
        cardId: 'remote:replacement-card',
        continuationSegmentKeys: [
          'remote:replacement-card',
          binding.canonicalSegmentKey,
        ],
      }),
    )

    const response = await handler({
      request: request({ cardBindings: [binding], missionIds: [] }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      ok: false,
      deleted: 0,
      failures: [
        {
          operation: 'delete-session',
          id: binding.cardId,
          error: 'Session Card stop binding is unavailable',
        },
      ],
    })
    expect(mocks.ensureGatewayProbed).toHaveBeenCalled()
    expect(mocks.deleteSession).not.toHaveBeenCalled()
  })

  it('does not stop a mission after Card ownership becomes unavailable', async () => {
    mocks.resolveCard.mockRejectedValue(new Error('rolled over'))

    const response = await handler({
      request: request({
        cardBindings: [binding],
        missionIds: ['mission-1'],
        missionCardId: binding.cardId,
      }),
    })

    expect(response.status).toBe(409)
    expect(mocks.cancelSwarmMission).not.toHaveBeenCalled()
    expect(mocks.dashboardFetch).not.toHaveBeenCalled()
    expect(mocks.deleteSession).not.toHaveBeenCalled()
  })

  it('rejects Card A paired with server-owned mission B before any cancellation or dashboard deletion', async () => {
    mocks.swarmMissionHasExactCardAuthority.mockReturnValue(false)

    const response = await handler({
      request: request({
        cardBindings: [binding],
        missionIds: ['mission-b'],
        missionCardId: binding.cardId,
      }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Session Card is not authorized for this mission',
    })
    expect(mocks.swarmMissionHasExactCardAuthority).toHaveBeenCalledWith(
      'mission-b',
      binding,
    )
    expect(mocks.ensureGatewayProbed).not.toHaveBeenCalled()
    expect(mocks.resolveCard).not.toHaveBeenCalled()
    expect(mocks.cancelSwarmMission).not.toHaveBeenCalled()
    expect(mocks.dashboardFetch).not.toHaveBeenCalled()
    expect(mocks.deleteSession).not.toHaveBeenCalled()
  })

  it('preserves safe Card identity in deletion failures without leaking aliases', async () => {
    mocks.deleteSession.mockRejectedValue(new Error('gateway refused worker-a'))

    const response = await handler({
      request: request({ cardBindings: [binding], missionIds: [] }),
    })
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body).toMatchObject({
      ok: false,
      failures: [
        {
          operation: 'delete-session',
          id: binding.cardId,
          error: 'Unable to delete Session Card runtime',
        },
      ],
    })
  })
})
