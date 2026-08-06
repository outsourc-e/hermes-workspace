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
    mocks.readRuntimeSnapshot.mockReturnValue({ checkpointRaw: null })
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

  it('durably cancels native mission creation when a worker binding cannot be established', async () => {
    mocks.ensureGatewayProbed.mockResolvedValue({
      conductor: false,
      dashboard: { available: false },
    })
    mocks.bindAuthority.mockReturnValue(false)
    mocks.cancelMission.mockReturnValue({ changed: true })

    const response = await handlers.POST({
      request: post({ goal: 'Fix runtime' }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'Session Card ownership unavailable for native dispatch',
    })
    expect(mocks.createMission).toHaveBeenCalled()
    expect(mocks.cancelMission).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'conductor-spawn',
        reason: 'Native Conductor worker Session Card binding unavailable',
      }),
    )
    expect(mocks.dispatchAssignments).not.toHaveBeenCalled()
  })
})
