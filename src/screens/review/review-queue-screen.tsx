import {
  ArrowTurnBackwardIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import {
  formatCheckpointStatus,
  formatCheckpointTimestamp,
  getCheckpointActionButtonClass,
  getCheckpointCommitHashLabel,
  getCheckpointDiffStat,
  getCheckpointReviewSubmitLabel,
  getCheckpointReviewSuccessMessage,
  getCheckpointStatusBadgeClass,
  getCheckpointSummary,
  isCheckpointReviewable,
  listWorkspaceCheckpoints,
  submitCheckpointReview,
  type CheckpointReviewAction,
  type CheckpointStatus,
  type WorkspaceCheckpoint,
} from '@/lib/workspace-checkpoints'
import { cn } from '@/lib/utils'

const FILTERS: Array<{
  label: string
  value: 'all' | CheckpointStatus
}> = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Revised', value: 'revised' },
]

type ReviewComposerState = {
  checkpointId: string
  action: Extract<CheckpointReviewAction, 'revise' | 'reject'>
}

function ReviewQueueSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-primary-800 bg-primary-900/70 p-4"
        >
          <div className="animate-shimmer rounded-lg bg-primary-800/80 h-4 w-40" />
          <div className="mt-3 animate-shimmer rounded-lg bg-primary-800/70 h-5 w-2/3" />
          <div className="mt-2 animate-shimmer rounded-lg bg-primary-800/60 h-4 w-full" />
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <div className="animate-shimmer rounded-lg bg-primary-800/60 h-10" />
            <div className="animate-shimmer rounded-lg bg-primary-800/60 h-10" />
            <div className="animate-shimmer rounded-lg bg-primary-800/60 h-10" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ReviewRow({
  checkpoint,
  composer,
  notes,
  onApprove,
  onOpenComposer,
  onCancelComposer,
  onNotesChange,
  onSubmitComposer,
  mutationPending,
}: {
  checkpoint: WorkspaceCheckpoint
  composer: ReviewComposerState | null
  notes: string
  onApprove: (checkpointId: string) => void
  onOpenComposer: (
    checkpointId: string,
    action: Extract<CheckpointReviewAction, 'revise' | 'reject'>,
  ) => void
  onCancelComposer: () => void
  onNotesChange: (value: string) => void
  onSubmitComposer: () => void
  mutationPending: boolean
}) {
  const isComposerOpen = composer?.checkpointId === checkpoint.id
  const canReview = isCheckpointReviewable(checkpoint)
  const commitHashLabel = getCheckpointCommitHashLabel(checkpoint)

  return (
    <article className="rounded-2xl border border-primary-800 bg-primary-900/75 p-4 md:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-primary-700 bg-primary-800/70 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-primary-300">
              Run {checkpoint.task_run_id}
            </span>
            <span
              className={cn(
                'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium',
                getCheckpointStatusBadgeClass(checkpoint.status),
              )}
            >
              {formatCheckpointStatus(checkpoint.status)}
            </span>
          </div>

          <div>
            <h2 className="text-base font-semibold text-primary-100">
              {getCheckpointSummary(checkpoint)}
            </h2>
            <p className="mt-1 text-sm text-primary-400">
              {checkpoint.project_name || 'Unassigned project'}
              {checkpoint.task_name ? ` · ${checkpoint.task_name}` : ''}
              {checkpoint.agent_name ? ` · ${checkpoint.agent_name}` : ''}
            </p>
          </div>

          <div className="grid gap-3 text-sm text-primary-300 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border border-primary-800 bg-primary-800/40 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-primary-500">
                Diff Stat
              </p>
              <p className="mt-1 text-sm text-primary-200">
                {getCheckpointDiffStat(checkpoint)}
              </p>
            </div>
            <div className="rounded-xl border border-primary-800 bg-primary-800/40 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-primary-500">
                Commit
              </p>
              <div className="mt-1">
                {commitHashLabel ? (
                  <code className="inline-flex items-center rounded-md border border-primary-700 bg-primary-900/80 px-2 py-1 font-mono text-xs text-primary-200 tabular-nums">
                    {commitHashLabel}
                  </code>
                ) : (
                  <p className="text-sm text-primary-400">pending</p>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-primary-800 bg-primary-800/40 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-primary-500">
                Created
              </p>
              <p className="mt-1 text-sm text-primary-200">
                {formatCheckpointTimestamp(checkpoint.created_at)}
              </p>
            </div>
            {checkpoint.reviewer_notes ? (
              <div className="rounded-xl border border-primary-800 bg-primary-800/40 px-3 py-2.5 md:col-span-2 xl:col-span-1">
                <p className="text-[11px] uppercase tracking-[0.14em] text-primary-500">
                  Reviewer Notes
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-primary-200">
                  {checkpoint.reviewer_notes}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {canReview ? (
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <button
              type="button"
              onClick={() => onApprove(checkpoint.id)}
              className={getCheckpointActionButtonClass('approve')}
              disabled={mutationPending}
            >
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                size={16}
                strokeWidth={1.8}
              />
              Approve
            </button>
            <button
              type="button"
              onClick={() => onOpenComposer(checkpoint.id, 'revise')}
              className={getCheckpointActionButtonClass('revise')}
              disabled={mutationPending}
            >
              <HugeiconsIcon
                icon={ArrowTurnBackwardIcon}
                size={16}
                strokeWidth={1.8}
              />
              Revise
            </button>
            <button
              type="button"
              onClick={() => onOpenComposer(checkpoint.id, 'reject')}
              className={getCheckpointActionButtonClass('reject')}
              disabled={mutationPending}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
              Reject
            </button>
          </div>
        ) : null}
      </div>

      {isComposerOpen ? (
        <div className="mt-4 rounded-2xl border border-primary-800 bg-primary-800/35 p-4">
          <label className="block">
            <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.14em] text-primary-500">
              Reviewer Notes
            </span>
            <textarea
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              rows={4}
              className="w-full rounded-xl border border-primary-700 bg-primary-900 px-3 py-2.5 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
              placeholder="Add the revision guidance or rejection reason..."
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={onCancelComposer}
              disabled={mutationPending}
            >
              Cancel
            </Button>
            <Button
              onClick={onSubmitComposer}
              className={cn(
                composer.action === 'revise'
                  ? 'bg-amber-500 text-white hover:bg-amber-400'
                  : 'bg-red-600 text-white hover:bg-red-500',
              )}
              disabled={mutationPending}
            >
              {mutationPending
                ? 'Submitting...'
                : getCheckpointReviewSubmitLabel(composer.action)}
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  )
}

export function ReviewQueueScreen() {
  const [statusFilter, setStatusFilter] = useState<'all' | CheckpointStatus>(
    'all',
  )
  const [composer, setComposer] = useState<ReviewComposerState | null>(null)
  const [reviewerNotes, setReviewerNotes] = useState('')
  const queryClient = useQueryClient()

  const checkpointsQuery = useQuery({
    queryKey: ['workspace', 'checkpoints', statusFilter],
    queryFn: () =>
      listWorkspaceCheckpoints(
        statusFilter === 'all' ? undefined : statusFilter,
      ),
  })

  const reviewMutation = useMutation({
    mutationFn: ({
      checkpointId,
      action,
      reviewerNotes,
    }: {
      checkpointId: string
      action: CheckpointReviewAction
      reviewerNotes?: string
    }) => submitCheckpointReview(checkpointId, action, reviewerNotes),
    onSuccess: (_checkpoint, variables) => {
      toast(getCheckpointReviewSuccessMessage(variables.action), {
        type: 'success',
      })
      setComposer(null)
      setReviewerNotes('')
      void queryClient.invalidateQueries({
        queryKey: ['workspace', 'checkpoints'],
      })
    },
    onError: (error) => {
      toast(
        error instanceof Error ? error.message : 'Failed to update checkpoint',
        { type: 'error' },
      )
    },
  })

  const checkpoints = checkpointsQuery.data ?? []
  const pendingCount = useMemo(
    () =>
      checkpoints.filter((checkpoint) => checkpoint.status === 'pending')
        .length,
    [checkpoints],
  )

  function handleApprove(checkpointId: string) {
    reviewMutation.mutate({
      checkpointId,
      action: 'approve',
    })
  }

  function handleOpenComposer(
    checkpointId: string,
    action: Extract<CheckpointReviewAction, 'revise' | 'reject'>,
  ) {
    setComposer({ checkpointId, action })
    setReviewerNotes('')
  }

  function handleSubmitComposer() {
    if (!composer) return

    reviewMutation.mutate({
      checkpointId: composer.checkpointId,
      action: composer.action,
      reviewerNotes,
    })
  }

  return (
    <main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-100 md:px-6 md:pt-8">
      <section className="mx-auto w-full max-w-[1400px]">
        <header className="mb-6 flex flex-col gap-4 rounded-2xl border border-primary-800 bg-primary-900/85 px-4 py-4 shadow-sm md:flex-row md:items-center md:justify-between md:px-5">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-accent-500/30 bg-accent-500/10 text-accent-300">
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                size={22}
                strokeWidth={1.6}
              />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-primary-100 md:text-xl">
                Review Queue
              </h1>
              <p className="text-sm text-primary-400">
                Triage workspace checkpoints and move execution forward.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-primary-700 bg-primary-800/70 px-3 py-2 text-xs font-medium text-primary-300">
              {pendingCount} pending
            </span>
            <Button
              variant="outline"
              onClick={() => checkpointsQuery.refetch()}
              disabled={checkpointsQuery.isFetching}
            >
              Refresh
            </Button>
          </div>
        </header>

        <div className="mb-5 flex flex-wrap gap-2">
          {FILTERS.map((filter) => {
            const active = filter.value === statusFilter
            return (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStatusFilter(filter.value)}
                className={cn(
                  'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-accent-500/50 bg-accent-500/10 text-accent-300'
                    : 'border-primary-800 bg-primary-900/70 text-primary-300 hover:border-primary-700 hover:bg-primary-900',
                )}
              >
                {filter.label}
              </button>
            )
          })}
        </div>

        {checkpointsQuery.isLoading ? (
          <ReviewQueueSkeleton />
        ) : checkpoints.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-primary-700 bg-primary-900/60 px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-3xl border border-primary-700 bg-primary-800/80 text-primary-300">
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                size={26}
                strokeWidth={1.5}
              />
            </div>
            <h2 className="text-lg font-semibold text-primary-100">
              No checkpoints found
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-primary-400">
              There are no checkpoints for the current filter.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {checkpoints.map((checkpoint) => (
              <ReviewRow
                key={checkpoint.id}
                checkpoint={checkpoint}
                composer={composer}
                notes={reviewerNotes}
                onApprove={handleApprove}
                onOpenComposer={handleOpenComposer}
                onCancelComposer={() => {
                  setComposer(null)
                  setReviewerNotes('')
                }}
                onNotesChange={setReviewerNotes}
                onSubmitComposer={handleSubmitComposer}
                mutationPending={reviewMutation.isPending}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
