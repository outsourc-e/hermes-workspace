import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  CheckmarkCircle02Icon,
  PencilEdit02Icon,
  ReloadIcon,
  Rocket01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import type { DecomposedTaskDraft } from '@/screens/projects/lib/workspace-types'
import {
  extractProject,
  extractTasks,
  normalizeDecomposedTask,
  normalizeMission,
  normalizeTask,
  type WorkspaceMission,
  type WorkspaceProject,
  type WorkspaceTask,
} from '@/screens/projects/lib/workspace-types'
import {
  calculateExecutionWaves,
  deriveMissionName,
  formatMinutes,
  getAgentBadgeClass,
  getAgentBadgeLabel,
  isHighRiskTask,
} from '@/screens/projects/lib/workspace-utils'

type PlanReviewScreenProps = {
  plan: string
  missionId?: string
  projectId?: string
}

type PlanReviewState = {
  goal: string
  phaseId: string
  phaseName: string
  projectId?: string | null
  projectName?: string | null
  missionId?: string | null
  missionName?: string | null
  tasks: DecomposedTaskDraft[]
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readPayload(response: Response): Promise<unknown> {
  return response.text().then((text) => {
    if (!text) return null
    try {
      return JSON.parse(text) as unknown
    } catch {
      return text
    }
  })
}

async function apiRequest(input: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(input, init)
  const payload = await readPayload(response)

  if (!response.ok) {
    const record = readRecord(payload)
    throw new Error(
      (typeof record?.error === 'string' && record.error) ||
        (typeof record?.message === 'string' && record.message) ||
        `Request failed with status ${response.status}`,
    )
  }

  return payload
}

function parsePlanState(plan: string): PlanReviewState | null {
  if (!plan) return null

  try {
    const parsed = JSON.parse(plan) as unknown
    const record = readRecord(parsed)
    if (!record) return null

    const tasksSource = Array.isArray(record.tasks) ? record.tasks : []
    const tasks = tasksSource.map(normalizeDecomposedTask)
    const phaseId = typeof record.phaseId === 'string' ? record.phaseId : ''
    const phaseName = typeof record.phaseName === 'string' ? record.phaseName : 'Mission'
    const goal = typeof record.goal === 'string' ? record.goal : ''

    if (!phaseId || tasks.length === 0) return null

    return {
      goal,
      phaseId,
      phaseName,
      projectId: typeof record.projectId === 'string' ? record.projectId : null,
      projectName: typeof record.projectName === 'string' ? record.projectName : null,
      missionId: null,
      missionName: null,
      tasks,
    }
  } catch {
    return null
  }
}

async function loadMissionTasks(missionId: string) {
  return extractTasks(
    await apiRequest(`/api/workspace-tasks?mission_id=${encodeURIComponent(missionId)}`),
  )
}

function getMissionFromProject(
  project: WorkspaceProject | null | undefined,
  missionId: string,
): { mission: WorkspaceMission; phaseName: string; phaseId: string } | null {
  if (!project) return null

  for (const phase of project.phases) {
    const mission = phase.missions.find((entry) => entry.id === missionId)
    if (mission) {
      return {
        mission,
        phaseName: phase.name,
        phaseId: phase.id,
      }
    }
  }

  return null
}

function toTaskDrafts(tasks: WorkspaceTask[]): DecomposedTaskDraft[] {
  const taskNameById = new Map(tasks.map((task) => [task.id, task.name]))
  return tasks.map((task) => ({
    id: task.id,
    name: task.name,
    description: task.description ?? '',
    estimated_minutes: 0,
    depends_on: task.depends_on.map((dependencyId) => taskNameById.get(dependencyId) ?? dependencyId),
    suggested_agent_type: null,
  }))
}

function getAgentSummary(tasks: DecomposedTaskDraft[]) {
  const counts = new Map<string, number>()
  for (const task of tasks) {
    const label = getAgentBadgeLabel(task.suggested_agent_type)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return Array.from(counts.entries()).map(([label, count]) => ({ label, count }))
}

function reorderTasks(
  tasks: DecomposedTaskDraft[],
  fromIndex: number,
  toIndex: number,
): DecomposedTaskDraft[] {
  if (toIndex < 0 || toIndex >= tasks.length || fromIndex === toIndex) return tasks
  const next = tasks.slice()
  const [moved] = next.splice(fromIndex, 1)
  if (!moved) return tasks
  next.splice(toIndex, 0, moved)
  return next
}

function removeTask(tasks: DecomposedTaskDraft[], taskId: string): DecomposedTaskDraft[] {
  const removedTask = tasks.find((task) => task.id === taskId)
  if (!removedTask) return tasks

  return tasks
    .filter((task) => task.id !== taskId)
    .map((task) => ({
      ...task,
      depends_on: task.depends_on.filter((dependency) => dependency !== removedTask.name),
    }))
}

export function PlanReviewScreen({
  plan,
  missionId = '',
  projectId = '',
}: PlanReviewScreenProps) {
  const navigate = useNavigate()
  const parsedPlan = useMemo(() => parsePlanState(plan), [plan])
  const projectQuery = useQuery({
    queryKey: ['workspace', 'plan-review', 'project', projectId],
    enabled: Boolean(missionId && projectId),
    queryFn: async () =>
      extractProject(
        await apiRequest(`/api/workspace/projects/${encodeURIComponent(projectId)}`),
      ),
  })
  const missionTasksQuery = useQuery({
    queryKey: ['workspace', 'plan-review', 'mission-tasks', missionId],
    enabled: Boolean(missionId),
    queryFn: async () => loadMissionTasks(missionId),
  })
  const missionPlan = useMemo(() => {
    if (!missionId || !projectQuery.data) return null
    const missionContext = getMissionFromProject(projectQuery.data, missionId)
    if (!missionContext) return null

    return {
      goal: missionContext.mission.name,
      phaseId: missionContext.phaseId,
      phaseName: missionContext.phaseName,
      projectId: projectQuery.data.id,
      projectName: projectQuery.data.name,
      missionId,
      missionName: missionContext.mission.name,
      tasks: toTaskDrafts(missionTasksQuery.data ?? missionContext.mission.tasks),
    } satisfies PlanReviewState
  }, [missionId, missionTasksQuery.data, projectQuery.data])
  const resolvedPlan = parsedPlan ?? missionPlan
  const [tasks, setTasks] = useState<DecomposedTaskDraft[]>(() => resolvedPlan?.tasks ?? [])
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    setTasks(resolvedPlan?.tasks ?? [])
  }, [resolvedPlan])

  useEffect(() => {
    if (!editingTaskId) return
    inputRefs.current[editingTaskId]?.focus()
    inputRefs.current[editingTaskId]?.select()
  }, [editingTaskId])

  const missionName = useMemo(
    () =>
      resolvedPlan?.missionName?.trim() ||
      deriveMissionName(resolvedPlan?.goal ?? ''),
    [resolvedPlan?.goal, resolvedPlan?.missionName],
  )
  const waves = useMemo(() => calculateExecutionWaves(tasks), [tasks])
  const totalMinutes = useMemo(
    () => tasks.reduce((total, task) => total + task.estimated_minutes, 0),
    [tasks],
  )
  const agents = useMemo(() => getAgentSummary(tasks), [tasks])
  const riskTasks = useMemo(() => tasks.filter((task) => isHighRiskTask(task)), [tasks])
  const hasDependencies = tasks.some((task) => task.depends_on.length > 0)

  const launchMutation = useMutation({
    mutationFn: async () => {
      if (!resolvedPlan) throw new Error('Plan data is missing')
      const cleanedTasks = tasks.map((task) => ({
        ...task,
        name: task.name.trim(),
        description: task.description.trim(),
        depends_on: task.depends_on.filter(Boolean),
      }))

      if (cleanedTasks.some((task) => task.name.length === 0)) {
        throw new Error('Each task needs a name before launch')
      }
      if (new Set(cleanedTasks.map((task) => task.name)).size !== cleanedTasks.length) {
        throw new Error('Task names must stay unique after edits')
      }

      if (resolvedPlan.missionId) {
        const idByName = new Map(cleanedTasks.map((task) => [task.name, task.id] as const))

        await Promise.all(
          cleanedTasks.map(async (task, index) => {
            const dependencyIds = task.depends_on
              .map((dependency) => idByName.get(dependency))
              .filter((dependencyId): dependencyId is string => typeof dependencyId === 'string')

            if (dependencyIds.length !== task.depends_on.length) {
              throw new Error(`Task "${task.name}" has an invalid dependency`)
            }

            await apiRequest(`/api/workspace-tasks/${encodeURIComponent(task.id)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: task.name,
                description: task.description,
                sort_order: index,
                depends_on: dependencyIds,
              }),
            })
          }),
        )

        await apiRequest(
          `/api/workspace/missions/${encodeURIComponent(resolvedPlan.missionId)}/start`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          },
        )

        return { missionId: resolvedPlan.missionId, projectId: resolvedPlan.projectId ?? null }
      }

      const missionPayload = normalizeMission(
        await apiRequest('/api/workspace/missions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phase_id: resolvedPlan.phaseId,
            name: missionName || `${resolvedPlan.phaseName} Mission`,
          }),
        }),
      )

      const createdTasks = await Promise.all(
        cleanedTasks.map(async (task, index) =>
          normalizeTask(
            await apiRequest('/api/workspace-tasks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                mission_id: missionPayload.id,
                name: task.name,
                description: task.description,
                sort_order: index,
                depends_on: [],
              }),
            }),
          ),
        ),
      )

      const idByName = new Map(
        createdTasks.map((task, index) => [cleanedTasks[index]?.name, task.id] as const),
      )

      await Promise.all(
        createdTasks.map(async (task, index) => {
          const dependencyIds = (cleanedTasks[index]?.depends_on ?? [])
            .map((dependency) => idByName.get(dependency))
            .filter((dependencyId): dependencyId is string => typeof dependencyId === 'string')
          if (dependencyIds.length === 0) return
          await apiRequest(`/api/workspace-tasks/${encodeURIComponent(task.id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ depends_on: dependencyIds }),
          })
        }),
      )

      await apiRequest(`/api/workspace/missions/${encodeURIComponent(missionPayload.id)}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      return {
        missionId: missionPayload.id,
        projectId: resolvedPlan.projectId ?? null,
      }
    },
    onSuccess: (result) => {
      toast('Mission launched', { type: 'success' })
      if (result?.missionId) {
        void navigate({
          to: '/mission-console',
          search: {
            missionId: result.missionId,
            projectId: result.projectId ?? '',
          },
        })
        return
      }
      void navigate({ to: '/runs' })
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to launch mission', {
        type: 'error',
      })
    },
  })

  const isMissionLoading = Boolean(missionId) && !parsedPlan && (
    projectQuery.isLoading ||
    missionTasksQuery.isLoading
  )

  const breadcrumbProjectId = (resolvedPlan?.projectId ?? projectId) || undefined
  const breadcrumbProjectName = resolvedPlan?.projectName ?? projectQuery.data?.name ?? 'Project'

  if (isMissionLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface p-6">
        <div className="w-full max-w-lg rounded-xl border border-primary-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-primary-900">Plan Review</h1>
          <p className="mt-2 text-sm text-primary-500">Loading plan review...</p>
        </div>
      </div>
    )
  }

  if (!resolvedPlan) {
    return (
      <div className="flex h-full items-center justify-center bg-surface p-6">
        <div className="w-full max-w-lg rounded-xl border border-primary-200 bg-white p-6 text-center shadow-sm">
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-primary-500">
            <Link to="/projects" className="transition-colors hover:text-primary-900">
              Projects
            </Link>
            <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={1.8} />
            <span>Plan Review</span>
          </div>
          <h1 className="text-xl font-semibold text-primary-900">Plan Review</h1>
          <p className="mt-2 text-sm text-primary-500">
            This plan link is missing data. Go back to Projects and regenerate the mission
            plan.
          </p>
          <Button
            className="mt-5 bg-accent-500 text-white hover:bg-accent-400"
            onClick={() =>
              void navigate({
                to: '/projects',
                search: {
                  project: undefined,
                  goal: undefined,
                  phaseId: undefined,
                  phaseName: undefined,
                  projectId: undefined,
                },
              })
            }
          >
            Back to Projects
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-surface px-4 py-5 text-primary-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 lg:flex-row">
        <section className="min-w-0 flex-1 rounded-xl border border-primary-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="border-b border-primary-200 pb-5">
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-primary-500">
              <Link to="/projects" className="transition-colors hover:text-primary-900">
                Projects
              </Link>
              <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={1.8} />
              {breadcrumbProjectId ? (
                <Link
                  to="/projects"
                  search={{ projectId: breadcrumbProjectId }}
                  className="transition-colors hover:text-primary-900"
                >
                  {breadcrumbProjectName}
                </Link>
              ) : (
                <span>{breadcrumbProjectName}</span>
              )}
              <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={1.8} />
              <span>Plan Review</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-primary-900 sm:text-[2rem]">
              {missionName}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-primary-500">
              AI generated {tasks.length} task{tasks.length === 1 ? '' : 's'} with
              dependencies. Review and edit before launching.
            </p>
          </div>

          <div className="mt-5 space-y-3">
            <div className="rounded-2xl border border-primary-200 bg-primary-50/80 px-4 py-3 text-sm text-primary-500">
              Review the task plan before launching. You can edit task names,
              reorder, or remove tasks.
            </div>
            {riskTasks.length > 0 ? (
              <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                {riskTasks.length} task{riskTasks.length === 1 ? '' : 's'} touch auth,
                security, payments, or migrations. Review those before launch.
              </div>
            ) : null}
            {hasDependencies ? (
              <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Execution will run in {waves.length} wave{waves.length === 1 ? '' : 's'} based
                on dependencies.
              </div>
            ) : null}
          </div>

          <div className="mt-5 space-y-3">
            {tasks.map((task, index) => {
              const isEditing = editingTaskId === task.id
              const highRisk = isHighRiskTask(task)
              const dependencyLabels = task.depends_on
                .map((dependency) => {
                  const dependencyIndex = tasks.findIndex((entry) => entry.name === dependency)
                  return dependencyIndex >= 0 ? `Task ${dependencyIndex + 1}` : dependency
                })
                .join(', ')

              return (
                <article
                  key={task.id}
                  className={[
                    'rounded-2xl border bg-primary-800/35 p-4 transition-colors',
                    highRisk
                      ? 'border-primary-700 border-l-2 border-l-red-500'
                      : 'border-primary-800',
                  ].join(' ')}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-2 pt-0.5">
                      <div
                        className={[
                          'inline-flex size-9 items-center justify-center rounded-2xl border text-sm font-semibold',
                          highRisk
                            ? 'border-red-500/60 bg-red-500/10 text-red-300'
                            : 'border-primary-700 bg-primary-900 text-primary-300',
                        ].join(' ')}
                      >
                        {index + 1}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-primary-400 hover:bg-primary-800 hover:text-primary-100"
                          onClick={() => setTasks((current) => reorderTasks(current, index, index - 1))}
                          disabled={index === 0}
                        >
                          <HugeiconsIcon icon={ArrowUp01Icon} size={14} strokeWidth={1.8} />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-primary-400 hover:bg-primary-800 hover:text-primary-100"
                          onClick={() => setTasks((current) => reorderTasks(current, index, index + 1))}
                          disabled={index === tasks.length - 1}
                        >
                          <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.8} />
                        </Button>
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <input
                              ref={(element) => {
                                inputRefs.current[task.id] = element
                              }}
                              value={task.name}
                              onChange={(event) =>
                                setTasks((current) =>
                                  current.map((entry) => {
                                    if (entry.id === task.id) {
                                      return { ...entry, name: event.target.value }
                                    }
                                    if (entry.depends_on.includes(task.name)) {
                                      return {
                                        ...entry,
                                        depends_on: entry.depends_on.map((dependency) =>
                                          dependency === task.name ? event.target.value : dependency,
                                        ),
                                      }
                                    }
                                    return entry
                                  }),
                                )
                              }
                              onBlur={() => setEditingTaskId((current) => (current === task.id ? null : current))}
                              className="w-full rounded-xl border border-primary-700 bg-primary-900 px-3 py-2 text-base font-medium text-primary-100 outline-none transition-colors focus:border-accent-500"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingTaskId(task.id)}
                              className="text-left text-base font-medium text-primary-100 transition-colors hover:text-accent-300"
                            >
                              {task.name}
                            </button>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          className="shrink-0 text-primary-400 hover:bg-primary-800 hover:text-red-300"
                          onClick={() => {
                            setTasks((current) => removeTask(current, task.id))
                            setEditingTaskId((current) => (current === task.id ? null : current))
                          }}
                        >
                          Remove
                        </Button>
                      </div>

                      <p className="mt-1 text-sm text-primary-400">
                        {task.depends_on.length > 0
                          ? `← ${dependencyLabels}`
                          : 'No dependencies'}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                          className={['inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium', getAgentBadgeClass(task.suggested_agent_type)].join(
                            ' ',
                          )}
                        >
                          {getAgentBadgeLabel(task.suggested_agent_type)}
                        </span>
                        <span className="inline-flex rounded-full border border-primary-700 bg-primary-900/80 px-2.5 py-1 text-[11px] font-medium text-primary-300">
                          ~{formatMinutes(task.estimated_minutes)}
                        </span>
                        {highRisk ? (
                          <span className="inline-flex rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-300">
                            Risk
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-3 text-sm leading-6 text-primary-300">
                        {task.description}
                      </p>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <aside className="w-full shrink-0 lg:w-[260px]">
          <div className="rounded-xl border border-primary-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-primary-800 bg-primary-800/35 p-3">
                <p className="text-xs text-primary-500">Tasks</p>
                <p className="mt-1 text-2xl font-semibold text-primary-100">{tasks.length}</p>
              </div>
              <div className="rounded-2xl border border-primary-800 bg-primary-800/35 p-3">
                <p className="text-xs text-primary-500">Est. Time</p>
                <p className="mt-1 text-2xl font-semibold text-accent-300">
                  ~{formatMinutes(totalMinutes)}
                </p>
              </div>
              <div className="rounded-2xl border border-primary-800 bg-primary-800/35 p-3">
                <p className="text-xs text-primary-500">Est. Cost</p>
                <p className="mt-1 text-2xl font-semibold text-emerald-300">$0.00</p>
              </div>
              <div className="rounded-2xl border border-primary-800 bg-primary-800/35 p-3">
                <p className="text-xs text-primary-500">Agents</p>
                <p className="mt-1 text-2xl font-semibold text-primary-100">{agents.length}</p>
              </div>
            </div>

            <div className="mt-5">
              <h2 className="text-sm font-semibold text-primary-100">Execution Waves</h2>
              <div className="mt-3 rounded-2xl border border-primary-800 bg-primary-800/35 p-2">
                {waves.map((wave, index) => {
                  const waveMinutes = Math.max(...wave.map((task) => task.estimated_minutes))
                  return (
                    <div
                      key={`wave-${index + 1}`}
                      className="flex items-center justify-between gap-3 px-2 py-2 text-xs"
                    >
                      <span className="font-semibold text-accent-300">Wave {index + 1}</span>
                      <span className="flex-1 text-center text-primary-300">
                        {wave.map((task) => `T${tasks.findIndex((entry) => entry.id === task.id) + 1}`).join(', ')}
                      </span>
                      <span className="text-primary-500">
                        ~{formatMinutes(waveMinutes)}
                        {wave.length > 1 ? ' ∥' : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="mt-5">
              <h2 className="text-sm font-semibold text-primary-100">Agents Summary</h2>
              <div className="mt-3 space-y-2 text-sm text-primary-300">
                {agents.map((agent) => (
                  <div key={agent.label} className="flex items-center justify-between gap-3">
                    <span
                      className={['inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium', getAgentBadgeClass(agent.label.toLowerCase())].join(
                        ' ',
                      )}
                    >
                      {agent.label}
                    </span>
                    <span>{agent.count} task{agent.count === 1 ? '' : 's'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <h2 className="text-sm font-semibold text-primary-100">Checks</h2>
              <div className="mt-3 space-y-2 text-sm text-primary-300">
                <div className="flex items-center gap-2">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} className="text-emerald-300" />
                  <span><code>tsc</code> after each task</span>
                </div>
                <div className="flex items-center gap-2">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} className="text-emerald-300" />
                  <span>tests after final task</span>
                </div>
                <div className="flex items-center gap-2 text-primary-500">
                  <span>○</span>
                  <span>lint (off)</span>
                </div>
                <div className="flex items-center gap-2 text-primary-500">
                  <span>○</span>
                  <span>e2e (off)</span>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="border-primary-700 bg-primary-800/60 text-primary-100 hover:bg-primary-800"
                onClick={() => setEditingTaskId(tasks[0]?.id ?? null)}
              >
                <HugeiconsIcon icon={PencilEdit02Icon} size={14} strokeWidth={1.8} />
                Edit
              </Button>
              <Button
                variant="outline"
                className="border-primary-700 bg-primary-800/60 text-primary-100 hover:bg-primary-800"
                onClick={() =>
                  void navigate({
                    to: '/projects',
                    search: {
                      project: resolvedPlan.projectId ?? undefined,
                      projectId: resolvedPlan.projectId ?? undefined,
                      phaseId: resolvedPlan.phaseId,
                      phaseName: resolvedPlan.phaseName,
                      goal: resolvedPlan.goal,
                    },
                  })
                }
              >
                <HugeiconsIcon icon={ReloadIcon} size={14} strokeWidth={1.8} />
                Re-plan
              </Button>
              <Button
                className="bg-accent-500 text-white hover:bg-accent-400"
                onClick={() => launchMutation.mutate()}
                disabled={launchMutation.isPending}
              >
                <HugeiconsIcon icon={Rocket01Icon} size={14} strokeWidth={1.8} />
                {launchMutation.isPending ? 'Launching' : 'Launch'}
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
