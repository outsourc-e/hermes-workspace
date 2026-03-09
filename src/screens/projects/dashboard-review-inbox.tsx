import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import {
  getCheckpointFullSummary,
  getCheckpointSummary,
  type WorkspaceCheckpoint,
} from '@/lib/workspace-checkpoints'
import { cn } from '@/lib/utils'
import type {
  ReviewRiskFilter,
  ReviewVerificationFilter,
  WorkspaceProject,
} from './lib/workspace-types'
import {
  PROJECT_TONES,
  deriveCheckpointRisk,
  deriveCheckpointScope,
  formatTimeAgo,
  getPanelButtonClass,
  getProjectTone,
  isCheckpointVerified,
} from './lib/workspace-utils'

type DashboardReviewInboxProps = {
  checkpoints: WorkspaceCheckpoint[]
  projects: WorkspaceProject[]
  selectedProjectName?: string
  projectOptions: string[]
  projectFilter: string
  verificationFilter: ReviewVerificationFilter
  riskFilter: ReviewRiskFilter
  loading: boolean
  batchApproving: boolean
  verifiedCount: number
  actionPending: boolean
  onProjectFilterChange: (value: string) => void
  onVerificationFilterChange: (value: ReviewVerificationFilter) => void
  onRiskFilterChange: (value: ReviewRiskFilter) => void
  onApproveVerified: () => void
  onApprove: (checkpointId: string) => void
  onReview: (checkpoint: WorkspaceCheckpoint) => void
}

export function DashboardReviewInbox({
  checkpoints,
  projects,
  selectedProjectName,
  projectOptions,
  projectFilter,
  verificationFilter,
  riskFilter,
  loading,
  batchApproving,
  verifiedCount,
  actionPending,
  onProjectFilterChange,
  onVerificationFilterChange,
  onRiskFilterChange,
  onApproveVerified,
  onApprove,
  onReview,
}: DashboardReviewInboxProps) {
  return (
    <section className="rounded-3xl border border-primary-800 bg-primary-900/78 p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-primary-100">
            Review Inbox ({checkpoints.length})
          </h2>
          <p className="text-sm text-primary-400">
            Pending checkpoint handoffs with fast verification and approval actions.
          </p>
        </div>
        <Button
          onClick={onApproveVerified}
          disabled={batchApproving || verifiedCount === 0}
          className="bg-accent-500 text-white hover:bg-accent-400"
        >
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={1.8} />
          {batchApproving ? 'Approving...' : `Approve all verified (${verifiedCount})`}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onProjectFilterChange('all')}
          className={getPanelButtonClass(
            projectFilter === 'all',
            'border-accent-500/40 bg-accent-500/10 text-accent-300',
          )}
        >
          All
        </button>
        {projectOptions.map((projectName) => (
          <button
            key={projectName}
            type="button"
            onClick={() => onProjectFilterChange(projectName)}
            className={getPanelButtonClass(
              projectFilter === projectName,
              'border-accent-500/40 bg-accent-500/10 text-accent-300',
            )}
          >
            {projectName}
          </button>
        ))}
        <div className="mx-1 hidden h-7 w-px bg-primary-800 md:block" />
        {([
          ['all', 'All checks'],
          ['verified', 'Verified'],
          ['missing', 'Missing'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onVerificationFilterChange(value)}
            className={getPanelButtonClass(
              verificationFilter === value,
              'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
            )}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onRiskFilterChange(riskFilter === 'high' ? 'all' : 'high')}
          className={getPanelButtonClass(
            riskFilter === 'high',
            'border-red-500/35 bg-red-500/10 text-red-300',
          )}
        >
          High risk
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="rounded-2xl border border-primary-800 bg-primary-800/35 p-4"
            >
              <div className="h-4 w-40 animate-shimmer rounded bg-primary-800/80" />
              <div className="mt-3 h-5 w-3/4 animate-shimmer rounded bg-primary-800/70" />
            </div>
          ))
        ) : checkpoints.length > 0 ? (
          checkpoints.map((checkpoint) => {
            const projectName = checkpoint.project_name ?? 'Workspace'
            const projectForTone =
              projects.find((project) => project.name === projectName) ??
              projects.find((project) => project.name === selectedProjectName) ??
              projects[0]
            const tone = projectForTone ? getProjectTone(projectForTone) : PROJECT_TONES[0]
            const scope = deriveCheckpointScope(checkpoint)
            const risk = deriveCheckpointRisk(checkpoint)
            const verified = isCheckpointVerified(checkpoint)

            return (
              <article
                key={checkpoint.id}
                className="rounded-2xl border border-primary-800 bg-primary-800/35 p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span
                      className={cn(
                        'inline-flex shrink-0 rounded-full px-3 py-1 text-[11px] font-medium',
                        tone.soft,
                      )}
                    >
                      {projectName}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-primary-100">
                        {checkpoint.task_name ?? getCheckpointSummary(checkpoint, 88)}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-primary-400">
                        {getCheckpointFullSummary(checkpoint)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-sky-300">
                          {scope}
                        </span>
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]',
                            risk.high
                              ? 'border-red-500/30 bg-red-500/10 text-red-300'
                              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
                          )}
                        >
                          {risk.high ? `${risk.label} fire` : risk.label}
                        </span>
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]',
                            verified
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                              : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
                          )}
                        >
                          {verified ? 'Verified' : 'Missing'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end lg:self-auto">
                    <Button
                      onClick={() => onApprove(checkpoint.id)}
                      disabled={actionPending}
                      className="bg-accent-500 text-white hover:bg-accent-400"
                    >
                      Approve
                    </Button>
                    <Button variant="outline" onClick={() => onReview(checkpoint)}>
                      Review
                    </Button>
                    <span className="min-w-10 text-right text-xs text-primary-500">
                      {formatTimeAgo(checkpoint.created_at)}
                    </span>
                  </div>
                </div>
              </article>
            )
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-primary-700 bg-primary-800/25 px-6 py-12 text-center">
            <p className="text-sm text-primary-300">
              No pending checkpoints match the current inbox filters.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
