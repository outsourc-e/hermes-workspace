import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { CreateTaskSchema, createWarRoomTask, getWarRoomBodyState } from '../../../lib/war-room/body'

export const Route = createFileRoute('/api/war-room/tasks')({
  server: {
    handlers: {
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
        const parsed = CreateTaskSchema.safeParse(body)
        if (!parsed.success) {
          return json({ ok: false, error: parsed.error.issues.map((issue) => issue.message).join('; ') }, { status: 400 })
        }
        try {
          const task = createWarRoomTask(parsed.data as Parameters<typeof createWarRoomTask>[0])
          return json({ ok: true, task, state: getWarRoomBodyState() }, { headers: { 'cache-control': 'no-store' } })
        } catch (error) {
          return json({ ok: false, error: error instanceof Error ? error.message : String(error), state: getWarRoomBodyState() }, { status: 400 })
        }
      },
    },
  },
})
