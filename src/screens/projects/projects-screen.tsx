import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Folder01Icon,
  PlayCircleIcon,
  Task01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  formatCheckpointStatus,
  formatCheckpointTimestamp,
  getCheckpointActionButtonClass,
  getCheckpointCommitHashLabel,
  getCheckpointDiffStat,
  getCheckpointStatusBadgeClass,
  getCheckpointSummary,
  isCheckpointReviewable,
  listWorkspaceCheckpoints,
  matchesCheckpointProject,
  submitCheckpointReview,
  type WorkspaceCheckpoint,
} from '@/lib/workspace-checkpoints'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type WorkspaceStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed'
  | string

type WorkspaceTask = {
  id: string
  mission_id?: string
  name: string
  description?: string
  status: WorkspaceStatus
  sort_order?: number
  depends_on: string[]
}

type WorkspaceMission = {
  id: string
  phase_id?: string
  name: string
  status: WorkspaceStatus
  tasks: Array<WorkspaceTask>
}

type WorkspacePhase = {
  id: string
  project_id?: string
  name: string
  sort_order?: number
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
    depends_on: asArray(record?.depends_on).map((item) => String(item)),
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
      asNumber(record?.task_count) ??
      getTaskCount({ phases } as WorkspaceProject),
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
  if (Array.isArray(payload))
    return payload[0] ? normalizeProject(payload[0]) : null

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
  if (status === 'running') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  }
  if (status === 'completed') {
    return 'border-green-500/30 bg-green-500/10 text-green-300'
  }
  if (status === 'failed') {
    return 'border-red-500/30 bg-red-500/10 text-red-300'
  }
  return 'border-primary-700 bg-primary-800/70 text-primary-300'
}

function getTaskDotClass(status: WorkspaceStatus): string {
  if (status === 'ready') return 'bg-blue-400'
  if (status === 'running' || status === 'in_progress') return 'bg-emerald-400'
  if (status === 'completed' || status === 'done') return 'bg-green-400'
  if (status === 'failed') return 'bg-red-400'
  return 'bg-primary-500'
}

function formatStatus(status: WorkspaceStatus): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
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

export function ProjectsScreen() {
  const [projects, setProjects] = useState<Array<WorkspaceProject>>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  )
  const [projectDetail, setProjectDetail] = useState<WorkspaceProject | null>(
    null,
  )
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
  const queryClient = useQueryClient()

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

  // Poll for live updates when any mission is running
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
  const projectCheckpointsQuery = useQuery({
    queryKey: ['workspace', 'checkpoints', 'projects'],
    queryFn: () => listWorkspaceCheckpoints(),
    enabled: Boolean(selectedSummary),
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
        queryKey: ['workspace', 'checkpoints'],
      })
    },
    onError: (error) => {
      toast(
        error instanceof Error ? error.message : 'Failed to update checkpoint',
        { type: 'error' },
      )
    },
  })
  const projectCheckpoints = useMemo(() => {
    const items = projectCheckpointsQuery.data ?? []
    const projectName = projectDetail?.name ?? selectedSummary?.name
    const filtered = items.filter((checkpoint) =>
      matchesCheckpointProject(checkpoint, projectName),
    )

    if (filtered.length > 0) return filtered
    return items
  }, [projectCheckpointsQuery.data, projectDetail?.name, selectedSummary?.name])
  const pendingProjectCheckpoints = useMemo(
    () =>
      projectCheckpoints.filter((checkpoint) =>
        isCheckpointReviewable(checkpoint),
      ),
    [projectCheckpoints],
  )

  function triggerRefresh() {
    setRefreshToken((value) => value + 1)
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

  function togglePhase(phaseId: string) {
    setExpandedPhases((current) => ({
      ...current,
      [phaseId]: !current[phaseId],
    }))
  }

  return (
    <main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-100 md:px-6 md:pt-8">
      <section className="mx-auto w-full max-w-[1400px]">
        <header className="mb-6 flex flex-col gap-4 rounded-2xl border border-primary-800 bg-primary-900/85 px-4 py-4 shadow-sm md:flex-row md:items-center md:justify-between md:px-5">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-accent-500/30 bg-accent-500/10 text-accent-300">
              <HugeiconsIcon icon={Folder01Icon} size={22} strokeWidth={1.6} />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-primary-100 md:text-xl">
                Projects
              </h1>
              <p className="text-sm text-primary-400">
                Track specs, phases, missions, and execution work across your
                workspace.
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
          <div className="rounded-2xl border border-primary-800 bg-primary-900/70 px-6 py-16 text-center">
            <div className="mb-4 inline-block h-10 w-10 animate-spin rounded-full border-4 border-accent-500 border-r-transparent" />
            <p className="text-sm text-primary-400">
              Loading workspace projects...
            </p>
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-primary-700 bg-primary-900/60 px-6 py-16 text-center">
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
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
            <div className="space-y-3">
              {projects.map((project) => {
                const active = project.id === selectedProjectId
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => setSelectedProjectId(project.id)}
                    className={cn(
                      'w-full rounded-2xl border p-4 text-left transition-colors',
                      active
                        ? 'border-accent-500/60 bg-primary-900 shadow-[0_0_0_1px_rgba(251,146,60,0.16)]'
                        : 'border-primary-800 bg-primary-900/70 hover:border-primary-700 hover:bg-primary-900',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-primary-100">
                          {project.name}
                        </p>
                        <p className="mt-1 truncate text-xs text-primary-400">
                          {project.path || 'No path configured'}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium',
                          getStatusBadgeClass(project.status),
                        )}
                      >
                        {formatStatus(project.status)}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl border border-primary-800 bg-primary-800/80 px-2 py-2">
                        <p className="text-lg font-semibold text-primary-100">
                          {project.phase_count}
                        </p>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-primary-500">
                          Phases
                        </p>
                      </div>
                      <div className="rounded-xl border border-primary-800 bg-primary-800/80 px-2 py-2">
                        <p className="text-lg font-semibold text-primary-100">
                          {project.mission_count}
                        </p>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-primary-500">
                          Missions
                        </p>
                      </div>
                      <div className="rounded-xl border border-primary-800 bg-primary-800/80 px-2 py-2">
                        <p className="text-lg font-semibold text-primary-100">
                          {project.task_count}
                        </p>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-primary-500">
                          Tasks
                        </p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="rounded-2xl border border-primary-800 bg-primary-900/75 p-4 md:p-5">
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
                        {(projectDetail?.spec || selectedSummary.spec) && (
                          <p className="max-w-3xl whitespace-pre-wrap text-primary-300">
                            {projectDetail?.spec || selectedSummary.spec}
                          </p>
                        )}
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
                                                handleStartMission(mission.id)
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
                        onClick={() => projectCheckpointsQuery.refetch()}
                        disabled={projectCheckpointsQuery.isFetching}
                      >
                        Refresh Checkpoints
                      </Button>
                    </div>

                    {projectCheckpointsQuery.isLoading ? (
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
                        {projectCheckpoints.map(
                          (checkpoint: WorkspaceCheckpoint) => {
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
                                  </div>
                                  <p className="text-sm font-semibold text-primary-100">
                                    {getCheckpointSummary(checkpoint)}
                                  </p>
                                  <p className="text-sm text-primary-400">
                                    {getCheckpointDiffStat(checkpoint)} ·{' '}
                                    {formatCheckpointTimestamp(
                                      checkpoint.created_at,
                                    )}
                                  </p>
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
                          },
                        )}
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
                </>
              ) : (
                <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-primary-700 bg-primary-800/20 px-6 text-center">
                  <div>
                    <p className="text-base font-semibold text-primary-100">
                      Pick a project
                    </p>
                    <p className="mt-2 text-sm text-primary-400">
                      Select a project from the list to inspect phases,
                      missions, and tasks.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
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
