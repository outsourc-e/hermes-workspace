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
import { Button } from '@/components/ui/button'
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
  type WorkspaceCheckpoint,
} from '@/lib/workspace-checkpoints'
import { cn } from '@/lib/utils'
import type {
  WorkspaceActivityEvent,
  WorkspaceMission,
  WorkspacePhase,
  WorkspaceProject,
} from './lib/workspace-types'
import {
  formatRelativeTime,
  formatStatus,
  getActivityEventDescription,
  getActivityEventTone,
  getStatusBadgeClass,
  getTaskDotClass,
} from './lib/workspace-utils'
import { useMemo } from 'react'

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
  onSaveSpec: () => void
  onAddPhase: (project: WorkspaceProject) => void
  onTogglePhase: (phaseId: string) => void
  onAddMission: (phase: WorkspacePhase) => void
  onOpenMissionLauncher: (phase: WorkspacePhase) => void
  onStartMission: (missionId: string) => void
  onAddTask: (mission: WorkspaceMission) => void
  onRefreshCheckpoints: () => void
  onCheckpointReview: (checkpoint: WorkspaceCheckpoint) => void
  onCheckpointApprove: (checkpointId: string) => void
  onCheckpointReject: (checkpointId: string) => void
  onRefreshActivity: () => void
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
  onAddTask,
  onRefreshCheckpoints,
  onCheckpointReview,
  onCheckpointApprove,
  onCheckpointReject,
  onRefreshActivity,
}: ProjectDetailViewProps) {
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

  if (!selectedSummary) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-primary-700 bg-primary-800/20 px-6 text-center">
        <div>
          <p className="text-base font-semibold text-primary-100">Pick a project</p>
          <p className="mt-2 text-sm text-primary-400">
            Select a project from the dashboard cards to inspect phases,
            missions, and tasks.
          </p>
        </div>
      </div>
    )
  }

  return (
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
                getStatusBadgeClass(projectDetail?.status ?? selectedSummary.status),
              )}
            >
              {formatStatus(projectDetail?.status ?? selectedSummary.status)}
            </span>
          </div>
          <div className="space-y-1 text-sm text-primary-400">
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
              <p className="text-sm font-semibold text-primary-100">Project Spec / PRD</p>
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
                onChange={(event) => onSpecDraftChange(event.target.value)}
                rows={10}
                className="min-h-[220px] w-full rounded-2xl border border-primary-700 bg-primary-900/90 px-4 py-3 text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
                placeholder="Add the project spec, PRD, or execution brief..."
              />
              <div className="flex justify-end">
                <Button
                  onClick={onSaveSpec}
                  disabled={submittingKey === 'project-spec'}
                  className="bg-accent-500 text-white hover:bg-accent-400"
                >
                  {submittingKey === 'project-spec' ? 'Saving...' : 'Save Spec'}
                </Button>
              </div>
            </div>
          </CollapsiblePanel>
        </section>
      </Collapsible>

      {detailLoading ? (
        <div className="py-14 text-center">
          <div className="mb-3 inline-block h-9 w-9 animate-spin rounded-full border-4 border-accent-500 border-r-transparent" />
          <p className="text-sm text-primary-400">Loading project detail...</p>
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
                  onClick={() => onTogglePhase(phase.id)}
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
                                    getStatusBadgeClass(mission.status),
                                  )}
                                >
                                  {formatStatus(mission.status)}
                                </span>
                              </div>
                              <p className="text-xs text-primary-400">
                                {mission.tasks.length} task
                                {mission.tasks.length === 1 ? '' : 's'}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {mission.status !== 'running' &&
                              mission.status !== 'completed' ? (
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
                                          getTaskDotClass(task.status),
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
          <p className="text-sm text-primary-300">This project has no phases yet.</p>
          <p className="mt-1 text-sm text-primary-500">
            Add a phase to start structuring the work.
          </p>
        </div>
      )}

      <section className="mt-6 border-t border-primary-800 pt-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-primary-100">Checkpoints</h3>
            <p className="text-sm text-primary-400">
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
                className="rounded-2xl border border-primary-800 bg-primary-800/30 p-4"
              >
                <div className="h-4 w-32 animate-shimmer rounded bg-primary-800/80" />
                <div className="mt-3 h-5 w-3/4 animate-shimmer rounded bg-primary-800/70" />
                <div className="mt-2 h-4 w-full animate-shimmer rounded bg-primary-800/60" />
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
                            getCheckpointStatusBadgeClass(checkpoint.status),
                          )}
                        >
                          {formatCheckpointStatus(checkpoint.status)}
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
                          <HugeiconsIcon icon={Clock01Icon} size={14} strokeWidth={1.7} />
                          {formatCheckpointTimestamp(checkpoint.created_at)}
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
          <div className="rounded-2xl border border-dashed border-primary-700 bg-primary-800/25 px-6 py-10 text-center">
            <p className="text-sm text-primary-300">No checkpoints for this project yet.</p>
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

      <section className="mt-6 border-t border-primary-800 pt-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-primary-100">Activity</h3>
            <p className="text-sm text-primary-400">
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
            <p className="text-sm text-primary-300">No activity for this project yet.</p>
            <p className="mt-1 text-sm text-primary-500">
              Timeline entries will appear as missions run, tasks finish, and checkpoints are created.
            </p>
          </div>
        )}
      </section>
    </>
  )
}
