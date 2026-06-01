import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import { routeTask, updateTaskStatus, attachN8nExecution } from '../../../server/agent-os/store'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/agent-os/tasks/$taskId')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)
        try {
          const body = (await request.json()) as Record<string, unknown>
          const action = body.action
          if (action === 'route') {
            const route = body.route
            if (!['n8n', 'hermes', 'openclaw', 'manual'].includes(String(route))) {
              return jsonResponse({ error: 'invalid route' }, 400)
            }
            const task = routeTask(params.taskId, route as 'n8n' | 'hermes' | 'openclaw' | 'manual', {
              reason: typeof body.reason === 'string' ? body.reason : 'manual route update',
            })
            return task ? jsonResponse({ task }) : jsonResponse({ error: 'Task not found' }, 404)
          }
          if (action === 'status') {
            const status = body.status
            if (!['queued', 'routed', 'running', 'retrying', 'blocked', 'failed', 'completed', 'awaiting_approval'].includes(String(status))) {
              return jsonResponse({ error: 'invalid status' }, 400)
            }
            const task = updateTaskStatus(
              params.taskId,
              status as 'queued' | 'routed' | 'running' | 'retrying' | 'blocked' | 'failed' | 'completed' | 'awaiting_approval',
              typeof body.message === 'string' ? body.message : 'status updated',
              typeof body.meta === 'object' && body.meta ? (body.meta as Record<string, unknown>) : {},
            )
            return task ? jsonResponse({ task }) : jsonResponse({ error: 'Task not found' }, 404)
          }
          if (action === 'attach_n8n_execution') {
            if (typeof body.execution_id !== 'string') return jsonResponse({ error: 'execution_id required' }, 400)
            const task = attachN8nExecution(params.taskId, body.execution_id, typeof body.workflow_id === 'string' ? body.workflow_id : null)
            return task ? jsonResponse({ task }) : jsonResponse({ error: 'Task not found' }, 404)
          }
          return jsonResponse({ error: 'unknown action' }, 400)
        } catch {
          return jsonResponse({ error: 'Invalid request body' }, 400)
        }
      },
    },
  },
})
