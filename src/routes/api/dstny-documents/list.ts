import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  DSTNY_BUSINESS_STATUSES,
  DSTNY_CONFIDENCE_LEVELS,
  DSTNY_DOCUMENT_CHANNELS,
  DSTNY_DOCUMENT_COLLECTIONS,
  DSTNY_DOCUMENT_TYPES,
  DSTNY_INGESTION_STATUSES,
  listDstnyDocuments,
} from '../../../server/dstny-documents'

export const Route = createFileRoute('/api/dstny-documents/list')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const url = new URL(request.url)
          const documents = listDstnyDocuments({
            collection: url.searchParams.get('collection'),
            product: url.searchParams.get('product'),
            channel: url.searchParams.get('channel'),
            businessStatus: url.searchParams.get('businessStatus'),
            ingestionStatus: url.searchParams.get('ingestionStatus'),
            q: url.searchParams.get('q'),
            includeArchived: url.searchParams.get('includeArchived') === 'true',
          })

          return json({
            ok: true,
            documents,
            options: {
              collections: DSTNY_DOCUMENT_COLLECTIONS,
              channels: DSTNY_DOCUMENT_CHANNELS,
              docTypes: DSTNY_DOCUMENT_TYPES,
              businessStatuses: DSTNY_BUSINESS_STATUSES,
              confidenceLevels: DSTNY_CONFIDENCE_LEVELS,
              ingestionStatuses: DSTNY_INGESTION_STATUSES,
            },
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to list Dstny documents',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
