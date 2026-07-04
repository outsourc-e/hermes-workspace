import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  ApprovalRequestSchema,
  ApprovalResolutionSchema,
  getWarRoomBodyState,
  requestWarRoomApproval,
  resolveWarRoomApproval,
} from '../../../lib/war-room/body'

export const Route = createFileRoute('/api/war-room/approvals')({
  server: {
    handlers: {
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
        const maybeResolution = ApprovalResolutionSchema.safeParse(body)
        const maybeRequest = ApprovalRequestSchema.safeParse(body)
        try {
          if (maybeResolution.success) {
            const state = resolveWarRoomApproval(maybeResolution.data as Parameters<typeof resolveWarRoomApproval>[0])
            return json({ ok: true, state }, { headers: { 'cache-control': 'no-store' } })
          }
          if (maybeRequest.success) {
            const state = requestWarRoomApproval(maybeRequest.data as Parameters<typeof requestWarRoomApproval>[0])
            return json({ ok: true, state }, { headers: { 'cache-control': 'no-store' } })
          }
          return json({ ok: false, error: 'Invalid approval payload' }, { status: 400 })
        } catch (error) {
          return json({ ok: false, error: error instanceof Error ? error.message : String(error), state: getWarRoomBodyState() }, { status: 400 })
        }
      },
    },
  },
})
