/**
 * Read-only Mission Control summary endpoint.
 * GET /api/mission-control/summary
 *
 * Aggregates safe operational counts from Notion through the server-side
 * Notion proxy. Does not expose tokens, raw credentials, or external writes.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../../server/auth-middleware'
import {
  extractDate,
  extractNumber,
  extractSelect,
  loadManifest,
  notionRouteError,
  queryDataSource,
} from '../../../server/notion-client'

type CountMap = Record<string, number>

function increment(map: CountMap, key: string | null | undefined): void {
  const normalized = key?.trim() || 'Unspecified'
  map[normalized] = (map[normalized] ?? 0) + 1
}

function isTodayOrEarlier(dateText: string): boolean {
  if (!dateText) return false
  const due = new Date(`${dateText}T23:59:59`)
  if (Number.isNaN(due.getTime())) return false
  return due.getTime() <= Date.now()
}

export const Route = createFileRoute('/api/mission-control/summary')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const manifest = loadManifest()
          const getSource = (name: string) => {
            const source = manifest.data_sources[name]
            if (!source) throw new Error(`Missing Notion data source: ${name}`)
            return source
          }

          const [crm, outreach, approvals, deals, projects, tasks, automation] = await Promise.all([
            queryDataSource(getSource('CRM / Leads').id, { page_size: 100, cacheTtlMs: 60_000 }),
            queryDataSource(getSource('Outreach / Interactions').id, { page_size: 100, cacheTtlMs: 60_000 }),
            queryDataSource(getSource('Human Approval Queue').id, { page_size: 100, cacheTtlMs: 60_000 }),
            queryDataSource(getSource('Deals / Proposals').id, { page_size: 100, cacheTtlMs: 60_000 }),
            queryDataSource(getSource('Projects').id, { page_size: 100, cacheTtlMs: 60_000 }),
            queryDataSource(getSource('Tasks').id, { page_size: 100, cacheTtlMs: 60_000 }),
            queryDataSource(getSource('Automation Log').id, { page_size: 100, cacheTtlMs: 60_000 }),
          ])

          const leadsByStage: CountMap = {}
          const leadsByOutreachStatus: CountMap = {}
          for (const record of crm.results) {
            increment(leadsByStage, extractSelect(record.properties, 'Deal Stage') || extractSelect(record.properties, 'Client Stage'))
            increment(leadsByOutreachStatus, extractSelect(record.properties, 'Outreach Status'))
          }

          const dealsByStage: CountMap = {}
          let estimatedPipelineValue = 0
          for (const record of deals.results) {
            increment(dealsByStage, extractSelect(record.properties, 'Status') || extractSelect(record.properties, 'Payment Status'))
            estimatedPipelineValue += extractNumber(record.properties, 'Deal Value') ?? 0
          }

          const approvalsByStatus: CountMap = {}
          for (const record of approvals.results) {
            increment(approvalsByStatus, extractSelect(record.properties, 'Status'))
          }

          const followUpsDue = outreach.results.filter((record) =>
            isTodayOrEarlier(extractDate(record.properties, 'Next Follow-Up Date')),
          ).length

          const activeProjects = projects.results.filter((record) => {
            const status = extractSelect(record.properties, 'Status').toLowerCase()
            return status !== 'done' && status !== 'archived' && status !== 'complete'
          }).length

          const openTasks = tasks.results.filter((record) => {
            const status = extractSelect(record.properties, 'Status').toLowerCase()
            return status !== 'done' && status !== 'archived' && status !== 'complete'
          }).length

          const recentAutomationRuns = automation.results.filter((record) =>
            Boolean(extractDate(record.properties, 'Last Run')),
          ).length

          return json({
            ok: true,
            generatedAt: new Date().toISOString(),
            counts: {
              crmLeads: crm.results.length,
              outreachInteractions: outreach.results.length,
              humanApprovals: approvals.results.length,
              deals: deals.results.length,
              projects: projects.results.length,
              activeProjects,
              tasks: tasks.results.length,
              openTasks,
              automationEntries: automation.results.length,
              recentAutomationRuns,
              followUpsDue,
            },
            groups: {
              leadsByStage,
              leadsByOutreachStatus,
              dealsByStage,
              approvalsByStatus,
            },
            health: {
              notion: 'reachable',
              secretBoundary: 'server-only',
              zoho: 'approval-required',
              reminders: 'action-surface-only',
            },
            links: {
              ledger: '/Users/escher/Documents/Obsidian Vault/Bethanys Second Brain/03_Projects/SEO-AEO-Service/Tools_Systems/HERMES_MISSION_CONTROL_IMPLEMENTATION_LEDGER.md',
              matrix: '/Users/escher/Documents/Obsidian Vault/Bethanys Second Brain/03_Projects/SEO-AEO-Service/Tools_Systems/HERMES_MISSION_CONTROL_SOURCE_OF_TRUTH_MATRIX.md',
              architecture: '/Users/escher/Documents/Obsidian Vault/Bethanys Second Brain/03_Projects/SEO-AEO-Service/Tools_Systems/HERMES_MISSION_CONTROL_ARCHITECTURE.md',
            },
          })
        } catch (err) {
          const safe = notionRouteError(err, 'Could not build Mission Control summary')
          return json(safe.body, { status: safe.status })
        }
      },
    },
  },
})
