/**
 * Notion source catalog endpoint.
 * GET /api/notion/sources — lists every manifest-backed data source the Workspace can read.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../../server/auth-middleware'
import { loadManifest, notionRouteError } from '../../../server/notion-client'

export const Route = createFileRoute('/api/notion/sources')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized', sources: [] }, { status: 401 })
        }

        try {
          const manifest = loadManifest()
          const sources = Object.entries(manifest.data_sources).map(([name, source]) => ({
            name,
            id: source.id,
            databaseId: source.database_id ?? '',
          }))

          return json({ ok: true, sources, count: sources.length })
        } catch (err) {
          const safe = notionRouteError(err, 'Could not load Notion source catalog')
          return json({ ...safe.body, sources: [] }, { status: safe.status })
        }
      },
    },
  },
})
