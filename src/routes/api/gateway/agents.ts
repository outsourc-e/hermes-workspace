import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { gatewayFetch } from '../../../server/gateway-capabilities'

/**
 * Agent roster, derived from the gateway's model list (`/v1/models`).
 *
 * A Hermes gateway exposes its agent(s) as models. When the gateway is a single
 * agent this returns that one; when it's a fleet multiplexer (many agents behind
 * one gateway URL) this returns the whole fleet. Previously the Agents screen had
 * no data source here and fell back to a hardcoded stub registry.
 */
export const Route = createFileRoute('/api/gateway/agents')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const res = await gatewayFetch('/v1/models')
          if (!res.ok) return json({ agents: [] })
          const payload = (await res.json()) as { data?: Array<{ id?: string }> }
          const models = Array.isArray(payload?.data) ? payload.data : []
          const agents = models
            .filter((m) => typeof m.id === 'string' && m.id)
            .map((m) => ({ id: m.id as string, name: m.id as string, role: 'agent', category: 'fleet' }))
          return json({
            agents,
            defaultId: agents[0]?.id ?? null,
            mainKey: agents[0]?.id ?? null,
            scope: 'fleet',
          })
        } catch {
          return json({ agents: [] })
        }
      },
    },
  },
})
