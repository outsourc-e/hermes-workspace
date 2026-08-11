import { createFileRoute } from '@tanstack/react-router'

import { requireProviderRuntimeMutationAuth } from '../../server/auth-middleware'
import { getProviderRuntimeService } from '../../server/provider-runtime-service'
import { readRuntimeRouteSnapshot } from '../../server/runtime-route-cache'
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_PROJECTED_RUNS,
  RUNTIME_RUN_SORT_KEYS,
  filterRuntimeRuns,
  paginateRuntimeRuns,
  projectRuntimeRuns,
  sortRuntimeRuns,
  summarizeRuntimeRuns
} from '../../server/runtime-run-projection'
import type {RuntimeRunFilters, RuntimeRunLinkFilter, RuntimeRunSortDirection, RuntimeRunSortKey} from '../../server/runtime-run-projection';

// Read-only inventory: this route never refreshes providers, never launches a
// CLI, and never touches a lease. Refresh stays on the authenticated POST of
// /api/provider-runtimes so a page load cannot fan out into provider processes.
const UNAVAILABLE = 'Provider runtime inventory is unavailable'
const MAX_FILTER_VALUES = 12
const MAX_FILTER_VALUE_LENGTH = 200
const MAX_QUERY_LENGTH = 200

function multi(params: URLSearchParams, name: string): Array<string> | undefined {
  const values = params.getAll(name)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .filter((value) => value.length <= MAX_FILTER_VALUE_LENGTH)
    .slice(0, MAX_FILTER_VALUES)
  return values.length ? values : undefined
}

function linkFilter(value: string | null): RuntimeRunLinkFilter {
  return value === 'linked' || value === 'unlinked' ? value : 'all'
}

function sortKey(value: string | null): RuntimeRunSortKey {
  return RUNTIME_RUN_SORT_KEYS.includes(value as RuntimeRunSortKey) ? (value as RuntimeRunSortKey) : 'updated'
}

function integer(value: string | null, min: number, max: number, fallback: number): number {
  const numeric = Number(value)
  if (!value || !Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(numeric)))
}

function runId(value: string | null): string | undefined {
  if (!value) return undefined
  const normalized = value.trim()
  return normalized && normalized.length <= 300 ? normalized : undefined
}

function timestamp(value: string | null): number | undefined {
  if (!value || value.length > 40) return undefined
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric >= 0) return numeric
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const Route = createFileRoute('/api/runtime-runs')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Deliberately first: denial must happen before the registry is read.
        if (!requireProviderRuntimeMutationAuth(request)) {
          return Response.json({ ok: false, error: 'Provider runtime inventory requires dashboard authentication' }, { status: 401 })
        }
        const params = new URL(request.url).searchParams
        const filters: RuntimeRunFilters = {
          provider: multi(params, 'provider'),
          account: multi(params, 'account'),
          state: multi(params, 'state'),
          ownership: multi(params, 'ownership'),
          project: multi(params, 'project'),
          linked: linkFilter(params.get('kanban') ?? params.get('linked')),
          kanbanTaskId: params.get('task')?.slice(0, 200),
          updatedFrom: timestamp(params.get('from')),
          updatedTo: timestamp(params.get('to')),
          query: params.get('q')?.slice(0, MAX_QUERY_LENGTH) ?? params.get('query')?.slice(0, MAX_QUERY_LENGTH) ?? undefined,
        }
        const direction: RuntimeRunSortDirection = params.get('direction') === 'asc' ? 'asc' : 'desc'
        const requestedPage = integer(params.get('page'), 1, 10_000, 1)
        const requestedSize = integer(params.get('size'), 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE)
        const requestedRunId = runId(params.get('run'))
        try {
          const generatedAt = Date.now()
          const records = getProviderRuntimeService().list()
          const availableRoutes = readRuntimeRouteSnapshot()
          const projected = projectRuntimeRuns(records, generatedAt, MAX_PROJECTED_RUNS)
          const selectedRun = requestedRunId ? projected.find((run) => run.id === requestedRunId) ?? null : null
          const matched = sortRuntimeRuns(filterRuntimeRuns(projected, filters), sortKey(params.get('sort')), direction)
          const page = paginateRuntimeRuns(matched, requestedPage, requestedSize)
          return Response.json({
            ok: true,
            generatedAt,
            runs: page.items,
            selectedRun,
            availableRoutes,
            summary: summarizeRuntimeRuns(matched, generatedAt),
            page: {
              number: page.page,
              size: page.pageSize,
              total: page.total,
              pages: page.pages,
              hasNext: page.hasNext,
              hasPrevious: page.hasPrevious,
            },
            inventory: { projected: projected.length, matched: matched.length, truncated: Array.isArray(records) && records.length > projected.length },
            filters: { ...filters, sort: sortKey(params.get('sort')), direction },
            refreshed: false,
          })
        } catch {
          // Registry corruption paths carry filesystem detail; return a fixed message.
          return Response.json({ ok: false, error: UNAVAILABLE }, { status: 500 })
        }
      },
    },
  },
})
