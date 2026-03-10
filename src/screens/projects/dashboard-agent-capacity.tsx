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
  const queueDepth = stats?.queued ?? 0

  return (
    <section className="rounded-xl border border-primary-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-sm font-semibold text-primary-900">Agent Capacity</h2>
          <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] text-primary-600">
            Queue {queueDepth}
          </span>
        </div>

        <div className="min-w-0 flex-1 overflow-hidden">
        {loading ? (
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-9 w-36 shrink-0 animate-shimmer rounded-full bg-primary-100"
              />
            ))}
          </div>
        ) : agents.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {agents.map((agent) => {
              const utilization = getAgentUtilization(agent)
              const isRunning = utilization.label !== 'idle' && utilization.label !== 'offline'

              return (
                <div
                  key={agent.id}
                  className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-primary-200 bg-primary-50/80 px-3 text-xs text-primary-600"
                >
                  <span
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      utilization.tone,
                    )}
                  />
                  <span className="max-w-28 truncate font-medium text-primary-900">
                    {agent.name}
                  </span>
                  <span className="text-primary-400">·</span>
                  <span className={cn('font-medium', isRunning ? 'text-accent-500' : 'text-primary-500')}>
                    {utilization.label === 'offline' ? 'offline' : isRunning ? 'running' : 'idle'}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-full border border-dashed border-primary-200 bg-primary-50/60 px-4 py-2 text-sm text-primary-500">
            No agents registered yet.
          </div>
        )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-primary-500">
        <span>
          <span className="font-medium text-primary-800">{stats?.running ?? 0}</span> running
        </span>
        <span>
          <span className="font-medium text-primary-800">{queueDepth}</span> queued
        </span>
        <span>
          <span className="font-medium text-primary-800">{stats?.paused ?? 0}</span> paused
        </span>
      </div>
    </section>
  )
}
