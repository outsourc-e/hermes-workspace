import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  getDstnyDocumentRecord,
  updateDstnyDocumentRecord,
  type UpdateDstnyDocumentInput,
} from '../../../server/dstny-documents'
import { requireJsonContentType } from '../../../server/rate-limit'

export const Route = createFileRoute('/api/dstny-documents/update')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => ({}))) as {
            id?: unknown
            patch?: unknown
          }
          const id = typeof body.id === 'string' ? body.id.trim() : ''
          if (!id) {
            return json({ ok: false, error: 'id is required' }, { status: 400 })
          }
          if (!getDstnyDocumentRecord(id)) {
            return json({ ok: false, error: 'Document not found' }, { status: 404 })
          }
          if (!body.patch || typeof body.patch !== 'object' || Array.isArray(body.patch)) {
            return json({ ok: false, error: 'patch object is required' }, { status: 400 })
          }

          const document = updateDstnyDocumentRecord(id, body.patch as UpdateDstnyDocumentInput)
          return json({ ok: true, document })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to update Dstny document',
            },
            { status: 400 },
          )
        }
      },
    },
  },
})
