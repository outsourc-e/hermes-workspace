/**
 * Notion Human Approval Queue endpoint.
 * GET /api/notion/approvals — returns open approval items from Notion.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../../server/auth-middleware'
import {
  loadManifest,
  notionRouteError,
  queryDataSource,
  extractTitle,
  extractRichText,
  extractSelect,
  extractDate,
  extractRelationIds,
  workspaceNotionRecordUrl,
} from '../../../server/notion-client'

const CLOSED_STATUSES = new Set(['approved', 'rejected', 'done', 'closed', 'complete', 'completed'])

export const Route = createFileRoute('/api/notion/approvals')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized', items: [] }, { status: 401 })
        }

        try {
          const manifest = loadManifest()
          const ds = manifest.data_sources['Human Approval Queue']
          if (!ds) {
            return json({ ok: false, error: 'Human Approval Queue data source not found', items: [] }, { status: 404 })
          }

          const response = await queryDataSource(ds.id, { page_size: 100, cacheTtlMs: 60_000 })

          const items = response.results
            .map((record) => {
              const p = record.properties
              const status = extractSelect(p, 'Status')
              return {
                id: record.id,
                title: extractTitle(p),
                category: extractSelect(p, 'Category'),
                priority: extractSelect(p, 'Priority'),
                status,
                requester: extractRichText(p, 'Requester'),
                description: extractRichText(p, 'Description'),
                relatedLeadIds: extractRelationIds(p, 'Related Lead'),
                relatedDealIds: extractRelationIds(p, 'Related Deal'),
                relatedInteractionIds: extractRelationIds(p, 'Related Interaction'),
                createdAt: extractDate(p, 'Created At'),
                dueDate: extractDate(p, 'Due Date'),
                recordUrl: workspaceNotionRecordUrl('Human Approval Queue', record.id),
                createdTime: record.created_time,
              }
            })
            .filter((item) => !CLOSED_STATUSES.has(item.status.toLowerCase()))

          return json({
            ok: true,
            items,
            hasMore: response.has_more,
            count: items.length,
          })
        } catch (err) {
          const safe = notionRouteError(err, 'Could not fetch Notion approval records')
          return json({ ...safe.body, items: [] }, { status: safe.status })
        }
      },
    },
  },
})
