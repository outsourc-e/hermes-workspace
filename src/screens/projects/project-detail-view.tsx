import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  PlayCircleIcon,
  RefreshIcon,
  Task01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type React from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  formatCheckpointStatus,
  formatCheckpointTimestamp,
  getCheckpointActionButtonClass,
  getCheckpointCommitHashLabel,
  getCheckpointDiffStat,
  getCheckpointStatusBadgeClass,
  getCheckpointSummary,
  isCheckpointReviewable,
  workspaceRequestJson,
  type WorkspaceCheckpoint,
} from '@/lib/workspace-checkpoints'
import { cn } from '@/lib/utils'
import {
  ACCEPTED_SPEC_FILE_TYPES,
  readSpecFile,
} from './lib/spec-file'
import type {
  WorkspaceActivityEvent,
  WorkspaceMission,
  WorkspacePhase,
  WorkspaceProject,
} from './lib/workspace-types'
import {
  formatRelativeTime,
  formatStatus,
  calculateExecutionWaves,
  getActivityEventDescription,
  getActivityEventTone,
  getStatusBadgeClass,
  getTaskDotClass,
} from './lib/workspace-utils'
import {
  formatRunDuration,
  formatRunStatus,
  formatRunTimestamp,
  getConsoleLineClass,
  getRunEventMessage,
  getRunStatusClass,
  sortRunsNewestFirst,
} from '../runs/lib/runs-utils'
import {
  extractRunEvents,
  extractTaskRuns,
  type WorkspaceRunEvent,
  type WorkspaceTaskRun,
} from '../runs/lib/runs-types'
import { useEffect, useMemo, useRef, useState } from 'react'

type ProjectDetailViewProps = {
  selectedSummary: WorkspaceProject | null
  projectDetail: WorkspaceProject | null
  detailLoading: boolean
  projectSpecDraft: string
  projectSpecOpen: boolean
  expandedPhases: Record<string, boolean>
  checkpoints: WorkspaceCheckpoint[]
  pendingCheckpointCount: number
  checkpointsLoading: boolean
  checkpointsFetching: boolean
  checkpointActionPending: boolean
  activityEvents: WorkspaceActivityEvent[]
  activityLoading: boolean
  activityFetching: boolean
  submittingKey: string | null
  onSpecDraftChange: (value: string) => void
  onSpecOpenChange: (open: boolean) => void
  onSaveSpec: (value?: string) => void
  onAddPhase: (project: WorkspaceProject) => void
  onTogglePhase: (phaseId: string) => void
  onAddMission: (phase: WorkspacePhase) => void
  onOpenMissionLauncher: (phase: WorkspacePhase) => void
  onStartMission: (missionId: string) => void
  onPauseMission: (missionId: string) => void
  onResumeMission: (missionId: string) => void
  onStopMission: (missionId: string) => void
  onAddTask: (mission: WorkspaceMission) => void
  onRefreshCheckpoints: () => void
  onCheckpointReview: (checkpoint: WorkspaceCheckpoint) => void
  onCheckpointApprove: (checkpointId: string) => void
  onCheckpointReject: (checkpointId: string) => void
  onRefreshActivity: () => void
}

function RunLog({
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
      className="max-h-80 overflow-y-auto rounded-xl border border-primary-200 bg-white p-4 font-mono text-xs"
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

export function ProjectDetailView({
  selectedSummary,
  projectDetail,
  detailLoading,
  projectSpecDraft,
  projectSpecOpen,
  expandedPhases,
  checkpoints,
  pendingCheckpointCount,
  checkpointsLoading,
  checkpointsFetching,
  checkpointActionPending,
  activityEvents,
  activityLoading,
  activityFetching,
  submittingKey,
  onSpecDraftChange,
  onSpecOpenChange,
  onSaveSpec,
  onAddPhase,
  onTogglePhase,
  onAddMission,
  onOpenMissionLauncher,
  onStartMission,
  onPauseMission,
  onResumeMission,
  onStopMission,
  onAddTask,
  onRefreshCheckpoints,
  onCheckpointReview,
  onCheckpointApprove,
  onCheckpointReject,
  onRefreshActivity,
}: ProjectDetailViewProps) {
  const navigate = useNavigate()
  const [expandedRunIds, setExpandedRunIds] = useState<Record<string, boolean>>({})
  const specFileInputRef = useRef<HTMLInputElement | null>(null)
  const taskNameById = useMemo(() => {
    const source = projectDetail ?? selectedSummary
    if (!source) return new Map<string, string>()

    return new Map(
      source.phases.flatMap((phase) =>
        phase.missions.flatMap((mission) =>
          mission.tasks.map((task) => [task.id, task.name] as const),
        ),
      ),
    )
  }, [projectDetail, selectedSummary])
  const activeProjectId = projectDetail?.id ?? selectedSummary?.id ?? null
  const checkpointByRunId = useMemo(
    () => new Map(checkpoints.map((checkpoint) => [checkpoint.task_run_id, checkpoint])),
    [checkpoints],
  )
  const runsQuery = useQuery({
    queryKey: ['workspace', 'task-runs', 'project', activeProjectId],
    enabled: Boolean(activeProjectId),
    queryFn: async () => {
      if (!activeProjectId) return []
      const payload = await workspaceRequestJson(
        `/api/workspace/task-runs?project_id=${encodeURIComponent(activeProjectId)}`,
      )
      return extractTaskRuns(payload)
    },
    staleTime: 1_000,
    refetchInterval: (query) => {
      const runs = query.state.data as Array<WorkspaceTaskRun> | undefined
      return runs?.some((run) => run.status === 'running') ? 5_000 : false
    },
  })
  const projectRuns = useMemo(
    () => [...(runsQuery.data ?? [])].sort(sortRunsNewestFirst),
    [runsQuery.data],
  )
  const expandedRunIdList = useMemo(
    () => Object.entries(expandedRunIds).flatMap(([id, expanded]) => (expanded ? [id] : [])),
    [expandedRunIds],
  )
  const runEventQueries = useQueries({
    queries: expandedRunIdList.map((runId) => ({
      queryKey: ['workspace', 'task-runs', runId, 'events'],
      queryFn: async () =>
        extractRunEvents(await workspaceRequestJson(`/api/workspace/task-runs/${runId}/events`)),
      staleTime: 1_000,
      refetchInterval: projectRuns.some((run) => run.id === runId && run.status === 'running')
        ? 5_000
        : false,
    })),
  })
  const runEventsById = useMemo(() => {
    const map = new Map<string, Array<WorkspaceRunEvent>>()
    expandedRunIdList.forEach((runId, index) => {
      map.set(runId, runEventQueries[index]?.data ?? [])
    })
    return map
  }, [expandedRunIdList, runEventQueries])

  useEffect(() => {
    setExpandedRunIds({})
  }, [activeProjectId])

  function isCompletedTaskStatus(status: string) {
    return status === 'completed' || status === 'done'
  }

  function isRunningTaskStatus(status: string) {
    return status === 'running' || status === 'active'
  }

  function getMissionExecutionWaves(tasks: WorkspaceMission['tasks']) {
    const taskById = new Map(tasks.map((task) => [task.id, task]))
    const taskNameById = new Map(tasks.map((task) => [task.id, task.name]))
    const drafts = tasks.map((task) => ({
      id: task.id,
      name: task.name,
      description: task.description ?? '',
      estimated_minutes: 0,
      depends_on: task.depends_on.map((dependencyId) => taskNameById.get(dependencyId) ?? dependencyId),
      suggested_agent_type: null,
    }))

    return calculateExecutionWaves(drafts).map((wave) =>
      wave.flatMap((draft) => {
        const task = taskById.get(draft.id)
        return task ? [task] : []
      }),
    )
  }

  function getWaveStatus(
    missionStatus: WorkspaceMission['status'],
    waves: Array<WorkspaceMission['tasks']>,
    waveIndex: number,
  ): 'complete' | 'running' | 'pending' {
    const wave = waves[waveIndex] ?? []
    if (wave.length > 0 && wave.every((task) => isCompletedTaskStatus(task.status))) {
      return 'complete'
    }

    if (wave.some((task) => isRunningTaskStatus(task.status))) {
      return 'running'
    }

    const firstIncompleteWaveIndex = waves.findIndex(
      (candidate) => !candidate.every((task) => isCompletedTaskStatus(task.status)),
    )
    const isCurrentWave = firstIncompleteWaveIndex === waveIndex
    if (isCurrentWave && (missionStatus === 'running' || missionStatus === 'active')) {
      return 'running'
    }

    return 'pending'
  }

  async function handleSpecFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const spec = await readSpecFile(file)
      onSpecDraftChange(spec)
      onSpecOpenChange(true)
      onSaveSpec(spec)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to read spec file', {
        type: 'error',
      })
    }
  }

  if (!selectedSummary) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-primary-200 bg-primary-50/70 px-6 text-center">
        <div>
          <p className="text-base font-semibold text-primary-900">Pick a project</p>
          <p className="mt-2 text-sm text-primary-500">
            Select a project from the dashboard cards to inspect phases,
            missions, and tasks.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-4 border-b border-primary-200 pb-5 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-primary-900">
              {projectDetail?.name ?? selectedSummary.name}
            </h2>
            <span
              className={cn(
                'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium',
                getStatusBadgeClass(projectDetail?.status ?? selectedSummary.status),
              )}
            >
              {formatStatus(projectDetail?.status ?? selectedSummary.status)}
            </span>
          </div>
          <div className="space-y-1 text-sm text-primary-500">
            <p>{projectDetail?.path || selectedSummary.path || 'No path configured'}</p>
          </div>
        </div>

        <Button
          onClick={() => onAddPhase(projectDetail ?? selectedSummary)}
          className="bg-accent-500 text-white hover:bg-accent-400"
        >
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.6} />
          Add Phase
        </Button>
      </div>

      <Collapsible open={projectSpecOpen} onOpenChange={onSpecOpenChange}>
        <section className="mt-5 rounded-xl border border-primary-200 bg-primary-50/70">
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
              <p className="text-sm font-semibold text-primary-900">Project Spec / PRD</p>
              <p className="text-xs text-primary-500">
                {projectSpecDraft.trim()
                  ? 'Execution context and product requirements'
                  : 'No spec yet. Add a brief or PRD for this project.'}
              </p>
            </div>
            <HugeiconsIcon
              icon={projectSpecOpen ? ArrowDown01Icon : ArrowRight01Icon}
              size={16}
              strokeWidth={1.7}
              className="text-primary-500"
            />
          </CollapsibleTrigger>
          <CollapsiblePanel
            className="pt-0"
            contentClassName="border-t border-primary-200 px-4 py-4"
          >
            <div className="space-y-3">
              {!projectSpecDraft.trim() ? (
                <div className="rounded-xl border border-dashed border-primary-200 bg-white px-4 py-4 text-sm text-primary-500">
                  No spec yet — add one to improve decomposition quality
                </div>
              ) : null}
              <textarea
                value={projectSpecDraft}
                onChange={(event) => onSpecDraftChange(event.target.value)}
                rows={10}
                className="min-h-[220px] w-full rounded-xl border border-primary-200 bg-white px-4 py-3 text-sm text-primary-900 outline-none transition-colors focus:border-accent-500"
                placeholder="Add the project spec, PRD, or execution brief..."
              />
              <input
                ref={specFileInputRef}
                type="file"
                accept={ACCEPTED_SPEC_FILE_TYPES}
                className="hidden"
                onChange={(event) => void handleSpecFileSelect(event)}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-primary-500">Markdown supported. Upload `.md` or `.txt`.</p>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => specFileInputRef.current?.click()}
                    disabled={submittingKey === 'project-spec'}
                  >
                    Upload spec file
                  </Button>
                <Button
                  type="button"
                  onClick={() => onSaveSpec()}
                  disabled={submittingKey === 'project-spec'}
                  className="bg-accent-500 text-white hover:bg-accent-400"
                >
                  {submittingKey === 'project-spec' ? 'Saving...' : 'Save Spec'}
                </Button>
                </div>
              </div>
            </div>
          </CollapsiblePanel>
        </section>
      </Collapsible>

      {detailLoading ? (
        <div className="py-14 text-center">
          <div className="mb-3 inline-block h-9 w-9 animate-spin rounded-full border-4 border-accent-500 border-r-transparent" />
          <p className="text-sm text-primary-500">Loading project detail...</p>
        </div>
      ) : projectDetail && projectDetail.phases.length > 0 ? (
        <div className="mt-5 space-y-4">
          {projectDetail.phases.map((phase, phaseIndex) => {
            const expanded = expandedPhases[phase.id] ?? true

            return (
              <section
                key={phase.id}
                className="overflow-hidden rounded-xl border border-primary-200 bg-primary-50/70"
              >
                <button
                  type="button"
                  onClick={() => onTogglePhase(phase.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary-200 bg-white text-xs font-semibold text-primary-600">
                      {phaseIndex + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-primary-900">
                        {phase.name}
                      </p>
                      <p className="text-xs text-primary-500">
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
                        onAddMission(phase)
                      }}
                    >
                      <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.6} />
                      Add Mission
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation()
                        onOpenMissionLauncher(phase)
                      }}
                    >
                      <HugeiconsIcon icon={Task01Icon} size={14} strokeWidth={1.6} />
                      Decompose Goal
                    </Button>
                    <HugeiconsIcon
                      icon={expanded ? ArrowDown01Icon : ArrowRight01Icon}
                      size={16}
                      strokeWidth={1.7}
                      className="text-primary-500"
                    />
                  </div>
                </button>

                {expanded ? (
                  <div className="space-y-3 border-t border-primary-200 px-4 py-4">
                    {phase.missions.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-primary-200 bg-white px-4 py-6 text-center text-sm text-primary-500">
                        No missions in this phase yet.
                      </div>
                    ) : (
                      phase.missions.map((mission) => {
                        const missionWaves = getMissionExecutionWaves(mission.tasks)

                        return (
                          <article
                            key={mission.id}
                            className="rounded-xl border border-primary-200 bg-white p-4"
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-primary-900">
                                  {mission.name}
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
                              <p className="text-xs text-primary-500">
                                {mission.tasks.length} task
                                {mission.tasks.length === 1 ? '' : 's'}
                              </p>
                            </div>

                              <div className="flex flex-wrap items-center gap-2">
                              {mission.status === 'pending' ||
                              mission.status === 'ready' ? (
                                <Button
                                  size="sm"
                                  onClick={() => onStartMission(mission.id)}
                                  disabled={submittingKey === `start:${mission.id}`}
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
                              {mission.status === 'running' || mission.status === 'active' ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    navigate({
                                      to: '/mission-console',
                                      search: {
                                        missionId: mission.id,
                                        projectId:
                                          projectDetail?.id ?? selectedSummary?.id ?? '',
                                      },
                                    })
                                  }
                                >
                                  <HugeiconsIcon
                                    icon={PlayCircleIcon}
                                    size={16}
                                    strokeWidth={1.6}
                                  />
                                  Open Console
                                </Button>
                              ) : null}
                              {mission.status === 'running' || mission.status === 'active' ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onPauseMission(mission.id)}
                                  disabled={submittingKey === `pause:${mission.id}`}
                                >
                                  Pause
                                </Button>
                              ) : null}
                              {mission.status === 'paused' ? (
                                <Button
                                  size="sm"
                                  onClick={() => onResumeMission(mission.id)}
                                  disabled={submittingKey === `resume:${mission.id}`}
                                  className="bg-accent-500 text-white hover:bg-accent-400"
                                >
                                  Resume
                                </Button>
                              ) : null}
                              {mission.status === 'running' ||
                              mission.status === 'active' ||
                              mission.status === 'paused' ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onStopMission(mission.id)}
                                  disabled={submittingKey === `stop:${mission.id}`}
                                >
                                  Stop
                                </Button>
                              ) : null}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onAddTask(mission)}
                              >
                                <HugeiconsIcon icon={Task01Icon} size={14} strokeWidth={1.6} />
                                Add Task
                              </Button>
                            </div>
                          </div>

                          <div className="mt-4 space-y-2">
                            {mission.tasks.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50 px-4 py-5 text-center text-sm text-primary-500">
                                No tasks for this mission yet.
                              </div>
                            ) : (
                              missionWaves.map((wave, waveIndex) => {
                                const waveStatus = getWaveStatus(
                                  mission.status,
                                  missionWaves,
                                  waveIndex,
                                )

                                return (
                                  <section
                                    key={`${mission.id}-wave-${waveIndex + 1}`}
                                    className={cn(
                                      'rounded-xl border border-primary-200 bg-primary-50/70 p-3',
                                      waveStatus === 'running' && 'animate-shimmer',
                                    )}
                                  >
                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-600">
                                        Wave {waveIndex + 1}
                                      </p>
                                      <span
                                        className={cn(
                                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium',
                                          waveStatus === 'complete' &&
                                            'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
                                          waveStatus === 'running' &&
                                            'border-sky-500/30 bg-sky-500/10 text-sky-300',
                                          waveStatus === 'pending' &&
                                            'border-primary-700 bg-primary-800/70 text-primary-300',
                                        )}
                                      >
                                        {waveStatus === 'complete'
                                          ? '✅ complete'
                                          : waveStatus === 'running'
                                            ? '▶ running'
                                            : '⏳ pending'}
                                      </span>
                                    </div>

                                    <div className="space-y-2">
                                      {wave.map((task) => (
                                        <div
                                          key={task.id}
                                          className={cn(
                                            'flex flex-col gap-2 rounded-xl border border-primary-200 bg-white px-3 py-3 md:flex-row md:items-start md:justify-between',
                                            waveStatus === 'running' && 'bg-white/90',
                                          )}
                                        >
                                          <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                              {isCompletedTaskStatus(task.status) ? (
                                                <HugeiconsIcon
                                                  icon={CheckmarkCircle02Icon}
                                                  size={16}
                                                  strokeWidth={1.7}
                                                  className="shrink-0 text-emerald-400"
                                                />
                                              ) : (
                                                <span
                                                  className={cn(
                                                    'mt-0.5 size-2.5 shrink-0 rounded-full',
                                                    getTaskDotClass(task.status),
                                                    waveStatus === 'running' && 'animate-pulse',
                                                  )}
                                                />
                                              )}
                                              <p className="truncate text-sm font-medium text-primary-900">
                                                {task.name}
                                              </p>
                                            </div>
                                            {task.description ? (
                                              <p className="mt-1 whitespace-pre-wrap text-xs text-primary-500">
                                                {task.description}
                                              </p>
                                            ) : null}
                                            {task.depends_on.length > 0 ? (
                                              <p className="mt-2 text-[11px] text-primary-500">
                                                Depends on:{' '}
                                                {task.depends_on
                                                  .map((dependencyId) => taskNameById.get(dependencyId) ?? dependencyId)
                                                  .join(', ')}
                                              </p>
                                            ) : null}
                                          </div>
                                          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary-500">
                                            {formatStatus(task.status)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </section>
                                )
                              })
                            )}
                          </div>
                          </article>
                        )
                      })
                    )}
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-primary-200 bg-primary-50/70 px-6 py-12 text-center">
          <p className="text-sm text-primary-600">This project has no phases yet.</p>
          <p className="mt-1 text-sm text-primary-500">
            Add a phase to start structuring the work.
          </p>
        </div>
      )}

      <section className="mt-6 border-t border-primary-200 pt-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-semibold text-primary-900">Checkpoints</h3>
            <p className="text-sm text-primary-500">
              Review pending handoffs tied to this project.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={onRefreshCheckpoints}
            disabled={checkpointsFetching}
          >
            Refresh Checkpoints
          </Button>
        </div>

        {checkpointsLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div
                key={index}
                className="rounded-xl border border-primary-200 bg-primary-50/70 p-4"
              >
                <div className="h-4 w-32 animate-shimmer rounded bg-primary-200/80" />
                <div className="mt-3 h-5 w-3/4 animate-shimmer rounded bg-primary-200/70" />
                <div className="mt-2 h-4 w-full animate-shimmer rounded bg-primary-200/60" />
              </div>
            ))}
          </div>
        ) : checkpoints.length > 0 ? (
          <div className="space-y-3">
            {checkpoints.map((checkpoint) => {
              const commitHashLabel = getCheckpointCommitHashLabel(checkpoint)

              return (
                <article
                  key={checkpoint.id}
                  className="rounded-xl border border-primary-200 bg-primary-50/70 p-4"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-primary-200 bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-primary-600">
                          Run {checkpoint.task_run_id}
                        </span>
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium',
                            getCheckpointStatusBadgeClass(checkpoint.status),
                          )}
                        >
                          {formatCheckpointStatus(checkpoint.status)}
                        </span>
                        {checkpoint.agent_name ? (
                          <span className="rounded-full border border-primary-200 bg-white px-2.5 py-1 text-[11px] text-primary-600">
                            {checkpoint.agent_name}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm font-semibold text-primary-900">
                        {getCheckpointSummary(checkpoint)}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-primary-500">
                        <span>{getCheckpointDiffStat(checkpoint)}</span>
                        <span className="inline-flex items-center gap-1">
                          <HugeiconsIcon icon={Clock01Icon} size={14} strokeWidth={1.7} />
                          {formatCheckpointTimestamp(checkpoint.created_at)}
                        </span>
                      </div>
                      {commitHashLabel ? (
                        <code className="inline-flex items-center rounded-md border border-primary-200 bg-white px-2 py-1 font-mono text-xs text-primary-700 tabular-nums">
                          {commitHashLabel}
                        </code>
                      ) : null}
                    </div>

                    {isCheckpointReviewable(checkpoint) ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onCheckpointReview(checkpoint)}
                          disabled={checkpointActionPending}
                        >
                          Review
                        </Button>
                        <button
                          type="button"
                          onClick={() => onCheckpointApprove(checkpoint.id)}
                          className={getCheckpointActionButtonClass('approve')}
                          disabled={checkpointActionPending}
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
                          onClick={() => onCheckpointReject(checkpoint.id)}
                          className={getCheckpointActionButtonClass('reject')}
                          disabled={checkpointActionPending}
                        >
                          <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
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
          <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/70 px-6 py-10 text-center">
            <p className="text-sm text-primary-600">No checkpoints for this project yet.</p>
            <p className="mt-1 text-sm text-primary-500">
              Pending reviews will show up here once task runs create them.
            </p>
          </div>
        )}

        {pendingCheckpointCount > 0 ? (
          <p className="mt-3 text-xs uppercase tracking-[0.14em] text-primary-500">
            {pendingCheckpointCount} pending checkpoint
            {pendingCheckpointCount === 1 ? '' : 's'}
          </p>
        ) : null}
      </section>

      <section className="mt-6 border-t border-primary-200 pt-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-semibold text-primary-900">Run History</h3>
            <p className="text-sm text-primary-500">
              Task execution history for this project, including logs and checkpoint handoffs.
            </p>
          </div>
          <Button variant="outline" onClick={() => void runsQuery.refetch()} disabled={runsQuery.isFetching}>
            Refresh Runs
          </Button>
        </div>

        {runsQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="rounded-xl border border-primary-200 bg-primary-50/70 p-4"
              >
                <div className="h-4 w-36 animate-shimmer rounded bg-primary-200/80" />
                <div className="mt-3 h-4 w-full animate-shimmer rounded bg-primary-200/60" />
              </div>
            ))}
          </div>
        ) : projectRuns.length > 0 ? (
          <div className="space-y-3">
            <div className="hidden rounded-xl border border-primary-200 bg-primary-50/70 px-4 py-3 text-xs uppercase tracking-[0.18em] text-primary-500 md:grid md:grid-cols-[minmax(0,1.8fr)_1fr_0.9fr_0.8fr_0.9fr_0.9fr_1fr_auto] md:items-center">
              <span>Task</span>
              <span>Agent</span>
              <span>Status</span>
              <span>Duration</span>
              <span>Started</span>
              <span>Completed</span>
              <span>Checkpoint</span>
              <span />
            </div>

            {projectRuns.map((run) => {
              const expanded = Boolean(expandedRunIds[run.id])
              const checkpoint = checkpointByRunId.get(run.id) ?? null
              const events = runEventsById.get(run.id) ?? []

              return (
                <article
                  key={run.id}
                  className="rounded-xl border border-primary-200 bg-white shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedRunIds((current) => ({
                        ...current,
                        [run.id]: !current[run.id],
                      }))
                    }
                    className="flex w-full flex-col gap-4 px-4 py-4 text-left transition-colors hover:bg-primary-50 md:grid md:grid-cols-[minmax(0,1.8fr)_1fr_0.9fr_0.8fr_0.9fr_0.9fr_1fr_auto] md:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-primary-900">
                        {run.task_name}
                      </p>
                      <p className="mt-1 text-xs text-primary-500">
                        {run.mission_name ?? 'Unknown mission'}
                      </p>
                    </div>
                    <p className="text-sm text-primary-600">
                      {run.agent_name ?? 'Unknown agent'}
                    </p>
                    <div>
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium',
                          getRunStatusClass(run.status),
                        )}
                      >
                        {formatRunStatus(run.status)}
                      </span>
                    </div>
                    <p className="text-sm text-primary-600">{formatRunDuration(run)}</p>
                    <p className="text-sm text-primary-600">{formatRunTimestamp(run.started_at ?? null)}</p>
                    <p className="text-sm text-primary-600">
                      {formatRunTimestamp(run.completed_at ?? null)}
                    </p>
                    <div className="min-w-0">
                      {checkpoint ? (
                        <span
                          className={cn(
                            'inline-flex max-w-full rounded-full border px-2.5 py-1 text-xs font-medium',
                            getCheckpointStatusBadgeClass(checkpoint.status),
                          )}
                        >
                          {formatCheckpointStatus(checkpoint.status)}
                        </span>
                      ) : (
                        <span className="text-sm text-primary-500">None</span>
                      )}
                    </div>
                    <HugeiconsIcon
                      icon={ArrowDown01Icon}
                      size={16}
                      strokeWidth={1.7}
                      className={cn(
                        'text-primary-500 transition-transform',
                        expanded ? 'rotate-180' : '',
                      )}
                    />
                  </button>

                  {expanded ? (
                    <div className="space-y-4 border-t border-primary-200 px-4 py-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-xl border border-primary-200 bg-primary-50/70 p-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-primary-500">Run ID</p>
                          <p className="mt-1 truncate font-mono text-sm text-primary-900">{run.id}</p>
                        </div>
                        <div className="rounded-xl border border-primary-200 bg-primary-50/70 p-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-primary-500">Attempt</p>
                          <p className="mt-1 text-sm text-primary-900">{run.attempt}</p>
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

                      {checkpoint ? (
                        <div className="rounded-xl border border-primary-200 bg-primary-50/70 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={cn(
                                    'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium',
                                    getCheckpointStatusBadgeClass(checkpoint.status),
                                  )}
                                >
                                  {formatCheckpointStatus(checkpoint.status)}
                                </span>
                                {checkpoint.agent_name ? (
                                  <span className="rounded-full border border-primary-200 bg-white px-2.5 py-1 text-xs text-primary-600">
                                    {checkpoint.agent_name}
                                  </span>
                                ) : null}
                              </div>
                              <p className="text-sm font-semibold text-primary-900">
                                {getCheckpointSummary(checkpoint)}
                              </p>
                              <p className="text-xs text-primary-500">
                                {formatCheckpointTimestamp(checkpoint.created_at)}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation()
                                onCheckpointReview(checkpoint)
                              }}
                            >
                              Open Checkpoint
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      <RunLog events={events} />
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/70 px-6 py-10 text-center">
            <p className="text-sm text-primary-600">No runs for this project yet.</p>
            <p className="mt-1 text-sm text-primary-500">
              Task execution logs will appear here after the first mission starts.
            </p>
          </div>
        )}
      </section>

      <section className="mt-6 border-t border-primary-200 pt-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-semibold text-primary-900">Activity</h3>
            <p className="text-sm text-primary-500">
              Recent project events across missions, tasks, and checkpoints.
            </p>
          </div>
          <Button variant="outline" onClick={onRefreshActivity} disabled={activityFetching}>
            <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.7} />
            Refresh
          </Button>
        </div>

        {activityLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="rounded-xl border border-primary-200 bg-primary-50/70 p-4"
              >
                <div className="h-4 w-40 animate-shimmer rounded bg-primary-200/80" />
                <div className="mt-2 h-4 w-24 animate-shimmer rounded bg-primary-200/60" />
              </div>
            ))}
          </div>
        ) : activityEvents.length > 0 ? (
          <div className="relative pl-8">
            <div className="absolute bottom-2 left-[11px] top-2 w-px bg-primary-200" />
            <div className="space-y-3">
              {activityEvents.map((event) => {
                const tone = getActivityEventTone(event.type)

                return (
                  <article
                    key={event.id}
                    className="relative rounded-xl border border-primary-200 bg-primary-50/70 px-4 py-3"
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
                          <p className="truncate text-sm font-medium text-primary-900">
                            {getActivityEventDescription(event)}
                          </p>
                        </div>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-primary-500">
                          {event.entity_type.replace(/_/g, ' ')}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-primary-500">
                        {formatRelativeTime(event.timestamp)}
                      </span>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/70 px-6 py-10 text-center">
            <p className="text-sm text-primary-600">No activity for this project yet.</p>
            <p className="mt-1 text-sm text-primary-500">
              Timeline entries will appear as missions run, tasks finish, and checkpoints are created.
            </p>
          </div>
        )}
      </section>
    </>
  )
}
