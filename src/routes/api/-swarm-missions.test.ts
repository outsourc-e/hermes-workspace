import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './swarm-missions'
import type * as SessionCardOperationBindingModule from '../../server/session-card-operation-binding'

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  cancelSwarmAssignment: vi.fn(),
  cancelSwarmMission: vi.fn(),
  getSwarmMission: vi.fn(),
  listSwarmMissions: vi.fn(),
  listSwarmReports: vi.fn(),
  hasAuthority: vi.fn(),
  resetRuntime: vi.fn(),
  resolveExact: vi.fn(),
}))

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: mocks.isAuthenticated,
}))
vi.mock('../../server/swarm-missions', () => ({
  SWARM_MISSIONS_PATH: '/tmp/swarm-missions.json',
  cancelSwarmAssignment: mocks.cancelSwarmAssignment,
  cancelSwarmMission: mocks.cancelSwarmMission,
  getSwarmMission: mocks.getSwarmMission,
  listSwarmMissions: mocks.listSwarmMissions,
  listSwarmReports: mocks.listSwarmReports,
  swarmMissionHasExactCardAuthority: mocks.hasAuthority,
}))
vi.mock('../../server/swarm-runtime-reset', () => ({
  resetSwarmWorkerRuntime: mocks.resetRuntime,
}))
vi.mock('../../server/session-card-operation-binding', async () => {
  const actual = await vi.importActual<
    typeof SessionCardOperationBindingModule
  >('../../server/session-card-operation-binding')
  return {
    ...actual,
    resolveExactSessionCardOperationBinding: mocks.resolveExact,
  }
})

const binding = {
  kind: 'session-card-owner' as const,
  cardId: 'local:mission-a-card',
  parentCardId: null,
  canonicalSource: 'local' as const,
  canonicalSegmentKey: 'local:builder',
  canonicalTransport: 'tmux' as const,
}

const handler = (Route.options.server?.handlers as any).POST as (args: {
  request: Request
}) => Promise<Response>

function request(body: unknown): Request {
  return new Request('http://localhost/api/swarm-missions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/swarm-missions Card-bound cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isAuthenticated.mockReturnValue(true)
    mocks.hasAuthority.mockReturnValue(true)
    mocks.resolveExact.mockResolvedValue({
      kind: 'session-card-owner',
      cardId: binding.cardId,
      parentCardId: null,
    })
  })

  it('rejects Card A with mission B before cancelling or resetting a runtime', async () => {
    mocks.hasAuthority.mockReturnValue(false)

    const response = await handler({
      request: request({
        action: 'cancel',
        missionId: 'mission-b',
        cardBinding: binding,
      }),
    })

    expect(response.status).toBe(409)
    expect(mocks.hasAuthority).toHaveBeenCalledWith('mission-b', binding)
    expect(mocks.resolveExact).not.toHaveBeenCalled()
    expect(mocks.cancelSwarmMission).not.toHaveBeenCalled()
    expect(mocks.cancelSwarmAssignment).not.toHaveBeenCalled()
    expect(mocks.resetRuntime).not.toHaveBeenCalled()
  })

  it('revalidates exact Card ownership at the cancellation edge', async () => {
    mocks.resolveExact.mockResolvedValue(null)

    const response = await handler({
      request: request({
        action: 'cancel',
        missionId: 'mission-a',
        cardBinding: binding,
      }),
    })

    expect(response.status).toBe(409)
    expect(mocks.resolveExact).toHaveBeenCalledWith(binding)
    expect(mocks.cancelSwarmMission).not.toHaveBeenCalled()
    expect(mocks.resetRuntime).not.toHaveBeenCalled()
  })

  it('rejects the old authenticated raw mission-id request combination', async () => {
    const response = await handler({
      request: request({ action: 'cancel', missionId: 'mission-a' }),
    })

    expect(response.status).toBe(400)
    expect(mocks.hasAuthority).not.toHaveBeenCalled()
    expect(mocks.cancelSwarmMission).not.toHaveBeenCalled()
  })
})
