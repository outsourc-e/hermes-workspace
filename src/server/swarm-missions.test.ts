import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tempRoot: string

async function loadModule() {
  vi.resetModules()
  tempRoot = mkdtempSync(join(tmpdir(), 'swarm-missions-test-'))
  vi.doMock('./swarm-environment', () => ({
    SWARM_CANONICAL_REPO: tempRoot,
  }))
  return await import('./swarm-missions')
}

describe('swarm-missions', () => {
  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'swarm-missions-test-'))
  })

  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('./swarm-environment')
    try { rmSync(tempRoot, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('records checkpoints by assignment id, stores report metadata, and exposes flattened reports', async () => {
    const mod = await loadModule()
    const mission = mod.createOrUpdateMission({
      missionId: 'mission-report-1',
      title: 'Mission report test',
      assignments: [{ workerId: 'swarm2', task: 'Land backend patch', reviewRequired: false }],
    })
    const assignmentId = mission.assignments[0]?.id
    expect(assignmentId).toBeTruthy()

    const updated = mod.recordMissionCheckpoint({
      missionId: mission.id,
      assignmentId,
      workerId: 'swarm2',
      checkpoint: {
        stateLabel: 'DONE',
        runtimeState: 'idle',
        checkpointStatus: 'done',
        filesChanged: 'src/server/swarm-missions.ts',
        commandsRun: 'pnpm vitest src/server/swarm-missions.test.ts',
        result: 'Recorded canonical checkpoint',
        blocker: null,
        nextAction: 'handoff to reviewer',
        raw: 'STATE: DONE\nFILES_CHANGED: src/server/swarm-missions.ts\nCOMMANDS_RUN: pnpm vitest src/server/swarm-missions.test.ts\nRESULT: Recorded canonical checkpoint\nBLOCKER: none\nNEXT_ACTION: handoff to reviewer',
      },
      source: 'swarm-orchestrator-loop',
    })

    expect(updated).not.toBeNull()
    expect(updated?.state).toBe('complete')
    expect(updated?.assignments[0]?.state).toBe('checkpointed')
    expect(updated?._completed).toBe(true)

    const checkpointEvent = updated?.events.find((event) => event.type === 'checkpoint')
    expect(checkpointEvent?.data?.source).toBe('swarm-orchestrator-loop')
    expect(checkpointEvent?.data?.result).toBe('Recorded canonical checkpoint')
    expect(checkpointEvent?.data?.commandsRun).toBe('pnpm vitest src/server/swarm-missions.test.ts')

    const reports = mod.listSwarmReports({ missionId: mission.id })
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      missionId: mission.id,
      assignmentId,
      workerId: 'swarm2',
      stateLabel: 'DONE',
      source: 'swarm-orchestrator-loop',
      result: 'Recorded canonical checkpoint',
    })
  })

  it('deduplicates identical checkpoint raws for the same assignment', async () => {
    const mod = await loadModule()
    const mission = mod.createOrUpdateMission({
      missionId: 'mission-report-2',
      title: 'Dedup test',
      assignments: [{ workerId: 'swarm2', task: 'Land backend patch', reviewRequired: false }],
    })
    const assignmentId = mission.assignments[0]?.id as string
    const checkpoint = {
      stateLabel: 'DONE' as const,
      runtimeState: 'idle' as const,
      checkpointStatus: 'done' as const,
      filesChanged: 'none',
      commandsRun: 'none',
      result: 'Same checkpoint',
      blocker: null,
      nextAction: 'none',
      raw: 'STATE: DONE\nFILES_CHANGED: none\nCOMMANDS_RUN: none\nRESULT: Same checkpoint\nBLOCKER: none\nNEXT_ACTION: none',
    }

    const first = mod.recordMissionCheckpoint({ missionId: mission.id, assignmentId, workerId: 'swarm2', checkpoint, source: 'swarm-checkpoint-api' })
    const second = mod.recordMissionCheckpoint({ missionId: mission.id, assignmentId, workerId: 'swarm2', checkpoint, source: 'swarm-checkpoint-api' })

    expect(first?.events.filter((event) => event.type === 'checkpoint')).toHaveLength(1)
    expect(second?.events.filter((event) => event.type === 'checkpoint')).toHaveLength(1)
    expect(mod.listSwarmReports({ missionId: mission.id })).toHaveLength(1)
    expect(existsSync(mod.SWARM_MISSIONS_PATH)).toBe(true)
  })

  it('keeps dependent work queued until review-required assignments are reviewed', async () => {
    const mod = await loadModule()
    const mission = mod.createOrUpdateMission({
      missionId: 'mission-review-gate',
      title: 'Review gate test',
      assignments: [
        { workerId: 'swarm2', task: 'Implement orchestration patch', reviewRequired: true },
        { workerId: 'swarm8', task: 'Ship final action', dependsOn: [], reviewRequired: false },
      ],
    })
    const implementation = mission.assignments[0]
    const finalAction = mission.assignments[1]
    finalAction.dependsOn = [implementation.id]

    const checkpoint = {
      stateLabel: 'DONE' as const,
      runtimeState: 'idle' as const,
      checkpointStatus: 'done' as const,
      filesChanged: 'src/routes/api/swarm-orchestrator-loop.ts',
      commandsRun: 'pnpm vitest run src/server/swarm-missions.test.ts',
      result: 'Implementation complete',
      blocker: null,
      nextAction: 'Request QA review',
      raw: 'STATE: DONE\nFILES_CHANGED: src/routes/api/swarm-orchestrator-loop.ts\nCOMMANDS_RUN: pnpm vitest run src/server/swarm-missions.test.ts\nRESULT: Implementation complete\nBLOCKER: none\nNEXT_ACTION: Request QA review',
    }

    const checkpointed = mod.recordMissionCheckpoint({
      missionId: mission.id,
      assignmentId: implementation.id,
      workerId: 'swarm2',
      checkpoint,
      source: 'swarm-checkpoint-api',
    })

    expect(checkpointed?.state).toBe('reviewing')
    expect(checkpointed?.assignments[0]?.state).toBe('checkpointed')
    expect(checkpointed?.assignments[1]?.state).toBe('queued')

    const reviewed = mod.markMissionAssignmentsReviewedByWorker({
      missionId: mission.id,
      reviewerId: 'swarm11',
    })

    expect(reviewed?.reviewedAssignmentIds).toEqual([implementation.id])
    expect(reviewed?.mission.assignments[0]).toMatchObject({
      state: 'done',
      reviewedBy: 'swarm11',
    })
    expect(mod.readyQueuedAssignments(mission.id).map((assignment) => assignment.id)).toEqual([finalAction.id])
  })

  it('cancels active missions without accepting stale checkpoints afterward', async () => {
    const mod = await loadModule()
    const mission = mod.createOrUpdateMission({
      missionId: 'mission-cancel-1',
      title: 'Cancel test',
      assignments: [
        { workerId: 'swarm2', task: 'Active backend task', reviewRequired: false },
        { workerId: 'swarm5', task: 'Queued builder task', reviewRequired: false },
      ],
    })
    mod.markMissionAssignmentDispatched({ missionId: mission.id, workerId: 'swarm2', task: 'Active backend task' })

    const cancelled = mod.cancelSwarmMission({
      missionId: mission.id,
      actor: 'test',
      reason: 'User cancelled bad swarm run',
    })

    expect(cancelled?.mission.state).toBe('cancelled')
    expect(cancelled?.cancelledAssignmentIds).toHaveLength(2)
    expect(cancelled?.mission.assignments.map((assignment) => assignment.state)).toEqual(['cancelled', 'cancelled'])
    expect(cancelled?.mission.events.at(-1)?.type).toBe('mission_cancelled')

    const staleCheckpoint = mod.recordMissionCheckpoint({
      missionId: mission.id,
      assignmentId: mission.assignments[0]?.id,
      workerId: 'swarm2',
      checkpoint: {
        stateLabel: 'DONE',
        runtimeState: 'idle',
        checkpointStatus: 'done',
        filesChanged: 'none',
        commandsRun: 'none',
        result: 'Stale checkpoint after cancel',
        blocker: null,
        nextAction: 'none',
        raw: 'STATE: DONE\nRESULT: stale',
      },
      source: 'stale-worker',
    })

    expect(staleCheckpoint?._ignoredReason).toContain('cancelled')
    const persisted = mod.getSwarmMission(mission.id)
    expect(persisted?.state).toBe('cancelled')
    expect(persisted?.assignments[0]?.state).toBe('cancelled')
    expect(persisted?.events.filter((event) => event.type === 'checkpoint')).toHaveLength(0)
  })

  it('cancels a single assignment and leaves unaffected work active', async () => {
    const mod = await loadModule()
    const mission = mod.createOrUpdateMission({
      missionId: 'mission-cancel-assignment',
      title: 'Assignment cancel test',
      assignments: [
        { workerId: 'swarm2', task: 'Cancel this', reviewRequired: false },
        { workerId: 'swarm5', task: 'Keep this queued', reviewRequired: false },
      ],
    })

    const cancelled = mod.cancelSwarmAssignment({
      missionId: mission.id,
      assignmentId: mission.assignments[0]?.id,
      actor: 'test',
      reason: 'Only one bad lane',
    })

    expect(cancelled?.assignment?.state).toBe('cancelled')
    expect(cancelled?.mission.state).toBe('planning')
    expect(cancelled?.mission.assignments.map((assignment) => assignment.state)).toEqual(['cancelled', 'queued'])
    expect(cancelled?.mission.events.at(-1)?.type).toBe('assignment_cancelled')
  })

  it('archives stale executing missions when all assignments are terminal', async () => {
    const mod = await loadModule()
    const staleMission = {
      version: 1,
      missions: [{
        id: 'mission-stale-terminal',
        title: 'Stale executing mission',
        state: 'executing',
        createdAt: 1,
        updatedAt: 1,
        assignments: [
          {
            id: 'assign-1',
            workerId: 'swarm2',
            task: 'Done work',
            rationale: null,
            dependsOn: [],
            reviewRequired: false,
            state: 'done',
            dispatchedAt: 1,
            completedAt: 1,
            reviewedAt: 1,
            reviewedBy: 'swarm6',
            checkpoint: null,
          },
          {
            id: 'assign-2',
            workerId: 'swarm3',
            task: 'Blocked work',
            rationale: null,
            dependsOn: [],
            reviewRequired: false,
            state: 'blocked',
            dispatchedAt: 1,
            completedAt: 1,
            reviewedAt: null,
            reviewedBy: null,
            checkpoint: null,
          },
        ],
        events: [],
      }],
    }

    mkdirSync(join(tempRoot, '.runtime'), { recursive: true })
    writeFileSync(mod.SWARM_MISSIONS_PATH, JSON.stringify(staleMission, null, 2))

    expect(mod.archiveStaleMissions()).toEqual({
      archivedIds: ['mission-stale-terminal'],
      count: 1,
    })

    const persisted = JSON.parse(readFileSync(mod.SWARM_MISSIONS_PATH, 'utf8'))
    expect(persisted.missions[0]?.state).toBe('complete')
    expect(persisted.missions[0]?.events.at(-1)?.message).toContain('Archived as stale')
  })

  it('leaves recent executing missions alone', async () => {
    const mod = await loadModule()
    const recentUpdatedAt = Date.now() - (60 * 60 * 1000)
    const recentMission = {
      version: 1,
      missions: [{
        id: 'mission-recent-terminal',
        title: 'Recent executing mission',
        state: 'executing',
        createdAt: recentUpdatedAt,
        updatedAt: recentUpdatedAt,
        assignments: [{
          id: 'assign-1',
          workerId: 'swarm2',
          task: 'Done work',
          rationale: null,
          dependsOn: [],
          reviewRequired: false,
          state: 'done',
          dispatchedAt: recentUpdatedAt,
          completedAt: recentUpdatedAt,
          reviewedAt: recentUpdatedAt,
          reviewedBy: 'swarm6',
          checkpoint: null,
        }],
        events: [],
      }],
    }

    mkdirSync(join(tempRoot, '.runtime'), { recursive: true })
    writeFileSync(mod.SWARM_MISSIONS_PATH, JSON.stringify(recentMission, null, 2))

    expect(mod.archiveStaleMissions()).toEqual({
      archivedIds: [],
      count: 0,
    })

    const persisted = JSON.parse(readFileSync(mod.SWARM_MISSIONS_PATH, 'utf8'))
    expect(persisted.missions[0]?.state).toBe('executing')
    expect(persisted.missions[0]?.events).toHaveLength(0)
  })
})
