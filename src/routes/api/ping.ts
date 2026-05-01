import { createFileRoute } from '@tanstack/react-router'
import {
  CLAUDE_API,
  ensureGatewayProbed,
} from '../../server/gateway-capabilities'
import { requireLocalOrAuth } from '../../server/auth-middleware'

type PingResponse = {
  ok: boolean
  error?: string
  status?: number
  claudeUrl: string
}

export const Route = createFileRoute('/api/ping')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return Response.json(
            {
              ok: false,
              error: 'Authentication required',
              status: 401,
              claudeUrl: CLAUDE_API,
            } satisfies PingResponse,
            { status: 401 },
          )
        }

        const caps = await ensureGatewayProbed()
        if (!caps.health) {
          return Response.json(
            {
              ok: false,
              error: 'Claude unavailable',
              status: 503,
              claudeUrl: CLAUDE_API,
            } satisfies PingResponse,
            { status: 503 },
          )
        }

        return Response.json(
          {
            ok: true,
            status: 200,
            claudeUrl: CLAUDE_API,
          } satisfies PingResponse,
          { status: 200 },
        )
      },
    },
  },
})
