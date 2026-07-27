/**
 * Notion CRM / Leads endpoint.
 * GET /api/notion/crm — returns CRM leads from Notion.
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
  extractEmail,
  extractUrl,
  extractNumber,
  extractDate,
  extractCheckbox,
  extractPhone,
  workspaceNotionRecordUrl,
} from '../../../server/notion-client'

export const Route = createFileRoute('/api/notion/crm')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized', leads: [] }, { status: 401 })
        }

        try {
          const manifest = loadManifest()
          const ds = manifest.data_sources['CRM / Leads']
          if (!ds) {
            return json({ ok: false, error: 'CRM / Leads data source not found in manifest', leads: [] }, { status: 404 })
          }

          const response = await queryDataSource(ds.id, { page_size: 100, cacheTtlMs: 60_000 })

          const leads = response.results.map((record) => {
            const p = record.properties
            return {
              id: record.id,
              company: extractTitle(p),
              contactName: extractRichText(p, 'Contact Name'),
              contactEmail: extractEmail(p, 'Email'),
              contactPhone: extractPhone(p, 'Phone'),
              website: extractUrl(p, 'Website'),
              city: extractRichText(p, 'City'),
              state: extractRichText(p, 'State'),
              leadScore: extractNumber(p, 'Lead Score'),
              outreachStatus: extractSelect(p, 'Outreach Status'),
              replyStatus: extractSelect(p, 'Reply Status'),
              dealStage: extractSelect(p, 'Deal Stage'),
              recommendedPackage: extractSelect(p, 'Recommended Package'),
              packageSold: extractSelect(p, 'Package Sold'),
              dealValue: extractNumber(p, 'Deal Value'),
              monthlyRetainer: extractNumber(p, 'Monthly Retainer'),
              paymentStatus: extractSelect(p, 'Payment Status'),
              clientStage: extractSelect(p, 'Client Stage'),
              accessStatus: extractSelect(p, 'Access Status'),
              clientHealth: extractSelect(p, 'Client Health'),
              seoOpportunity: extractCheckbox(p, 'SEO Opportunity'),
              aeoOpportunity: extractCheckbox(p, 'AEO Opportunity'),
              gbpOpportunity: extractCheckbox(p, 'GBP Opportunity'),
              followUpCount: extractNumber(p, 'Follow-up Count'),
              nextCheckIn: extractDate(p, 'Next Client Check-In'),
              nextReportDue: extractDate(p, 'Next Report Due'),
              reportingCadence: extractSelect(p, 'Reporting Cadence'),
              source: extractRichText(p, 'Source'),
              notes: extractRichText(p, 'Notes'),
              lastVerified: extractDate(p, 'Last Verified'),
              dataConfidence: extractSelect(p, 'Data Confidence'),
              recordUrl: workspaceNotionRecordUrl('CRM / Leads', record.id),
              createdTime: record.created_time,
            }
          })

          return json({
            ok: true,
            leads,
            hasMore: response.has_more,
            count: leads.length,
          })
        } catch (err) {
          const safe = notionRouteError(err, 'Could not fetch Notion CRM records')
          return json({ ...safe.body, leads: [] }, { status: safe.status })
        }
      },
    },
  },
})
