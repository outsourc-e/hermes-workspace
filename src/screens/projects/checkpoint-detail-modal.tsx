import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowTurnBackwardIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  RefreshIcon,
  Rocket01Icon,
  Task01Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import {
  formatCheckpointStatus,
  formatCheckpointTimestamp,
  getCheckpointStatusBadgeClass,
  getWorkspaceCheckpointDetail,
  runWorkspaceCheckpointTsc,
  type CheckpointReviewAction,
  type WorkspaceCheckpoint,
  type WorkspaceCheckpointVerificationItem,
} from '@/lib/workspace-checkpoints'
import { cn } from '@/lib/utils'
import { AnimatePresence, motion } from 'motion/react'
import type { WorkspaceProject } from './lib/workspace-types'

type ApproveMode = 'approve-and-commit' | 'approve-and-pr'

type CheckpointDetailModalProps = {
  checkpoint: WorkspaceCheckpoint | null
  project: WorkspaceProject | null
  projectDetail: WorkspaceProject | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onApprove: (
    checkpointId: string,
    notes?: string,
    mode?: ApproveMode,
  ) => Promise<void>
  onRevise: (checkpointId: string, notes: string) => Promise<void>
  onReject: (checkpointId: string, notes?: string) => Promise<void>
}

function formatDuration(
  startedAt: string | null,
  completedAt: string | null,
  createdAt: string,
): string {
  const start = startedAt ? new Date(startedAt) : new Date(createdAt)
  const end = completedAt ? new Date(completedAt) : new Date(createdAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Unavailable'
  const durationMs = Math.max(0, end.getTime() - start.getTime())
  if (durationMs < 1_000) return '<1s'
  if (durationMs < 60_000) return `${Math.round(durationMs / 1_000)}s`
  if (durationMs < 3_600_000) return `${Math.round(durationMs / 60_000)}m`
  const hours = Math.floor(durationMs / 3_600_000)
  const minutes = Math.round((durationMs % 3_600_000) / 60_000)
  return `${hours}h ${minutes}m`
}

function formatTokens(inputTokens: number | null, outputTokens: number | null): string {
  const total = (inputTokens ?? 0) + (outputTokens ?? 0)
  if (total <= 0) return 'Unavailable'
  return new Intl.NumberFormat().format(total)
}

function formatCost(costCents: number | null): string {
  if (costCents === null || !Number.isFinite(costCents)) return 'Unavailable'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
  }).format(costCents / 100)
}

function formatEventPayload(data: Record<string, unknown> | null): string {
  if (!data) return 'No payload'
  if (typeof data.message === 'string' && Object.keys(data).length === 1) {
    return data.message
  }
  return JSON.stringify(data, null, 2)
}

function getVerificationTone(status: WorkspaceCheckpointVerificationItem['status']): string {
  if (status === 'passed') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  if (status === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-300'
  if (status === 'missing') return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  return 'border-primary-700 bg-primary-800/60 text-primary-400'
}

function getVerificationSymbol(status: WorkspaceCheckpointVerificationItem['status']): string {
  if (status === 'passed') return 'PASS'
  if (status === 'failed') return 'FAIL'
  if (status === 'missing') return 'MISS'
  return 'N/A'
}

function getDiffLineClass(line: string): string {
  if (line.startsWith('+')) return 'text-emerald-300'
  if (line.startsWith('-')) return 'text-red-300'
  if (line.startsWith('@@')) return 'text-accent-300'
  return 'text-primary-300'
}

export function CheckpointDetailModal({
  checkpoint,
  project,
  projectDetail,
  open,
  onOpenChange,
  onApprove,
  onRevise,
  onReject,
}: CheckpointDetailModalProps) {
  const [reviewNotes, setReviewNotes] = useState('')
  const [approveMode, setApproveMode] = useState<ApproveMode>('approve-and-commit')
  const [reviseOpen, setReviseOpen] = useState(false)
  const [reviseWhat, setReviseWhat] = useState('')
  const [reviseConstraints, setReviseConstraints] = useState('')
  const [reviseAcceptance, setReviseAcceptance] = useState('')
  const [expandedLog, setExpandedLog] = useState(false)
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({})
  const [localTscResult, setLocalTscResult] =
    useState<WorkspaceCheckpointVerificationItem | null>(null)

  useEffect(() => {
    if (!open || !checkpoint) return
    setReviewNotes(checkpoint.reviewer_notes ?? '')
    setApproveMode('approve-and-commit')
    setReviseOpen(false)
    setReviseWhat('')
    setReviseConstraints('')
    setReviseAcceptance('')
    setExpandedLog(false)
    setExpandedDiffs({})
    setLocalTscResult(null)
  }, [checkpoint, open])

  const detailQuery = useQuery({
    queryKey: ['workspace', 'checkpoint-detail', checkpoint?.id],
    enabled: open && Boolean(checkpoint?.id),
    queryFn: () => getWorkspaceCheckpointDetail(checkpoint!.id),
  })

  const verifyMutation = useMutation({
    mutationFn: (checkpointId: string) => runWorkspaceCheckpointTsc(checkpointId),
    onSuccess: (result) => {
      setLocalTscResult(result)
      toast(
        result.status === 'passed'
          ? 'TypeScript check passed'
          : 'TypeScript check failed',
        { type: result.status === 'passed' ? 'success' : 'warning' },
      )
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to run TypeScript check', {
        type: 'error',
      })
    },
  })

  const reviewMutation = useMutation({
    mutationFn: async ({
      action,
      notes,
    }: {
      action: CheckpointReviewAction
      notes?: string
    }) => {
      if (!checkpoint) return
      if (action === 'reject') {
        await onReject(checkpoint.id, notes)
        return
      }
      if (action === 'revise') {
        await onRevise(checkpoint.id, notes ?? '')
        return
      }
      await onApprove(
        checkpoint.id,
        notes,
        action === 'approve-and-pr' ? 'approve-and-pr' : 'approve-and-commit',
      )
    },
    onSuccess: () => {
      onOpenChange(false)
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to review checkpoint', {
        type: 'error',
      })
    },
  })

  const detail = detailQuery.data
  const detailRecord = detail
  const tscResult = localTscResult
  const currentProject =
    projectDetail && detailRecord?.project_id === projectDetail.id
      ? projectDetail
      : project
  const unblocks = useMemo(() => {
    if (!currentProject || !detailRecord?.task_id) return []
    return currentProject.phases.flatMap((phase) =>
      phase.missions.flatMap((mission) =>
        mission.tasks.filter((task) => task.depends_on.includes(detailRecord.task_id!)),
      ),
    )
  }, [currentProject, detailRecord?.task_id])

  const verificationItems = [
    { key: 'tsc', label: 'TypeScript', value: tscResult },
    {
      key: 'tests',
      label: 'Tests',
      value: {
        status: 'not_configured',
        label: 'Not configured',
        output: null,
        checked_at: null,
      } satisfies WorkspaceCheckpointVerificationItem,
    },
    {
      key: 'lint',
      label: 'Lint',
      value: {
        status: 'not_configured',
        label: 'Not configured',
        output: null,
        checked_at: null,
      } satisfies WorkspaceCheckpointVerificationItem,
    },
    {
      key: 'e2e',
      label: 'E2E',
      value: {
        status: 'not_configured',
        label: 'Not configured',
        output: null,
        checked_at: null,
      } satisfies WorkspaceCheckpointVerificationItem,
    },
  ]

  async function handleApprove() {
    await reviewMutation.mutateAsync({
      action: approveMode,
      notes: reviewNotes.trim() || undefined,
    })
  }

  async function handleReject() {
    await reviewMutation.mutateAsync({
      action: 'reject',
      notes: reviewNotes.trim() || undefined,
    })
  }

  async function handleRevise() {
    const segments = [
      reviseWhat.trim() ? `What to change:\n${reviseWhat.trim()}` : '',
      reviseConstraints.trim() ? `Constraints:\n${reviseConstraints.trim()}` : '',
      reviseAcceptance.trim() ? `Acceptance test:\n${reviseAcceptance.trim()}` : '',
      reviewNotes.trim() ? `Reviewer notes:\n${reviewNotes.trim()}` : '',
    ].filter(Boolean)

    if (!reviseWhat.trim()) {
      toast('Revision guidance is required', { type: 'warning' })
      return
    }

    await reviewMutation.mutateAsync({
      action: 'revise',
      notes: segments.join('\n\n'),
    })
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(92dvh,920px)] w-[min(1120px,96vw)] max-w-none overflow-hidden rounded-3xl border-primary-700 bg-primary-900 p-0 text-primary-100 shadow-2xl max-md:bottom-0 max-md:left-0 max-md:h-[92dvh] max-md:w-screen max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-3xl max-md:top-auto">
        <div className="flex h-full flex-col">
          <div className="border-b border-primary-800 px-5 py-4 md:px-6">
            <DialogTitle className="text-base font-semibold text-primary-100">
              {checkpoint?.task_name ?? 'Checkpoint detail'}
            </DialogTitle>
            <DialogDescription className="text-sm text-primary-400">
              Review task handoff details, verification status, and file-level diffs.
            </DialogDescription>
          </div>

          {!checkpoint ? null : detailQuery.isLoading ? (
            <div className="flex flex-1 items-center justify-center px-6">
              <div className="text-center">
                <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-accent-500 border-r-transparent" />
                <p className="text-sm text-primary-400">Loading checkpoint detail...</p>
              </div>
            </div>
          ) : detailQuery.isError || !detailRecord ? (
            <div className="flex flex-1 items-center justify-center px-6">
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-center text-sm text-red-200">
                {detailQuery.error instanceof Error
                  ? detailQuery.error.message
                  : 'Checkpoint detail could not be loaded'}
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6">
                <div className="space-y-5 pb-28">
                  <section className="rounded-2xl border border-primary-800 bg-primary-800/35 p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-primary-700 bg-primary-900/70 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-primary-300">
                            {checkpoint.task_name ?? 'Untitled task'}
                          </span>
                          <span className="rounded-full border border-primary-700 bg-primary-900/70 px-2.5 py-1 text-[11px] font-medium text-primary-300">
                            {checkpoint.id}
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
                        <div className="flex flex-wrap items-center gap-2 text-sm text-primary-300">
                          <span>{checkpoint.agent_name ?? 'Unknown agent'}</span>
                          <span className="rounded-full border border-primary-700 bg-primary-900/80 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-primary-300">
                            {detailRecord.agent_model ?? detailRecord.agent_adapter_type ?? 'Model unavailable'}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-primary-800 bg-primary-900/60 px-3 py-2.5">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-primary-500">Duration</p>
                          <p className="mt-1 text-primary-200">
                            {formatDuration(
                              detailRecord.task_run_started_at,
                              detailRecord.task_run_completed_at,
                              checkpoint.created_at,
                            )}
                          </p>
                        </div>
                        <div className="rounded-xl border border-primary-800 bg-primary-900/60 px-3 py-2.5">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-primary-500">Tokens</p>
                          <p className="mt-1 text-primary-200">
                            {formatTokens(
                              detailRecord.task_run_input_tokens,
                              detailRecord.task_run_output_tokens,
                            )}
                          </p>
                        </div>
                        <div className="rounded-xl border border-primary-800 bg-primary-900/60 px-3 py-2.5">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-primary-500">Cost</p>
                          <p className="mt-1 text-primary-200">{formatCost(detailRecord.task_run_cost_cents)}</p>
                        </div>
                        <div className="rounded-xl border border-primary-800 bg-primary-900/60 px-3 py-2.5">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-primary-500">Created</p>
                          <p className="mt-1 text-primary-200">
                            {formatCheckpointTimestamp(checkpoint.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-primary-800 bg-primary-800/35 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-primary-100">Summary</h3>
                        <p className="text-xs text-primary-400">
                          AI-generated summary and the full task-run event log.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedLog((value) => !value)}
                        className="inline-flex items-center gap-2 text-xs font-medium text-accent-300 hover:text-accent-400"
                      >
                        <HugeiconsIcon
                          icon={expandedLog ? ArrowDown01Icon : ArrowRight01Icon}
                          size={14}
                          strokeWidth={1.8}
                        />
                        {expandedLog ? 'Hide full agent log' : 'Show full agent log'}
                      </button>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-primary-200">
                      {checkpoint.summary?.trim() || 'No checkpoint summary provided.'}
                    </p>

                    <AnimatePresence initial={false}>
                      {expandedLog ? (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4 space-y-3 border-t border-primary-800 pt-4">
                            {detail.run_events.length > 0 ? (
                              detail.run_events.map((event) => (
                                <div
                                  key={event.id}
                                  className="rounded-xl border border-primary-800 bg-primary-900/70 p-3"
                                >
                                  <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-primary-500">
                                    <span>{event.type}</span>
                                    <span className="inline-flex items-center gap-1">
                                      <HugeiconsIcon
                                        icon={Clock01Icon}
                                        size={12}
                                        strokeWidth={1.8}
                                      />
                                      {formatCheckpointTimestamp(event.created_at)}
                                    </span>
                                  </div>
                                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-primary-300">
                                    {formatEventPayload(event.data)}
                                  </pre>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-primary-400">No run events were recorded.</p>
                            )}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </section>

                  <section className="rounded-2xl border border-primary-800 bg-primary-800/35 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-primary-100">Verification Matrix</h3>
                        <p className="text-xs text-primary-400">
                          TypeScript is runnable now. Other checks are placeholders until configured.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => checkpoint && verifyMutation.mutate(checkpoint.id)}
                        disabled={verifyMutation.isPending}
                      >
                        <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.7} />
                        {verifyMutation.isPending ? 'Running...' : 'Run missing checks'}
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-3">
                      {verificationItems.map((item) => (
                        <div
                          key={item.key}
                          className="grid gap-3 rounded-xl border border-primary-800 bg-primary-900/60 px-3 py-3 md:grid-cols-[minmax(0,1fr)_180px_minmax(0,2fr)] md:items-center"
                        >
                          <div className="flex items-center gap-2 text-sm text-primary-200">
                            <HugeiconsIcon icon={Task01Icon} size={14} strokeWidth={1.7} />
                            {item.label}
                          </div>
                          <span
                            className={cn(
                              'inline-flex w-fit rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em]',
                              item.value ? getVerificationTone(item.value.status) : getVerificationTone('missing'),
                            )}
                          >
                            {item.value ? getVerificationSymbol(item.value.status) : 'MISS'}
                          </span>
                          <div className="text-xs text-primary-400">
                            <p>{item.value?.label ?? 'Missing'}</p>
                            {item.value?.checked_at ? (
                              <p className="mt-1">{formatCheckpointTimestamp(item.value.checked_at)}</p>
                            ) : null}
                            {item.value?.output ? (
                              <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-primary-800 bg-primary-900 px-2 py-2 font-mono text-[11px] leading-5 text-primary-300">
                                {item.value.output}
                              </pre>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-primary-800 bg-primary-800/35 p-4">
                    <div>
                      <h3 className="text-sm font-semibold text-primary-100">Files Changed</h3>
                      <p className="text-xs text-primary-400">
                        Expand a file to inspect its inline diff.
                      </p>
                    </div>

                    <div className="mt-4 space-y-3">
                      {detail.diff_files.length > 0 ? (
                        detail.diff_files.map((fileDiff) => {
                          const expanded = expandedDiffs[fileDiff.path] ?? false
                          return (
                            <div
                              key={fileDiff.path}
                              className="rounded-xl border border-primary-800 bg-primary-900/60"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedDiffs((current) => ({
                                    ...current,
                                    [fileDiff.path]: !current[fileDiff.path],
                                  }))
                                }
                                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                              >
                                <div className="min-w-0">
                                  <p className="truncate font-mono text-sm text-primary-200">
                                    {fileDiff.path}
                                  </p>
                                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-primary-500">
                                    {fileDiff.additions !== null || fileDiff.deletions !== null ? (
                                      <>
                                        <span className="text-emerald-300">
                                          +{fileDiff.additions ?? 0}
                                        </span>
                                        <span className="text-red-300">
                                          -{fileDiff.deletions ?? 0}
                                        </span>
                                      </>
                                    ) : null}
                                    <span>
                                      {fileDiff.patch ? 'Diff available' : 'Diff unavailable'}
                                    </span>
                                  </div>
                                </div>
                                <HugeiconsIcon
                                  icon={expanded ? ArrowDown01Icon : ArrowRight01Icon}
                                  size={16}
                                  strokeWidth={1.8}
                                  className="shrink-0 text-primary-400"
                                />
                              </button>

                              <AnimatePresence initial={false}>
                                {expanded ? (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="border-t border-primary-800 px-3 py-3">
                                      {fileDiff.patch ? (
                                        <pre className="overflow-x-auto rounded-xl border border-primary-800 bg-primary-950/80 p-3 font-mono text-xs leading-5">
                                          {fileDiff.patch.split('\n').map((line: string, index: number) => (
                                            <div key={`${fileDiff.path}:${index}`} className={getDiffLineClass(line)}>
                                              {line || ' '}
                                            </div>
                                          ))}
                                        </pre>
                                      ) : (
                                        <p className="text-sm text-primary-400">
                                          No diff content was available for this file.
                                        </p>
                                      )}
                                    </div>
                                  </motion.div>
                                ) : null}
                              </AnimatePresence>
                            </div>
                          )
                        })
                      ) : (
                        <div className="rounded-xl border border-dashed border-primary-700 bg-primary-900/40 px-4 py-8 text-center text-sm text-primary-400">
                          No changed files were recorded for this checkpoint.
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-primary-800 bg-primary-800/35 p-4">
                    <h3 className="text-sm font-semibold text-primary-100">Unblocks</h3>
                    <p className="mt-1 text-xs text-primary-400">
                      Approving this will unblock dependent tasks in the same project.
                    </p>
                    {unblocks.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {unblocks.map((task) => (
                          <span
                            key={task.id}
                            className="rounded-full border border-accent-500/30 bg-accent-500/10 px-3 py-1 text-xs text-accent-300"
                          >
                            {task.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-primary-400">
                        No dependent tasks were found from the loaded project detail.
                      </p>
                    )}
                  </section>
                </div>
              </div>

              <div className="border-t border-primary-800 bg-primary-900/96 px-5 py-4 backdrop-blur md:px-6">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                  <div className="space-y-3">
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.14em] text-primary-500">
                        Reviewer Notes
                      </span>
                      <textarea
                        value={reviewNotes}
                        onChange={(event) => setReviewNotes(event.target.value)}
                        rows={3}
                        className="w-full rounded-2xl border border-primary-700 bg-primary-950/80 px-4 py-3 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
                        placeholder="Add review context, concerns, or merge notes..."
                      />
                    </label>

                    <AnimatePresence initial={false}>
                      {reviseOpen ? (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                            <label className="block">
                              <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.14em] text-amber-300">
                                What To Change
                              </span>
                              <textarea
                                value={reviseWhat}
                                onChange={(event) => setReviseWhat(event.target.value)}
                                rows={3}
                                className="w-full rounded-xl border border-primary-700 bg-primary-950/80 px-3 py-2.5 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
                                placeholder="Required. Describe the exact revision needed."
                              />
                            </label>
                            <label className="block">
                              <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.14em] text-amber-300">
                                Constraints
                              </span>
                              <textarea
                                value={reviseConstraints}
                                onChange={(event) => setReviseConstraints(event.target.value)}
                                rows={2}
                                className="w-full rounded-xl border border-primary-700 bg-primary-950/80 px-3 py-2.5 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
                                placeholder="Optional. Guardrails the agent must follow."
                              />
                            </label>
                            <label className="block">
                              <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.14em] text-amber-300">
                                Acceptance Test
                              </span>
                              <textarea
                                value={reviseAcceptance}
                                onChange={(event) => setReviseAcceptance(event.target.value)}
                                rows={2}
                                className="w-full rounded-xl border border-primary-700 bg-primary-950/80 px-3 py-2.5 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
                                placeholder="Optional. Define how the revision should be validated."
                              />
                            </label>
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>

                  <div className="flex flex-col justify-between gap-3">
                    <div className="rounded-2xl border border-primary-800 bg-primary-950/70 p-4">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary-500">
                        Approve Mode
                      </p>
                      <select
                        value={approveMode}
                        onChange={(event) => setApproveMode(event.target.value as ApproveMode)}
                        className="mt-2 w-full rounded-xl border border-primary-700 bg-primary-900 px-3 py-2.5 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
                      >
                        <option value="approve-and-commit">Approve &amp; Commit</option>
                        <option value="approve-and-pr">Approve &amp; Open PR</option>
                      </select>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Review Later
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setReviseOpen((value) => !value)}
                        disabled={reviewMutation.isPending}
                        className="border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15"
                      >
                        <HugeiconsIcon icon={ArrowTurnBackwardIcon} size={14} strokeWidth={1.8} />
                        {reviseOpen ? 'Hide Revise Panel' : 'Revise'}
                      </Button>
                      {reviseOpen ? (
                        <Button
                          onClick={() => void handleRevise()}
                          disabled={reviewMutation.isPending}
                          className="bg-amber-500 text-white hover:bg-amber-400"
                        >
                          <HugeiconsIcon icon={Rocket01Icon} size={14} strokeWidth={1.8} />
                          {reviewMutation.isPending ? 'Submitting...' : 'Send Revision Request'}
                        </Button>
                      ) : null}
                      <Button
                        onClick={() => void handleReject()}
                        disabled={reviewMutation.isPending}
                        className="bg-red-600 text-white hover:bg-red-500"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />
                        {reviewMutation.isPending ? 'Submitting...' : 'Reject'}
                      </Button>
                      <Button
                        onClick={() => void handleApprove()}
                        disabled={reviewMutation.isPending}
                        className="bg-accent-500 text-white hover:bg-accent-400"
                      >
                        <HugeiconsIcon
                          icon={approveMode === 'approve-and-pr' ? Tick02Icon : CheckmarkCircle02Icon}
                          size={14}
                          strokeWidth={1.8}
                        />
                        {reviewMutation.isPending
                          ? 'Submitting...'
                          : approveMode === 'approve-and-pr'
                            ? 'Approve & Open PR'
                            : 'Approve & Commit'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
