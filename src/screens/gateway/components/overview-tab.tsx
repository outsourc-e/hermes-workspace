// TODO(orphan): OverviewTab component exists but is not used in agent-hub-layout.tsx.
// The Overview content is instead rendered inline via renderOverviewContent().
// To reduce agent-hub-layout.tsx size, the inline overview rendering could be
// migrated to use this component instead.
import { cn } from '@/lib/utils'
import type { AgentWorkingRow } from './agents-working-panel'
import type { TeamMember } from './team-panel'
import { AGENT_ACCENT_COLORS, AgentAvatar, resolveAgentAvatarIndex } from './agent-avatar'
import { getAgentStatusMeta, getOfficeModelLabel, OfficeView } from './office-view'

export interface OverviewTabProps {
  missionActive: boolean
  missionGoal: string
  activeMissionGoal: string
  missionState: 'running' | 'paused' | 'stopped'
  activeCount: number
  totalTasks: number
  doneTasks: number
  teamCount: number
  teamLabel: string
  pendingApprovalCount: number
  agentWorkingRows: AgentWorkingRow[]
  teamById: Map<string, TeamMember>
  overviewAgentsView: 'cards' | 'live'
  selectedOutputAgentId?: string
  activeTemplateName?: string
  processType: 'sequential' | 'hierarchical' | 'parallel'
  recentActivityItems: string[]
  truncateMissionGoal: (goal: string, max?: number) => string
  onViewMission: () => void
  onStopMission: () => void
  onOpenLaunchWizard: () => void
  onOverviewAgentsViewChange: (view: 'cards' | 'live') => void
  onOpenConfigureAgents: () => void
  onViewAgentOutput: (agentId: string) => void
}

export function OverviewTab({
  missionActive,
  missionGoal,
  activeMissionGoal,
  missionState: _missionState,
  activeCount,
  totalTasks,
  doneTasks,
  teamCount,
  teamLabel,
  pendingApprovalCount,
  agentWorkingRows,
  teamById,
  overviewAgentsView,
  selectedOutputAgentId,
  activeTemplateName,
  processType,
  recentActivityItems,
  truncateMissionGoal,
  onViewMission,
  onStopMission,
  onOpenLaunchWizard,
  onOverviewAgentsViewChange,
  onOpenConfigureAgents,
  onViewAgentOutput,
}: OverviewTabProps) {
  return (
    <div className="h-full overflow-y-auto bg-neutral-50 p-4">
      <div className="space-y-4">
        <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
          {missionActive ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-neutral-900">Mission Status</p>
                <p className="mt-1 truncate text-sm text-neutral-700">
                  {truncateMissionGoal(activeMissionGoal || missionGoal || 'Active mission')}
                </p>
                <p className="mt-1 text-[11px] text-neutral-500">
                  {activeCount} active agent{activeCount === 1 ? '' : 's'}
                  {' · '}
                  {totalTasks > 0 ? `${doneTasks}/${totalTasks} tasks done` : 'No tasks yet'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onViewMission}
                  className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50"
                >
                  View Mission
                </button>
                <button
                  type="button"
                  onClick={onStopMission}
                  className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-accent-600"
                >
                  Stop
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-neutral-900">No active mission</p>
                <p className="mt-1 text-[11px] text-neutral-500">
                  Configure your team and launch a mission when ready.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenLaunchWizard}
                className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-accent-600"
              >
                Start Mission
              </button>
            </div>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Agents', value: teamCount.toString(), sub: teamLabel },
            { label: 'Active', value: activeCount.toString(), sub: missionActive ? 'Currently working' : 'Idle' },
            { label: 'Tasks', value: totalTasks.toString(), sub: totalTasks > 0 ? `${doneTasks} done` : 'No tasks yet' },
            { label: 'Approvals', value: pendingApprovalCount.toString(), sub: pendingApprovalCount > 0 ? 'Needs review' : 'All clear' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex h-full min-h-[92px] flex-col justify-between rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <p className="text-[11px] font-medium text-neutral-500">{stat.label}</p>
              <p className="mt-1 text-lg font-semibold tracking-tight text-neutral-900">{stat.value}</p>
              <p className="mt-1 text-[11px] text-neutral-500">{stat.sub}</p>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold text-neutral-900">Agents</h2>
              {agentWorkingRows.length > 0 ? (
                <div className="flex -space-x-2">
                  {agentWorkingRows.slice(0, 5).map((agent, index) => {
                    const accent = AGENT_ACCENT_COLORS[index % AGENT_ACCENT_COLORS.length]
                    return (
                      <span
                        key={`${agent.id}-header-avatar`}
                        title={agent.name}
                        className={cn(
                          'flex size-6 items-center justify-center rounded-full border-2 border-white text-lg leading-none shadow-sm',
                          accent.avatar,
                        )}
                      >
                        <AgentAvatar index={resolveAgentAvatarIndex(teamById.get(agent.id), index)} color={accent.hex} size={14} />
                      </span>
                    )
                  })}
                </div>
              ) : null}
              {agentWorkingRows.length > 0 ? (
                <div className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-100 p-0.5 align-middle">
                  <div className="flex items-center gap-0.5">
                    {(['cards', 'live'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onOverviewAgentsViewChange(mode)}
                        className={cn(
                          'rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors',
                          overviewAgentsView === mode
                            ? 'bg-white text-neutral-900 shadow-sm'
                            : 'text-neutral-500 hover:text-neutral-700',
                        )}
                      >
                        {mode === 'cards' ? 'Cards' : 'Live'}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onOpenConfigureAgents}
              className="text-xs font-medium text-accent-600 hover:text-accent-700"
            >
              Configure
            </button>
          </div>
          {agentWorkingRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-center">
              <p className="text-2xl" aria-hidden>🤖</p>
              <p className="mt-1 text-sm font-medium text-neutral-700">No agents configured yet</p>
              <p className="mt-1 text-xs text-neutral-500">Open Configure to add your first agent.</p>
            </div>
          ) : overviewAgentsView === 'live' ? (
            <OfficeView
              agentRows={agentWorkingRows}
              missionRunning={missionActive}
              onViewOutput={onViewAgentOutput}
              selectedOutputAgentId={selectedOutputAgentId}
              activeTemplateName={activeTemplateName}
              processType={processType}
            />
          ) : (
            <div
              className={cn(
                'grid auto-rows-fr gap-4',
                agentWorkingRows.length <= 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
              )}
            >
              {agentWorkingRows.map((agent, index) => {
                const accent = AGENT_ACCENT_COLORS[index % AGENT_ACCENT_COLORS.length]
                const isBusy = agent.status === 'active' || agent.status === 'spawning'
                const isRunning = agent.status === 'active'
                const statusMeta = getAgentStatusMeta(agent.status)
                return (
                  <div
                    key={agent.id}
                    className="relative flex h-full min-h-[220px] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className={cn('absolute inset-y-0 left-0 w-[3px]', accent.bar)} />
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <div
                          className={cn(
                            'flex size-10 shrink-0 items-center justify-center rounded-full shadow-sm',
                            accent.avatar,
                          )}
                        >
                          <AgentAvatar index={resolveAgentAvatarIndex(teamById.get(agent.id), index)} color={accent.hex} size={24} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-neutral-900">{agent.name}</p>
                          <p className="truncate text-[11px] text-neutral-500">
                            {agent.roleDescription || 'No role description'}
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          isBusy ? 'bg-accent-100 text-accent-700' : 'bg-neutral-200 text-neutral-700',
                        )}
                      >
                        {getOfficeModelLabel(agent.modelId)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[11px]">
                      {statusMeta.pulse ? (
                        <span className="relative flex size-2 shrink-0">
                          <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', statusMeta.dotClassName)} />
                          <span className={cn('relative inline-flex size-2 rounded-full', statusMeta.dotClassName)} />
                        </span>
                      ) : (
                        <span className={cn('size-2 rounded-full', statusMeta.dotClassName)} />
                      )}
                      <span className={cn('font-medium', statusMeta.className)}>● {statusMeta.label}</span>
                      {agent.taskCount > 0 ? <span>· {agent.taskCount} tasks</span> : null}
                    </div>
                    {agent.lastLine ? (
                      <p className="mt-2 line-clamp-2 min-h-[2.2rem] font-mono text-[11px] text-neutral-500">
                        {agent.lastLine}
                      </p>
                    ) : (
                      <p className={cn('mt-2 min-h-[2.2rem] font-mono text-[11px]', statusMeta.className)}>
                        {agent.status === 'none' ? '● Waiting for session' : `● ${statusMeta.label}`}
                      </p>
                    )}
                    <div className="mt-auto flex gap-2 pt-3">
                      <button
                        type="button"
                        onClick={onOpenConfigureAgents}
                        className={cn(
                          'flex-1 rounded-lg border bg-white px-2 py-1.5 text-[11px] font-medium transition-colors',
                          isRunning
                            ? 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                            : 'border-accent-200 text-accent-600 hover:bg-accent-50',
                        )}
                      >
                        Configure
                      </button>
                      <button
                        type="button"
                        onClick={() => onViewAgentOutput(agent.id)}
                        className={cn(
                          'flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors',
                          isRunning
                            ? 'border-accent-500 bg-accent-500 text-white hover:bg-accent-600'
                            : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50',
                        )}
                      >
                        View Output
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
          <h2 className="text-sm font-semibold text-neutral-900">Recent Activity</h2>
          {recentActivityItems.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-500">📝 No recent activity yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {recentActivityItems.map((item, index) => (
                <li key={`${index}-${item}`} className="flex items-start gap-2 text-xs">
                  <span className="mt-1 size-1.5 rounded-full bg-accent-500" />
                  <span className="text-neutral-700">{item}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
