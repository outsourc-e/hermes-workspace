import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  createEchoPage,
  deleteEchoPage,
  listEchoPages,
  updateEchoPage,
} from '../../server/echo-pages-store'

type PostBody = {
  action?: unknown
  id?: unknown
  title?: unknown
  prompt?: unknown
  status?: unknown
  missionId?: unknown
  note?: unknown
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export const Route = createFileRoute('/api/echo-pages')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        return json({ ok: true, pages: listEchoPages() })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        let body: PostBody
        try {
          body = (await request.json()) as PostBody
        } catch {
          return json({ error: 'Invalid JSON body' }, { status: 400 })
        }
        const action = str(body.action) || 'create'
        const now = Date.now()

        if (action === 'create') {
          const title = str(body.title)
          const prompt = str(body.prompt)
          if (!title || !prompt) {
            return json(
              { error: 'title and prompt are required' },
              { status: 400 },
            )
          }
          const page = createEchoPage({
            id: str(body.id) || undefined,
            title,
            prompt,
            now,
          })
          // The build itself is dispatched by the client to /api/swarm-dispatch
          // (keeps route deps clean); return the builder task it should send.
          return json({
            ok: true,
            page,
            dispatch: {
              workerId: 'builder',
              task: `Echo Studio page request "${page.title}" (id: ${page.id}). Build a self-contained workspace tool page that implements: ${page.prompt}\n\nProduce the page under src/screens/ + a route, wire any needed read-only API, and report what you created.`,
            },
          })
        }

        if (action === 'update') {
          const id = str(body.id)
          if (!id) return json({ error: 'id required' }, { status: 400 })
          const status = str(body.status)
          const page = updateEchoPage(
            id,
            {
              status: status
                ? (status as 'draft' | 'building' | 'ready' | 'failed')
                : undefined,
              missionId:
                body.missionId === undefined ? undefined : str(body.missionId),
              note: body.note === undefined ? undefined : str(body.note),
            },
            now,
          )
          if (!page) return json({ error: 'page not found' }, { status: 404 })
          return json({ ok: true, page })
        }

        if (action === 'delete') {
          const id = str(body.id)
          if (!id) return json({ error: 'id required' }, { status: 400 })
          const removed = deleteEchoPage(id)
          if (!removed) return json({ error: 'page not found' }, { status: 404 })
          return json({ ok: true, deleted: id })
        }

        return json({ error: `Unsupported action: ${action}` }, { status: 400 })
      },
    },
  },
})
