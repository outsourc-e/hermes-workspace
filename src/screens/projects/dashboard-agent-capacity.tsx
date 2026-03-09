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
    <section className="rounded-3xl border border-primary-800 bg-primary-900/78 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-primary-100">Agent Capacity</h2>
          <p className="text-sm text-primary-400">
            Utilization by registered agent with queue depth from pending work.
          </p>
        </div>
        <span className="rounded-full border border-primary-700 bg-primary-800/80 px-3 py-1 text-xs text-primary-300">
          Queue depth {stats?.queued ?? 0}
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="h-4 w-28 animate-shimmer rounded bg-primary-800/80" />
              <div className="h-2.5 animate-shimmer rounded-full bg-primary-800/70" />
            </div>
          ))
        ) : agents.length > 0 ? (
          agents.map((agent) => {
            const utilization = getAgentUtilization(agent)
            return (
              <div key={agent.id} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-primary-100">{agent.name}</p>
                    <p className="text-xs text-primary-500">
                      {(agent.adapter_type ?? agent.role ?? 'agent').toUpperCase()}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-primary-300">
                    {utilization.label}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-primary-800">
                  <div
                    className={cn('h-full rounded-full', utilization.tone)}
                    style={{ width: `${utilization.percent}%` }}
                  />
                </div>
              </div>
            )
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-primary-700 bg-primary-800/25 px-4 py-10 text-center text-sm text-primary-400">
            No agents registered yet.
          </div>
        )}

        <div className="rounded-2xl border border-primary-800 bg-primary-800/35 px-4 py-3 text-sm text-primary-400">
          <span className="font-medium text-primary-200">{stats?.running ?? 0}</span>{' '}
          running, <span className="font-medium text-primary-200">{stats?.queued ?? 0}</span>{' '}
          queued, <span className="font-medium text-primary-200">{stats?.paused ?? 0}</span>{' '}
          paused tasks across the workspace.
        </div>
      </div>
    </section>
  )
}
