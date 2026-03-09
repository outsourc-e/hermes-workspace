import { useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import {
  ArrowDown01Icon,
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
  normalizeDecomposedTask,
  normalizeMission,
  normalizeTask,
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
}

type PlanReviewState = {
  goal: string
  phaseId: string
  phaseName: string
  projectId?: string | null
  projectName?: string | null
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
      tasks,
    }
  } catch {
    return null
  }
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

export function PlanReviewScreen({ plan }: PlanReviewScreenProps) {
  const navigate = useNavigate()
  const parsedPlan = useMemo(() => parsePlanState(plan), [plan])
  const [tasks, setTasks] = useState<DecomposedTaskDraft[]>(() => parsedPlan?.tasks ?? [])
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    setTasks(parsedPlan?.tasks ?? [])
  }, [parsedPlan])

  useEffect(() => {
    if (!editingTaskId) return
    inputRefs.current[editingTaskId]?.focus()
    inputRefs.current[editingTaskId]?.select()
  }, [editingTaskId])

  const missionName = useMemo(
    () => deriveMissionName(parsedPlan?.goal ?? ''),
    [parsedPlan?.goal],
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
      if (!parsedPlan) throw new Error('Plan data is missing')
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

      const missionPayload = normalizeMission(
        await apiRequest('/api/workspace/missions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phase_id: parsedPlan.phaseId,
            name: missionName || `${parsedPlan.phaseName} Mission`,
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
    },
    onSuccess: () => {
      toast('Mission launched', { type: 'success' })
      void navigate({ to: '/runs' })
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to launch mission', {
        type: 'error',
      })
    },
  })

  if (!parsedPlan) {
    return (
      <div className="flex h-full items-center justify-center bg-surface p-6">
        <div className="w-full max-w-lg rounded-xl border border-primary-200 bg-white p-6 text-center shadow-sm">
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
            <p className="text-[11px] uppercase tracking-[0.16em] text-primary-500">
              {parsedPlan.projectName ?? 'Project'} / New Mission
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-primary-900 sm:text-[2rem]">
              {missionName}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-primary-500">
              AI generated {tasks.length} task{tasks.length === 1 ? '' : 's'} with
              dependencies. Review and edit before launching.
            </p>
          </div>

          <div className="mt-5 space-y-3">
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
                      project: parsedPlan.projectId ?? undefined,
                      projectId: parsedPlan.projectId ?? undefined,
                      phaseId: parsedPlan.phaseId,
                      phaseName: parsedPlan.phaseName,
                      goal: parsedPlan.goal,
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
