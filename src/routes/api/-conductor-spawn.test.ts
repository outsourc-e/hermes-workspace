import { describe, expect, it } from 'vitest'
import { NATIVE_CONDUCTOR_MODE_NOTE, buildNativeConductorAssignments, toNativeConductorMissionRecord } from './conductor-spawn'
import type { SwarmMission } from '../../server/swarm-missions'

describe('native Conductor fallback', () => {
  it('labels native-swarm as the official OOTB fallback when dashboard Conductor is unavailable', () => {
    expect(NATIVE_CONDUCTOR_MODE_NOTE).toContain('official Workspace-native Swarm fallback')
    expect(NATIVE_CONDUCTOR_MODE_NOTE).toContain('dashboard Conductor API')
  })

  it('decomposes production missions onto named Workspace Swarm lanes', () => {
    const assignments = buildNativeConductorAssignments('Fix conductor and make it production ready', {
      maxParallel: 4,
      supervised: false,
    })

    expect(assignments.map((assignment) => assignment.workerId)).toEqual(['swarm2', 'swarm5', 'swarm6', 'swarm11'])
    expect(assignments[0].task).toContain('Conductor mission: Fix conductor')
    expect(assignments.every((assignment) => assignment.direct === true)).toBe(true)
    expect(assignments.every((assignment) => assignment.reviewRequired === false)).toBe(true)
  })

  it('uses Scribe when the mission asks for documentation even with a smaller lane count', () => {
    const assignments = buildNativeConductorAssignments('Write docs and handoff for the release', {
      maxParallel: 3,
      supervised: true,
    })

    expect(assignments.map((assignment) => assignment.workerId)).toContain('swarm7')
    expect(assignments.some((assignment) => assignment.task.includes('Supervised mode'))).toBe(true)
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
          workerId: 'swarm2',
          task: 'Run smoke',
          rationale: 'Foundation',
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
    expect(record.lines.join('\n')).toContain('swarm2 dispatched')
  })
})
