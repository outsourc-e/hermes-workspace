import { execFileSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { Stats } from 'node:fs'

export type SwarmWorktreeAttempt = {
  attemptId: string
  repositoryPath: string
  worktreePath: string
  baseCommit: string
  createdAt: number
  workspaceKind: 'dir' | 'worktree'
}

// ---------------------------------------------------------------------------
// Retention classes
// ---------------------------------------------------------------------------

export type RetentionClass =
  | 'active'
  | 'pending'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'promoted'
  | 'review-retained'
  | 'orphan'
  | 'lease-expired'
  | 'unknown'

export type RetentionPolicy = {
  /** Never remove automatically */
  neverRemove: boolean
  /** Max age in ms before eligible for cleanup (null = never expire) */
  maxAgeMs: number | null
}

export const RETENTION_POLICIES: Record<RetentionClass, RetentionPolicy> = {
  active: { neverRemove: true, maxAgeMs: null },
  pending: { neverRemove: true, maxAgeMs: null },
  completed: { neverRemove: false, maxAgeMs: 7 * 24 * 60 * 60 * 1000 }, // 7 days
  blocked: { neverRemove: false, maxAgeMs: 30 * 24 * 60 * 60 * 1000 }, // 30 days
  failed: { neverRemove: false, maxAgeMs: 30 * 24 * 60 * 60 * 1000 }, // 30 days
  promoted: { neverRemove: true, maxAgeMs: null },
  'review-retained': { neverRemove: true, maxAgeMs: null },
  orphan: { neverRemove: false, maxAgeMs: 24 * 60 * 60 * 1000 }, // 24h grace period
  'lease-expired': { neverRemove: false, maxAgeMs: 24 * 60 * 60 * 1000 }, // 24h grace period
  unknown: { neverRemove: false, maxAgeMs: 7 * 24 * 60 * 60 * 1000 }, // 7 days fallback
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const WORKTREE_ROOT = process.env.HERMES_SWARM_WORKTREE_ROOT
  ? resolve(process.env.HERMES_SWARM_WORKTREE_ROOT)
  : join(homedir(), '.hermes', 'workspace-attempts')

const AUDIT_LOG = process.env.HERMES_SWARM_WORKTREE_AUDIT
  ? resolve(process.env.HERMES_SWARM_WORKTREE_AUDIT)
  : join(WORKTREE_ROOT, '.cleanup-audit.jsonl')

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function git(args: Array<string>, cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
  }).trim()
}

function safePart(value: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'attempt'
  )
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export type AuditEntry = {
  at: number
  action:
    | 'dry-run'
    | 'removed'
    | 'skip-retained'
    | 'skip-active'
    | 'skip-error'
    | 'orphan-detected'
    | 'lease-expired'
  worktreePath: string
  retentionClass: RetentionClass
  ageMs: number
  missionId?: string
  assignmentId?: string
  reason?: string
  error?: string
}

export function appendAudit(entry: AuditEntry): void {
  const dir = dirname(AUDIT_LOG)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  appendFileSync(AUDIT_LOG, JSON.stringify(entry) + '\n', { encoding: 'utf8' })
}

// ---------------------------------------------------------------------------
// Worktree creation (unchanged)
// ---------------------------------------------------------------------------

export function prepareSwarmWorktree(input: {
  repositoryPath: string
  missionId: string
  assignmentId: string
}): SwarmWorktreeAttempt {
  const repositoryPath = resolve(input.repositoryPath)
  if (!existsSync(repositoryPath))
    throw new Error(`Repository does not exist: ${repositoryPath}`)
  const repositoryRoot = resolve(
    git(['rev-parse', '--show-toplevel'], repositoryPath),
  )
  const baseCommit = git(['rev-parse', 'HEAD'], repositoryRoot)
  const attemptId = `${safePart(input.missionId)}-${safePart(input.assignmentId)}`
  const createWorktree = process.env.HERMES_SWARM_CREATE_WORKTREES === 'true'
  if (!createWorktree) {
    return {
      attemptId,
      repositoryPath: repositoryRoot,
      worktreePath: repositoryRoot,
      baseCommit,
      createdAt: Date.now(),
      workspaceKind: 'dir',
    }
  }
  const worktreePath = join(WORKTREE_ROOT, attemptId)
  mkdirSync(WORKTREE_ROOT, { recursive: true })
  if (!existsSync(worktreePath)) {
    git(
      ['worktree', 'add', '--detach', worktreePath, baseCommit],
      repositoryRoot,
    )
  }
  return {
    attemptId,
    repositoryPath: repositoryRoot,
    worktreePath,
    baseCommit,
    createdAt: Date.now(),
    workspaceKind: 'worktree',
  }
}

export function listSwarmWorktrees(repositoryPath: string): Array<string> {
  const root = resolve(repositoryPath)
  return git(['worktree', 'list', '--porcelain'], root)
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length).trim())
}

// ---------------------------------------------------------------------------
// Mission info for classification
// ---------------------------------------------------------------------------

export type WorktreeMissionInfo = {
  missionId: string
  assignmentId: string
  missionState?: string
  assignmentState?: string
  exists: boolean
}

/**
 * Parse a worktree directory name to extract missionId and assignmentId.
 * Format: <missionId>-<assignmentId> (both already safe-part encoded).
 */
export function parseWorktreeName(
  name: string,
): { missionId: string; assignmentId: string } | null {
  // Mission IDs start with 'conductor-' or 'mission-'
  // Assignment IDs start with 'assign-'
  const assignIdx = name.indexOf('-assign-')
  if (assignIdx === -1) return null
  const missionId = name.slice(0, assignIdx)
  const assignmentId = name.slice(assignIdx + 1)
  if (!missionId || !assignmentId) return null
  return { missionId, assignmentId }
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type WorktreeCandidate = {
  path: string
  name: string
  ageMs: number
  retentionClass: RetentionClass
  missionInfo: WorktreeMissionInfo | null
  reason: string
}

/**
 * Classify a worktree into a retention class.
 *
 * activePaths: paths of worktrees with active task runs (never remove).
 * missionLookup: optional function to look up mission/assignment state.
 * leaseExpiryMs: if provided, worktrees whose mission is older than this are lease-expired.
 */
export function classifyWorktree(input: {
  path: string
  name: string
  ageMs: number
  activePaths: Set<string>
  missionLookup?: (
    missionId: string,
    assignmentId: string,
  ) => WorktreeMissionInfo | null
  /** If provided, worktrees whose mission hasn't been updated in this many ms are lease-expired. */
  leaseExpiryMs?: number | null
}): WorktreeCandidate {
  const {
    path: wtPath,
    name,
    ageMs,
    activePaths,
    missionLookup,
    leaseExpiryMs,
  } = input

  // 1. Active task run — never remove
  if (activePaths.has(resolve(wtPath))) {
    return {
      path: wtPath,
      name,
      ageMs,
      retentionClass: 'active',
      missionInfo: null,
      reason: 'Active task run',
    }
  }

  // 2. Parse name to get mission/assignment
  const parsed = parseWorktreeName(name)
  if (!parsed) {
    return {
      path: wtPath,
      name,
      ageMs,
      retentionClass: 'unknown',
      missionInfo: null,
      reason: 'Unparseable worktree name',
    }
  }

  // 3. Look up mission state
  let missionInfo: WorktreeMissionInfo | null = null
  if (missionLookup) {
    try {
      missionInfo = missionLookup(parsed.missionId, parsed.assignmentId)
    } catch {
      // lookup failed — treat as orphan
    }
  }

  // 4. Orphan: mission or assignment no longer exists
  if (missionInfo && !missionInfo.exists) {
    return {
      path: wtPath,
      name,
      ageMs,
      retentionClass: 'orphan',
      missionInfo,
      reason: `Mission ${parsed.missionId} or assignment ${parsed.assignmentId} no longer exists`,
    }
  }

  // 4b. Lease expiry: mission exists but age exceeds lease period
  if (leaseExpiryMs && leaseExpiryMs > 0 && ageMs >= leaseExpiryMs) {
    return {
      path: wtPath,
      name,
      ageMs,
      retentionClass: 'lease-expired',
      missionInfo,
      reason: `Worktree age ${Math.round(ageMs / 3600000)}h exceeds lease ${Math.round(leaseExpiryMs / 3600000)}h`,
    }
  }

  // 5. Classify by mission/assignment state
  const missionState = missionInfo?.missionState
  const assignmentState = missionInfo?.assignmentState

  if (
    missionState === 'executing' ||
    assignmentState === 'dispatched' ||
    assignmentState === 'queued'
  ) {
    return {
      path: wtPath,
      name,
      ageMs,
      retentionClass: 'pending',
      missionInfo,
      reason: `Mission executing / assignment ${assignmentState}`,
    }
  }

  if (
    missionState === 'blocked' ||
    assignmentState === 'blocked' ||
    assignmentState === 'needs_input'
  ) {
    return {
      path: wtPath,
      name,
      ageMs,
      retentionClass: 'blocked',
      missionInfo,
      reason: `Mission/assignment blocked`,
    }
  }

  if (
    missionState === 'complete' ||
    assignmentState === 'done' ||
    assignmentState === 'checkpointed'
  ) {
    // Check if review-retained
    if (assignmentState === 'checkpointed' || assignmentState === 'reviewing') {
      return {
        path: wtPath,
        name,
        ageMs,
        retentionClass: 'review-retained',
        missionInfo,
        reason: 'Assignment pending review',
      }
    }
    return {
      path: wtPath,
      name,
      ageMs,
      retentionClass: 'completed',
      missionInfo,
      reason: `Mission complete / assignment done`,
    }
  }

  if (missionState === 'cancelled' || assignmentState === 'cancelled') {
    return {
      path: wtPath,
      name,
      ageMs,
      retentionClass: 'failed',
      missionInfo,
      reason: `Mission/assignment cancelled`,
    }
  }

  // 6. No mission info available — treat as orphan if lookup was provided
  if (missionLookup && !missionInfo) {
    return {
      path: wtPath,
      name,
      ageMs,
      retentionClass: 'orphan',
      missionInfo: null,
      reason: `Mission ${parsed.missionId} not found in ledger`,
    }
  }

  // 7. Fallback
  return {
    path: wtPath,
    name,
    ageMs,
    retentionClass: 'unknown',
    missionInfo: null,
    reason: 'Unable to classify',
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export type CleanupResult = {
  candidates: Array<WorktreeCandidate>
  removed: Array<string>
  retained: Array<WorktreeCandidate>
  errors: Array<{ path: string; error: string }>
  auditLog: string
  dryRun: boolean
  startedAt: number
  completedAt: number
}

export function cleanupSwarmWorktrees(input?: {
  maxAgeMs?: number
  activePaths?: Array<string>
  remove?: boolean
  missionLookup?: (
    missionId: string,
    assignmentId: string,
  ) => WorktreeMissionInfo | null
  /** Override retention policies */
  retentionOverrides?: Partial<Record<RetentionClass, RetentionPolicy>>
  /** Lease expiry in ms — worktrees older than this are classified lease-expired. */
  leaseExpiryMs?: number | null
  /** Called for each removed worktree so callers can emit ledger events. */
  onCleanupEvent?: (info: {
    worktreePath: string
    retentionClass: RetentionClass
    missionId?: string
    assignmentId?: string
    reason?: string
    dryRun: boolean
  }) => void
}): CleanupResult {
  const startedAt = Date.now()
  const dryRun = !input?.remove
  const active = new Set(
    (input?.activePaths ?? []).map((pathValue) => resolve(pathValue)),
  )
  const policies = { ...RETENTION_POLICIES, ...input?.retentionOverrides }
  // Legacy maxAgeMs override: if provided, use as fallback for unknown class
  const legacyMaxAge = input?.maxAgeMs ?? null

  if (!existsSync(WORKTREE_ROOT)) {
    return {
      candidates: [],
      removed: [],
      retained: [],
      errors: [],
      auditLog: AUDIT_LOG,
      dryRun,
      startedAt,
      completedAt: Date.now(),
    }
  }

  const now = Date.now()
  const candidates: Array<WorktreeCandidate> = []
  const removed: Array<string> = []
  const retained: Array<WorktreeCandidate> = []
  const errors: Array<{ path: string; error: string }> = []

  for (const name of readdirSync(WORKTREE_ROOT)) {
    const worktreePath = join(WORKTREE_ROOT, name)
    // Skip non-directories and the audit log
    let stat: Stats | undefined
    try {
      stat = statSync(worktreePath)
      if (!stat.isDirectory()) continue
    } catch {
      continue
    }

    const ageMs = now - stat.mtimeMs

    const candidate = classifyWorktree({
      path: worktreePath,
      name,
      ageMs,
      activePaths: active,
      missionLookup: input?.missionLookup,
      leaseExpiryMs: input?.leaseExpiryMs,
    })

    const policy = policies[candidate.retentionClass]

    // Never-remove classes
    if (policy.neverRemove) {
      retained.push(candidate)
      appendAudit({
        at: now,
        action: 'skip-retained',
        worktreePath: worktreePath,
        retentionClass: candidate.retentionClass,
        ageMs,
        missionId: candidate.missionInfo?.missionId,
        assignmentId: candidate.missionInfo?.assignmentId,
        reason: candidate.reason,
      })
      continue
    }

    // Age check
    const effectiveMaxAge = policy.maxAgeMs ?? legacyMaxAge
    if (effectiveMaxAge !== null && ageMs < effectiveMaxAge) {
      retained.push(candidate)
      continue
    }

    // Eligible for cleanup
    candidates.push(candidate)

    if (input?.remove) {
      const emitCleanup = (reason: string) => {
        input.onCleanupEvent?.({
          worktreePath,
          retentionClass: candidate.retentionClass,
          missionId: candidate.missionInfo?.missionId,
          assignmentId: candidate.missionInfo?.assignmentId,
          reason,
          dryRun: false,
        })
      }
      try {
        const repositoryPath = git(
          ['rev-parse', '--show-toplevel'],
          worktreePath,
        )
        git(['worktree', 'remove', '--force', worktreePath], repositoryPath)
        removed.push(worktreePath)
        appendAudit({
          at: now,
          action: 'removed',
          worktreePath,
          retentionClass: candidate.retentionClass,
          ageMs,
          missionId: candidate.missionInfo?.missionId,
          assignmentId: candidate.missionInfo?.assignmentId,
          reason: candidate.reason,
        })
        emitCleanup(candidate.reason)
      } catch (err) {
        // Fallback: direct rmSync
        try {
          rmSync(worktreePath, { recursive: true, force: true })
          removed.push(worktreePath)
          appendAudit({
            at: now,
            action: 'removed',
            worktreePath,
            retentionClass: candidate.retentionClass,
            ageMs,
            missionId: candidate.missionInfo?.missionId,
            assignmentId: candidate.missionInfo?.assignmentId,
            reason: `${candidate.reason} (fallback rmSync)`,
          })
          emitCleanup(`${candidate.reason} (fallback rmSync)`)
        } catch (rmErr) {
          errors.push({ path: worktreePath, error: String(rmErr) })
          appendAudit({
            at: now,
            action: 'skip-error',
            worktreePath,
            retentionClass: candidate.retentionClass,
            ageMs,
            missionId: candidate.missionInfo?.missionId,
            assignmentId: candidate.missionInfo?.assignmentId,
            reason: candidate.reason,
            error: String(rmErr),
          })
        }
      }
    } else {
      // Dry run — just audit
      appendAudit({
        at: now,
        action: 'dry-run',
        worktreePath,
        retentionClass: candidate.retentionClass,
        ageMs,
        missionId: candidate.missionInfo?.missionId,
        assignmentId: candidate.missionInfo?.assignmentId,
        reason: candidate.reason,
      })
      input?.onCleanupEvent?.({
        worktreePath,
        retentionClass: candidate.retentionClass,
        missionId: candidate.missionInfo?.missionId,
        assignmentId: candidate.missionInfo?.assignmentId,
        reason: candidate.reason,
        dryRun: true,
      })
    }
  }

  return {
    candidates,
    removed,
    retained,
    errors,
    auditLog: AUDIT_LOG,
    dryRun,
    startedAt,
    completedAt: Date.now(),
  }
}
