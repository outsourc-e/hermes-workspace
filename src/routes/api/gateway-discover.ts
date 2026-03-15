import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/api/gateway-discover')({
  server: {
    handlers: {
      POST: async () =>
        json(
          { ok: false, error: 'Gateway discovery is not available in Hermes Workspace.' },
          { status: 501 },
        ),
    },
  },
})
