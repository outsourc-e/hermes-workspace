import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './swarm-checkpoint'
import type * as SessionCardOperationBindingModule from '../../server/session-card-operation-binding'

const mocks = vi.hoisted(() => ({
  appendMemory: vi.fn(),
  checkpointFromSnapshot: vi.fn(),
  missionAcceptsMutation: vi.fn(),
  mutateRuntime: vi.fn(),
  publishNotification: vi.fn(),
  readRuntimeSnapshot: vi.fn(),
  resolveExact: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))
vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: () => true,
}))
vi.mock('../../server/swarm-foundation', () => ({
  getSwarmProfilePath: (workerId: string) => `/profiles/${workerId}`,
}))
vi.mock('../../server/swarm-roster', () => ({
  isSwarmWorkerId: () => true,
}))
vi.mock('../../server/swarm-memory', () => ({
  appendSwarmMemoryEvent: mocks.appendMemory,
}))
vi.mock('../../server/swarm-notifications', () => ({
  publishSwarmCheckpointNotification: mocks.publishNotification,
}))
vi.mock('../../server/swarm-missions', () => ({
  swarmMissionAssignmentAcceptsRuntimeMutation: mocks.missionAcceptsMutation,
}))
vi.mock('../../server/swarm-runtime-reset', () => ({
  mutateSwarmWorkerRuntime: mocks.mutateRuntime,
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
vi.mock('./swarm-dispatch', () => ({
  checkpointFromRuntimeSnapshot: mocks.checkpointFromSnapshot,
  readRuntimeCheckpointSnapshot: mocks.readRuntimeSnapshot,
}))

type Handler = (context: { request: Request }) => Promise<Response>
type TestRoute = { server: { handlers: { POST: Handler } } }
const handler = (Route as unknown as TestRoute).server.handlers.POST

const cardBinding = {
  kind: 'session-card-owner',
  cardId: 'local:builder-card',
  parentCardId: null,
  canonicalSource: 'local',
  canonicalSegmentKey: 'local:builder',
  canonicalTransport: 'tmux',
}

function request(): Request {
  return new Request('http://workspace.test/api/swarm-checkpoint', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      workerId: 'builder',
      cardBinding,
      state: 'executing',
      checkpointStatus: 'in_progress',
      lastSummary: 'late worker update',
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveExact.mockResolvedValue(cardBinding)
  mocks.missionAcceptsMutation.mockReturnValue(true)
  mocks.readRuntimeSnapshot.mockReturnValue({
    currentMissionId: 'mission-a',
    currentAssignmentId: 'assignment-a',
  })
})

describe('POST /api/swarm-checkpoint cancellation races', () => {
  it('rejects a late checkpoint when reset wins during ownership awaits', async () => {
    mocks.mutateRuntime.mockImplementation(
      (_profilePath, mutate) =>
        mutate({
          workerId: 'builder',
          state: 'idle',
          phase: 'cancelled',
          currentMissionId: null,
          currentAssignmentId: null,
          acceptsCheckpoints: false,
        }).value,
    )

    const response = await handler({ request: request() })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      retryable: false,
      error:
        'Checkpoint rejected because the runtime assignment is no longer active',
    })
    expect(mocks.appendMemory).not.toHaveBeenCalled()
    expect(mocks.publishNotification).not.toHaveBeenCalled()
  })

  it('rejects a serialized commit when durable mission state became terminal', async () => {
    mocks.missionAcceptsMutation.mockReturnValue(false)
    mocks.mutateRuntime.mockImplementation(
      (_profilePath, mutate) =>
        mutate({
          workerId: 'builder',
          currentMissionId: 'mission-a',
          currentAssignmentId: 'assignment-a',
          acceptsCheckpoints: true,
        }).value,
    )

    const response = await handler({ request: request() })

    expect(response.status).toBe(409)
    expect(mocks.missionAcceptsMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: 'mission-a',
        assignmentId: 'assignment-a',
        workerId: 'builder',
      }),
    )
    expect(mocks.appendMemory).not.toHaveBeenCalled()
    expect(mocks.publishNotification).not.toHaveBeenCalled()
  })
})
