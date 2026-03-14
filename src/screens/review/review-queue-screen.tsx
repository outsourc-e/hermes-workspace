import {
  ArrowTurnBackwardIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import {
  formatCheckpointStatus,
  formatCheckpointTimestamp,
  getCheckpointActionButtonClass,
  getCheckpointCommitHashLabel,
  getCheckpointDiffStat,
  getCheckpointDiffStatParsed,
  getCheckpointFullSummary,
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
import { CheckpointDetailModal } from '@/screens/projects/checkpoint-detail-modal'
import {
  extractProject,
  extractProjects,
} from '@/screens/projects/lib/workspace-types'

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

async function apiRequest(input: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(input, init)
  const payload = await readPayload(response)

  if (!response.ok) {
    const record =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : null
    throw new Error(
      (typeof record?.error === 'string' && record.error) ||
        (typeof record?.message === 'string' && record.message) ||
        `Request failed with status ${response.status}`,
    )
  }

  return payload
}

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

const PAGE_SIZE = 8

type ReviewComposerState = {
  checkpointId: string
  action: Extract<CheckpointReviewAction, 'revise' | 'reject'>
}

function getCheckpointTscStatus(
  checkpoint: WorkspaceCheckpoint,
): 'passed' | 'failed' | null {
  if (!checkpoint.verification_raw) return null

  try {
    const parsed = JSON.parse(checkpoint.verification_raw) as {
      tsc?: { status?: unknown }
    }
    return parsed.tsc?.status === 'passed' || parsed.tsc?.status === 'failed'
      ? parsed.tsc.status
      : null
  } catch {
    return null
  }
}

function ReviewQueueSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="rounded-xl border border-primary-200 bg-white p-4 shadow-sm"
        >
          <div className="animate-shimmer rounded-lg bg-primary-200/80 h-4 w-40" />
          <div className="mt-3 animate-shimmer rounded-lg bg-primary-200/70 h-5 w-2/3" />
          <div className="mt-2 animate-shimmer rounded-lg bg-primary-200/60 h-4 w-full" />
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <div className="h-10 animate-shimmer rounded-lg bg-primary-200/70" />
            <div className="h-10 animate-shimmer rounded-lg bg-primary-200/70" />
            <div className="h-10 animate-shimmer rounded-lg bg-primary-200/70" />
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
  isHighlighted,
  onApprove,
  onOpenDetail,
  onQuickPreview,
  onHighlight,
  onOpenComposer,
  onCancelComposer,
  onNotesChange,
  onSubmitComposer,
  mutationPending,
}: {
  checkpoint: WorkspaceCheckpoint
  composer: ReviewComposerState | null
  notes: string
  isHighlighted: boolean
  onApprove: (checkpointId: string) => void
  onOpenDetail: (checkpoint: WorkspaceCheckpoint) => void
  onQuickPreview: (checkpoint: WorkspaceCheckpoint) => void
  onHighlight: (checkpoint: WorkspaceCheckpoint) => void
  onOpenComposer: (
    checkpointId: string,
    action: Extract<CheckpointReviewAction, 'revise' | 'reject'>,
  ) => void
  onCancelComposer: () => void
  onNotesChange: (value: string) => void
  onSubmitComposer: () => void
  mutationPending: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const isComposerOpen = composer?.checkpointId === checkpoint.id
  const canReview = isCheckpointReviewable(checkpoint)
  const commitHashLabel = getCheckpointCommitHashLabel(checkpoint)
  const truncatedSummary = getCheckpointSummary(checkpoint, 200)
  const fullSummary = getCheckpointFullSummary(checkpoint)
  const isTruncated = truncatedSummary !== fullSummary
  const parsedDiff = getCheckpointDiffStatParsed(checkpoint)
  const tscStatus = getCheckpointTscStatus(checkpoint)

  function handleOpen(event: React.MouseEvent) {
    const target = event.target
    if (target instanceof HTMLElement && target.closest('button, textarea, input, select, a')) return
    if (event.shiftKey) {
      onQuickPreview(checkpoint)
      return
    }
    onOpenDetail(checkpoint)
  }

  return (
    <article
      className={cn(
        'cursor-pointer rounded-xl border bg-white p-3 shadow-sm transition-colors hover:border-primary-300',
        isHighlighted
          ? 'border-accent-500/60 ring-1 ring-accent-500/30'
          : 'border-primary-200',
      )}
      onClick={handleOpen}
      onMouseEnter={() => onHighlight(checkpoint)}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-primary-600">
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
            <p className="mt-1 text-sm font-medium text-primary-800">
              {checkpoint.project_name || 'Unassigned project'}
              {checkpoint.task_name ? ` · ${checkpoint.task_name}` : ''}
              {checkpoint.agent_name ? ` · ${checkpoint.agent_name}` : ''}
            </p>
            <div className="mt-2">
              <p
                className={cn(
                  'whitespace-pre-wrap text-sm text-primary-600 leading-relaxed',
                  !expanded && 'line-clamp-1',
                )}
              >
                {expanded ? fullSummary : truncatedSummary}
              </p>
              {isTruncated && (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="mt-1 text-xs font-medium text-accent-400 hover:text-accent-300 transition-colors"
                >
                  {expanded ? 'Show less' : 'Show full log'}
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-2 text-sm text-primary-600 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border border-primary-200 bg-primary-50/70 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-[0.14em] text-primary-500">
                  Diff Stat
                </p>
                {tscStatus ? (
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                      tscStatus === 'passed'
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-red-200 bg-red-50 text-red-700',
                    )}
                  >
                    {tscStatus === 'passed' ? 'tsc ✓' : 'tsc ✗'}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm font-medium text-primary-800">
                {getCheckpointDiffStat(checkpoint)}
              </p>
              {parsedDiff && parsedDiff.changedFiles.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {parsedDiff.changedFiles.slice(0, 5).map((file) => (
                    <p key={file} className="truncate font-mono text-xs text-primary-500">
                      {file}
                    </p>
                  ))}
                  {parsedDiff.changedFiles.length > 5 && (
                    <p className="text-xs text-primary-500">
                      +{parsedDiff.changedFiles.length - 5} more
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-primary-200 bg-primary-50/70 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.14em] text-primary-500">
                Commit
              </p>
              <div className="mt-1">
                {commitHashLabel ? (
                  <code className="inline-flex items-center rounded-md border border-primary-200 bg-white px-2 py-1 font-mono text-xs text-primary-700 tabular-nums">
                    {commitHashLabel}
                  </code>
                ) : (
                  <p className="text-sm text-primary-500">pending</p>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-primary-200 bg-primary-50/70 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.14em] text-primary-500">
                Created
              </p>
              <p className="mt-1 text-sm text-primary-600">
                {formatCheckpointTimestamp(checkpoint.created_at)}
              </p>
            </div>
            {checkpoint.reviewer_notes ? (
              <div className="rounded-xl border border-primary-200 bg-primary-50/70 px-3 py-2 md:col-span-2 xl:col-span-1">
                <p className="text-[11px] uppercase tracking-[0.14em] text-primary-500">
                  Reviewer Notes
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-primary-700">
                  {checkpoint.reviewer_notes}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {canReview ? (
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <Button
              variant="outline"
              onClick={(event) => {
                if (event.shiftKey) {
                  onQuickPreview(checkpoint)
                  return
                }
                onOpenDetail(checkpoint)
              }}
              disabled={mutationPending}
            >
              Review
            </Button>
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
        <div className="mt-4 rounded-2xl border border-primary-200 bg-primary-50/80 p-4">
          <label className="block">
            <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.14em] text-primary-500">
              Reviewer Notes
            </span>
            <textarea
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              rows={4}
              className="w-full rounded-xl border border-primary-200 bg-white px-3 py-2.5 text-sm text-primary-900 outline-none transition-colors focus:border-accent-500"
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
  const [projectFilter, setProjectFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [composer, setComposer] = useState<ReviewComposerState | null>(null)
  const [reviewerNotes, setReviewerNotes] = useState('')
  const [highlightedCheckpointId, setHighlightedCheckpointId] = useState<string | null>(null)
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<WorkspaceCheckpoint | null>(null)
  const queryClient = useQueryClient()

  const checkpointsQuery = useQuery({
    queryKey: ['workspace', 'checkpoints', statusFilter],
    queryFn: () =>
      listWorkspaceCheckpoints(
        statusFilter === 'all' ? undefined : statusFilter,
      ),
  })
  const projectsQuery = useQuery({
    queryKey: ['workspace', 'projects', 'review-queue'],
    queryFn: async () => extractProjects(await apiRequest('/api/workspace/projects')),
    staleTime: 60_000,
  })
  const selectedProject = useMemo(
    () =>
      selectedCheckpoint
        ? (projectsQuery.data ?? []).find(
            (project) => project.name === selectedCheckpoint.project_name,
          ) ?? null
        : null,
    [projectsQuery.data, selectedCheckpoint],
  )
  const selectedProjectDetailQuery = useQuery({
    queryKey: ['workspace', 'project-detail', selectedProject?.id, 'review-queue'],
    enabled: Boolean(selectedProject?.id && selectedCheckpoint),
    queryFn: async () =>
      extractProject(
        await apiRequest(
          `/api/workspace/projects/${encodeURIComponent(selectedProject!.id)}`,
        ),
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
  const projectOptions = useMemo(
    () =>
      Array.from(
        new Set(
          checkpoints
            .map((checkpoint) => checkpoint.project_name)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    [checkpoints],
  )
  const visibleCheckpoints = useMemo(
    () =>
      checkpoints.filter((checkpoint) =>
        projectFilter === 'all' ? true : checkpoint.project_name === projectFilter,
      ),
    [checkpoints, projectFilter],
  )
  const pendingCount = useMemo(
    () =>
      checkpoints.filter((checkpoint) => checkpoint.status === 'pending')
        .length,
    [checkpoints],
  )
  const totalPages = Math.max(1, Math.ceil(visibleCheckpoints.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = visibleCheckpoints.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )
  const startIndex = visibleCheckpoints.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const endIndex = visibleCheckpoints.length === 0
    ? 0
    : Math.min(currentPage * PAGE_SIZE, visibleCheckpoints.length)

  useEffect(() => {
    setPage(1)
  }, [statusFilter, projectFilter])

  useEffect(() => {
    if (visibleCheckpoints.length === 0) {
      setHighlightedCheckpointId(null)
      return
    }

    const hasHighlightedCheckpoint = visibleCheckpoints.some(
      (checkpoint) => checkpoint.id === highlightedCheckpointId,
    )

    if (!hasHighlightedCheckpoint) {
      setHighlightedCheckpointId(visibleCheckpoints[0]?.id ?? null)
    }
  }, [highlightedCheckpointId, visibleCheckpoints])

  useEffect(() => {
    if (!highlightedCheckpointId) return

    const highlightedIndex = visibleCheckpoints.findIndex(
      (checkpoint) => checkpoint.id === highlightedCheckpointId,
    )
    if (highlightedIndex === -1) return

    const nextPage = Math.floor(highlightedIndex / PAGE_SIZE) + 1
    if (nextPage !== page) {
      setPage(nextPage)
    }
  }, [highlightedCheckpointId, page, visibleCheckpoints])

  function handleApprove(checkpointId: string) {
    reviewMutation.mutate({
      checkpointId,
      action: 'approve-and-commit',
    })
  }

  function handleApproveAndMerge(checkpointId: string) {
    reviewMutation.mutate({
      checkpointId,
      action: 'approve-and-merge',
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

  function openCheckpointDetail(checkpoint: WorkspaceCheckpoint) {
    setSelectedCheckpoint(checkpoint)
  }

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false
      const tagName = target.tagName.toLowerCase()
      return (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target.isContentEditable
      )
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (visibleCheckpoints.length === 0) return

      const highlightedIndex = visibleCheckpoints.findIndex(
        (checkpoint) => checkpoint.id === highlightedCheckpointId,
      )
      const currentIndex = highlightedIndex === -1 ? 0 : highlightedIndex
      const currentCheckpoint = visibleCheckpoints[currentIndex]

      if (!currentCheckpoint) return

      if (event.key === 'a') {
        event.preventDefault()
        if (isCheckpointReviewable(currentCheckpoint) && !reviewMutation.isPending) {
          handleApprove(currentCheckpoint.id)
        }
        return
      }

      if (event.key === 'm') {
        event.preventDefault()
        if (isCheckpointReviewable(currentCheckpoint) && !reviewMutation.isPending) {
          handleApproveAndMerge(currentCheckpoint.id)
        }
        return
      }

      if (event.key === 'r') {
        event.preventDefault()
        if (isCheckpointReviewable(currentCheckpoint) && !reviewMutation.isPending) {
          handleOpenComposer(currentCheckpoint.id, 'reject')
        }
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        openCheckpointDetail(currentCheckpoint)
        return
      }

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        const nextCheckpoint =
          visibleCheckpoints[Math.min(currentIndex + 1, visibleCheckpoints.length - 1)]
        if (nextCheckpoint) {
          setHighlightedCheckpointId(nextCheckpoint.id)
        }
        return
      }

      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        const previousCheckpoint = visibleCheckpoints[Math.max(currentIndex - 1, 0)]
        if (previousCheckpoint) {
          setHighlightedCheckpointId(previousCheckpoint.id)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [highlightedCheckpointId, reviewMutation.isPending, visibleCheckpoints])

  return (
    <main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-900 md:px-6 md:pt-8">
      <section className="mx-auto w-full max-w-[1480px]">
        <header className="mb-6 flex flex-col gap-4 rounded-xl border border-primary-200 bg-primary-50/80 px-4 py-4 shadow-sm md:flex-row md:items-center md:justify-between md:px-5">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-accent-500/30 bg-accent-500/10 text-accent-400">
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                size={22}
                strokeWidth={1.6}
              />
            </div>
            <div>
              <h1 className="text-base font-semibold text-primary-900 md:text-lg">
                Review Queue
              </h1>
              <p className="text-sm text-primary-500">
                Triage workspace checkpoints and move execution forward.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-primary-200 bg-white px-3 py-2 text-xs font-medium text-primary-600">
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
                    ? 'border-accent-500/40 bg-accent-500/10 text-accent-400'
                    : 'border-primary-200 bg-white text-primary-600 hover:border-primary-300 hover:bg-primary-50',
                )}
              >
                {filter.label}
              </button>
            )
          })}
        </div>

        <div className="mb-5 rounded-xl border border-primary-200 bg-primary-50/80 px-4 py-3 text-sm text-primary-500 shadow-sm">
          Approving merges agent work into your project. Review the diff before
          approving.
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setProjectFilter('all')}
            className={cn(
              'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
              projectFilter === 'all'
                ? 'border-accent-500/40 bg-accent-500/10 text-accent-400'
                : 'border-primary-200 bg-white text-primary-600 hover:border-primary-300 hover:bg-primary-50',
            )}
          >
            All projects
          </button>
          {projectOptions.map((projectName) => (
            <button
              key={projectName}
              type="button"
              onClick={() => setProjectFilter(projectName)}
              className={cn(
                'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                projectFilter === projectName
                  ? 'border-accent-500/40 bg-accent-500/10 text-accent-400'
                  : 'border-primary-200 bg-white text-primary-600 hover:border-primary-300 hover:bg-primary-50',
              )}
            >
              {projectName}
            </button>
          ))}
        </div>

        {checkpointsQuery.isLoading ? (
          <ReviewQueueSkeleton />
        ) : visibleCheckpoints.length === 0 && checkpoints.length === 0 ? (
          <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/70 px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-xl border border-primary-200 bg-white text-primary-500">
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                size={26}
                strokeWidth={1.5}
              />
            </div>
            <h2 className="text-lg font-semibold text-primary-900">
              No checkpoints waiting
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-primary-500">
              When agents finish a task, their work appears here for your review.
            </p>
          </div>
        ) : visibleCheckpoints.length === 0 ? (
          <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/70 px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-xl border border-primary-200 bg-white text-primary-500">
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                size={26}
                strokeWidth={1.5}
              />
            </div>
            <h2 className="text-lg font-semibold text-primary-900">
              No checkpoints found
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-primary-500">
              There are no checkpoints for the current status and project filters.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1 text-xs text-primary-500">
              <p>Use the keyboard to move through the queue.</p>
              <p>Enter open · a approve · m merge · r reject · j/k navigate</p>
            </div>
            {pageItems.map((checkpoint) => (
              <ReviewRow
                key={checkpoint.id}
                checkpoint={checkpoint}
                composer={composer}
                notes={reviewerNotes}
                isHighlighted={checkpoint.id === highlightedCheckpointId}
                onApprove={handleApprove}
                onOpenDetail={openCheckpointDetail}
                onQuickPreview={setSelectedCheckpoint}
                onHighlight={(nextCheckpoint) => setHighlightedCheckpointId(nextCheckpoint.id)}
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
            <div className="flex flex-col gap-3 rounded-xl border border-primary-200 bg-primary-50/80 px-4 py-3 text-sm text-primary-500 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p>
                Showing {startIndex}-{endIndex} of {visibleCheckpoints.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage === 1}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                    currentPage === 1
                      ? 'cursor-not-allowed border-primary-200 bg-primary-100 text-primary-400'
                      : 'border-primary-200 bg-white text-primary-600 hover:border-primary-300 hover:bg-primary-50',
                  )}
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={currentPage === totalPages}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                    currentPage === totalPages
                      ? 'cursor-not-allowed border-primary-200 bg-primary-100 text-primary-400'
                      : 'border-primary-200 bg-white text-primary-600 hover:border-primary-300 hover:bg-primary-50',
                  )}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <CheckpointDetailModal
        checkpoint={selectedCheckpoint}
        project={selectedProject}
        projectDetail={selectedProjectDetailQuery.data ?? null}
        open={selectedCheckpoint !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedCheckpoint(null)
        }}
        onApprove={(checkpointId, notes, mode) =>
          submitCheckpointReview(
            checkpointId,
            mode ?? 'approve-and-merge',
            notes,
          ).then(async () => {
            await queryClient.invalidateQueries({
              queryKey: ['workspace', 'checkpoints'],
            })
          })
        }
        onRevise={(checkpointId, notes) =>
          submitCheckpointReview(checkpointId, 'revise', notes).then(async () => {
            await queryClient.invalidateQueries({
              queryKey: ['workspace', 'checkpoints'],
            })
          })
        }
        onReject={(checkpointId, notes) =>
          submitCheckpointReview(checkpointId, 'reject', notes).then(async () => {
            await queryClient.invalidateQueries({
              queryKey: ['workspace', 'checkpoints'],
            })
          })
        }
      />
    </main>
  )
}
