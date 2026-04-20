import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { TeamMember } from './team-panel'
import type { HubTask } from './task-board'
import { AgentOutputPanel } from './agent-output-panel'

type MissionTimelineProps = {
  tasks: HubTask[]
  agentOutputs: Map<string, string[]>
  agentSessionMap?: Record<string, string>
  agentStatuses: Map<string, { status: string; lastSeen: number }>
  missionState: string
  missionGoal: string
  teamMembers: TeamMember[]
  elapsedTime?: number
}

function formatElapsed(ms?: number): string {
  if (!ms || ms <= 0) return '0s'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function MissionTimeline({
  tasks,
  agentOutputs: _agentOutputs,
  agentSessionMap,
  agentStatuses,
  missionState,
  missionGoal: _missionGoal,
  teamMembers,
  elapsedTime,
}: MissionTimelineProps) {
  const [expandedOutputs, setExpandedOutputs] = useState<Record<string, boolean>>({})
  const completedTasks = useMemo(
    () => tasks.filter((task) => task.status === 'done' || (task.status as string) === 'completed').length,
    [tasks],
  )
  const totalTasks = tasks.length

  const startedAt = useMemo(() => {
    const fromTasks = tasks.length > 0 ? Math.min(...tasks.map((task) => task.createdAt)) : 0
    if (fromTasks > 0) return fromTasks
    if (elapsedTime && elapsedTime > 0) return Date.now() - elapsedTime
    return Date.now()
  }, [elapsedTime, tasks])

  const hasMissionCompleted = (missionState === 'completed' || missionState === 'stopped') && totalTasks > 0
  const missionCardCls = 'relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm'

  return (
    <section className={cn('mx-auto w-full max-w-[960px]', missionCardCls)}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-orange-500 via-orange-400/40 to-transparent" />
      <ol className="space-y-4">
        <li className="flex items-start gap-3">
          <span className="mt-1 h-[14px] w-[14px] rounded-full bg-orange-400" />
          <div>
            <p className="text-[16px] font-bold text-neutral-900">Mission started</p>
            <p className="text-xs text-neutral-500">{new Date(startedAt).toLocaleString()}</p>
          </div>
        </li>

        {tasks
          .filter((task) => Boolean(task.agentId))
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((task) => {
            const member = teamMembers.find((entry) => entry.id === task.agentId)
            return (
              <li key={`dispatch-${task.id}`} className="flex items-start gap-3">
                <span className="mt-1 h-3 w-3 rounded-full bg-blue-500" />
                <div className="min-w-0">
                  <p className="break-words text-base font-bold text-neutral-900">
                    Agent dispatched: {member?.name ?? task.agentId}
                  </p>
                  <p className="break-words text-sm text-neutral-500">
                    {task.title} · {member?.modelId || 'Unknown model'}
                  </p>
                </div>
              </li>
            )
          })}

        {teamMembers.map((member) => {
          const status = agentStatuses.get(member.id)
          const assignedTaskCount = tasks.filter((task) => task.agentId === member.id).length
          const isActive = status?.status === 'active'
          const isExpanded = Boolean(expandedOutputs[member.id])

          return (
            <li key={`agent-${member.id}`} className="flex items-start gap-3">
              <span className={cn('mt-2 h-3 w-3 rounded-full', isActive ? 'bg-emerald-500' : 'bg-neutral-300')} />
              <div className={cn('min-w-0 flex-1', missionCardCls)}>
                <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-orange-500 via-orange-400/40 to-transparent" />
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-base font-bold text-neutral-900">{member.name}</p>
                  {isActive ? (
                    <span className="rounded-full bg-emerald-700 px-2.5 py-1 text-xs text-white">Active</span>
                  ) : (
                    <span className="text-sm text-neutral-400">Stopped</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-neutral-500">Assigned tasks: {assignedTaskCount}</p>

                {isActive ? (
                  <div className="mt-2 rounded-r-lg border-l-4 border-emerald-500 bg-emerald-50 px-3 py-2">
                    <p className="text-sm font-semibold text-emerald-800">Agent working</p>
                    <p className="mt-0.5 text-xs text-emerald-600">
                      Live stream is active{status?.lastSeen ? ` · last seen ${new Date(status.lastSeen).toLocaleTimeString()}` : ''}
                    </p>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => setExpandedOutputs((prev) => ({ ...prev, [member.id]: !prev[member.id] }))}
                  className="mt-3 text-sm text-neutral-600"
                >
                  {isExpanded ? '▼ Live output' : '▶ Live output'}
                </button>

                {isExpanded ? (
                  agentSessionMap?.[member.id] ? (
                    <div className="mt-2 overflow-hidden rounded-lg border border-neutral-200 bg-white">
                      <AgentOutputPanel
                        compact
                        agentName={member.name}
                        sessionKey={agentSessionMap[member.id]}
                        tasks={tasks.filter((t) => t.agentId === member.id)}
                        onClose={() => {}}
                      />
                    </div>
                  ) : (
                    <div className="mt-2 rounded-lg border border-neutral-200 bg-white p-2">
                      <p className="text-[11px] text-neutral-400">Waiting for agent session...</p>
                    </div>
                  )
                ) : null}
              </div>
            </li>
          )
        })}

        {hasMissionCompleted ? (
          <li className="flex items-start gap-3">
            <span className="mt-1 h-3 w-3 rounded-full bg-neutral-300" />
            <div>
              <p className="text-base font-bold text-neutral-900">Mission stopped</p>
              <p className="text-xs text-neutral-500">
                {completedTasks}/{totalTasks} tasks complete · total time {formatElapsed(elapsedTime)}
              </p>
            </div>
          </li>
        ) : null}
      </ol>
    </section>
  )
}
