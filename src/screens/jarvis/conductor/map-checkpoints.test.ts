import { describe, expect, it } from 'vitest'
import {
  EVIDENCE_LINES_MAX,
  EVIDENCE_LINE_MAX,
  buildCheckpointSourceLine,
  clampEvidenceLine,
  formatCheckedAt,
  mapCheckpointToBadges,
  mapCheckpointToInertChecks,
  mapOutputToEvidence,
  mapVerificationItemToBadge,
} from './map-checkpoints'
import type {
  WorkspaceCheckpointDetail,
  WorkspaceCheckpointVerificationItem,
  WorkspaceCheckpointVerificationMap,
} from '@/lib/workspace-checkpoints'

/**
 * A fixed clock. Both it and every timestamp below are built in LOCAL time and
 * then serialised, so the assertions hold in any timezone the suite runs in.
 */
const NOW = new Date(2026, 2, 10, 12, 0, 0).getTime()
const TODAY_0938 = new Date(2026, 2, 10, 9, 38, 0).toISOString()
const LAST_MONTH = new Date(2026, 1, 17, 9, 38, 0).toISOString()

function item(
  overrides: Partial<WorkspaceCheckpointVerificationItem> = {},
): WorkspaceCheckpointVerificationItem {
  return {
    status: 'passed',
    label: 'tsc --noEmit',
    output: null,
    checked_at: TODAY_0938,
    ...overrides,
  }
}

function verification(
  overrides: Partial<WorkspaceCheckpointVerificationMap> = {},
): WorkspaceCheckpointVerificationMap {
  return {
    tsc: item({ status: 'missing', label: 'Not run yet', checked_at: null }),
    tests: item({
      status: 'not_configured',
      label: 'Not configured',
      checked_at: null,
    }),
    lint: item({
      status: 'not_configured',
      label: 'Not configured',
      checked_at: null,
    }),
    e2e: item({
      status: 'not_configured',
      label: 'Not configured',
      checked_at: null,
    }),
    ...overrides,
  }
}

function detail(
  verificationMap: WorkspaceCheckpointVerificationMap = verification(),
  overrides: Partial<WorkspaceCheckpointDetail> = {},
): WorkspaceCheckpointDetail {
  return {
    id: '06ec90ba-4703-4a1e-9d1c-2f1a0b8e5c11',
    task_run_id: 'run-1',
    summary: 'Wired the badge to checkpoint verification',
    diff_stat: null,
    verification_raw: null,
    status: 'pending',
    reviewer_notes: null,
    commit_hash: null,
    created_at: '2026-03-10 09:40:00',
    task_name: 'slice7a checkpoint verify',
    mission_name: null,
    project_name: 'hermes',
    agent_name: 'builder',
    task_id: null,
    project_id: null,
    project_path: null,
    agent_model: null,
    agent_adapter_type: null,
    task_run_status: null,
    task_run_attempt: null,
    task_run_workspace_path: null,
    task_run_started_at: null,
    task_run_completed_at: null,
    task_run_error: null,
    task_run_input_tokens: null,
    task_run_output_tokens: null,
    task_run_cost_cents: null,
    run_events: [],
    diff_files: [],
    verification: verificationMap,
    ...overrides,
  }
}

describe('mapVerificationItemToBadge', () => {
  it('maps a passed check to VERIFIED', () => {
    const badge = mapVerificationItemToBadge(item({ status: 'passed' }), 'tsc', NOW)

    expect(badge).not.toBeNull()
    expect(badge?.state).toBe('verified')
    expect(badge?.title).toBe('TSC · tsc --noEmit')
    expect(badge?.time).toBe('09:38')
  })

  it('maps a failed check to CLAIMED, and says FAILED in the title', () => {
    const badge = mapVerificationItemToBadge(
      item({ status: 'failed', label: 'vitest run', output: 'exit 1' }),
      'tests',
      NOW,
    )

    // A failing check must never wear the affirmative state...
    expect(badge?.state).toBe('claimed')
    // ...and "CLAIMED · UNVERIFIED" alone would read as "we don't know", so the
    // failure is stated in words too.
    expect(badge?.title).toBe('TESTS FAILED · vitest run')
    expect(badge?.evidence).toEqual(['exit 1'])
  })

  it('renders NO badge for missing or not_configured — honest non-states', () => {
    expect(mapVerificationItemToBadge(item({ status: 'missing' }), 'lint', NOW)).toBeNull()
    expect(
      mapVerificationItemToBadge(item({ status: 'not_configured' }), 'e2e', NOW),
    ).toBeNull()
  })

  it('never fabricates a verified state from anything but `passed`', () => {
    for (const status of ['failed', 'missing', 'not_configured'] as const) {
      const badge = mapVerificationItemToBadge(item({ status }), 'tsc', NOW)
      expect(badge?.state).not.toBe('verified')
    }
  })

  it('emits no action chips — the slice is read-only', () => {
    const badge = mapVerificationItemToBadge(item({ status: 'passed' }), 'tsc', NOW)
    expect(badge?.actions).toEqual([])
  })

  it('carries no evidence when the check reported no output', () => {
    const badge = mapVerificationItemToBadge(
      item({ status: 'passed', output: null }),
      'tsc',
      NOW,
    )
    expect(badge?.evidence).toBeUndefined()
  })

  it('falls back to plain text rather than an empty title', () => {
    const badge = mapVerificationItemToBadge(
      item({ status: 'passed', label: '   ' }),
      'tsc',
      NOW,
    )
    expect(badge?.title).toBe('TSC · no command reported')
  })
})

describe('mapOutputToEvidence / clampEvidenceLine', () => {
  it('splits real output into lines and drops the blank ones', () => {
    expect(mapOutputToEvidence('tsc --noEmit\n\nFound 0 errors.\n')).toEqual([
      'tsc --noEmit',
      'Found 0 errors.',
    ])
  })

  it('returns nothing for absent or blank output', () => {
    expect(mapOutputToEvidence(null)).toBeUndefined()
    expect(mapOutputToEvidence('')).toBeUndefined()
    expect(mapOutputToEvidence('\n  \n')).toBeUndefined()
  })

  it('clamps a long line at a word boundary and marks the truncation', () => {
    const long = 'error TS2345: '.repeat(30)
    const clamped = clampEvidenceLine(long)

    expect(long.length).toBeGreaterThan(EVIDENCE_LINE_MAX)
    expect(clamped.length).toBeLessThanOrEqual(EVIDENCE_LINE_MAX + 1)
    expect(clamped.endsWith('…')).toBe(true)
    expect(clamped.slice(0, -1).endsWith(' ')).toBe(false)
    expect(long.startsWith(clamped.slice(0, -1))).toBe(true)
  })

  it('leaves a short line untouched', () => {
    expect(clampEvidenceLine('exit 1 · 1 failed / 84 passed')).toBe(
      'exit 1 · 1 failed / 84 passed',
    )
  })

  it('clamps the line COUNT and says how many it dropped', () => {
    const output = Array.from({ length: 9 }, (_, index) => `line ${index}`).join('\n')
    const evidence = mapOutputToEvidence(output)

    expect(evidence).toHaveLength(EVIDENCE_LINES_MAX + 1)
    expect(evidence?.slice(0, EVIDENCE_LINES_MAX)).toEqual([
      'line 0',
      'line 1',
      'line 2',
      'line 3',
    ])
    expect(evidence?.at(-1)).toBe('… +5 more output lines')
  })

  it('says "line" when exactly one is dropped', () => {
    const output = Array.from({ length: 5 }, (_, index) => `line ${index}`).join('\n')
    expect(mapOutputToEvidence(output)?.at(-1)).toBe('… +1 more output line')
  })
})

describe('formatCheckedAt', () => {
  it('shows the clock for a check run today', () => {
    expect(formatCheckedAt(TODAY_0938, NOW)).toBe('09:38')
  })

  it('shows the date for an older check', () => {
    expect(formatCheckedAt(LAST_MONTH, NOW)).toBe('Feb 17 09:38')
  })

  it('reads a zone-less SQLite timestamp as UTC, like the lib does', () => {
    expect(formatCheckedAt('2026-03-10 21:40:00', NOW)).toBe(
      formatCheckedAt('2026-03-10T21:40:00Z', NOW),
    )
  })

  it('yields nothing rather than an Invalid Date', () => {
    expect(formatCheckedAt(null, NOW)).toBeUndefined()
    expect(formatCheckedAt('   ', NOW)).toBeUndefined()
    expect(formatCheckedAt('not a timestamp', NOW)).toBeUndefined()
  })
})

describe('mapCheckpointToBadges', () => {
  it('maps only the checks that ran, in check order', () => {
    const badges = mapCheckpointToBadges(
      detail(
        verification({
          tsc: item({ status: 'passed', label: 'tsc --noEmit' }),
          tests: item({ status: 'failed', label: 'vitest run' }),
        }),
      ),
      NOW,
    )

    expect(badges.map((badge) => badge.title)).toEqual([
      'TSC · tsc --noEmit',
      'TESTS FAILED · vitest run',
    ])
    expect(badges.map((badge) => badge.state)).toEqual(['verified', 'claimed'])
  })

  it('returns NOTHING for a checkpoint whose checks never ran', () => {
    // The default map is all missing/not_configured — the common real case.
    expect(mapCheckpointToBadges(detail(), NOW)).toEqual([])
  })

  it('gives every badge a distinct title, so the list keys cannot collide', () => {
    const badges = mapCheckpointToBadges(
      detail(
        verification({
          tsc: item({ status: 'passed', label: 'pnpm verify' }),
          tests: item({ status: 'passed', label: 'pnpm verify' }),
          lint: item({ status: 'failed', label: 'pnpm verify' }),
          e2e: item({ status: 'passed', label: 'pnpm verify' }),
        }),
      ),
      NOW,
    )

    expect(new Set(badges.map((badge) => badge.title)).size).toBe(badges.length)
  })
})

describe('mapCheckpointToInertChecks', () => {
  it('reports the checks that produced no verdict, and only those', () => {
    const inert = mapCheckpointToInertChecks(
      detail(
        verification({
          tsc: item({ status: 'passed' }),
          tests: item({ status: 'missing', label: 'Not run yet' }),
        }),
      ),
    )

    expect(inert.map((entry) => entry.key)).toEqual(['tests', 'lint', 'e2e'])
    expect(inert[0].note).toBe('never ran · no verdict recorded')
    expect(inert[1].note).toBe('not configured for this project · no verdict')
  })

  it('reports nothing when every check ran', () => {
    const inert = mapCheckpointToInertChecks(
      detail(
        verification({
          tsc: item({ status: 'passed' }),
          tests: item({ status: 'passed' }),
          lint: item({ status: 'failed' }),
          e2e: item({ status: 'passed' }),
        }),
      ),
    )

    expect(inert).toEqual([])
  })
})

describe('buildCheckpointSourceLine', () => {
  it('names the checkpoint from real fields only', () => {
    expect(buildCheckpointSourceLine(detail())).toBe(
      'slice7a checkpoint verify · hermes · checkpoint 06ec90ba · pending',
    )
  })

  it('omits what the checkpoint does not carry', () => {
    expect(
      buildCheckpointSourceLine(
        detail(verification(), { task_name: null, project_name: null }),
      ),
    ).toBe('checkpoint 06ec90ba · pending')
  })
})
