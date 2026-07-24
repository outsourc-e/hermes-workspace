import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { routeWorkspaceToolIntent } from '../../../lib/war-room/living-v3/workspace-tool-registry'

function taskTextFromBody(body: unknown) {
  if (!body || typeof body !== 'object') return ''
  const value = (body as { taskText?: unknown; prompt?: unknown; operatorNote?: unknown }).taskText
    ?? (body as { prompt?: unknown }).prompt
    ?? (body as { operatorNote?: unknown }).operatorNote
  return typeof value === 'string' ? value : ''
}

export const Route = createFileRoute('/api/war-room/tool-router')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const taskText = url.searchParams.get('q') ?? ''
        return json({ ok: true, route: routeWorkspaceToolIntent(taskText) }, {
          headers: { 'cache-control': 'no-store' },
        })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
        }
        const taskText = taskTextFromBody(body)
        return json({ ok: true, route: routeWorkspaceToolIntent(taskText) }, {
          headers: { 'cache-control': 'no-store' },
        })
      },
    },
  },
})
