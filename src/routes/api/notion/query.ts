/**
 * Generic Notion data-source query endpoint.
 * GET /api/notion/query?source=CRM%20%2F%20Leads
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../../server/auth-middleware'
import {
  flattenRecord,
  loadManifest,
  notionRouteError,
  queryDataSource,
  summarizeRecord,
  workspaceNotionRecordUrl,
} from '../../../server/notion-client'

export const Route = createFileRoute('/api/notion/query')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized', records: [] }, { status: 401 })
        }

        try {
          const url = new URL(request.url)
          const sourceName = url.searchParams.get('source')?.trim()
          const limitRaw = Number(url.searchParams.get('limit') || '50')
          const pageSize = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50
          if (!sourceName) {
            return json({ ok: false, error: 'Missing required source query parameter', records: [] }, { status: 400 })
          }

          const manifest = loadManifest()
          const source = manifest.data_sources[sourceName]
          if (!source) {
            return json({ ok: false, error: 'Notion data source not found in manifest', records: [] }, { status: 404 })
          }

          const response = await queryDataSource(source.id, { page_size: pageSize, cacheTtlMs: 60_000 })
          const records = response.results.slice(0, pageSize).map((record) => ({
            id: record.id,
            title: summarizeRecord(record),
            properties: flattenRecord(record),
            recordUrl: workspaceNotionRecordUrl(sourceName, record.id),
            createdTime: record.created_time,
            lastEditedTime: record.last_edited_time,
          }))

          return json({
            ok: true,
            source: sourceName,
            records,
            count: records.length,
            hasMore: response.has_more,
          })
        } catch (err) {
          const safe = notionRouteError(err, 'Could not query Notion data source')
          return json({ ...safe.body, records: [] }, { status: safe.status })
        }
      },
    },
  },
})
