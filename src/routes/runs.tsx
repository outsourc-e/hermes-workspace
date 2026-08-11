import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { usePageTitle } from '@/hooks/use-page-title'
import { RunsScreen } from '@/screens/runs/runs-screen'

const boundedText = (max: number) => z.string().max(max).optional()

const runsSearchSchema = z.object({
  q: boundedText(200),
  view: z.enum(['active', 'recent', 'attention', 'archived']).catch('recent').optional(),
  provider: boundedText(120),
  account: boundedText(200),
  state: boundedText(120),
  ownership: boundedText(120),
  project: boundedText(200),
  kanban: z.enum(['all', 'linked', 'unlinked']).catch('all').optional(),
  task: boundedText(200),
  window: z.enum(['1h', '24h', '7d', '30d', 'all']).catch('all').optional(),
  from: boundedText(40),
  to: boundedText(40),
  sort: z.enum(['updated', 'created', 'staleness', 'title', 'project', 'provider', 'state']).catch('updated').optional(),
  direction: z.enum(['asc', 'desc']).catch('desc').optional(),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).optional(),
  size: z.union([z.literal(25), z.literal(50), z.literal(100)]).catch(25).optional(),
  run: boundedText(300),
})

export type RunsSearch = z.infer<typeof runsSearchSchema>

export const Route = createFileRoute('/runs')({
  ssr: false,
  validateSearch: runsSearchSchema,
  component: function RunsRoute() {
    usePageTitle('Runs')
    return <RunsScreen />
  },
  errorComponent: function RunsError({ error }) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-primary-50 p-6 text-center">
        <h2 className="mb-3 text-xl font-semibold text-primary-900">Failed to Load Runs</h2>
        <p className="mb-4 max-w-md text-sm text-primary-600">
          {error instanceof Error ? error.message : 'An unexpected error occurred'}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-accent-500 px-4 py-2 text-white transition-colors hover:bg-accent-600"
        >
          Reload Page
        </button>
      </div>
    )
  },
  pendingComponent: function RunsPending() {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-4 border-accent-500 border-r-transparent" />
          <p className="text-sm text-primary-500">Loading runs...</p>
        </div>
      </div>
    )
  },
})
