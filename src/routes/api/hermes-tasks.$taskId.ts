import { createFileRoute } from '@tanstack/react-router'
import { randomUUID } from 'node:crypto'
import { isAuthenticated } from '../../server/auth-middleware'
import { deleteTask, getTask, moveTask, updateTask } from '../../server/tasks-store'
import { ensureLocalSession, appendLocalMessage, getLocalMessages } from '../../server/local-session-store'
import { getSessionMessages } from '../../server/claude-dashboard-api'
import type { TaskColumn, TaskPriority } from '../../server/tasks-store'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isTaskColumn(value: unknown): value is TaskColumn {
  return (
    value === 'backlog' ||
    value === 'todo' ||
    value === 'in_progress' ||
    value === 'review' ||
    value === 'blocked' ||
    value === 'done' ||
    value === 'deleted'
  )
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return value === 'high' || value === 'medium' || value === 'low'
}

export const Route = createFileRoute('/api/hermes-tasks/$taskId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const task = getTask(params.taskId)
        if (!task) return jsonResponse({ error: 'Task not found' }, 404)
        return jsonResponse({ task })
      },

      PATCH: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        try {
          const body = (await request.json()) as Record<string, unknown>
          const task = updateTask(params.taskId, {
            title: typeof body.title === 'string' ? body.title : undefined,
            description: typeof body.description === 'string' ? body.description : undefined,
            column: isTaskColumn(body.column) ? body.column : undefined,
            priority: isTaskPriority(body.priority) ? body.priority : undefined,
            assignee: body.assignee === null || typeof body.assignee === 'string' ? body.assignee : undefined,
            tags: Array.isArray(body.tags) ? body.tags.filter((tag): tag is string => typeof tag === 'string') : undefined,
            due_date: body.due_date === null || typeof body.due_date === 'string' ? body.due_date : undefined,
            position: typeof body.position === 'number' ? body.position : undefined,
            session_id: body.session_id === null || typeof body.session_id === 'string' ? body.session_id : undefined,
          })

          if (!task) return jsonResponse({ error: 'Task not found' }, 404)
          return jsonResponse({ task })
        } catch {
          return jsonResponse({ error: 'Invalid request body' }, 400)
        }
      },

      DELETE: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const deleted = deleteTask(params.taskId)
        if (!deleted) return jsonResponse({ error: 'Task not found' }, 404)
        return jsonResponse({ ok: true })
      },

      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const url = new URL(request.url)
        const action = url.searchParams.get('action') || 'move'

        if (action === 'launch') {
          const task = getTask(params.taskId)
          if (!task) return jsonResponse({ error: 'Task not found' }, 404)

          const sessionId = `task-${task.id.slice(0, 8)}-${randomUUID().slice(0, 8)}`

          // Fetch prior session tail if linked — prefer dashboard API (real history),
          // fall back to local store (only has the initial briefing message).
          let priorContext = ''
          if (task.session_id) {
            let tail: Array<{ role: string; content: string }> = []

            // Try dashboard API first — this has the full conversation history
            try {
              const dashResult = await getSessionMessages(task.session_id)
              if (dashResult?.messages?.length) {
                tail = dashResult.messages
                  .filter((m) => m.role === 'user' || m.role === 'assistant')
                  .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0)
                  .slice(-20)
                  .map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : '' }))
              }
            } catch {
              // Dashboard unavailable — fall back to local store
            }

            // Fall back to local store if dashboard had nothing
            if (tail.length === 0) {
              const localMsgs = getLocalMessages(task.session_id)
              tail = localMsgs
                .filter((m) => m.role === 'user' || m.role === 'assistant')
                .slice(-20)
                .map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : '' }))
            }

            if (tail.length > 0) {
              // Truncate individual messages to avoid briefing bloat, but keep meaningful context
              priorContext = `\n\n---\n**Prior session history** (session \`${task.session_id}\`, last ${tail.length} messages):\n${tail.map((m) => `[${m.role.toUpperCase()}] ${m.content.slice(0, 800)}`).join('\n\n')}\n---`
            }
          }

          const hasPrior = Boolean(task.session_id && priorContext)
          const briefing = [
            'You are picking up a task from the Hermes Workspace task board. Here is the full context:',
            '',
            `**Task:** ${task.title}`,
            `**Status:** ${task.column}  |  **Priority:** ${task.priority}  |  **Assignee:** ${task.assignee ?? 'Unassigned'}`,
            `**Tags:** ${task.tags.join(', ') || 'none'}  |  **Due:** ${task.due_date ?? 'none'}`,
            '',
            '**Description:**',
            task.description || '(none)',
            priorContext,
            '',
            hasPrior
              ? 'This task has prior session history (shown above). Review it and give me a concise **current status** — what has been done, what is blocked, and the exact **next action** to move it forward.'
              : 'This is a fresh start on this task. Based on the title and description, give me a concise **current status** (what we know so far) and the exact **next action** to move it forward.',
            '',
            'Be direct and actionable. Start working immediately after your briefing.',
          ].join('\n')

          ensureLocalSession(sessionId)
          appendLocalMessage(sessionId, {
            id: randomUUID(),
            role: 'user',
            content: briefing,
            timestamp: Date.now(),
          })

          return jsonResponse({ sessionId, briefing, task: getTask(params.taskId) })
        }

        if (action !== 'move') {
          return jsonResponse({ error: `Unsupported action: ${action}` }, 400)
        }

        try {
          const body = (await request.json()) as Record<string, unknown>
          if (typeof body.column !== 'string') {
            return jsonResponse({ error: 'column is required' }, 400)
          }
          const task = moveTask(params.taskId, body.column as TaskColumn)
          if (!task) return jsonResponse({ error: 'Task not found' }, 404)
          return jsonResponse({ task })
        } catch {
          return jsonResponse({ error: 'Invalid request body' }, 400)
        }
      },
    },
  },
})
