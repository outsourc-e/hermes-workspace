import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import { claimQueuedTask, completeTask, failTask, pendingDispatchQueue } from '../../../server/agent-os/router'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/agent-os/dispatch')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)
        return jsonResponse({ queue: pendingDispatchQueue() })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)
        try {
          const body = (await request.json()) as Record<string, unknown>
          const action = body.action
          const taskId = typeof body.task_id === 'string' ? body.task_id : null
          if (!taskId) return jsonResponse({ error: 'task_id required' }, 400)
          if (action === 'claim') {
            const task = claimQueuedTask(taskId)
            return task ? jsonResponse({ task }) : jsonResponse({ error: 'Task not found' }, 404)
          }
          if (action === 'complete') {
            const task = completeTask(taskId, typeof body.message === 'string' ? body.message : 'Task completed successfully.')
            return task ? jsonResponse({ task }) : jsonResponse({ error: 'Task not found' }, 404)
          }
          if (action === 'fail') {
            const task = await failTask(taskId, typeof body.error === 'string' ? body.error : 'unknown error', body.will_retry === true)
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
