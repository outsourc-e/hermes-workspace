import { describe, expect, it } from 'vitest'
import {
  buildHermesTmuxLaunchCommand,
  buildWorkerPrompt,
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

describe('checkpoint filtering', () => {
  it('still parses IN_PROGRESS runtime snapshots but leaves terminal filtering to the poller', () => {
    const checkpoint = checkpointFromRuntimeSnapshot({
      checkpointStatus: 'in_progress',
      state: 'executing',
      lastSummary: 'Task is running',
      lastResult: null,
      nextAction: 'Wait for worker output',
      blockedReason: null,
      lastCheckIn: '2026-04-28T20:00:01.000Z',
      lastOutputAt: 1_746_000_001_000,
      checkpointRaw: null,
    })

    expect(checkpoint?.stateLabel).toBe('IN_PROGRESS')
  })
})

describe('buildHermesTmuxLaunchCommand', () => {
  it('keeps the tmux shell alive so startup failures leave readable output', () => {
    const command = buildHermesTmuxLaunchCommand({
      profilePath: '/tmp/hermes profiles/swarm1',
      hermesBin: '/opt/homebrew/bin/hermes',
      ghToken: 'ghp_te...3456',
    })

    expect(command).toContain("HERMES_HOME='/tmp/hermes profiles/swarm1'")
    expect(command).toContain("'/opt/homebrew/bin/hermes' chat --tui")
    expect(command).toContain('[Hermes worker exited with status %s]')
    expect(command).not.toContain('exec ')
  })
})

describe('buildWorkerPrompt', () => {
  const roster = {
    id: 'swarm5',
    name: 'Builder',
    role: 'Primary Builder',
    specialty: 'full-stack implementation across Hermes Workspace and Swarm2',
    model: 'GPT-5.5',
    mission: 'Ship focused product slices with tests and clean diffs.',
    skills: ['swarm-ui-worker', 'swarm-worker-core'],
    capabilities: ['code-editing', 'ui-implementation', 'build-verification'],
    preferredTaskTypes: ['implementation'],
    maxConcurrentTasks: 1,
    acceptsBroadcast: true,
    reviewRequired: false,
  }

  it('uses Name — Role as the human-facing label while preserving swarmN as machine ID', () => {
    const prompt = buildWorkerPrompt({
      workerId: 'swarm5',
      task: 'Patch the conductor card copy.',
      rationale: 'Builder executes implementation work.',
      roster,
    })

    expect(prompt).toContain('Worker: Builder — Primary Builder')
    expect(prompt).toContain('Machine ID: swarm5')
    expect(prompt).toContain('Mission: Ship focused product slices with tests and clean diffs.')
    expect(prompt).toContain('Capabilities: code-editing, ui-implementation, build-verification')
    expect(prompt).toContain('Skills: swarm-ui-worker, swarm-worker-core')
  })

  it('still injects role context for direct one-shot dispatch unless raw mode is explicit', () => {
    const prompt = buildWorkerPrompt({
      workerId: 'swarm5',
      task: 'Reply with exactly: BUILDER_OK',
      roster,
      direct: true,
    })

    expect(prompt).toContain('Worker: Builder — Primary Builder')
    expect(prompt).toContain('## Assigned Task')
    expect(prompt).toContain('Reply with exactly: BUILDER_OK')
  })

  it('keeps explicit raw/smoke dispatch unwrapped for minimal probes', () => {
    const prompt = buildWorkerPrompt({
      workerId: 'swarm5',
      task: 'RAW_PING_ONLY',
      roster,
      direct: true,
      raw: true,
    })

    expect(prompt).toBe('RAW_PING_ONLY')
  })
})