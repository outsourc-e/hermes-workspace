import {
  EyeIcon,
  Folder01Icon,
  PlayCircleIcon,
  Task01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ProjectOverview } from './lib/workspace-types'
import {
  getGateClass,
  getProjectTone,
  getStatusBadgeClass,
  formatStatus,
} from './lib/workspace-utils'

type DashboardProjectCardsProps = {
  projectOverviews: ProjectOverview[]
  selectedProjectId: string | null
  onSelect: (projectId: string) => void
  onResume: (missionId: string) => void
  submittingKey: string | null
}

export function DashboardProjectCards({
  projectOverviews,
  selectedProjectId,
  onSelect,
  onResume,
  submittingKey,
}: DashboardProjectCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {projectOverviews.map((overview) => {
        const active = overview.project.id === selectedProjectId
        const tone = getProjectTone(overview.project)

        return (
          <article
            key={overview.project.id}
            className={cn(
              'rounded-xl border bg-white p-5 shadow-sm transition-colors',
              active
                ? 'border-accent-500/50 shadow-[0_0_0_1px_rgba(251,146,60,0.12)]'
                : 'border-primary-200 hover:border-primary-300',
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(overview.project.id)}
              className="block w-full text-left"
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'flex size-12 shrink-0 items-center justify-center rounded-2xl border',
                    tone.accent,
                  )}
                >
                  <HugeiconsIcon icon={Folder01Icon} size={22} strokeWidth={1.6} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-primary-900">
                        {overview.project.name}
                      </p>
                      <p className="truncate text-xs text-primary-500">
                        {overview.project.path || 'No path configured'}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium',
                        getStatusBadgeClass(overview.project.status),
                      )}
                    >
                      {formatStatus(overview.project.status)}
                    </span>
                  </div>

                  <div className="mt-4 space-y-1.5">
                    <p className="text-xs uppercase tracking-[0.16em] text-primary-500">
                      Current phase
                    </p>
                    <p className="text-sm font-medium text-primary-900">
                      {overview.phaseLabel}
                    </p>
                    <p className="text-sm text-primary-600">
                      {overview.missionLabel}
                    </p>
                  </div>

                  <div className="mt-4">
                    <div className="h-2.5 overflow-hidden rounded-full bg-primary-100">
                      <div
                        className={cn(
                          'h-full rounded-full bg-gradient-to-r',
                          overview.progress >= 100
                            ? 'from-emerald-500 to-emerald-400'
                            : 'from-accent-500 to-emerald-400',
                        )}
                        style={{ width: `${overview.progress}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-primary-500">
                      <span>{overview.progress}%</span>
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium',
                          overview.pendingCheckpointCount > 0
                            ? 'border-red-500/30 bg-red-500/10 text-red-300'
                            : 'border-primary-200 bg-primary-50 text-primary-600',
                        )}
                      >
                        {overview.pendingCheckpointCount} checkpoint
                        {overview.pendingCheckpointCount === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {overview.gates.map((gate) => (
                      <span
                        key={`${overview.project.id}-${gate.label}`}
                        className={cn(
                          'inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]',
                          getGateClass(gate.tone),
                        )}
                      >
                        {gate.label}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {overview.squad.map((agent) => (
                      <span
                        key={`${overview.project.id}-${agent.label}`}
                        className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs text-primary-700"
                      >
                        <span className={cn('size-2 rounded-full', agent.tone)} />
                        {agent.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </button>

            <div className="mt-5 flex flex-wrap gap-2">
              {overview.canResume && overview.resumeMissionId ? (
                <Button
                  onClick={() => onResume(overview.resumeMissionId!)}
                  disabled={submittingKey === `start:${overview.resumeMissionId}`}
                  className="bg-accent-500 text-white hover:bg-accent-400"
                >
                  <HugeiconsIcon icon={PlayCircleIcon} size={16} strokeWidth={1.6} />
                  Resume
                </Button>
              ) : (
                <Button variant="outline" onClick={() => onSelect(overview.project.id)}>
                  <HugeiconsIcon icon={Task01Icon} size={16} strokeWidth={1.6} />
                  Report
                </Button>
              )}
              <Button variant="outline" onClick={() => onSelect(overview.project.id)}>
                <HugeiconsIcon icon={EyeIcon} size={16} strokeWidth={1.6} />
                View
              </Button>
            </div>
          </article>
        )
      })}
    </div>
  )
}
