import { describe, expect, it } from 'vitest'
import { buildTaylorApprovalQueue } from './taylor-approval-queue'
import type {
  NovaFabricConsolidationReviewRecord,
  NovaFabricEventRecord,
} from './nova-fabric-store'
import type { NovaWantCard } from './nova-wants-store'

const NOW = '2026-07-08T12:00:00.000Z'

function review(
  partial: Partial<NovaFabricConsolidationReviewRecord> = {},
): NovaFabricConsolidationReviewRecord {
  return {
    id: 'review-1',
    type: 'consolidation-review',
    schemaVersion: 1,
    createdAt: '2026-07-08T10:00:00.000Z',
    updatedAt: '2026-07-08T10:00:00.000Z',
    provenance: 'test',
    riskLevel: 'high',
    approvalLevel: 'explicit-approval',
    verificationState: 'draft',
    sourceLinks: [],
    receiptLinks: [],
    title: 'Approve protected move',
    reason: 'Protected wants move requires Taylor.',
    status: 'pending',
    targetType: 'nova-wants',
    targetId: 'want-1',
    proposedDiff: { status: 'approved' },
    ...partial,
  }
}

function boundaryEvent(
  partial: Partial<NovaFabricEventRecord> = {},
): NovaFabricEventRecord {
  return {
    id: 'event-boundary-1',
    type: 'event',
    schemaVersion: 1,
    createdAt: '2026-07-08T09:00:00.000Z',
    updatedAt: '2026-07-08T09:00:00.000Z',
    provenance: 'Mission Control server boundary guard',
    riskLevel: 'high',
    approvalLevel: 'explicit-approval',
    verificationState: 'tool-verified',
    sourceLinks: [{ label: 'Target system', value: 'gmail', kind: 'note' }],
    receiptLinks: [],
    title: 'External action blocked: send email',
    summary: 'External sends require Taylor approval. Target system: gmail.',
    eventKind: 'boundary',
    ...partial,
  }
}

function want(partial: Partial<NovaWantCard> = {}): NovaWantCard {
  return {
    id: 'want-1',
    title: 'Expand agency scope',
    description: 'Wants more unattended actions.',
    category: 'agency',
    approvalLevel: 'needs-taylor-review',
    source: 'nova',
    provenance: 'test',
    status: 'needs-taylor-review',
    position: 0,
    createdAt: '2026-07-08T08:00:00.000Z',
    updatedAt: '2026-07-08T08:00:00.000Z',
    linkedReceipt: null,
    linkedNote: null,
    fabricEventIds: [],
    fabricSelfStateIds: [],
    fabricSourceMapIds: [],
    fabricReviewIds: [],
    whyThisMatters: 'Agency changes are protected.',
    ...partial,
  }
}

describe('buildTaylorApprovalQueue', () => {
  it('includes pending fabric reviews as actionable items', () => {
    const queue = buildTaylorApprovalQueue({
      fabric: { reviewQueue: [review()], events: [] },
      wants: [],
      now: NOW,
    })
    expect(queue.items).toHaveLength(1)
    expect(queue.items[0]).toMatchObject({
      kind: 'fabric-review',
      actionable: true,
      reviewId: 'review-1',
      riskLevel: 'high',
    })
    expect(queue.counts.actionable).toBe(1)
  })

  it('excludes non-pending reviews', () => {
    const queue = buildTaylorApprovalQueue({
      fabric: {
        reviewQueue: [review({ status: 'approved' })],
        events: [],
      },
      wants: [],
      now: NOW,
    })
    expect(queue.items).toHaveLength(0)
  })

  it('classifies self-state reviews as self-state proposals', () => {
    const queue = buildTaylorApprovalQueue({
      fabric: {
        reviewQueue: [review({ id: 'review-ss', targetType: 'self-state' })],
        events: [],
      },
      wants: [],
      now: NOW,
    })
    expect(queue.items[0].kind).toBe('self-state-proposal')
  })

  it('includes protected wants awaiting review as non-actionable items', () => {
    const queue = buildTaylorApprovalQueue({
      fabric: { reviewQueue: [], events: [] },
      wants: [want()],
      now: NOW,
    })
    expect(queue.items).toHaveLength(1)
    expect(queue.items[0]).toMatchObject({
      kind: 'protected-want',
      actionable: false,
      reviewId: null,
    })
  })

  it('dedupes a want already represented by a pending review', () => {
    const queue = buildTaylorApprovalQueue({
      fabric: { reviewQueue: [review()], events: [] },
      wants: [want({ fabricReviewIds: ['review-1'] })],
      now: NOW,
    })
    expect(queue.items).toHaveLength(1)
    expect(queue.items[0].kind).toBe('fabric-review')
  })

  it('includes recent blocked external actions', () => {
    const queue = buildTaylorApprovalQueue({
      fabric: { reviewQueue: [], events: [boundaryEvent()] },
      wants: [],
      now: NOW,
    })
    expect(queue.items).toHaveLength(1)
    expect(queue.items[0]).toMatchObject({
      kind: 'blocked-action',
      actionable: false,
      targetSystem: 'gmail',
    })
  })

  it('drops stale blocked actions older than 14 days', () => {
    const queue = buildTaylorApprovalQueue({
      fabric: {
        reviewQueue: [],
        events: [boundaryEvent({ createdAt: '2026-06-01T00:00:00.000Z' })],
      },
      wants: [],
      now: NOW,
    })
    expect(queue.items).toHaveLength(0)
  })

  it('sorts by risk severity then oldest first', () => {
    const queue = buildTaylorApprovalQueue({
      fabric: {
        reviewQueue: [
          review({
            id: 'review-low',
            riskLevel: 'low',
            createdAt: '2026-07-08T01:00:00.000Z',
          }),
          review({
            id: 'review-critical',
            riskLevel: 'critical',
            createdAt: '2026-07-08T11:00:00.000Z',
          }),
          review({
            id: 'review-high-old',
            riskLevel: 'high',
            createdAt: '2026-07-08T02:00:00.000Z',
          }),
          review({
            id: 'review-high-new',
            riskLevel: 'high',
            createdAt: '2026-07-08T09:00:00.000Z',
          }),
        ],
        events: [],
      },
      wants: [],
      now: NOW,
    })
    expect(queue.items.map((item) => item.reviewId)).toEqual([
      'review-critical',
      'review-high-old',
      'review-high-new',
      'review-low',
    ])
  })

  it('tolerates a degraded (null) fabric snapshot', () => {
    const queue = buildTaylorApprovalQueue({
      fabric: null,
      wants: [want()],
      now: NOW,
    })
    expect(queue.items).toHaveLength(1)
    expect(queue.degraded).toBe(true)
  })
})
