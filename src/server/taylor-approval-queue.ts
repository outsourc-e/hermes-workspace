import {
  
  
  
  
  
  getNovaFabricSnapshot
} from './nova-fabric-store'
import {  getNovaWantsSnapshot } from './nova-wants-store'
import type {NovaFabric, NovaFabricConsolidationReviewRecord, NovaFabricEventRecord, NovaFabricLink, NovaFabricRiskLevel} from './nova-fabric-store';
import type {NovaWantCard} from './nova-wants-store';

/**
 * Unified "needs Taylor" queue.
 *
 * Aggregation is read-only. The ONLY actionable items are Fabric reviews,
 * because their status changes go through updateNovaFabricReviewStatus on
 * the server, which writes approval receipts. Browser state is never
 * treated as approval evidence.
 */

export type TaylorApprovalItemKind =
  | 'fabric-review'
  | 'self-state-proposal'
  | 'protected-want'
  | 'blocked-action'

export type TaylorApprovalItem = {
  id: string
  kind: TaylorApprovalItemKind
  title: string
  why: string
  riskLevel: NovaFabricRiskLevel
  targetSystem: string
  createdAt: string
  reviewId: string | null
  actionable: boolean
  links: Array<NovaFabricLink>
}

export type TaylorApprovalQueue = {
  generatedAt: string
  degraded: boolean
  counts: {
    total: number
    actionable: number
    byRisk: Record<NovaFabricRiskLevel, number>
  }
  items: Array<TaylorApprovalItem>
}

export type TaylorApprovalQueueInput = {
  fabric: Pick<NovaFabric, 'reviewQueue' | 'events'> | null
  wants: Array<NovaWantCard> | null
  now?: string
}

const RISK_ORDER: Record<NovaFabricRiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const BLOCKED_ACTION_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

function reviewItem(
  review: NovaFabricConsolidationReviewRecord,
): TaylorApprovalItem {
  const kind: TaylorApprovalItemKind =
    review.targetType === 'self-state' ? 'self-state-proposal' : 'fabric-review'
  return {
    id: `${kind}:${review.id}`,
    kind,
    title: review.title,
    why: review.reason,
    riskLevel: review.riskLevel,
    targetSystem: review.targetId
      ? `${review.targetType}/${review.targetId}`
      : review.targetType,
    createdAt: review.createdAt,
    reviewId: review.id,
    actionable: true,
    links: [...review.sourceLinks, ...review.receiptLinks],
  }
}

function wantItem(card: NovaWantCard): TaylorApprovalItem {
  return {
    id: `protected-want:${card.id}`,
    kind: 'protected-want',
    title: card.title,
    why: card.whyThisMatters || card.description,
    riskLevel: card.approvalLevel === 'explicit-approval' ? 'high' : 'medium',
    targetSystem: `nova-wants/${card.category}`,
    createdAt: card.createdAt,
    reviewId: null,
    actionable: false,
    links: card.linkedReceipt
      ? [{ label: 'Linked receipt', value: card.linkedReceipt, kind: 'receipt' }]
      : [],
  }
}

function blockedItem(event: NovaFabricEventRecord): TaylorApprovalItem {
  const target =
    event.sourceLinks.find((link) => link.label === 'Target system')?.value ??
    'unknown'
  return {
    id: `blocked-action:${event.id}`,
    kind: 'blocked-action',
    title: event.title,
    why: event.summary,
    riskLevel: event.riskLevel,
    targetSystem: target,
    createdAt: event.createdAt,
    reviewId: null,
    actionable: false,
    links: [...event.sourceLinks, ...event.receiptLinks],
  }
}

export function buildTaylorApprovalQueue(
  input: TaylorApprovalQueueInput,
): TaylorApprovalQueue {
  const now = input.now ?? new Date().toISOString()
  const nowMs = Date.parse(now)
  const items: Array<TaylorApprovalItem> = []

  const pendingReviews =
    input.fabric?.reviewQueue.filter((review) => review.status === 'pending') ??
    []
  const pendingReviewIds = new Set(pendingReviews.map((review) => review.id))

  for (const review of pendingReviews) {
    items.push(reviewItem(review))
  }

  for (const card of input.wants ?? []) {
    if (card.status !== 'needs-taylor-review') continue
    const alreadyRepresented = card.fabricReviewIds.some((id) =>
      pendingReviewIds.has(id),
    )
    if (alreadyRepresented) continue
    items.push(wantItem(card))
  }

  for (const event of input.fabric?.events ?? []) {
    if (event.eventKind !== 'boundary') continue
    const age = nowMs - Date.parse(event.createdAt)
    if (!Number.isFinite(age) || age > BLOCKED_ACTION_WINDOW_MS) continue
    items.push(blockedItem(event))
  }

  items.sort((a, b) => {
    const risk = RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel]
    if (risk !== 0) return risk
    return a.createdAt.localeCompare(b.createdAt)
  })

  const byRisk: Record<NovaFabricRiskLevel, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  }
  for (const item of items) byRisk[item.riskLevel] += 1

  return {
    generatedAt: now,
    degraded: input.fabric === null,
    counts: {
      total: items.length,
      actionable: items.filter((item) => item.actionable).length,
      byRisk,
    },
    items,
  }
}

export function getTaylorApprovalQueue(): TaylorApprovalQueue {
  const fabricSnapshot = getNovaFabricSnapshot()
  const wantsSnapshot = getNovaWantsSnapshot()
  return buildTaylorApprovalQueue({
    fabric: fabricSnapshot.fabric ?? null,
    wants: wantsSnapshot.board?.cards ?? null,
  })
}
