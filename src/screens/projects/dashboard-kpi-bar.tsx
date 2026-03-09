import { cn } from '@/lib/utils'
import type { WorkspaceAgent, WorkspaceProject, WorkspaceStats } from './lib/workspace-types'
import { formatCurrency } from './lib/workspace-utils'

type DashboardKpiBarProps = {
  stats?: WorkspaceStats
  projects: WorkspaceProject[]
  agents: WorkspaceAgent[]
  pendingCheckpointCount: number
}

function MetricCard({
  label,
  value,
  sublabel,
  tone = 'text-primary-900',
}: {
  label: string
  value: string
  sublabel?: string
  tone?: string
}) {
  return (
    <div className="rounded-xl border border-primary-200 bg-white px-4 py-4 shadow-sm">
      <div className={cn('text-2xl font-semibold tracking-tight', tone)}>
        {value}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-primary-500">
        {label}
      </div>
      {sublabel ? (
        <div className="mt-2 text-xs text-primary-500">{sublabel}</div>
      ) : null}
    </div>
  )
}

export function DashboardKpiBar({
  stats,
  projects,
  agents,
  pendingCheckpointCount,
}: DashboardKpiBarProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
      <MetricCard
        label="Projects"
        value={String(stats?.projects ?? projects.length)}
        tone="text-accent-300"
      />
      <MetricCard
        label="Agents Online"
        value={`${stats?.agentsOnline ?? agents.filter((agent) => agent.status !== 'offline').length}/${stats?.agentsTotal ?? agents.length}`}
        tone="text-emerald-300"
      />
      <MetricCard
        label="Running / Queued / Paused"
        value={`${stats?.running ?? 0} / ${stats?.queued ?? 0} / ${stats?.paused ?? 0}`}
        tone="text-sky-300"
      />
      <MetricCard
        label="Checkpoints Pending"
        value={String(stats?.checkpointsPending ?? pendingCheckpointCount)}
        tone="text-red-300"
      />
      <MetricCard
        label="Policy Alerts"
        value={String(stats?.policyAlerts ?? 0)}
        sublabel={(stats?.policyAlerts ?? 0) > 0 ? 'Action required' : 'No blockers'}
        tone="text-amber-300"
      />
      <MetricCard
        label="Cost Today"
        value={formatCurrency(stats?.costToday ?? 0)}
        tone="text-emerald-300"
      />
    </div>
  )
}
