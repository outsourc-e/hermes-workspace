import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  listExternalMemoryCandidates,
  editExternalMemoryCandidate,
  approveExternalMemoryCandidate,
  rejectExternalMemoryCandidate,
  deleteExternalMemoryCandidate,
} from '../../../server/external-memory-browser'

export const Route = createFileRoute('/api/external-memory/candidates')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const url = new URL(request.url)
          return json(
            listExternalMemoryCandidates({
              provider: url.searchParams.get('provider') || undefined,
              state: url.searchParams.get('state') || undefined,
              limit: url.searchParams.get('limit') || undefined,
              offset: url.searchParams.get('offset') || undefined,
            }),
          )
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to list external memory candidates'
          // Unconfigured is a valid empty state, not a server error.
          if (/no external memory providers/i.test(message)) {
            return json({
              ok: true,
              provider: '',
              state: 'all',
              limit: 0,
              offset: 0,
              count: 0,
              total: 0,
              counts: { candidate: 0, approved: 0, rejected: 0, all: 0 },
              candidates: [],
            })
          }
          return json({ error: message }, { status: 500 })
        }
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const body = (await request.json().catch(() => ({}))) as {
            provider?: string
            id?: string
            action?: string
            text?: string
            reason?: string
          }
          if (body.action === 'edit') {
            return json(
              editExternalMemoryCandidate({
                provider: body.provider,
                id: body.id || '',
                text: body.text || '',
              }),
            )
          }
          if (body.action === 'approve') {
            return json(
              approveExternalMemoryCandidate({
                provider: body.provider,
                id: body.id || '',
              }),
            )
          }
          if (body.action === 'reject') {
            return json(
              rejectExternalMemoryCandidate({
                provider: body.provider,
                id: body.id || '',
                reason: body.reason || '',
              }),
            )
          }
          return json({ error: 'Unsupported action' }, { status: 400 })
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to update external memory candidate',
            },
            { status: 500 },
          )
        }
      },
      DELETE: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const url = new URL(request.url)
          const id = url.searchParams.get('id') || ''
          const provider = url.searchParams.get('provider') || undefined
          return json(deleteExternalMemoryCandidate({ provider, id }))
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to delete external memory candidate',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
