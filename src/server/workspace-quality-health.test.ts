import { describe, expect, it } from 'vitest'
import {
  evaluateWorkspaceQualityArtifact,
} from './workspace-quality-health'
import type { WorkspaceQualityArtifact } from './workspace-quality-health'

const finishedAt = 1_000_000
const artifact: WorkspaceQualityArtifact = {
  schemaVersion: 1,
  runId: 'run-1',
  runDir: '/tmp/run-1',
  startedAt: finishedAt - 1000,
  finishedAt,
  durationMs: 1000,
  overall: 'warn',
  repo: {
    root: '/repo',
    head: 'abc',
    branch: 'main',
    statusFingerprint: 'same',
    dirtyCount: 1,
    untrackedCount: 1,
  },
  warningBudget: { baseline: 1240, current: 1240 },
  checks: [
    {
      id: 'lint',
      label: 'Lint budget',
      state: 'warn',
      detail: '1,240 grandfathered warnings.',
      command: 'pnpm lint:budget',
      exitCode: 0,
      durationMs: 500,
      artifactPath: '/tmp/run-1/lint.log',
      warnings: 1240,
      errors: 0,
    },
  ],
}

describe('workspace quality artifact freshness', () => {
  it('keeps current warning debt yellow with provenance', () => {
    const result = evaluateWorkspaceQualityArtifact(artifact, 'same', finishedAt + 1000)
    expect(result.freshness).toBe('fresh')
    expect(result.checks[0]?.state).toBe('warn')
    expect(result.runFinishedAt).toBe(finishedAt)
  })

  it('invalidates every green or yellow check when the worktree changes', () => {
    const result = evaluateWorkspaceQualityArtifact(artifact, 'different', finishedAt + 1000)
    expect(result.freshness).toBe('stale')
    expect(result.repoMatches).toBe(false)
    expect(result.checks[0]).toMatchObject({ state: 'unknown', reportedState: 'warn' })
  })

  it('invalidates expired evidence', () => {
    const result = evaluateWorkspaceQualityArtifact(
      artifact,
      'same',
      finishedAt + 24 * 60 * 60 * 1000 + 1,
    )
    expect(result.freshness).toBe('stale')
    expect(result.reason).toContain('older than 24 hours')
  })

  it('returns explicit unknown checks when no run exists', () => {
    const result = evaluateWorkspaceQualityArtifact(null, 'same', finishedAt)
    expect(result.freshness).toBe('missing')
    expect(result.checks).toHaveLength(5)
    expect(result.checks.every((check) => check.state === 'unknown')).toBe(true)
  })
})
