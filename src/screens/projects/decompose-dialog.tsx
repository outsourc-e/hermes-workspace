import { ArrowDown01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type {
  DecomposedTaskDraft,
  MissionLaunchState,
  WorkspaceProject,
} from './lib/workspace-types'
import {
  formatMinutes,
  getAgentBadgeClass,
  getAgentBadgeLabel,
} from './lib/workspace-utils'

type DecomposeDialogProps = {
  open: boolean
  missionLauncher: MissionLaunchState | null
  project?: WorkspaceProject | null
  path?: string
  expandedDescriptions: Record<string, boolean>
  missionLaunchMinutes: number
  missionLaunchWaves: number
  decomposePending: boolean
  launchPending: boolean
  onOpenChange: (open: boolean) => void
  onGoalChange: (goal: string) => void
  onTaskDraftChange: (taskId: string, updates: Partial<DecomposedTaskDraft>) => void
  onDescriptionToggle: (taskId: string, open: boolean) => void
  onBack: () => void
  onDecomposeSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onReview: () => void
}

export function DecomposeDialog({
  open,
  missionLauncher,
  project,
  path,
  expandedDescriptions,
  missionLaunchMinutes,
  missionLaunchWaves,
  decomposePending,
  launchPending,
  onOpenChange,
  onGoalChange,
  onTaskDraftChange,
  onDescriptionToggle,
  onBack,
  onDecomposeSubmit,
  onReview,
}: DecomposeDialogProps) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(860px,96vw)] border-primary-200 bg-primary-50 p-0 text-primary-900 shadow-2xl">
        {missionLauncher ? (
          missionLauncher.step === 'input' ? (
            <form onSubmit={onDecomposeSubmit} className="space-y-6 p-5">
              <div className="space-y-1">
                <DialogTitle className="text-base font-semibold text-primary-900">
                  Mission Launcher
                </DialogTitle>
                <DialogDescription className="text-sm text-primary-500">
                  Describe the goal and let the daemon build the task plan for{' '}
                  {missionLauncher.phase.name}.
                </DialogDescription>
              </div>

              <div className="grid gap-3 rounded-xl border border-primary-200 bg-white p-4 md:grid-cols-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-primary-500">
                    Project
                  </p>
                  <p className="mt-1 text-sm font-medium text-primary-900">
                    {project?.name ?? 'Unknown project'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-primary-500">
                    Path
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-primary-600">
                    {path ?? 'No project path available'}
                  </p>
                </div>
              </div>

              <label className="block space-y-1.5">
                <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-primary-500">
                  Goal
                </span>
                <textarea
                  value={missionLauncher.goal}
                  onChange={(event) => onGoalChange(event.target.value)}
                  rows={12}
                  className="w-full rounded-xl border border-primary-200 bg-white px-3 py-3 font-mono text-sm text-primary-900 outline-none transition-colors focus:border-accent-500"
                  placeholder="Describe what you want to build, paste a PRD, or outline the implementation goal..."
                  autoFocus
                />
              </label>

              {decomposePending ? (
                <div className="rounded-xl border border-primary-200 bg-white p-4">
                  <p className="text-sm font-medium text-primary-900">
                    AI is analyzing your goal...
                  </p>
                  <p className="mt-1 text-sm text-primary-500">
                    This can take 15-30 seconds while the daemon gathers project
                    context and plans the work.
                  </p>
                  <div className="mt-4 space-y-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-12 animate-shimmer rounded-xl bg-primary-800/80"
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <DialogClose render={<Button variant="outline">Cancel</Button>} />
                <Button
                  type="submit"
                  className="bg-accent-500 text-white hover:bg-accent-400"
                  disabled={decomposePending}
                >
                  {decomposePending ? 'Decomposing...' : 'Decompose'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-6 p-5">
              <div className="space-y-1">
                <DialogTitle className="text-base font-semibold text-primary-100">
                  Review Task Plan
                </DialogTitle>
                <DialogDescription className="text-sm text-primary-400">
                  Review and edit the generated plan before creating the mission.
                </DialogDescription>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-primary-800 bg-primary-800/35 p-4">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-primary-500">
                    Tasks
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-primary-100">
                    {missionLauncher.tasks.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-primary-800 bg-primary-800/35 p-4">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-primary-500">
                    Estimate
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-primary-100">
                    {formatMinutes(missionLaunchMinutes)}
                  </p>
                </div>
                <div className="rounded-2xl border border-primary-800 bg-primary-800/35 p-4">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-primary-500">
                    Waves
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-primary-100">
                    {missionLaunchWaves}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-primary-800 bg-primary-800/35 px-4 py-3">
                <p className="text-sm text-primary-300">
                  {missionLauncher.tasks.length} tasks, ~
                  {formatMinutes(missionLaunchMinutes)} estimated, {missionLaunchWaves}{' '}
                  execution wave{missionLaunchWaves === 1 ? '' : 's'}.
                </p>
              </div>

              <div className="max-h-[48vh] space-y-3 overflow-y-auto pr-1">
                {missionLauncher.tasks.map((task, index) => {
                  const descriptionOpen =
                    expandedDescriptions[task.id] ?? index === 0

                  return (
                    <article
                      key={task.id}
                      className="rounded-2xl border border-primary-800 bg-primary-800/35 p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex size-7 items-center justify-center rounded-xl border border-primary-700 bg-primary-900 text-xs font-semibold text-primary-300">
                              {index + 1}
                            </span>
                            <input
                              value={task.name}
                              onChange={(event) =>
                                onTaskDraftChange(task.id, { name: event.target.value })
                              }
                              className="min-w-0 flex-1 rounded-xl border border-primary-700 bg-primary-900/80 px-3 py-2 text-sm font-medium text-primary-100 outline-none transition-colors focus:border-accent-500"
                            />
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="inline-flex rounded-full border border-primary-700 bg-primary-900/80 px-2.5 py-1 text-[11px] font-medium text-primary-300">
                              {formatMinutes(task.estimated_minutes)}
                            </span>
                            <span
                              className={cn(
                                'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium',
                                getAgentBadgeClass(task.suggested_agent_type),
                              )}
                            >
                              {getAgentBadgeLabel(task.suggested_agent_type)}
                            </span>
                            {task.depends_on.length > 0 ? (
                              <span className="inline-flex rounded-full border border-primary-700 bg-primary-900/80 px-2.5 py-1 text-[11px] font-medium text-primary-300">
                                Depends on: {task.depends_on.join(', ')}
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full border border-primary-700 bg-primary-900/80 px-2.5 py-1 text-[11px] font-medium text-primary-500">
                                Ready in wave 1
                              </span>
                            )}
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onDescriptionToggle(task.id, !descriptionOpen)}
                        >
                          <HugeiconsIcon
                            icon={descriptionOpen ? ArrowDown01Icon : ArrowRight01Icon}
                            size={14}
                            strokeWidth={1.6}
                          />
                          {descriptionOpen ? 'Hide Details' : 'Edit Details'}
                        </Button>
                      </div>

                      {descriptionOpen ? (
                        <div className="mt-4 space-y-3">
                          <textarea
                            value={task.description}
                            onChange={(event) =>
                              onTaskDraftChange(task.id, {
                                description: event.target.value,
                              })
                            }
                            rows={4}
                            className="w-full rounded-xl border border-primary-700 bg-primary-900/80 px-3 py-2.5 text-sm text-primary-200 outline-none transition-colors focus:border-accent-500"
                          />
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>

              {missionLauncher.rawResponse ? (
                <div className="rounded-2xl border border-primary-800 bg-primary-800/25 p-4">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-primary-500">
                    Fallback output
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-primary-300">
                    {missionLauncher.rawResponse}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="outline" onClick={onBack} disabled={launchPending}>
                  Re-decompose
                </Button>
                <DialogClose
                  render={
                    <Button variant="outline" disabled={launchPending}>
                      Cancel
                    </Button>
                  }
                />
                <Button
                  onClick={onReview}
                  disabled={launchPending}
                  className="bg-accent-500 text-white hover:bg-accent-400"
                >
                  Review in Plan Screen
                </Button>
              </div>
            </div>
          )
        ) : null}
      </DialogContent>
    </DialogRoot>
  )
}
