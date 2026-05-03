/**
 * REST endpoints for MCP Hub Sources — Phase 3.2.
 *
 * GET    /api/mcp/hub-sources        — list all sources (built-ins + user)
 * POST   /api/mcp/hub-sources        — add a user-defined source
 * PUT    /api/mcp/hub-sources/:id    — update a user-defined source
 * DELETE /api/mcp/hub-sources/:id    — remove a user-defined source
 *
 * All endpoints are auth-gated. Validation errors return 200 with ok:false +
 * errors[] so the UI can surface them inline without special HTTP handling.
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  readHubSources,
  addHubSource,
  updateHubSource,
  deleteHubSource,
} from '../../../server/mcp-hub-sources-store'

export const Route = createFileRoute('/api/mcp/hub-sources')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const result = await readHubSources()
          return Response.json({
            ok: result.source !== 'invalid',
            sources: result.sources,
            source: result.source,
            ...(result.error ? { error: result.error } : {}),
            ...(result.errorPath ? { errorPath: result.errorPath } : {}),
            ...(result.validationErrors ? { validationErrors: result.validationErrors } : {}),
          })
        } catch (err) {
          return Response.json({
            ok: false,
            sources: [],
            source: 'invalid',
            error: err instanceof Error ? err.message : String(err),
          })
        }
      },

      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ ok: false, errors: [{ path: '', message: 'invalid JSON body' }] })
        }
        const result = await addHubSource(body)
        if (!result.ok) {
          return Response.json({ ok: false, errors: result.errors })
        }
        return Response.json({ ok: true, sources: result.sources })
      },
    },
  },
})
