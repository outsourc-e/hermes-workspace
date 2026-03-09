import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  ComputerTerminal01Icon,
  Folder01Icon,
  PlayCircleIcon,
  Task01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  extractAgents,
  extractProjects,
  extractRunEvents,
  extractTaskRuns,
  type WorkspaceAgent,
  type WorkspaceProject,
  type WorkspaceRunEvent,
  type WorkspaceTaskRun,
} from '@/screens/projects/lib/workspace-types'
import {
  formatRelativeTime,
  formatStatus,
  getStatusBadgeClass,
} from '@/screens/projects/lib/workspace-utils'

const RUN_POLL_MS = 5_000

type StatusFilter = 'all' | 'running' | 'completed' | 'failed'
type TimeRangeFilter = 'hour' | 'today' | 'all'

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

function parseTime(value?: string): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function matchesTimeRange(run: WorkspaceTaskRun, range: TimeRangeFilter): boolean {
  if (range === 'all') return true

  const timestamp =
    parseTime(run.started_at) ??
    parseTime(run.completed_at) ??
    Number.NaN

  if (!Number.isFinite(timestamp)) return false

  const now = Date.now()
  if (range === 'hour') {
    return now - timestamp <= 60 * 60 * 1000
  }

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  return timestamp >= startOfDay.getTime()
}

function formatTimestamp(value?: string): string {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatDuration(startedAt?: string, completedAt?: string): string {
  const start = parseTime(startedAt)
  const end = parseTime(completedAt) ?? Date.now()
  if (!start || end < start) return 'n/a'

  const totalSeconds = Math.max(0, Math.round((end - start) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function formatTokens(run: WorkspaceTaskRun): string {
  const total = run.input_tokens + run.output_tokens
  return total > 0 ? total.toLocaleString() : '0'
}

function formatCost(costCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(costCents / 100)
}

function getRunPreview(events: WorkspaceRunEvent[]): string[] {
  const lines = events
    .map((event) => {
      const message = event.data?.message
      if (typeof message === 'string' && message.trim().length > 0) {
        return message.trimEnd()
      }

      if (event.type === 'started') {
        return 'Run started'
      }
      if (event.type === 'completed') {
        return 'Run completed'
      }
      if (event.type === 'error') {
        return 'Run failed'
      }

      const fallback = event.data
        ? JSON.stringify(event.data)
        : event.type.replace(/_/g, ' ')
      return fallback
    })
    .filter((line) => line.length > 0)

  return lines.length > 0 ? lines : ['Waiting for run output…']
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
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-[11px] uppercase tracking-[0.16em] text-primary-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-xl border border-primary-800 bg-primary-900 px-3 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
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

function RunsLog({
  runId,
  active,
  compact = false,
}: {
  runId: string
  active: boolean
  compact?: boolean
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const eventsQuery = useQuery({
    queryKey: ['workspace', 'task-run-events', runId],
    queryFn: async () =>
      extractRunEvents(
        await apiRequest(`/api/workspace/task-runs/${encodeURIComponent(runId)}/events`),
      ),
    refetchInterval: active ? RUN_POLL_MS : false,
  })

  const lines = useMemo(
    () => getRunPreview(eventsQuery.data ?? []),
    [eventsQuery.data],
  )

  useEffect(() => {
    const node = viewportRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [lines.length])

  if (eventsQuery.isLoading) {
    return (
      <div className="rounded-2xl border border-primary-800 bg-primary-950/90 p-4">
        <div className="h-24 animate-pulse rounded-xl bg-primary-900/70" />
      </div>
    )
  }

  if (eventsQuery.isError) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
        {eventsQuery.error instanceof Error
          ? eventsQuery.error.message
          : 'Failed to load run output'}
      </div>
    )
  }

  return (
    <div
      ref={viewportRef}
      className={cn(
        'overflow-y-auto rounded-2xl border border-primary-800 bg-primary-950/95 font-mono text-[12px] leading-6 text-primary-200',
        compact ? 'max-h-52 p-3' : 'max-h-72 p-4',
      )}
    >
      {lines.map((line, index) => (
        <div
          key={`${runId}-${index}-${line.slice(0, 24)}`}
          className="whitespace-pre-wrap break-words"
        >
          <span className="mr-2 text-primary-500">$</span>
          {line}
        </div>
      ))}
    </div>
  )
}

function ActiveRunCard({ run }: { run: WorkspaceTaskRun }) {
  return (
    <article className="rounded-3xl border border-primary-800 bg-primary-900/80 p-5 shadow-[0_20px_60px_rgba(3,7,18,0.35)]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
                  getStatusBadgeClass(run.status),
                )}
              >
                <span className="h-2 w-2 rounded-full bg-current opacity-80" />
                {formatStatus(run.status)}
              </span>
              <span className="rounded-full border border-primary-700 bg-primary-800/80 px-3 py-1 text-xs text-primary-300">
                Attempt {run.attempt}
              </span>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-primary-100">
                {run.task_name}
              </h3>
              <p className="mt-1 text-sm text-primary-300">
                {run.agent_name || 'Unassigned agent'}
                {run.project_name ? ` · ${run.project_name}` : ''}
                {run.mission_name ? ` · ${run.mission_name}` : ''}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-primary-800 bg-primary-950/40 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.16em] text-primary-500">
                Elapsed
              </p>
              <p className="mt-1 text-sm font-medium text-primary-100">
                {formatDuration(run.started_at)}
              </p>
            </div>
            <div className="rounded-2xl border border-primary-800 bg-primary-950/40 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.16em] text-primary-500">
                Started
              </p>
              <p className="mt-1 text-sm font-medium text-primary-100">
                {run.started_at ? formatRelativeTime(run.started_at) : 'Unknown'}
              </p>
            </div>
            <div className="rounded-2xl border border-primary-800 bg-primary-950/40 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.16em] text-primary-500">
                Tokens
              </p>
              <p className="mt-1 text-sm font-medium text-primary-100">
                {formatTokens(run)}
              </p>
            </div>
            <div className="rounded-2xl border border-primary-800 bg-primary-950/40 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.16em] text-primary-500">
                Workspace
              </p>
              <p className="mt-1 truncate text-sm font-medium text-primary-100">
                {run.workspace_path || 'Allocating…'}
              </p>
            </div>
          </div>
        </div>

        <RunsLog runId={run.id} active />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled
              title="Pause is not exposed by the daemon for active task runs yet."
              className="border-primary-700 bg-primary-900/60 text-primary-300"
            >
              <HugeiconsIcon icon={Clock01Icon} size={16} strokeWidth={1.8} />
              Pause
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled
              title="Stop is not exposed by the daemon for active task runs yet."
              className="border-primary-700 bg-primary-900/60 text-primary-300"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
              Stop
            </Button>
          </div>
          <p className="text-xs text-primary-500">
            Run controls are pending daemon support.
          </p>
        </div>
      </div>
    </article>
  )
}

function RecentRunRow({
  run,
  expanded,
  onToggle,
}: {
  run: WorkspaceTaskRun
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="rounded-2xl border border-primary-800 bg-primary-900/65">
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-primary-800/40 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_auto_auto_auto_auto]"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-primary-100">
            {run.task_name}
          </p>
          <p className="mt-1 truncate text-xs text-primary-400">
            {run.mission_name || 'No mission'}
          </p>
        </div>
        <p className="truncate text-sm text-primary-300">
          {run.project_name || 'Unknown project'}
        </p>
        <p className="truncate text-sm text-primary-300">
          {run.agent_name || 'Unassigned'}
        </p>
        <div className="sm:text-right">
          <span
            className={cn(
              'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium',
              getStatusBadgeClass(run.status),
            )}
          >
            {formatStatus(run.status)}
          </span>
        </div>
        <p className="text-sm text-primary-300 sm:text-right">
          {formatDuration(run.started_at, run.completed_at)}
        </p>
        <p className="text-sm text-primary-300 sm:text-right">
          {formatTokens(run)}
          <span className="ml-2 text-primary-500">{formatCost(run.cost_cents)}</span>
        </p>
        <p className="text-sm text-primary-300 sm:text-right">
          {formatTimestamp(run.completed_at || run.started_at)}
        </p>
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden border-t border-primary-800"
          >
            <div className="space-y-3 p-4">
              {run.error ? (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {run.error}
                </div>
              ) : null}
              <RunsLog runId={run.id} active={false} compact />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function RunsConsoleScreen() {
  const [projectFilter, setProjectFilter] = useState('all')
  const [agentFilter, setAgentFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>('today')
  const [expandedRunIds, setExpandedRunIds] = useState<Record<string, boolean>>({})

  const projectsQuery = useQuery({
    queryKey: ['workspace', 'projects'],
    queryFn: async () => extractProjects(await apiRequest('/api/workspace/projects')),
  })

  const agentsQuery = useQuery({
    queryKey: ['workspace', 'agents'],
    queryFn: async () => extractAgents(await apiRequest('/api/workspace/agents')),
  })

  const runsQuery = useQuery({
    queryKey: ['workspace', 'task-runs'],
    queryFn: async () => extractTaskRuns(await apiRequest('/api/workspace/task-runs')),
    refetchInterval: RUN_POLL_MS,
  })

  const projects = projectsQuery.data ?? []
  const agents = agentsQuery.data ?? []
  const runs = runsQuery.data ?? []

  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      if (projectFilter !== 'all' && run.project_id !== projectFilter) return false
      if (agentFilter !== 'all' && run.agent_id !== agentFilter) return false
      if (statusFilter !== 'all' && run.status !== statusFilter) return false
      return matchesTimeRange(run, timeRange)
    })
  }, [agentFilter, projectFilter, runs, statusFilter, timeRange])

  const activeRuns = useMemo(
    () => filteredRuns.filter((run) => run.status === 'running'),
    [filteredRuns],
  )

  const recentRuns = useMemo(
    () =>
      filteredRuns
        .filter((run) => run.status !== 'running')
        .sort((a, b) => {
          const aTime = parseTime(a.completed_at) ?? parseTime(a.started_at) ?? 0
          const bTime = parseTime(b.completed_at) ?? parseTime(b.started_at) ?? 0
          return bTime - aTime
        }),
    [filteredRuns],
  )

  const isLoading =
    projectsQuery.isLoading || agentsQuery.isLoading || runsQuery.isLoading
  const loadError =
    projectsQuery.error || agentsQuery.error || runsQuery.error || null

  const projectOptions = useMemo(
    () => [
      { label: 'All projects', value: 'all' },
      ...projects.map((project: WorkspaceProject) => ({
        label: project.name,
        value: project.id,
      })),
    ],
    [projects],
  )

  const agentOptions = useMemo(
    () => [
      { label: 'All agents', value: 'all' },
      ...agents.map((agent: WorkspaceAgent) => ({
        label: agent.name,
        value: agent.id,
      })),
    ],
    [agents],
  )

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <div className="animate-pulse rounded-3xl border border-primary-800 bg-primary-900/70 p-6">
          <div className="h-7 w-48 rounded-lg bg-primary-800/80" />
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-16 rounded-2xl bg-primary-800/70"
              />
            ))}
          </div>
        </div>
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="h-72 animate-pulse rounded-3xl border border-primary-800 bg-primary-900/70"
          />
        ))}
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-lg rounded-3xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <p className="text-lg font-semibold text-red-100">
            Failed to load runs console
          </p>
          <p className="mt-2 text-sm text-red-200">
            {loadError instanceof Error
              ? loadError.message
              : 'An unexpected error occurred'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.12),transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,1))] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-primary-800 bg-primary-900/75 p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-accent-500/30 bg-accent-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-accent-300">
                <HugeiconsIcon
                  icon={ComputerTerminal01Icon}
                  size={15}
                  strokeWidth={1.9}
                />
                Workspace Ops
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-primary-100 sm:text-3xl">
                  Runs / Console
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-primary-300">
                  Monitor active agent runs and inspect recent execution logs
                  across every project.
                </p>
              </div>
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
                options={[
                  { label: 'All statuses', value: 'all' },
                  { label: 'Running', value: 'running' },
                  { label: 'Completed', value: 'completed' },
                  { label: 'Failed', value: 'failed' },
                ]}
              />
              <FilterSelect
                label="Range"
                value={timeRange}
                onChange={(value) => setTimeRange(value as TimeRangeFilter)}
                options={[
                  { label: 'Last hour', value: 'hour' },
                  { label: 'Today', value: 'today' },
                  { label: 'All time', value: 'all' },
                ]}
              />
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-primary-800 bg-primary-950/35 p-4">
              <p className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-primary-500">
                <HugeiconsIcon icon={PlayCircleIcon} size={15} strokeWidth={1.9} />
                Active Runs
              </p>
              <p className="mt-2 text-2xl font-semibold text-primary-100">
                {activeRuns.length}
              </p>
            </div>
            <div className="rounded-2xl border border-primary-800 bg-primary-950/35 p-4">
              <p className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-primary-500">
                <HugeiconsIcon icon={Task01Icon} size={15} strokeWidth={1.9} />
                Recent Runs
              </p>
              <p className="mt-2 text-2xl font-semibold text-primary-100">
                {recentRuns.length}
              </p>
            </div>
            <div className="rounded-2xl border border-primary-800 bg-primary-950/35 p-4">
              <p className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-primary-500">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={15} strokeWidth={1.9} />
                Completed
              </p>
              <p className="mt-2 text-2xl font-semibold text-primary-100">
                {filteredRuns.filter((run) => run.status === 'completed').length}
              </p>
            </div>
            <div className="rounded-2xl border border-primary-800 bg-primary-950/35 p-4">
              <p className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-primary-500">
                <HugeiconsIcon icon={Folder01Icon} size={15} strokeWidth={1.9} />
                Projects
              </p>
              <p className="mt-2 text-2xl font-semibold text-primary-100">
                {new Set(filteredRuns.map((run) => run.project_id).filter(Boolean)).size}
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-primary-100">
                Active Runs
              </h2>
              <p className="mt-1 text-sm text-primary-400">
                Live output refreshes every 5 seconds.
              </p>
            </div>
          </div>

          {activeRuns.length > 0 ? (
            <div className="space-y-4">
              {activeRuns.map((run) => (
                <ActiveRunCard key={run.id} run={run} />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-primary-800 bg-primary-900/45 px-6 py-12 text-center">
              <p className="text-lg font-medium text-primary-200">
                No active runs match the current filters.
              </p>
              <p className="mt-2 text-sm text-primary-500">
                Adjust the filters or wait for the next task dispatch.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-primary-800 bg-primary-900/70 p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-primary-100">
                Recent Runs
              </h2>
              <p className="mt-1 text-sm text-primary-400">
                Expand any run to inspect its execution log.
              </p>
            </div>
            <p className="text-xs uppercase tracking-[0.16em] text-primary-500">
              Task · Project · Agent · Status · Duration · Tokens · Timestamp
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {recentRuns.length > 0 ? (
              recentRuns.map((run) => (
                <RecentRunRow
                  key={run.id}
                  run={run}
                  expanded={Boolean(expandedRunIds[run.id])}
                  onToggle={() =>
                    setExpandedRunIds((current) => ({
                      ...current,
                      [run.id]: !current[run.id],
                    }))
                  }
                />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-primary-800 bg-primary-950/30 px-6 py-12 text-center">
                <p className="text-lg font-medium text-primary-200">
                  No recent runs match the current filters.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
