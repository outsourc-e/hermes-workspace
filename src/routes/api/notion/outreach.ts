/**
 * Notion Outreach / Interactions endpoint.
 * GET /api/notion/outreach — returns outreach interactions from Notion.
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

export const Route = createFileRoute('/api/notion/outreach')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized', items: [] }, { status: 401 })
        }

        try {
          const manifest = loadManifest()
          const ds = manifest.data_sources['Outreach / Interactions']
          if (!ds) {
            return json({ ok: false, error: 'Outreach / Interactions data source not found', items: [] }, { status: 404 })
          }

          const response = await queryDataSource(ds.id, { page_size: 100, cacheTtlMs: 60_000 })

          const items = response.results.map((record) => {
            const p = record.properties
            return {
              id: record.id,
              title: extractTitle(p),
              type: extractSelect(p, 'Type'),
              status: extractSelect(p, 'Status'),
              relatedLeadIds: extractRelationIds(p, 'Related Lead / Client'),
              relatedDealIds: extractRelationIds(p, 'Related Deal / Proposal'),
              date: extractDate(p, 'Date'),
              nextFollowUp: extractDate(p, 'Next Follow-Up'),
              agent: extractRichText(p, 'Agent'),
              description: extractRichText(p, 'Description'),
              channel: extractSelect(p, 'Channel'),
              recordUrl: workspaceNotionRecordUrl('Outreach / Interactions', record.id),
              createdTime: record.created_time,
            }
          })

          return json({
            ok: true,
            items,
            hasMore: response.has_more,
            count: items.length,
          })
        } catch (err) {
          const safe = notionRouteError(err, 'Could not fetch Notion outreach records')
          return json({ ...safe.body, items: [] }, { status: safe.status })
        }
      },
    },
  },
})
