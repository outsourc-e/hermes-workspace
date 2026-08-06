import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NATIVE_CONDUCTOR_MODE_NOTE,
  Route,
  buildNativeConductorAssignments,
  toNativeConductorMissionRecord,
} from './conductor-spawn'
import type { SwarmMission } from '../../server/swarm-missions'

const mocks = vi.hoisted(() => ({
  bindAuthority: vi.fn(),
  cancelMission: vi.fn(),
  createAtomicMission: vi.fn(),
  createMission: vi.fn(),
  dashboardFetch: vi.fn(),
  dispatchAssignments: vi.fn(),
  ensureGatewayProbed: vi.fn(),
  getMission: vi.fn(),
  readRuntimeSnapshot: vi.fn(),
  checkpointFromSnapshot: vi.fn(),
  recordCheckpoint: vi.fn(),
  resolveBinding: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))
vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: () => true,
}))
vi.mock('../../server/gateway-capabilities', () => ({
  dashboardFetch: mocks.dashboardFetch,
  ensureGatewayProbed: mocks.ensureGatewayProbed,
}))
vi.mock('../../server/session-card-operation-binding', () => ({
  resolveSessionCardOperationBindingByUpstream: mocks.resolveBinding,
}))
vi.mock('../../server/swarm-missions', () => ({
  bindSwarmMissionCardAuthority: mocks.bindAuthority,
  cancelSwarmMission: mocks.cancelMission,
  createSwarmMissionWithCardAuthorities: mocks.createAtomicMission,
  createOrUpdateMission: mocks.createMission,
  getSwarmMission: mocks.getMission,
  recordMissionCheckpoint: mocks.recordCheckpoint,
}))
vi.mock('../../server/swarm-foundation', () => ({
  getSwarmProfilePath: (workerId: string) => `/profiles/${workerId}`,
}))
vi.mock('../../server/swarm-chat-reader', () => ({
  readWorkerMessages: () => ({ ok: false, messages: [] }),
}))
vi.mock('../../server/swarm-checkpoints', () => ({
  newestCheckpointFromMessages: () => null,
}))
vi.mock('./swarm-dispatch', () => ({
  checkpointFromRuntimeSnapshot: mocks.checkpointFromSnapshot,
  dispatchSwarmAssignments: mocks.dispatchAssignments,
  readRuntimeCheckpointSnapshot: mocks.readRuntimeSnapshot,
  runtimeCheckpointSignature: () => '',
}))

type Handler = (context: { request: Request }) => Promise<Response>
type TestRoute = {
  server: { handlers: { GET: Handler; POST: Handler } }
}
const handlers = (Route as unknown as TestRoute).server.handlers

const localBinding = {
  kind: 'session-card-owner',
  cardId: 'local:builder-card',
  parentCardId: null,
  canonicalSource: 'local',
  canonicalSegmentKey: 'local:builder',
  canonicalTransport: 'tmux',
}

const remoteBinding = {
  kind: 'session-card-owner',
  cardId: 'remote:mission-card',
  parentCardId: null,
  canonicalSource: 'remote',
  canonicalSegmentKey: 'remote:session-1',
  canonicalTransport: 'gateway',
}

function post(body: Record<string, unknown>): Request {
  return new Request('http://workspace.test/api/conductor-spawn', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function nativeMission(): SwarmMission {
  return {
    id: 'conductor-test',
    title: 'Conductor: smoke',
    state: 'executing',
    createdAt: 1,
    updatedAt: 2,
    assignments: [
      {
        id: 'a1',
        workerId: 'builder',
        task: 'Run smoke',
        rationale: 'Builder',
        dependsOn: [],
        reviewRequired: false,
        state: 'dispatched',
        dispatchedAt: 1,
        completedAt: null,
        reviewedAt: null,
        reviewedBy: null,
        checkpoint: null,
      },
    ],
    events: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.bindAuthority.mockReturnValue(true)
  mocks.cancelMission.mockReturnValue(null)
  mocks.createAtomicMission.mockImplementation((input) => ({
    id: input.missionId,
    title: input.title,
    state: 'planning',
    assignments: input.assignments,
    events: [],
    _created: true,
  }))
  mocks.createMission.mockImplementation((input) => ({
    id: input.missionId,
    title: input.title,
    state: 'planning',
    assignments: [],
    events: [],
  }))
  mocks.dispatchAssignments.mockResolvedValue({})
  mocks.ensureGatewayProbed.mockResolvedValue({
    conductor: true,
    dashboard: { available: true },
  })
  mocks.getMission.mockReturnValue(null)
  mocks.resolveBinding.mockImplementation(({ source }) =>
    source === 'local' ? localBinding : remoteBinding,
  )
})

describe('native Conductor fallback', () => {
  it('labels native-swarm as the official OOTB fallback when dashboard Conductor is unavailable', () => {
    expect(NATIVE_CONDUCTOR_MODE_NOTE).toContain(
      'official Workspace-native Swarm fallback',
    )
    expect(NATIVE_CONDUCTOR_MODE_NOTE).toContain('dashboard Conductor API')
  })

  it('decomposes production missions onto named Workspace Swarm lanes', () => {
    const assignments = buildNativeConductorAssignments(
      'Fix conductor and make it production ready',
      {
        maxParallel: 4,
        supervised: false,
      },
    )

    expect(assignments.map((assignment) => assignment.workerId)).toEqual([
      'ops-watch',
      'builder',
      'reviewer',
      'qa',
    ])
    expect(assignments.at(0)?.task).toContain(
      'Conductor mission: Fix conductor',
    )
    expect(assignments.every((assignment) => assignment.direct === true)).toBe(
      true,
    )
    expect(
      assignments.every((assignment) => assignment.reviewRequired === false),
    ).toBe(true)
  })

  it('uses KM Agent when the mission asks for documentation even with a smaller lane count', () => {
    const assignments = buildNativeConductorAssignments(
      'Write docs and handoff for the release',
      {
        maxParallel: 3,
        supervised: true,
      },
    )

    expect(assignments.map((assignment) => assignment.workerId)).toContain(
      'km-agent',
    )
    expect(
      assignments.some((assignment) =>
        assignment.task.includes('Supervised mode'),
      ),
    ).toBe(true)
  })

  it('does not collapse generic two-lane missions to a single worker', () => {
    const assignments = buildNativeConductorAssignments(
      'Create a small UI prototype',
      {
        maxParallel: 2,
        supervised: false,
      },
    )

    expect(assignments.map((assignment) => assignment.workerId)).toEqual([
      'builder',
      'reviewer',
    ])
  })

  it('normalizes native swarm missions into the Conductor mission status contract', () => {
    const mission = nativeMission()
    const record = toNativeConductorMissionRecord(mission)

    expect(record.id).toBe('conductor-test')
    expect(record.status).toBe('running')
    expect(record.nativeSwarm).toBe(true)
    expect(record.modeOfficialOotb).toBe(true)
    expect(record.modeNote).toBe(NATIVE_CONDUCTOR_MODE_NOTE)
    expect(record.lines.join('\n')).toContain('builder dispatched')
  })
})

describe('Conductor mission Card admission', () => {
  it('revalidates worker Card authority immediately before a polled checkpoint mutation', async () => {
    const mission = nativeMission()
    mocks.getMission.mockReturnValue(mission)
    mocks.readRuntimeSnapshot.mockReturnValue({
      checkpointRaw: null,
      currentMissionId: mission.id,
      currentAssignmentId: mission.assignments[0]?.id,
    })
    mocks.checkpointFromSnapshot.mockReturnValue({
      stateLabel: 'DONE',
      checkpointStatus: 'checkpointed',
      runtimeState: 'idle',
      filesChanged: 'none',
      commandsRun: 'pnpm test',
      result: 'passed',
      blocker: null,
      nextAction: null,
      raw: 'STATE: DONE',
    })
    mocks.bindAuthority.mockReturnValueOnce(true).mockReturnValueOnce(false)

    const response = await handlers.GET({
      request: new Request(
        'http://workspace.test/api/conductor-spawn?missionId=conductor-test',
      ),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'Native Conductor worker Session Card binding is unavailable',
      workerId: 'builder',
    })
    expect(mocks.bindAuthority).toHaveBeenCalledTimes(2)
    expect(mocks.recordCheckpoint).not.toHaveBeenCalled()
  })

  it('returns a retryable non-success when a polled checkpoint cannot be persisted', async () => {
    const mission = nativeMission()
    mocks.getMission.mockReturnValue(mission)
    mocks.readRuntimeSnapshot.mockReturnValue({
      checkpointRaw: null,
      currentMissionId: mission.id,
      currentAssignmentId: mission.assignments[0]?.id,
    })
    mocks.checkpointFromSnapshot.mockReturnValue({
      stateLabel: 'DONE',
      checkpointStatus: 'checkpointed',
      runtimeState: 'idle',
      filesChanged: 'none',
      commandsRun: 'pnpm test',
      result: 'passed',
      blocker: null,
      nextAction: null,
      raw: 'STATE: DONE',
    })
    mocks.recordCheckpoint.mockImplementation(() => {
      throw new Error('disk full')
    })

    const response = await handlers.GET({
      request: new Request(
        'http://workspace.test/api/conductor-spawn?missionId=conductor-test',
      ),
    })

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      retryable: true,
      error: 'Unable to persist native Conductor checkpoint',
      workerId: 'builder',
    })
  })

  it('does not misreport a checkpoint read exception as a persistence failure', async () => {
    const mission = nativeMission()
    mocks.getMission.mockReturnValue(mission)
    mocks.readRuntimeSnapshot.mockImplementation(() => {
      throw new Error('runtime file is being replaced')
    })

    const response = await handlers.GET({
      request: new Request(
        'http://workspace.test/api/conductor-spawn?missionId=conductor-test',
      ),
    })

    expect(response.status).toBe(200)
    await expect(response.clone().json()).resolves.toMatchObject({
      mission: { cardOwners: [{ cardId: 'local:builder-card' }] },
    })
    await expect(response.json()).resolves.toMatchObject({ ok: true })
    expect(mocks.recordCheckpoint).not.toHaveBeenCalled()
  })

  it('does not import a checkpoint attributed to another mission assignment', async () => {
    const mission = nativeMission()
    mocks.getMission.mockReturnValue(mission)
    mocks.readRuntimeSnapshot.mockReturnValue({
      checkpointRaw: 'STATE: DONE',
      currentMissionId: mission.id,
      currentAssignmentId: 'stale-assignment',
    })
    mocks.checkpointFromSnapshot.mockReturnValue({
      stateLabel: 'DONE',
      checkpointStatus: 'done',
      runtimeState: 'idle',
      filesChanged: 'none',
      commandsRun: 'none',
      result: 'stale result',
      blocker: null,
      nextAction: null,
      raw: 'STATE: DONE',
    })

    const response = await handlers.GET({
      request: new Request(
        'http://workspace.test/api/conductor-spawn?missionId=conductor-test',
      ),
    })

    expect(response.status).toBe(200)
    expect(mocks.checkpointFromSnapshot).not.toHaveBeenCalled()
    expect(mocks.recordCheckpoint).not.toHaveBeenCalled()
  })

  it('rejects dashboard polling when the mission Card binding cannot be refreshed', async () => {
    mocks.dashboardFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ id: 'mission-1', session_id: 'session-1' }),
        { status: 200 },
      ),
    )
    mocks.bindAuthority.mockReturnValue(false)

    const response = await handlers.GET({
      request: new Request(
        'http://workspace.test/api/conductor-spawn?missionId=mission-1',
      ),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Dashboard Conductor mission Session Card binding is unavailable',
    })
  })

  it('deletes a dashboard mission and rejects admission when session identity is missing', async () => {
    mocks.dashboardFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'mission-1', name: 'mission' }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    const response = await handlers.POST({ request: post({ goal: 'Ship it' }) })

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error:
        'Dashboard Conductor mission did not provide a Session Card binding',
      missionId: 'mission-1',
      compensated: true,
    })
    expect(mocks.dashboardFetch).toHaveBeenLastCalledWith(
      '/api/conductor/missions/mission-1',
      { method: 'DELETE' },
    )
  })

  it('deletes a dashboard mission and rejects admission when exact Card binding fails', async () => {
    mocks.dashboardFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'mission-1',
            name: 'mission',
            session_id: 'session-1',
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    mocks.bindAuthority.mockReturnValue(false)

    const response = await handlers.POST({ request: post({ goal: 'Ship it' }) })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'Dashboard Conductor mission Session Card binding is unavailable',
      compensated: true,
    })
    expect(mocks.dispatchAssignments).not.toHaveBeenCalled()
  })

  it('creates native mission authority and assignments in one atomic commit', async () => {
    mocks.ensureGatewayProbed.mockResolvedValue({
      conductor: false,
      dashboard: { available: false },
    })

    const response = await handlers.POST({
      request: post({ goal: 'Fix runtime', maxParallel: 2 }),
    })

    expect(response.status).toBe(200)
    await expect(response.clone().json()).resolves.toMatchObject({
      cardOwners: [{ cardId: 'local:builder-card' }],
    })
    expect(mocks.createAtomicMission).toHaveBeenCalledWith(
      expect.objectContaining({
        assignments: expect.arrayContaining([
          expect.objectContaining({ workerId: 'ops-watch' }),
          expect.objectContaining({ workerId: 'builder' }),
        ]),
        authorities: expect.arrayContaining([
          expect.objectContaining({
            anchorSource: 'local',
            anchorKey: 'ops-watch',
          }),
          expect.objectContaining({
            anchorSource: 'local',
            anchorKey: 'builder',
          }),
        ]),
      }),
    )
    expect(mocks.createMission).not.toHaveBeenCalled()
    expect(mocks.bindAuthority).not.toHaveBeenCalled()
    expect(mocks.dispatchAssignments).toHaveBeenCalledTimes(1)
  })

  it('durably cancels an admitted native mission when asynchronous dispatch rejects', async () => {
    mocks.ensureGatewayProbed.mockResolvedValue({
      conductor: false,
      dashboard: { available: false },
    })
    mocks.dispatchAssignments.mockRejectedValue(
      new Error('simulated asynchronous dispatch failure'),
    )
    mocks.cancelMission.mockReturnValue({ changed: true })

    const response = await handlers.POST({
      request: post({ goal: 'Fix runtime', maxParallel: 1 }),
    })
    const payload = (await response.json()) as { missionId?: string }

    expect(response.status).toBe(200)
    await vi.waitFor(() =>
      expect(mocks.cancelMission).toHaveBeenCalledWith({
        missionId: payload.missionId,
        actor: 'conductor-dispatch-compensation',
        reason:
          'Native Conductor dispatch failed: simulated asynchronous dispatch failure',
      }),
    )
  })

  it('persists nothing when any native worker binding cannot be resolved', async () => {
    mocks.ensureGatewayProbed.mockResolvedValue({
      conductor: false,
      dashboard: { available: false },
    })
    mocks.resolveBinding.mockResolvedValue(null)

    const response = await handlers.POST({
      request: post({ goal: 'Fix runtime' }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'Session Card ownership unavailable for native dispatch',
    })
    expect(mocks.createAtomicMission).not.toHaveBeenCalled()
    expect(mocks.createMission).not.toHaveBeenCalled()
    expect(mocks.bindAuthority).not.toHaveBeenCalled()
    expect(mocks.cancelMission).not.toHaveBeenCalled()
    expect(mocks.dispatchAssignments).not.toHaveBeenCalled()
  })
})
