import { describe, expect, it } from 'vitest'
import {
  NATIVE_CONDUCTOR_DISPATCH_MODE,
  NATIVE_CONDUCTOR_MODE_NOTE,
  buildNativeConductorAssignments,
  nativeKanbanCheckpoint,
  normalizeWorkerModel,
  resolveConductorWorkspacePath,
  toNativeConductorMissionRecord,
} from './conductor-spawn'
import type { SwarmMission } from '../../server/swarm-missions'

describe('native Conductor fallback', () => {
  it('resolves the declared repository and rejects missing workspaces', () => {
    expect(resolveConductorWorkspacePath('/home/takon/hermes-workspace')).toBe(
      '/home/takon/hermes-workspace',
    )
    expect(() =>
      resolveConductorWorkspacePath('/tmp/not-a-real-hermes-workspace'),
    ).toThrow('Mission workspace does not exist')
  })

  it('ignores stale automatic worker model overrides', () => {
    expect(normalizeWorkerModel('auto/coding')).toBe('')
    expect(normalizeWorkerModel('')).toBe('')
    expect(normalizeWorkerModel('hermes-coding')).toBe('hermes-coding')
  })

  it('uses native Kanban dispatch and honors an explicit single Builder request', () => {
    expect(NATIVE_CONDUCTOR_DISPATCH_MODE).toBe('kanban')
    const assignments = buildNativeConductorAssignments(
      'Have the Builder run exactly one no-risk verification task.',
      {
        maxParallel: 4,
        supervised: false,
      },
    )

    expect(assignments.map((assignment) => assignment.workerId)).toEqual([
      'builder',
    ])
  })

  it('converts a completed native run summary into a fresh structured checkpoint', () => {
    const checkpoint = nativeKanbanCheckpoint(
      {
        task: {
          id: 't_native123',
          title: 'Native task',
          status: 'done',
          result: null,
        },
        runs: [
          {
            id: 1,
            status: 'done',
            outcome: 'completed',
            ended_at: 1_000,
            summary:
              'Workspace repository inspected and targeted test suite passed.',
            metadata: JSON.stringify({
              files_changed: [],
              test_command: 'pnpm test',
            }),
          },
        ],
        comments: [{ body: 'No files changed.', created_at: 1_001 }],
      },
      999_000,
    )

    expect(checkpoint).toMatchObject({
      stateLabel: 'DONE',
      commandsRun: 'pnpm test',
      filesChanged: 'none',
    })
    expect(checkpoint?.raw).toContain('STATE: DONE')
  })

  it('rejects a native run that ended before the assignment dispatch', () => {
    const checkpoint = nativeKanbanCheckpoint(
      {
        task: { id: 't_old', title: 'Old task', status: 'done' },
        runs: [
          {
            id: 1,
            status: 'done',
            outcome: 'completed',
            ended_at: 1_000,
            summary: 'stale',
          },
        ],
      },
      1_001_000,
    )

    expect(checkpoint).toBeNull()
  })

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
    expect(assignments[0].task).toContain('Conductor mission: Fix conductor')
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
    const mission: SwarmMission = {
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
      events: [
        { id: 'e1', type: 'created', at: 1, message: 'Mission created' },
      ],
    }

    const record = toNativeConductorMissionRecord(mission)
    expect(record.id).toBe('conductor-test')
    expect(record.status).toBe('running')
    expect(record.nativeSwarm).toBe(true)
    expect(record.modeOfficialOotb).toBe(true)
    expect(record.modeNote).toBe(NATIVE_CONDUCTOR_MODE_NOTE)
    expect(record.lines.join('\n')).toContain('builder dispatched')
  })
})
