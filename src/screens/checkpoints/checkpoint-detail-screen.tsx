import {
  ArrowLeft01Icon,
  ArrowTurnBackwardIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  RefreshIcon,
  Rocket01Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import {
  formatCheckpointStatus,
  formatCheckpointTimestamp,
  getCheckpointDiffStatParsed,
  getWorkspaceCheckpointDetail,
  getWorkspaceCheckpointDiff,
  runWorkspaceCheckpointTsc,
  submitCheckpointReview,
  type CheckpointReviewAction,
  type WorkspaceCheckpointDetail,
  type WorkspaceCheckpointVerificationItem,
} from '@/lib/workspace-checkpoints'
import { cn } from '@/lib/utils'
import { extractProject, type WorkspaceProject, type WorkspaceTask } from '@/screens/projects/lib/workspace-types'
import {
  DetailStat,
  RawDiffViewer,
  SectionHeader,
  formatCost,
  formatDuration,
  formatTokens,
  getStatusTone,
} from '@/screens/projects/checkpoint-detail-modal-parts'
import { AnimatePresence, motion } from 'motion/react'

type ApproveMode = 'approve-and-commit' | 'approve-and-pr'

type CheckpointDetailScreenProps = {
  checkpointId: string
  projectId?: string
  returnTo: 'review' | 'projects' | 'mission'
  onBack: () => void
}

type ReviewMutationPayload = { action: CheckpointReviewAction; notes?: string }

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

async function apiRequest(input: string): Promise<unknown> {
  const response = await fetch(input)
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

function getVerificationTone(status: WorkspaceCheckpointVerificationItem['status']) {
  if (status === 'passed') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  if (status === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-300'
  if (status === 'missing') return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  return 'border-primary-700 bg-primary-800/70 text-primary-400'
}

function getVerificationBadge(status: WorkspaceCheckpointVerificationItem['status']) {
  if (status === 'passed') return '✅ Passed'
  if (status === 'failed') return '❌ Failed'
  if (status === 'missing') return '⚠️ Warning'
  return '⚪ Unknown'
}

function getVerificationCardTone(status: WorkspaceCheckpointVerificationItem['status']) {
  if (status === 'passed') return 'border-emerald-500/30 bg-emerald-500/10'
  if (status === 'failed') return 'border-red-500/30 bg-red-500/10'
  if (status === 'missing') return 'border-amber-500/30 bg-amber-500/10'
  return 'border-primary-700 bg-primary-950/70'
}

function getInlineDiffLineTone(line: string) {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'bg-emerald-500/12 text-emerald-200'
  if (line.startsWith('-') && !line.startsWith('---')) return 'bg-red-500/12 text-red-200'
  if (line.startsWith('@@')) return 'bg-primary-800/90 text-accent-300'
  return 'text-primary-300'
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

export function CheckpointDetailScreen({
  checkpointId,
  projectId,
  returnTo,
  onBack,
}: CheckpointDetailScreenProps) {
  const [reviewNotes, setReviewNotes] = useState('')
  const [approveMode, setApproveMode] = useState<ApproveMode>('approve-and-commit')
  const [reviseOpen, setReviseOpen] = useState(false)
  const [reviseWhat, setReviseWhat] = useState('')
  const [reviseConstraints, setReviseConstraints] = useState('')
  const [reviseAcceptance, setReviseAcceptance] = useState('')
  const [logOpen, setLogOpen] = useState(false)
  const [rawDiffOpen, setRawDiffOpen] = useState(false)
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({})
  const [localTscResult, setLocalTscResult] = useState<WorkspaceCheckpointVerificationItem | null>(
    null,
  )
  const queryClient = useQueryClient()

  useEffect(() => {
    setReviewNotes('')
    setApproveMode('approve-and-commit')
    setReviseOpen(false)
    setReviseWhat('')
    setReviseConstraints('')
    setReviseAcceptance('')
    setLogOpen(false)
    setRawDiffOpen(false)
    setExpandedDiffs({})
    setLocalTscResult(null)
  }, [checkpointId])

  const detailQuery = useQuery({
    queryKey: ['workspace', 'checkpoint-detail', checkpointId],
    enabled: Boolean(checkpointId),
    queryFn: () => getWorkspaceCheckpointDetail(checkpointId),
  })

  useEffect(() => {
    if (!detailQuery.data) return
    setReviewNotes(detailQuery.data.reviewer_notes ?? '')
  }, [detailQuery.data])

  const resolvedProjectId = detailQuery.data?.project_id ?? projectId

  const projectDetailQuery = useQuery({
    queryKey: ['workspace', 'checkpoint-detail', 'project-detail', resolvedProjectId],
    enabled: Boolean(resolvedProjectId),
    queryFn: async () =>
      extractProject(
        await apiRequest(`/api/workspace/projects/${encodeURIComponent(resolvedProjectId!)}`),
      ),
  })

  const rawDiffQuery = useQuery({
    queryKey: ['workspace', 'checkpoint-diff', checkpointId],
    enabled: rawDiffOpen && Boolean(checkpointId),
    queryFn: () => getWorkspaceCheckpointDiff(checkpointId),
    staleTime: 30_000,
  })

  const verifyMutation = useMutation({
    mutationFn: (id: string) => runWorkspaceCheckpointTsc(id),
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
    mutationFn: async ({ action, notes }: ReviewMutationPayload) =>
      submitCheckpointReview(checkpointId, action, notes),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspace', 'checkpoints'] }),
        queryClient.invalidateQueries({ queryKey: ['workspace', 'checkpoint-detail', checkpointId] }),
      ])
      onBack()
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to review checkpoint', {
        type: 'error',
      })
    },
  })

  const detail = detailQuery.data
  const verificationRows = [
    ['tsc', 'TSC', localTscResult ?? detail?.verification.tsc ?? null],
    ['tests', 'Tests', detail?.verification.tests ?? null],
    ['e2e', 'E2E', detail?.verification.e2e ?? null],
  ] as const
  const diffStat = detail ? getCheckpointDiffStatParsed(detail) : null
  const changedFiles = diffStat?.changedFiles ?? []
  const hasInlineDiffs = detail ? detail.diff_files.some((file) => file.patch.trim().length > 0) : false
  const unblocks = useMemo(() => {
    if (!projectDetailQuery.data || !detail?.task_id) return [] as WorkspaceTask[]
    return flattenTasks(projectDetailQuery.data).filter((task) => task.depends_on.includes(detail.task_id!))
  }, [detail?.task_id, projectDetailQuery.data])

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

  const backLabel = returnTo === 'review' ? 'Review Queue' : 'Projects'

  return (
    <div className="min-h-full bg-primary-950 text-primary-100">
      <div className="mx-auto flex min-h-full w-full max-w-[1680px] flex-col px-4 py-5 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex w-fit items-center gap-2 text-sm font-medium text-primary-300 transition-colors hover:text-primary-100"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.8} />
          {backLabel}
        </button>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-primary-800 bg-primary-900/70 shadow-2xl shadow-black/20">
          <div className="border-b border-primary-800 px-5 py-4 md:px-6">
            <h1 className="text-base font-semibold text-primary-100">
              {detail?.task_name ?? 'Checkpoint detail'}
            </h1>
            <p className="text-sm text-primary-400">
              Full review detail before approval, revision, or rejection.
            </p>
          </div>

          {detailQuery.isLoading ? (
            <div className="flex flex-1 items-center justify-center px-6">
              <div className="text-center">
                <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-accent-500 border-r-transparent" />
                <p className="text-sm text-primary-400">Loading checkpoint detail...</p>
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
                    <SectionHeader
                      title="Verification"
                      description="Checkpoint verification state across the configured checks."
                      action={
                        <Button
                          variant="outline"
                          onClick={() => verifyMutation.mutate(checkpointId)}
                          disabled={verifyMutation.isPending}
                        >
                          <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.7} />
                          {verifyMutation.isPending ? 'Running...' : 'Run TSC'}
                        </Button>
                      }
                    />
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {verificationRows.map(([key, label, value]) => {
                        if (!value) return null

                        return (
                          <div
                            key={key}
                            className={cn(
                              'rounded-2xl border px-4 py-3',
                              getVerificationCardTone(value.status),
                            )}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-primary-100">{label}</p>
                              <span
                                className={cn(
                                  'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium',
                                  getVerificationTone(value.status),
                                )}
                              >
                                {getVerificationBadge(value.status)}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-primary-200">{value.label}</p>
                            {value.checked_at ? (
                              <p className="mt-1 text-xs text-primary-400">
                                {formatCheckpointTimestamp(value.checked_at)}
                              </p>
                            ) : null}
                            {value.output ? (
                              <pre className="mt-3 max-h-36 overflow-auto rounded-xl border border-primary-800 bg-primary-950/80 px-3 py-2 font-mono text-[11px] leading-5 text-primary-300">
                                {value.output}
                              </pre>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </section>

                  <section className="rounded-3xl border border-primary-800 bg-primary-800/35 p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-primary-700 bg-primary-950/70 px-3 py-1 text-sm font-medium text-primary-100">
                            {detail.task_name ?? 'Untitled task'}
                          </span>
                          <span className="rounded-full border border-primary-700 bg-primary-950/70 px-3 py-1 text-xs text-primary-300">
                            {detail.id}
                          </span>
                          <span
                            className={cn(
                              'rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.14em]',
                              getStatusTone(detail.status),
                            )}
                          >
                            {formatCheckpointStatus(detail.status)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-primary-300">
                          <span>{detail.agent_name ?? 'Unknown agent'}</span>
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
                            detail.created_at,
                          )}
                        />
                        <DetailStat
                          label="Tokens Used"
                          value={formatTokens(detail.task_run_input_tokens, detail.task_run_output_tokens)}
                        />
                        <DetailStat label="Cost" value={formatCost(detail.task_run_cost_cents)} />
                        <DetailStat label="Created" value={formatCheckpointTimestamp(detail.created_at)} />
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
                      {detail.summary?.trim() || 'No checkpoint summary provided.'}
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
                      title="Files Changed"
                      description={`${detail.diff_files.length} file${detail.diff_files.length === 1 ? '' : 's'} in this checkpoint.`}
                      action={
                        <button
                          type="button"
                          onClick={() => setRawDiffOpen((value) => !value)}
                          className="inline-flex items-center gap-2 text-xs font-medium text-accent-300 hover:text-accent-400"
                        >
                          {rawDiffOpen ? 'Hide diff' : 'Show diff'}
                        </button>
                      }
                    />
                    <p className="mt-3 whitespace-pre-wrap rounded-2xl border border-primary-800 bg-primary-950/60 px-3 py-3 font-mono text-xs leading-5 text-primary-300">
                      {diffStat?.raw ||
                        'No diff stat summary was recorded for this checkpoint.'}
                    </p>
                    <AnimatePresence initial={false}>
                      {rawDiffOpen ? (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4">
                            {rawDiffQuery.isLoading ? (
                              <div className="rounded-2xl border border-primary-800 bg-primary-950/60 px-4 py-8 text-center text-sm text-primary-400">
                                Loading raw diff...
                              </div>
                            ) : rawDiffQuery.isError ? (
                              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-sm text-red-200">
                                {rawDiffQuery.error instanceof Error
                                  ? rawDiffQuery.error.message
                                  : 'Checkpoint diff could not be loaded'}
                              </div>
                            ) : (
                              <RawDiffViewer diff={rawDiffQuery.data?.diff ?? ''} />
                            )}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                    <div className="mt-4 space-y-3">
                      {detail.diff_files.length > 0 && hasInlineDiffs ? (
                        detail.diff_files.map((file) => (
                          <div key={file.path} className="overflow-hidden rounded-2xl border border-primary-800 bg-primary-950/60">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedDiffs((current) => ({ ...current, [file.path]: !current[file.path] }))
                              }
                              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-primary-900/80"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-mono text-sm text-primary-100">{file.path}</p>
                                <div className="mt-1 flex flex-wrap gap-3 text-xs">
                                  <span className="text-emerald-300">+{file.additions ?? 0}</span>
                                  <span className="text-red-300">-{file.deletions ?? 0}</span>
                                  <span className="text-primary-400">
                                    {file.patch.trim() ? 'Inline diff available' : 'Diff not available'}
                                  </span>
                                </div>
                              </div>
                              <span className="shrink-0 text-xs font-medium text-primary-400">
                                {expandedDiffs[file.path] ? 'Hide' : 'Show'}
                              </span>
                            </button>

                            <AnimatePresence initial={false}>
                              {expandedDiffs[file.path] ? (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="overflow-hidden border-t border-primary-800"
                                >
                                  {file.patch.trim() ? (
                                    <div className="overflow-x-auto p-3">
                                      <div className="min-w-full overflow-hidden rounded-xl border border-primary-800 bg-primary-950">
                                        {file.patch.split('\n').map((line, index) => (
                                          <div
                                            key={`${file.path}:${index}`}
                                            className={cn(
                                              'font-mono text-xs leading-5',
                                              getInlineDiffLineTone(line),
                                            )}
                                          >
                                            <div className="min-w-full whitespace-pre px-3 py-0.5">
                                              {line || ' '}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="px-4 py-4 text-sm text-primary-400">
                                      Diff not available for this file.
                                    </div>
                                  )}
                                </motion.div>
                              ) : null}
                            </AnimatePresence>
                          </div>
                        ))
                      ) : detail.diff_files.length > 0 ? (
                        <div className="rounded-2xl border border-dashed border-primary-700 bg-primary-900/40 px-4 py-5">
                          <p className="text-sm font-medium text-primary-100">Diff not available</p>
                          <p className="mt-1 text-sm text-primary-400">
                            This checkpoint includes a diff summary, but no inline patch content was returned by the API.
                          </p>
                          {changedFiles.length > 0 ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {changedFiles.map((path) => (
                                <span
                                  key={path}
                                  className="rounded-full border border-primary-700 bg-primary-950/70 px-3 py-1 font-mono text-xs text-primary-300"
                                >
                                  {path}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
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
                      <Button variant="outline" onClick={onBack}>
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
      </div>
    </div>
  )
}
