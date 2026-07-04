import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../../server/auth-middleware'
import {
  getAgentConnectionState,
  getWarRoomBodyState,
  runControlledAgentFlow,
} from '../../../../lib/war-room/body'

async function readOperatorNote(request: Request) {
  try {
    const body = await request.json() as { operatorNote?: unknown }
    return typeof body.operatorNote === 'string' && body.operatorNote.trim()
      ? body.operatorNote.trim().slice(0, 400)
      : undefined
  } catch {
    return undefined
  }
}

export const Route = createFileRoute('/api/war-room/agent-control/run-athena')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } })
        }

        try {
          const operatorNote = await readOperatorNote(request)
          const result = await runControlledAgentFlow({ agentId: 'athena', operatorNote, cwd: process.cwd() })
          return json(result, { headers: { 'cache-control': 'no-store' } })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return json({
            ok: false,
            error: message,
            control: getAgentConnectionState(),
            state: getWarRoomBodyState(),
          }, { status: message.includes('already running') ? 409 : 500, headers: { 'cache-control': 'no-store' } })
        }
      },
    },
  },
})
