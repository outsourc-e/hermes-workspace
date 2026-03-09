import { Add01Icon, Folder01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import {
  type CheckpointReviewAction,
  getCheckpointReviewSuccessMessage,
  listWorkspaceCheckpoints,
  matchesCheckpointProject,
  sortCheckpointsNewestFirst,
  submitCheckpointReview,
  type WorkspaceCheckpoint,
} from '@/lib/workspace-checkpoints'
import { DashboardAgentCapacity } from './dashboard-agent-capacity'
import { DashboardKpiBar } from './dashboard-kpi-bar'
import { DashboardProjectCards } from './dashboard-project-cards'
import { DashboardReviewInbox } from './dashboard-review-inbox'
import { CheckpointDetailModal } from './checkpoint-detail-modal'
import {
  CreateProjectDialog,
  WorkspaceEntityDialog,
  WorkspaceFieldLabel,
} from './create-project-dialog'
import { DecomposeDialog } from './decompose-dialog'
import {
  extractActivityEvents,
  extractAgents,
  extractDecomposeResponse,
  extractProject,
  extractProjects,
  extractTasks,
  normalizeMission,
  normalizeStats,
  normalizeTask,
  type DecomposedTaskDraft,
  type MissionFormState,
  type MissionLaunchState,
  type PhaseFormState,
  type ProjectFormState,
  type ReviewRiskFilter,
  type ReviewVerificationFilter,
  type TaskFormState,
  type WorkspaceMission,
  type WorkspacePhase,
  type WorkspaceProject,
} from './lib/workspace-types'
import {
  buildProjectOverview,
  deriveCheckpointRisk,
  getExecutionWaveCount,
  isCheckpointVerified,
} from './lib/workspace-utils'
import { ProjectDetailView } from './project-detail-view'

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

async function loadMissionTasks(missionId: string) {
  const payload = await apiRequest(
    `/api/workspace-tasks?mission_id=${encodeURIComponent(missionId)}`,
  )
  return extractTasks(payload)
}

export function ProjectsScreen() {
  const [projects, setProjects] = useState<Array<WorkspaceProject>>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [projectDetail, setProjectDetail] = useState<WorkspaceProject | null>(null)
  const [projectSpecDraft, setProjectSpecDraft] = useState('')
  const [projectSpecOpen, setProjectSpecOpen] = useState(false)
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({})
  const [listLoading, setListLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [phaseProject, setPhaseProject] = useState<WorkspaceProject | null>(null)
  const [missionPhase, setMissionPhase] = useState<WorkspacePhase | null>(null)
  const [missionLauncher, setMissionLauncher] = useState<MissionLaunchState | null>(null)
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
  const [reviewRiskFilter, setReviewRiskFilter] = useState<ReviewRiskFilter>('all')
  const [batchApproving, setBatchApproving] = useState(false)
  const [expandedDecomposeDescriptions, setExpandedDecomposeDescriptions] =
    useState<Record<string, boolean>>({})
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<WorkspaceCheckpoint | null>(null)
  const [pendingReviewCheckpoint, setPendingReviewCheckpoint] = useState<WorkspaceCheckpoint | null>(
    null,
  )
  const queryClient = useQueryClient()
  const detailSectionRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchProjects() {
      setListLoading(true)
      try {
        const nextProjects = extractProjects(await apiRequest('/api/workspace/projects'))
        if (cancelled) return
        setProjects(nextProjects)
        setSelectedProjectId((current) => {
          if (current && nextProjects.some((project) => project.id === current)) {
            return current
          }
          return nextProjects[0]?.id ?? null
        })
      } catch (error) {
        if (!cancelled) {
          toast(error instanceof Error ? error.message : 'Failed to load projects', {
            type: 'error',
          })
        }
      } finally {
        if (!cancelled) setListLoading(false)
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
        const detail = extractProject(
          await apiRequest(`/api/workspace/projects/${selectedProjectId}`),
        )
        if (!detail) throw new Error('Project detail was empty')

        const taskEntries = await Promise.all(
          detail.phases.flatMap((phase) =>
            phase.missions.map(async (mission) => ({
              missionId: mission.id,
              tasks: await loadMissionTasks(mission.id),
            })),
          ),
        )
        if (cancelled) return

        const taskMap = new Map(taskEntries.map((entry) => [entry.missionId, entry.tasks]))
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
            if (next[phase.id] === undefined) next[phase.id] = true
          }
          return next
        })
      } catch (error) {
        if (!cancelled) {
          toast(
            error instanceof Error ? error.message : 'Failed to load project detail',
            { type: 'error' },
          )
        }
      } finally {
        if (!cancelled) setDetailLoading(false)
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
    queryKey: ['workspace', 'project-snapshots', projects.map((project) => project.id).join(',')],
    enabled: projects.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        projects.map(async (project) => ({
          id: project.id,
          detail: extractProject(await apiRequest(`/api/workspace/projects/${project.id}`)),
        })),
      )
      return entries.filter(
        (entry): entry is { id: string; detail: WorkspaceProject } => Boolean(entry.detail),
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
      const params = new URLSearchParams({ limit: '30' })
      if (selectedProjectId) params.set('project_id', selectedProjectId)
      return extractActivityEvents(
        await apiRequest(`/api/workspace/events?${params.toString()}`),
      )
    },
  })

  const projectCheckpointMutation = useMutation({
    mutationFn: ({
      checkpointId,
      action,
      reviewerNotes,
    }: {
      checkpointId: string
      action: CheckpointReviewAction
      reviewerNotes?: string
    }) => submitCheckpointReview(checkpointId, action, reviewerNotes),
    onSuccess: (_checkpoint, variables) => {
      toast(getCheckpointReviewSuccessMessage(variables.action), { type: 'success' })
      setSelectedCheckpoint(null)
      void queryClient.invalidateQueries({ queryKey: ['workspace'] })
      triggerRefresh()
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to update checkpoint', {
        type: 'error',
      })
    },
  })

  const agents = agentsQuery.data ?? []
  const allCheckpoints = checkpointsQuery.data ?? []
  const activityEvents = activityEventsQuery.data ?? []
  const pendingCheckpoints = useMemo(
    () =>
      sortCheckpointsNewestFirst(allCheckpoints.filter((checkpoint) => checkpoint.status === 'pending')),
    [allCheckpoints],
  )
  const projectSnapshotMap = useMemo(
    () => new Map((projectSnapshotsQuery.data ?? []).map((entry) => [entry.id, entry.detail])),
    [projectSnapshotsQuery.data],
  )
  const projectOverviews = useMemo(
    () =>
      projects.map((project) =>
        buildProjectOverview(project, projectSnapshotMap.get(project.id), pendingCheckpoints, agents),
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
  const reviewInboxItems = useMemo(
    () =>
      pendingCheckpoints.filter((checkpoint) => {
        if (reviewProjectFilter !== 'all' && checkpoint.project_name !== reviewProjectFilter) {
          return false
        }
        const verified = isCheckpointVerified(checkpoint)
        if (reviewVerificationFilter === 'verified' && !verified) return false
        if (reviewVerificationFilter === 'missing' && verified) return false
        const risk = deriveCheckpointRisk(checkpoint)
        if (reviewRiskFilter === 'high' && !risk.high) return false
        return true
      }),
    [pendingCheckpoints, reviewProjectFilter, reviewRiskFilter, reviewVerificationFilter],
  )
  const verifiedReviewItems = useMemo(
    () => reviewInboxItems.filter((checkpoint) => isCheckpointVerified(checkpoint)),
    [reviewInboxItems],
  )
  const projectCheckpoints = useMemo(() => {
    const projectName = projectDetail?.name ?? selectedSummary?.name
    const filtered = allCheckpoints.filter((checkpoint) =>
      matchesCheckpointProject(checkpoint, projectName),
    )
    return filtered.length > 0 ? filtered : allCheckpoints
  }, [allCheckpoints, projectDetail?.name, selectedSummary?.name])
  const pendingProjectCheckpoints = useMemo(
    () => projectCheckpoints.filter((checkpoint) => checkpoint.status === 'pending'),
    [projectCheckpoints],
  )
  const selectedCheckpointProject = useMemo(() => {
    if (!selectedCheckpoint) return null
    return (
      projects.find((project) => project.name === selectedCheckpoint.project_name) ?? null
    )
  }, [projects, selectedCheckpoint])
  const missionLaunchMinutes = useMemo(
    () => missionLauncher?.tasks.reduce((total, task) => total + task.estimated_minutes, 0) ?? 0,
    [missionLauncher],
  )
  const missionLaunchWaves = useMemo(
    () => getExecutionWaveCount(missionLauncher?.tasks ?? []),
    [missionLauncher],
  )

  const decomposeMutation = useMutation({
    mutationFn: async ({ goal, projectId }: { goal: string; projectId?: string }) =>
      extractDecomposeResponse(
        await apiRequest('/api/workspace/decompose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal, project_id: projectId }),
        }),
      ),
    onSuccess: (result) => {
      setMissionLauncher((current) =>
        current
          ? {
              ...current,
              step: 'review',
              tasks: result.tasks,
              rawResponse: result.raw_response,
            }
          : current,
      )
      setExpandedDecomposeDescriptions({})
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to decompose goal', {
        type: 'error',
      })
    },
  })

  const launchMissionMutation = useMutation({
    mutationFn: async ({
      phase,
      tasks,
      startMission,
    }: {
      phase: WorkspacePhase
      tasks: DecomposedTaskDraft[]
      startMission: boolean
    }) => {
      const missionName = tasks[0]?.name ? `${phase.name}: ${tasks[0].name}` : `${phase.name} Mission`
      const missionPayload = normalizeMission(
        await apiRequest('/api/workspace/missions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase_id: phase.id, name: missionName }),
        }),
      )
      const createdTasks = await Promise.all(
        tasks.map(async (task, index) =>
          normalizeTask(
            await apiRequest('/api/workspace-tasks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                mission_id: missionPayload.id,
                name: task.name.trim(),
                description: task.description.trim(),
                sort_order: index,
                depends_on: [],
              }),
            }),
          ),
        ),
      )
      const idByName = new Map(
        createdTasks.map((task, index) => [tasks[index]?.name, task.id] as const),
      )
      await Promise.all(
        createdTasks.map(async (createdTask, index) => {
          const dependencyIds = (tasks[index]?.depends_on ?? [])
            .map((dependency) => idByName.get(dependency))
            .filter((dependencyId): dependencyId is string => typeof dependencyId === 'string')
          if (dependencyIds.length === 0) return
          await apiRequest(`/api/workspace-tasks/${encodeURIComponent(createdTask.id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ depends_on: dependencyIds }),
          })
        }),
      )
      if (startMission) {
        await apiRequest(`/api/workspace/missions/${encodeURIComponent(missionPayload.id)}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
      }
      return { mission: missionPayload }
    },
    onSuccess: (_result, variables) => {
      toast(variables.startMission ? 'Mission launched' : 'Mission saved as draft', {
        type: 'success',
      })
      setMissionLauncher(null)
      setExpandedDecomposeDescriptions({})
      triggerRefresh()
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to launch mission', {
        type: 'error',
      })
    },
  })

  function triggerRefresh() {
    setRefreshToken((value) => value + 1)
    void queryClient.invalidateQueries({ queryKey: ['workspace'] })
  }

  function focusProject(projectId: string) {
    setSelectedProjectId(projectId)
    window.requestAnimationFrame(() => {
      detailSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function focusCheckpointReview(checkpoint: WorkspaceCheckpoint) {
    setSelectedCheckpoint(checkpoint)
    const project = projects.find((item) => item.name === checkpoint.project_name)
    if (project && project.id !== selectedProjectId) {
      setPendingReviewCheckpoint(checkpoint)
      setSelectedProjectId(project.id)
      window.requestAnimationFrame(() => {
        detailSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      return
    }
    setPendingReviewCheckpoint(null)
  }

  useEffect(() => {
    if (!pendingReviewCheckpoint || !projectDetail) return
    if (projectDetail.name !== pendingReviewCheckpoint.project_name) return
    setSelectedCheckpoint(pendingReviewCheckpoint)
    setPendingReviewCheckpoint(null)
  }, [pendingReviewCheckpoint, projectDetail])

  function openMissionLauncher(phase: WorkspacePhase) {
    setMissionLauncher({ phase, goal: '', step: 'input', tasks: [] })
    setExpandedDecomposeDescriptions({})
  }

  function resetMissionLauncher() {
    setMissionLauncher(null)
    setExpandedDecomposeDescriptions({})
    decomposeMutation.reset()
    launchMissionMutation.reset()
  }

  function handleTaskDraftChange(taskId: string, updates: Partial<DecomposedTaskDraft>) {
    setMissionLauncher((current) => {
      if (!current) return current
      const previousTask = current.tasks.find((task) => task.id === taskId)
      const previousName = previousTask?.name
      const nextName = updates.name
      return {
        ...current,
        tasks: current.tasks.map((task) => {
          if (task.id === taskId) return { ...task, ...updates }
          if (
            previousName &&
            nextName &&
            previousName !== nextName &&
            task.depends_on.includes(previousName)
          ) {
            return {
              ...task,
              depends_on: task.depends_on.map((dependency) =>
                dependency === previousName ? nextName : dependency,
              ),
            }
          }
          return task
        }),
      }
    })
  }

  function handleDecomposeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!missionLauncher?.goal.trim()) {
      toast('Goal is required', { type: 'warning' })
      return
    }
    decomposeMutation.mutate({
      goal: missionLauncher.goal.trim(),
      projectId: projectDetail?.id ?? selectedSummary?.id,
    })
  }

  function handleLaunchMission(startMission: boolean) {
    if (!missionLauncher) return
    const cleanedTasks = missionLauncher.tasks.map((task) => ({
      ...task,
      name: task.name.trim(),
      description: task.description.trim(),
      depends_on: task.depends_on.filter(Boolean),
    }))
    if (cleanedTasks.length === 0) {
      toast('Add at least one task before launching', { type: 'warning' })
      return
    }
    if (cleanedTasks.some((task) => task.name.length === 0)) {
      toast('Each task needs a name', { type: 'warning' })
      return
    }
    if (new Set(cleanedTasks.map((task) => task.name)).size !== cleanedTasks.length) {
      toast('Task names must be unique so dependencies can be mapped', { type: 'warning' })
      return
    }
    setMissionLauncher((current) => (current ? { ...current, tasks: cleanedTasks } : current))
    launchMissionMutation.mutate({
      phase: missionLauncher.phase,
      tasks: cleanedTasks,
      startMission,
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
        await submitCheckpointReview(checkpoint.id, 'approve-and-commit')
      }
      toast(
        `Approved ${verifiedReviewItems.length} verified checkpoint${verifiedReviewItems.length === 1 ? '' : 's'}`,
        { type: 'success' },
      )
      triggerRefresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to approve checkpoints', {
        type: 'error',
      })
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
      toast(error instanceof Error ? error.message : 'Failed to create project', {
        type: 'error',
      })
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
      toast(error instanceof Error ? error.message : 'Failed to add phase', { type: 'error' })
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
        body: JSON.stringify({ phase_id: missionPhase.id, name: missionForm.name.trim() }),
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
      toast(error instanceof Error ? error.message : 'Failed to add task', { type: 'error' })
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
      toast(error instanceof Error ? error.message : 'Failed to start mission', {
        type: 'error',
      })
    } finally {
      setSubmittingKey(null)
    }
  }

  async function handleSaveProjectSpec() {
    const activeProject = projectDetail ?? selectedSummary
    if (!activeProject) return
    setSubmittingKey('project-spec')
    try {
      const updatedProject = extractProject(
        await apiRequest(`/api/workspace/projects/${encodeURIComponent(activeProject.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spec: projectSpecDraft.trim() ? projectSpecDraft : null }),
        }),
      )
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
      toast(error instanceof Error ? error.message : 'Failed to save project spec', {
        type: 'error',
      })
    } finally {
      setSubmittingKey(null)
    }
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
              <h1 className="text-xl font-semibold text-primary-100">Projects</h1>
              <p className="text-sm text-primary-400">
                Mission control for workspace execution, review handoffs, and agent load.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={triggerRefresh} disabled={listLoading || detailLoading}>
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
            <p className="text-sm text-primary-400">Loading workspace projects...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-primary-700 bg-primary-900/60 px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-3xl border border-primary-700 bg-primary-800/80 text-primary-300">
              <HugeiconsIcon icon={Folder01Icon} size={26} strokeWidth={1.5} />
            </div>
            <h2 className="text-lg font-semibold text-primary-100">No projects yet</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-primary-400">
              Create your first project to organize phases, missions, and task execution for an
              agent workflow.
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
            <DashboardKpiBar
              stats={statsQuery.data}
              projects={projects}
              agents={agents}
              pendingCheckpointCount={pendingCheckpoints.length}
            />

            <DashboardProjectCards
              projectOverviews={projectOverviews}
              selectedProjectId={selectedProjectId}
              onSelect={focusProject}
              onResume={(missionId) => void handleStartMission(missionId)}
              submittingKey={submittingKey}
            />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,1fr)]">
              <DashboardReviewInbox
                checkpoints={reviewInboxItems}
                projects={projects}
                selectedProjectName={selectedSummary?.name}
                projectOptions={reviewProjectOptions}
                projectFilter={reviewProjectFilter}
                verificationFilter={reviewVerificationFilter}
                riskFilter={reviewRiskFilter}
                loading={checkpointsQuery.isLoading}
                batchApproving={batchApproving}
                verifiedCount={verifiedReviewItems.length}
                actionPending={projectCheckpointMutation.isPending}
                onProjectFilterChange={setReviewProjectFilter}
                onVerificationFilterChange={setReviewVerificationFilter}
                onRiskFilterChange={setReviewRiskFilter}
                onApproveVerified={() => void handleApproveVerified()}
                onApprove={(checkpointId) =>
                  projectCheckpointMutation.mutate({
                    checkpointId,
                    action: 'approve-and-commit',
                  })
                }
                onReview={focusCheckpointReview}
              />

              <DashboardAgentCapacity
                agents={agents}
                stats={statsQuery.data}
                loading={agentsQuery.isLoading}
              />
            </div>

            <section
              ref={detailSectionRef}
              className="rounded-3xl border border-primary-800 bg-primary-900/75 p-4 md:p-5"
            >
              <ProjectDetailView
                selectedSummary={selectedSummary}
                projectDetail={projectDetail}
                detailLoading={detailLoading}
                projectSpecDraft={projectSpecDraft}
                projectSpecOpen={projectSpecOpen}
                expandedPhases={expandedPhases}
                checkpoints={projectCheckpoints}
                pendingCheckpointCount={pendingProjectCheckpoints.length}
                checkpointsLoading={checkpointsQuery.isLoading}
                checkpointsFetching={checkpointsQuery.isFetching}
                checkpointActionPending={projectCheckpointMutation.isPending}
                activityEvents={activityEvents}
                activityLoading={activityEventsQuery.isLoading}
                activityFetching={activityEventsQuery.isFetching}
                submittingKey={submittingKey}
                onSpecDraftChange={setProjectSpecDraft}
                onSpecOpenChange={setProjectSpecOpen}
                onSaveSpec={() => void handleSaveProjectSpec()}
                onAddPhase={setPhaseProject}
                onTogglePhase={(phaseId) =>
                  setExpandedPhases((current) => ({ ...current, [phaseId]: !current[phaseId] }))
                }
                onAddMission={setMissionPhase}
                onOpenMissionLauncher={openMissionLauncher}
                onStartMission={(missionId) => void handleStartMission(missionId)}
                onAddTask={setTaskMission}
                onRefreshCheckpoints={() => void checkpointsQuery.refetch()}
                onCheckpointReview={focusCheckpointReview}
                onCheckpointApprove={(checkpointId) =>
                  projectCheckpointMutation.mutate({
                    checkpointId,
                    action: 'approve-and-commit',
                  })
                }
                onCheckpointReject={(checkpointId) =>
                  projectCheckpointMutation.mutate({ checkpointId, action: 'reject' })
                }
                onRefreshActivity={() => void activityEventsQuery.refetch()}
              />
            </section>
          </>
        )}
      </section>

      {selectedCheckpoint ? (
        <CheckpointDetailModal
          checkpoint={selectedCheckpoint}
          project={selectedCheckpointProject}
          projectDetail={projectDetail}
          open={selectedCheckpoint !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedCheckpoint(null)
          }}
          onApprove={(checkpointId, notes, mode) =>
            projectCheckpointMutation.mutateAsync({
              checkpointId,
              action: mode ?? 'approve-and-commit',
              reviewerNotes: notes,
            }).then(() => undefined)
          }
          onRevise={(checkpointId, notes) =>
            projectCheckpointMutation.mutateAsync({
              checkpointId,
              action: 'revise',
              reviewerNotes: notes,
            }).then(() => undefined)
          }
          onReject={(checkpointId, notes) =>
            projectCheckpointMutation.mutateAsync({
              checkpointId,
              action: 'reject',
              reviewerNotes: notes,
            }).then(() => undefined)
          }
        />
      ) : null}

      <CreateProjectDialog
        open={projectDialogOpen}
        submitting={submittingKey === 'project'}
        form={projectForm}
        onOpenChange={setProjectDialogOpen}
        onFormChange={setProjectForm}
        onSubmit={handleCreateProject}
      />

      <WorkspaceEntityDialog
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
        <WorkspaceFieldLabel label="Phase Name">
          <input
            value={phaseForm.name}
            onChange={(event) => setPhaseForm({ name: event.target.value })}
            className="w-full rounded-xl border border-primary-700 bg-primary-800 px-3 py-2.5 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
            placeholder="Discovery"
            autoFocus
          />
        </WorkspaceFieldLabel>
      </WorkspaceEntityDialog>

      <WorkspaceEntityDialog
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
        <WorkspaceFieldLabel label="Mission Name">
          <input
            value={missionForm.name}
            onChange={(event) => setMissionForm({ name: event.target.value })}
            className="w-full rounded-xl border border-primary-700 bg-primary-800 px-3 py-2.5 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
            placeholder="Scaffold project dashboard"
            autoFocus
          />
        </WorkspaceFieldLabel>
      </WorkspaceEntityDialog>

      <WorkspaceEntityDialog
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
        <WorkspaceFieldLabel label="Task Name">
          <input
            value={taskForm.name}
            onChange={(event) => setTaskForm((current) => ({ ...current, name: event.target.value }))}
            className="w-full rounded-xl border border-primary-700 bg-primary-800 px-3 py-2.5 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
            placeholder="Implement workspace project routes"
            autoFocus
          />
        </WorkspaceFieldLabel>
        <WorkspaceFieldLabel label="Description">
          <textarea
            value={taskForm.description}
            onChange={(event) =>
              setTaskForm((current) => ({ ...current, description: event.target.value }))
            }
            rows={4}
            className="w-full rounded-xl border border-primary-700 bg-primary-800 px-3 py-2.5 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
            placeholder="Optional task detail..."
          />
        </WorkspaceFieldLabel>
        <WorkspaceFieldLabel label="Depends On">
          <input
            value={taskForm.dependsOn}
            onChange={(event) =>
              setTaskForm((current) => ({ ...current, dependsOn: event.target.value }))
            }
            className="w-full rounded-xl border border-primary-700 bg-primary-800 px-3 py-2.5 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
            placeholder="task-1, task-2"
          />
        </WorkspaceFieldLabel>
      </WorkspaceEntityDialog>

      <DecomposeDialog
        open={missionLauncher !== null}
        missionLauncher={missionLauncher}
        project={projectDetail ?? selectedSummary}
        path={projectDetail?.path ?? selectedSummary?.path}
        expandedDescriptions={expandedDecomposeDescriptions}
        missionLaunchMinutes={missionLaunchMinutes}
        missionLaunchWaves={missionLaunchWaves}
        decomposePending={decomposeMutation.isPending}
        launchPending={launchMissionMutation.isPending}
        onOpenChange={(open) => {
          if (!open) resetMissionLauncher()
        }}
        onGoalChange={(goal) =>
          setMissionLauncher((current) => (current ? { ...current, goal } : current))
        }
        onTaskDraftChange={handleTaskDraftChange}
        onDescriptionToggle={(taskId, open) =>
          setExpandedDecomposeDescriptions((current) => ({ ...current, [taskId]: open }))
        }
        onBack={() =>
          setMissionLauncher((current) => (current ? { ...current, step: 'input' } : current))
        }
        onDecomposeSubmit={handleDecomposeSubmit}
        onLaunch={handleLaunchMission}
      />
    </main>
  )
}
