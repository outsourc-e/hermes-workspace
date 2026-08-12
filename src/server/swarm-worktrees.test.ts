import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tempRoot: string
let tempAudit: string

async function loadModule() {
  vi.resetModules()
  tempRoot = mkdtempSync(join(tmpdir(), 'swarm-worktrees-test-'))
  tempAudit = join(tempRoot, '.cleanup-audit.jsonl')
  process.env.HERMES_SWARM_WORKTREE_ROOT = tempRoot
  process.env.HERMES_SWARM_WORKTREE_AUDIT = tempAudit
  return await import('./swarm-worktrees')
}

function makeWorktreeDir(name: string, ageHours: number): string {
  const dir = join(tempRoot, name)
  mkdirSync(dir, { recursive: true })
  // Write a placeholder file so the dir isn't empty
  writeFileSync(join(dir, '.placeholder'), 'test')
  // Set mtime to ageHours ago
  const ageMs = ageHours * 60 * 60 * 1000
  const targetTime = new Date(Date.now() - ageMs)
  utimesSync(dir, targetTime, targetTime)
  return dir
}

describe('swarm-worktrees', () => {
  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'swarm-worktrees-test-'))
    tempAudit = join(tempRoot, '.cleanup-audit.jsonl')
    process.env.HERMES_SWARM_WORKTREE_ROOT = tempRoot
    process.env.HERMES_SWARM_WORKTREE_AUDIT = tempAudit
  })

  afterEach(() => {
    vi.resetModules()
    delete process.env.HERMES_SWARM_WORKTREE_ROOT
    delete process.env.HERMES_SWARM_WORKTREE_AUDIT
    try {
      rmSync(tempRoot, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  })

  // -----------------------------------------------------------------------
  // parseWorktreeName
  // -----------------------------------------------------------------------

  describe('parseWorktreeName', () => {
    it('extracts missionId and assignmentId from valid name', async () => {
      const mod = await loadModule()
      const result = mod.parseWorktreeName('conductor-123-assign-abc')
      expect(result).toEqual({
        missionId: 'conductor-123',
        assignmentId: 'assign-abc',
      })
    })

    it('returns null for unparseable name', async () => {
      const mod = await loadModule()
      expect(mod.parseWorktreeName('random-dir')).toBeNull()
      expect(mod.parseWorktreeName('')).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // classifyWorktree
  // -----------------------------------------------------------------------

  describe('classifyWorktree', () => {
    it('classifies active worktree as active (never remove)', async () => {
      const mod = await loadModule()
      const path = makeWorktreeDir('conductor-1-assign-1', 0)
      const result = mod.classifyWorktree({
        path,
        name: 'conductor-1-assign-1',
        ageMs: 0,
        activePaths: new Set([path]),
      })
      expect(result.retentionClass).toBe('active')
      expect(result.reason).toBe('Active task run')
    })

    it('classifies unparseable name as unknown', async () => {
      const mod = await loadModule()
      const path = makeWorktreeDir('random-dir', 5)
      const result = mod.classifyWorktree({
        path,
        name: 'random-dir',
        ageMs: 5 * 3600_000,
        activePaths: new Set(),
      })
      expect(result.retentionClass).toBe('unknown')
    })

    it('classifies as orphan when mission does not exist', async () => {
      const mod = await loadModule()
      const path = makeWorktreeDir('conductor-xyz-assign-abc', 5)
      const result = mod.classifyWorktree({
        path,
        name: 'conductor-xyz-assign-abc',
        ageMs: 5 * 3600_000,
        activePaths: new Set(),
        missionLookup: () => ({
          missionId: 'conductor-xyz',
          assignmentId: 'assign-abc',
          exists: false,
        }),
      })
      expect(result.retentionClass).toBe('orphan')
      expect(result.missionInfo?.exists).toBe(false)
    })

    it('classifies as pending when mission is executing', async () => {
      const mod = await loadModule()
      const path = makeWorktreeDir('conductor-1-assign-1', 1)
      const result = mod.classifyWorktree({
        path,
        name: 'conductor-1-assign-1',
        ageMs: 3600_000,
        activePaths: new Set(),
        missionLookup: () => ({
          missionId: 'conductor-1',
          assignmentId: 'assign-1',
          exists: true,
          missionState: 'executing',
          assignmentState: 'dispatched',
        }),
      })
      expect(result.retentionClass).toBe('pending')
    })

    it('classifies as blocked when assignment is blocked', async () => {
      const mod = await loadModule()
      const path = makeWorktreeDir('conductor-1-assign-1', 1)
      const result = mod.classifyWorktree({
        path,
        name: 'conductor-1-assign-1',
        ageMs: 3600_000,
        activePaths: new Set(),
        missionLookup: () => ({
          missionId: 'conductor-1',
          assignmentId: 'assign-1',
          exists: true,
          missionState: 'blocked',
          assignmentState: 'blocked',
        }),
      })
      expect(result.retentionClass).toBe('blocked')
    })

    it('classifies as completed when mission is complete', async () => {
      const mod = await loadModule()
      const path = makeWorktreeDir('conductor-1-assign-1', 1)
      const result = mod.classifyWorktree({
        path,
        name: 'conductor-1-assign-1',
        ageMs: 3600_000,
        activePaths: new Set(),
        missionLookup: () => ({
          missionId: 'conductor-1',
          assignmentId: 'assign-1',
          exists: true,
          missionState: 'complete',
          assignmentState: 'done',
        }),
      })
      expect(result.retentionClass).toBe('completed')
    })

    it('classifies as review-retained when assignment is checkpointed', async () => {
      const mod = await loadModule()
      const path = makeWorktreeDir('conductor-1-assign-1', 1)
      const result = mod.classifyWorktree({
        path,
        name: 'conductor-1-assign-1',
        ageMs: 3600_000,
        activePaths: new Set(),
        missionLookup: () => ({
          missionId: 'conductor-1',
          assignmentId: 'assign-1',
          exists: true,
          missionState: 'complete',
          assignmentState: 'checkpointed',
        }),
      })
      expect(result.retentionClass).toBe('review-retained')
    })

    it('classifies as failed when mission is cancelled', async () => {
      const mod = await loadModule()
      const path = makeWorktreeDir('conductor-1-assign-1', 1)
      const result = mod.classifyWorktree({
        path,
        name: 'conductor-1-assign-1',
        ageMs: 3600_000,
        activePaths: new Set(),
        missionLookup: () => ({
          missionId: 'conductor-1',
          assignmentId: 'assign-1',
          exists: true,
          missionState: 'cancelled',
          assignmentState: 'cancelled',
        }),
      })
      expect(result.retentionClass).toBe('failed')
    })

    it('classifies as orphan when missionLookup returns null', async () => {
      const mod = await loadModule()
      const path = makeWorktreeDir('conductor-1-assign-1', 5)
      const result = mod.classifyWorktree({
        path,
        name: 'conductor-1-assign-1',
        ageMs: 5 * 3600_000,
        activePaths: new Set(),
        missionLookup: () => null,
      })
      expect(result.retentionClass).toBe('orphan')
    })

    it('classifies as lease-expired when age exceeds leaseExpiryMs', async () => {
      const mod = await loadModule()
      const path = makeWorktreeDir('conductor-1-assign-1', 48)
      const result = mod.classifyWorktree({
        path,
        name: 'conductor-1-assign-1',
        ageMs: 48 * 3600_000,
        activePaths: new Set(),
        missionLookup: () => ({
          missionId: 'conductor-1',
          assignmentId: 'assign-1',
          exists: true,
          missionState: 'executing',
          assignmentState: 'dispatched',
        }),
        leaseExpiryMs: 24 * 3600_000, // 24h lease
      })
      expect(result.retentionClass).toBe('lease-expired')
    })

    it('does not classify as lease-expired when age is under leaseExpiryMs', async () => {
      const mod = await loadModule()
      const path = makeWorktreeDir('conductor-1-assign-1', 10)
      const result = mod.classifyWorktree({
        path,
        name: 'conductor-1-assign-1',
        ageMs: 10 * 3600_000,
        activePaths: new Set(),
        missionLookup: () => ({
          missionId: 'conductor-1',
          assignmentId: 'assign-1',
          exists: true,
          missionState: 'executing',
          assignmentState: 'dispatched',
        }),
        leaseExpiryMs: 24 * 3600_000, // 24h lease
      })
      expect(result.retentionClass).toBe('pending')
    })
  })

  // -----------------------------------------------------------------------
  // RETENTION_POLICIES
  // -----------------------------------------------------------------------

  describe('RETENTION_POLICIES', () => {
    it('active is never-remove', async () => {
      const mod = await loadModule()
      expect(mod.RETENTION_POLICIES.active.neverRemove).toBe(true)
      expect(mod.RETENTION_POLICIES.active.maxAgeMs).toBeNull()
    })

    it('pending is never-remove', async () => {
      const mod = await loadModule()
      expect(mod.RETENTION_POLICIES.pending.neverRemove).toBe(true)
    })

    it('completed has 7-day retention', async () => {
      const mod = await loadModule()
      expect(mod.RETENTION_POLICIES.completed.neverRemove).toBe(false)
      expect(mod.RETENTION_POLICIES.completed.maxAgeMs).toBe(
        7 * 24 * 60 * 60 * 1000,
      )
    })

    it('blocked has 30-day retention', async () => {
      const mod = await loadModule()
      expect(mod.RETENTION_POLICIES.blocked.neverRemove).toBe(false)
      expect(mod.RETENTION_POLICIES.blocked.maxAgeMs).toBe(
        30 * 24 * 60 * 60 * 1000,
      )
    })

    it('failed has 30-day retention', async () => {
      const mod = await loadModule()
      expect(mod.RETENTION_POLICIES.failed.neverRemove).toBe(false)
      expect(mod.RETENTION_POLICIES.failed.maxAgeMs).toBe(
        30 * 24 * 60 * 60 * 1000,
      )
    })

    it('promoted is never-remove', async () => {
      const mod = await loadModule()
      expect(mod.RETENTION_POLICIES.promoted.neverRemove).toBe(true)
    })

    it('review-retained is never-remove', async () => {
      const mod = await loadModule()
      expect(mod.RETENTION_POLICIES['review-retained'].neverRemove).toBe(true)
    })

    it('orphan has 24h grace period', async () => {
      const mod = await loadModule()
      expect(mod.RETENTION_POLICIES.orphan.neverRemove).toBe(false)
      expect(mod.RETENTION_POLICIES.orphan.maxAgeMs).toBe(24 * 60 * 60 * 1000)
    })

    it('lease-expired has 24h grace period', async () => {
      const mod = await loadModule()
      expect(mod.RETENTION_POLICIES['lease-expired'].neverRemove).toBe(false)
      expect(mod.RETENTION_POLICIES['lease-expired'].maxAgeMs).toBe(
        24 * 60 * 60 * 1000,
      )
    })
  })

  // -----------------------------------------------------------------------
  // cleanupSwarmWorktrees — dry run
  // -----------------------------------------------------------------------

  describe('cleanupSwarmWorktrees (dry-run)', () => {
    it('returns empty result when WORKTREE_ROOT does not exist', async () => {
      const mod = await loadModule()
      // tempRoot exists but is empty — that's fine, it still exists
      // Remove it to test the not-exists path
      rmSync(tempRoot, { recursive: true, force: true })
      const result = mod.cleanupSwarmWorktrees({ remove: false })
      expect(result.candidates).toEqual([])
      expect(result.removed).toEqual([])
      expect(result.retained).toEqual([])
      expect(result.dryRun).toBe(true)
    })

    it('lists candidates without deleting in dry-run mode', async () => {
      const mod = await loadModule()
      // Create an orphan worktree (no mission lookup → unknown class, old enough)
      makeWorktreeDir('conductor-old-assign-1', 10 * 24) // 10 days old

      const result = mod.cleanupSwarmWorktrees({
        remove: false,
        maxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
      })

      expect(result.dryRun).toBe(true)
      expect(result.removed).toEqual([])
      expect(result.candidates.length).toBeGreaterThanOrEqual(1)
      // The worktree dir should still exist
      expect(existsSync(join(tempRoot, 'conductor-old-assign-1'))).toBe(true)
    })

    it('excludes active worktrees from candidates', async () => {
      const mod = await loadModule()
      const activePath = makeWorktreeDir('conductor-active-assign-1', 0)

      const result = mod.cleanupSwarmWorktrees({
        remove: false,
        activePaths: [activePath],
        maxAgeMs: 1, // 1ms — everything is eligible by age
      })

      const activeCandidate = result.retained.find(
        (c) => c.retentionClass === 'active',
      )
      expect(activeCandidate).toBeDefined()
      expect(
        result.candidates.find((c) => c.path === activePath),
      ).toBeUndefined()
    })

    it('excludes never-remove classes from candidates', async () => {
      const mod = await loadModule()
      makeWorktreeDir('conductor-1-assign-1', 1)

      const result = mod.cleanupSwarmWorktrees({
        remove: false,
        missionLookup: () => ({
          missionId: 'conductor-1',
          assignmentId: 'assign-1',
          exists: true,
          missionState: 'executing',
          assignmentState: 'dispatched',
        }),
        maxAgeMs: 1,
      })

      // pending is never-remove, so it should be in retained, not candidates
      const pending = result.retained.find(
        (c) => c.retentionClass === 'pending',
      )
      expect(pending).toBeDefined()
      expect(
        result.candidates.find((c) => c.retentionClass === 'pending'),
      ).toBeUndefined()
    })

    it('detects orphan worktrees', async () => {
      const mod = await loadModule()
      makeWorktreeDir('conductor-missing-assign-1', 48) // 2 days old — past 24h orphan grace

      const result = mod.cleanupSwarmWorktrees({
        remove: false,
        missionLookup: () => ({
          missionId: 'conductor-missing',
          assignmentId: 'assign-1',
          exists: false,
        }),
        maxAgeMs: 1,
      })

      const orphan = result.candidates.find(
        (c) => c.retentionClass === 'orphan',
      )
      expect(orphan).toBeDefined()
      expect(orphan?.reason).toContain('no longer exists')
    })

    it('writes audit log entries in dry-run mode', async () => {
      const mod = await loadModule()
      makeWorktreeDir('conductor-old-assign-1', 10 * 24)

      mod.cleanupSwarmWorktrees({
        remove: false,
        maxAgeMs: 7 * 24 * 60 * 60 * 1000,
      })

      expect(existsSync(tempAudit)).toBe(true)
      const { readFileSync } = await import('node:fs')
      const lines = readFileSync(tempAudit, 'utf8').trim().split('\n')
      const entries = lines.map((l) => JSON.parse(l))
      expect(
        entries.some((e: { action: string }) => e.action === 'dry-run'),
      ).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // cleanupSwarmWorktrees — actual removal
  // -----------------------------------------------------------------------

  describe('cleanupSwarmWorktrees (remove)', () => {
    it('removes eligible worktrees and records audit', async () => {
      const mod = await loadModule()
      const wtPath = makeWorktreeDir('conductor-old-assign-1', 10 * 24)

      const result = mod.cleanupSwarmWorktrees({
        remove: true,
        maxAgeMs: 7 * 24 * 60 * 60 * 1000,
      })

      expect(result.dryRun).toBe(false)
      expect(result.removed).toContain(wtPath)
      expect(existsSync(wtPath)).toBe(false)

      // Audit log should have a 'removed' entry
      const { readFileSync } = await import('node:fs')
      const lines = readFileSync(tempAudit, 'utf8').trim().split('\n')
      const entries = lines.map((l) => JSON.parse(l))
      expect(
        entries.some((e: { action: string }) => e.action === 'removed'),
      ).toBe(true)
    })

    it('does not remove active worktrees', async () => {
      const mod = await loadModule()
      const activePath = makeWorktreeDir('conductor-active-assign-1', 0)

      const result = mod.cleanupSwarmWorktrees({
        remove: true,
        activePaths: [activePath],
        maxAgeMs: 1,
      })

      expect(result.removed).not.toContain(activePath)
      expect(existsSync(activePath)).toBe(true)
    })

    it('does not remove retained (never-remove) worktrees', async () => {
      const mod = await loadModule()
      const wtPath = makeWorktreeDir('conductor-1-assign-1', 1)

      const result = mod.cleanupSwarmWorktrees({
        remove: true,
        missionLookup: () => ({
          missionId: 'conductor-1',
          assignmentId: 'assign-1',
          exists: true,
          missionState: 'executing',
          assignmentState: 'dispatched',
        }),
        maxAgeMs: 1,
      })

      expect(result.removed).not.toContain(wtPath)
      expect(existsSync(wtPath)).toBe(true)
    })

    it('is idempotent — running twice does not error', async () => {
      const mod = await loadModule()
      makeWorktreeDir('conductor-old-assign-1', 10 * 24)

      const first = mod.cleanupSwarmWorktrees({
        remove: true,
        maxAgeMs: 7 * 24 * 60 * 60 * 1000,
      })
      expect(first.removed.length).toBeGreaterThanOrEqual(1)

      // Second run should find nothing to remove
      const second = mod.cleanupSwarmWorktrees({
        remove: true,
        maxAgeMs: 7 * 24 * 60 * 60 * 1000,
      })
      expect(second.removed).toEqual([])
      expect(second.errors).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // cleanupSwarmWorktrees — onCleanupEvent callback
  // -----------------------------------------------------------------------

  describe('cleanupSwarmWorktrees (onCleanupEvent)', () => {
    it('calls onCleanupEvent for dry-run candidates', async () => {
      const mod = await loadModule()
      makeWorktreeDir('conductor-old-assign-1', 10 * 24)

      const events: Array<{ dryRun: boolean; worktreePath: string }> = []
      mod.cleanupSwarmWorktrees({
        remove: false,
        maxAgeMs: 7 * 24 * 60 * 60 * 1000,
        onCleanupEvent: (info) => events.push(info),
      })

      expect(events.length).toBeGreaterThanOrEqual(1)
      expect(events.every((e) => e.dryRun === true)).toBe(true)
    })

    it('calls onCleanupEvent for removed worktrees', async () => {
      const mod = await loadModule()
      makeWorktreeDir('conductor-old-assign-1', 10 * 24)

      const events: Array<{ dryRun: boolean; worktreePath: string }> = []
      mod.cleanupSwarmWorktrees({
        remove: true,
        maxAgeMs: 7 * 24 * 60 * 60 * 1000,
        onCleanupEvent: (info) => events.push(info),
      })

      expect(events.length).toBeGreaterThanOrEqual(1)
      expect(events.every((e) => e.dryRun === false)).toBe(true)
    })

    it('passes missionId in onCleanupEvent when available', async () => {
      const mod = await loadModule()
      makeWorktreeDir('conductor-old-assign-1', 10 * 24)

      const events: Array<{ missionId?: string }> = []
      mod.cleanupSwarmWorktrees({
        remove: false,
        maxAgeMs: 1,
        missionLookup: () => ({
          missionId: 'conductor-old',
          assignmentId: 'assign-1',
          exists: false,
        }),
        onCleanupEvent: (info) => events.push(info),
      })

      expect(events.length).toBeGreaterThanOrEqual(1)
      // Orphan class — missionInfo has missionId
      expect(events.some((e) => e.missionId === 'conductor-old')).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // cleanupSwarmWorktrees — lease expiry integration
  // -----------------------------------------------------------------------

  describe('cleanupSwarmWorktrees (lease expiry)', () => {
    it('classifies old worktrees as lease-expired when leaseExpiryMs is set', async () => {
      const mod = await loadModule()
      makeWorktreeDir('conductor-1-assign-1', 48)

      const result = mod.cleanupSwarmWorktrees({
        remove: false,
        missionLookup: () => ({
          missionId: 'conductor-1',
          assignmentId: 'assign-1',
          exists: true,
          missionState: 'executing',
          assignmentState: 'dispatched',
        }),
        leaseExpiryMs: 24 * 3600_000, // 24h
        maxAgeMs: 1,
      })

      const leaseExpired = result.candidates.find(
        (c) => c.retentionClass === 'lease-expired',
      )
      expect(leaseExpired).toBeDefined()
    })
  })

  // -----------------------------------------------------------------------
  // Audit log
  // -----------------------------------------------------------------------

  describe('appendAudit', () => {
    it('appends entries to the audit log file', async () => {
      const mod = await loadModule()
      mod.appendAudit({
        at: Date.now(),
        action: 'dry-run',
        worktreePath: '/fake/path',
        retentionClass: 'orphan',
        ageMs: 1000,
        reason: 'test',
      })

      expect(existsSync(tempAudit)).toBe(true)
      const { readFileSync } = await import('node:fs')
      const content = readFileSync(tempAudit, 'utf8')
      const entry = JSON.parse(content.trim())
      expect(entry.action).toBe('dry-run')
      expect(entry.worktreePath).toBe('/fake/path')
      expect(entry.retentionClass).toBe('orphan')
    })
  })
})
