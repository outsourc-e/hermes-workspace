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
