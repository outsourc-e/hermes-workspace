import {
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
  getWorkspaceCheckpointDetail,
  runWorkspaceCheckpointTsc,
  type CheckpointReviewAction,
  type WorkspaceCheckpoint,
  type WorkspaceCheckpointDetail,
  type WorkspaceCheckpointVerificationItem,
} from '@/lib/workspace-checkpoints'
import { cn } from '@/lib/utils'
import { AnimatePresence, motion } from 'motion/react'
import type { WorkspaceProject, WorkspaceTask } from './lib/workspace-types'
import {
  DetailStat,
  FileDiffCard,
  SectionHeader,
  formatCost,
  formatDuration,
  formatTokens,
  getStatusTone,
} from './checkpoint-detail-modal-parts'

type ApproveMode = 'approve-and-commit' | 'approve-and-pr'

type CheckpointDetailModalProps = {
  checkpoint: WorkspaceCheckpoint | null
  project: WorkspaceProject | null
  projectDetail: WorkspaceProject | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onApprove: (checkpointId: string, notes?: string, mode?: ApproveMode) => Promise<void>
  onRevise: (checkpointId: string, notes: string) => Promise<void>
  onReject: (checkpointId: string, notes?: string) => Promise<void>
}

type ReviewMutationPayload = { action: CheckpointReviewAction; notes?: string }

function getVerificationTone(status: WorkspaceCheckpointVerificationItem['status']) {
  if (status === 'passed') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  if (status === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-300'
  if (status === 'missing') return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  return 'border-primary-700 bg-primary-800/70 text-primary-400'
}

function getVerificationGlyph(status: WorkspaceCheckpointVerificationItem['status']) {
  if (status === 'passed') return 'PASS'
  if (status === 'failed') return 'FAIL'
  if (status === 'missing') return 'MISS'
  return 'N/A'
}

function getRunEventText(event: WorkspaceCheckpointDetail['run_events'][number]) {
  if (event.text.trim()) return event.text
  if (!event.data) return 'No payload'
  if (typeof event.data.message === 'string' && Object.keys(event.data).length === 1) {
    return event.data.message
  }
  return JSON.stringify(event.data, null, 2)
}

function flattenTasks(project: WorkspaceProject | null) {
  return project?.phases.flatMap((phase) => phase.missions.flatMap((mission) => mission.tasks)) ?? []
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
  const [logOpen, setLogOpen] = useState(false)
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({})
  const [localTscResult, setLocalTscResult] = useState<WorkspaceCheckpointVerificationItem | null>(
    null,
  )

  useEffect(() => {
    if (!open || !checkpoint) return
    setReviewNotes(checkpoint.reviewer_notes ?? '')
    setApproveMode('approve-and-commit')
    setReviseOpen(false)
    setReviseWhat('')
    setReviseConstraints('')
    setReviseAcceptance('')
    setLogOpen(false)
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
      toast(result.status === 'passed' ? 'TypeScript check passed' : 'TypeScript check failed', {
        type: result.status === 'passed' ? 'success' : 'warning',
      })
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to run TypeScript check', {
        type: 'error',
      })
    },
  })

  const reviewMutation = useMutation({
    mutationFn: async ({ action, notes }: ReviewMutationPayload) => {
      if (!checkpoint) return
      if (action === 'reject') return onReject(checkpoint.id, notes)
      if (action === 'revise') return onRevise(checkpoint.id, notes ?? '')
      return onApprove(
        checkpoint.id,
        notes,
        action === 'approve-and-pr' ? 'approve-and-pr' : 'approve-and-commit',
      )
    },
    onSuccess: () => onOpenChange(false),
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to review checkpoint', {
        type: 'error',
      })
    },
  })

  const detail = detailQuery.data
  const currentProject =
    projectDetail && detail?.project_id === projectDetail.id ? projectDetail : project
  const verificationRows = [
    ['tsc', 'TypeScript', localTscResult ?? detail?.verification.tsc ?? null],
    ['tests', 'Tests', detail?.verification.tests ?? null],
    ['lint', 'Lint', detail?.verification.lint ?? null],
    ['e2e', 'E2E', detail?.verification.e2e ?? null],
  ] as const
  const unblocks = useMemo(() => {
    if (!currentProject || !detail?.task_id) return [] as WorkspaceTask[]
    return flattenTasks(currentProject).filter((task) => task.depends_on.includes(detail.task_id!))
  }, [currentProject, detail?.task_id])

  async function handleApprove() {
    await reviewMutation.mutateAsync({ action: approveMode, notes: reviewNotes.trim() || undefined })
  }

  async function handleReject() {
    await reviewMutation.mutateAsync({ action: 'reject', notes: reviewNotes.trim() || undefined })
  }

  async function handleRevise() {
    if (!reviseWhat.trim()) {
      toast('Revision guidance is required', { type: 'warning' })
      return
    }
    const notes = [
      `What to change:\n${reviseWhat.trim()}`,
      reviseConstraints.trim() ? `Constraints:\n${reviseConstraints.trim()}` : '',
      reviseAcceptance.trim() ? `Acceptance test:\n${reviseAcceptance.trim()}` : '',
      reviewNotes.trim() ? `Reviewer notes:\n${reviewNotes.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
    await reviewMutation.mutateAsync({ action: 'revise', notes })
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(92dvh,920px)] w-[min(1120px,96vw)] max-w-none overflow-hidden rounded-2xl border-primary-200 bg-primary-50 p-0 text-primary-900 shadow-2xl max-md:bottom-0 max-md:left-0 max-md:h-[92dvh] max-md:w-screen max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-2xl max-md:top-auto">
        <div className="flex h-full flex-col">
          <div className="border-b border-primary-200 px-5 py-4 md:px-6">
            <DialogTitle className="text-base font-semibold text-primary-900">
              {checkpoint?.task_name ?? 'Checkpoint detail'}
            </DialogTitle>
            <DialogDescription className="text-sm text-primary-500">
              Full review detail before approval, revision, or rejection.
            </DialogDescription>
          </div>

          {!checkpoint ? null : detailQuery.isLoading ? (
            <div className="flex flex-1 items-center justify-center px-6">
              <div className="text-center">
                <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-accent-500 border-r-transparent" />
                <p className="text-sm text-primary-500">Loading checkpoint detail...</p>
              </div>
            </div>
          ) : detailQuery.isError || !detail ? (
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
                  <section className="rounded-3xl border border-primary-800 bg-primary-800/35 p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-primary-700 bg-primary-950/70 px-3 py-1 text-sm font-medium text-primary-100">
                            {checkpoint.task_name ?? 'Untitled task'}
                          </span>
                          <span className="rounded-full border border-primary-700 bg-primary-950/70 px-3 py-1 text-xs text-primary-300">
                            {checkpoint.id}
                          </span>
                          <span
                            className={cn(
                              'rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.14em]',
                              getStatusTone(checkpoint.status),
                            )}
                          >
                            {formatCheckpointStatus(checkpoint.status)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-primary-300">
                          <span>{checkpoint.agent_name ?? 'Unknown agent'}</span>
                          <span className="rounded-full border border-primary-700 bg-primary-950/70 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-primary-300">
                            {detail.agent_model ?? detail.agent_adapter_type ?? 'Model unavailable'}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <DetailStat
                          label="Duration"
                          value={formatDuration(
                            detail.task_run_started_at,
                            detail.task_run_completed_at,
                            checkpoint.created_at,
                          )}
                        />
                        <DetailStat
                          label="Tokens Used"
                          value={formatTokens(detail.task_run_input_tokens, detail.task_run_output_tokens)}
                        />
                        <DetailStat label="Cost" value={formatCost(detail.task_run_cost_cents)} />
                        <DetailStat label="Created" value={formatCheckpointTimestamp(checkpoint.created_at)} />
                      </div>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-primary-800 bg-primary-800/35 p-4">
                    <SectionHeader
                      title="Summary"
                      description="AI-generated summary of the work and the full agent log."
                      action={
                        <button
                          type="button"
                          onClick={() => setLogOpen((value) => !value)}
                          className="inline-flex items-center gap-2 text-xs font-medium text-accent-300 hover:text-accent-400"
                        >
                          {logOpen ? 'Hide full agent log' : 'Show full agent log'}
                        </button>
                      }
                    />
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-primary-200">
                      {checkpoint.summary?.trim() || 'No checkpoint summary provided.'}
                    </p>

                    <AnimatePresence initial={false}>
                      {logOpen ? (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4 space-y-3 border-t border-primary-800 pt-4">
                            {detail.run_events.length > 0 ? (
                              detail.run_events.map((event) => (
                                <div key={event.id} className="rounded-2xl border border-primary-800 bg-primary-950/70 p-3">
                                  <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-primary-500">
                                    <span>{event.type}</span>
                                    <span className="inline-flex items-center gap-1">
                                      <HugeiconsIcon icon={Clock01Icon} size={12} strokeWidth={1.8} />
                                      {formatCheckpointTimestamp(event.created_at)}
                                    </span>
                                  </div>
                                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-primary-300">
                                    {getRunEventText(event)}
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

                  <section className="rounded-3xl border border-primary-800 bg-primary-800/35 p-4">
                    <SectionHeader
                      title="Verification Matrix"
                      description="TypeScript can run now. Tests, lint, and e2e remain placeholders until configured."
                      action={
                        <Button
                          variant="outline"
                          onClick={() => verifyMutation.mutate(checkpoint.id)}
                          disabled={verifyMutation.isPending}
                        >
                          <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.7} />
                          {verifyMutation.isPending ? 'Running...' : 'Run missing checks'}
                        </Button>
                      }
                    />
                    <div className="mt-4 grid gap-3">
                      {verificationRows.map(([key, label, value]) => (
                        <div
                          key={key}
                          className="grid gap-3 rounded-2xl border border-primary-800 bg-primary-950/60 px-3 py-3 md:grid-cols-[minmax(0,1fr)_120px_minmax(0,2fr)] md:items-start"
                        >
                          <div className="flex items-center gap-2 text-sm text-primary-100">
                            <HugeiconsIcon icon={Task01Icon} size={14} strokeWidth={1.7} />
                            {label}
                          </div>
                          <span
                            className={cn(
                              'inline-flex w-fit rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em]',
                              getVerificationTone(value?.status ?? 'missing'),
                            )}
                          >
                            {getVerificationGlyph(value?.status ?? 'missing')}
                          </span>
                          <div className="text-xs text-primary-400">
                            <p>{value?.label ?? 'Missing'}</p>
                            {value?.checked_at ? <p className="mt-1">{formatCheckpointTimestamp(value.checked_at)}</p> : null}
                            {value?.output ? (
                              <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded-xl border border-primary-800 bg-primary-900 px-3 py-2 font-mono text-[11px] leading-5 text-primary-300">
                                {value.output}
                              </pre>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-3xl border border-primary-800 bg-primary-800/35 p-4">
                    <SectionHeader
                      title="Files Changed"
                      description={`${detail.diff_files.length} file${detail.diff_files.length === 1 ? '' : 's'} in this checkpoint. Expand a file to inspect its inline diff.`}
                    />
                    <div className="mt-4 space-y-3">
                      {detail.diff_files.length > 0 ? (
                        detail.diff_files.map((file) => (
                          <FileDiffCard
                            key={file.path}
                            path={file.path}
                            additions={file.additions}
                            deletions={file.deletions}
                            patch={file.patch}
                            expanded={expandedDiffs[file.path] ?? false}
                            onToggle={() =>
                              setExpandedDiffs((current) => ({ ...current, [file.path]: !current[file.path] }))
                            }
                          />
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-primary-700 bg-primary-900/40 px-4 py-8 text-center text-sm text-primary-400">
                          No changed files were recorded for this checkpoint.
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="rounded-3xl border border-primary-800 bg-primary-800/35 p-4">
                    <SectionHeader
                      title="Unblocks"
                      description="Approving this will unblock dependent tasks in the same project."
                    />
                    {unblocks.length > 0 ? (
                      <>
                        <p className="mt-3 text-sm text-primary-200">
                          Approving this will unblock: {unblocks.map((task) => task.name).join(', ')}
                        </p>
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
                      </>
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
