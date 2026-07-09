import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  RUNNABLE_CONTROL_LOOPS,
  runControlLoopDry,
} from '../../server/control-loop-runner'

const runSchema = z.object({
  loopId: z.enum(RUNNABLE_CONTROL_LOOPS),
})

export const Route = createFileRoute('/api/control-loops/run')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const body: unknown = await request.json().catch(() => null)
        const parsed = runSchema.safeParse(body)
        if (!parsed.success) {
          return json(
            { error: 'Invalid loopId', issues: parsed.error.issues },
            { status: 400 },
          )
        }
        const { result, receiptId } = await runControlLoopDry(parsed.data.loopId)
        return json({ ok: true, result, receiptId })
      },
    },
  },
})
