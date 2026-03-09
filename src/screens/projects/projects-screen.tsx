import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  EyeIcon,
  Folder01Icon,
  PlayCircleIcon,
  RefreshIcon,
  Task01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  formatCheckpointStatus,
  formatCheckpointTimestamp,
  getCheckpointActionButtonClass,
  getCheckpointCommitHashLabel,
  getCheckpointDiffStat,
  getCheckpointDiffStatParsed,
  getCheckpointFullSummary,
  getCheckpointStatusBadgeClass,
  getCheckpointSummary,
  isCheckpointReviewable,
  listWorkspaceCheckpoints,
  matchesCheckpointProject,
  sortCheckpointsNewestFirst,
  submitCheckpointReview,
  type WorkspaceCheckpoint,
} from '@/lib/workspace-checkpoints'

type WorkspaceStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed'
  | 'active'
  | 'paused'
  | 'done'
  | string

type WorkspaceTask = {
  id: string
  mission_id?: string
  name: string
  description?: string
  status: WorkspaceStatus
  sort_order?: number
  depends_on: string[]
  agent_id?: string
}

type WorkspaceMission = {
  id: string
  phase_id?: string
  name: string
  status: WorkspaceStatus
  progress?: number
  tasks: Array<WorkspaceTask>
}

type WorkspacePhase = {
  id: string
  project_id?: string
  name: string
  sort_order?: number
  status?: WorkspaceStatus
  missions: Array<WorkspaceMission>
}

type WorkspaceProject = {
  id: string
  name: string
  path?: string
  spec?: string
  status: WorkspaceStatus
  phases: Array<WorkspacePhase>
  phase_count: number
  mission_count: number
  task_count: number
}

type WorkspaceAgent = {
  id: string
  name: string
  role?: string
  adapter_type?: string
  status: string
}

type WorkspaceStats = {
  projects: number
  agentsOnline: number
  agentsTotal: number
  running: number
  queued: number
  paused: number
  checkpointsPending: number
  policyAlerts: number
  costToday: number
}

type WorkspaceActivityEvent = {
  id: string
  type: string
  entity_type: string
  entity_id: string
  data: Record<string, unknown> | null
  timestamp: string
}

type ProjectFormState = {
  name: string
  path: string
  spec: string
}

type PhaseFormState = {
  name: string
}

type MissionFormState = {
  name: string
}

type TaskFormState = {
  name: string
  description: string
  dependsOn: string
}

type ReviewVerificationFilter = 'all' | 'verified' | 'missing'
type ReviewRiskFilter = 'all' | 'high'

type ProjectOverview = {
  project: WorkspaceProject
  phaseLabel: string
  missionLabel: string
  progress: number
  pendingCheckpointCount: number
  gates: Array<{
    label: string
    tone: 'neutral' | 'success' | 'warning' | 'accent'
  }>
  squad: Array<{
    label: string
    tone: string
  }>
  canResume: boolean
  resumeMissionId: string | null
}

const PROJECT_TONES = [
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
]

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function normalizeStatus(value: unknown): WorkspaceStatus {
  return asString(value) ?? 'pending'
}

function parseDependsOn(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item))
  if (typeof value === 'string' && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : []
    } catch {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    }
  }
  return []
}

function normalizeTask(value: unknown): WorkspaceTask {
  const record = asRecord(value)
  return {
    id:
      asString(record?.id) ?? asString(record?.task_id) ?? crypto.randomUUID(),
    mission_id: asString(record?.mission_id),
    name: asString(record?.name) ?? asString(record?.title) ?? 'Untitled task',
    description: asString(record?.description),
    status: normalizeStatus(record?.status),
    sort_order: asNumber(record?.sort_order),
    depends_on: parseDependsOn(record?.depends_on),
    agent_id: asString(record?.agent_id),
  }
}

function normalizeMission(value: unknown): WorkspaceMission {
  const record = asRecord(value)
  return {
    id:
      asString(record?.id) ??
      asString(record?.mission_id) ??
      crypto.randomUUID(),
    phase_id: asString(record?.phase_id),
    name: asString(record?.name) ?? 'Untitled mission',
    status: normalizeStatus(record?.status),
    progress: asNumber(record?.progress),
    tasks: asArray(record?.tasks).map(normalizeTask),
  }
}

function normalizePhase(value: unknown): WorkspacePhase {
  const record = asRecord(value)
  return {
    id:
      asString(record?.id) ?? asString(record?.phase_id) ?? crypto.randomUUID(),
    project_id: asString(record?.project_id),
    name: asString(record?.name) ?? 'Untitled phase',
    sort_order: asNumber(record?.sort_order),
    status: normalizeStatus(record?.status),
    missions: asArray(record?.missions).map(normalizeMission),
  }
}

function normalizeProject(value: unknown): WorkspaceProject {
  const record = asRecord(value)
  const phases = asArray(record?.phases).map(normalizePhase)
  return {
    id:
      asString(record?.id) ??
      asString(record?.project_id) ??
      crypto.randomUUID(),
    name: asString(record?.name) ?? 'Untitled project',
    path: asString(record?.path),
    spec: asString(record?.spec),
    status: normalizeStatus(record?.status),
    phases,
    phase_count: asNumber(record?.phase_count) ?? phases.length,
    mission_count:
      asNumber(record?.mission_count) ??
      getMissionCount({ phases } as WorkspaceProject),
    task_count:
      asNumber(record?.task_count) ?? getTaskCount({ phases } as WorkspaceProject),
  }
}

function normalizeAgent(value: unknown): WorkspaceAgent {
  const record = asRecord(value)
  return {
    id: asString(record?.id) ?? crypto.randomUUID(),
    name: asString(record?.name) ?? 'Unnamed agent',
    role: asString(record?.role),
    adapter_type: asString(record?.adapter_type),
    status: asString(record?.status) ?? 'offline',
  }
}

function normalizeStats(value: unknown): WorkspaceStats {
  const record = asRecord(value)
  return {
    projects: asNumber(record?.projects) ?? 0,
    agentsOnline: asNumber(record?.agentsOnline) ?? 0,
    agentsTotal: asNumber(record?.agentsTotal) ?? 0,
    running: asNumber(record?.running) ?? 0,
    queued: asNumber(record?.queued) ?? 0,
    paused: asNumber(record?.paused) ?? 0,
    checkpointsPending: asNumber(record?.checkpointsPending) ?? 0,
    policyAlerts: asNumber(record?.policyAlerts) ?? 0,
    costToday: asNumber(record?.costToday) ?? 0,
  }
}

function normalizeActivityEvent(value: unknown): WorkspaceActivityEvent {
  const record = asRecord(value)
  return {
    id: String(record?.id ?? crypto.randomUUID()),
    type: asString(record?.type) ?? 'activity.unknown',
    entity_type: asString(record?.entity_type) ?? 'activity',
    entity_id: asString(record?.entity_id) ?? '',
    data: asRecord(record?.data),
    timestamp: asString(record?.timestamp) ?? new Date().toISOString(),
  }
}

function extractProjects(payload: unknown): Array<WorkspaceProject> {
  if (Array.isArray(payload)) return payload.map(normalizeProject)

  const record = asRecord(payload)
  const candidates = [record?.projects, record?.data, record?.items]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(normalizeProject)
    }
  }

  return []
}

function extractProject(payload: unknown): WorkspaceProject | null {
  if (Array.isArray(payload)) {
    return payload[0] ? normalizeProject(payload[0]) : null
  }

  const record = asRecord(payload)
  const projectValue = record?.project ?? record?.data ?? payload
  const projectRecord = asRecord(projectValue)
  return projectRecord ? normalizeProject(projectRecord) : null
}

function extractTasks(payload: unknown): Array<WorkspaceTask> {
  if (Array.isArray(payload)) return payload.map(normalizeTask)

  const record = asRecord(payload)
  const candidates = [record?.tasks, record?.data, record?.items]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(normalizeTask)
    }
  }

  return []
}

function extractAgents(payload: unknown): Array<WorkspaceAgent> {
  if (Array.isArray(payload)) return payload.map(normalizeAgent)

  const record = asRecord(payload)
  const candidates = [record?.agents, record?.data, record?.items]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(normalizeAgent)
    }
  }

  return []
}

function extractActivityEvents(payload: unknown): Array<WorkspaceActivityEvent> {
  if (Array.isArray(payload)) return payload.map(normalizeActivityEvent)

  const record = asRecord(payload)
  const candidates = [record?.events, record?.data, record?.items]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(normalizeActivityEvent)
    }
  }

  return []
}

function getMissionCount(project: WorkspaceProject): number {
  return project.phases.reduce(
    (count, phase) => count + phase.missions.length,
    0,
  )
}

function getTaskCount(project: WorkspaceProject): number {
  return project.phases.reduce(
    (count, phase) =>
      count +
      phase.missions.reduce(
        (missionCount, mission) => missionCount + mission.tasks.length,
        0,
      ),
    0,
  )
}

function getStatusBadgeClass(status: WorkspaceStatus): string {
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

function getTaskDotClass(status: WorkspaceStatus): string {
  if (status === 'ready') return 'bg-blue-400'
  if (status === 'running' || status === 'in_progress' || status === 'active') {
    return 'bg-emerald-400'
  }
  if (status === 'completed' || status === 'done') return 'bg-green-400'
  if (status === 'paused') return 'bg-amber-400'
  if (status === 'failed') return 'bg-red-400'
  return 'bg-primary-500'
}

function formatStatus(status: WorkspaceStatus): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatRelativeTime(value: string): string {
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

function getActivityEventDescription(event: WorkspaceActivityEvent): string {
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

function getActivityEventTone(eventType: string): {
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
    const record = asRecord(payload)
    throw new Error(
      asString(record?.error) ??
        asString(record?.message) ??
        `Request failed with status ${response.status}`,
    )
  }

  return payload
}

async function loadMissionTasks(
  missionId: string,
): Promise<Array<WorkspaceTask>> {
  const payload = await apiRequest(
    `/api/workspace-tasks?mission_id=${encodeURIComponent(missionId)}`,
  )
  return extractTasks(payload)
}

function flattenProjectTasks(project?: WorkspaceProject | null): WorkspaceTask[] {
  if (!project) return []
  return project.phases.flatMap((phase) =>
    phase.missions.flatMap((mission) => mission.tasks),
  )
}

function flattenProjectMissions(
  project?: WorkspaceProject | null,
): Array<{ phase: WorkspacePhase; mission: WorkspaceMission }> {
  if (!project) return []
  return project.phases.flatMap((phase) =>
    phase.missions.map((mission) => ({ phase, mission })),
  )
}

function getProjectProgress(
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

function getProjectFocus(
  project: WorkspaceProject,
  detail?: WorkspaceProject | null,
): { phaseLabel: string; missionLabel: string; resumeMissionId: string | null } {
  const missions = flattenProjectMissions(detail ?? project)
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

  const phaseIndex = (detail ?? project).phases.findIndex(
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

function getProjectTone(project: WorkspaceProject) {
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

function getGateClass(tone: ProjectOverview['gates'][number]['tone']): string {
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

function buildProjectOverview(
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

function deriveCheckpointScope(checkpoint: WorkspaceCheckpoint): 'UI' | 'API' {
  const parsed = getCheckpointDiffStatParsed(checkpoint)
  const joined = [
    ...parsed?.changedFiles ?? [],
    checkpoint.task_name ?? '',
    checkpoint.summary ?? '',
  ]
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

function deriveCheckpointRisk(checkpoint: WorkspaceCheckpoint): {
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

function isCheckpointVerified(checkpoint: WorkspaceCheckpoint): boolean {
  const parsed = getCheckpointDiffStatParsed(checkpoint)
  return Boolean(
    checkpoint.commit_hash?.trim() ||
      (parsed && (parsed.filesChanged > 0 || parsed.changedFiles.length > 0)),
  )
}

function formatTimeAgo(value: string): string {
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

function getAgentUtilization(agent: WorkspaceAgent): {
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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

type CreateDialogProps = {
  open: boolean
  title: string
  description: string
  submitting: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  submitLabel: string
}

function CreateDialog({
  open,
  title,
  description,
  submitting,
  onOpenChange,
  children,
  onSubmit,
  submitLabel,
}: CreateDialogProps) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(540px,94vw)] border-primary-700 bg-primary-900 p-0 text-primary-100 shadow-2xl">
        <form onSubmit={onSubmit} className="space-y-5 p-5">
          <div className="space-y-1">
            <DialogTitle className="text-base font-semibold text-primary-100">
              {title}
            </DialogTitle>
            <DialogDescription className="text-sm text-primary-400">
              {description}
            </DialogDescription>
          </div>

          <div className="space-y-4">{children}</div>

          <div className="flex items-center justify-end gap-2">
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button
              type="submit"
              className="bg-accent-500 text-white hover:bg-accent-400"
              disabled={submitting}
            >
              {submitting ? 'Saving...' : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}

function FieldLabel({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-primary-400">
        {label}
      </span>
      {children}
    </label>
  )
}

function MetricCard({
  label,
  value,
  sublabel,
  tone = 'text-primary-100',
}: {
  label: string
  value: string
  sublabel?: string
  tone?: string
}) {
  return (
    <div className="rounded-2xl border border-primary-800 bg-primary-900/75 px-4 py-4 shadow-sm">
      <div className={cn('text-2xl font-semibold tracking-tight', tone)}>
        {value}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-primary-400">
        {label}
      </div>
      {sublabel ? (
        <div className="mt-2 text-xs text-primary-500">{sublabel}</div>
      ) : null}
    </div>
  )
}

export function ProjectsScreen() {
  const [projects, setProjects] = useState<Array<WorkspaceProject>>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  )
  const [projectDetail, setProjectDetail] = useState<WorkspaceProject | null>(
    null,
  )
  const [projectSpecDraft, setProjectSpecDraft] = useState('')
  const [projectSpecOpen, setProjectSpecOpen] = useState(false)
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>(
    {},
  )
  const [listLoading, setListLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [phaseProject, setPhaseProject] = useState<WorkspaceProject | null>(
    null,
  )
  const [missionPhase, setMissionPhase] = useState<WorkspacePhase | null>(null)
  const [taskMission, setTaskMission] = useState<WorkspaceMission | null>(null)
  const [submittingKey, setSubmittingKey] = useState<string | null>(null)
  const [projectForm, setProjectForm] = useState<ProjectFormState>({
    name: '',
    path: '',
    spec: '',
  })
  const [phaseForm, setPhaseForm] = useState<PhaseFormState>({ name: '' })
  const [missionForm, setMissionForm] = useState<MissionFormState>({ name: '' })
  const [taskForm, setTaskForm] = useState<TaskFormState>({
    name: '',
    description: '',
    dependsOn: '',
  })
  const [reviewProjectFilter, setReviewProjectFilter] = useState('all')
  const [reviewVerificationFilter, setReviewVerificationFilter] =
    useState<ReviewVerificationFilter>('all')
  const [reviewRiskFilter, setReviewRiskFilter] =
    useState<ReviewRiskFilter>('all')
  const [batchApproving, setBatchApproving] = useState(false)
  const queryClient = useQueryClient()
  const detailSectionRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchProjects() {
      setListLoading(true)

      try {
        const payload = await apiRequest('/api/workspace/projects')
        if (cancelled) return

        const nextProjects = extractProjects(payload)
        setProjects(nextProjects)

        setSelectedProjectId((current) => {
          if (
            current &&
            nextProjects.some((project) => project.id === current)
          ) {
            return current
          }
          return nextProjects[0]?.id ?? null
        })
      } catch (error) {
        if (!cancelled) {
          toast(
            error instanceof Error ? error.message : 'Failed to load projects',
            { type: 'error' },
          )
        }
      } finally {
        if (!cancelled) {
          setListLoading(false)
        }
      }
    }

    void fetchProjects()

    return () => {
      cancelled = true
    }
  }, [refreshToken])

  useEffect(() => {
    if (!selectedProjectId) {
      setProjectDetail(null)
      return
    }

    let cancelled = false

    async function fetchProjectDetail() {
      setDetailLoading(true)

      try {
        const payload = await apiRequest(
          `/api/workspace/projects/${selectedProjectId}`,
        )
        const detail = extractProject(payload)

        if (!detail) {
          throw new Error('Project detail was empty')
        }

        const taskEntries = await Promise.all(
          detail.phases.flatMap((phase) =>
            phase.missions.map(async (mission) => ({
              missionId: mission.id,
              tasks: await loadMissionTasks(mission.id),
            })),
          ),
        )

        if (cancelled) return

        const taskMap = new Map(
          taskEntries.map((entry) => [entry.missionId, entry.tasks]),
        )
        const hydratedDetail: WorkspaceProject = {
          ...detail,
          phases: detail.phases
            .slice()
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((phase) => ({
              ...phase,
              missions: phase.missions.map((mission) => ({
                ...mission,
                tasks: taskMap.get(mission.id) ?? mission.tasks,
              })),
            })),
        }

        setProjectDetail(hydratedDetail)
        setExpandedPhases((current) => {
          const next = { ...current }
          for (const phase of hydratedDetail.phases) {
            if (next[phase.id] === undefined) {
              next[phase.id] = true
            }
          }
          return next
        })
      } catch (error) {
        if (!cancelled) {
          toast(
            error instanceof Error
              ? error.message
              : 'Failed to load project detail',
            { type: 'error' },
          )
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false)
        }
      }
    }

    void fetchProjectDetail()

    return () => {
      cancelled = true
    }
  }, [selectedProjectId, refreshToken])

  useEffect(() => {
    if (!projectDetail) return

    const hasRunning = projectDetail.phases.some((phase) =>
      phase.missions.some(
        (mission) =>
          mission.status === 'running' ||
          mission.tasks.some((task) => task.status === 'running'),
      ),
    )

    if (!hasRunning) return

    const interval = setInterval(() => {
      triggerRefresh()
    }, 4000)

    return () => clearInterval(interval)
  }, [projectDetail])

  const selectedSummary = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  useEffect(() => {
    const spec = projectDetail?.spec ?? selectedSummary?.spec ?? ''
    setProjectSpecDraft(spec)
    setProjectSpecOpen(spec.trim().length > 0)
  }, [projectDetail?.id, projectDetail?.spec, selectedSummary?.id, selectedSummary?.spec])

  const statsQuery = useQuery({
    queryKey: ['workspace', 'stats'],
    queryFn: async () => normalizeStats(await apiRequest('/api/workspace/stats')),
  })

  const agentsQuery = useQuery({
    queryKey: ['workspace', 'agents'],
    queryFn: async () => extractAgents(await apiRequest('/api/workspace/agents')),
  })

  const projectSnapshotsQuery = useQuery({
    queryKey: [
      'workspace',
      'project-snapshots',
      projects.map((project) => project.id).join(','),
    ],
    enabled: projects.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        projects.map(async (project) => {
          const payload = await apiRequest(`/api/workspace/projects/${project.id}`)
          return {
            id: project.id,
            detail: extractProject(payload),
          }
        }),
      )

      return entries.filter(
        (entry): entry is { id: string; detail: WorkspaceProject } =>
          Boolean(entry.detail),
      )
    },
  })

  const checkpointsQuery = useQuery({
    queryKey: ['workspace', 'checkpoints'],
    queryFn: () => listWorkspaceCheckpoints(),
  })

  const activityEventsQuery = useQuery({
    queryKey: ['workspace', 'events', selectedProjectId],
    enabled: Boolean(selectedProjectId),
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '30',
      })

      if (selectedProjectId) {
        params.set('project_id', selectedProjectId)
      }

      return extractActivityEvents(
        await apiRequest(`/api/workspace/events?${params.toString()}`),
      )
    },
  })

  const projectCheckpointMutation = useMutation({
    mutationFn: ({
      checkpointId,
      action,
    }: {
      checkpointId: string
      action: 'approve' | 'reject'
    }) => submitCheckpointReview(checkpointId, action),
    onSuccess: (_checkpoint, variables) => {
      toast(
        variables.action === 'approve'
          ? 'Checkpoint approved'
          : 'Checkpoint rejected',
        { type: 'success' },
      )
      void queryClient.invalidateQueries({
        queryKey: ['workspace'],
      })
      triggerRefresh()
    },
    onError: (error) => {
      toast(
        error instanceof Error ? error.message : 'Failed to update checkpoint',
        { type: 'error' },
      )
    },
  })

  const agents = agentsQuery.data ?? []
  const allCheckpoints = checkpointsQuery.data ?? []
  const activityEvents = activityEventsQuery.data ?? []
  const pendingCheckpoints = useMemo(
    () =>
      sortCheckpointsNewestFirst(
        allCheckpoints.filter((checkpoint) => isCheckpointReviewable(checkpoint)),
      ),
    [allCheckpoints],
  )
  const projectSnapshotMap = useMemo(
    () =>
      new Map(
        (projectSnapshotsQuery.data ?? []).map((entry) => [entry.id, entry.detail]),
      ),
    [projectSnapshotsQuery.data],
  )
  const projectOverviews = useMemo(
    () =>
      projects.map((project) =>
        buildProjectOverview(
          project,
          projectSnapshotMap.get(project.id),
          pendingCheckpoints,
          agents,
        ),
      ),
    [agents, pendingCheckpoints, projectSnapshotMap, projects],
  )
  const reviewProjectOptions = useMemo(
    () =>
      Array.from(
        new Set(
          pendingCheckpoints
            .map((checkpoint) => checkpoint.project_name)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    [pendingCheckpoints],
  )
  const reviewInboxItems = useMemo(() => {
    return pendingCheckpoints.filter((checkpoint) => {
      if (
        reviewProjectFilter !== 'all' &&
        checkpoint.project_name !== reviewProjectFilter
      ) {
        return false
      }

      const verified = isCheckpointVerified(checkpoint)
      if (reviewVerificationFilter === 'verified' && !verified) return false
      if (reviewVerificationFilter === 'missing' && verified) return false

      const risk = deriveCheckpointRisk(checkpoint)
      if (reviewRiskFilter === 'high' && !risk.high) return false

      return true
    })
  }, [
    pendingCheckpoints,
    reviewProjectFilter,
    reviewRiskFilter,
    reviewVerificationFilter,
  ])
  const verifiedReviewItems = useMemo(
    () => reviewInboxItems.filter((checkpoint) => isCheckpointVerified(checkpoint)),
    [reviewInboxItems],
  )
  const projectCheckpoints = useMemo(() => {
    const projectName = projectDetail?.name ?? selectedSummary?.name
    const filtered = allCheckpoints.filter((checkpoint) =>
      matchesCheckpointProject(checkpoint, projectName),
    )

    if (filtered.length > 0) return filtered
    return allCheckpoints
  }, [allCheckpoints, projectDetail?.name, selectedSummary?.name])
  const pendingProjectCheckpoints = useMemo(
    () =>
      projectCheckpoints.filter((checkpoint) =>
        isCheckpointReviewable(checkpoint),
      ),
    [projectCheckpoints],
  )

  function triggerRefresh() {
    setRefreshToken((value) => value + 1)
    void queryClient.invalidateQueries({ queryKey: ['workspace'] })
  }

  function focusProject(projectId: string) {
    setSelectedProjectId(projectId)
    window.requestAnimationFrame(() => {
      detailSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  async function handleApproveVerified() {
    if (verifiedReviewItems.length === 0) {
      toast('No verified checkpoints to approve', { type: 'warning' })
      return
    }

    setBatchApproving(true)

    try {
      for (const checkpoint of verifiedReviewItems) {
        await submitCheckpointReview(checkpoint.id, 'approve')
      }
      toast(
        `Approved ${verifiedReviewItems.length} verified checkpoint${verifiedReviewItems.length === 1 ? '' : 's'}`,
        { type: 'success' },
      )
      triggerRefresh()
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Failed to approve checkpoints',
        { type: 'error' },
      )
    } finally {
      setBatchApproving(false)
    }
  }

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!projectForm.name.trim()) {
      toast('Project name is required', { type: 'warning' })
      return
    }

    setSubmittingKey('project')

    try {
      await apiRequest('/api/workspace/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectForm.name.trim(),
          path: projectForm.path.trim() || undefined,
          spec: projectForm.spec.trim() || undefined,
        }),
      })

      toast('Project created', { type: 'success' })
      setProjectDialogOpen(false)
      setProjectForm({ name: '', path: '', spec: '' })
      triggerRefresh()
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Failed to create project',
        {
          type: 'error',
        },
      )
    } finally {
      setSubmittingKey(null)
    }
  }

  async function handleCreatePhase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!phaseProject || !phaseForm.name.trim()) {
      toast('Phase name is required', { type: 'warning' })
      return
    }

    setSubmittingKey('phase')

    try {
      await apiRequest('/api/workspace/phases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: phaseProject.id,
          name: phaseForm.name.trim(),
          sort_order: phaseProject.phases.length,
        }),
      })

      toast('Phase added', { type: 'success' })
      setPhaseProject(null)
      setPhaseForm({ name: '' })
      triggerRefresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to add phase', {
        type: 'error',
      })
    } finally {
      setSubmittingKey(null)
    }
  }

  async function handleCreateMission(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!missionPhase || !missionForm.name.trim()) {
      toast('Mission name is required', { type: 'warning' })
      return
    }

    setSubmittingKey('mission')

    try {
      await apiRequest('/api/workspace/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase_id: missionPhase.id,
          name: missionForm.name.trim(),
        }),
      })

      toast('Mission added', { type: 'success' })
      setMissionPhase(null)
      setMissionForm({ name: '' })
      triggerRefresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to add mission', {
        type: 'error',
      })
    } finally {
      setSubmittingKey(null)
    }
  }

  async function handleCreateTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!taskMission || !taskForm.name.trim()) {
      toast('Task name is required', { type: 'warning' })
      return
    }

    setSubmittingKey('task')

    try {
      await apiRequest('/api/workspace-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mission_id: taskMission.id,
          name: taskForm.name.trim(),
          description: taskForm.description.trim(),
          sort_order: taskMission.tasks.length,
          depends_on: taskForm.dependsOn
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      })

      toast('Task added', { type: 'success' })
      setTaskMission(null)
      setTaskForm({ name: '', description: '', dependsOn: '' })
      triggerRefresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to add task', {
        type: 'error',
      })
    } finally {
      setSubmittingKey(null)
    }
  }

  async function handleStartMission(missionId: string) {
    setSubmittingKey(`start:${missionId}`)

    try {
      await apiRequest(`/api/workspace/missions/${missionId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      toast('Mission started', { type: 'success' })
      triggerRefresh()
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Failed to start mission',
        {
          type: 'error',
        },
      )
    } finally {
      setSubmittingKey(null)
    }
  }

  async function handleSaveProjectSpec() {
    const activeProject = projectDetail ?? selectedSummary
    if (!activeProject) {
      return
    }

    setSubmittingKey('project-spec')

    try {
      const payload = await apiRequest(
        `/api/workspace/projects/${encodeURIComponent(activeProject.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            spec: projectSpecDraft.trim() ? projectSpecDraft : null,
          }),
        },
      )

      const updatedProject = extractProject(payload)
      if (updatedProject) {
        setProjectDetail((current) =>
          current?.id === updatedProject.id ? { ...current, ...updatedProject } : current,
        )
        setProjects((current) =>
          current.map((project) =>
            project.id === updatedProject.id ? { ...project, ...updatedProject } : project,
          ),
        )
        setProjectSpecDraft(updatedProject.spec ?? '')
        setProjectSpecOpen(Boolean(updatedProject.spec?.trim()))
      }

      toast('Project spec saved', { type: 'success' })
      triggerRefresh()
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Failed to save project spec',
        { type: 'error' },
      )
    } finally {
      setSubmittingKey(null)
    }
  }

  function togglePhase(phaseId: string) {
    setExpandedPhases((current) => ({
      ...current,
      [phaseId]: !current[phaseId],
    }))
  }

  return (
    <main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-100 md:px-6 md:pt-8">
      <section className="mx-auto w-full max-w-[1480px] space-y-5">
        <header className="flex flex-col gap-4 rounded-3xl border border-primary-800 bg-primary-900/85 px-5 py-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-accent-500/30 bg-accent-500/10 text-accent-300">
              <HugeiconsIcon icon={Folder01Icon} size={24} strokeWidth={1.6} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-primary-100">
                Projects
              </h1>
              <p className="text-sm text-primary-400">
                Mission control for workspace execution, review handoffs, and agent load.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={triggerRefresh}
              disabled={listLoading || detailLoading}
            >
              Refresh
            </Button>
            <Button
              onClick={() => setProjectDialogOpen(true)}
              className="bg-accent-500 text-white hover:bg-accent-400"
            >
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.6} />
              New Project
            </Button>
          </div>
        </header>

        {listLoading && projects.length === 0 ? (
          <div className="rounded-3xl border border-primary-800 bg-primary-900/70 px-6 py-16 text-center">
            <div className="mb-4 inline-block h-10 w-10 animate-spin rounded-full border-4 border-accent-500 border-r-transparent" />
            <p className="text-sm text-primary-400">
              Loading workspace projects...
            </p>
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-primary-700 bg-primary-900/60 px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-3xl border border-primary-700 bg-primary-800/80 text-primary-300">
              <HugeiconsIcon icon={Folder01Icon} size={26} strokeWidth={1.5} />
            </div>
            <h2 className="text-lg font-semibold text-primary-100">
              No projects yet
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-primary-400">
              Create your first project to organize phases, missions, and task
              execution for an agent workflow.
            </p>
            <Button
              onClick={() => setProjectDialogOpen(true)}
              className="mt-5 bg-accent-500 text-white hover:bg-accent-400"
            >
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.6} />
              Create First Project
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
              <MetricCard
                label="Projects"
                value={String(statsQuery.data?.projects ?? projects.length)}
                tone="text-accent-300"
              />
              <MetricCard
                label="Agents Online"
                value={`${statsQuery.data?.agentsOnline ?? agents.filter((agent) => agent.status !== 'offline').length}/${statsQuery.data?.agentsTotal ?? agents.length}`}
                tone="text-emerald-300"
              />
              <MetricCard
                label="Running / Queued / Paused"
                value={`${statsQuery.data?.running ?? 0} / ${statsQuery.data?.queued ?? 0} / ${statsQuery.data?.paused ?? 0}`}
                tone="text-sky-300"
              />
              <MetricCard
                label="Checkpoints Pending"
                value={String(statsQuery.data?.checkpointsPending ?? pendingCheckpoints.length)}
                tone="text-red-300"
              />
              <MetricCard
                label="Policy Alerts"
                value={String(statsQuery.data?.policyAlerts ?? 0)}
                sublabel={
                  (statsQuery.data?.policyAlerts ?? 0) > 0
                    ? 'Action required'
                    : 'No blockers'
                }
                tone="text-amber-300"
              />
              <MetricCard
                label="Cost Today"
                value={formatCurrency(statsQuery.data?.costToday ?? 0)}
                tone="text-emerald-300"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {projectOverviews.map((overview) => {
                const active = overview.project.id === selectedProjectId
                const tone = getProjectTone(overview.project)

                return (
                  <article
                    key={overview.project.id}
                    className={cn(
                      'rounded-3xl border bg-primary-900/78 p-5 shadow-sm transition-colors',
                      active
                        ? 'border-accent-500/60 shadow-[0_0_0_1px_rgba(251,146,60,0.14)]'
                        : 'border-primary-800 hover:border-primary-700',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => focusProject(overview.project.id)}
                      className="block w-full text-left"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'flex size-12 shrink-0 items-center justify-center rounded-2xl border',
                            tone.accent,
                          )}
                        >
                          <HugeiconsIcon
                            icon={Folder01Icon}
                            size={22}
                            strokeWidth={1.6}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-base font-semibold text-primary-100">
                                {overview.project.name}
                              </p>
                              <p className="truncate text-xs text-primary-400">
                                {overview.project.path || 'No path configured'}
                              </p>
                            </div>
                            <span
                              className={cn(
                                'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium',
                                getStatusBadgeClass(overview.project.status),
                              )}
                            >
                              {formatStatus(overview.project.status)}
                            </span>
                          </div>

                          <div className="mt-4 space-y-1.5">
                            <p className="text-xs uppercase tracking-[0.16em] text-primary-500">
                              Current phase
                            </p>
                            <p className="text-sm font-medium text-primary-100">
                              {overview.phaseLabel}
                            </p>
                            <p className="text-sm text-primary-300">
                              {overview.missionLabel}
                            </p>
                          </div>

                          <div className="mt-4">
                            <div className="h-2.5 overflow-hidden rounded-full bg-primary-800">
                              <div
                                className={cn(
                                  'h-full rounded-full bg-gradient-to-r',
                                  overview.progress >= 100
                                    ? 'from-emerald-500 to-emerald-400'
                                    : 'from-accent-500 to-emerald-400',
                                )}
                                style={{ width: `${overview.progress}%` }}
                              />
                            </div>
                            <div className="mt-2 flex items-center justify-between text-xs text-primary-400">
                              <span>{overview.progress}%</span>
                              <span
                                className={cn(
                                  'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium',
                                  overview.pendingCheckpointCount > 0
                                    ? 'border-red-500/30 bg-red-500/10 text-red-300'
                                    : 'border-primary-700 bg-primary-800/80 text-primary-300',
                                )}
                              >
                                {overview.pendingCheckpointCount}{' '}
                                checkpoint{overview.pendingCheckpointCount === 1 ? '' : 's'}
                              </span>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {overview.gates.map((gate) => (
                              <span
                                key={`${overview.project.id}-${gate.label}`}
                                className={cn(
                                  'inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]',
                                  getGateClass(gate.tone),
                                )}
                              >
                                {gate.label}
                              </span>
                            ))}
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {overview.squad.map((agent) => (
                              <span
                                key={`${overview.project.id}-${agent.label}`}
                                className="inline-flex items-center gap-2 rounded-full border border-primary-700 bg-primary-800/80 px-3 py-1 text-xs text-primary-200"
                              >
                                <span className={cn('size-2 rounded-full', agent.tone)} />
                                {agent.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </button>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {overview.canResume && overview.resumeMissionId ? (
                        <Button
                          onClick={() => void handleStartMission(overview.resumeMissionId!)}
                          disabled={
                            submittingKey === `start:${overview.resumeMissionId}`
                          }
                          className="bg-accent-500 text-white hover:bg-accent-400"
                        >
                          <HugeiconsIcon
                            icon={PlayCircleIcon}
                            size={16}
                            strokeWidth={1.6}
                          />
                          Resume
                        </Button>
                      ) : (
                        <Button variant="outline" onClick={() => focusProject(overview.project.id)}>
                          <HugeiconsIcon icon={Task01Icon} size={16} strokeWidth={1.6} />
                          Report
                        </Button>
                      )}
                      <Button variant="outline" onClick={() => focusProject(overview.project.id)}>
                        <HugeiconsIcon icon={EyeIcon} size={16} strokeWidth={1.6} />
                        View
                      </Button>
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,1fr)]">
              <section className="rounded-3xl border border-primary-800 bg-primary-900/78 p-5 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-primary-100">
                      Review Inbox ({reviewInboxItems.length})
                    </h2>
                    <p className="text-sm text-primary-400">
                      Pending checkpoint handoffs with fast verification and approval actions.
                    </p>
                  </div>
                  <Button
                    onClick={() => void handleApproveVerified()}
                    disabled={batchApproving || verifiedReviewItems.length === 0}
                    className="bg-accent-500 text-white hover:bg-accent-400"
                  >
                    <HugeiconsIcon
                      icon={CheckmarkCircle02Icon}
                      size={16}
                      strokeWidth={1.8}
                    />
                    {batchApproving
                      ? 'Approving...'
                      : `Approve all verified (${verifiedReviewItems.length})`}
                  </Button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewProjectFilter('all')}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      reviewProjectFilter === 'all'
                        ? 'border-accent-500/40 bg-accent-500/10 text-accent-300'
                        : 'border-primary-700 bg-primary-800/70 text-primary-300',
                    )}
                  >
                    All
                  </button>
                  {reviewProjectOptions.map((projectName) => (
                    <button
                      key={projectName}
                      type="button"
                      onClick={() => setReviewProjectFilter(projectName)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                        reviewProjectFilter === projectName
                          ? 'border-accent-500/40 bg-accent-500/10 text-accent-300'
                          : 'border-primary-700 bg-primary-800/70 text-primary-300',
                      )}
                    >
                      {projectName}
                    </button>
                  ))}
                  <div className="mx-1 hidden h-7 w-px bg-primary-800 md:block" />
                  {([
                    ['all', 'All checks'],
                    ['verified', 'Verified'],
                    ['missing', 'Missing'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setReviewVerificationFilter(value)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                        reviewVerificationFilter === value
                          ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                          : 'border-primary-700 bg-primary-800/70 text-primary-300',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setReviewRiskFilter((current) =>
                        current === 'high' ? 'all' : 'high',
                      )
                    }
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      reviewRiskFilter === 'high'
                        ? 'border-red-500/35 bg-red-500/10 text-red-300'
                        : 'border-primary-700 bg-primary-800/70 text-primary-300',
                    )}
                  >
                    High risk
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {checkpointsQuery.isLoading ? (
                    Array.from({ length: 3 }).map((_, index) => (
                      <div
                        key={index}
                        className="rounded-2xl border border-primary-800 bg-primary-800/35 p-4"
                      >
                        <div className="h-4 w-40 animate-shimmer rounded bg-primary-800/80" />
                        <div className="mt-3 h-5 w-3/4 animate-shimmer rounded bg-primary-800/70" />
                      </div>
                    ))
                  ) : reviewInboxItems.length > 0 ? (
                    reviewInboxItems.map((checkpoint) => {
                      const projectName = checkpoint.project_name ?? 'Workspace'
                      const projectForTone =
                        projects.find((project) => project.name === projectName) ??
                        selectedSummary ??
                        projects[0]
                      const tone = projectForTone
                        ? getProjectTone(projectForTone)
                        : PROJECT_TONES[0]
                      const scope = deriveCheckpointScope(checkpoint)
                      const risk = deriveCheckpointRisk(checkpoint)
                      const verified = isCheckpointVerified(checkpoint)

                      return (
                        <article
                          key={checkpoint.id}
                          className="rounded-2xl border border-primary-800 bg-primary-800/35 p-4"
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <span
                                className={cn(
                                  'inline-flex shrink-0 rounded-full px-3 py-1 text-[11px] font-medium',
                                  tone.soft,
                                )}
                              >
                                {projectName}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-primary-100">
                                  {checkpoint.task_name ?? getCheckpointSummary(checkpoint, 88)}
                                </p>
                                <p className="mt-1 line-clamp-2 text-sm text-primary-400">
                                  {getCheckpointFullSummary(checkpoint)}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <span className="inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-sky-300">
                                    {scope}
                                  </span>
                                  <span
                                    className={cn(
                                      'inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]',
                                      risk.high
                                        ? 'border-red-500/30 bg-red-500/10 text-red-300'
                                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
                                    )}
                                  >
                                    {risk.high ? `${risk.label} fire` : risk.label}
                                  </span>
                                  <span
                                    className={cn(
                                      'inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]',
                                      verified
                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                        : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
                                    )}
                                  >
                                    {verified ? 'Verified' : 'Missing'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end lg:self-auto">
                              <Button
                                onClick={() =>
                                  projectCheckpointMutation.mutate({
                                    checkpointId: checkpoint.id,
                                    action: 'approve',
                                  })
                                }
                                disabled={projectCheckpointMutation.isPending}
                                className="bg-accent-500 text-white hover:bg-accent-400"
                              >
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  const project = projects.find(
                                    (item) => item.name === checkpoint.project_name,
                                  )
                                  if (project) focusProject(project.id)
                                }}
                              >
                                Review
                              </Button>
                              <span className="min-w-10 text-right text-xs text-primary-500">
                                {formatTimeAgo(checkpoint.created_at)}
                              </span>
                            </div>
                          </div>
                        </article>
                      )
                    })
                  ) : (
                    <div className="rounded-2xl border border-dashed border-primary-700 bg-primary-800/25 px-6 py-12 text-center">
                      <p className="text-sm text-primary-300">
                        No pending checkpoints match the current inbox filters.
                      </p>
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-primary-800 bg-primary-900/78 p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-primary-100">
                      Agent Capacity
                    </h2>
                    <p className="text-sm text-primary-400">
                      Utilization by registered agent with queue depth from pending work.
                    </p>
                  </div>
                  <span className="rounded-full border border-primary-700 bg-primary-800/80 px-3 py-1 text-xs text-primary-300">
                    Queue depth {statsQuery.data?.queued ?? 0}
                  </span>
                </div>

                <div className="mt-4 space-y-4">
                  {agentsQuery.isLoading ? (
                    Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="space-y-2">
                        <div className="h-4 w-28 animate-shimmer rounded bg-primary-800/80" />
                        <div className="h-2.5 animate-shimmer rounded-full bg-primary-800/70" />
                      </div>
                    ))
                  ) : agents.length > 0 ? (
                    agents.map((agent) => {
                      const utilization = getAgentUtilization(agent)
                      return (
                        <div key={agent.id} className="space-y-2">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-primary-100">
                                {agent.name}
                              </p>
                              <p className="text-xs text-primary-500">
                                {(agent.adapter_type ?? agent.role ?? 'agent').toUpperCase()}
                              </p>
                            </div>
                            <span className="text-xs font-medium text-primary-300">
                              {utilization.label}
                            </span>
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-primary-800">
                            <div
                              className={cn('h-full rounded-full', utilization.tone)}
                              style={{ width: `${utilization.percent}%` }}
                            />
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="rounded-2xl border border-dashed border-primary-700 bg-primary-800/25 px-4 py-10 text-center text-sm text-primary-400">
                      No agents registered yet.
                    </div>
                  )}

                  <div className="rounded-2xl border border-primary-800 bg-primary-800/35 px-4 py-3 text-sm text-primary-400">
                    <span className="font-medium text-primary-200">
                      {statsQuery.data?.running ?? 0}
                    </span>{' '}
                    running,{' '}
                    <span className="font-medium text-primary-200">
                      {statsQuery.data?.queued ?? 0}
                    </span>{' '}
                    queued,{' '}
                    <span className="font-medium text-primary-200">
                      {statsQuery.data?.paused ?? 0}
                    </span>{' '}
                    paused tasks across the workspace.
                  </div>
                </div>
              </section>
            </div>

            <section
              ref={detailSectionRef}
              className="rounded-3xl border border-primary-800 bg-primary-900/75 p-4 md:p-5"
            >
              {selectedSummary ? (
                <>
                  <div className="flex flex-col gap-4 border-b border-primary-800 pb-5 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold text-primary-100">
                          {projectDetail?.name ?? selectedSummary.name}
                        </h2>
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium',
                            getStatusBadgeClass(
                              projectDetail?.status ?? selectedSummary.status,
                            ),
                          )}
                        >
                          {formatStatus(
                            projectDetail?.status ?? selectedSummary.status,
                          )}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm text-primary-400">
                        <p>
                          {projectDetail?.path ||
                            selectedSummary.path ||
                            'No path configured'}
                        </p>
                      </div>
                    </div>

                    <Button
                      onClick={() =>
                        setPhaseProject(projectDetail ?? selectedSummary)
                      }
                      className="bg-accent-500 text-white hover:bg-accent-400"
                    >
                      <HugeiconsIcon
                        icon={Add01Icon}
                        size={16}
                        strokeWidth={1.6}
                      />
                      Add Phase
                    </Button>
                  </div>

                  <Collapsible
                    open={projectSpecOpen}
                    onOpenChange={setProjectSpecOpen}
                  >
                    <section className="mt-5 rounded-2xl border border-primary-800 bg-primary-800/35">
                      <CollapsibleTrigger
                        render={
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                          />
                        }
                        className="w-full bg-transparent p-0 hover:bg-transparent"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-primary-100">
                            Project Spec / PRD
                          </p>
                          <p className="text-xs text-primary-400">
                            {projectSpecDraft.trim()
                              ? 'Execution context and product requirements'
                              : 'No spec yet. Add a brief or PRD for this project.'}
                          </p>
                        </div>
                        <HugeiconsIcon
                          icon={projectSpecOpen ? ArrowDown01Icon : ArrowRight01Icon}
                          size={16}
                          strokeWidth={1.7}
                          className="text-primary-400"
                        />
                      </CollapsibleTrigger>
                      <CollapsiblePanel
                        className="pt-0"
                        contentClassName="border-t border-primary-800 px-4 py-4"
                      >
                        <div className="space-y-3">
                          <textarea
                            value={projectSpecDraft}
                            onChange={(event) =>
                              setProjectSpecDraft(event.target.value)
                            }
                            rows={10}
                            className="min-h-[220px] w-full rounded-2xl border border-primary-700 bg-primary-900/90 px-4 py-3 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
                            placeholder="Add the project spec, PRD, or execution brief..."
                          />
                          <div className="flex justify-end">
                            <Button
                              onClick={() => void handleSaveProjectSpec()}
                              disabled={submittingKey === 'project-spec'}
                              className="bg-accent-500 text-white hover:bg-accent-400"
                            >
                              {submittingKey === 'project-spec'
                                ? 'Saving...'
                                : 'Save Spec'}
                            </Button>
                          </div>
                        </div>
                      </CollapsiblePanel>
                    </section>
                  </Collapsible>

                  {detailLoading ? (
                    <div className="py-14 text-center">
                      <div className="mb-3 inline-block h-9 w-9 animate-spin rounded-full border-4 border-accent-500 border-r-transparent" />
                      <p className="text-sm text-primary-400">
                        Loading project detail...
                      </p>
                    </div>
                  ) : projectDetail && projectDetail.phases.length > 0 ? (
                    <div className="mt-5 space-y-4">
                      {projectDetail.phases.map((phase, phaseIndex) => {
                        const expanded = expandedPhases[phase.id] ?? true
                        return (
                          <section
                            key={phase.id}
                            className="overflow-hidden rounded-2xl border border-primary-800 bg-primary-800/35"
                          >
                            <button
                              type="button"
                              onClick={() => togglePhase(phase.id)}
                              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-primary-700 bg-primary-900 text-xs font-semibold text-primary-300">
                                  {phaseIndex + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-primary-100">
                                    {phase.name}
                                  </p>
                                  <p className="text-xs text-primary-400">
                                    {phase.missions.length} mission
                                    {phase.missions.length === 1 ? '' : 's'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setMissionPhase(phase)
                                  }}
                                >
                                  <HugeiconsIcon
                                    icon={Add01Icon}
                                    size={14}
                                    strokeWidth={1.6}
                                  />
                                  Add Mission
                                </Button>
                                <HugeiconsIcon
                                  icon={
                                    expanded
                                      ? ArrowDown01Icon
                                      : ArrowRight01Icon
                                  }
                                  size={16}
                                  strokeWidth={1.7}
                                  className="text-primary-400"
                                />
                              </div>
                            </button>

                            {expanded ? (
                              <div className="space-y-3 border-t border-primary-800 px-4 py-4">
                                {phase.missions.length === 0 ? (
                                  <div className="rounded-xl border border-dashed border-primary-700 bg-primary-900/30 px-4 py-6 text-center text-sm text-primary-400">
                                    No missions in this phase yet.
                                  </div>
                                ) : (
                                  phase.missions.map((mission) => (
                                    <article
                                      key={mission.id}
                                      className="rounded-2xl border border-primary-800 bg-primary-900/60 p-4"
                                    >
                                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                        <div className="space-y-2">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-semibold text-primary-100">
                                              {mission.name}
                                            </p>
                                            <span
                                              className={cn(
                                                'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium',
                                                getStatusBadgeClass(
                                                  mission.status,
                                                ),
                                              )}
                                            >
                                              {formatStatus(mission.status)}
                                            </span>
                                          </div>
                                          <p className="text-xs text-primary-400">
                                            {mission.tasks.length} task
                                            {mission.tasks.length === 1
                                              ? ''
                                              : 's'}
                                          </p>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                          {mission.status !== 'running' &&
                                          mission.status !== 'completed' ? (
                                            <Button
                                              size="sm"
                                              onClick={() =>
                                                void handleStartMission(mission.id)
                                              }
                                              disabled={
                                                submittingKey ===
                                                `start:${mission.id}`
                                              }
                                              className="bg-accent-500 text-white hover:bg-accent-400"
                                            >
                                              <HugeiconsIcon
                                                icon={PlayCircleIcon}
                                                size={16}
                                                strokeWidth={1.6}
                                              />
                                              Start Mission
                                            </Button>
                                          ) : null}
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() =>
                                              setTaskMission(mission)
                                            }
                                          >
                                            <HugeiconsIcon
                                              icon={Task01Icon}
                                              size={14}
                                              strokeWidth={1.6}
                                            />
                                            Add Task
                                          </Button>
                                        </div>
                                      </div>

                                      <div className="mt-4 space-y-2">
                                        {mission.tasks.length === 0 ? (
                                          <div className="rounded-xl border border-dashed border-primary-700 bg-primary-800/35 px-4 py-5 text-center text-sm text-primary-400">
                                            No tasks for this mission yet.
                                          </div>
                                        ) : (
                                          mission.tasks.map((task) => (
                                            <div
                                              key={task.id}
                                              className="flex flex-col gap-2 rounded-xl border border-primary-800 bg-primary-800/45 px-3 py-3 md:flex-row md:items-start md:justify-between"
                                            >
                                              <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                  <span
                                                    className={cn(
                                                      'mt-0.5 size-2.5 shrink-0 rounded-full',
                                                      getTaskDotClass(
                                                        task.status,
                                                      ),
                                                    )}
                                                  />
                                                  <p className="truncate text-sm font-medium text-primary-100">
                                                    {task.name}
                                                  </p>
                                                </div>
                                                {task.description ? (
                                                  <p className="mt-1 whitespace-pre-wrap text-xs text-primary-400">
                                                    {task.description}
                                                  </p>
                                                ) : null}
                                                {task.depends_on.length > 0 ? (
                                                  <p className="mt-2 text-[11px] text-primary-500">
                                                    Depends on:{' '}
                                                    {task.depends_on.join(', ')}
                                                  </p>
                                                ) : null}
                                              </div>
                                              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary-500">
                                                {formatStatus(task.status)}
                                              </span>
                                            </div>
                                          ))
                                        )}
                                      </div>
                                    </article>
                                  ))
                                )}
                              </div>
                            ) : null}
                          </section>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="mt-5 rounded-2xl border border-dashed border-primary-700 bg-primary-800/25 px-6 py-12 text-center">
                      <p className="text-sm text-primary-300">
                        This project has no phases yet.
                      </p>
                      <p className="mt-1 text-sm text-primary-500">
                        Add a phase to start structuring the work.
                      </p>
                    </div>
                  )}

                  <section className="mt-6 border-t border-primary-800 pt-5">
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-primary-100">
                          Checkpoints
                        </h3>
                        <p className="text-sm text-primary-400">
                          Review pending handoffs tied to this project.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => checkpointsQuery.refetch()}
                        disabled={checkpointsQuery.isFetching}
                      >
                        Refresh Checkpoints
                      </Button>
                    </div>

                    {checkpointsQuery.isLoading ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {Array.from({ length: 2 }).map((_, index) => (
                          <div
                            key={index}
                            className="rounded-2xl border border-primary-800 bg-primary-800/30 p-4"
                          >
                            <div className="h-4 w-32 animate-shimmer rounded bg-primary-800/80" />
                            <div className="mt-3 h-5 w-3/4 animate-shimmer rounded bg-primary-800/70" />
                            <div className="mt-2 h-4 w-full animate-shimmer rounded bg-primary-800/60" />
                          </div>
                        ))}
                      </div>
                    ) : projectCheckpoints.length > 0 ? (
                      <div className="space-y-3">
                        {projectCheckpoints.map((checkpoint) => {
                          const commitHashLabel =
                            getCheckpointCommitHashLabel(checkpoint)

                          return (
                            <article
                              key={checkpoint.id}
                              className="rounded-2xl border border-primary-800 bg-primary-800/35 p-4"
                            >
                              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full border border-primary-700 bg-primary-900/70 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-primary-300">
                                      Run {checkpoint.task_run_id}
                                    </span>
                                    <span
                                      className={cn(
                                        'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium',
                                        getCheckpointStatusBadgeClass(
                                          checkpoint.status,
                                        ),
                                      )}
                                    >
                                      {formatCheckpointStatus(
                                        checkpoint.status,
                                      )}
                                    </span>
                                    {checkpoint.agent_name ? (
                                      <span className="rounded-full border border-primary-700 bg-primary-900/70 px-2.5 py-1 text-[11px] text-primary-300">
                                        {checkpoint.agent_name}
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="text-sm font-semibold text-primary-100">
                                    {getCheckpointSummary(checkpoint)}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-3 text-sm text-primary-400">
                                    <span>{getCheckpointDiffStat(checkpoint)}</span>
                                    <span className="inline-flex items-center gap-1">
                                      <HugeiconsIcon
                                        icon={Clock01Icon}
                                        size={14}
                                        strokeWidth={1.7}
                                      />
                                      {formatCheckpointTimestamp(
                                        checkpoint.created_at,
                                      )}
                                    </span>
                                  </div>
                                  {commitHashLabel ? (
                                    <code className="inline-flex items-center rounded-md border border-primary-700 bg-primary-900/80 px-2 py-1 font-mono text-xs text-primary-200 tabular-nums">
                                      {commitHashLabel}
                                    </code>
                                  ) : null}
                                </div>

                                {isCheckpointReviewable(checkpoint) ? (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        projectCheckpointMutation.mutate({
                                          checkpointId: checkpoint.id,
                                          action: 'approve',
                                        })
                                      }
                                      className={getCheckpointActionButtonClass(
                                        'approve',
                                      )}
                                      disabled={
                                        projectCheckpointMutation.isPending
                                      }
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
                                      onClick={() =>
                                        projectCheckpointMutation.mutate({
                                          checkpointId: checkpoint.id,
                                          action: 'reject',
                                        })
                                      }
                                      className={getCheckpointActionButtonClass(
                                        'reject',
                                      )}
                                      disabled={
                                        projectCheckpointMutation.isPending
                                      }
                                    >
                                      <HugeiconsIcon
                                        icon={Cancel01Icon}
                                        size={16}
                                        strokeWidth={1.8}
                                      />
                                      Reject
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-primary-700 bg-primary-800/25 px-6 py-10 text-center">
                        <p className="text-sm text-primary-300">
                          No checkpoints for this project yet.
                        </p>
                        <p className="mt-1 text-sm text-primary-500">
                          Pending reviews will show up here once task runs
                          create them.
                        </p>
                      </div>
                    )}

                    {pendingProjectCheckpoints.length > 0 ? (
                      <p className="mt-3 text-xs uppercase tracking-[0.14em] text-primary-500">
                        {pendingProjectCheckpoints.length} pending checkpoint
                        {pendingProjectCheckpoints.length === 1 ? '' : 's'}
                      </p>
                    ) : null}
                  </section>

                  <section className="mt-6 border-t border-primary-800 pt-5">
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-primary-100">
                          Activity
                        </h3>
                        <p className="text-sm text-primary-400">
                          Recent project events across missions, tasks, and checkpoints.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => activityEventsQuery.refetch()}
                        disabled={activityEventsQuery.isFetching}
                      >
                        <HugeiconsIcon
                          icon={RefreshIcon}
                          size={14}
                          strokeWidth={1.7}
                        />
                        Refresh
                      </Button>
                    </div>

                    {activityEventsQuery.isLoading ? (
                      <div className="space-y-3">
                        {Array.from({ length: 4 }).map((_, index) => (
                          <div
                            key={index}
                            className="rounded-2xl border border-primary-800 bg-primary-800/30 p-4"
                          >
                            <div className="h-4 w-40 animate-shimmer rounded bg-primary-800/80" />
                            <div className="mt-2 h-4 w-24 animate-shimmer rounded bg-primary-800/60" />
                          </div>
                        ))}
                      </div>
                    ) : activityEvents.length > 0 ? (
                      <div className="relative pl-8">
                        <div className="absolute bottom-2 left-[11px] top-2 w-px bg-primary-800" />
                        <div className="space-y-3">
                          {activityEvents.map((event) => {
                            const tone = getActivityEventTone(event.type)

                            return (
                              <article
                                key={event.id}
                                className="relative rounded-2xl border border-primary-800 bg-primary-800/35 px-4 py-3"
                              >
                                <span
                                  className={cn(
                                    'absolute -left-[26px] top-4 block size-3 rounded-full border border-primary-950',
                                    tone.dotClass,
                                  )}
                                />
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <HugeiconsIcon
                                        icon={tone.icon}
                                        size={15}
                                        strokeWidth={1.7}
                                        className={tone.iconClass}
                                      />
                                      <p className="truncate text-sm font-medium text-primary-100">
                                        {getActivityEventDescription(event)}
                                      </p>
                                    </div>
                                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-primary-500">
                                      {event.entity_type.replace(/_/g, ' ')}
                                    </p>
                                  </div>
                                  <span className="shrink-0 text-xs text-primary-400">
                                    {formatRelativeTime(event.timestamp)}
                                  </span>
                                </div>
                              </article>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-primary-700 bg-primary-800/25 px-6 py-10 text-center">
                        <p className="text-sm text-primary-300">
                          No activity for this project yet.
                        </p>
                        <p className="mt-1 text-sm text-primary-500">
                          Timeline entries will appear as missions run, tasks finish, and checkpoints are created.
                        </p>
                      </div>
                    )}
                  </section>
                </>
              ) : (
                <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-primary-700 bg-primary-800/20 px-6 text-center">
                  <div>
                    <p className="text-base font-semibold text-primary-100">
                      Pick a project
                    </p>
                    <p className="mt-2 text-sm text-primary-400">
                      Select a project from the dashboard cards to inspect phases,
                      missions, and tasks.
                    </p>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </section>

      <CreateDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        title="Create Project"
        description="Define a new workspace project with an optional path and project spec."
        submitting={submittingKey === 'project'}
        onSubmit={handleCreateProject}
        submitLabel="Create Project"
      >
        <FieldLabel label="Name">
          <input
            value={projectForm.name}
            onChange={(event) =>
              setProjectForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            className="w-full rounded-xl border border-primary-700 bg-primary-800 px-3 py-2.5 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
            placeholder="OpenClaw Workspace Refresh"
            autoFocus
          />
        </FieldLabel>
        <FieldLabel label="Path">
          <input
            value={projectForm.path}
            onChange={(event) =>
              setProjectForm((current) => ({
                ...current,
                path: event.target.value,
              }))
            }
            className="w-full rounded-xl border border-primary-700 bg-primary-800 px-3 py-2.5 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
            placeholder="/Users/aurora/.openclaw/workspace/clawsuite"
          />
        </FieldLabel>
        <FieldLabel label="Spec">
          <textarea
            value={projectForm.spec}
            onChange={(event) =>
              setProjectForm((current) => ({
                ...current,
                spec: event.target.value,
              }))
            }
            rows={5}
            className="w-full rounded-xl border border-primary-700 bg-primary-800 px-3 py-2.5 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
            placeholder="Optional project brief or execution spec..."
          />
        </FieldLabel>
      </CreateDialog>

      <CreateDialog
        open={phaseProject !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPhaseProject(null)
            setPhaseForm({ name: '' })
          }
        }}
        title="Add Phase"
        description={`Create a new phase in ${phaseProject?.name ?? 'this project'}.`}
        submitting={submittingKey === 'phase'}
        onSubmit={handleCreatePhase}
        submitLabel="Add Phase"
      >
        <FieldLabel label="Phase Name">
          <input
            value={phaseForm.name}
            onChange={(event) => setPhaseForm({ name: event.target.value })}
            className="w-full rounded-xl border border-primary-700 bg-primary-800 px-3 py-2.5 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
            placeholder="Discovery"
            autoFocus
          />
        </FieldLabel>
      </CreateDialog>

      <CreateDialog
        open={missionPhase !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMissionPhase(null)
            setMissionForm({ name: '' })
          }
        }}
        title="Add Mission"
        description={`Create a mission under ${missionPhase?.name ?? 'this phase'}.`}
        submitting={submittingKey === 'mission'}
        onSubmit={handleCreateMission}
        submitLabel="Add Mission"
      >
        <FieldLabel label="Mission Name">
          <input
            value={missionForm.name}
            onChange={(event) => setMissionForm({ name: event.target.value })}
            className="w-full rounded-xl border border-primary-700 bg-primary-800 px-3 py-2.5 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
            placeholder="Scaffold project dashboard"
            autoFocus
          />
        </FieldLabel>
      </CreateDialog>

      <CreateDialog
        open={taskMission !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTaskMission(null)
            setTaskForm({ name: '', description: '', dependsOn: '' })
          }
        }}
        title="Add Task"
        description={`Create a task for ${taskMission?.name ?? 'this mission'}.`}
        submitting={submittingKey === 'task'}
        onSubmit={handleCreateTask}
        submitLabel="Add Task"
      >
        <FieldLabel label="Task Name">
          <input
            value={taskForm.name}
            onChange={(event) =>
              setTaskForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            className="w-full rounded-xl border border-primary-700 bg-primary-800 px-3 py-2.5 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
            placeholder="Implement workspace project routes"
            autoFocus
          />
        </FieldLabel>
        <FieldLabel label="Description">
          <textarea
            value={taskForm.description}
            onChange={(event) =>
              setTaskForm((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            rows={4}
            className="w-full rounded-xl border border-primary-700 bg-primary-800 px-3 py-2.5 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
            placeholder="Optional task detail..."
          />
        </FieldLabel>
        <FieldLabel label="Depends On">
          <input
            value={taskForm.dependsOn}
            onChange={(event) =>
              setTaskForm((current) => ({
                ...current,
                dependsOn: event.target.value,
              }))
            }
            className="w-full rounded-xl border border-primary-700 bg-primary-800 px-3 py-2.5 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
            placeholder="task-1, task-2"
          />
        </FieldLabel>
      </CreateDialog>
    </main>
  )
}
