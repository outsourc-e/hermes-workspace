import { rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { buildHandoff, handoffDirectory, readHandoff, writeHandoff } from './handoff'
import type { ParsedSwarmCheckpoint } from './swarm-checkpoints'

const TEST_WORKER = 'test-handoff-worker'

describe('handoff', () => {
  afterEach(async () => {
    await rm(`${handoffDirectory()}/${TEST_WORKER}-latest.json`, { force: true })
    await rm(`${handoffDirectory()}/${TEST_WORKER}-latest.md`, { force: true })
  })

  it('builds a structured handoff from a checkpoint', async () => {
    const checkpoint: ParsedSwarmCheckpoint = {
      stateLabel: 'DONE',
      runtimeState: 'idle',
      checkpointStatus: 'done',
      filesChanged: '- `/home/ramon.jing/hermes-workspace/src/server/handoff.ts` — new handoff module',
      commandsRun: '- `pnpm test`\n- `git status`',
      result: 'Implemented structured handoff builder.',
      blocker: null,
      nextAction: 'Route to architect for review.',
      reviewOutcome: null,
      raw: 'STATE: DONE',
    }

    const handoff = await buildHandoff(TEST_WORKER, checkpoint, {
      currentMissionId: 'mission-123',
      currentAssignmentId: 'assignment-abc',
    })

    expect(handoff.workerId).toBe(TEST_WORKER)
    expect(handoff.missionId).toBe('mission-123')
    expect(handoff.assignmentId).toBe('assignment-abc')
    expect(handoff.state).toBe('DONE')
    expect(handoff.result).toBe('Implemented structured handoff builder.')
    expect(handoff.filesChanged).toContain('/home/ramon.jing/hermes-workspace/src/server/handoff.ts')
    expect(handoff.commandsRun).toEqual(['pnpm test', 'git status'])
    expect(handoff.nextAction).toBe('Route to architect for review.')
    expect(handoff.sourceCheckpoint.raw).toBe('STATE: DONE')
  })

  it('persists and reads a handoff', async () => {
    const checkpoint: ParsedSwarmCheckpoint = {
      stateLabel: 'DONE',
      runtimeState: 'idle',
      checkpointStatus: 'done',
      filesChanged: 'none',
      commandsRun: 'none',
      result: 'Round trip test.',
      blocker: null,
      nextAction: null,
      reviewOutcome: null,
      raw: 'STATE: DONE',
    }

    const handoff = await buildHandoff(TEST_WORKER, checkpoint)
    const paths = await writeHandoff(handoff)
    expect(paths.jsonPath).toContain(`${TEST_WORKER}-latest.json`)
    expect(paths.markdownPath).toContain(`${TEST_WORKER}-latest.md`)

    const read = readHandoff(TEST_WORKER)
    expect(read).not.toBeNull()
    expect(read?.workerId).toBe(TEST_WORKER)
    expect(read?.result).toBe('Round trip test.')
  })
})
