import {
  ArrowDown01Icon,
  FilterHorizontalIcon,
  PauseIcon,
  PlayCircleIcon,
  SquareArrowDown02Icon,
  Task01Icon,
  TimeQuarterPassIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '@/components/ui/toast'
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
  formatRunStatus,
  formatRunTimestamp,
  formatRunTokens,
  getConsoleLineClass,
  getRunEventMessage,
  getRunProgress,
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
                {new Date(event.created_at).toLocaleTimeString([], {
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
  run,
  events,
  actionPending,
  onPause,
  onStop,
}: {
  run: WorkspaceTaskRun
  events: Array<WorkspaceRunEvent>
  actionPending: boolean
  onPause: (runId: string) => void
  onStop: (runId: string) => void
}) {
  const progress = getRunProgress(run, events)

  return (
    <article className="rounded-xl border border-primary-200 bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-col gap-4 border-b border-primary-200 pb-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent-500/30 bg-accent-500/10 px-3 py-1 text-xs font-medium text-accent-300">
              <span className="size-2 rounded-full bg-accent-400" />
              Live run
            </span>
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getRunStatusClass(
                run.status,
              )}`}
            >
              {formatRunStatus(run.status)}
            </span>
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
            disabled={actionPending}
            onClick={() => onPause(run.id)}
            className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm font-medium text-primary-800 transition-colors hover:border-amber-500/50 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <HugeiconsIcon icon={PauseIcon} className="size-4" />
            Pause
          </button>
          <button
            type="button"
            disabled={actionPending}
            onClick={() => onStop(run.id)}
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
                className="h-2 rounded-full bg-accent-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

function RecentRunRow({
  run,
  events,
  expanded,
  onToggle,
}: {
  run: WorkspaceTaskRun
  events: Array<WorkspaceRunEvent>
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <article className="rounded-xl border border-primary-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col gap-4 px-4 py-4 text-left transition-colors hover:bg-primary-50 md:grid md:grid-cols-[minmax(0,2fr)_1.05fr_1fr_0.9fr_0.75fr_0.7fr_0.8fr_0.95fr_auto] md:items-center"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-primary-900">{run.task_name}</p>
          <p className="mt-1 text-xs text-primary-500">{run.mission_name}</p>
        </div>
        <p className="text-sm text-primary-600">{run.project_name}</p>
        <p className="text-sm text-primary-600">{run.agent_name ?? 'Unknown agent'}</p>
        <div>
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getRunStatusClass(
              run.status,
            )}`}
          >
            {formatRunStatus(run.status)}
          </span>
        </div>
        <p className="text-sm text-primary-600">{formatRunDuration(run)}</p>
        <p className="text-sm text-primary-600">{formatRunTokens(run)}</p>
        <p className="text-sm text-primary-600">{formatRunCost(run.cost_cents)}</p>
        <p className="text-sm text-primary-600">
          {formatRunTimestamp(run.completed_at ?? run.started_at)}
        </p>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className={`size-4 text-primary-500 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {expanded ? (
        <div className="border-t border-primary-200 px-4 py-4">
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-primary-200 bg-primary-50/70 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-primary-500">Started</p>
              <p className="mt-1 text-sm text-primary-900">
                {formatRunTimestamp(run.started_at)}
              </p>
            </div>
            <div className="rounded-xl border border-primary-200 bg-primary-50/70 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-primary-500">Cost</p>
              <p className="mt-1 text-sm text-primary-900">
                {formatRunCost(run.cost_cents)}
              </p>
            </div>
            <div className="rounded-xl border border-primary-200 bg-primary-50/70 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-primary-500">Workspace</p>
              <p className="mt-1 truncate text-sm text-primary-900">
                {run.workspace_path ?? 'No workspace recorded'}
              </p>
            </div>
            <div className="rounded-xl border border-primary-200 bg-primary-50/70 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-primary-500">Error</p>
              <p className="mt-1 text-sm text-primary-900">
                {run.error ?? 'No error recorded'}
              </p>
            </div>
          </div>
          <RunLog events={events} />
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
  const [expandedRunIds, setExpandedRunIds] = useState<Record<string, boolean>>({})

  const runsQuery = useQuery({
    queryKey: ['workspace', 'task-runs'],
    queryFn: async () => extractTaskRuns(await apiRequest('/api/workspace/task-runs')),
    refetchInterval: 5_000,
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
  const expandedRecentRunIds = useMemo(
    () => Object.entries(expandedRunIds).flatMap(([id, expanded]) => (expanded ? [id] : [])),
    [expandedRunIds],
  )
  const eventRunIds = useMemo(
    () => Array.from(new Set([...activeRuns.map((run) => run.id), ...expandedRecentRunIds])),
    [activeRuns, expandedRecentRunIds],
  )

  const eventQueries = useQueries({
    queries: eventRunIds.map((runId) => ({
      queryKey: ['workspace', 'task-runs', runId, 'events'],
      queryFn: async () =>
        extractRunEvents(await apiRequest(`/api/workspace/task-runs/${runId}/events`)),
      refetchInterval: activeRuns.some((run) => run.id === runId) ? 5_000 : false,
      staleTime: 1_000,
    })),
  })

  const eventsByRunId = useMemo(() => {
    const map = new Map<string, Array<WorkspaceRunEvent>>()
    eventRunIds.forEach((runId, index) => {
      map.set(runId, eventQueries[index]?.data ?? [])
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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
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
                  Auto-refreshing every 5 seconds
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
                  run={run}
                  events={eventsByRunId.get(run.id) ?? []}
                  actionPending={controlMutation.isPending}
                  onPause={(runId) => controlMutation.mutate({ runId, action: 'pause' })}
                  onStop={(runId) => controlMutation.mutate({ runId, action: 'stop' })}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/70 px-6 py-14 text-center">
              <p className="text-lg font-semibold text-primary-900">No active runs</p>
              <p className="mt-2 text-sm text-primary-500">
                Adjust the filters or wait for the next task dispatch.
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
                  run={run}
                  events={eventsByRunId.get(run.id) ?? []}
                  expanded={Boolean(expandedRunIds[run.id])}
                  onToggle={() =>
                    setExpandedRunIds((current) => ({
                      ...current,
                      [run.id]: !current[run.id],
                    }))
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
