import {
  ArrowDown01Icon,
  Copy01Icon,
  FilterHorizontalIcon,
  PauseIcon,
  PlayCircleIcon,
  SquareArrowDown02Icon,
  Task01Icon,
  TimeQuarterPassIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { parseUtcTimestamp } from '@/lib/workspace-checkpoints'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  extractAgents,
  extractProjects,
  type WorkspaceAgent,
  type WorkspaceProject,
} from '@/screens/projects/lib/workspace-types'
import {
  extractRunEvents,
  extractTaskRuns,
  type WorkspaceRunEvent,
  type WorkspaceTaskRun,
} from './lib/runs-types'
import {
  formatRunCost,
  formatRunDuration,
  formatRunInputTokens,
  formatRunStatus,
  formatRunTimestamp,
  formatRunTokens,
  getConsoleLineClass,
  getRunAgentTone,
  getRunEventMessage,
  getRunFilesWritten,
  getRunProgress,
  getRunProgressLabel,
  getRunRetryNarrative,
  getRunStatusClass,
  isRunningRun,
  matchesTimeRange,
  sortRunsNewestFirst,
  type RunTimeRange,
} from './lib/runs-utils'

type StatusFilter =
  | 'all'
  | 'running'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'stopped'
  | 'awaiting_review'

type ActivityEventMessage = {
  title?: unknown
}

function formatEventClock(value: string): string {
  const timestamp = parseUtcTimestamp(value)
  return timestamp.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function getTerminalEvents(events: Array<WorkspaceRunEvent>): Array<WorkspaceRunEvent> {
  return events.filter((event) => event.type === 'output' || event.type === 'agent_message')
}

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

function RunLog({
  events,
  compact = false,
}: {
  events: Array<WorkspaceRunEvent>
  compact?: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [events])

  return (
    <div
      ref={containerRef}
      className={[
        'overflow-y-auto rounded-xl border border-primary-200 bg-white font-mono text-xs',
        compact ? 'max-h-56 p-3' : 'max-h-80 p-4',
      ].join(' ')}
    >
      {events.length > 0 ? (
        <div className="space-y-2">
          {events.map((event) => (
            <div key={event.id} className="grid grid-cols-[72px_1fr] gap-3">
              <span className="text-primary-500">
                {parseUtcTimestamp(event.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
              <p className={getConsoleLineClass(event)}>{getRunEventMessage(event)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-primary-500">No run output yet.</p>
      )}
    </div>
  )
}

function LiveOutputPanel({
  events,
  isError,
  isLoading,
  run,
}: {
  events: Array<WorkspaceRunEvent>
  isError: boolean
  isLoading: boolean
  run: WorkspaceTaskRun
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalEvents = useMemo(() => getTerminalEvents(events), [events])
  const finalStatus = run.status !== 'running'
  const [copied, setCopied] = useState(false)
  const sessionLabel = getRunSessionLabel(run)

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [terminalEvents])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1200)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function handleCopySessionId() {
    if (!run.session_id || !navigator.clipboard?.writeText) return

    try {
      await navigator.clipboard.writeText(run.session_id)
      setCopied(true)
    } catch {
      toast('Unable to copy session ID.', { type: 'error' })
    }
  }

  return (
    <div className="rounded-xl border border-primary-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-primary-900">Live output</h3>
          <p className="text-sm text-primary-500">
            Streaming agent output for this run.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {run.status === 'running' ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          ) : null}
          {finalStatus ? (
            <span
              className={cn(
                'inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.14em]',
                getRunStatusClass(run.status),
              )}
            >
              {formatRunStatus(run.status)}
            </span>
          ) : null}
        </div>
      </div>

      {run.session_id && sessionLabel ? (
        <div className="flex items-center gap-2 rounded-t-lg border border-b-0 border-primary-200 bg-primary-50 px-3 py-2 text-xs text-primary-600">
          <span className="font-medium text-primary-900">Agent session:</span>
          <a
            href={`/agents?session=${encodeURIComponent(run.session_id)}`}
            className="font-mono text-accent-600 transition-colors hover:text-accent-500"
          >
            {sessionLabel}
          </a>
          <button
            type="button"
            onClick={() => void handleCopySessionId()}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-primary-200 bg-white px-2 py-0.5 text-[11px] font-medium text-primary-600 transition-colors hover:border-accent-500/40 hover:text-accent-600"
          >
            <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} className="size-3.5" />
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      ) : null}

      <div
        ref={containerRef}
        className={cn(
          'max-h-80 overflow-y-auto bg-primary-950 p-4 font-mono text-xs text-emerald-400',
          run.session_id && sessionLabel ? 'rounded-b-xl' : 'rounded-xl',
        )}
      >
        {isLoading ? (
          <p>Connecting to run output...</p>
        ) : isError ? (
          <p className="text-red-300">Unable to load run output.</p>
        ) : terminalEvents.length > 0 ? (
          <div className="space-y-1.5">
            {terminalEvents.map((event) => (
              <p key={event.id} className="whitespace-pre-wrap break-words">
                <span className="text-emerald-200">[{formatEventClock(event.created_at)}]</span>{' '}
                {getRunEventMessage(event)}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-emerald-200/80">
            {run.status === 'running'
              ? 'Waiting for live output...'
              : 'No terminal output was recorded for this run.'}
          </p>
        )}
      </div>
    </div>
  )
}

function parseActivityEvent(payload: string): ActivityEventMessage | null {
  try {
    const parsed = JSON.parse(payload) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as ActivityEventMessage
  } catch {
    return null
  }
}

function isReadableSessionLabel(value: string): boolean {
  return (
    value.trim().length > 0 &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )
}

function getRunSessionLabel(run: WorkspaceTaskRun): string | null {
  if (!run.session_id) return null

  if (run.session_label && run.session_label.trim().length > 0) {
    return run.session_label.trim()
  }

  if (isReadableSessionLabel(run.session_id)) {
    return run.session_id
  }

  return `Session: ${run.session_id.slice(0, 8)}`
}

function RunSessionBadge({
  run,
}: {
  run: WorkspaceTaskRun
}) {
  const label = getRunSessionLabel(run)
  if (!run.session_id || !label) return null

  return (
    <a
      href={`/agents?session=${encodeURIComponent(run.session_id)}`}
      onClick={(event) => event.stopPropagation()}
      className="inline-flex items-center gap-1 rounded-full border border-accent-500/30 bg-accent-500/10 px-2 py-0.5 text-xs font-mono text-accent-600 transition-colors hover:border-accent-500/50 hover:bg-accent-500/15"
    >
      {label}
    </a>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ label: string; value: string }>
}) {
  return (
    <label className="flex min-w-[160px] flex-1 flex-col gap-2 text-xs text-primary-500">
      <span className="font-medium uppercase tracking-[0.18em] text-primary-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-primary-200 bg-white px-3 py-2.5 text-sm text-primary-900 outline-none transition-colors focus:border-accent-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ActiveRunCard({
  isExpanded,
  isSelected,
  run,
  events,
  eventError,
  eventLoading,
  actionPending,
  onSelect,
  onToggleExpand,
  onPause,
  onStop,
}: {
  isExpanded: boolean
  isSelected: boolean
  run: WorkspaceTaskRun
  events: Array<WorkspaceRunEvent>
  eventError: boolean
  eventLoading: boolean
  actionPending: boolean
  onSelect: (runId: string) => void
  onToggleExpand: (runId: string) => void
  onPause: (runId: string) => void
  onStop: (runId: string) => void
}) {
  const progress = getRunProgress(run, events)
  const progressLabel = getRunProgressLabel(run, events)
  const filesWritten = getRunFilesWritten(events)
  const agentTone = getRunAgentTone(run.agent_name)
  const accentClasses =
    agentTone === 'codex'
      ? {
          liveBadge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
          dot: 'bg-emerald-400',
          cardGlow:
            'border-emerald-500/25 shadow-[0_0_0_1px_rgba(52,211,153,0.08),0_18px_40px_rgba(16,185,129,0.18)]',
          progress: 'bg-emerald-400',
        }
      : agentTone === 'claude'
        ? {
            liveBadge: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
            dot: 'bg-violet-400',
            cardGlow:
              'border-violet-500/25 shadow-[0_0_0_1px_rgba(196,181,253,0.08),0_18px_40px_rgba(139,92,246,0.16)]',
            progress: 'bg-violet-400',
          }
        : agentTone === 'ollama'
          ? {
              liveBadge: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
              dot: 'bg-sky-400',
              cardGlow:
                'border-sky-500/25 shadow-[0_0_0_1px_rgba(125,211,252,0.08),0_18px_40px_rgba(14,165,233,0.16)]',
              progress: 'bg-sky-400',
            }
          : {
              liveBadge: 'border-accent-500/30 bg-accent-500/10 text-accent-300',
              dot: 'bg-accent-400',
              cardGlow:
                'border-accent-500/25 shadow-[0_0_0_1px_rgba(251,146,60,0.08),0_18px_40px_rgba(249,115,22,0.14)]',
              progress: 'bg-accent-500',
            }

  return (
    <article
      onClick={() => onSelect(run.id)}
      className={cn(
        'rounded-xl border bg-white p-4 shadow-sm transition-shadow md:p-5',
        isSelected && 'border-accent-500/40',
        accentClasses.cardGlow,
      )}
    >
      <div className="flex flex-col gap-4 border-b border-primary-200 pb-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
                accentClasses.liveBadge,
              )}
            >
              <span
                className={cn(
                  'size-2 rounded-full shadow-[0_0_10px_currentColor] animate-pulse',
                  accentClasses.dot,
                )}
              />
              Live run
            </span>
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getRunStatusClass(
                run.status,
              )}`}
            >
              {formatRunStatus(run.status)}
            </span>
            <RunSessionBadge run={run} />
            <span className="inline-flex rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
              {progressLabel}
            </span>
            {filesWritten ? (
              <span className="inline-flex rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                {filesWritten} file{filesWritten === 1 ? '' : 's'} written
              </span>
            ) : null}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-primary-900">{run.task_name}</h2>
            <p className="mt-1 text-sm text-primary-600">
              {run.project_name} · {run.mission_name} · {run.agent_name ?? 'Unassigned agent'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onToggleExpand(run.id)
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm font-medium text-primary-800 transition-colors hover:border-accent-500/50 hover:text-accent-400"
          >
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className={cn('size-4 transition-transform', isExpanded && 'rotate-180')}
            />
            {isExpanded ? 'Hide output' : 'Show output'}
          </button>
          <button
            type="button"
            disabled={actionPending}
            onClick={(event) => {
              event.stopPropagation()
              onPause(run.id)
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm font-medium text-primary-800 transition-colors hover:border-amber-500/50 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <HugeiconsIcon icon={PauseIcon} className="size-4" />
            Pause
          </button>
          <button
            type="button"
            disabled={actionPending}
            onClick={(event) => {
              event.stopPropagation()
              onStop(run.id)
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-accent-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <HugeiconsIcon icon={SquareArrowDown02Icon} className="size-4" />
            Stop
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <RunLog events={events} compact />

        <div className="space-y-4 rounded-xl border border-primary-200 bg-primary-50/70 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-primary-500">Elapsed</p>
              <p className="mt-1 text-sm font-medium text-primary-900">
                {formatRunDuration(run)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-primary-500">Attempt</p>
              <p className="mt-1 text-sm font-medium text-primary-900">{run.attempt}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-primary-500">Tokens</p>
              <p className="mt-1 text-sm font-medium text-primary-900">
                {formatRunTokens(run)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-primary-500">Cost</p>
              <p className="mt-1 text-sm font-medium text-primary-900">
                {formatRunCost(run.cost_cents)}
              </p>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-primary-500">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-primary-100">
              <div
                className={cn('h-2 rounded-full transition-all', accentClasses.progress)}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {isExpanded ? (
        <div className="mt-4">
          <LiveOutputPanel
            run={run}
            events={events}
            isLoading={eventLoading}
            isError={eventError}
          />
        </div>
      ) : null}
    </article>
  )
}

function RecentRunRow({
  isExpanded,
  isSelected,
  events,
  eventError,
  eventLoading,
  run,
  onSelect,
  onToggleExpand,
}: {
  isExpanded: boolean
  isSelected: boolean
  events: Array<WorkspaceRunEvent>
  eventError: boolean
  eventLoading: boolean
  run: WorkspaceTaskRun
  onSelect: (runId: string) => void
  onToggleExpand: (runId: string) => void
}) {
  const retryNarrative = getRunRetryNarrative(run)

  return (
    <article
      className={cn(
        'rounded-xl border border-primary-200 bg-white shadow-sm',
        isSelected && 'border-accent-500/40',
      )}
    >
      <div className="flex items-stretch">
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelect(run.id)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onSelect(run.id)
          }}
          className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-4 text-left transition-colors hover:bg-primary-50 md:grid md:grid-cols-[minmax(0,2fr)_1.05fr_1fr_0.9fr_0.75fr_0.7fr_0.8fr_0.95fr] md:items-center"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-primary-900">{run.task_name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-xs text-primary-500">{run.mission_name}</p>
              {run.attempt > 1 ? (
                <span className="inline-flex rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-600">
                  retry #{run.attempt}
                </span>
              ) : null}
            </div>
            {retryNarrative ? (
              <p className="mt-1 truncate text-xs text-primary-500">{retryNarrative}</p>
            ) : null}
          </div>
          <p className="text-sm text-primary-600">{run.project_name}</p>
          <p className="text-sm text-primary-600">{run.agent_name ?? 'Unknown agent'}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getRunStatusClass(
                run.status,
              )}`}
            >
              {formatRunStatus(run.status)}
            </span>
            <RunSessionBadge run={run} />
          </div>
          <p className="text-sm text-primary-600">{formatRunDuration(run)}</p>
          <p className="text-sm text-primary-600">{formatRunInputTokens(run)}</p>
          <p className="text-sm text-primary-600">{formatRunCost(run.cost_cents)}</p>
          <p className="text-sm text-primary-600">
            {formatRunTimestamp(run.completed_at ?? run.started_at)}
          </p>
        </div>
        <button
          type="button"
          aria-label={isExpanded ? 'Collapse output panel' : 'Expand output panel'}
          onClick={() => onToggleExpand(run.id)}
          className="flex w-14 items-center justify-center border-l border-primary-200 text-primary-500 transition-colors hover:bg-primary-50 hover:text-accent-400"
        >
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className={cn('size-4 transition-transform', isExpanded ? 'rotate-180' : '-rotate-90')}
          />
        </button>
      </div>

      {isExpanded ? (
        <div className="border-t border-primary-200 p-4">
          <LiveOutputPanel
            run={run}
            events={events}
            isLoading={eventLoading}
            isError={eventError}
          />
        </div>
      ) : null}
    </article>
  )
}

export function RunsConsoleScreen() {
  const queryClient = useQueryClient()
  const [projectFilter, setProjectFilter] = useState('all')
  const [agentFilter, setAgentFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [timeRange, setTimeRange] = useState<RunTimeRange>('today')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  const runsQuery = useQuery({
    queryKey: ['workspace', 'task-runs'],
    queryFn: async () => extractTaskRuns(await apiRequest('/api/workspace/task-runs')),
    refetchInterval: 10_000,
  })

  const projectsQuery = useQuery({
    queryKey: ['workspace', 'projects', 'for-runs'],
    queryFn: async () => extractProjects(await apiRequest('/api/workspace/projects')),
    staleTime: 60_000,
  })

  const agentsQuery = useQuery({
    queryKey: ['workspace', 'agents', 'for-runs'],
    queryFn: async () => extractAgents(await apiRequest('/api/workspace/agents')),
    staleTime: 60_000,
  })

  const runs = runsQuery.data ?? []
  const activeRuns = useMemo(() => runs.filter(isRunningRun), [runs])
  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  )
  const eventRunIds = useMemo(() => {
    const selectedActiveRunId =
      selectedRun && isRunningRun(selectedRun) ? selectedRun.id : null

    return Array.from(
      new Set([
        ...activeRuns.map((run) => run.id),
        ...(selectedRunId ? [selectedRunId] : []),
        ...(selectedActiveRunId ? [selectedActiveRunId] : []),
      ]),
    )
  }, [activeRuns, selectedRun, selectedRunId])

  const eventQueries = useQueries({
    queries: eventRunIds.map((runId) => {
      const run = runs.find((entry) => entry.id === runId) ?? null
      const shouldPoll = selectedRunId === runId && run?.status === 'running'

      return {
        queryKey: ['workspace', 'task-runs', runId, 'events'],
        queryFn: async () =>
          extractRunEvents(await apiRequest(`/api/workspace/task-runs/${runId}/events`)),
        refetchInterval: shouldPoll ? 2_000 : false,
        staleTime: 1_000,
      }
    }),
  })

  const eventsByRunId = useMemo(() => {
    const map = new Map<string, Array<WorkspaceRunEvent>>()
    eventRunIds.forEach((runId, index) => {
      map.set(runId, eventQueries[index]?.data ?? [])
    })
    return map
  }, [eventQueries, eventRunIds])
  const eventQueryStateByRunId = useMemo(() => {
    const map = new Map<
      string,
      {
        isError: boolean
        isLoading: boolean
      }
    >()
    eventRunIds.forEach((runId, index) => {
      const query = eventQueries[index]
      map.set(runId, {
        isError: Boolean(query?.isError),
        isLoading: Boolean(query?.isLoading),
      })
    })
    return map
  }, [eventQueries, eventRunIds])

  const filteredRuns = useMemo(
    () =>
      runs
        .filter((run) => (projectFilter === 'all' ? true : run.project_id === projectFilter))
        .filter((run) => (agentFilter === 'all' ? true : run.agent_id === agentFilter))
        .filter((run) => (statusFilter === 'all' ? true : run.status === statusFilter))
        .filter((run) => matchesTimeRange(run, timeRange))
        .sort(sortRunsNewestFirst),
    [agentFilter, projectFilter, runs, statusFilter, timeRange],
  )

  const visibleActiveRuns = useMemo(
    () => filteredRuns.filter(isRunningRun),
    [filteredRuns],
  )
  const recentRuns = useMemo(
    () => filteredRuns.filter((run) => !isRunningRun(run)),
    [filteredRuns],
  )
  const hasFiltersApplied =
    projectFilter !== 'all' ||
    agentFilter !== 'all' ||
    statusFilter !== 'all' ||
    timeRange !== 'today'

  useEffect(() => {
    const selectedVisible = selectedRunId
      ? filteredRuns.some((run) => run.id === selectedRunId)
      : false

    if (selectedVisible) return
    if (visibleActiveRuns[0]) {
      setSelectedRunId(visibleActiveRuns[0].id)
      return
    }
    if (selectedRunId && !filteredRuns.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(null)
    }
  }, [filteredRuns, selectedRunId, visibleActiveRuns])

  useEffect(() => {
    const source = new EventSource('/api/events')

    function handleActivity(event: Event) {
      if (!(event instanceof MessageEvent)) return
      const payload = parseActivityEvent(event.data)
      const title = typeof payload?.title === 'string' ? payload.title : ''
      if (
        title === 'Gateway event: task_run_created' ||
        title === 'Gateway event: task_run_status'
      ) {
        void queryClient.invalidateQueries({ queryKey: ['workspace', 'task-runs'] })
      }
    }

    source.addEventListener('activity', handleActivity)
    return () => {
      source.removeEventListener('activity', handleActivity)
      source.close()
    }
  }, [queryClient])

  const controlMutation = useMutation({
    mutationFn: async ({
      runId,
      action,
    }: {
      runId: string
      action: 'pause' | 'stop'
    }) =>
      apiRequest(`/api/workspace/task-runs/${runId}/${action}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      }),
    onSuccess: (_, variables) => {
      toast(variables.action === 'pause' ? 'Run paused' : 'Run stopped', {
        type: 'success',
      })
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'task-runs'] })
      void queryClient.invalidateQueries({
        queryKey: ['workspace', 'task-runs', variables.runId, 'events'],
      })
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to control run', {
        type: 'error',
      })
    },
  })

  const projectOptions = useMemo(
    () => [
      { label: 'All projects', value: 'all' },
      ...(projectsQuery.data ?? []).map((project: WorkspaceProject) => ({
        label: project.name,
        value: project.id,
      })),
    ],
    [projectsQuery.data],
  )

  const agentOptions = useMemo(
    () => [
      { label: 'All agents', value: 'all' },
      ...(agentsQuery.data ?? []).map((agent: WorkspaceAgent) => ({
        label: agent.name,
        value: agent.id,
      })),
    ],
    [agentsQuery.data],
  )

  const statusOptions: Array<{ label: string; value: StatusFilter }> = [
    { label: 'All statuses', value: 'all' },
    { label: 'Running', value: 'running' },
    { label: 'Completed', value: 'completed' },
    { label: 'Failed', value: 'failed' },
    { label: 'Paused', value: 'paused' },
    { label: 'Stopped', value: 'stopped' },
    { label: 'Awaiting review', value: 'awaiting_review' },
  ]

  const timeOptions: Array<{ label: string; value: RunTimeRange }> = [
    { label: 'Last hour', value: 'last_hour' },
    { label: 'Today', value: 'today' },
    { label: 'All time', value: 'all' },
  ]

  return (
    <main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-900 md:px-6 md:pt-8">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-6">
        <header className="rounded-xl border border-primary-200 bg-primary-50/80 px-5 py-4 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <div className="flex size-11 items-center justify-center rounded-xl border border-accent-500/30 bg-accent-500/10 text-accent-400">
                <HugeiconsIcon icon={PlayCircleIcon} className="size-6" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-primary-900">
                  Runs / Console
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-primary-500">
                  Cross-project visibility into live agent execution, recent completions,
                  and run output.
                </p>
              </div>
            </div>

            <div className="flex w-full max-w-4xl flex-col gap-3 xl:items-end">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary-500">
                <HugeiconsIcon icon={FilterHorizontalIcon} className="size-4 text-accent-300" />
                Filters
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <FilterSelect
                  label="Project"
                  value={projectFilter}
                  onChange={setProjectFilter}
                  options={projectOptions}
                />
                <FilterSelect
                  label="Agent"
                  value={agentFilter}
                  onChange={setAgentFilter}
                  options={agentOptions}
                />
                <FilterSelect
                  label="Status"
                  value={statusFilter}
                  onChange={(value) => setStatusFilter(value as StatusFilter)}
                  options={statusOptions}
                />
                <FilterSelect
                  label="Time Range"
                  value={timeRange}
                  onChange={(value) => setTimeRange(value as RunTimeRange)}
                  options={timeOptions}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-primary-500">
                <span>
                  Showing {filteredRuns.length} run{filteredRuns.length === 1 ? '' : 's'}
                </span>
                {hasFiltersApplied ? (
                  <button
                    type="button"
                    onClick={() => {
                      setProjectFilter('all')
                      setAgentFilter('all')
                      setStatusFilter('all')
                      setTimeRange('today')
                    }}
                    className="rounded-full border border-primary-200 bg-white px-3 py-1 text-primary-600 transition-colors hover:border-accent-500/50 hover:text-accent-400"
                  >
                    Reset filters
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-primary-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <HugeiconsIcon icon={Task01Icon} className="size-5 text-accent-300" />
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-primary-500">
                  Active Runs
                </p>
                <p className="text-2xl font-semibold text-primary-900">
                  {visibleActiveRuns.length}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-primary-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <HugeiconsIcon
                icon={TimeQuarterPassIcon}
                className="size-5 text-accent-300"
              />
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-primary-500">
                  Recent Runs
                </p>
                <p className="text-2xl font-semibold text-primary-900">
                  {recentRuns.length}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-primary-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <HugeiconsIcon icon={PlayCircleIcon} className="size-5 text-accent-300" />
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-primary-500">
                  Refresh
                </p>
                <p className="text-sm font-medium text-primary-900">
                  SSE updates + 2s live panel polling
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-primary-900">Active Runs</h2>
            {runsQuery.isFetching ? (
              <span className="text-xs text-primary-500">Syncing latest activity...</span>
            ) : null}
          </div>

          {runsQuery.isLoading ? (
            <div className="rounded-xl border border-primary-200 bg-white px-6 py-14 text-center text-primary-600 shadow-sm">
              Loading active runs...
            </div>
          ) : visibleActiveRuns.length > 0 ? (
            <div className="space-y-4">
              {visibleActiveRuns.map((run) => (
                <ActiveRunCard
                  key={run.id}
                  isExpanded={selectedRunId === run.id}
                  isSelected={selectedRunId === run.id}
                  run={run}
                  events={eventsByRunId.get(run.id) ?? []}
                  eventLoading={eventQueryStateByRunId.get(run.id)?.isLoading ?? false}
                  eventError={eventQueryStateByRunId.get(run.id)?.isError ?? false}
                  actionPending={controlMutation.isPending}
                  onSelect={setSelectedRunId}
                  onToggleExpand={(runId) =>
                    setSelectedRunId((current) => (current === runId ? null : runId))
                  }
                  onPause={(runId) => controlMutation.mutate({ runId, action: 'pause' })}
                  onStop={(runId) => controlMutation.mutate({ runId, action: 'stop' })}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/70 px-6 py-14 text-center">
              <p className="text-lg font-semibold text-primary-900">No active runs</p>
              <p className="mt-2 text-sm text-primary-500">
                Start a mission from a project to see live agent activity here.
              </p>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-primary-900">Recent Runs</h2>
            <span className="text-xs text-primary-500">
              Click any row to inspect the run log
            </span>
          </div>

          <div className="hidden rounded-xl border border-primary-200 bg-primary-50/70 px-4 py-3 text-xs uppercase tracking-[0.18em] text-primary-500 md:grid md:grid-cols-[minmax(0,2fr)_1.05fr_1fr_0.9fr_0.75fr_0.7fr_0.8fr_0.95fr_auto] md:items-center">
            <span>Task</span>
            <span>Project</span>
            <span>Agent</span>
            <span>Status</span>
            <span>Duration</span>
            <span>Tokens</span>
            <span>Cost</span>
            <span>Timestamp</span>
            <span />
          </div>

          {recentRuns.length > 0 ? (
            <div className="space-y-3">
              {recentRuns.map((run) => (
                <RecentRunRow
                  key={run.id}
                  isExpanded={selectedRunId === run.id}
                  isSelected={selectedRunId === run.id}
                  events={eventsByRunId.get(run.id) ?? []}
                  eventLoading={eventQueryStateByRunId.get(run.id)?.isLoading ?? false}
                  eventError={eventQueryStateByRunId.get(run.id)?.isError ?? false}
                  run={run}
                  onSelect={setSelectedRunId}
                  onToggleExpand={(runId) =>
                    setSelectedRunId((current) => (current === runId ? null : runId))
                  }
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/70 px-6 py-14 text-center">
              <p className="text-lg font-semibold text-primary-900">No recent runs</p>
              <p className="mt-2 text-sm text-primary-500">
                There are no completed, paused, or failed runs for the current filters.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
