import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  gatherWorkObservation,
  scanAndRecordWorkReceipts,
} from '../../server/nova-work-receipts'

function errorResponse(message: string, status = 400): Response {
  return json({ ok: false, error: message }, { status })
}

export const Route = createFileRoute('/api/nova-work-scan')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) return errorResponse('Unauthorized', 401)
        return json({ ok: true, observation: gatherWorkObservation() })
      },
      POST: ({ request }) => {
        if (!isAuthenticated(request)) return errorResponse('Unauthorized', 401)
        try {
          const result = scanAndRecordWorkReceipts()
          return json({
            ok: true,
            written: result.written.length,
            receipts: result.written,
            marker: result.marker,
          })
        } catch (error) {
          return errorResponse(
            error instanceof Error ? error.message : 'Work scan failed',
            500,
          )
        }
      },
    },
  },
})
