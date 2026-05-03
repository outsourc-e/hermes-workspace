/**
 * PUT  /api/mcp/hub-sources/:id  — update a user-defined source
 * DELETE /api/mcp/hub-sources/:id — remove a user-defined source
 *
 * Auth-gated. Returns 200 with ok:false + errors[] on validation failure.
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import { updateHubSource, deleteHubSource, readHubSources } from '../../../server/mcp-hub-sources-store'
import { invalidateUserSourceCache } from '../../../server/mcp-hub/sources/generic-json'

export const Route = createFileRoute('/api/mcp/hub-sources/$id')({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ ok: false, errors: [{ path: '', message: 'invalid JSON body' }] })
        }

        // MEDIUM-2: Capture old URL before update so we can invalidate the
        // cache entry keyed as `${sourceId}:${oldUrl}`.
        let oldUrl: string | undefined
        try {
          const existing = await readHubSources()
          const old = existing.sources.find((s) => s.id === params.id)
          oldUrl = old?.url
        } catch {
          // Non-fatal — worst case cache stays warm until TTL expires
        }

        const result = await updateHubSource(params.id, body)
        if (!result.ok) {
          const status = result.status === 404 ? 404 : 200
          return Response.json({ ok: false, errors: result.errors }, { status })
        }

        // Invalidate cache for the old URL so next fetch picks up new config.
        if (oldUrl) {
          invalidateUserSourceCache(params.id, oldUrl)
        }

        return Response.json({ ok: true, sources: result.sources })
      },

      DELETE: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const result = await deleteHubSource(params.id)
        if (!result.ok) {
          const status = result.status === 404 ? 404 : 200
          return Response.json({ ok: false, errors: result.errors }, { status })
        }
        return Response.json({ ok: true, sources: result.sources })
      },
    },
  },
})
