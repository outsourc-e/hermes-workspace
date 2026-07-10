import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  GOVERNED_ACTION_CATEGORIES,
  evaluateGovernedAction,
  getGovernancePolicy,
} from './approval-governance'
import {
  createNovaFabricReviewProposal,
  updateNovaFabricReviewStatus,
} from './nova-fabric-store'

let tempDir = ''
let originalFabricFile: string | undefined

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-governance-'))
  originalFabricFile = process.env.NOVA_FABRIC_FILE
  process.env.NOVA_FABRIC_FILE = path.join(tempDir, 'nova-fabric.json')
})

afterEach(() => {
  if (originalFabricFile === undefined) delete process.env.NOVA_FABRIC_FILE
  else process.env.NOVA_FABRIC_FILE = originalFabricFile
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('governance policy registry', () => {
  it('covers every governed category and always requires approval', () => {
    const policy = getGovernancePolicy()
    expect(Object.keys(policy).sort()).toEqual(
      [...GOVERNED_ACTION_CATEGORIES].sort(),
    )
    for (const category of GOVERNED_ACTION_CATEGORIES) {
      expect(policy[category].requiresApproval).toBe(true)
      expect(policy[category].label.length).toBeGreaterThan(0)
    }
  })
})

describe('evaluateGovernedAction', () => {
  it('refuses any governed action without an approval receipt', () => {
    const verdict = evaluateGovernedAction({
      category: 'external-message',
      action: 'send customer email',
    })
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toMatch(/approval/i)
  })

  it('refuses when the claimed review id does not exist', () => {
    const verdict = evaluateGovernedAction({
      category: 'jobboard-write',
      action: 'update kanban card',
      approvedReviewId: 'review-does-not-exist',
    })
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toMatch(/not found/i)
  })

  it('refuses when the review exists but is still pending', () => {
    const review = createNovaFabricReviewProposal({
      title: 'Send vendor status email',
      reason: 'weekly update',
      targetType: 'source-map',
      proposedDiff: { action: 'send' },
    })
    const verdict = evaluateGovernedAction({
      category: 'external-message',
      action: 'send vendor status email',
      approvedReviewId: review.id,
    })
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toMatch(/pending/i)
  })

  it('allows only when the named review is server-side approved for this exact action', () => {
    const review = createNovaFabricReviewProposal({
      title: 'Send vendor status email',
      reason: 'weekly update',
      targetType: 'source-map',
      proposedDiff: {
        governedCategory: 'external-message',
        action: 'send vendor status email',
      },
    })
    updateNovaFabricReviewStatus(review.id, 'approved', 'taylor said yes')
    const verdict = evaluateGovernedAction({
      category: 'external-message',
      action: 'send vendor status email',
      approvedReviewId: review.id,
    })
    expect(verdict.allowed).toBe(true)
    expect(verdict.reviewId).toBe(review.id)
  })

  it('refuses a review approved for a DIFFERENT category or action (no scope confusion)', () => {
    const review = createNovaFabricReviewProposal({
      title: 'Governed action: rename a self-state note',
      reason: 'harmless rename',
      targetType: 'self-state',
      proposedDiff: { governedCategory: 'nova-self-state', action: 'rename note' },
    })
    updateNovaFabricReviewStatus(review.id, 'approved', 'fine for the rename')
    // The SAME approved review id must not authorize an unrelated category.
    const crossCategory = evaluateGovernedAction({
      category: 'spending',
      action: 'buy credits',
      approvedReviewId: review.id,
    })
    expect(crossCategory.allowed).toBe(false)
    expect(crossCategory.reason).toMatch(/does not cover|different/i)
    // Nor a different action within the same category.
    const crossAction = evaluateGovernedAction({
      category: 'nova-self-state',
      action: 'delete all self-state',
      approvedReviewId: review.id,
    })
    expect(crossAction.allowed).toBe(false)
  })

  it('refuses a review that never declared a governed category', () => {
    const review = createNovaFabricReviewProposal({
      title: 'Vault cleanup: merge duplicates',
      reason: 'insights recommendation',
      targetType: 'source-map',
      proposedDiff: { cleanupKind: 'merge-duplicates' },
    })
    updateNovaFabricReviewStatus(review.id, 'approved', 'yes clean it')
    const verdict = evaluateGovernedAction({
      category: 'external-message',
      action: 'send email',
      approvedReviewId: review.id,
    })
    expect(verdict.allowed).toBe(false)
  })

  it('refuses a rejected review even if the browser claims otherwise', () => {
    const review = createNovaFabricReviewProposal({
      title: 'Delete production data',
      reason: 'cleanup',
      targetType: 'source-map',
      proposedDiff: { action: 'delete' },
    })
    updateNovaFabricReviewStatus(review.id, 'rejected', 'absolutely not')
    const verdict = evaluateGovernedAction({
      category: 'destructive',
      action: 'delete production data',
      approvedReviewId: review.id,
    })
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toMatch(/rejected/i)
  })
})
