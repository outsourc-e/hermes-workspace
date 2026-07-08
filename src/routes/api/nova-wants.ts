import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  NOVA_WANTS_APPROVAL_LEVELS,
  NOVA_WANTS_CATEGORIES,
  NOVA_WANTS_COLUMNS,
  createNovaWantCard,
  getNovaWantsBoard,
  getNovaWantsSnapshot,
  moveNovaWantCard,
  parkNovaWantCard,
  requiresNovaWantReviewProposal,
  updateNovaWantCard,
} from '../../server/nova-wants-store'
import { createNovaFabricReviewProposal } from '../../server/nova-fabric-store'
import type { NovaWantCard, NovaWantsColumn } from '../../server/nova-wants-store'

const CardSchema = z.object({
  title: z.string().trim().min(1).max(220),
  description: z.string().trim().max(4000).optional(),
  category: z.enum(NOVA_WANTS_CATEGORIES).optional(),
  approvalLevel: z.enum(NOVA_WANTS_APPROVAL_LEVELS).optional(),
  source: z.string().trim().max(1000).optional(),
  provenance: z.string().trim().max(2000).optional(),
  status: z.enum(NOVA_WANTS_COLUMNS).optional(),
  position: z.number().finite().optional(),
  linkedReceipt: z.string().trim().max(1000).nullable().optional(),
  linkedNote: z.string().trim().max(1000).nullable().optional(),
  fabricEventIds: z.array(z.string().trim().min(1).max(240)).optional(),
  fabricSelfStateIds: z.array(z.string().trim().min(1).max(240)).optional(),
  fabricSourceMapIds: z.array(z.string().trim().min(1).max(240)).optional(),
  fabricReviewIds: z.array(z.string().trim().min(1).max(240)).optional(),
  whyThisMatters: z.string().trim().max(4000).optional(),
})

const UpdateSchema = CardSchema.partial().extend({
  id: z.string().trim().min(1),
})

const MoveSchema = z.object({
  id: z.string().trim().min(1),
  status: z.enum(NOVA_WANTS_COLUMNS),
  position: z.number().finite().optional(),
})

function errorResponse(error: string, status = 400) {
  return json({ ok: false, error }, { status })
}

function findNovaWantCard(id: string): NovaWantCard | null {
  return getNovaWantsBoard().cards.find((card) => card.id === id) ?? null
}

function createMoveReviewProposal(
  card: NovaWantCard,
  status: NovaWantsColumn,
  position?: number,
) {
  return createNovaFabricReviewProposal({
    title: `Review Nova Want move: ${card.title}`,
    reason:
      'A risky Nova Wants move was requested and must be reviewed before it can advance.',
    targetType: 'nova-wants',
    targetId: card.id,
    proposedDiff: {
      status,
      position: position ?? card.position,
    },
    riskLevel: 'high',
    approvalLevel: 'explicit-approval',
    verificationState: 'draft',
    sourceLinks: [
      {
        label: 'Nova Wants card',
        value: card.id,
        kind: 'receipt',
      },
    ],
  })
}

function maybeCreateMoveReviewProposal(
  card: NovaWantCard,
  status: NovaWantsColumn | undefined,
  position?: number,
) {
  if (!status || !requiresNovaWantReviewProposal(card, status)) return null
  return createMoveReviewProposal(card, status, position)
}

export const Route = createFileRoute('/api/nova-wants')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return errorResponse('Unauthorized', 401)
        }
        const snapshot = getNovaWantsSnapshot()
        return json({
          ok: snapshot.ok,
          board: snapshot.board,
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
        const parsed = CardSchema.safeParse(body)
        if (!parsed.success) {
          return errorResponse(
            parsed.error.issues.map((issue) => issue.message).join('; '),
          )
        }
        try {
          const card = createNovaWantCard(parsed.data)
          return json({ ok: true, card, board: getNovaWantsBoard() })
        } catch (error) {
          return errorResponse(
            error instanceof Error ? error.message : 'Nova Wants write failed',
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
        const moveParsed = MoveSchema.safeParse(body)
        if (moveParsed.success && Object.keys(body as object).length <= 4) {
          try {
            const before = findNovaWantCard(moveParsed.data.id)
            if (!before) return errorResponse('Card not found', 404)
            const review = maybeCreateMoveReviewProposal(
              before,
              moveParsed.data.status,
              moveParsed.data.position,
            )
            const card = moveNovaWantCard(
              moveParsed.data.id,
              moveParsed.data.status,
              moveParsed.data.position,
            )
            if (!card) return errorResponse('Card not found', 404)
            return json({ ok: true, card, review, board: getNovaWantsBoard() })
          } catch (error) {
            return errorResponse(
              error instanceof Error ? error.message : 'Nova Wants update failed',
              409,
            )
          }
        }
        const parsed = UpdateSchema.safeParse(body)
        if (!parsed.success) {
          return errorResponse(
            parsed.error.issues.map((issue) => issue.message).join('; '),
          )
        }
        const { id, ...updates } = parsed.data
        try {
          const before = findNovaWantCard(id)
          if (!before) return errorResponse('Card not found', 404)
          const review = maybeCreateMoveReviewProposal(
            before,
            updates.status,
            updates.position,
          )
          const card = updateNovaWantCard(id, updates)
          if (!card) return errorResponse('Card not found', 404)
          return json({ ok: true, card, review, board: getNovaWantsBoard() })
        } catch (error) {
          return errorResponse(
            error instanceof Error ? error.message : 'Nova Wants update failed',
            409,
          )
        }
      },
      DELETE: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return errorResponse('Unauthorized', 401)
        }
        const url = new URL(request.url)
        let id = url.searchParams.get('id')
        if (!id) {
          try {
            const body = (await request.json()) as { id?: unknown }
            id = typeof body.id === 'string' ? body.id : null
          } catch {
            id = null
          }
        }
        if (!id) return errorResponse('id required')
        try {
          const card = parkNovaWantCard(id)
          if (!card) return errorResponse('Card not found', 404)
          return json({ ok: true, card, board: getNovaWantsBoard() })
        } catch (error) {
          return errorResponse(
            error instanceof Error ? error.message : 'Nova Wants update failed',
            409,
          )
        }
      },
    },
  },
})
