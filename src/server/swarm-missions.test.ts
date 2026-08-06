import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { openSync } from 'node:fs'

let tempRoot: string

async function loadModule(options?: { failStoreWrites?: boolean }) {
  vi.resetModules()
  if (options?.failStoreWrites) {
    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<Record<string, unknown>>()
      return {
        ...actual,
        openSync: (...args: Parameters<typeof openSync>) => {
          const [path] = args
          if (String(path).endsWith('.tmp')) {
            throw new Error('simulated mission store write failure')
          }
          return Reflect.apply(actual.openSync as typeof openSync, actual, args)
        },
        writeFileSync: (...args: Parameters<typeof writeFileSync>) => {
          const [path] = args
          if (String(path).endsWith('.tmp')) {
            throw new Error('simulated mission store write failure')
          }
          return Reflect.apply(
            actual.writeFileSync as typeof writeFileSync,
            actual,
            args,
          )
        },
      }
    })
  } else {
    vi.doUnmock('node:fs')
  }
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
    vi.doUnmock('node:fs')
    vi.doUnmock('./swarm-environment')
    try {
      rmSync(tempRoot, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  })

  it('persists exact mission Card authority and refuses an anchor rollover to another Card', async () => {
    const mod = await loadModule()
    const binding = {
      kind: 'session-card-owner' as const,
      cardId: 'remote:mission-a-card',
      parentCardId: null,
      canonicalSource: 'remote' as const,
      canonicalSegmentKey: 'remote:mission-a-tip',
      canonicalTransport: 'gateway' as const,
    }

    expect(
      mod.bindSwarmMissionCardAuthority({
        missionId: 'mission-a',
        anchorSource: 'remote',
        anchorKey: 'dashboard-session-a',
        binding,
      }),
    ).toBe(true)
    expect(mod.swarmMissionHasExactCardAuthority('mission-a', binding)).toBe(
      true,
    )
    expect(mod.swarmMissionHasExactCardAuthority('mission-b', binding)).toBe(
      false,
    )

    const continuedBinding = {
      ...binding,
      canonicalSegmentKey: 'remote:mission-a-successor',
    }
    expect(
      mod.bindSwarmMissionCardAuthority({
        missionId: 'mission-a',
        anchorSource: 'remote',
        anchorKey: 'dashboard-session-a',
        binding: continuedBinding,
      }),
    ).toBe(true)
    expect(mod.swarmMissionHasExactCardAuthority('mission-a', binding)).toBe(
      false,
    )
    expect(
      mod.swarmMissionHasExactCardAuthority('mission-a', continuedBinding),
    ).toBe(true)

    expect(
      mod.bindSwarmMissionCardAuthority({
        missionId: 'mission-a',
        anchorSource: 'remote',
        anchorKey: 'dashboard-session-a',
        binding: {
          ...continuedBinding,
          cardId: 'remote:hostile-rollover-card',
        },
      }),
    ).toBe(false)
    expect(mod.getSwarmMissionCardAuthorityBindings('mission-a')).toEqual([
      continuedBinding,
    ])
  })

  it('commits a new mission with its complete multiworker authority set', async () => {
    const mod = await loadModule()
    const mission = mod.createSwarmMissionWithCardAuthorities({
      missionId: 'mission-atomic-success',
      title: 'Atomic multiworker mission',
      assignments: [
        { workerId: 'builder', task: 'Implement the patch' },
        { workerId: 'reviewer', task: 'Review the patch' },
      ],
      authorities: [
        {
          anchorSource: 'local',
          anchorKey: 'builder',
          binding: {
            kind: 'session-card-owner',
            cardId: 'local:builder-card',
            parentCardId: null,
            canonicalSource: 'local',
            canonicalSegmentKey: 'local:builder',
            canonicalTransport: 'tmux',
          },
        },
        {
          anchorSource: 'local',
          anchorKey: 'reviewer',
          binding: {
            kind: 'session-card-owner',
            cardId: 'local:reviewer-card',
            parentCardId: null,
            canonicalSource: 'local',
            canonicalSegmentKey: 'local:reviewer',
            canonicalTransport: 'tmux',
          },
        },
      ],
    })

    expect(mission?._created).toBe(true)
    expect(
      mission?.assignments.map((assignment) => assignment.workerId),
    ).toEqual(['builder', 'reviewer'])
    expect(
      mod
        .getSwarmMissionCardAuthorityBindings('mission-atomic-success')
        .map((binding) => binding.cardId),
    ).toEqual(['local:builder-card', 'local:reviewer-card'])
    const persisted = JSON.parse(
      readFileSync(mod.SWARM_MISSIONS_PATH, 'utf8'),
    ) as {
      missions: Array<unknown>
      missionCardAuthorities: Array<{ anchors: Array<unknown> }>
    }
    expect(persisted.missions).toHaveLength(1)
    expect(persisted.missionCardAuthorities[0]?.anchors).toHaveLength(2)
  })

  it('does not persist an incomplete authority set when a later mission anchor conflicts', async () => {
    const mod = await loadModule()
    const firstBinding = {
      kind: 'session-card-owner' as const,
      cardId: 'local:builder-card',
      parentCardId: null,
      canonicalSource: 'local' as const,
      canonicalSegmentKey: 'local:builder',
      canonicalTransport: 'tmux' as const,
    }

    const mission = mod.createSwarmMissionWithCardAuthorities({
      missionId: 'mission-atomic-conflict',
      title: 'Atomic authority conflict',
      assignments: [
        { workerId: 'builder', task: 'First task' },
        { workerId: 'builder', task: 'Second task' },
      ],
      authorities: [
        {
          anchorSource: 'local',
          anchorKey: 'builder',
          binding: firstBinding,
        },
        {
          anchorSource: 'local',
          anchorKey: 'builder',
          binding: {
            ...firstBinding,
            cardId: 'local:unrelated-card',
          },
        },
      ],
    })

    expect(mission).toBeNull()
    expect(mod.getSwarmMission('mission-atomic-conflict')).toBeNull()
    expect(
      mod.getSwarmMissionCardAuthorityBindings('mission-atomic-conflict'),
    ).toEqual([])
    expect(existsSync(mod.SWARM_MISSIONS_PATH)).toBe(false)
  })

  it('leaves the durable store unchanged when the atomic mission commit fails', async () => {
    const runtimeDir = join(tempRoot, '.runtime')
    const storePath = join(runtimeDir, 'swarm-missions.json')
    const baseline = {
      version: 1,
      missions: [],
      missionCardAuthorities: [],
    }
    mkdirSync(runtimeDir, { recursive: true })
    writeFileSync(storePath, JSON.stringify(baseline, null, 2) + '\n')
    const mod = await loadModule({ failStoreWrites: true })

    expect(() =>
      mod.createSwarmMissionWithCardAuthorities({
        missionId: 'mission-atomic-write-failure',
        title: 'Atomic write failure',
        assignments: [{ workerId: 'builder', task: 'Atomic task' }],
        authorities: [
          {
            anchorSource: 'local',
            anchorKey: 'builder',
            binding: {
              kind: 'session-card-owner',
              cardId: 'local:builder-card',
              parentCardId: null,
              canonicalSource: 'local',
              canonicalSegmentKey: 'local:builder',
              canonicalTransport: 'tmux',
            },
          },
        ],
      }),
    ).toThrow('simulated mission store write failure')
    expect(JSON.parse(readFileSync(storePath, 'utf8'))).toEqual(baseline)
  })

  it('fails closed without replacing malformed durable mission bytes', async () => {
    const runtimeDir = join(tempRoot, '.runtime')
    const storePath = join(runtimeDir, 'swarm-missions.json')
    const malformed = '{"version":1,"missions":['
    mkdirSync(runtimeDir, { recursive: true })
    writeFileSync(storePath, malformed)
    const mod = await loadModule()

    expect(() =>
      mod.createOrUpdateMission({
        missionId: 'must-not-be-admitted',
        title: 'Malformed-store admission',
        assignments: [{ workerId: 'builder', task: 'Do not persist' }],
      }),
    ).toThrow()
    expect(readFileSync(storePath, 'utf8')).toBe(malformed)
  })

  it('fails closed on durable store read errors', async () => {
    const storePath = join(tempRoot, '.runtime', 'swarm-missions.json')
    mkdirSync(storePath, { recursive: true })
    const mod = await loadModule()

    expect(() =>
      mod.createOrUpdateMission({
        missionId: 'must-not-replace-unreadable-store',
        title: 'Unreadable-store admission',
        assignments: [{ workerId: 'builder', task: 'Do not persist' }],
      }),
    ).toThrow()
    expect(statSync(storePath).isDirectory()).toBe(true)
  })

  it('serializes independent processes updating the same explicit mission id', async () => {
    const modulePath = new URL('./swarm-missions.ts', import.meta.url).pathname
    const tsxPath = join(process.cwd(), 'node_modules', '.bin', 'tsx')
    const workerCount = 12
    const children = Array.from({ length: workerCount }, (_, index) => {
      const script = [
        `import { createOrUpdateMission } from ${JSON.stringify(modulePath)};`,
        `createOrUpdateMission({ missionId: 'shared-explicit-id', title: 'Concurrent mission', assignments: [{ workerId: 'worker-${index}', task: 'task-${index}' }] });`,
      ].join('\n')
      return new Promise<void>((resolve, reject) => {
        const child = spawn(tsxPath, ['--eval', script], {
          cwd: tempRoot,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        let stderr = ''
        child.stderr.on('data', (chunk) => {
          stderr += String(chunk)
        })
        child.on('error', reject)
        child.on('exit', (code) => {
          if (code === 0) resolve()
          else reject(new Error(`concurrent writer exited ${code}: ${stderr}`))
        })
      })
    })

    await Promise.all(children)
    const store = JSON.parse(
      readFileSync(join(tempRoot, '.runtime', 'swarm-missions.json'), 'utf8'),
    ) as {
      missions: Array<{
        id: string
        assignments: Array<{ workerId: string; task: string }>
      }>
    }
    const mission = store.missions.find(
      (candidate) => candidate.id === 'shared-explicit-id',
    )
    expect(
      mission?.assignments
        .map((assignment) => assignment.workerId)
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(
      Array.from({ length: workerCount }, (_, index) => `worker-${index}`).sort(
        (a, b) => a.localeCompare(b),
      ),
    )
  }, 20_000)

  it('reclaims a mission-store lock whose live PID has a mismatched process identity', async () => {
    const mod = await loadModule()
    const lockPath = `${mod.SWARM_MISSIONS_PATH}.lock`
    mkdirSync(join(tempRoot, '.runtime'), { recursive: true })
    writeFileSync(
      lockPath,
      `${JSON.stringify({
        token: 'stale-owner-token',
        pid: process.pid,
        processIdentity: 'linux:definitely-not-this-process',
      })}\n`,
    )

    expect(
      mod.createOrUpdateMission({
        missionId: 'mission-after-reused-pid',
        title: 'PID reuse recovery',
        assignments: [{ workerId: 'builder', task: 'Recover the lock' }],
      }).id,
    ).toBe('mission-after-reused-pid')
    expect(existsSync(lockPath)).toBe(false)
  }, 10_000)

  it('rejects checkpoint attribution when an explicit assignment does not belong to the reporting worker', async () => {
    const mod = await loadModule()
    const mission = mod.createOrUpdateMission({
      missionId: 'mission-checkpoint-attribution',
      title: 'Checkpoint attribution',
      assignments: [
        { workerId: 'builder', task: 'Build the patch', reviewRequired: false },
        {
          workerId: 'reviewer',
          task: 'Review the patch',
          reviewRequired: false,
        },
      ],
    })
    const reviewerAssignment = mission.assignments.find(
      (assignment) => assignment.workerId === 'reviewer',
    )
    const checkpoint = {
      stateLabel: 'DONE' as const,
      runtimeState: 'idle' as const,
      checkpointStatus: 'done' as const,
      filesChanged: 'none',
      commandsRun: 'none',
      result: 'Hostile cross-worker checkpoint',
      blocker: null,
      nextAction: 'none',
      raw: 'STATE: DONE\nRESULT: hostile cross-worker checkpoint',
    }

    expect(
      mod.recordMissionCheckpoint({
        missionId: mission.id,
        assignmentId: reviewerAssignment?.id,
        workerId: 'builder',
        checkpoint,
        source: 'hostile-worker',
      }),
    ).toBeNull()
    expect(
      mod.recordMissionCheckpoint({
        missionId: mission.id,
        assignmentId: 'missing-assignment-id',
        workerId: 'builder',
        checkpoint,
        source: 'stale-worker',
      }),
    ).toBeNull()

    const persisted = mod.getSwarmMission(mission.id)
    expect(
      persisted?.assignments.every((assignment) => !assignment.checkpoint),
    ).toBe(true)
    expect(
      persisted?.events.filter((candidate) => candidate.type === 'checkpoint'),
    ).toHaveLength(0)
  })

  it('records checkpoints by assignment id, stores report metadata, and exposes flattened reports', async () => {
    const mod = await loadModule()
    const mission = mod.createOrUpdateMission({
      missionId: 'mission-report-1',
      title: 'Mission report test',
      assignments: [
        {
          workerId: 'swarm2',
          task: 'Land backend patch',
          reviewRequired: false,
        },
      ],
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

    const checkpointEvent = updated?.events.find(
      (event) => event.type === 'checkpoint',
    )
    expect(checkpointEvent?.data?.source).toBe('swarm-orchestrator-loop')
    expect(checkpointEvent?.data?.result).toBe('Recorded canonical checkpoint')
    expect(checkpointEvent?.data?.commandsRun).toBe(
      'pnpm vitest src/server/swarm-missions.test.ts',
    )

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
      assignments: [
        {
          workerId: 'swarm2',
          task: 'Land backend patch',
          reviewRequired: false,
        },
      ],
    })
    const assignmentId = mission.assignments[0]?.id
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

    const first = mod.recordMissionCheckpoint({
      missionId: mission.id,
      assignmentId,
      workerId: 'swarm2',
      checkpoint,
      source: 'swarm-checkpoint-api',
    })
    const second = mod.recordMissionCheckpoint({
      missionId: mission.id,
      assignmentId,
      workerId: 'swarm2',
      checkpoint,
      source: 'swarm-checkpoint-api',
    })

    expect(
      first?.events.filter((event) => event.type === 'checkpoint'),
    ).toHaveLength(1)
    expect(
      second?.events.filter((event) => event.type === 'checkpoint'),
    ).toHaveLength(1)
    expect(mod.listSwarmReports({ missionId: mission.id })).toHaveLength(1)
    expect(existsSync(mod.SWARM_MISSIONS_PATH)).toBe(true)
  })

  it('does not infer review-required from dispatch/checkpoint wording alone', async () => {
    const mod = await loadModule()
    const mission = mod.createOrUpdateMission({
      missionId: 'mission-dispatch-smoke-review',
      title: 'Diagnostic dispatch smoke',
      assignments: [
        {
          workerId: 'builder',
          task: 'Diagnostic smoke only. Return RESULT: workspace swarm dispatch API smoke passed.',
          rationale: 'diagnostic dispatch smoke',
        },
      ],
    })

    expect(mission.assignments[0]?.reviewRequired).toBe(false)

    const updated = mod.recordMissionCheckpoint({
      missionId: mission.id,
      assignmentId: mission.assignments[0]?.id,
      workerId: 'builder',
      checkpoint: {
        stateLabel: 'DONE',
        runtimeState: 'idle',
        checkpointStatus: 'done',
        filesChanged: 'none',
        commandsRun: 'none',
        result: 'workspace swarm dispatch API smoke passed',
        blocker: null,
        nextAction: 'none',
        raw: 'STATE: DONE\nFILES_CHANGED: none\nCOMMANDS_RUN: none\nRESULT: workspace swarm dispatch API smoke passed\nBLOCKER: none\nNEXT_ACTION: none',
      },
      source: 'swarm-dispatch',
    })

    expect(updated?.state).toBe('complete')
  })

  it('records dispatch failures as blocked mission assignments', async () => {
    const mod = await loadModule()
    const mission = mod.createOrUpdateMission({
      missionId: 'mission-dispatch-failure',
      title: 'Dispatch failure test',
      assignments: [
        {
          workerId: 'builder',
          task: 'Probe runtime health',
          reviewRequired: false,
        },
      ],
    })
    mod.markMissionAssignmentDispatched({
      missionId: mission.id,
      workerId: 'builder',
      task: 'Probe runtime health',
    })
    expect(
      mod.markMissionAssignmentDispatched({
        missionId: mission.id,
        workerId: 'builder',
        task: 'Probe runtime health',
      }),
    ).toBeNull()
    expect(
      mod
        .getSwarmMission(mission.id)
        ?.events.filter(
          (candidate) => candidate.type === 'assignment_dispatched',
        ),
    ).toHaveLength(1)

    const blocked = mod.recordMissionAssignmentBlocked({
      missionId: mission.id,
      assignmentId: mission.assignments[0]?.id,
      workerId: 'builder',
      reason: 'No fresh checkpoint before poll timeout.',
      source: 'swarm-dispatch',
    })

    expect(blocked?.mission.state).toBe('blocked')
    expect(blocked?.assignment.state).toBe('blocked')
    expect(blocked?.assignment.checkpoint).toMatchObject({
      stateLabel: 'BLOCKED',
      checkpointStatus: 'blocked',
      blocker: 'No fresh checkpoint before poll timeout.',
    })
    expect(blocked?.mission.events.at(-1)?.type).toBe('blocked')
  })

  it('keeps dependent work queued until review-required assignments are reviewed', async () => {
    const mod = await loadModule()
    const mission = mod.createOrUpdateMission({
      missionId: 'mission-review-gate',
      title: 'Review gate test',
      assignments: [
        {
          workerId: 'swarm2',
          task: 'Implement orchestration patch',
          reviewRequired: true,
        },
        {
          workerId: 'swarm8',
          task: 'Ship final action',
          dependsOn: [],
          reviewRequired: false,
        },
      ],
    })
    const implementation = mission.assignments[0]
    const finalAction = mission.assignments[1]
    if (!implementation || !finalAction) {
      throw new Error('Expected implementation and final-action assignments')
    }
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
    expect(
      mod.readyQueuedAssignments(mission.id).map((assignment) => assignment.id),
    ).toEqual([finalAction.id])
  })

  it('cancels active missions without accepting stale checkpoints afterward', async () => {
    const mod = await loadModule()
    const mission = mod.createOrUpdateMission({
      missionId: 'mission-cancel-1',
      title: 'Cancel test',
      assignments: [
        {
          workerId: 'swarm2',
          task: 'Active backend task',
          reviewRequired: false,
        },
        {
          workerId: 'swarm5',
          task: 'Queued builder task',
          reviewRequired: false,
        },
      ],
    })
    mod.markMissionAssignmentDispatched({
      missionId: mission.id,
      workerId: 'swarm2',
      task: 'Active backend task',
    })

    const cancelled = mod.cancelSwarmMission({
      missionId: mission.id,
      actor: 'test',
      reason: 'User cancelled bad swarm run',
    })

    expect(cancelled?.mission.state).toBe('cancelled')
    expect(cancelled?.cancelledAssignmentIds).toHaveLength(2)
    expect(
      cancelled?.mission.assignments.map((assignment) => assignment.state),
    ).toEqual(['cancelled', 'cancelled'])
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
    expect(
      persisted?.events.filter((event) => event.type === 'checkpoint'),
    ).toHaveLength(0)
  })

  it.each(['cancelled', 'complete'] as const)(
    'keeps a %s mission absorbing when late dispatch tries to append work',
    async (terminalState) => {
      const mod = await loadModule()
      const mission = mod.createOrUpdateMission({
        missionId: `mission-terminal-${terminalState}`,
        title: 'Terminal mission',
        assignments: [
          { workerId: 'builder', task: 'Original task', reviewRequired: false },
        ],
      })
      if (terminalState === 'cancelled') {
        mod.cancelSwarmMission({ missionId: mission.id, actor: 'test' })
      } else {
        mod.recordMissionCheckpoint({
          missionId: mission.id,
          assignmentId: mission.assignments[0]?.id,
          workerId: 'builder',
          checkpoint: {
            stateLabel: 'DONE',
            runtimeState: 'idle',
            checkpointStatus: 'done',
            filesChanged: 'none',
            commandsRun: 'none',
            result: 'done',
            blocker: null,
            nextAction: 'none',
            raw: 'STATE: DONE\nRESULT: done',
          },
        })
      }

      expect(() =>
        mod.createOrUpdateMission({
          missionId: mission.id,
          title: 'Hostile late extension',
          assignments: [
            {
              workerId: 'reviewer',
              task: 'Late queued task',
              reviewRequired: false,
            },
          ],
        }),
      ).toThrow(mod.TerminalSwarmMissionMutationError)

      const persisted = mod.getSwarmMission(mission.id)
      expect(persisted?.state).toBe(terminalState)
      expect(persisted?.title).toBe('Terminal mission')
      expect(persisted?.assignments).toHaveLength(1)
      expect(persisted?.assignments[0]?.task).toBe('Original task')
    },
  )

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

    expect(cancelled?.assignment.state).toBe('cancelled')
    expect(cancelled?.mission.state).toBe('planning')
    expect(
      cancelled?.mission.assignments.map((assignment) => assignment.state),
    ).toEqual(['cancelled', 'queued'])
    expect(cancelled?.mission.events.at(-1)?.type).toBe('assignment_cancelled')
  })

  it('archives stale executing missions when all assignments are terminal', async () => {
    const mod = await loadModule()
    const staleMission = {
      version: 1,
      missions: [
        {
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
        },
      ],
    }

    mkdirSync(join(tempRoot, '.runtime'), { recursive: true })
    writeFileSync(
      mod.SWARM_MISSIONS_PATH,
      JSON.stringify(staleMission, null, 2),
    )

    expect(mod.archiveStaleMissions()).toEqual({
      archivedIds: ['mission-stale-terminal'],
      count: 1,
    })

    const persisted = JSON.parse(readFileSync(mod.SWARM_MISSIONS_PATH, 'utf8'))
    expect(persisted.missions[0]?.state).toBe('complete')
    expect(persisted.missions[0]?.events.at(-1)?.message).toContain(
      'Archived as stale',
    )
  })

  it('leaves recent executing missions alone', async () => {
    const mod = await loadModule()
    const recentUpdatedAt = Date.now() - 60 * 60 * 1000
    const recentMission = {
      version: 1,
      missions: [
        {
          id: 'mission-recent-terminal',
          title: 'Recent executing mission',
          state: 'executing',
          createdAt: recentUpdatedAt,
          updatedAt: recentUpdatedAt,
          assignments: [
            {
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
            },
          ],
          events: [],
        },
      ],
    }

    mkdirSync(join(tempRoot, '.runtime'), { recursive: true })
    writeFileSync(
      mod.SWARM_MISSIONS_PATH,
      JSON.stringify(recentMission, null, 2),
    )

    expect(mod.archiveStaleMissions()).toEqual({
      archivedIds: [],
      count: 0,
    })

    const persisted = JSON.parse(readFileSync(mod.SWARM_MISSIONS_PATH, 'utf8'))
    expect(persisted.missions[0]?.state).toBe('executing')
    expect(persisted.missions[0]?.events).toHaveLength(0)
  })
})
