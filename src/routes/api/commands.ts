/**
 * Server-side proxy for the TUI gateway's authoritative command catalog.
 *
 * The API server does not expose `/v1/commands`. `commands.catalog` is the
 * registry-backed JSON-RPC method shared by the TUI and dashboard, including
 * profile-specific quick commands and installed skill commands. This route
 * keeps dashboard credentials on the server; the browser only receives the
 * normalized command metadata.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { getTuiCommandCatalog } from '../../server/tui-command-catalog'

export const Route = createFileRoute('/api/commands')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          return json({ commands: await getTuiCommandCatalog() })
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Hermes command catalog is unavailable',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
