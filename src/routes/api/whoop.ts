/**
 * GET /api/whoop
 *
 * Returns Whoop snapshot data for the dashboard widgets.
 * Reads from ~/.hermes/repos/nw-personal-projects/whoop/latest.json
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { readWhoopSnapshot } from '../../server/whoop-source'

export const Route = createFileRoute('/api/whoop')({
  server: {
    handlers: {
      GET: async () => {
        const snapshot = await readWhoopSnapshot()
        return json(snapshot ?? { date: null })
      },
    },
  },
})
