'use client'

import { useEffect, useMemo, useState } from 'react'
import { AgentProgress } from '@/components/agent-view/agent-progress'
import { PixelAvatar } from '@/components/agent-swarm/pixel-avatar'
import { cn } from '@/lib/utils'

type ReportState = 'all' | 'needs_review' | 'ready' | 'blocked' | 'in_progress' | 'artifact'
type ReportLayout = 'board' | 'cards' | 'list'

type RuntimeArtifact = {
  id: string
  kind: string
  label: string
  path?: string | null
  updatedAt?: number | null
  source?: string | null
}

type RuntimePreview = {
  id: string
  label: string
  url: string
  status?: string | null
  updatedAt?: number | null
}

type RuntimeReportEntry = {
  workerId: string
  displayName?: string | null
  role?: string | null
  currentTask?: string | null
  lastOutputAt?: number | null
  lastSessionStartedAt?: number | null
  lastSummary?: string | null
  lastRealSummary?: string | null
  lastResult?: string | null
  lastRealResult?: string | null
  blockedReason?: string | null
  checkpointStatus?: string | null
  needsHuman?: boolean | null
  recentLogTail?: string | null
  artifacts?: Array<RuntimeArtifact>
  previews?: Array<RuntimePreview>
}

type MissionCheckpoint = {
  stateLabel?: string | null
  checkpointStatus?: string | null
  runtimeState?: string | null
  filesChanged?: string | null
  commandsRun?: string | null
  result?: string | null
  blocker?: string | null
  nextAction?: string | null
}

type MissionAssignment = {
  id?: string
  workerId?: string
  task?: string
  state?: string
  reviewRequired?: boolean
  reviewedAt?: number | null
  reviewedBy?: string | null
  completedAt?: number | null
  dispatchedAt?: number | null
  checkpoint?: MissionCheckpoint | null
}

type MissionSummary = {
  id: string
  title: string
  state: string
  updatedAt: number
  assignments?: Array<MissionAssignment>
}

export type Swarm2ReportRow = {
  id: string
  kind: 'checkpoint' | 'runtime' | 'artifact'
  title: string
  missionId: string | null
  missionTitle: string | null
  assignmentId: string | null
  workerId: string
  workerName: string
  state: Exclude<ReportState, 'all'>
  stateLabel: string
  updatedAt: number | null
  summary: string
  checkpointStatus: string | null
  blocker: string | null
  nextAction: string | null
  reviewRequired: boolean
  reviewedAt: number | null
  reviewedBy: string | null
  details: Array<{ label: string; value: string }>
  artifacts: Array<RuntimeArtifact>
  previews: Array<RuntimePreview>
}

export type Swarm2InboxLaneId = 'needs_review' | 'blocked' | 'ready'

export type Swarm2InboxItem = Swarm2ReportRow & {
  lane: Swarm2InboxLaneId
}

export type Swarm2InboxLanes = Record<Swarm2InboxLaneId, Array<Swarm2InboxItem>>

type WorkerReportCard = {
  workerId: string
  workerName: string
  role: string
  state: Exclude<ReportState, 'all'>
  stateLabel: string
  latest: Swarm2ReportRow
  rows: Array<Swarm2ReportRow>
  reviewCount: number
  readyCount: number
  blockedCount: number
  artifactCount: number
}

const STATE_FILTERS: Array<{ id: ReportState; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'needs_review', label: 'Needs review' },
  { id: 'ready', label: 'Ready' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'artifact', label: 'Artifacts' },
  { id: 'in_progress', label: 'In progress' },
]

function clean(value: string | null | undefined, fallback = '—'): string {
  const text = value?.trim()
  return text ? text : fallback
}

function compact(value: string | null | undefined, max = 180): string {
  const text = clean(value, '')
  if (!text) return 'No report body published yet.'
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function splitChangedFiles(value: string | null | undefined): Array<RuntimeArtifact> {
  return clean(value, '')
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((path, index) => ({
      id: `changed-${index}-${path}`,
      kind: 'diff',
      label: path.split('/').filter(Boolean).pop() ?? path,
      path,
      source: 'inferred',
    }))
}

function stateForAssignment(assignment: MissionAssignment): Exclude<ReportState, 'all'> {
  const checkpoint = assignment.checkpoint
  const statusText = `${assignment.state ?? ''} ${checkpoint?.stateLabel ?? ''} ${checkpoint?.checkpointStatus ?? ''}`.toLowerCase()
  if (
    statusText.includes('blocked') ||
    statusText.includes('needs_input') ||
    (checkpoint?.blocker && checkpoint.blocker !== 'none')
  ) {
    return 'blocked'
  }
  if (assignment.reviewRequired && ['checkpointed', 'reviewing'].includes(assignment.state ?? '')) return 'needs_review'
  if (['done', 'complete'].includes(assignment.state ?? '') || statusText.includes('handoff') || statusText.includes('done')) return 'ready'
  return 'in_progress'
}

function stateForRuntime(entry: RuntimeReportEntry): Exclude<ReportState, 'all'> {
  const statusText = `${entry.checkpointStatus ?? ''} ${entry.currentTask ?? ''}`.toLowerCase()
  if (entry.blockedReason || entry.needsHuman || statusText.includes('blocked') || statusText.includes('needs_input')) return 'blocked'
  if (statusText.includes('review')) return 'needs_review'
  if (statusText.includes('done') || statusText.includes('handoff') || entry.lastResult || entry.lastRealResult) return 'ready'
  if ((entry.artifacts?.length ?? 0) > 0 || (entry.previews?.length ?? 0) > 0) return 'artifact'
  return 'in_progress'
}

function stateLabel(state: Exclude<ReportState, 'all'>): string {
  switch (state) {
    case 'needs_review':
      return 'Needs review'
    case 'ready':
      return 'Ready'
    case 'blocked':
      return 'Blocked'
    case 'artifact':
      return 'Artifact'
    case 'in_progress':
      return 'In progress'
  }
}

export function buildSwarm2ReportRows({
  missions,
  runtimes,
}: {
  missions: Array<MissionSummary>
  runtimes: Array<RuntimeReportEntry>
}): Array<Swarm2ReportRow> {
  const runtimeByWorker = new Map(runtimes.map((entry) => [entry.workerId, entry]))
  const rows: Array<Swarm2ReportRow> = []

  for (const mission of missions) {
    for (const assignment of mission.assignments ?? []) {
      const workerId = clean(assignment.workerId, 'unknown')
      const runtime = runtimeByWorker.get(workerId)
      const checkpoint = assignment.checkpoint
      if (!checkpoint && !assignment.state) continue
      const state = stateForAssignment(assignment)
      const inferredArtifacts = splitChangedFiles(checkpoint?.filesChanged)
      rows.push({
        id: `mission:${mission.id}:${assignment.id ?? workerId}:${assignment.state ?? 'unknown'}`,
        kind: 'checkpoint',
        title: clean(assignment.task, mission.title),
        missionId: mission.id,
        missionTitle: mission.title,
        assignmentId: assignment.id ?? null,
        workerId,
        workerName: runtime?.displayName || workerId,
        state,
        stateLabel: stateLabel(state),
        updatedAt: assignment.completedAt ?? mission.updatedAt ?? runtime?.lastOutputAt ?? null,
        summary: compact(checkpoint?.result ?? checkpoint?.blocker ?? checkpoint?.nextAction ?? assignment.task),
        checkpointStatus: checkpoint?.checkpointStatus ?? checkpoint?.stateLabel ?? null,
        blocker: checkpoint?.blocker ?? null,
        nextAction: checkpoint?.nextAction ?? null,
        reviewRequired: assignment.reviewRequired === true,
        reviewedAt: assignment.reviewedAt ?? null,
        reviewedBy: assignment.reviewedBy ?? null,
        details: [
          { label: 'Task', value: clean(assignment.task) },
          { label: 'Result', value: clean(checkpoint?.result) },
          { label: 'Files changed', value: clean(checkpoint?.filesChanged) },
          { label: 'Commands run', value: clean(checkpoint?.commandsRun) },
          { label: 'Blocker', value: clean(checkpoint?.blocker) },
          { label: 'Next action', value: clean(checkpoint?.nextAction) },
          { label: 'Checkpoint', value: clean(checkpoint?.checkpointStatus ?? checkpoint?.stateLabel) },
          { label: 'Reviewer', value: clean(assignment.reviewedBy) },
        ],
        artifacts: inferredArtifacts.length ? inferredArtifacts : runtime?.artifacts ?? [],
        previews: runtime?.previews ?? [],
      })
    }
  }

  for (const runtime of runtimes) {
    const hasRuntimeOutput = Boolean(
      clean(runtime.lastSummary, '') ||
      clean(runtime.lastResult, '') ||
      clean(runtime.blockedReason, '') ||
      clean(runtime.lastRealSummary, '') ||
      clean(runtime.lastRealResult, '') ||
      (runtime.artifacts?.length ?? 0) > 0 ||
      (runtime.previews?.length ?? 0) > 0,
    )
    if (!hasRuntimeOutput) continue
    const state = stateForRuntime(runtime)
    rows.push({
      id: `runtime:${runtime.workerId}:${runtime.lastOutputAt ?? runtime.lastSessionStartedAt ?? 'latest'}`,
      kind: (runtime.artifacts?.length ?? 0) > 0 || (runtime.previews?.length ?? 0) > 0 ? 'artifact' : 'runtime',
      title: clean(runtime.currentTask ?? runtime.lastRealSummary ?? runtime.lastSummary ?? runtime.lastRealResult ?? runtime.lastResult, 'Runtime output'),
      missionId: null,
      missionTitle: null,
      assignmentId: null,
      workerId: runtime.workerId,
      workerName: runtime.displayName || runtime.workerId,
      state,
      stateLabel: stateLabel(state),
      updatedAt: runtime.lastOutputAt ?? runtime.lastSessionStartedAt ?? null,
      summary: compact(runtime.blockedReason ?? runtime.lastRealResult ?? runtime.lastResult ?? runtime.lastRealSummary ?? runtime.lastSummary ?? runtime.currentTask),
      checkpointStatus: runtime.checkpointStatus ?? null,
      blocker: runtime.blockedReason ?? null,
      nextAction: null,
      reviewRequired: false,
      reviewedAt: null,
      reviewedBy: null,
      details: [
        { label: 'Current task', value: clean(runtime.currentTask) },
        { label: 'Summary', value: clean(runtime.lastSummary) },
        { label: 'Real summary', value: clean(runtime.lastRealSummary) },
        { label: 'Result', value: clean(runtime.lastResult) },
        { label: 'Real result', value: clean(runtime.lastRealResult) },
        { label: 'Blocked reason', value: clean(runtime.blockedReason) },
        { label: 'Checkpoint status', value: clean(runtime.checkpointStatus) },
        { label: 'Recent log tail', value: compact(runtime.recentLogTail, 900) },
      ],
      artifacts: runtime.artifacts ?? [],
      previews: runtime.previews ?? [],
    })
  }

  return rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.workerId.localeCompare(b.workerId))
}

export function buildSwarm2InboxLanes({
  missions,
  runtimes,
}: {
  missions: Array<MissionSummary>
  runtimes: Array<RuntimeReportEntry>
}): Swarm2InboxLanes {
  const rows = buildSwarm2ReportRows({ missions, runtimes })
  const actionable = rows.filter((row): row is Swarm2InboxItem => {
    if (row.kind !== 'checkpoint' || !row.missionId) return false
    return row.state === 'needs_review' || row.state === 'blocked' || row.state === 'ready'
  }).map((row) => ({ ...row, lane: row.state as Swarm2InboxLaneId }))

  return {
    needs_review: actionable.filter((row) => row.lane === 'needs_review'),
    blocked: actionable.filter((row) => row.lane === 'blocked'),
    ready: actionable.filter((row) => row.lane === 'ready'),
  }
}

function formatAge(value: number | null): string {
  if (!value) return 'unknown age'
  const diff = Math.max(0, Date.now() - value)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function toneClass(state: Exclude<ReportState, 'all'>): string {
  switch (state) {
    case 'blocked':
      return 'border-red-400/40 bg-red-500/10 text-red-700 dark:text-red-200'
    case 'needs_review':
      return 'border-amber-400/50 bg-amber-500/10 text-amber-700 dark:text-amber-200'
    case 'ready':
      return 'border-emerald-400/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
    case 'artifact':
      return 'border-[var(--theme-accent)]/40 bg-[var(--theme-accent-soft)] text-[var(--theme-accent-strong)]'
    case 'in_progress':
      return 'border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-muted)]'
  }
}

function statePriority(state: Exclude<ReportState, 'all'>): number {
  switch (state) {
    case 'blocked':
      return 0
    case 'needs_review':
      return 1
    case 'ready':
      return 2
    case 'artifact':
      return 3
    case 'in_progress':
      return 4
  }
}

function colorForWorker(workerId: string): string {
  const palette = ['#34d399', '#60a5fa', '#a78bfa', '#f59e0b', '#fb7185', '#22d3ee', '#84cc16', '#f472b6']
  const number = Number.parseInt(workerId.replace(/\D/g, ''), 10)
  return Number.isFinite(number) && number > 0 ? palette[(number - 1) % palette.length] : palette[0]
}

function roleFromWorkerId(workerId: string): string {
  const number = workerId.replace(/\D/g, '')
  switch (number) {
    case '4':
      return 'Research'
    case '5':
    case '10':
      return 'Builder'
    case '6':
    case '11':
      return 'Reviewer'
    case '9':
      return 'Lab'
    default:
      return 'Worker'
  }
}

function buildWorkerReportCards(rows: Array<Swarm2ReportRow>): Array<WorkerReportCard> {
  const grouped = new Map<string, Array<Swarm2ReportRow>>()
  for (const row of rows) {
    const existing = grouped.get(row.workerId)
    if (existing) existing.push(row)
    else grouped.set(row.workerId, [row])
  }

  return [...grouped.entries()].map(([workerId, workerRows]) => {
    const sorted = [...workerRows].sort((a, b) => {
      const stateRank = statePriority(a.state) - statePriority(b.state)
      if (stateRank !== 0) return stateRank
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    })
    const latest = sorted[0]
    return {
      workerId,
      workerName: latest.workerName,
      role: latest.missionTitle ?? roleFromWorkerId(workerId),
      state: latest.state,
      stateLabel: latest.stateLabel,
      latest,
      rows: sorted,
      reviewCount: workerRows.filter((row) => row.state === 'needs_review').length,
      readyCount: workerRows.filter((row) => row.state === 'ready').length,
      blockedCount: workerRows.filter((row) => row.state === 'blocked').length,
      artifactCount: workerRows.reduce((sum, row) => sum + row.artifacts.length + row.previews.length, 0),
    }
  }).sort((a, b) => {
    const stateRank = statePriority(a.state) - statePriority(b.state)
    if (stateRank !== 0) return stateRank
    return (b.latest.updatedAt ?? 0) - (a.latest.updatedAt ?? 0)
  })
}

function detailValue(row: Swarm2ReportRow, label: string): string | null {
  return row.details.find((detail) => detail.label === label)?.value ?? null
}

function cleanDetail(value: string | null | undefined): string | null {
  const text = value?.trim()
  return text && text !== '—' ? text : null
}

export function buildBlockedGuidanceTask(row: Swarm2InboxItem, guidance: string): string {
  return [
    guidance.trim(),
    '',
    `Prior blocker: ${cleanDetail(row.blocker) ?? 'none'}`,
    `Latest next action: ${cleanDetail(row.nextAction) ?? 'none'}`,
    '',
    'Resume: address the blocker and continue.',
  ].join('\n')
}

export function buildReviewerDispatchTask(row: Swarm2InboxItem): string {
  return `Review ${row.workerId} checkpoint at ${row.checkpointStatus ?? row.stateLabel}. Read the swarm6 review spec from the configured swarm-specs workspace. Verify, byte-check, return APPROVED/CHANGES_REQUESTED/BLOCKED.`
}

export function extractPullRequestUrl(row: Swarm2ReportRow): string | null {
  const sources = [
    row.summary,
    row.title,
    cleanDetail(detailValue(row, 'Result')),
    cleanDetail(detailValue(row, 'Real result')),
    cleanDetail(detailValue(row, 'Summary')),
    cleanDetail(detailValue(row, 'Real summary')),
  ].filter(Boolean) as Array<string>
  for (const source of sources) {
    const match = source.match(/https?:\/\/\S+\/pull\/\d+\S*/i)
    if (match) return match[0].replace(/[)>.,]+$/, '')
  }
  return null
}

export async function postSwarmDispatch(body: { assignments: Array<{ workerId: string; task: string }> }, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl('/api/swarm-dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }
}

export async function markInboxItemReadyForEric(input: { missionId: string; assignmentId: string }, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl('/api/swarm-missions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'mark_ready_for_eric', ...input }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }
}

function buildReplyPrefill(row: Swarm2InboxItem): string {
  return [
    `Worker: ${row.workerId}`,
    `Prior blocker: ${cleanDetail(row.blocker) ?? 'none'}`,
    `Latest next action: ${cleanDetail(row.nextAction) ?? 'none'}`,
    '',
  ].join('\n')
}

export function Swarm2ReportsView({
  missions,
  runtimes,
  onSelectWorker,
  onOpenItem,
  onRouteToReviewer,
  onRefresh,
}: {
  missions: Array<MissionSummary>
  runtimes: Array<RuntimeReportEntry>
  onSelectWorker?: (workerId: string) => void
  onOpenItem?: (row: Swarm2InboxItem) => void
  onRouteToReviewer?: (row: Swarm2InboxItem) => void
  onRefresh?: () => Promise<void> | void
}) {
  const [stateFilter, setStateFilter] = useState<ReportState>('all')
  const [layout, setLayout] = useState<ReportLayout>('cards')
  const [workerFilter, setWorkerFilter] = useState('all')
  const [missionFilter, setMissionFilter] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [replyErrors, setReplyErrors] = useState<Record<string, string | null>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!toastMessage) return
    const timer = window.setTimeout(() => setToastMessage(null), 2500)
    return () => window.clearTimeout(timer)
  }, [toastMessage])

  const rows = useMemo(() => buildSwarm2ReportRows({ missions, runtimes }), [missions, runtimes])
  const inboxLanes = useMemo(() => buildSwarm2InboxLanes({ missions, runtimes }), [missions, runtimes])
  const workers = useMemo(() => [...new Set(rows.map((row) => row.workerId))].sort(), [rows])
  const missionOptions = useMemo(
    () => missions.map((mission) => ({ id: mission.id, label: mission.title || mission.id })),
    [missions],
  )
  const filteredRows = rows.filter((row) => {
    if (stateFilter !== 'all' && row.state !== stateFilter) return false
    if (workerFilter !== 'all' && row.workerId !== workerFilter) return false
    if (missionFilter !== 'all' && row.missionId !== missionFilter) return false
    return true
  })
  const workerCards = useMemo(() => buildWorkerReportCards(filteredRows), [filteredRows])
  const counts = rows.reduce<Record<Exclude<ReportState, 'all'>, number>>(
    (acc, row) => {
      acc[row.state] += 1
      return acc
    },
    { needs_review: 0, ready: 0, blocked: 0, in_progress: 0, artifact: 0 },
  )

  function showToast(message: string) {
    setToastMessage(message)
  }

  async function refreshData() {
    await onRefresh?.()
  }

  async function sendGuidance(row: Swarm2InboxItem) {
    const guidance = cleanDetail(replyDrafts[row.id])
    if (!guidance) {
      setReplyErrors((current) => ({ ...current, [row.id]: 'Add guidance before sending.' }))
      return
    }
    setBusyId(`reply:${row.id}`)
    setReplyErrors((current) => ({ ...current, [row.id]: null }))
    try {
      await postSwarmDispatch({
        assignments: [{ workerId: row.workerId, task: buildBlockedGuidanceTask(row, guidance) }],
      })
      await refreshData()
      setReplyDrafts((current) => ({ ...current, [row.id]: buildReplyPrefill(row) }))
      setExpandedId(null)
      showToast(`Sent to ${row.workerId}`)
    } catch (error) {
      setReplyErrors((current) => ({
        ...current,
        [row.id]: error instanceof Error ? error.message : 'Failed to send guidance.',
      }))
    } finally {
      setBusyId(null)
    }
  }

  async function routeToReviewer(row: Swarm2InboxItem) {
    setBusyId(`review:${row.id}`)
    try {
      await postSwarmDispatch({
        assignments: [{ workerId: 'swarm6', task: buildReviewerDispatchTask(row) }],
      })
      await refreshData()
      onRouteToReviewer?.(row)
      showToast(`Sent to swarm6 for ${row.workerId}`)
    } catch (error) {
      setReplyErrors((current) => ({
        ...current,
        [row.id]: error instanceof Error ? error.message : 'Failed to route reviewer.',
      }))
    } finally {
      setBusyId(null)
    }
  }

  async function markReady(row: Swarm2InboxItem) {
    if (!row.missionId || !row.assignmentId) return
    setBusyId(`ready:${row.id}`)
    try {
      await markInboxItemReadyForEric({ missionId: row.missionId, assignmentId: row.assignmentId })
      await refreshData()
      showToast(`Marked ${row.workerId} ready for Eric merge`)
    } catch (error) {
      setReplyErrors((current) => ({
        ...current,
        [row.id]: error instanceof Error ? error.message : 'Failed to mark ready for Eric.',
      }))
    } finally {
      setBusyId(null)
    }
  }

  function openReply(row: Swarm2InboxItem) {
    const key = `reply:${row.id}`
    setReplyDrafts((current) => ({
      ...current,
      [row.id]: current[row.id] ?? buildReplyPrefill(row),
    }))
    setReplyErrors((current) => ({ ...current, [row.id]: null }))
    setExpandedId(expandedId === key ? null : key)
  }

  function openWorker(row: Swarm2InboxItem) {
    onOpenItem?.(row)
  }

  function renderReplyComposer(row: Swarm2InboxItem) {
    const disabled = busyId === `reply:${row.id}`
    return (
      <div className="mt-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3">
        <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]" htmlFor={`guidance-${row.id}`}>
          Guidance for {row.workerId}
        </label>
        <textarea
          id={`guidance-${row.id}`}
          value={replyDrafts[row.id] ?? buildReplyPrefill(row)}
          onChange={(event) => setReplyDrafts((current) => ({ ...current, [row.id]: event.target.value }))}
          rows={6}
          className="w-full resize-none rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none"
        />
        {replyErrors[row.id] ? <div className="mt-2 text-xs text-red-600">{replyErrors[row.id]}</div> : null}
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setExpandedId(null)}
            className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-1.5 text-xs font-medium text-[var(--theme-muted)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void sendGuidance(row)}
            className="rounded-lg bg-[var(--theme-accent)] px-3 py-1.5 text-xs font-semibold text-primary-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {disabled ? 'Sending…' : 'Send guidance'}
          </button>
        </div>
      </div>
    )
  }

  function renderRowActions(row: Swarm2InboxItem, compact = false) {
    const prUrl = extractPullRequestUrl(row)
    const buttonClass = compact
      ? 'rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2 py-1 text-[10px] font-medium text-[var(--theme-text)] hover:border-[var(--theme-accent)]'
      : 'rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--theme-text)] hover:border-[var(--theme-accent)]'
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" aria-label={`Open ${row.workerId} worker`} onClick={() => openWorker(row)} className={buttonClass}>
          ↗
        </button>
        {row.state === 'blocked' ? (
          <button type="button" onClick={() => openReply(row)} className={buttonClass}>
            Guide worker
          </button>
        ) : null}
        {row.state === 'needs_review' ? (
          <button type="button" onClick={() => void routeToReviewer(row)} className={cn(buttonClass, 'border-amber-400/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15')}>
            Route to reviewer
          </button>
        ) : null}
        {row.state === 'ready' && prUrl ? (
          <>
            <a href={prUrl} target="_blank" rel="noreferrer" className={cn(buttonClass, 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15')}>
              Open PR
            </a>
            <button type="button" onClick={() => void markReady(row)} className={cn(buttonClass, 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15')}>
              Mark ready for Eric merge
            </button>
          </>
        ) : null}
      </div>
    )
  }

  function renderInboxLane(lane: Swarm2InboxLaneId, title: string, rowsForLane: Array<Swarm2InboxItem>, emptyText: string) {
    const laneTone = toneClass(lane)
    return (
      <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-[var(--theme-text)]">{title}</div>
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]', laneTone)}>
            {rowsForLane.length}
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {rowsForLane.length ? rowsForLane.slice(0, 4).map((row) => (
            <div key={`lane:${lane}:${row.id}`} className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-[var(--theme-text)]">{row.title}</div>
                  <div className="mt-1 text-[11px] text-[var(--theme-muted)]">{row.workerName} · {row.missionTitle ?? row.missionId}</div>
                </div>
                <div className="shrink-0 text-[10px] text-[var(--theme-muted)]">{formatAge(row.updatedAt)}</div>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--theme-muted-2)]">{row.summary}</p>
              {renderRowActions(row, true)}
              {expandedId === `reply:${row.id}` ? renderReplyComposer(row) : null}
            </div>
          )) : (
            <div className="rounded-xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-4 text-xs text-[var(--theme-muted)]">
              {emptyText}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <section className="rounded-[1.5rem] border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-[0_20px_60px_color-mix(in_srgb,var(--theme-shadow)_14%,transparent)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">Outputs / Reports</div>
          <h2 className="mt-1 text-lg font-semibold text-[var(--theme-text)]">Worker reports</h2>
          <p className="mt-1 max-w-3xl text-xs text-[var(--theme-muted-2)]">
            Board for queues, Cards for worker-level scanning, List for dense detail.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[10px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
          <span className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-2 py-1">Review {counts.needs_review}</span>
          <span className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-2 py-1">Ready {counts.ready}</span>
          <span className="rounded-xl border border-red-400/40 bg-red-500/10 px-2 py-1">Blocked {counts.blocked}</span>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATE_FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setStateFilter(filter.id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              stateFilter === filter.id
                ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-strong)]'
                : 'border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-muted)] hover:text-[var(--theme-text)]',
            )}
          >
            {filter.label}
          </button>
        ))}
        <select value={workerFilter} onChange={(event) => setWorkerFilter(event.target.value)} className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-1.5 text-xs text-[var(--theme-muted)] outline-none">
          <option value="all">All workers</option>
          {workers.map((worker) => <option key={worker} value={worker}>{worker}</option>)}
        </select>
        <select value={missionFilter} onChange={(event) => setMissionFilter(event.target.value)} className="max-w-xs rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-1.5 text-xs text-[var(--theme-muted)] outline-none">
          <option value="all">All missions</option>
          {missionOptions.map((mission) => <option key={mission.id} value={mission.id}>{mission.label}</option>)}
        </select>
        <div className="ml-auto flex rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] p-1">
          {([
            ['board', 'Board'],
            ['cards', 'Cards'],
            ['list', 'List'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setLayout(id)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                layout === id
                  ? 'bg-[var(--theme-accent)] text-primary-950'
                  : 'text-[var(--theme-muted)] hover:text-[var(--theme-text)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {layout === 'board' ? (
        <div className="grid gap-3 xl:grid-cols-3">
          {renderInboxLane('needs_review', 'Needs review', inboxLanes.needs_review, 'Reviewer lane is clear. Route the next completed worker output through swarm6.')}
          {renderInboxLane('blocked', 'Blocked / needs input', inboxLanes.blocked, 'No blockers waiting on human input.')}
          {renderInboxLane('ready', 'Ready', inboxLanes.ready, 'Nothing is ready yet.')}
        </div>
      ) : layout === 'cards' ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {workerCards.length ? workerCards.map((card) => {
            const expanded = expandedId === `worker:${card.workerId}`
            const latestInboxItem = {
              ...card.latest,
              lane: (card.latest.state === 'blocked' ? 'blocked' : card.latest.state === 'ready' ? 'ready' : 'needs_review') as Swarm2InboxLaneId,
            }
            return (
              <article key={card.workerId} className="rounded-[1.4rem] border border-[var(--theme-border)] border-l-4 border-l-[var(--theme-accent)] bg-[var(--theme-bg)] p-4 shadow-[0_16px_40px_color-mix(in_srgb,var(--theme-shadow)_10%,transparent)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="relative flex size-12 shrink-0 items-center justify-center">
                      <AgentProgress
                        value={card.state === 'blocked' ? 30 : card.state === 'needs_review' ? 74 : card.state === 'ready' ? 100 : 58}
                        status={card.state === 'blocked' ? 'failed' : card.state === 'ready' ? 'done' : card.state === 'needs_review' ? 'thinking' : 'running'}
                        size={48}
                        strokeWidth={2.5}
                        className={card.state === 'blocked' ? 'text-red-500' : card.state === 'needs_review' ? 'text-amber-500' : card.state === 'ready' ? 'text-emerald-500' : 'text-sky-500'}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <PixelAvatar size={34} color={colorForWorker(card.workerId)} accentColor="#fbbf24" status={card.state === 'blocked' ? 'failed' : card.state === 'ready' ? 'running' : 'idle'} />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => onSelectWorker?.(card.workerId)} className="truncate text-left text-sm font-semibold text-[var(--theme-text)] hover:text-[var(--theme-accent-strong)]">
                          {card.workerName}
                        </button>
                        <span className={cn('rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]', toneClass(card.state))}>{card.stateLabel}</span>
                      </div>
                      <div className="mt-1 text-[10px] text-[var(--theme-muted)]">{card.role} · {formatAge(card.latest.updatedAt)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : `worker:${card.workerId}`)}
                      className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--theme-text)] hover:border-[var(--theme-accent)]"
                    >
                      {expanded ? 'Hide reports' : `Open reports (${card.rows.length})`}
                    </button>
                    {card.prUrl ? (
                      <a
                        href={card.prUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-2.5 py-1.5 text-[11px] text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
                      >
                        ↗
                      </a>
                    ) : null}
                    {(card.state === 'needs_review' || card.state === 'blocked' || card.state === 'ready') ? (
                      <button
                        type="button"
                        onClick={() => onRouteToReviewer?.(card)}
                        className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-2.5 py-1.5 text-[11px] text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
                      >
                        Steer
                      </button>
                    ) : null}
                  </div>
                </div>

                <h3 className="mt-3 text-center line-clamp-2 text-lg font-semibold leading-tight text-[var(--theme-text)]">{card.latest.title}</h3>
                <p className="mt-1 text-center text-[11px] text-[var(--theme-muted)]">{card.latest.summary}</p>

                <div className="mt-4 flex flex-wrap gap-1.5 text-center text-[9px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
                  <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5">Review {card.reviewCount}</div>
                  <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5">Ready {card.readyCount}</div>
                  <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-1.5 py-0.5">Blocked {card.blockedCount}</div>
                  <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-1.5 py-0.5">Files {card.artifactCount}</div>
                </div>

                {expandedId === `reply:${latestInboxItem.id}` ? renderReplyComposer(latestInboxItem) : null}

                {expanded ? (
                  <div className="mt-3 space-y-2 border-t border-[var(--theme-border)] pt-3">
                    {card.rows.slice(0, 4).map((row) => {
                      const inboxRow = {
                        ...row,
                        lane: (row.state === 'blocked' ? 'blocked' : row.state === 'ready' ? 'ready' : 'needs_review') as Swarm2InboxLaneId,
                      }
                      return (
                        <div
                          key={row.id}
                          className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]', toneClass(row.state))}>{row.stateLabel}</span>
                            <span className="text-[10px] text-[var(--theme-muted)]">{formatAge(row.updatedAt)}</span>
                          </div>
                          <div className="mt-2 line-clamp-1 text-xs font-semibold text-[var(--theme-text)]">{row.title}</div>
                          <div className="mt-1 line-clamp-2 text-[11px] text-[var(--theme-muted-2)]">{row.summary}</div>
                          {renderRowActions(inboxRow)}
                          {expandedId === `reply:${row.id}` ? renderReplyComposer(inboxRow) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </article>
            )
          }) : (
            <div className="col-span-full rounded-2xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-bg)] p-8 text-center text-sm text-[var(--theme-muted)]">
              No worker reports match these filters yet.
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRows.length ? filteredRows.map((row) => {
            const expanded = expandedId === row.id
            return (
              <article key={row.id} className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedId(expanded ? null : row.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setExpandedId(expanded ? null : row.id)
                    }
                  }}
                  className="block w-full cursor-pointer text-left"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]', toneClass(row.state))}>{row.stateLabel}</span>
                        <span className="text-[11px] text-[var(--theme-muted)]">{row.kind}</span>
                        {row.checkpointStatus ? <span className="text-[11px] text-[var(--theme-muted)]">{row.checkpointStatus}</span> : null}
                        {row.reviewRequired ? <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">swarm6 gate</span> : null}
                        {row.reviewedBy ? <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">reviewed by {row.reviewedBy}</span> : null}
                        <span className="text-[11px] text-[var(--theme-muted)]">{formatAge(row.updatedAt)}</span>
                      </div>
                      <h3 className="mt-2 truncate text-sm font-semibold text-[var(--theme-text)]">{row.title}</h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--theme-muted-2)]">{row.summary}</p>
                    </div>
                    <div className="shrink-0 text-right text-xs text-[var(--theme-muted)]">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button type="button" onClick={(event) => { event.stopPropagation(); onSelectWorker?.(row.workerId) }} className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-2 py-1 font-medium text-[var(--theme-text)] hover:border-[var(--theme-accent)]">
                          {row.workerName}
                        </button>
                        {row.state === 'needs_review' ? (
                          <button type="button" onClick={(event) => { event.stopPropagation(); onRouteToReviewer?.({ ...row, lane: 'needs_review' }) }} className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-2 py-1 font-medium text-amber-700 hover:bg-amber-500/15">
                            Route swarm6
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-1 max-w-[14rem] truncate">{row.missionTitle ?? 'runtime output'}</div>
                    </div>
                  </div>
                </div>

                {expanded ? (
                  <div className="mt-3 border-t border-[var(--theme-border)] pt-3">
                    <dl className="grid gap-2 md:grid-cols-2">
                      {row.details.map((detail) => (
                        <div key={detail.label} className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2">
                          <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">{detail.label}</dt>
                          <dd className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[var(--theme-text)]">{detail.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {(row.artifacts.length > 0 || row.previews.length > 0) ? (
                      <div className="mt-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2">
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">Artifacts</div>
                        <div className="flex flex-wrap gap-1.5">
                          {row.artifacts.map((artifact) => (
                            <span key={artifact.id} title={artifact.path ?? artifact.label} className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2 py-1 text-[10px] text-[var(--theme-muted-2)]">
                              {artifact.kind}: {artifact.label}
                            </span>
                          ))}
                          {row.previews.map((preview) => (
                            <a key={preview.id} href={preview.url} target="_blank" rel="noreferrer" className="rounded-full border border-[var(--theme-accent)]/40 bg-[var(--theme-accent-soft)] px-2 py-1 text-[10px] text-[var(--theme-accent-strong)]">
                              preview: {preview.label}
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            )
          }) : (
            <div className="rounded-2xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-bg)] p-8 text-center text-sm text-[var(--theme-muted)]">
              No reports match these filters yet. Checkpoints appear after workers return the required checkpoint format; runtime artifacts appear when workers publish artifacts/previews.
            </div>
          )}
        </div>
      )}
    </section>
  )
}
