import { describe, expect, it } from 'vitest'
import {
  buildInboxReplyDispatchPayload,
  buildSwarmInboxEntries,
  type SwarmInboxEntry,
} from './swarm2-inbox-view'

function entry(state: SwarmInboxEntry['state'], overrides: Partial<SwarmInboxEntry> = {}): SwarmInboxEntry {
  return {
    hash: `${state}-${overrides.workerId ?? 'swarm3'}`,
    kind: 'checkpoint',
    author: 'worker',
    missionId: 'mission-1',
    assignmentId: 'assign-1',
    workerId: 'swarm3',
    workerName: 'Mirror',
    roleLabel: 'Main-Session Mirror',
    state,
    summary: `${state} summary`,
    fullOutput: `STATE: ${state}`,
    filesChanged: ['src/screens/swarm2/swarm2-inbox-view.tsx'],
    nextAction: 'Ship follow-up',
    ts: 1_746_030_000_000,
    ageLabel: '2m ago',
    checkpointText: `STATE: ${state}`,
    task: 'Original task',
    result: `${state} result`,
    blocker: state === 'BLOCKED' ? 'Missing token' : null,
    reviewRequired: state === 'DONE',
    ...overrides,
  }
}

describe('swarm2 inbox view model', () => {
  it('represents all worker checkpoint states plus aurora dispatch rows', () => {
    const entries = [
      entry('DONE'),
      entry('BLOCKED'),
      entry('HANDOFF'),
      entry('IN_PROGRESS'),
      entry('NEEDS_INPUT'),
      entry('IN_PROGRESS', {
        hash: 'aurora-row',
        kind: 'aurora_dispatch',
        author: 'aurora',
        summary: 'Aurora dispatched a follow-up',
      }),
    ]

    expect(entries.map((item) => item.state)).toEqual([
      'DONE',
      'BLOCKED',
      'HANDOFF',
      'IN_PROGRESS',
      'NEEDS_INPUT',
      'IN_PROGRESS',
    ])
    expect(entries[5]).toMatchObject({ kind: 'aurora_dispatch', author: 'aurora' })
  })

  it('builds reply dispatch payload with prior task/result context', () => {
    expect(buildInboxReplyDispatchPayload({
      workerId: 'swarm7',
      missionId: 'mission-abc',
      priorTask: 'Implement inbox UI',
      priorResult: 'UI shipped and tests are green',
      replyText: 'Tighten the empty state copy.',
    })).toEqual({
      assignments: [{
        workerId: 'swarm7',
        rationale: 'Inbox reply',
        dependsOn: ['mission-abc'],
        task: [
          'Inbox reply follow-up. Preserve prior context and execute only this follow-up.',
          '',
          'Prior task: Implement inbox UI',
          'Prior result: UI shipped and tests are green',
          '',
          'User follow-up:',
          'Tighten the empty state copy.',
        ].join('\n'),
      }],
    })
  })

  it('builds the same payload the reply composer submits from an inbox card', () => {
    const card = entry('DONE')

    expect(buildInboxReplyDispatchPayload({
      workerId: card.workerId,
      missionId: card.missionId,
      priorTask: card.task,
      priorResult: card.result,
      replyText: 'Please add a smoke test.',
    })).toEqual({
      assignments: [{
        workerId: 'swarm3',
        rationale: 'Inbox reply',
        dependsOn: ['mission-1'],
        task: [
          'Inbox reply follow-up. Preserve prior context and execute only this follow-up.',
          '',
          'Prior task: Original task',
          'Prior result: DONE result',
          '',
          'User follow-up:',
          'Please add a smoke test.',
        ].join('\n'),
      }],
    })
  })

  it('turns mission checkpoints and aurora dispatch events into reverse-chrono inbox entries', () => {
    const entries = buildSwarmInboxEntries({
      missions: [{
        id: 'mission-1',
        title: 'Ship inbox',
        updatedAt: 100,
        assignments: [{
          id: 'assign-1',
          workerId: 'swarm3',
          task: 'Build inbox',
          reviewRequired: true,
          completedAt: 100,
          checkpoint: {
            stateLabel: 'DONE',
            result: 'Inbox shipped',
            filesChanged: 'src/screens/swarm2/swarm2-inbox-view.tsx',
            nextAction: 'Request review',
            raw: 'STATE: DONE',
          },
        }],
        events: [{
          id: 'evt-1',
          type: 'assignment_dispatched',
          at: 200,
          workerId: 'swarm3',
          assignmentId: 'assign-1',
          message: 'Dispatched assign-1',
          data: { author: 'aurora', task: 'Review the inbox' },
        }],
      }],
      runtimes: [{ workerId: 'swarm3', displayName: 'Mirror', role: 'Main-Session Mirror' }],
      now: 260,
    })

    expect(entries.map((item) => item.kind)).toEqual(['aurora_dispatch', 'checkpoint'])
    expect(entries[0]).toMatchObject({
      author: 'aurora',
      summary: 'Review the inbox',
    })
    expect(entries[1]).toMatchObject({
      state: 'DONE',
      reviewRequired: true,
      filesChanged: ['src/screens/swarm2/swarm2-inbox-view.tsx'],
    })
  })
})
