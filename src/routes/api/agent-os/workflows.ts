import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import { listWorkflowRegistry, upsertWorkflow } from '../../../server/agent-os/store'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/agent-os/workflows')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)
        return jsonResponse({ workflows: listWorkflowRegistry() })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)
        try {
          const body = (await request.json()) as Record<string, unknown>
          if (typeof body.key !== 'string' || typeof body.name !== 'string') {
            return jsonResponse({ error: 'key and name are required' }, 400)
          }
          const workflow = upsertWorkflow({
            key: body.key,
            name: body.name,
            description: typeof body.description === 'string' ? body.description : '',
            mode: typeof body.mode === 'string' ? (body.mode as 'n8n' | 'hybrid' | 'agent') : 'n8n',
            enabled: typeof body.enabled === 'boolean' ? body.enabled : true,
            route_default: typeof body.route_default === 'string' ? (body.route_default as 'n8n' | 'hermes' | 'openclaw' | 'manual') : 'n8n',
            sensitive: typeof body.sensitive === 'boolean' ? body.sensitive : false,
            risk: typeof body.risk === 'string' ? (body.risk as 'low' | 'medium' | 'high' | 'critical') : 'medium',
            n8n_workflow_id: typeof body.n8n_workflow_id === 'string' ? body.n8n_workflow_id : null,
            schedule: typeof body.schedule === 'string' ? body.schedule : null,
            tags: Array.isArray(body.tags) ? body.tags.filter((tag): tag is string => typeof tag === 'string') : [],
            owners: Array.isArray(body.owners) ? body.owners.filter((owner): owner is string => typeof owner === 'string') : [],
          })
          return jsonResponse({ workflow }, 201)
        } catch {
          return jsonResponse({ error: 'Invalid request body' }, 400)
        }
      },
    },
  },
})
