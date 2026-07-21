export type WorkspaceHealthState = 'pass' | 'warn' | 'fail' | 'blocked' | 'unknown'

export type WorkspaceQualityArtifactCheck = {
  id: string
  label: string
  state: Exclude<WorkspaceHealthState, 'blocked' | 'unknown'>
  detail: string
  command: string
  exitCode: number | null
  durationMs: number
  artifactPath: string
  warnings?: number
  errors?: number
}

export type WorkspaceQualityArtifact = {
  schemaVersion: 1
  runId: string
  runDir: string
  startedAt: number
  finishedAt: number
  durationMs: number
  overall: 'pass' | 'warn' | 'fail'
  repo: {
    root: string
    head: string
    branch: string
    statusFingerprint: string
    dirtyCount: number
    untrackedCount: number
  }
  warningBudget: {
    baseline: number
    current: number | null
  }
  checks: Array<WorkspaceQualityArtifactCheck>
}

export type EvaluatedQualityCheck = Omit<
  WorkspaceQualityArtifactCheck,
  'state'
> & {
  state: WorkspaceHealthState
  reportedState?: WorkspaceQualityArtifactCheck['state']
}

export type EvaluatedWorkspaceQuality = {
  freshness: 'fresh' | 'stale' | 'missing'
  reason: string | null
  runId: string | null
  runDir: string | null
  runFinishedAt: number | null
  ageMs: number | null
  repoMatches: boolean | null
  warningBudget: WorkspaceQualityArtifact['warningBudget'] | null
  checks: Array<EvaluatedQualityCheck>
}

export const WORKSPACE_QUALITY_CHECKS = [
  { id: 'diff-check', label: 'Diff whitespace' },
  { id: 'lint', label: 'Lint budget' },
  { id: 'typecheck', label: 'TypeScript' },
  { id: 'tests', label: 'Full tests' },
  { id: 'build', label: 'Production build' },
] as const

function unknownChecks(detail: string): Array<EvaluatedQualityCheck> {
  return WORKSPACE_QUALITY_CHECKS.map<EvaluatedQualityCheck>((check) => ({
    ...check,
    state: 'unknown',
    detail,
    command: '',
    exitCode: null,
    durationMs: 0,
    artifactPath: '',
  }))
}

export function evaluateWorkspaceQualityArtifact(
  artifact: WorkspaceQualityArtifact | null,
  currentStatusFingerprint: string,
  observedAt: number,
  maxAgeMs = 24 * 60 * 60 * 1000,
): EvaluatedWorkspaceQuality {
  if (!artifact) {
    return {
      freshness: 'missing',
      reason: 'No quality-gate run has been recorded yet.',
      runId: null,
      runDir: null,
      runFinishedAt: null,
      ageMs: null,
      repoMatches: null,
      warningBudget: null,
      checks: unknownChecks('No current-run quality evidence is available.'),
    }
  }

  const ageMs = observedAt - artifact.finishedAt
  const repoMatches = artifact.repo.statusFingerprint === currentStatusFingerprint
  const invalidTime = !Number.isFinite(ageMs) || ageMs < -5 * 60 * 1000
  const expired = ageMs > maxAgeMs
  const reason = invalidTime
    ? 'Quality artifact has an invalid completion time.'
    : !repoMatches
      ? 'Worktree changed after the quality run.'
      : expired
        ? 'Quality artifact is older than 24 hours.'
        : null
  const freshness = reason ? 'stale' : 'fresh'

  return {
    freshness,
    reason,
    runId: artifact.runId,
    runDir: artifact.runDir,
    runFinishedAt: artifact.finishedAt,
    ageMs: Math.max(0, ageMs),
    repoMatches,
    warningBudget: artifact.warningBudget,
    checks: artifact.checks.map<EvaluatedQualityCheck>((check) =>
      freshness === 'fresh'
        ? { ...check, state: check.state }
        : {
            ...check,
            reportedState: check.state,
            state: 'unknown',
            detail: `${reason} Last reported: ${check.detail}`,
          },
    ),
  }
}

export function isWorkspaceQualityArtifact(value: unknown): value is WorkspaceQualityArtifact {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<WorkspaceQualityArtifact>
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.runId === 'string' &&
    typeof candidate.runDir === 'string' &&
    typeof candidate.finishedAt === 'number' &&
    Array.isArray(candidate.checks) &&
    Boolean(candidate.repo) &&
    typeof candidate.repo?.statusFingerprint === 'string'
  )
}
