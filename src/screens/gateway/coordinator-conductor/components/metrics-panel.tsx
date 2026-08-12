import { NodeStateBadge, PanelMessage, Stat, classNames } from './shared'
import type { UseQueryResult } from '@tanstack/react-query'
import type { MetricsResponse } from '../types'
import type { NodeState } from '@/server/mission-coordinator/types'

export function MetricsPanel({
  metrics,
}: {
  metrics: UseQueryResult<MetricsResponse, Error>
}) {
  if (metrics.isLoading) {
    return (
      <PanelMessage title="Loading metrics" body="Reading coordinator state…" />
    )
  }

  if (metrics.error) {
    return (
      <PanelMessage
        title="Metrics unavailable"
        body={
          metrics.error instanceof Error
            ? metrics.error.message
            : 'Could not load metrics'
        }
        error
      />
    )
  }

  const data = metrics.data?.metrics
  if (!data) {
    return (
      <PanelMessage
        title="No metrics"
        body="The coordinator has not reported any state yet."
      />
    )
  }

  const byStateEntries = Object.entries(data.byState)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b))

  return (
    <section className="cc-fade-in mb-7 rounded-2xl border border-primary-200 bg-primary-50/50 p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Coordinator metrics</h2>
          <p className="mt-1 text-xs text-primary-600">
            Live state across all missions
          </p>
        </div>
        {metrics.isFetching ? (
          <span className="flex items-center gap-1.5 text-xs text-primary-600">
            <span className="size-1.5 animate-pulse rounded-full bg-accent-500" />
            syncing…
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border-y border-primary-200 bg-primary-200 sm:grid-cols-4">
        <Stat label="Total" value={data.total} />
        <Stat label="Active" value={data.active} />
        <Stat label="Completed" value={data.completed} />
        <Stat label="Failed" value={data.failed} />
      </div>

      <div className="mt-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-700">
          Node state bar
        </h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {byStateEntries.length === 0 ? (
            <span className="text-xs text-primary-600">No active nodes.</span>
          ) : (
            byStateEntries.map(([state, count]) => (
              <span
                key={state}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-surface px-2 py-1 text-xs transition hover:border-accent-400/40 hover:shadow-sm"
              >
                <NodeStateBadge state={state as NodeState} />
                <span className="font-medium text-ink">{count}</span>
              </span>
            ))
          )}
        </div>
      </div>
    </section>
  )
}
