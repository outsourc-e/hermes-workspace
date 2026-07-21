import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  buildEtsyOpsRoomState,
  readEtsyOpsMediaFile,
  runEtsyOpsAction,
} from '../../server/war-room-etsy-ops'

const ActionSchema = z.object({
  actionId: z.enum([
    'inspect-product',
    'open-media-source',
    'prepare-listing-draft',
    'queue-shotlab-prep',
    'stage-upload-preview',
    'request-dlv-approval',
    'simulate-live-publish',
    'edit-live-listing',
    'message-supplier',
    'buy-sample',
    'hold-for-review',
    'agent-chat-note',
  ]),
  stationId: z.enum([
    'product-intake',
    'seo-oracle',
    'supplier-proof',
    'shotlab-prep',
    'listing-draft',
    'price-margin',
    'dlv-approval',
    'archive-vault',
    'media-sources',
    'rest-lounge',
  ]),
  productId: z.string().trim().max(240).optional().nullable(),
  agentId: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(1200).optional().default(''),
})

export const Route = createFileRoute('/api/war-room-etsy-ops')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const mediaPath = url.searchParams.get('mediaPath')
        if (mediaPath) {
          const media = readEtsyOpsMediaFile(mediaPath)
          if (!media.ok) return new Response(media.error, { status: media.status })
          return new Response(media.body, {
            status: 200,
            headers: {
              'content-type': media.mime,
              'cache-control': 'no-store',
              'referrer-policy': 'no-referrer',
            },
          })
        }

        return json(buildEtsyOpsRoomState(), {
          headers: { 'cache-control': 'no-store' },
        })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
        }

        const parsed = ActionSchema.safeParse(body)
        if (!parsed.success) {
          return json({
            ok: false,
            error: parsed.error.issues.map((issue) => issue.message).join('; '),
          }, { status: 400 })
        }

        const result = await runEtsyOpsAction(parsed.data)
        return json({
          ...result,
          state: buildEtsyOpsRoomState(),
        }, { status: result.ok ? 200 : 400 })
      },
    },
  },
})
