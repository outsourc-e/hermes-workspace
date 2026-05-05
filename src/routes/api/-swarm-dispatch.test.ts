import { describe, expect, it } from 'vitest'
import {
  buildHermesTmuxLaunchCommand,
  checkpointFromRuntimeSnapshot,
  runtimeCheckpointSignature,
  runtimeSnapshotIsFresh,
} from './swarm-dispatch'

describe('checkpointFromRuntimeSnapshot', () => {
  it('maps runtime lifecycle fields into a structured checkpoint', () => {
    const checkpoint = checkpointFromRuntimeSnapshot({
      checkpointStatus: 'done',
      state: 'idle',
      lastSummary: 'Patched dispatch polling',
      lastResult: 'Structured checkpoint returned to RouterChat',
      nextAction: 'Verify in UI flow',
      blockedReason: null,
      lastCheckIn: '2026-04-28T20:00:00.000Z',
      lastOutputAt: 1_746_000_000_000,
      checkpointRaw: null,
    })

    expect(checkpoint).not.toBeNull()
    expect(checkpoint?.stateLabel).toBe('DONE')
    expect(checkpoint?.checkpointStatus).toBe('done')
    expect(checkpoint?.result).toBe('Structured checkpoint returned to RouterChat')
    expect(checkpoint?.nextAction).toBe('Verify in UI flow')
    expect(checkpoint?.raw).toContain('STATE: DONE')
  })

  it('returns null when runtime has no meaningful checkpoint fields yet', () => {
    const checkpoint = checkpointFromRuntimeSnapshot({
      checkpointStatus: 'in_progress',
      state: 'executing',
      lastSummary: null,
      lastResult: null,
      nextAction: null,
      blockedReason: null,
      lastCheckIn: '2026-04-28T20:00:00.000Z',
      lastOutputAt: 1_746_000_000_000,
      checkpointRaw: null,
    })

    expect(checkpoint).toBeNull()
  })
})

describe('buildHermesTmuxLaunchCommand', () => {
  it('keeps the tmux shell alive so startup failures leave readable output', () => {
    const command = buildHermesTmuxLaunchCommand({
      profilePath: '/tmp/hermes profiles/swarm1',
      hermesBin: '/opt/homebrew/bin/hermes',
      ghToken: 'ghp_testtokenvalue123456',
    })

    expect(command).toContain("HERMES_HOME='/tmp/hermes profiles/swarm1'")
    expect(command).toContain("'/opt/homebrew/bin/hermes' chat --tui")
    expect(command).toContain('[Hermes worker exited with status %s]')
    expect(command).not.toContain('exec ')
  })
})

describe('runtimeSnapshotIsFresh', () => {
  it('requires a changed snapshot with post-dispatch activity', () => {
    const baseline = {
      checkpointStatus: 'in_progress' as const,
      state: 'executing',
      lastSummary: 'Dispatched task',
      lastResult: null,
      nextAction: 'Wait for worker',
      blockedReason: null,
      lastCheckIn: '2026-04-28T19:59:00.000Z',
      lastOutputAt: 1_745_999_900_000,
      checkpointRaw: null,
    }
    const dispatchedAt = 1_746_000_000_000

    expect(runtimeSnapshotIsFresh(baseline, runtimeCheckpointSignature(baseline), dispatchedAt)).toBe(false)

    const updated = {
      ...baseline,
      checkpointStatus: 'done' as const,
      lastResult: 'Completed backend patch',
      nextAction: 'Hand off to UI',
      lastCheckIn: '2026-04-28T20:00:01.000Z',
      lastOutputAt: 1_746_000_001_000,
    }

    expect(runtimeSnapshotIsFresh(updated, runtimeCheckpointSignature(baseline), dispatchedAt)).toBe(true)
  })
})
