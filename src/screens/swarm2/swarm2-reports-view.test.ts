import { describe, expect, it } from 'vitest'
import { buildSwarm2ReportRows } from './swarm2-reports-view'

describe('Swarm2 reports view model', () => {
  it('turns review-required checkpoints into needs-review report rows', () => {
    const rows = buildSwarm2ReportRows({
      missions: [
        {
          id: 'mission-1',
          title: 'Ship reports',
          state: 'reviewing',
          updatedAt: 200,
          assignments: [
            {
              id: 'assign-1',
              workerId: 'swarm5',
              task: 'Build outputs page',
              state: 'checkpointed',
              reviewRequired: true,
              completedAt: 300,
              checkpoint: {
                stateLabel: 'DONE',
                checkpointStatus: 'handoff',
                result: 'Page is implemented.',
                filesChanged: 'src/screens/swarm2/swarm2-reports-view.tsx',
                commandsRun: 'pnpm vitest run',
                blocker: null,
                nextAction: 'Review UX',
              },
            },
          ],
        },
      ],
      runtimes: [{ workerId: 'swarm5', displayName: 'Swarm5', artifacts: [], previews: [] }],
    })

    expect(rows[0]).toMatchObject({
      kind: 'checkpoint',
      workerId: 'swarm5',
      state: 'needs_review',
      stateLabel: 'Needs review',
      summary: 'Page is implemented.',
    })
    expect(rows[0].artifacts[0].path).toBe('src/screens/swarm2/swarm2-reports-view.tsx')
  })

  it('surfaces runtime artifacts when no mission checkpoint exists', () => {
    const rows = buildSwarm2ReportRows({
      missions: [],
      runtimes: [
        {
          workerId: 'swarm6',
          displayName: 'Swarm6',
          currentTask: 'Inspect Outputs page',
          lastSummary: 'Ready for review',
          lastOutputAt: 500,
          artifacts: [{ id: 'artifact-1', kind: 'report', label: 'UX report' }],
          previews: [],
        },
      ],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'artifact',
      workerId: 'swarm6',
      state: 'artifact',
      title: 'Inspect Outputs page',
    })
  })

  it('prefers concrete runtime results over boilerplate summaries after control prompts', () => {
    const rows = buildSwarm2ReportRows({
      missions: [],
      runtimes: [
        {
          workerId: 'swarm4',
          displayName: 'Swarm4',
          currentTask: 'Implement reviewer inbox state',
          checkpointStatus: 'done',
          lastSummary: 'Dispatched task: review the inbox flow',
          lastResult: 'Reviewer inbox is ready for Eric handoff',
          lastOutputAt: 900,
          artifacts: [],
          previews: [],
        },
      ],
    })

    expect(rows[0]).toMatchObject({
      workerId: 'swarm4',
      state: 'needs_review',
      stateLabel: 'Needs review',
      summary: 'Reviewer inbox is ready for Eric handoff',
    })
    expect(rows[0].details.find((detail) => detail.label === 'Result')?.value).toBe('Reviewer inbox is ready for Eric handoff')
  })

  it('prioritizes blocked affordances from checkpoints and runtime state', () => {
    const rows = buildSwarm2ReportRows({
      missions: [
        {
          id: 'mission-2',
          title: 'Blocked mission',
          state: 'blocked',
          updatedAt: 200,
          assignments: [
            {
              id: 'assign-2',
              workerId: 'swarm7',
              task: 'Deploy',
              state: 'blocked',
              reviewRequired: false,
              checkpoint: { blocker: 'Missing token' },
            },
          ],
        },
      ],
      runtimes: [],
    })

    expect(rows[0].state).toBe('blocked')
    expect(rows[0].stateLabel).toBe('Blocked')
    expect(rows[0].summary).toBe('Missing token')
  })

  it('does not classify BLOCKER: none checkpoints as blocked', () => {
    const rows = buildSwarm2ReportRows({
      missions: [
        {
          id: 'mission-3',
          title: 'Completed mission',
          state: 'complete',
          updatedAt: 300,
          assignments: [
            {
              id: 'assign-3',
              workerId: 'swarm8',
              task: 'Ship patch',
              state: 'done',
              reviewRequired: false,
              checkpoint: {
                stateLabel: 'DONE',
                checkpointStatus: 'done',
                result: 'Patch shipped',
                blocker: 'none',
              },
            },
          ],
        },
      ],
      runtimes: [],
    })

    expect(rows[0].state).toBe('ready')
    expect(rows[0].stateLabel).toBe('Ready')
    expect(rows[0].summary).toBe('Patch shipped')
  })
})
