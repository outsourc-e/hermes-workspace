import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import { listMemoryFiles } from '../../server/memory-browser'

export const Route = createFileRoute('/api/memory')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        // Memory is sourced entirely from the local filesystem via
        // memory-browser.ts ($HERMES_HOME/MEMORY.md + memory/ + memories/).
        // hermes-agent has no /api/memory gateway endpoint (0.17.0 returns
        // 404), so the old gateway proxy here was permanently broken — this
        // route now mirrors /api/memory/list.
        try {
          return json({ ok: true, files: listMemoryFiles() })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
