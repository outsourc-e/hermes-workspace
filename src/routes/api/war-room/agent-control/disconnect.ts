import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../../server/auth-middleware'
import { disconnectWarRoomAgents, getAgentConnectionStoreInfo } from '../../../../lib/war-room/body'

async function readReason(request: Request) {
  try {
    const body = await request.json() as { reason?: unknown }
    return typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : undefined
  } catch {
    return undefined
  }
}

export const Route = createFileRoute('/api/war-room/agent-control/disconnect')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } })
        }
        const state = disconnectWarRoomAgents({
          reason: await readReason(request),
          updatedBy: 'ui',
        })
        return json({ ok: true, state, store: getAgentConnectionStoreInfo() }, { headers: { 'cache-control': 'no-store' } })
      },
    },
  },
})
