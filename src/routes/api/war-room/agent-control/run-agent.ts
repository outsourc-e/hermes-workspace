import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../../server/auth-middleware'
import {
  getAgentConnectionState,
  getWarRoomBodyState,
  normalizeControlledSmartIntakeContext,
  parseControlledAgentId,
  runControlledAgentFlow,
} from '../../../../lib/war-room/body'

export function readRunAgentRequestPayload(body: unknown) {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  return {
    agentId: parseControlledAgentId(input.agentId),
    operatorNote: typeof input.operatorNote === 'string' && input.operatorNote.trim()
      ? input.operatorNote.trim().slice(0, 4_000)
      : undefined,
    smartIntakeContext: normalizeControlledSmartIntakeContext({
      smartIntakeInput: input.smartIntakeInput,
      smartIntakeMission: input.smartIntakeMission,
    }),
  }
}

async function readRequestBody(request: Request) {
  try {
    return readRunAgentRequestPayload(await request.json())
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(message)
  }
}

export const Route = createFileRoute('/api/war-room/agent-control/run-agent')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } })
        }

        try {
          const { agentId, operatorNote, smartIntakeContext } = await readRequestBody(request)
          const result = await runControlledAgentFlow({ agentId, operatorNote, smartIntakeContext, cwd: process.cwd() })
          return json(result, { headers: { 'cache-control': 'no-store' } })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const status = message.includes('Unsupported controlled agent') ? 400 : message.includes('already running') ? 409 : 500
          return json({
            ok: false,
            error: message,
            control: getAgentConnectionState(),
            state: getWarRoomBodyState(),
          }, { status, headers: { 'cache-control': 'no-store' } })
        }
      },
    },
  },
})
