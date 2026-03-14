import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  PlayCircleIcon,
  Task01Icon,
} from '@hugeicons/core-free-icons'
import type { HugeiconsIcon } from '@hugeicons/react'
import {
  getCheckpointDiffStatParsed,
  isCheckpointReviewable,
  type WorkspaceCheckpoint,
} from '@/lib/workspace-checkpoints'
import { cn } from '@/lib/utils'
import type {
  DecomposedTaskDraft,
  ProjectOverview,
  WorkspaceActivityEvent,
  WorkspaceAgent,
  WorkspaceMission,
  WorkspacePhase,
  WorkspaceProject,
  WorkspaceStatus,
} from './workspace-types'

export const PROJECT_TONES = [
  {
    accent: 'border-accent-500/35 bg-accent-500/10 text-accent-300',
    soft: 'bg-accent-500/12 text-accent-300 ring-1 ring-accent-500/20',
  },
  {
    accent: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
    soft: 'bg-emerald-500/12 text-emerald-300 ring-1 ring-emerald-500/20',
  },
  {
    accent: 'border-sky-500/35 bg-sky-500/10 text-sky-300',
    soft: 'bg-sky-500/12 text-sky-300 ring-1 ring-sky-500/20',
  },
  {
    accent: 'border-fuchsia-500/35 bg-fuchsia-500/10 text-fuchsia-300',
    soft: 'bg-fuchsia-500/12 text-fuchsia-300 ring-1 ring-fuchsia-500/20',
  },
] as const

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined
}

export function flattenProjectTasks(project?: WorkspaceProject | null) {
  if (!project) return []
  return project.phases.flatMap((phase) =>
    phase.missions.flatMap((mission) => mission.tasks),
  )
}

export function flattenProjectMissions(
  project?: WorkspaceProject | null,
): Array<{ phase: WorkspacePhase; mission: WorkspaceMission }> {
  if (!project) return []
  return project.phases.flatMap((phase) =>
    phase.missions.map((mission) => ({ phase, mission })),
  )
}

export function isMissionInPlanReview(mission: WorkspaceMission): boolean {
  const hasDraftTasks = mission.tasks.some((task) =>
    ['draft', 'plan_review'].includes(task.status),
  )
  const hasPendingReviewTasks = mission.tasks.some((task) =>
    ['pending', 'ready', 'draft', 'plan_review'].includes(task.status),
  )

  return hasDraftTasks || (mission.status === 'plan_review' && hasPendingReviewTasks)
}

export function findPlanReviewMission(
  project?: WorkspaceProject | null,
): WorkspaceMission | null {
  const missions = flattenProjectMissions(project)
  return missions.find(({ mission }) => isMissionInPlanReview(mission))?.mission ?? null
}

export function getStatusBadgeClass(status: WorkspaceStatus): string {
  if (status === 'archived') {
    return 'border-primary-200 bg-primary-50 text-primary-600'
  }
  if (status === 'ready') {
    return 'border-blue-500/30 bg-blue-500/10 text-blue-300'
  }
  if (status === 'running' || status === 'active') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  }
  if (status === 'completed' || status === 'done') {
    return 'border-green-500/30 bg-green-500/10 text-green-300'
  }
  if (status === 'paused') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  }
  if (status === 'failed') {
    return 'border-red-500/30 bg-red-500/10 text-red-300'
  }
  return 'border-primary-700 bg-primary-800/70 text-primary-300'
}

export function getTaskDotClass(status: WorkspaceStatus): string {
  if (status === 'archived') return 'bg-primary-300'
  if (status === 'ready') return 'bg-blue-400'
  if (status === 'running' || status === 'in_progress' || status === 'active') {
    return 'bg-emerald-400'
  }
  if (status === 'completed' || status === 'done') return 'bg-green-400'
  if (status === 'paused') return 'bg-amber-400'
  if (status === 'failed') return 'bg-red-400'
  return 'bg-primary-500'
}

export function formatStatus(status: WorkspaceStatus): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 'just now'

  const diffMs = timestamp - Date.now()
  const diffSeconds = Math.round(diffMs / 1000)
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
    ['second', 1],
  ]

  for (const [unit, seconds] of units) {
    if (Math.abs(diffSeconds) >= seconds || unit === 'second') {
      return formatter.format(Math.round(diffSeconds / seconds), unit)
    }
  }

  return 'just now'
}

export function getActivityEventDescription(
  event: WorkspaceActivityEvent,
): string {
  const data = event.data
  const taskName = asString(data?.task_name)
  const missionName = asString(data?.mission_name)
  const checkpointSummary = asString(data?.summary)

  switch (event.type) {
    case 'task.started':
      return `Started task${taskName ? `: ${taskName}` : ''}`
    case 'task.completed':
      return `Completed task${taskName ? `: ${taskName}` : ''}`
    case 'task.failed':
      return `Failed task${taskName ? `: ${taskName}` : ''}`
    case 'mission.started':
      return `Started mission${missionName ? `: ${missionName}` : ''}`
    case 'mission.completed':
      return `Completed mission${missionName ? `: ${missionName}` : ''}`
    case 'checkpoint.created':
      return checkpointSummary
        ? `Created checkpoint: ${checkpointSummary}`
        : 'Created checkpoint'
    default:
      return event.type.replace(/\./g, ' ')
  }
}

export function getActivityEventTone(eventType: string): {
  dotClass: string
  icon: React.ComponentProps<typeof HugeiconsIcon>['icon']
  iconClass: string
} {
  if (eventType === 'task.started' || eventType === 'mission.started') {
    return {
      dotClass: 'bg-sky-400 ring-4 ring-sky-400/10',
      icon: PlayCircleIcon,
      iconClass: 'text-sky-300',
    }
  }
  if (eventType === 'task.completed' || eventType === 'mission.completed') {
    return {
      dotClass: 'bg-green-400 ring-4 ring-green-400/10',
      icon: CheckmarkCircle02Icon,
      iconClass: 'text-green-300',
    }
  }
  if (eventType === 'task.failed') {
    return {
      dotClass: 'bg-red-400 ring-4 ring-red-400/10',
      icon: Cancel01Icon,
      iconClass: 'text-red-300',
    }
  }
  if (eventType === 'checkpoint.created') {
    return {
      dotClass: 'bg-amber-400 ring-4 ring-amber-400/10',
      icon: Task01Icon,
      iconClass: 'text-amber-300',
    }
  }
  return {
    dotClass: 'bg-primary-500 ring-4 ring-primary-500/10',
    icon: Clock01Icon,
    iconClass: 'text-primary-300',
  }
}

export function getProjectProgress(
  project: WorkspaceProject,
  detail?: WorkspaceProject | null,
): number {
  const source = detail ?? project
  const tasks = flattenProjectTasks(source)

  if (tasks.length > 0) {
    const completed = tasks.filter((task) =>
      ['completed', 'done'].includes(task.status),
    ).length
    return Math.min(100, Math.round((completed / tasks.length) * 100))
  }

  if (project.status === 'completed' || project.status === 'done') return 100
  if (project.status === 'running' || project.status === 'active') return 68
  if (project.status === 'paused') return 52
  return 12
}

export function getProjectFocus(
  project: WorkspaceProject,
  detail?: WorkspaceProject | null,
): { phaseLabel: string; missionLabel: string; resumeMissionId: string | null } {
  const source = detail ?? project
  const missions = flattenProjectMissions(source)
  const activeMission =
    missions.find(({ mission }) =>
      ['running', 'active'].includes(mission.status),
    ) ??
    missions.find(({ mission }) =>
      ['pending', 'ready', 'paused'].includes(mission.status),
    ) ??
    missions.at(-1)

  if (!activeMission) {
    return {
      phaseLabel: project.phase_count > 0 ? `Phase ${project.phase_count}` : 'No phases yet',
      missionLabel: 'No mission assigned',
      resumeMissionId: null,
    }
  }

  const phaseIndex = source.phases.findIndex(
    (phase) => phase.id === activeMission.phase.id,
  )

  return {
    phaseLabel: `Phase ${phaseIndex + 1}: ${activeMission.phase.name}`,
    missionLabel: activeMission.mission.name,
    resumeMissionId:
      activeMission.mission.status === 'completed' ||
      activeMission.mission.status === 'done'
        ? null
        : activeMission.mission.id,
  }
}

function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

export function getProjectTone(project: WorkspaceProject) {
  return PROJECT_TONES[hashString(project.id || project.name) % PROJECT_TONES.length]
}

function deriveGatePills(
  project: WorkspaceProject,
  detail: WorkspaceProject | null | undefined,
  pendingCheckpointCount: number,
): ProjectOverview['gates'] {
  const tasks = flattenProjectTasks(detail ?? project)
  const hasCompletedTask = tasks.some((task) =>
    ['completed', 'done'].includes(task.status),
  )
  const hasPendingTask = tasks.some((task) =>
    ['pending', 'ready'].includes(task.status),
  )
  const isComplete = ['completed', 'done'].includes(project.status)

  const gates: ProjectOverview['gates'] = []
  gates.push({
    label: hasCompletedTask || isComplete ? 'tsc OK' : 'tsc pending',
    tone: hasCompletedTask || isComplete ? 'success' : 'neutral',
  })

  if (hasPendingTask && !isComplete) {
    gates.push({ label: 'tests req', tone: 'warning' })
  }

  if (pendingCheckpointCount > 0) {
    gates.push({ label: 'PR mode', tone: 'accent' })
  } else {
    gates.push({ label: 'commit mode', tone: 'neutral' })
  }

  if (isComplete) {
    gates.push({ label: 'all checks OK', tone: 'success' })
  }

  return gates
}

export function getGateClass(tone: ProjectOverview['gates'][number]['tone']): string {
  if (tone === 'success') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  }
  if (tone === 'warning') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  }
  if (tone === 'accent') {
    return 'border-accent-500/30 bg-accent-500/10 text-accent-300'
  }
  return 'border-primary-700 bg-primary-800/80 text-primary-300'
}

function getSquadFromProject(
  project: WorkspaceProject,
  checkpoints: Array<WorkspaceCheckpoint>,
  agents: Array<WorkspaceAgent>,
): ProjectOverview['squad'] {
  const projectAgents = checkpoints
    .filter((checkpoint) => checkpoint.project_name === project.name)
    .map((checkpoint) => checkpoint.agent_name)
    .filter((value): value is string => Boolean(value))

  const fromAgents = agents.map((agent) => agent.name)
  const base = [...projectAgents, ...fromAgents]
  const unique = Array.from(new Set(base)).slice(0, 4)

  if (unique.length === 0) {
    return [
      { label: 'Codex', tone: 'bg-emerald-400' },
      { label: 'QA', tone: 'bg-sky-400' },
    ]
  }

  return unique.map((label, index) => ({
    label,
    tone: ['bg-emerald-400', 'bg-sky-400', 'bg-fuchsia-400', 'bg-accent-400'][index % 4],
  }))
}

export function buildProjectOverview(
  project: WorkspaceProject,
  detail: WorkspaceProject | null | undefined,
  checkpoints: Array<WorkspaceCheckpoint>,
  agents: Array<WorkspaceAgent>,
): ProjectOverview {
  const pendingCheckpointCount = checkpoints.filter(
    (checkpoint) =>
      checkpoint.project_name === project.name && isCheckpointReviewable(checkpoint),
  ).length
  const focus = getProjectFocus(project, detail)

  return {
    project,
    phaseLabel: focus.phaseLabel,
    missionLabel: focus.missionLabel,
    progress: getProjectProgress(project, detail),
    pendingCheckpointCount,
    gates: deriveGatePills(project, detail, pendingCheckpointCount),
    squad: getSquadFromProject(project, checkpoints, agents),
    canResume:
      Boolean(focus.resumeMissionId) &&
      !['completed', 'done'].includes(project.status),
    resumeMissionId: focus.resumeMissionId,
  }
}

export function deriveCheckpointScope(
  checkpoint: WorkspaceCheckpoint,
): 'UI' | 'API' {
  const parsed = getCheckpointDiffStatParsed(checkpoint)
  const joined = [...(parsed?.changedFiles ?? []), checkpoint.task_name ?? '', checkpoint.summary ?? '']
    .join(' ')
    .toLowerCase()

  if (
    joined.includes('route') ||
    joined.includes('server') ||
    joined.includes('/api') ||
    joined.includes('auth') ||
    joined.includes('middleware')
  ) {
    return 'API'
  }

  return 'UI'
}

export function deriveCheckpointRisk(checkpoint: WorkspaceCheckpoint): {
  label: string
  high: boolean
} {
  const text = [
    checkpoint.task_name ?? '',
    checkpoint.summary ?? '',
    checkpoint.diff_stat ?? '',
  ]
    .join(' ')
    .toLowerCase()

  if (
    text.includes('auth') ||
    text.includes('token') ||
    text.includes('session') ||
    text.includes('permission') ||
    text.includes('security')
  ) {
    return { label: 'AUTH', high: true }
  }

  return { label: 'Low', high: false }
}

export function isCheckpointVerified(checkpoint: WorkspaceCheckpoint): boolean {
  const parsed = getCheckpointDiffStatParsed(checkpoint)
  return Boolean(
    checkpoint.commit_hash?.trim() ||
      (parsed && (parsed.filesChanged > 0 || parsed.changedFiles.length > 0)),
  )
}

export function formatTimeAgo(value: string): string {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return value

  const diff = Math.max(0, Date.now() - timestamp)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < hour) return `${Math.max(1, Math.round(diff / minute))}m`
  if (diff < day) return `${Math.round(diff / hour)}h`
  return `${Math.round(diff / day)}d`
}

export function formatMinutes(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    return `${minutes / 60}h`
  }
  if (minutes >= 60) {
    return `${(minutes / 60).toFixed(1)}h`
  }
  return `${minutes}m`
}

export function isHighRiskTask(task: Pick<DecomposedTaskDraft, 'name' | 'description'>): boolean {
  const text = `${task.name} ${task.description}`.toLowerCase()
  return (
    text.includes('auth') ||
    text.includes('security') ||
    text.includes('payment') ||
    text.includes('payments') ||
    text.includes('jwt') ||
    text.includes('token') ||
    text.includes('db migration') ||
    text.includes('database migration')
  )
}

export function deriveMissionName(goal: string): string {
  const normalized = goal.replace(/\s+/g, ' ').trim()
  if (normalized.length === 0) return 'Untitled mission'
  if (normalized.length <= 60) return normalized
  return `${normalized.slice(0, 57).trimEnd()}...`
}

export function getExecutionWaveCount(tasks: DecomposedTaskDraft[]): number {
  return calculateExecutionWaves(tasks).length
}

export function calculateExecutionWaves(tasks: DecomposedTaskDraft[]): DecomposedTaskDraft[][] {
  if (tasks.length === 0) return []
  const taskMap = new Map(tasks.map((task) => [task.name, task] as const))
  const remaining = new Set(tasks.map((task) => task.name))
  const completed = new Set<string>()
  const waves: DecomposedTaskDraft[][] = []

  while (remaining.size > 0) {
    const wave = tasks.filter(
      (task) =>
        remaining.has(task.name) &&
        task.depends_on.every(
          (dependency) => !taskMap.has(dependency) || completed.has(dependency),
        ),
    )

    if (wave.length === 0) {
      waves.push(
        tasks.filter((task) => remaining.has(task.name)),
      )
      break
    }

    waves.push(wave)
    for (const task of wave) {
      remaining.delete(task.name)
      completed.add(task.name)
    }
  }

  return waves
}

export function getAgentBadgeLabel(agentType: string | null): string {
  if (!agentType) return 'Unassigned'
  if (agentType === 'codex') return 'Codex'
  if (agentType === 'claude') return 'Claude'
  if (agentType === 'ollama') return 'Ollama'
  if (agentType === 'openclaw') return 'OpenClaw'
  return agentType
}

export function getAgentBadgeClass(agentType: string | null): string {
  if (agentType === 'codex') {
    return 'border-sky-500/30 bg-sky-500/10 text-sky-300'
  }
  if (agentType === 'claude') {
    return 'border-accent-500/30 bg-accent-500/10 text-accent-300'
  }
  if (agentType === 'ollama') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  }
  if (agentType === 'openclaw') {
    return 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300'
  }
  return 'border-primary-700 bg-primary-800/80 text-primary-300'
}

export function getAgentUtilization(agent: WorkspaceAgent): {
  percent: number
  label: string
  tone: string
} {
  const status = agent.status.toLowerCase()
  if (status === 'offline') {
    return { percent: 0, label: 'offline', tone: 'bg-primary-700' }
  }
  if (['running', 'busy', 'active'].includes(status)) {
    return { percent: 100, label: '1/1', tone: 'bg-accent-400' }
  }
  if (status === 'paused') {
    return { percent: 22, label: 'paused', tone: 'bg-amber-400' }
  }
  return { percent: 36, label: 'idle', tone: 'bg-emerald-400' }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function getPanelButtonClass(active: boolean, tone: string, idle?: string) {
  return cn(
    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
    active ? tone : idle ?? 'border-primary-700 bg-primary-800/70 text-primary-300',
  )
}
