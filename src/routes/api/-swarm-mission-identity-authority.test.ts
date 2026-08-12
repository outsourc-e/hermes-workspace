import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Route as DispatchRoute } from './swarm-dispatch'
import { Route as OrchestratorRoute } from './swarm-orchestrator-loop'
import type { SessionCardOperationBinding } from '../../server/session-card-operation-binding'

const mocks = vi.hoisted(() => ({
  appendMissionContinuation: vi.fn(),
  bindMissionAuthority: vi.fn(),
  createOrUpdateMission: vi.fn(),
  createMissionWithAuthorities: vi.fn(),
  getMission: vi.fn(),
  hasMissionAuthority: vi.fn(),
  markMissionAssignmentDispatched: vi.fn(),
  markMissionAssignmentsReviewedByWorker: vi.fn(),
  missionAcceptsRuntimeMutation: vi.fn(),
  mutateRuntime: vi.fn(),
  readWorkerMessages: vi.fn(),
  recordMissionAssignmentBlocked: vi.fn(),
  recordMissionCheckpoint: vi.fn(),
  resolveBinding: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))
vi.mock('../../server/auth-middleware', () => ({ isAuthenticated: () => true }))
vi.mock('../../server/session-card-operation-binding', () => ({
  parseSessionCardOperationBinding: (value: unknown) => value,
  resolveExactSessionCardOperationBinding: mocks.resolveBinding,
}))
vi.mock('../../server/swarm-chat-reader', () => ({
  readWorkerMessages: mocks.readWorkerMessages,
}))
vi.mock('../../server/swarm-missions', () => ({
  appendMissionContinuation: mocks.appendMissionContinuation,
  bindSwarmMissionCardAuthority: mocks.bindMissionAuthority,
  createOrUpdateMission: mocks.createOrUpdateMission,
  createSwarmMissionWithCardAuthorities: mocks.createMissionWithAuthorities,
  createSwarmMissionId: () => 'mission-generated',
  getSwarmMission: mocks.getMission,
  markMissionAssignmentDispatched: mocks.markMissionAssignmentDispatched,
  markMissionAssignmentsReviewedByWorker:
    mocks.markMissionAssignmentsReviewedByWorker,
  recordMissionAssignmentBlocked: mocks.recordMissionAssignmentBlocked,
  recordMissionCheckpoint: mocks.recordMissionCheckpoint,
  swarmMissionAssignmentAcceptsRuntimeMutation:
    mocks.missionAcceptsRuntimeMutation,
  swarmMissionHasExactCardAuthority: mocks.hasMissionAuthority,
}))
vi.mock('../../server/swarm-runtime-reset', () => ({
  mutateSwarmWorkerRuntime: mocks.mutateRuntime,
}))

const binding: SessionCardOperationBinding = {
  kind: 'session-card-owner',
  cardId: 'local:builder-card',
  parentCardId: null,
  canonicalSource: 'local',
  canonicalSegmentKey: 'local:builder',
  canonicalTransport: 'tmux',
}

type Handler = (context: { request: Request }) => Promise<Response>
type TestRoute = { server: { handlers: { POST: Handler } } }
const dispatchHandler = (DispatchRoute as unknown as TestRoute).server.handlers
  .POST
const orchestratorHandler = (OrchestratorRoute as unknown as TestRoute).server
  .handlers.POST

function post(path: string, body: Record<string, unknown>): Request {
  return new Request(`http://workspace.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveBinding.mockResolvedValue({ kind: 'session-card-owner' })
  mocks.getMission.mockReturnValue({ id: 'mission-victim' })
  mocks.hasMissionAuthority.mockReturnValue(false)
  mocks.bindMissionAuthority.mockReturnValue(true)
  mocks.createMissionWithAuthorities.mockReturnValue(null)
  mocks.missionAcceptsRuntimeMutation.mockReturnValue(true)
  mocks.mutateRuntime.mockImplementation(
    (_path: string, mutation: (current: Record<string, unknown>) => unknown) =>
      (mutation({}) as { value: unknown }).value,
  )
})

describe('Swarm mission identity authority', () => {
  it('rejects dispatch into an unrelated caller-selected mission before mutating it', async () => {
    const response = await dispatchHandler({
      request: post('/api/swarm-dispatch', {
        missionId: 'mission-victim',
        assignments: [
          {
            workerId: 'builder',
            task: 'append an unauthorized assignment',
            cardBinding: binding,
          },
        ],
      }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Swarm mission Card authority changed',
    })
    expect(mocks.hasMissionAuthority).toHaveBeenCalledWith(
      'mission-victim',
      binding,
    )
    expect(mocks.createOrUpdateMission).not.toHaveBeenCalled()
    expect(mocks.markMissionAssignmentDispatched).not.toHaveBeenCalled()
  })

  it('atomically rejects a new mission when its complete Card authority set cannot be persisted', async () => {
    mocks.getMission.mockReturnValue(null)

    const response = await dispatchHandler({
      request: post('/api/swarm-dispatch', {
        assignments: [
          {
            workerId: 'builder',
            task: 'create an authorized mission',
            cardBinding: binding,
          },
        ],
      }),
    })

    expect(response.status).toBe(409)
    expect(mocks.createMissionWithAuthorities).toHaveBeenCalledWith({
      missionId: 'mission-generated',
      title: 'create an authorized mission',
      assignments: [
        {
          workerId: 'builder',
          task: 'create an authorized mission',
          cardBinding: binding,
        },
      ],
      authorities: [
        {
          anchorSource: 'local',
          anchorKey: 'builder',
          binding,
        },
      ],
    })
    expect(mocks.bindMissionAuthority).not.toHaveBeenCalled()
    expect(mocks.createOrUpdateMission).not.toHaveBeenCalled()
  })

  it('rejects an unrelated orchestrator-loop mission before worker or continuation mutations', async () => {
    const response = await orchestratorHandler({
      request: post('/api/swarm-orchestrator-loop', {
        missionId: 'mission-victim',
        cardBindings: [binding],
        autoContinue: true,
      }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Swarm mission Card authority changed',
    })
    expect(mocks.hasMissionAuthority).toHaveBeenCalledWith(
      'mission-victim',
      binding,
    )
    expect(mocks.readWorkerMessages).not.toHaveBeenCalled()
    expect(mocks.appendMissionContinuation).not.toHaveBeenCalled()
    expect(mocks.recordMissionCheckpoint).not.toHaveBeenCalled()
  })
})
