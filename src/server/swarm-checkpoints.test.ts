import { describe, expect, it } from 'vitest'
import { parseSwarmCheckpoint } from './swarm-checkpoints'

describe('parseSwarmCheckpoint', () => {
  it('parses complete proof checkpoints', () => {
    const parsed = parseSwarmCheckpoint(`STATE: DONE
FILES_CHANGED: none
COMMANDS_RUN: npm test
RESULT: all green
BLOCKER: none
NEXT_ACTION: ship it`)
    expect(parsed?.stateLabel).toBe('DONE')
    expect(parsed?.checkpointStatus).toBe('done')
    expect(parsed?.runtimeState).toBe('idle')
    expect(parsed?.commandsRun).toBe('npm test')
  })

  it('rejects partial checkpoint blocks', () => {
    const parsed = parseSwarmCheckpoint(`STATE: DONE
FILES_CHANGED: none
COMMANDS_RUN: none`)
    expect(parsed).toBeNull()
  })

  it('accepts DONE checkpoints that omit optional BLOCKER/NEXT_ACTION', () => {
    // Real workers often emit STATE/FILES_CHANGED/COMMANDS_RUN/RESULT without
    // an explicit BLOCKER: line. The parser must treat missing BLOCKER as
    // "none", not drop the checkpoint (which left missions stuck in `blocked`).
    const parsed = parseSwarmCheckpoint(`STATE: DONE
FILES_CHANGED: none
COMMANDS_RUN: none (read_file only)
RESULT: O ficheiro contém 9 workers.
NEXT_ACTION: Nada — diagnóstico concluído.`)
    expect(parsed?.stateLabel).toBe('DONE')
    expect(parsed?.checkpointStatus).toBe('done')
    expect(parsed?.blocker).toBeNull()
    expect(parsed?.nextAction).toBe('Nada — diagnóstico concluído.')
  })

  it('maps blocked checkpoints to runtime blocked state', () => {
    const parsed = parseSwarmCheckpoint(`STATE: BLOCKED
FILES_CHANGED: none
COMMANDS_RUN: none
RESULT: cannot continue
BLOCKER: missing auth
NEXT_ACTION: ask Eric`)
    expect(parsed?.runtimeState).toBe('blocked')
    expect(parsed?.checkpointStatus).toBe('blocked')
    expect(parsed?.blocker).toBe('missing auth')
  })
})
