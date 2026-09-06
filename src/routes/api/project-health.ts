/**
 * GET /api/project-health
 *
 * SSH into the home PC to walk CliniTrack-Suite worktrees and return
 * per-worktree git state plus an optional `gh pr list` count. The SSH
 * call has a 12s timeout; if it fails the response still returns 200
 * with `snapshot.error` populated so the dashboard widget can show a
 * "host unreachable" state instead of breaking the overview.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { readProjectHealth } from '../../server/project-health-source'

export const Route = createFileRoute('/api/project-health')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const snapshot = await readProjectHealth()
        return json(
          { snapshot },
          {
            headers: {
              // SSH round-trip is slow; cache aggressively to keep the
              // dashboard snappy when the user reloads.
              'Cache-Control':
                'private, max-age=60, stale-while-revalidate=120',
            },
          },
        )
      },
    },
  },
})
