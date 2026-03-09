import { cn } from '@/lib/utils'
import type { WorkspaceAgent, WorkspaceStats } from './lib/workspace-types'
import { getAgentUtilization } from './lib/workspace-utils'

type DashboardAgentCapacityProps = {
  agents: WorkspaceAgent[]
  stats?: WorkspaceStats
  loading: boolean
}

export function DashboardAgentCapacity({
  agents,
  stats,
  loading,
}: DashboardAgentCapacityProps) {
  return (
    <section className="rounded-xl border border-primary-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-primary-900">Agent Capacity</h2>
          <p className="text-sm text-primary-500">
            Utilization by registered agent with queue depth from pending work.
          </p>
        </div>
        <span className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs text-primary-600">
          Queue depth {stats?.queued ?? 0}
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="space-y-2">
              <div className="h-4 w-28 animate-shimmer rounded bg-primary-200/80" />
              <div className="h-2.5 animate-shimmer rounded-full bg-primary-200/70" />
            </div>
          ))
        ) : agents.length > 0 ? (
          agents.map((agent) => {
            const utilization = getAgentUtilization(agent)
            return (
              <div key={agent.id} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-primary-900">{agent.name}</p>
                    <p className="text-xs text-primary-500">
                      {(agent.adapter_type ?? agent.role ?? 'agent').toUpperCase()}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-primary-600">
                    {utilization.label}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-primary-100">
                  <div
                    className={cn('h-full rounded-full', utilization.tone)}
                    style={{ width: `${utilization.percent}%` }}
                  />
                </div>
              </div>
            )
          })
        ) : (
          <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/60 px-4 py-10 text-center text-sm text-primary-500">
            No agents registered yet.
          </div>
        )}

        <div className="rounded-xl border border-primary-200 bg-primary-50/70 px-4 py-3 text-sm text-primary-500">
          <span className="font-medium text-primary-800">{stats?.running ?? 0}</span>{' '}
          running, <span className="font-medium text-primary-800">{stats?.queued ?? 0}</span>{' '}
          queued, <span className="font-medium text-primary-800">{stats?.paused ?? 0}</span>{' '}
          paused tasks across the workspace.
        </div>
      </div>
    </section>
  )
}
