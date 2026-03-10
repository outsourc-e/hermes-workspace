import { cn } from '@/lib/utils'
import type { WorkspaceAgent, WorkspaceProject, WorkspaceStats } from './lib/workspace-types'
import { formatCurrency } from './lib/workspace-utils'

type DashboardKpiBarProps = {
  stats?: WorkspaceStats
  projects: WorkspaceProject[]
  agents: WorkspaceAgent[]
  pendingCheckpointCount: number
}

type StatPill = {
  label: string
  value: string
  tone: string
  sublabel?: string
}

export function DashboardKpiBar({
  stats,
  projects,
  agents,
  pendingCheckpointCount,
}: DashboardKpiBarProps) {
  const pills: StatPill[] = [
    {
      label: 'Projects',
      value: String(stats?.projects ?? projects.length),
      tone: 'text-accent-400',
    },
    {
      label: 'Agents',
      value: `${stats?.agentsOnline ?? agents.filter((a) => a.status !== 'offline').length}/${stats?.agentsTotal ?? agents.length} online`,
      tone: 'text-emerald-400',
    },
    {
      label: 'Running',
      value: `${stats?.running ?? 0} / ${stats?.queued ?? 0} / ${stats?.paused ?? 0}`,
      tone: 'text-sky-400',
      sublabel: 'run / queue / pause',
    },
    {
      label: 'Checkpoints',
      value: String(stats?.checkpointsPending ?? pendingCheckpointCount),
      tone: (stats?.checkpointsPending ?? pendingCheckpointCount) > 0 ? 'text-red-400' : 'text-primary-400',
      sublabel: 'pending review',
    },
    {
      label: 'Alerts',
      value: String(stats?.policyAlerts ?? 0),
      tone: (stats?.policyAlerts ?? 0) > 0 ? 'text-amber-400' : 'text-primary-400',
      sublabel: (stats?.policyAlerts ?? 0) > 0 ? 'action required' : 'no blockers',
    },
    {
      label: 'Cost today',
      value: formatCurrency(stats?.costToday ?? 0),
      tone: 'text-emerald-400',
    },
  ]

  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((pill) => (
        <div
          key={pill.label}
          className="flex min-w-[120px] flex-1 items-center gap-3 rounded-lg border border-primary-200 bg-white px-3 py-2 shadow-sm"
        >
          <div className={cn('text-xl font-semibold tabular-nums', pill.tone)}>
            {pill.value}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.14em] text-primary-500">
              {pill.label}
            </div>
            {pill.sublabel && (
              <div className="truncate text-[10px] text-primary-400">{pill.sublabel}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
