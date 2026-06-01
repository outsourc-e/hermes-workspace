import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  agentOsDashboard,
  listAgentOsTasks,
  listApprovals,
  listExecutionLogs,
  listWorkflowRegistry,
} from '../../../server/agent-os/store'
import { enqueueWorkflowTask } from '../../../server/agent-os/router'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/agent-os/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)
        return jsonResponse({
          dashboard: agentOsDashboard(),
          tasks: listAgentOsTasks(),
          workflows: listWorkflowRegistry(),
          executions: listExecutionLogs(),
          approvals: listApprovals(),
        })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)
        try {
          const body = (await request.json()) as Record<string, unknown>
          if (typeof body.title !== 'string' || typeof body.workflow_key !== 'string') {
            return jsonResponse({ error: 'title and workflow_key are required' }, 400)
          }
          const task = enqueueWorkflowTask({
            title: body.title,
            description: typeof body.description === 'string' ? body.description : '',
            workflow_key: body.workflow_key,
            project: typeof body.project === 'string' ? body.project : null,
            payload: typeof body.payload === 'object' && body.payload ? (body.payload as Record<string, unknown>) : {},
            priority: typeof body.priority === 'string' ? (body.priority as 'critical' | 'high' | 'medium' | 'low') : 'medium',
            created_by: typeof body.created_by === 'string' ? body.created_by : 'user',
          })
          return jsonResponse({ task }, 201)
        } catch (error) {
          return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid request body' }, 400)
        }
      },
    },
  },
})
