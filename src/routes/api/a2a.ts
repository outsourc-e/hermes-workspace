import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'
import { isAuthenticated } from '../../server/auth-middleware'
import { discoverA2AAgent, sendA2ATask } from '../../server/a2a-client'

const TaskSchema = z.object({
  skillId: z.string().trim().min(1),
  input: z.record(z.unknown()).default({}),
})

export const Route = createFileRoute('/api/a2a')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request))
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        try {
          return json({ ok: true, agent: await discoverA2AAgent() })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 503 },
          )
        }
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request))
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const parsed = TaskSchema.safeParse(
          await request.json().catch(() => null),
        )
        if (!parsed.success)
          return json(
            {
              ok: false,
              error: parsed.error.issues
                .map((issue) => issue.message)
                .join('; '),
            },
            { status: 400 },
          )
        try {
          return json({ ok: true, response: await sendA2ATask(parsed.data) })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 502 },
          )
        }
      },
    },
  },
})
