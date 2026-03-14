import { useNavigate } from '@tanstack/react-router'
import {
  Add01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Folder01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import {
  type CheckpointReviewAction,
  extractCheckpoints,
  matchesCheckpointProject,
  sortCheckpointsNewestFirst,
  submitCheckpointReview,
  type WorkspaceCheckpointReviewResult,
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
  normalizeStats,
  type ProjectFormState,
  type DecomposedTaskDraft,
  type MissionFormState,
  type MissionLaunchState,
  type PhaseFormState,
  type ReviewRiskFilter,
  type ReviewVerificationFilter,
  type TaskFormState,
  type WorkspaceMission,
  type WorkspacePhase,
  type WorkspaceProject,
} from './lib/workspace-types'
import {
  buildProjectOverview,
  calculateExecutionWaves,
  deriveCheckpointRisk,
  findPlanReviewMission,
  formatMinutes,
  getAgentBadgeLabel,
  isCheckpointVerified,
} from './lib/workspace-utils'
import { ProjectDetailView } from './project-detail-view'
import { cn } from '@/lib/utils'

type ProjectsScreenProps = {
  replanSearch?: {
    goal?: string
    checkpointId?: string
    phaseId?: string
    phaseName?: string
    project?: string
    projectId?: string
    missionId?: string
  }
  routePath?: '/projects' | '/workspace'
  onProjectContextChange?: (context: {
    projectId: string | null
    projectName: string | null
  }) => void
}

type ProjectMissionComposerState = {
  project: WorkspaceProject
  goal: string
  tasks: DecomposedTaskDraft[]
  rawResponse?: string
  error: string | null
}

type CreateProjectProgressStage =
  | 'creating-project'
  | 'decomposing-tasks'
  | 'starting-mission'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function formatApprovalToast(result: WorkspaceCheckpointReviewResult, action: CheckpointReviewAction): string {
  const branch = result.target_branch?.trim()
  const commitHash = result.commit_hash?.trim()
  const commitLabel = commitHash ? ` (${commitHash.slice(0, 7)})` : ''

  if (action === 'approve-and-merge') {
    return `Checkpoint approved — changes merged to ${branch ?? 'main'}${commitLabel}`
  }
  if (action === 'approve-and-pr') {
    return `Checkpoint approved — PR opened from ${branch ?? 'task branch'}${commitLabel}`
  }
  if (action === 'approve' || action === 'approve-and-commit') {
    return `Checkpoint approved — changes committed on ${branch ?? 'task branch'}${commitLabel}`
  }
  if (action === 'revise') return 'Checkpoint sent back for revision'
  return 'Checkpoint rejected'
}

function isMissionNowComplete(
  checkpoints: WorkspaceCheckpoint[],
  updatedCheckpoint: WorkspaceCheckpoint,
): boolean {
  if (!updatedCheckpoint.mission_name || !updatedCheckpoint.project_name) return false

  const missionCheckpoints = checkpoints.filter(
    (checkpoint) =>
      checkpoint.project_name === updatedCheckpoint.project_name &&
      checkpoint.mission_name === updatedCheckpoint.mission_name,
  )

  return missionCheckpoints.length > 0 && missionCheckpoints.every((checkpoint) => checkpoint.status !== 'pending')
}

function extractEntityRecord(
  payload: unknown,
  entityKey: string,
): Record<string, unknown> | null {
  const record = asRecord(payload)
  const candidates = [record?.[entityKey], record?.data, payload]

  for (const candidate of candidates) {
    const candidateRecord = asRecord(candidate)
    if (candidateRecord) return candidateRecord
  }

  return null
}

function extractEntityId(payload: unknown, entityKey: string): string | null {
  const record = extractEntityRecord(payload, entityKey)
  if (!record) return null

  return asString(record.id) ?? asString(record[`${entityKey}_id`])
}

function getMissionAgentBadgeClass(agentType: string | null): string {
  if (agentType === 'aurora-coder') {
    return 'border-sky-200 bg-sky-50 text-sky-700'
  }
  if (agentType === 'aurora-daemon') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }
  if (agentType === 'aurora-qa') {
    return 'border-amber-200 bg-amber-50 text-amber-700'
  }
  if (agentType === 'aurora-planner') {
    return 'border-rose-200 bg-rose-50 text-rose-700'
  }
  return 'border-primary-200 bg-primary-50 text-primary-600'
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

async function loadMissionTasks(missionId: string) {
  const payload = await apiRequest(
    `/api/workspace-tasks?mission_id=${encodeURIComponent(missionId)}`,
  )
  return extractTasks(payload)
}

export function ProjectsScreen({
  replanSearch,
  routePath = '/projects',
  onProjectContextChange,
}: ProjectsScreenProps) {
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
  const [detailLoading, setDetailLoading] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const [phaseProject, setPhaseProject] = useState<WorkspaceProject | null>(
    null,
  )
  const [missionPhase, setMissionPhase] = useState<WorkspacePhase | null>(null)
  const [missionLauncher, setMissionLauncher] =
    useState<MissionLaunchState | null>(null)
  const [taskMission, setTaskMission] = useState<WorkspaceMission | null>(null)
  const [submittingKey, setSubmittingKey] = useState<string | null>(null)
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
  const [expandedDecomposeDescriptions, setExpandedDecomposeDescriptions] =
    useState<Record<string, boolean>>({})
  const [selectedCheckpoint, setSelectedCheckpoint] =
    useState<WorkspaceCheckpoint | null>(null)
  const [pendingReviewCheckpoint, setPendingReviewCheckpoint] =
    useState<WorkspaceCheckpoint | null>(null)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [newProjectForm, setNewProjectForm] = useState<ProjectFormState>({
    name: '',
    path: '',
    spec: '',
    autoDecompose: true,
  })
  const [createProjectError, setCreateProjectError] = useState<string | null>(null)
  const [createProjectProgressStage, setCreateProjectProgressStage] =
    useState<CreateProjectProgressStage | null>(null)
  const [createProjectLongRunning, setCreateProjectLongRunning] = useState(false)
  const [projectMissionComposer, setProjectMissionComposer] =
    useState<ProjectMissionComposerState | null>(null)
  const [missionStartPending, setMissionStartPending] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  useEffect(() => {
    if (createProjectProgressStage !== 'decomposing-tasks') {
      setCreateProjectLongRunning(false)
      return
    }

    const timeout = window.setTimeout(() => {
      setCreateProjectLongRunning(true)
    }, 10_000)

    return () => window.clearTimeout(timeout)
  }, [createProjectProgressStage])

  const projectsQuery = useQuery({
    queryKey: ['workspace', 'projects', refreshToken],
    queryFn: async () =>
      extractProjects(
        await apiRequest('/api/workspace/projects'),
      ),
    placeholderData: keepPreviousData,
  })
  const projects = projectsQuery.data ?? []
  const visibleProjects = useMemo(
    () =>
      showArchived
        ? projects
        : projects.filter((project) => project.status !== 'archived'),
    [projects, showArchived],
  )
  const listLoading = projectsQuery.isPending && projects.length === 0

  useEffect(() => {
    setSelectedProjectId((current) => {
      if (current && projects.some((project) => project.id === current)) {
        return current
      }

      const requestedProjectId =
        replanSearch?.projectId ??
        projects.find((project) => project.id === replanSearch?.project)?.id ??
        replanSearch?.project

      if (
        requestedProjectId &&
        projects.some((project) => project.id === requestedProjectId)
      ) {
        return requestedProjectId
      }

      return null
    })
  }, [projects, replanSearch?.project, replanSearch?.projectId])

  useEffect(() => {
    if (!projectsQuery.isError) return
    toast(
      projectsQuery.error instanceof Error
        ? projectsQuery.error.message
        : 'Failed to load projects',
      { type: 'error' },
    )
  }, [projectsQuery.error, projectsQuery.isError])

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
            if (next[phase.id] === undefined) next[phase.id] = true
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
    onProjectContextChange?.({
      projectId: selectedProjectId,
      projectName: projectDetail?.name ?? selectedSummary?.name ?? null,
    })
  }, [
    onProjectContextChange,
    projectDetail?.name,
    selectedProjectId,
    selectedSummary?.name,
  ])

  useEffect(() => {
    const spec = projectDetail?.spec ?? selectedSummary?.spec ?? ''
    setProjectSpecDraft(spec)
    setProjectSpecOpen(false)
  }, [
    projectDetail?.id,
    projectDetail?.spec,
    selectedSummary?.id,
    selectedSummary?.spec,
  ])

  const statsQuery = useQuery({
    queryKey: ['workspace', 'stats'],
    queryFn: async () =>
      normalizeStats(await apiRequest('/api/workspace/stats')),
  })

  const agentsQuery = useQuery({
    queryKey: ['workspace', 'agents'],
    queryFn: async () =>
      extractAgents(
        await apiRequest('/api/workspace/agents'),
      ),
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
        projects.map(async (project) => ({
          id: project.id,
          detail: extractProject(
            await apiRequest(`/api/workspace/projects/${project.id}`),
          ),
        })),
      )
      return entries.filter(
        (entry): entry is { id: string; detail: WorkspaceProject } =>
          Boolean(entry.detail),
      )
    },
  })

  const checkpointsQuery = useQuery({
    queryKey: ['workspace', 'checkpoints', 'pending'],
    queryFn: async () =>
      extractCheckpoints(
        await apiRequest(
          '/api/workspace/checkpoints?status=pending',
        ),
      ),
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
    onSuccess: (result, variables) => {
      queryClient.setQueriesData<Array<WorkspaceCheckpoint> | undefined>(
        { queryKey: ['workspace', 'checkpoints'] },
        (current) =>
          current?.map((checkpoint) =>
            checkpoint.id === result.checkpoint.id ? result.checkpoint : checkpoint,
          ),
      )

      toast(formatApprovalToast(result, variables.action), {
        type: 'success',
      })
      const nextCheckpoints = (queryClient.getQueryData(['workspace', 'checkpoints']) ??
        allCheckpoints) as Array<WorkspaceCheckpoint>
      if (
        (variables.action === 'approve' ||
          variables.action === 'approve-and-commit' ||
          variables.action === 'approve-and-merge') &&
        isMissionNowComplete(nextCheckpoints, result.checkpoint)
      ) {
        toast('Mission complete — all tasks approved', { type: 'success' })
      }
      setSelectedCheckpoint(null)
      void queryClient.invalidateQueries({ queryKey: ['workspace'] })
      triggerRefresh()
    },
    onError: (error) => {
      toast(
        error instanceof Error ? error.message : 'Failed to update checkpoint',
        {
          type: 'error',
        },
      )
    },
  })

  const agents = agentsQuery.data ?? []
  const allCheckpoints = checkpointsQuery.data ?? []
  const activityEvents = activityEventsQuery.data ?? []
  const pendingCheckpoints = useMemo(
    () => sortCheckpointsNewestFirst(allCheckpoints),
    [allCheckpoints],
  )
  const projectSnapshotMap = useMemo(
    () =>
      new Map(
        (projectSnapshotsQuery.data ?? []).map((entry) => [
          entry.id,
          entry.detail,
        ]),
      ),
    [projectSnapshotsQuery.data],
  )
  const projectOverviews = useMemo(
    () =>
      visibleProjects.map((project) =>
        buildProjectOverview(
          project,
          projectSnapshotMap.get(project.id),
          pendingCheckpoints,
          agents,
        ),
      ),
    [agents, pendingCheckpoints, projectSnapshotMap, visibleProjects],
  )
  const planReviewMissionIdsByProjectId = useMemo(
    () =>
      visibleProjects.reduce<Record<string, string>>((accumulator, project) => {
        const mission = findPlanReviewMission(
          projectSnapshotMap.get(project.id) ?? (projectDetail?.id === project.id ? projectDetail : project),
        )
        if (mission) {
          accumulator[project.id] = mission.id
        }
        return accumulator
      }, {}),
    [projectDetail, projectSnapshotMap, visibleProjects],
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
      }),
    [
      pendingCheckpoints,
      reviewProjectFilter,
      reviewRiskFilter,
      reviewVerificationFilter,
    ],
  )
  const verifiedReviewItems = useMemo(
    () =>
      reviewInboxItems.filter((checkpoint) => isCheckpointVerified(checkpoint)),
    [reviewInboxItems],
  )
  const projectCheckpoints = useMemo(() => {
    const projectName = projectDetail?.name ?? selectedSummary?.name
    if (!projectName) return allCheckpoints
    return allCheckpoints.filter((checkpoint) =>
      matchesCheckpointProject(checkpoint, projectName),
    )
  }, [allCheckpoints, projectDetail?.name, selectedSummary?.name])
  const pendingProjectCheckpoints = useMemo(
    () =>
      projectCheckpoints.filter(
        (checkpoint) => checkpoint.status === 'pending',
      ),
    [projectCheckpoints],
  )
  const selectedCheckpointProject = useMemo(() => {
    if (!selectedCheckpoint) return null
    return (
      projects.find(
        (project) => project.name === selectedCheckpoint.project_name,
      ) ?? null
    )
  }, [projects, selectedCheckpoint])
  const missionLaunchMinutes = useMemo(
    () =>
      missionLauncher?.tasks.reduce(
        (total, task) => total + task.estimated_minutes,
        0,
      ) ?? 0,
    [missionLauncher],
  )
  const missionLaunchWaves = useMemo(
    () => calculateExecutionWaves(missionLauncher?.tasks ?? []).length,
    [missionLauncher],
  )

  const decomposeMutation = useMutation({
    mutationFn: async ({
      goal,
      projectId,
    }: {
      goal: string
      projectId?: string
    }) =>
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
      toast(
        error instanceof Error ? error.message : 'Failed to decompose goal',
        {
          type: 'error',
        },
      )
    },
  })

  const projectMissionDecomposeMutation = useMutation({
    mutationFn: async ({
      goal,
      projectId,
    }: {
      goal: string
      projectId: string
    }) =>
      extractDecomposeResponse(
        await apiRequest('/api/workspace/decompose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal, project_id: projectId }),
        }),
      ),
    onSuccess: (result) => {
      setProjectMissionComposer((current) =>
        current
          ? {
              ...current,
              tasks: result.tasks,
              rawResponse: result.raw_response,
              error: result.tasks.length === 0 ? 'No tasks returned.' : null,
            }
          : current,
      )
    },
    onError: (error) => {
      setProjectMissionComposer((current) =>
        current
          ? {
              ...current,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to decompose goal',
            }
          : current,
      )
    },
  })

  const archiveProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      setSubmittingKey(`archive:${projectId}`)
      return apiRequest(`/api/workspace/projects/${encodeURIComponent(projectId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'archived' }),
      })
    },
    onSuccess: async () => {
      toast('Project archived', { type: 'success' })
      clearSelectedProject()
      await queryClient.invalidateQueries({ queryKey: ['workspace', 'projects'] })
      await queryClient.invalidateQueries({
        queryKey: ['workspace', 'project-snapshots'],
      })
      triggerRefresh()
    },
    onError: (error) => {
      toast(
        error instanceof Error ? error.message : 'Failed to archive project',
        { type: 'error' },
      )
    },
    onSettled: () => {
      setSubmittingKey((current) =>
        current?.startsWith('archive:') ? null : current,
      )
    },
  })

  function triggerRefresh() {
    setRefreshToken((value) => value + 1)
    void queryClient.invalidateQueries({ queryKey: ['workspace'] })
  }

  function focusProject(projectId: string) {
    setSelectedProjectId(projectId)
  }

  function openNewProjectDialog() {
    setCreateProjectError(null)
    setCreateProjectProgressStage(null)
    setCreateProjectLongRunning(false)
    setNewProjectForm({ name: '', path: '', spec: '', autoDecompose: true })
    setNewProjectOpen(true)
  }

  async function createInitialProjectMission(projectId: string, spec: string) {
    const phasePayload = await apiRequest('/api/workspace/phases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        name: 'Initial Build',
        sort_order: 0,
      }),
    })
    const phaseId = extractEntityId(phasePayload, 'phase')
    if (!phaseId) throw new Error('Phase creation returned an empty response')

    const missionPayload = await apiRequest('/api/workspace/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phase_id: phaseId,
        name: spec.slice(0, 60) || 'Initial Build',
      }),
    })
    const missionId = extractEntityId(missionPayload, 'mission')
    if (!missionId) throw new Error('Mission response was empty')

    setCreateProjectProgressStage('decomposing-tasks')
    const decomposeResult = extractDecomposeResponse(
      await apiRequest('/api/workspace/decompose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: spec,
          spec,
          project_id: projectId,
          mission_id: missionId,
        }),
      }),
    )

    if (decomposeResult.tasks.length === 0) {
      throw new Error('Decompose returned no tasks')
    }

    setCreateProjectProgressStage('starting-mission')
    for (const id of [missionId]) {
      await apiRequest(`/api/workspace/missions/${encodeURIComponent(id)}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    }

    return {
      missionId,
      taskCount: decomposeResult.tasks.length,
    }
  }

  function clearSelectedProject() {
    setSelectedProjectId(null)
    setSelectedCheckpoint(null)
    setPendingReviewCheckpoint(null)
  }

  function focusCheckpointReview(checkpoint: WorkspaceCheckpoint) {
    if (routePath === '/workspace') {
      const checkpointProjectId =
        projects.find((item) => item.name === checkpoint.project_name)?.id ??
        selectedProjectId ??
        undefined
      void navigate({
        to: '/workspace',
        search: {
          project: replanSearch?.project,
          projectId: replanSearch?.projectId ?? checkpointProjectId,
          goal: replanSearch?.goal,
          phaseId: replanSearch?.phaseId,
          phaseName: replanSearch?.phaseName,
          missionId: replanSearch?.missionId,
          checkpointId: checkpoint.id,
          returnTo: 'projects',
          showWizard: undefined,
        },
      })
      return
    }

    const project = projects.find(
      (item) => item.name === checkpoint.project_name,
    )
    if (project && project.id !== selectedProjectId) {
      setPendingReviewCheckpoint(checkpoint)
      setSelectedCheckpoint(null)
      setSelectedProjectId(project.id)
      return
    }
    setPendingReviewCheckpoint(null)
    setSelectedCheckpoint(checkpoint)
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

  function openPlanReview(missionId: string, projectId: string) {
    void navigate({
      to: '/workspace',
      search: {
        goal: undefined,
        checkpointId: undefined,
        planId: missionId,
        returnTo: undefined,
        phaseId: undefined,
        phaseName: undefined,
        projectId,
        project: undefined,
        missionId: undefined,
        showWizard: undefined,
      },
    })
  }

  function resetMissionLauncher() {
    setMissionLauncher(null)
    setExpandedDecomposeDescriptions({})
    decomposeMutation.reset()
  }

  function openProjectMissionComposer(projectId: string) {
    const project =
      projects.find((entry) => entry.id === projectId) ??
      (projectDetail?.id === projectId ? projectDetail : null)
    if (!project) return

    setProjectMissionComposer({
      project,
      goal: '',
      tasks: [],
      rawResponse: undefined,
      error: null,
    })
    setMissionStartPending(false)
    projectMissionDecomposeMutation.reset()
  }

  function closeProjectMissionComposer() {
    setProjectMissionComposer(null)
    setMissionStartPending(false)
    projectMissionDecomposeMutation.reset()
  }

  function handleTaskDraftChange(
    taskId: string,
    updates: Partial<DecomposedTaskDraft>,
  ) {
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

  function getCleanMissionTasks(tasks: DecomposedTaskDraft[]) {
    return tasks.map((task) => ({
      ...task,
      name: task.name.trim(),
      description: task.description.trim(),
      depends_on: task.depends_on.filter(Boolean),
    }))
  }

  function handleReviewMission() {
    if (!missionLauncher) return
    const cleanedTasks = getCleanMissionTasks(missionLauncher.tasks)
    if (cleanedTasks.length === 0) {
      toast('Add at least one task before reviewing', { type: 'warning' })
      return
    }
    if (cleanedTasks.some((task) => task.name.length === 0)) {
      toast('Each task needs a name', { type: 'warning' })
      return
    }
    if (
      new Set(cleanedTasks.map((task) => task.name)).size !==
      cleanedTasks.length
    ) {
      toast('Task names must be unique so dependencies can be mapped', {
        type: 'warning',
      })
      return
    }
    setMissionLauncher((current) =>
      current ? { ...current, tasks: cleanedTasks } : current,
    )
    void navigate({
      to: '/plan-review',
      search: {
        plan: JSON.stringify({
          goal: missionLauncher.goal,
          projectId: projectDetail?.id ?? selectedSummary?.id ?? null,
          projectName: projectDetail?.name ?? selectedSummary?.name ?? null,
          phaseId: missionLauncher.phase.id,
          phaseName: missionLauncher.phase.name,
          tasks: cleanedTasks,
        }),
        missionId: undefined,
        projectId: undefined,
      },
    })
  }

  function handleProjectMissionTaskChange(
    taskId: string,
    updates: Partial<DecomposedTaskDraft>,
  ) {
    setProjectMissionComposer((current) => {
      if (!current) return current
      return {
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === taskId ? { ...task, ...updates } : task,
        ),
      }
    })
  }

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newProjectForm.name.trim()
    const path = newProjectForm.path.trim()
    const spec = newProjectForm.spec.trim()
    setCreateProjectError(null)

    if (!name) {
      toast('Project name is required.', { type: 'warning' })
      return
    }

    if (!path) {
      toast('Local path is required.', { type: 'warning' })
      return
    }

    setSubmittingKey('project')
    setCreateProjectProgressStage('creating-project')
    setCreateProjectLongRunning(false)

    try {
      const project = extractProject(
        await apiRequest('/api/workspace/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            path,
            spec: spec || undefined,
          }),
        }),
      )
      if (!project) {
        throw new Error('Project creation returned an empty response')
      }

      if (newProjectForm.autoDecompose && spec) {
        const missionResult = await createInitialProjectMission(project.id, spec)
        toast(`Project created with ${missionResult.taskCount} task${missionResult.taskCount === 1 ? '' : 's'}`, {
          type: 'success',
        })
      } else {
        toast('Project created', { type: 'success' })
      }

      setSelectedProjectId(project.id)
      setNewProjectOpen(false)
      setNewProjectForm({ name: '', path: '', spec: '', autoDecompose: true })
      setCreateProjectProgressStage(null)
      setCreateProjectLongRunning(false)
      triggerRefresh()

      if (routePath === '/workspace') {
        void navigate({
          to: '/workspace',
          search: {
            goal: undefined,
            checkpointId: undefined,
            phaseId: undefined,
            phaseName: undefined,
            project: undefined,
            projectId: project.id,
            missionId: undefined,
            showWizard: undefined,
          },
        })
      }
    } catch (error) {
      setCreateProjectProgressStage(null)
      setCreateProjectLongRunning(false)
      setCreateProjectError(
        error instanceof Error ? error.message : 'Failed to create project',
      )
    } finally {
      setSubmittingKey(null)
    }
  }

  function handleProjectMissionDecompose(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    if (!projectMissionComposer?.goal.trim()) {
      setProjectMissionComposer((current) =>
        current ? { ...current, error: 'Goal is required.' } : current,
      )
      return
    }

    setProjectMissionComposer((current) =>
      current ? { ...current, error: null, tasks: [], rawResponse: undefined } : current,
    )
    projectMissionDecomposeMutation.mutate({
      goal: projectMissionComposer.goal.trim(),
      projectId: projectMissionComposer.project.id,
    })
  }

  async function handleStartProjectMission() {
    if (!projectMissionComposer) return

    const goal = projectMissionComposer.goal.trim()
    const cleanedTasks = projectMissionComposer.tasks.map((task) => ({
      ...task,
      name: task.name.trim(),
      description: task.description.trim(),
      depends_on: task.depends_on.filter(Boolean),
    }))

    if (!goal) {
      setProjectMissionComposer((current) =>
        current ? { ...current, error: 'Goal is required.' } : current,
      )
      return
    }

    if (cleanedTasks.length === 0) {
      setProjectMissionComposer((current) =>
        current ? { ...current, error: 'Decompose the goal before starting the mission.' } : current,
      )
      return
    }

    if (cleanedTasks.some((task) => task.name.length === 0)) {
      setProjectMissionComposer((current) =>
        current ? { ...current, error: 'Every task needs a name.' } : current,
      )
      return
    }

    setMissionStartPending(true)
    setProjectMissionComposer((current) =>
      current ? { ...current, error: null, tasks: cleanedTasks } : current,
    )

    try {
      const phasePayload = await apiRequest('/api/workspace/phases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectMissionComposer.project.id,
          name: 'Phase 1',
          sort_order: projectMissionComposer.project.phase_count,
        }),
      })
      const phaseId = extractEntityId(phasePayload, 'phase')
      if (!phaseId) throw new Error('Phase response was empty')

      const missionPayload = await apiRequest('/api/workspace/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase_id: phaseId,
          name: goal.slice(0, 60) || 'Phase 1 mission',
        }),
      })
      const missionId = extractEntityId(missionPayload, 'mission')
      if (!missionId) throw new Error('Mission response was empty')

      for (const [index, task] of cleanedTasks.entries()) {
        await apiRequest('/api/workspace-tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mission_id: missionId,
            name: task.name,
            description: task.description,
            suggested_agent_type: task.suggested_agent_type,
            depends_on: task.depends_on,
            sort_order: index,
          }),
        })
      }

      await apiRequest(`/api/workspace/missions/${encodeURIComponent(missionId)}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      closeProjectMissionComposer()
      toast('Mission started', { type: 'success' })
      triggerRefresh()
      void navigate({
        to: '/workspace',
        hash: 'runs',
        search: {
          goal: undefined,
          checkpointId: undefined,
          phaseId: undefined,
          phaseName: undefined,
          project: undefined,
          projectId: projectMissionComposer.project.id,
          missionId,
          showWizard: undefined,
        },
      })
    } catch (error) {
      setProjectMissionComposer((current) =>
        current
          ? {
              ...current,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to start mission',
            }
          : current,
      )
    } finally {
      setMissionStartPending(false)
    }
  }

  useEffect(() => {
    if (routePath === '/workspace') return
    if (!replanSearch?.checkpointId) return
    const checkpoint = allCheckpoints.find(
      (entry) => entry.id === replanSearch.checkpointId,
    )
    if (!checkpoint) return
    focusCheckpointReview(checkpoint)
    void navigate({
      to: routePath,
      replace: true,
      search: {
        project: replanSearch.project,
        projectId: replanSearch.projectId,
        goal: replanSearch.goal,
        phaseId: replanSearch.phaseId,
        phaseName: replanSearch.phaseName,
        checkpointId: undefined,
      },
    })
  }, [
    allCheckpoints,
    navigate,
    routePath,
    replanSearch?.checkpointId,
    replanSearch?.goal,
    replanSearch?.phaseId,
    replanSearch?.phaseName,
    replanSearch?.project,
    replanSearch?.projectId,
  ])

  useEffect(() => {
    if (!replanSearch?.phaseId || !replanSearch.goal || !projectDetail) return
    const phase = projectDetail.phases.find(
      (entry) => entry.id === replanSearch.phaseId,
    )
    if (!phase) return
    setMissionLauncher((current) => {
      if (
        current &&
        current.phase.id === phase.id &&
        current.goal === replanSearch.goal
      ) {
        return current
      }
      return {
        phase,
        goal: replanSearch.goal ?? '',
        step: 'input',
        tasks: [],
      }
    })
    setExpandedDecomposeDescriptions({})
    void navigate({
      to: routePath,
      replace: true,
      search: {
        project: undefined,
        goal: undefined,
        phaseId: undefined,
        phaseName: undefined,
        projectId: undefined,
      },
    })
  }, [
    navigate,
    projectDetail,
    replanSearch?.goal,
    replanSearch?.phaseId,
    routePath,
  ])

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
      toast(
        error instanceof Error
          ? error.message
          : 'Failed to approve checkpoints',
        {
          type: 'error',
        },
      )
    } finally {
      setBatchApproving(false)
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
      if (routePath === '/workspace') {
        void navigate({
          to: '/workspace',
          hash: 'runs',
          search: {
            goal: undefined,
            checkpointId: undefined,
            phaseId: undefined,
            phaseName: undefined,
            project: undefined,
            projectId:
              projectDetail?.id ?? selectedSummary?.id ?? replanSearch?.projectId,
            missionId,
            showWizard: undefined,
          },
        })
      }
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

  async function handlePauseMission(missionId: string) {
    setSubmittingKey(`pause:${missionId}`)
    try {
      await apiRequest(`/api/workspace/missions/${missionId}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      toast('Mission paused', { type: 'success' })
      triggerRefresh()
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Failed to pause mission',
        {
          type: 'error',
        },
      )
    } finally {
      setSubmittingKey(null)
    }
  }

  async function handleResumeMission(missionId: string) {
    setSubmittingKey(`resume:${missionId}`)
    try {
      await apiRequest(`/api/workspace/missions/${missionId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      toast('Mission resumed', { type: 'success' })
      triggerRefresh()
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Failed to resume mission',
        {
          type: 'error',
        },
      )
    } finally {
      setSubmittingKey(null)
    }
  }

  async function handleStopMission(missionId: string) {
    setSubmittingKey(`stop:${missionId}`)
    try {
      await apiRequest(`/api/workspace/missions/${missionId}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      toast('Mission stopped', { type: 'success' })
      triggerRefresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to stop mission', {
        type: 'error',
      })
    } finally {
      setSubmittingKey(null)
    }
  }

  async function handleSaveProjectSpec(nextSpec?: string) {
    const activeProject = projectDetail ?? selectedSummary
    if (!activeProject) return
    const specValue = typeof nextSpec === 'string' ? nextSpec : projectSpecDraft
    setSubmittingKey('project-spec')
    try {
      const updatedProject = extractProject(
        await apiRequest(
          `/api/workspace/projects/${encodeURIComponent(activeProject.id)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spec: specValue.trim() ? specValue : null }),
          },
        ),
      )
      if (updatedProject) {
        setProjectDetail((current) =>
          current?.id === updatedProject.id
            ? { ...current, ...updatedProject }
            : current,
        )
        queryClient.setQueryData<Array<WorkspaceProject> | undefined>(
          ['workspace', 'projects', refreshToken],
          (current) =>
            current?.map((project) =>
              project.id === updatedProject.id
                ? { ...project, ...updatedProject }
                : project,
            ),
        )
        setProjectSpecDraft(updatedProject.spec ?? '')
        setProjectSpecOpen(false)
      }
      toast('Project spec saved', { type: 'success' })
      triggerRefresh()
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Failed to save project spec',
        {
          type: 'error',
        },
      )
    } finally {
      setSubmittingKey(null)
    }
  }

  const detailMode = selectedProjectId !== null
  const activeProjectLabel = projectDetail?.name ?? selectedSummary?.name ?? 'Project'

  return (
    <main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-900 md:px-6 md:pt-8">
      <section className="mx-auto w-full max-w-[1480px] space-y-5">
        <header className="flex flex-col gap-4 rounded-xl border border-primary-200 bg-primary-50/80 px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-accent-500/30 bg-accent-500/10 text-accent-400">
              <HugeiconsIcon icon={Folder01Icon} size={24} strokeWidth={1.6} />
            </div>
            <div>
              {detailMode ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearSelectedProject}
                      className="-ml-3 h-auto px-3 py-1.5 text-primary-600 hover:bg-primary-100 hover:text-primary-900"
                    >
                      <HugeiconsIcon
                        icon={ArrowLeft01Icon}
                        size={16}
                        strokeWidth={1.6}
                      />
                      Back to Projects
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-primary-500">
                    <button
                      type="button"
                      onClick={clearSelectedProject}
                      className="font-medium text-primary-700 transition-colors hover:text-primary-900"
                    >
                      Projects
                    </button>
                    <span aria-hidden="true">{'>'}</span>
                    <span
                      className={cn(
                        'font-medium text-primary-900',
                        detailLoading && !projectDetail && 'text-primary-500',
                      )}
                    >
                      {activeProjectLabel}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <h1 className="text-base font-semibold text-primary-900">
                    Projects
                  </h1>
                  <p className="text-sm text-primary-500">
                    Mission control for workspace execution, review handoffs, and
                    agent load.
                  </p>
                </>
              )}
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
              onClick={openNewProjectDialog}
              className="bg-accent-500 text-white hover:bg-accent-400"
            >
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.6} />
              New Project
            </Button>
          </div>
        </header>

        {listLoading && projects.length === 0 ? (
          <div className="rounded-xl border border-primary-200 bg-white px-6 py-16 text-center shadow-sm">
            <div className="mb-4 inline-block h-10 w-10 animate-spin rounded-full border-4 border-accent-500 border-r-transparent" />
            <p className="text-sm text-primary-500">
              Loading workspace projects...
            </p>
          </div>
        ) : visibleProjects.length === 0 ? (
          projects.length === 0 ? (
            <section className="rounded-xl border border-primary-200 bg-primary-50/80 p-6 shadow-sm md:p-8">
              <div className="mx-auto max-w-3xl">
                <div className="flex size-14 items-center justify-center rounded-xl border border-primary-200 bg-white text-accent-400 shadow-sm">
                  <HugeiconsIcon icon={Folder01Icon} size={26} strokeWidth={1.5} />
                </div>
                <h2 className="mt-5 text-2xl font-semibold text-primary-900">
                  Start your first project
                </h2>
                <p className="mt-2 max-w-xl text-sm text-primary-600">
                  Point agents at any git repo and describe what to build.
                </p>
                <ol className="mt-6 space-y-3 text-sm text-primary-900">
                  {[
                    'Connect a repo',
                    'Describe the goal',
                    'Agents run automatically',
                  ].map((step, index) => (
                    <li
                      key={step}
                      className="flex items-center gap-3 rounded-xl border border-primary-200 bg-white px-4 py-3 shadow-sm"
                    >
                      <span className="flex size-7 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-900">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <Button
                  onClick={openNewProjectDialog}
                  className="mt-6 bg-accent-500 text-white hover:bg-accent-400"
                >
                  New Project
                  <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.6} />
                </Button>
              </div>
            </section>
          ) : (
            <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/70 px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-xl border border-primary-200 bg-white text-primary-500">
                <HugeiconsIcon icon={Folder01Icon} size={26} strokeWidth={1.5} />
              </div>
              <h2 className="text-lg font-semibold text-primary-900">
                No active projects
              </h2>
              <p className="mx-auto mt-2 max-w-lg text-sm text-primary-500">
                All current projects are archived. Enable archived projects to view them.
              </p>
              <Button
                variant="outline"
                onClick={() => setShowArchived(true)}
                className="mt-5"
              >
                Show archived
              </Button>
            </div>
          )
        ) : detailMode ? (
          <section className="rounded-xl border border-primary-200 bg-white p-4 shadow-sm md:p-5">
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
              onSaveSpec={(value) => void handleSaveProjectSpec(value)}
              onAddPhase={setPhaseProject}
              onTogglePhase={(phaseId) =>
                setExpandedPhases((current) => ({
                  ...current,
                  [phaseId]: !current[phaseId],
                }))
              }
              onAddMission={setMissionPhase}
              onOpenMissionLauncher={openMissionLauncher}
              onOpenPlanReview={openPlanReview}
              onStartMission={(missionId) =>
                void handleStartMission(missionId)
              }
              onPauseMission={(missionId) =>
                void handlePauseMission(missionId)
              }
              onResumeMission={(missionId) =>
                void handleResumeMission(missionId)
              }
              onStopMission={(missionId) => void handleStopMission(missionId)}
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
                projectCheckpointMutation.mutate({
                  checkpointId,
                  action: 'reject',
                })
              }
              onRefreshActivity={() => void activityEventsQuery.refetch()}
            />
          </section>
        ) : (
          <>
            <div className="flex items-center justify-end">
              <label className="inline-flex items-center gap-3 rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm text-primary-600 shadow-sm">
                <span>Show archived</span>
                <Switch
                  checked={showArchived}
                  onCheckedChange={(checked) => setShowArchived(Boolean(checked))}
                  aria-label="Show archived projects"
                />
              </label>
            </div>

            <DashboardKpiBar
              stats={statsQuery.data}
              projects={projects}
              agents={agents}
              pendingCheckpointCount={pendingCheckpoints.length}
              loading={projectsQuery.isPending || agentsQuery.isPending}
            />

            <DashboardProjectCards
              projectOverviews={projectOverviews}
              selectedProjectId={selectedProjectId}
              planReviewMissionIdsByProjectId={planReviewMissionIdsByProjectId}
              loading={projectsQuery.isPending}
              error={
                projectsQuery.isError
                  ? projectsQuery.error instanceof Error
                    ? projectsQuery.error.message
                    : 'Failed to load projects'
                  : null
              }
              onSelect={focusProject}
              onCreateMission={openProjectMissionComposer}
              onResume={(missionId) => void handleStartMission(missionId)}
              onReviewPlan={openPlanReview}
              onArchive={(projectId) => archiveProjectMutation.mutate(projectId)}
              submittingKey={submittingKey}
            />

            <DashboardAgentCapacity
              agents={agents}
              stats={statsQuery.data}
              loading={agentsQuery.isPending}
            />

            {(checkpointsQuery.isPending ||
              checkpointsQuery.isError ||
              reviewInboxItems.length > 0) && (
              <div className="grid grid-cols-1 gap-4">
                <DashboardReviewInbox
                  checkpoints={reviewInboxItems}
                  projects={projects}
                  selectedProjectName={selectedSummary?.name}
                  projectOptions={reviewProjectOptions}
                  projectFilter={reviewProjectFilter}
                  verificationFilter={reviewVerificationFilter}
                  riskFilter={reviewRiskFilter}
                  loading={checkpointsQuery.isPending}
                  error={
                    checkpointsQuery.isError
                      ? checkpointsQuery.error instanceof Error
                        ? checkpointsQuery.error.message
                        : 'Failed to load pending checkpoints'
                      : null
                  }
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
              </div>
            )}
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
            projectCheckpointMutation
              .mutateAsync({
                checkpointId,
                action: mode ?? 'approve-and-commit',
                reviewerNotes: notes,
              })
              .then(() => undefined)
          }
          onRevise={(checkpointId, notes) =>
            projectCheckpointMutation
              .mutateAsync({
                checkpointId,
                action: 'revise',
                reviewerNotes: notes,
              })
              .then(() => undefined)
          }
          onReject={(checkpointId, notes) =>
            projectCheckpointMutation
              .mutateAsync({
                checkpointId,
                action: 'reject',
                reviewerNotes: notes,
              })
              .then(() => undefined)
          }
        />
      ) : null}

      <CreateProjectDialog
        open={newProjectOpen}
        submitting={submittingKey === 'project'}
        form={newProjectForm}
        submitLabel={
          createProjectProgressStage === 'creating-project'
            ? 'Creating project...'
            : createProjectProgressStage === 'decomposing-tasks'
              ? 'Decomposing tasks with AI...'
              : createProjectProgressStage === 'starting-mission'
                ? 'Starting mission...'
                : 'Create Project'
        }
        errorMessage={createProjectError}
        progressMessage={
          createProjectProgressStage === 'creating-project'
            ? 'Creating project...'
            : createProjectProgressStage === 'decomposing-tasks'
              ? 'Decomposing tasks with AI...'
              : createProjectProgressStage === 'starting-mission'
                ? 'Starting mission...'
                : null
        }
        progressHint={
          createProjectLongRunning
            ? 'AI is analyzing your spec and creating tasks. This usually takes 30-60 seconds.'
            : null
        }
        onOpenChange={(open) => {
          if (!open) {
            setCreateProjectError(null)
            setCreateProjectProgressStage(null)
            setCreateProjectLongRunning(false)
          }
          setNewProjectOpen(open)
        }}
        onFormChange={setNewProjectForm}
        onSubmit={handleCreateProject}
      />

      <DialogRoot
        open={projectMissionComposer !== null}
        onOpenChange={(open) => {
          if (!open) closeProjectMissionComposer()
        }}
      >
        <DialogContent className="w-[min(860px,96vw)] border-primary-200 bg-primary-50 p-0 text-primary-900 shadow-2xl">
          {projectMissionComposer ? (
            <form onSubmit={handleProjectMissionDecompose} className="space-y-5 p-5">
              <div className="space-y-1">
                <DialogTitle className="text-base font-semibold text-primary-900">
                  New Mission
                </DialogTitle>
                <DialogDescription className="text-sm text-primary-600">
                  Decompose a goal for {projectMissionComposer.project.name} and launch it immediately.
                </DialogDescription>
              </div>

              <div className="grid gap-3 rounded-xl border border-primary-200 bg-white p-4 md:grid-cols-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-primary-500">
                    Project
                  </p>
                  <p className="mt-1 text-sm font-medium text-primary-900">
                    {projectMissionComposer.project.name}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-primary-500">
                    Path
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-primary-600">
                    {projectMissionComposer.project.path ?? 'No path configured'}
                  </p>
                </div>
              </div>

              <label className="block space-y-1.5">
                <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-primary-600">
                  Goal
                </span>
                <textarea
                  value={projectMissionComposer.goal}
                  onChange={(event) =>
                    setProjectMissionComposer((current) =>
                      current
                        ? {
                            ...current,
                            goal: event.target.value,
                            error: null,
                          }
                        : current,
                    )
                  }
                  rows={7}
                  className="w-full rounded-xl border border-primary-300 bg-white px-3 py-3 text-sm text-primary-900 outline-none transition-colors focus:border-accent-500"
                  placeholder="What do you want to build or fix?"
                  autoFocus
                />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-primary-600">
                  {projectMissionComposer.tasks.length > 0
                    ? `${projectMissionComposer.tasks.length} tasks ready`
                    : 'Generate a task plan before starting the mission.'}
                </div>
                <Button
                  type="submit"
                  className="bg-accent-500 text-white hover:bg-accent-400"
                  disabled={projectMissionDecomposeMutation.isPending || missionStartPending}
                >
                  {projectMissionDecomposeMutation.isPending ? 'Thinking...' : 'Decompose'}
                </Button>
              </div>

              {projectMissionDecomposeMutation.isPending ? (
                <div className="rounded-xl border border-primary-200 bg-white px-4 py-5">
                  <div className="flex items-center gap-3">
                    <div className="size-5 animate-spin rounded-full border-2 border-accent-500 border-r-transparent" />
                    <div>
                      <p className="text-sm font-medium text-primary-900">Thinking...</p>
                      <p className="text-sm text-primary-500">
                        Decomposing the mission goal into executable tasks.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {projectMissionComposer.tasks.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-primary-900">Generated task plan</p>
                    <p className="text-xs text-primary-500">
                      {formatMinutes(
                        projectMissionComposer.tasks.reduce(
                          (total, task) => total + task.estimated_minutes,
                          0,
                        ),
                      )}{' '}
                      total estimate
                    </p>
                  </div>

                  <div className="max-h-[42vh] space-y-3 overflow-y-auto pr-1">
                    {projectMissionComposer.tasks.map((task, index) => (
                      <article
                        key={task.id}
                        className="rounded-xl border border-primary-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-primary-200 bg-primary-50 text-xs font-semibold text-primary-600">
                                {index + 1}
                              </span>
                              <input
                                value={task.name}
                                onChange={(event) =>
                                  handleProjectMissionTaskChange(task.id, {
                                    name: event.target.value,
                                  })
                                }
                                className="min-w-0 flex-1 rounded-xl border border-primary-300 bg-white px-3 py-2 text-sm font-medium text-primary-900 outline-none transition-colors focus:border-accent-500"
                              />
                            </div>
                            <p className="mt-3 line-clamp-2 text-sm text-primary-600">
                              {task.description}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium',
                                getMissionAgentBadgeClass(task.suggested_agent_type),
                              )}
                            >
                              {getAgentBadgeLabel(task.suggested_agent_type)}
                            </span>
                            <span className="inline-flex rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-[11px] font-medium text-primary-600">
                              {formatMinutes(task.estimated_minutes)}
                            </span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              {projectMissionComposer.rawResponse &&
              projectMissionComposer.tasks.length === 0 ? (
                <div className="rounded-xl border border-primary-200 bg-white px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-primary-500">
                    Response
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-primary-600">
                    {projectMissionComposer.rawResponse}
                  </p>
                </div>
              ) : null}

              {projectMissionComposer.error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {projectMissionComposer.error}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <DialogClose
                  render={<Button variant="outline" disabled={missionStartPending}>Cancel</Button>}
                />
                <Button
                  type="button"
                  onClick={() => void handleStartProjectMission()}
                  className="bg-accent-500 text-white hover:bg-accent-400"
                  disabled={
                    missionStartPending ||
                    projectMissionDecomposeMutation.isPending ||
                    projectMissionComposer.tasks.length === 0
                  }
                >
                  {missionStartPending ? 'Starting...' : 'Start Mission'}
                </Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </DialogRoot>

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
            className="w-full rounded-xl border border-primary-300 bg-white px-3 py-2.5 text-sm text-primary-900 outline-none transition-colors focus:border-accent-500"
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
            className="w-full rounded-xl border border-primary-300 bg-white px-3 py-2.5 text-sm text-primary-900 outline-none transition-colors focus:border-accent-500"
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
            onChange={(event) =>
              setTaskForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            className="w-full rounded-xl border border-primary-300 bg-white px-3 py-2.5 text-sm text-primary-900 outline-none transition-colors focus:border-accent-500"
            placeholder="Implement workspace project routes"
            autoFocus
          />
        </WorkspaceFieldLabel>
        <WorkspaceFieldLabel label="Description">
          <textarea
            value={taskForm.description}
            onChange={(event) =>
              setTaskForm((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            rows={4}
            className="w-full rounded-xl border border-primary-300 bg-white px-3 py-2.5 text-sm text-primary-900 outline-none transition-colors focus:border-accent-500"
            placeholder="Optional task detail..."
          />
        </WorkspaceFieldLabel>
        <WorkspaceFieldLabel label="Depends On">
          <input
            value={taskForm.dependsOn}
            onChange={(event) =>
              setTaskForm((current) => ({
                ...current,
                dependsOn: event.target.value,
              }))
            }
            className="w-full rounded-xl border border-primary-300 bg-white px-3 py-2.5 text-sm text-primary-900 outline-none transition-colors focus:border-accent-500"
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
        launchPending={false}
        onOpenChange={(open) => {
          if (!open) resetMissionLauncher()
        }}
        onGoalChange={(goal) =>
          setMissionLauncher((current) =>
            current ? { ...current, goal } : current,
          )
        }
        onTaskDraftChange={handleTaskDraftChange}
        onDescriptionToggle={(taskId, open) =>
          setExpandedDecomposeDescriptions((current) => ({
            ...current,
            [taskId]: open,
          }))
        }
        onBack={() =>
          setMissionLauncher((current) =>
            current ? { ...current, step: 'input' } : current,
          )
        }
        onDecomposeSubmit={handleDecomposeSubmit}
        onReview={handleReviewMission}
      />
    </main>
  )
}
