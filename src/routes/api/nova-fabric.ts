import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  NOVA_FABRIC_APPROVAL_LEVELS,
  NOVA_FABRIC_REVIEW_STATUSES,
  NOVA_FABRIC_RISK_LEVELS,
  NOVA_FABRIC_VERIFICATION_STATES,
  appendNovaFabricEvent,
  createNovaFabricReviewProposal,
  getNovaFabricSnapshot,
  proposeNovaSelfStateChange,
  updateNovaFabricReviewStatus,
} from '../../server/nova-fabric-store'

const LinkSchema = z.object({
  label: z.string().trim().min(1).max(180),
  value: z.string().trim().min(1).max(1200),
  kind: z.enum(['file', 'url', 'session', 'api', 'note', 'receipt']),
})

const EventSchema = z.object({
  action: z.literal('append-event'),
  title: z.string().trim().min(1).max(220),
  summary: z.string().trim().min(1).max(4000),
  eventKind: z
    .enum(['continuity', 'work-receipt', 'correction', 'approval', 'boundary'])
    .optional(),
  provenance: z.string().trim().max(1200).optional(),
  riskLevel: z.enum(NOVA_FABRIC_RISK_LEVELS).optional(),
  approvalLevel: z.enum(NOVA_FABRIC_APPROVAL_LEVELS).optional(),
  verificationState: z.enum(NOVA_FABRIC_VERIFICATION_STATES).optional(),
  sourceLinks: z.array(LinkSchema).optional(),
  receiptLinks: z.array(LinkSchema).optional(),
})

const ReviewSchema = z.object({
  action: z.literal('create-review'),
  title: z.string().trim().min(1).max(220),
  reason: z.string().trim().min(1).max(4000),
  targetType: z.enum([
    'event',
    'self-state',
    'source-map',
    'consolidation-review',
    'external-system',
    'nova-wants',
  ]),
  targetId: z.string().trim().max(240).nullable().optional(),
  proposedDiff: z.record(z.unknown()).default({}),
  provenance: z.string().trim().max(1200).optional(),
  riskLevel: z.enum(NOVA_FABRIC_RISK_LEVELS).optional(),
  approvalLevel: z.enum(NOVA_FABRIC_APPROVAL_LEVELS).optional(),
  verificationState: z.enum(NOVA_FABRIC_VERIFICATION_STATES).optional(),
  sourceLinks: z.array(LinkSchema).optional(),
  receiptLinks: z.array(LinkSchema).optional(),
})

const ProposeSelfStateSchema = z.object({
  action: z.literal('propose-self-state'),
  targetId: z.string().trim().min(1).max(240),
  proposedDiff: z.record(z.unknown()),
  reason: z.string().trim().min(1).max(4000),
})

const ReviewStatusSchema = z.object({
  action: z.literal('update-review-status'),
  id: z.string().trim().min(1).max(240),
  status: z.enum(NOVA_FABRIC_REVIEW_STATUSES),
})

const PostSchema = z.discriminatedUnion('action', [EventSchema, ReviewSchema])
const PatchSchema = z.discriminatedUnion('action', [
  ProposeSelfStateSchema,
  ReviewStatusSchema,
])

function errorResponse(error: string, status = 400) {
  return json({ ok: false, error }, { status })
}

export const Route = createFileRoute('/api/nova-fabric')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return errorResponse('Unauthorized', 401)
        }
        const snapshot = getNovaFabricSnapshot()
        return json({
          ok: snapshot.ok,
          fabric: snapshot.fabric,
          storage: snapshot.storage,
          degraded: snapshot.degraded,
          warning: snapshot.warning,
        })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return errorResponse('Unauthorized', 401)
        }
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return errorResponse('Invalid JSON')
        }
        const parsed = PostSchema.safeParse(body)
        if (!parsed.success) {
          return errorResponse(
            parsed.error.issues.map((issue) => issue.message).join('; '),
          )
        }
        try {
          const record =
            parsed.data.action === 'append-event'
              ? appendNovaFabricEvent(parsed.data)
              : createNovaFabricReviewProposal(parsed.data)
          const snapshot = getNovaFabricSnapshot()
          return json({ ok: true, record, fabric: snapshot.fabric })
        } catch (error) {
          return errorResponse(
            error instanceof Error ? error.message : 'Nova Fabric write failed',
            409,
          )
        }
      },
      PATCH: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return errorResponse('Unauthorized', 401)
        }
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return errorResponse('Invalid JSON')
        }
        const parsed = PatchSchema.safeParse(body)
        if (!parsed.success) {
          return errorResponse(
            parsed.error.issues.map((issue) => issue.message).join('; '),
          )
        }
        try {
          const record =
            parsed.data.action === 'propose-self-state'
              ? proposeNovaSelfStateChange(
                  parsed.data.targetId,
                  parsed.data.proposedDiff,
                  parsed.data.reason,
                )
              : updateNovaFabricReviewStatus(parsed.data.id, parsed.data.status)
          if (!record) return errorResponse('Record not found', 404)
          const snapshot = getNovaFabricSnapshot()
          return json({ ok: true, record, fabric: snapshot.fabric })
        } catch (error) {
          return errorResponse(
            error instanceof Error
              ? error.message
              : 'Nova Fabric update failed',
            409,
          )
        }
      },
    },
  },
})
