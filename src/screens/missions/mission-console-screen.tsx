import {
  ArrowRight01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  PauseIcon,
  PlayCircleIcon,
  Task01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import YAML from 'yaml'
import { Button, buttonVariants } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { workspaceRequestJson } from '@/lib/workspace-checkpoints'
import { cn } from '@/lib/utils'
import {
  extractActivityEvents,
  extractProject,
  extractRunEvents,
  extractTaskRuns,
  normalizeMission,
  normalizeActivityEvent,
  normalizeRunEvent,
  type WorkspaceActivityEvent,
  type WorkspaceProject,
  type WorkspaceRunEvent,
  type WorkspaceTaskRun,
} from '@/screens/projects/lib/workspace-types'
import {
  formatStatus,
  getStatusBadgeClass,
} from '@/screens/projects/lib/workspace-utils'

type MissionConsoleScreenProps = {
  missionId: string
  projectId: string
}

type MissionStatusTask = {
  id: string
  name: string
  status: string
  agent_id?: string | null
  started_at?: string | null
  completed_at?: string | null
}

type MissionStatusPayload = {
  mission: {
    id: string
    name: string
    status: string
    progress: number
  }
  task_breakdown: MissionStatusTask[]
  running_agents: string[]
  completed_count: number
  total_count: number
  estimated_completion: string | null
}

type ConsoleFeedItem = {
  id: string
  timestamp: string
  type: string
  message: string
}

type MissionListItem = {
  missionId: string
  missionName: string
  status: string
  projectId: string
  projectName: string
}

type WorkflowPolicy = {
  maxConcurrentAgents: number
  checks: Record<'tsc' | 'tests' | 'lint' | 'e2e', boolean>
  tools: Array<{ label: string; enabled: boolean }>
}

const STREAM_EVENT_NAMES = [
  'run_event',
  'task_run.started',
  'task_run.updated',
  'task.updated',
  'mission.progress',
  'mission.updated',
  'activity_log',
  'checkpoint.created',
  'checkpoint.updated',
]

const DEFAULT_POLICY: WorkflowPolicy = {
  maxConcurrentAgents: 4,
  checks: {
    tsc: true,
    tests: true,
    lint: false,
    e2e: false,
  },
  tools: [
    { label: 'Git', enabled: true },
    { label: 'Shell', enabled: true },
    { label: 'Browser', enabled: true },
    { label: 'Network', enabled: true },
  ],
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

async function postWorkspaceAction(input: string): Promise<void> {
  const response = await fetch(input, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: '{}',
  })

  const payload = await readPayload(response)
  if (response.ok) return

  const record =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null
  throw new Error(
    (typeof record?.error === 'string' && record.error) ||
      `Request failed with status ${response.status}`,
  )
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseMissionStatus(payload: unknown): MissionStatusPayload | null {
  const record = asRecord(payload)
  const mission = asRecord(record?.mission)
  const taskBreakdown = Array.isArray(record?.task_breakdown)
    ? record.task_breakdown
        .map((task) => {
          const taskRecord = asRecord(task)
          if (!taskRecord) return null

          return {
            id: asString(taskRecord.id) ?? crypto.randomUUID(),
            name: asString(taskRecord.name) ?? 'Untitled task',
            status: asString(taskRecord.status) ?? 'pending',
            agent_id: asString(taskRecord.agent_id),
            started_at: asString(taskRecord.started_at),
            completed_at: asString(taskRecord.completed_at),
          }
        })
        .filter(Boolean)
    : []

  if (!mission) return null

  return {
    mission: {
      id: asString(mission.id) ?? '',
      name: asString(mission.name) ?? 'Mission',
      status: asString(mission.status) ?? 'pending',
      progress: Math.max(0, Math.min(100, asNumber(mission.progress) ?? 0)),
    },
    task_breakdown: taskBreakdown as MissionStatusTask[],
    running_agents: Array.isArray(record?.running_agents)
      ? record.running_agents.flatMap((value) =>
          typeof value === 'string' ? [value] : [],
        )
      : [],
    completed_count: Math.max(0, asNumber(record?.completed_count) ?? 0),
    total_count: Math.max(0, asNumber(record?.total_count) ?? taskBreakdown.length),
    estimated_completion: asString(record?.estimated_completion),
  }
}

function extractMissionList(payload: unknown): MissionListItem[] {
  const record = asRecord(payload)
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.missions)
      ? record.missions
      : Array.isArray(record?.items)
        ? record.items
        : Array.isArray(record?.data)
          ? record.data
          : []

  return source.flatMap((value) => {
    const missionRecord = asRecord(value)
    if (!missionRecord) return []

    const mission = normalizeMission(missionRecord)
    const projectRecord = asRecord(missionRecord.project)

    return [
      {
        missionId: mission.id,
        missionName: mission.name,
        status: mission.status,
        projectId:
          asString(missionRecord.project_id) ??
          asString(projectRecord?.id) ??
          '',
        projectName:
          asString(missionRecord.project_name) ??
          asString(projectRecord?.name) ??
          'Unassigned project',
      },
    ]
  })
}

function getRunEventText(event: WorkspaceRunEvent): string {
  const message = event.data?.message
  if (typeof message === 'string' && message.trim().length > 0) {
    return message.trimEnd()
  }

  const summary = event.data?.summary
  if (typeof summary === 'string' && summary.trim().length > 0) {
    return summary
  }

  const status = event.data?.status
  if (typeof status === 'string' && status.trim().length > 0) {
    return `Status: ${formatStatus(status)}`
  }

  return formatStatus(event.type)
}

function getTaskProgress(events: Array<WorkspaceRunEvent>, status: string): number | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const progress = asNumber(events[index]?.data?.progress)
    if (progress !== null) {
      return Math.max(0, Math.min(100, Math.round(progress)))
    }
  }

  if (status === 'completed' || status === 'done') return 100
  if (status === 'failed') return 100
  if (status === 'paused') return null
  if (status !== 'running' && status !== 'active') return null

  const weightedProgress = events.reduce((score, event) => {
    if (event.type === 'output') return score + 7
    if (event.type === 'tool_use') return score + 12
    if (event.type === 'checkpoint') return score + 18
    if (event.type === 'status') return score + 6
    return score + 2
  }, 10)

  return Math.max(10, Math.min(94, weightedProgress))
}

function formatElapsed(startedAt: string | null, now: number): string {
  if (!startedAt) return '--:--'
  const startMs = new Date(startedAt).getTime()
  if (!Number.isFinite(startMs)) return '--:--'

  const totalSeconds = Math.max(0, Math.floor((now - startMs) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
      seconds,
    ).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatActivityTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--'

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function getTaskStatusTone(status: string) {
  if (status === 'completed' || status === 'done') {
    return {
      icon: CheckmarkCircle02Icon,
      className: 'text-green-300',
      label: 'Done',
    }
  }

  if (status === 'running' || status === 'active') {
    return {
      icon: PlayCircleIcon,
      className: 'text-amber-300',
      label: 'Running',
    }
  }

  if (status === 'paused' || status === 'waiting' || status === 'pending' || status === 'ready') {
    return {
      icon: PauseIcon,
      className: 'text-primary-400',
      label: status === 'paused' ? 'Paused' : 'Waiting',
    }
  }

  if (status === 'failed' || status === 'stopped') {
    return {
      icon: Cancel01Icon,
      className: 'text-red-300',
      label: 'Failed',
    }
  }

  return {
    icon: Clock01Icon,
    className: 'text-primary-400',
    label: formatStatus(status),
  }
}

function getAgentTone(agentName: string | null | undefined) {
  const value = agentName?.toLowerCase() ?? ''
  if (value.includes('codex')) return 'bg-green-400'
  if (value.includes('claude')) return 'bg-fuchsia-400'
  return 'bg-accent-400'
}

function toConsoleFeedItemFromActivity(event: WorkspaceActivityEvent): ConsoleFeedItem {
  const data = asRecord(event.data)
  const message =
    asString(data?.task_name) ||
    asString(data?.mission_name) ||
    asString(data?.summary) ||
    formatStatus(event.type.replace(/\./g, ' '))

  return {
    id: String(event.id),
    timestamp: event.timestamp,
    type: event.type,
    message,
  }
}

function toConsoleFeedItemFromStream(
  eventName: string,
  payload: unknown,
): ConsoleFeedItem | null {
  const record = asRecord(payload)
  if (!record) return null

  const timestamp =
    asString(record.created_at) ??
    asString(record.timestamp) ??
    new Date().toISOString()

  const message =
    asString(record.message) ??
    asString(record.error) ??
    asString(record.name) ??
    asString(record.mission_name) ??
    asString(record.task_name) ??
    (eventName === 'mission.progress'
      ? `${Math.round(asNumber(record.progress) ?? 0)}% · ${Math.round(
          asNumber(record.completed_count) ?? 0,
        )}/${Math.round(asNumber(record.total_count) ?? 0)} tasks`
      : null) ??
    formatStatus(eventName.replace(/\./g, ' '))

  return {
    id: `${eventName}:${timestamp}:${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    type: eventName,
    message,
  }
}

function mergeRunEvents(
  baseEvents: Array<WorkspaceRunEvent>,
  liveEvents: Array<WorkspaceRunEvent>,
): Array<WorkspaceRunEvent> {
  const seen = new Set<string>()
  const merged: Array<WorkspaceRunEvent> = []

  for (const event of [...baseEvents, ...liveEvents]) {
    if (seen.has(String(event.id))) continue
    seen.add(String(event.id))
    merged.push(event)
  }

  return merged.sort((left, right) => {
    const leftTime = new Date(left.created_at).getTime()
    const rightTime = new Date(right.created_at).getTime()
    return leftTime - rightTime
  })
}

function parseWorkflowPolicy(content: string | null | undefined): WorkflowPolicy {
  if (!content || !content.startsWith('---')) return DEFAULT_POLICY

  const closingIndex = content.indexOf('\n---', 3)
  if (closingIndex < 0) return DEFAULT_POLICY

  try {
    const raw = content.slice(3, closingIndex).trim()
    const parsed = YAML.parse(raw) as Record<string, unknown> | null
    const checksRecord = asRecord(parsed?.required_checks) ?? asRecord(parsed?.checks)
    const checksList = Array.isArray(parsed?.required_checks)
      ? parsed.required_checks
      : Array.isArray(parsed?.checks)
        ? parsed.checks
        : []

    function resolveCheck(key: 'tsc' | 'tests' | 'lint' | 'e2e', fallback: boolean) {
      if (checksRecord && typeof checksRecord[key] === 'boolean') {
        return checksRecord[key] as boolean
      }

      if (checksList.some((value) => value === key)) {
        return true
      }

      if (typeof parsed?.[key] === 'boolean') {
        return parsed[key] as boolean
      }

      return fallback
    }

    return {
      maxConcurrentAgents:
        Math.max(1, Math.round(asNumber(parsed?.max_concurrent_agents) ?? DEFAULT_POLICY.maxConcurrentAgents)),
      checks: {
        tsc: resolveCheck('tsc', DEFAULT_POLICY.checks.tsc),
        tests: resolveCheck('tests', DEFAULT_POLICY.checks.tests),
        lint: resolveCheck('lint', DEFAULT_POLICY.checks.lint),
        e2e: resolveCheck('e2e', DEFAULT_POLICY.checks.e2e),
      },
      tools: DEFAULT_POLICY.tools,
    }
  } catch {
    return DEFAULT_POLICY
  }
}

function ToggleRow({
  label,
  enabled,
}: {
  label: string
  enabled: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-primary-800 bg-primary-900/70 px-3 py-2">
      <span className="text-sm text-primary-200">{label}</span>
      <span
        className={cn(
          'relative inline-flex h-6 w-11 rounded-full border transition-colors',
          enabled
            ? 'border-accent-500/50 bg-accent-500/25'
            : 'border-primary-700 bg-primary-800',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4.5 rounded-full transition-transform',
            enabled
              ? 'left-[22px] bg-accent-400'
              : 'left-0.5 bg-primary-500',
          )}
        />
      </span>
    </div>
  )
}

function TerminalLog({
  events,
}: {
  events: Array<WorkspaceRunEvent>
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
      className="max-h-72 overflow-y-auto rounded-xl border border-primary-800 bg-primary-950 px-3 py-3 font-mono text-xs text-primary-200"
    >
      {events.length > 0 ? (
        <div className="space-y-2">
          {events
            .filter((event) => event.type === 'output' || event.type === 'error' || event.type === 'status')
            .map((event) => (
              <div key={event.id} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
                <span className="text-primary-400">
                  {formatActivityTime(event.created_at)}
                </span>
                <pre className="whitespace-pre-wrap break-words text-primary-200">
                  {getRunEventText(event)}
                </pre>
              </div>
            ))}
        </div>
      ) : (
        <p className="text-primary-400">Waiting for terminal output…</p>
      )}
    </div>
  )
}

export function MissionConsoleScreen({
  missionId,
  projectId,
}: MissionConsoleScreenProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [now, setNow] = useState(() => Date.now())
  const [liveEventsByRunId, setLiveEventsByRunId] = useState<
    Record<string, Array<WorkspaceRunEvent>>
  >({})
  const [streamFeed, setStreamFeed] = useState<Array<ConsoleFeedItem>>([])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const missionStatusQuery = useQuery({
    queryKey: ['workspace', 'mission-console', 'status', missionId],
    enabled: missionId.length > 0,
    queryFn: async () =>
      parseMissionStatus(
        await workspaceRequestJson(
          `/api/workspace/missions/${encodeURIComponent(missionId)}/status`,
        ),
      ),
    refetchInterval: 3_000,
  })

  const activeMissionRunsQuery = useQuery({
    queryKey: ['workspace', 'task-runs', 'mission-console', 'all'],
    enabled: missionId.length === 0,
    queryFn: async () =>
      extractTaskRuns(await workspaceRequestJson('/api/workspace/task-runs')),
    refetchInterval: 5_000,
  })

  const missionsListQuery = useQuery({
    queryKey: ['workspace', 'missions', 'mission-console'],
    enabled: missionId.length === 0,
    queryFn: async () =>
      extractMissionList(await workspaceRequestJson('/api/workspace/missions')),
    refetchInterval: 15_000,
  })

  const projectQuery = useQuery({
    queryKey: ['workspace', 'projects', projectId],
    enabled: projectId.length > 0,
    queryFn: async () =>
      extractProject(
        await workspaceRequestJson(
          `/api/workspace/projects/${encodeURIComponent(projectId)}`,
        ),
      ),
  })

  const runsQuery = useQuery({
    queryKey: ['workspace', 'task-runs', 'mission-console', projectId],
    enabled: Boolean(projectId),
    queryFn: async () =>
      extractTaskRuns(
        await workspaceRequestJson(
          `/api/workspace/task-runs?project_id=${encodeURIComponent(projectId)}`,
        ),
      ),
    refetchInterval: 3_000,
  })

  const activityQuery = useQuery({
    queryKey: ['workspace', 'events', 'mission-console', projectId],
    enabled: Boolean(projectId),
    queryFn: async () =>
      extractActivityEvents(
        await workspaceRequestJson(
          `/api/workspace/events?project_id=${encodeURIComponent(projectId)}&limit=30`,
        ),
      ),
    refetchInterval: 5_000,
  })

  const workflowQuery = useQuery({
    queryKey: ['workspace', 'mission-console', 'workflow', projectId, projectQuery.data?.path],
    enabled: Boolean(projectQuery.data?.path),
    queryFn: async () => {
      const projectPath = projectQuery.data?.path
      if (!projectPath) return DEFAULT_POLICY

      const payload = (await workspaceRequestJson(
        `/api/files?action=read&path=${encodeURIComponent(`${projectPath}/WORKFLOW.md`)}`,
      )) as { content?: unknown } | null

      return parseWorkflowPolicy(
        typeof payload?.content === 'string' ? payload.content : null,
      )
    },
    retry: false,
  })

  const missionStatus = missionStatusQuery.data
  const project = projectQuery.data as WorkspaceProject | null | undefined
  const runningMissionOptions = useMemo(() => {
    const grouped = new Map<
      string,
      {
        missionId: string
        missionName: string
        projectId: string
        projectName: string
        activeRuns: number
        updatedAt: string | null
      }
    >()

    for (const run of activeMissionRunsQuery.data ?? []) {
      if (!run.mission_id || !run.project_id) continue
      if (run.status !== 'running' && run.status !== 'active') continue

      const current = grouped.get(run.mission_id)
      const updatedAt = run.started_at ?? run.completed_at ?? null
      if (!current) {
        grouped.set(run.mission_id, {
          missionId: run.mission_id,
          missionName: run.mission_name ?? 'Active mission',
          projectId: run.project_id,
          projectName: run.project_name ?? 'Project',
          activeRuns: 1,
          updatedAt,
        })
        continue
      }

      grouped.set(run.mission_id, {
        ...current,
        activeRuns: current.activeRuns + 1,
        updatedAt:
          updatedAt &&
          (!current.updatedAt ||
            new Date(updatedAt).getTime() > new Date(current.updatedAt).getTime())
            ? updatedAt
            : current.updatedAt,
      })
    }

    return Array.from(grouped.values()).sort((left, right) => {
      return new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime()
    })
  }, [activeMissionRunsQuery.data])

  const selectableMissionOptions = useMemo(() => {
    const byMissionId = new Map<string, MissionListItem>()

    for (const mission of missionsListQuery.data ?? []) {
      byMissionId.set(mission.missionId, mission)
    }

    for (const mission of runningMissionOptions) {
      if (byMissionId.has(mission.missionId)) continue
      byMissionId.set(mission.missionId, {
        missionId: mission.missionId,
        missionName: mission.missionName,
        status: 'running',
        projectId: mission.projectId,
        projectName: mission.projectName,
      })
    }

    return Array.from(byMissionId.values())
      .filter((mission) => mission.projectId.length > 0)
      .sort((left, right) => {
        const leftIsRunning =
          left.status === 'running' || left.status === 'active' ? 1 : 0
        const rightIsRunning =
          right.status === 'running' || right.status === 'active' ? 1 : 0

        if (leftIsRunning !== rightIsRunning) return rightIsRunning - leftIsRunning
        return left.missionName.localeCompare(right.missionName)
      })
  }, [missionsListQuery.data, runningMissionOptions])

  const allMissionRuns = useMemo(() => {
    return (runsQuery.data ?? []).filter((run) => run.mission_id === missionId)
  }, [missionId, runsQuery.data])
  const runningRuns = useMemo(
    () =>
      allMissionRuns.filter(
        (run) => run.status === 'running' || run.status === 'active',
      ),
    [allMissionRuns],
  )

  const runEventQueries = useQueries({
    queries: runningRuns.map((run) => ({
      queryKey: ['workspace', 'task-runs', run.id, 'events'],
      queryFn: async () =>
        extractRunEvents(
          await workspaceRequestJson(
            `/api/workspace/task-runs/${encodeURIComponent(run.id)}/events`,
          ),
        ),
      staleTime: 1_000,
      refetchInterval: 3_000,
    })),
  })

  const queryEventsByRunId = useMemo(() => {
    const map = new Map<string, Array<WorkspaceRunEvent>>()
    runningRuns.forEach((run, index) => {
      map.set(run.id, runEventQueries[index]?.data ?? [])
    })
    return map
  }, [runEventQueries, runningRuns])

  const mergedEventsByRunId = useMemo(() => {
    const map = new Map<string, Array<WorkspaceRunEvent>>()
    const runIds = new Set([
      ...runningRuns.map((run) => run.id),
      ...Object.keys(liveEventsByRunId),
    ])

    runIds.forEach((runId) => {
      map.set(
        runId,
        mergeRunEvents(
          queryEventsByRunId.get(runId) ?? [],
          liveEventsByRunId[runId] ?? [],
        ),
      )
    })
    return map
  }, [liveEventsByRunId, queryEventsByRunId, runningRuns])

  const latestRunByTaskId = useMemo(() => {
    const map = new Map<string, WorkspaceTaskRun>()
    for (const run of allMissionRuns) {
      if (!run.task_id) continue
      const current = map.get(run.task_id)
      const nextTime = new Date(run.started_at ?? run.completed_at ?? 0).getTime()
      const currentTime = current
        ? new Date(current.started_at ?? current.completed_at ?? 0).getTime()
        : -1
      if (!current || nextTime >= currentTime) {
        map.set(run.task_id, run)
      }
    }
    return map
  }, [allMissionRuns])

  const activityFeed = useMemo(() => {
    const initialFeed = (activityQuery.data ?? [])
      .filter((event) => {
        const data = asRecord(event.data)
        return (
          asString(data?.mission_id) === missionId ||
          (event.entity_type === 'mission' && event.entity_id === missionId)
        )
      })
      .map(toConsoleFeedItemFromActivity)

    const merged = [...initialFeed, ...streamFeed]
    const seen = new Set<string>()

    return merged
      .filter((item) => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
      })
      .sort((left, right) => {
        return new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
      })
      .slice(0, 40)
  }, [activityQuery.data, missionId, streamFeed])

  const missionStartedAt = useMemo(() => {
    const missionStartedEvent = (activityQuery.data ?? []).find((event) => {
      const data = asRecord(event.data)
      return (
        event.type === 'mission.started' &&
        (asString(data?.mission_id) === missionId || event.entity_id === missionId)
      )
    })

    if (missionStartedEvent) return missionStartedEvent.timestamp

    const taskStarts = missionStatus?.task_breakdown
      .flatMap((task) => (task.started_at ? [task.started_at] : []))
      .sort()

    return taskStarts?.[0] ?? runningRuns[0]?.started_at ?? null
  }, [activityQuery.data, missionId, missionStatus?.task_breakdown, runningRuns])

  useEffect(() => {
    setLiveEventsByRunId({})
    setStreamFeed([])
  }, [missionId])

  useEffect(() => {
    if (!missionId) return

    const source = new EventSource('/api/workspace/events')

    function appendStreamFeed(item: ConsoleFeedItem | null) {
      if (!item) return
      setStreamFeed((current) => [item, ...current].slice(0, 60))
    }

    function handleEvent(eventName: string, message: MessageEvent) {
      try {
        const payload = JSON.parse(message.data) as unknown
        const record = asRecord(payload)
        if (!record) return

        if (eventName === 'run_event') {
          const runEvent = normalizeRunEvent(payload)
          const run = allMissionRuns.find((candidate) => candidate.id === runEvent.task_run_id)
          if (!run) return

          setLiveEventsByRunId((current) => ({
            ...current,
            [runEvent.task_run_id]: [
              ...(current[runEvent.task_run_id] ?? []),
              runEvent,
            ].slice(-250),
          }))
          return
        }

        if (eventName === 'mission.progress') {
          if (asString(record.mission_id) !== missionId) return
          appendStreamFeed(toConsoleFeedItemFromStream(eventName, payload))
          void queryClient.invalidateQueries({
            queryKey: ['workspace', 'mission-console', 'status', missionId],
          })
          return
        }

        if (eventName === 'mission.updated') {
          if (asString(record.id) !== missionId) return
          appendStreamFeed(toConsoleFeedItemFromStream(eventName, payload))
          void queryClient.invalidateQueries({
            queryKey: ['workspace', 'mission-console', 'status', missionId],
          })
          return
        }

        if (eventName === 'task_run.started' || eventName === 'task_run.updated') {
          const runMissionId = asString(record.mission_id)
          if (runMissionId !== missionId) return
          appendStreamFeed(toConsoleFeedItemFromStream(eventName, payload))
          void queryClient.invalidateQueries({
            queryKey: ['workspace', 'task-runs', 'mission-console', projectId],
          })
          return
        }

        if (eventName === 'activity_log') {
          const missionMatch =
            asString(record.entity_id) === missionId ||
            asString(record.mission_id) === missionId ||
            asString(asRecord(record.details)?.mission_id) === missionId
          if (!missionMatch) return

          const normalized = normalizeActivityEvent({
            id: record.id,
            type: record.action,
            entity_type: record.entity_type,
            entity_id: record.entity_id,
            data: asRecord(record.details),
            timestamp: record.created_at,
          })
          appendStreamFeed(toConsoleFeedItemFromActivity(normalized))
          return
        }

        if (eventName === 'task.updated') {
          const taskId = asString(record.id)
          if (!taskId || !missionStatus?.task_breakdown.some((task) => task.id === taskId)) {
            return
          }
          appendStreamFeed(toConsoleFeedItemFromStream(eventName, payload))
          void queryClient.invalidateQueries({
            queryKey: ['workspace', 'mission-console', 'status', missionId],
          })
        }
      } catch {
        // Ignore malformed SSE payloads.
      }
    }

    const listeners = STREAM_EVENT_NAMES.map((eventName) => {
      const handler = (event: Event) => {
        if (!(event instanceof MessageEvent)) return
        handleEvent(eventName, event)
      }
      source.addEventListener(eventName, handler)
      return { eventName, handler }
    })

    return () => {
      listeners.forEach(({ eventName, handler }) =>
        source.removeEventListener(eventName, handler),
      )
      source.close()
    }
  }, [allMissionRuns, missionId, missionStatus?.task_breakdown, projectId, queryClient])

  const pauseMissionMutation = useMutation({
    mutationFn: async () =>
      postWorkspaceAction(
        `/api/workspace/missions/${encodeURIComponent(missionId)}/pause`,
      ),
    onSuccess: () => {
      toast('Mission paused. All active task dispatching has been paused.', {
        type: 'success',
      })
      void queryClient.invalidateQueries({
        queryKey: ['workspace', 'mission-console', 'status', missionId],
      })
      void queryClient.invalidateQueries({
        queryKey: ['workspace', 'task-runs', 'mission-console', projectId],
      })
    },
    onError: (error) => {
      toast(
        `Unable to pause mission: ${
          error instanceof Error ? error.message : 'Request failed.'
        }`,
        { type: 'error' },
      )
    },
  })

  const pauseRunMutation = useMutation({
    mutationFn: async (runId: string) =>
      postWorkspaceAction(
        `/api/workspace/task-runs/${encodeURIComponent(runId)}/pause`,
      ),
    onSuccess: () => {
      toast('Run pause requested. The agent run has been asked to pause.', {
        type: 'success',
      })
      void queryClient.invalidateQueries({
        queryKey: ['workspace', 'task-runs', 'mission-console', projectId],
      })
    },
    onError: (error) => {
      toast(
        `Unable to pause run: ${
          error instanceof Error ? error.message : 'Request failed.'
        }`,
        { type: 'error' },
      )
    },
  })

  const policy = workflowQuery.data ?? DEFAULT_POLICY

  if (!missionId) {
    return (
      <div className="flex h-full items-center justify-center bg-primary-950 px-6">
        <div className="w-full max-w-3xl rounded-3xl border border-primary-800 bg-primary-900 p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary-400">
            Mission Console
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-primary-100">
            No mission selected
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-primary-300">
            Select a mission to monitor live agent progress, recent activity,
            and task execution details.
          </p>
          <div className="mt-6 rounded-2xl border border-primary-800 bg-primary-950/60 p-4 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-500">
              Select a Mission
            </p>
            {missionsListQuery.isLoading ? (
              <p className="mt-3 text-sm text-primary-400">
                Loading available missions...
              </p>
            ) : missionsListQuery.isError ? (
              <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                {missionsListQuery.error instanceof Error
                  ? missionsListQuery.error.message
                  : 'Unable to load missions right now.'}
              </div>
            ) : selectableMissionOptions.length > 0 ? (
              <div className="mt-3 space-y-2">
                {selectableMissionOptions.map((mission) => (
                  <button
                    key={mission.missionId}
                    type="button"
                    onClick={() =>
                      void navigate({
                        to: '/mission-console',
                        search: {
                          missionId: mission.missionId,
                          projectId: mission.projectId,
                        },
                      })
                    }
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-primary-800 bg-primary-900 px-4 py-4 text-left transition-colors hover:border-primary-700 hover:bg-primary-800"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-primary-100">
                          {mission.missionName}
                        </p>
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium',
                            getStatusBadgeClass(mission.status),
                          )}
                        >
                          {formatStatus(mission.status)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-primary-400">
                        {mission.projectName}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-primary-400">
                      <span className="hidden text-xs text-primary-500 sm:inline">
                        Open console
                      </span>
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        size={16}
                        strokeWidth={1.8}
                        className="shrink-0"
                      />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-dashed border-primary-800 bg-primary-900/70 px-4 py-6 text-center">
                <p className="text-sm font-medium text-primary-200">
                  No missions available yet.
                </p>
                <p className="mt-2 text-sm text-primary-400">
                  Create or start a mission from Projects, then return here.
                </p>
                <Link
                  to="/projects"
                  className={cn(
                    buttonVariants({}),
                    'mt-4 inline-flex bg-accent-500 text-primary-950 hover:bg-accent-400',
                  )}
                >
                  Go to Projects
                </Link>
              </div>
            )}
          </div>
          {missionsListQuery.isError ? (
            <Link
              to="/projects"
              className={cn(
                buttonVariants({}),
                'mt-6 inline-flex bg-accent-500 text-primary-950 hover:bg-accent-400',
              )}
            >
              Go to Projects
            </Link>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.14),transparent_28%),linear-gradient(180deg,rgba(15,23,42,1),rgba(2,6,23,1))] px-4 py-4 text-primary-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-4">
        <div className="rounded-3xl border border-primary-800 bg-primary-900/80 px-4 py-3 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-primary-400">
                <Link to="/projects" className="transition-colors hover:text-primary-200">
                  Projects
                </Link>
                <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={1.8} />
                <span>{project?.name ?? 'Project'}</span>
                <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={1.8} />
                <span className="font-semibold text-primary-100">
                  {missionStatus?.mission.name ?? 'Mission'}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-semibold text-primary-100 sm:text-2xl">
                  {missionStatus?.mission.name ?? 'Mission Console'}
                </h1>
                <span className="inline-flex rounded-full border border-primary-700 bg-primary-800/80 px-2.5 py-1 text-xs font-medium text-primary-300">
                  {formatStatus(missionStatus?.mission.status ?? 'pending')}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-primary-800 bg-primary-950/70 px-3 py-2 text-sm">
                <p className="text-xs uppercase tracking-[0.24em] text-primary-500">
                  Elapsed
                </p>
                <div className="mt-1 flex items-center gap-2 text-primary-100">
                  <HugeiconsIcon icon={Clock01Icon} size={16} strokeWidth={1.8} />
                  <span className="font-semibold">
                    {formatElapsed(missionStartedAt, now)}
                  </span>
                </div>
              </div>
              <Button
                onClick={() => pauseMissionMutation.mutate()}
                disabled={pauseMissionMutation.isPending}
                className="bg-accent-500 text-primary-950 hover:bg-accent-400"
              >
                <HugeiconsIcon icon={PauseIcon} size={16} strokeWidth={1.8} />
                Pause All
              </Button>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 gap-4 xl:grid-cols-[320px,minmax(0,1fr),290px]">
          <section className="rounded-3xl border border-primary-800 bg-primary-900/85 p-4 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-primary-500">
                  Tasks
                </p>
                <h2 className="mt-1 text-lg font-semibold text-primary-100">
                  Progress
                </h2>
              </div>
              <div className="text-right text-sm text-primary-300">
                <p className="font-semibold text-primary-100">
                  {Math.round(missionStatus?.mission.progress ?? 0)}%
                </p>
                <p>
                  {missionStatus?.completed_count ?? 0}/{missionStatus?.total_count ?? 0}{' '}
                  tasks
                </p>
              </div>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-primary-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent-500 to-accent-400 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, missionStatus?.mission.progress ?? 0))}%` }}
              />
            </div>

            <div className="mt-5 space-y-3">
              {missionStatus?.task_breakdown.length ? (
                missionStatus.task_breakdown.map((task, index) => {
                  const tone = getTaskStatusTone(task.status)
                  const latestRun = latestRunByTaskId.get(task.id)
                  const progress = latestRun
                    ? getTaskProgress(
                        mergedEventsByRunId.get(latestRun.id) ?? [],
                        task.status,
                      )
                    : null

                  return (
                    <div
                      key={task.id}
                      className={cn(
                        'rounded-2xl border border-primary-800 bg-primary-950/60 px-3 py-3',
                        task.status === 'running' || task.status === 'active'
                          ? 'ring-1 ring-accent-500/30'
                          : '',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <HugeiconsIcon
                          icon={tone.icon}
                          size={18}
                          strokeWidth={1.8}
                          className={cn(
                            'mt-0.5 shrink-0',
                            tone.className,
                            (task.status === 'running' || task.status === 'active') &&
                              'animate-pulse',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.24em] text-primary-500">
                                Task {index + 1}
                              </p>
                              <p className="mt-1 text-sm font-medium text-primary-100">
                                {task.name}
                              </p>
                            </div>
                            <span className="text-xs text-primary-400">
                              {tone.label}
                            </span>
                          </div>
                          {progress !== null ? (
                            <div className="mt-3">
                              <div className="mb-1 flex items-center justify-between text-[11px] text-primary-400">
                                <span>Run progress</span>
                                <span className="font-semibold text-accent-300">
                                  {progress}%
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-primary-800">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-accent-500 to-amber-400"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-primary-700 bg-primary-950/50 px-4 py-8 text-center text-sm text-primary-400">
                  {missionStatusQuery.isLoading
                    ? 'Loading mission tasks…'
                    : 'No tasks found for this mission.'}
                </div>
              )}
            </div>
          </section>

          <section className="min-h-0 rounded-3xl border border-primary-800 bg-primary-900/85 p-4 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-primary-500">
                  Live Output
                </p>
                <h2 className="mt-1 text-lg font-semibold text-primary-100">
                  Agent terminals
                </h2>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary-700 bg-primary-950/70 px-3 py-1 text-xs text-primary-300">
                <span className="size-2 rounded-full bg-emerald-400" />
                {runningRuns.length} active
              </div>
            </div>

            <div className="mt-4 grid gap-4">
              {runningRuns.length > 0 ? (
                runningRuns.map((run) => {
                  const events = mergedEventsByRunId.get(run.id) ?? []

                  return (
                    <article
                      key={run.id}
                      className="overflow-hidden rounded-2xl border border-primary-800 bg-primary-950/55"
                    >
                      <div className="flex flex-col gap-3 border-b border-primary-800 bg-primary-900/85 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'size-2.5 rounded-full',
                                getAgentTone(run.agent_name),
                              )}
                            />
                            <span className="text-sm font-semibold text-primary-100">
                              {run.agent_name ?? 'Agent'}
                            </span>
                            <span className="text-primary-500">•</span>
                            <span className="truncate text-sm text-primary-300">
                              {run.task_name}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-primary-500">
                            Started {formatActivityTime(run.started_at ?? new Date().toISOString())}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => pauseRunMutation.mutate(run.id)}
                          disabled={pauseRunMutation.isPending}
                          className="border-primary-700 bg-primary-900 text-primary-100 hover:bg-primary-800"
                        >
                          <HugeiconsIcon icon={PauseIcon} size={14} strokeWidth={1.8} />
                          Pause
                        </Button>
                      </div>
                      <div className="p-4">
                        <TerminalLog events={events} />
                      </div>
                    </article>
                  )
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-primary-700 bg-primary-950/50 px-4 py-10 text-center text-sm text-primary-400">
                  No active task runs for this mission right now.
                </div>
              )}
            </div>

            <div className="mt-4 rounded-2xl border border-primary-800 bg-primary-950/60">
              <div className="border-b border-primary-800 px-4 py-3">
                <p className="text-sm font-semibold text-primary-100">
                  Activity event log
                </p>
              </div>
              <div className="max-h-72 overflow-y-auto px-4 py-3">
                {activityFeed.length > 0 ? (
                  <div className="space-y-2">
                    {activityFeed.map((item) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-[72px_96px_minmax(0,1fr)] items-start gap-3 text-sm"
                      >
                        <span className="text-primary-500">
                          {formatActivityTime(item.timestamp)}
                        </span>
                        <span className="text-xs font-medium uppercase tracking-[0.18em] text-accent-300">
                          {item.type.replace(/\./g, ' ')}
                        </span>
                        <span className="text-primary-200">{item.message}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-primary-400">
                    Mission activity will appear here as the stream updates.
                  </p>
                )}
              </div>
            </div>
          </section>

          <aside className="rounded-3xl border border-primary-800 bg-primary-900/85 p-4 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
            <p className="text-xs uppercase tracking-[0.24em] text-primary-500">
              Policy Drawer
            </p>
            <h2 className="mt-1 text-lg font-semibold text-primary-100">
              Controls
            </h2>

            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-primary-800 bg-primary-950/60 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.24em] text-primary-500">
                  Concurrency
                </p>
                <p className="mt-2 text-2xl font-semibold text-primary-100">
                  {policy.maxConcurrentAgents}
                </p>
                <p className="text-sm text-primary-400">max concurrent agents</p>
              </div>

              <div className="rounded-2xl border border-primary-800 bg-primary-950/60 p-3">
                <p className="mb-3 text-sm font-semibold text-primary-100">
                  Required checks
                </p>
                <div className="space-y-2">
                  <ToggleRow label="tsc" enabled={policy.checks.tsc} />
                  <ToggleRow label="tests" enabled={policy.checks.tests} />
                  <ToggleRow label="lint" enabled={policy.checks.lint} />
                  <ToggleRow label="e2e" enabled={policy.checks.e2e} />
                </div>
              </div>

              <div className="rounded-2xl border border-primary-800 bg-primary-950/60 p-3">
                <p className="mb-3 text-sm font-semibold text-primary-100">
                  Allowed tools
                </p>
                <div className="space-y-2">
                  {policy.tools.map((tool) => (
                    <ToggleRow
                      key={tool.label}
                      label={tool.label}
                      enabled={tool.enabled}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-primary-800 bg-primary-950/60 px-4 py-3">
                <div className="flex items-center gap-2 text-primary-300">
                  <HugeiconsIcon icon={Task01Icon} size={16} strokeWidth={1.8} />
                  <span className="text-sm">
                    {missionStatus?.running_agents.length ?? 0} agents currently assigned
                  </span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
