import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'

export type AgendaViewProps = {
  activeMissions: Array<{
    id: string
    title: string
    status: 'running' | 'needs_input' | 'complete' | 'failed'
    agents: number
    startedAt: number
  }>
  tasks: Array<{
    id: string
    title: string
    status: string
    priority: string
    dueDate?: string
    assignedAgent?: string
  }>
  upcomingCrons: Array<{
    id: string
    name: string
    nextRunAt: number
    schedule: string
  }>
  recentCompletions: Array<{
    id: string
    title: string
    completedAt: number
    status: 'complete' | 'failed'
  }>
  agentStatuses: Array<{
    id: string
    name: string
    status: 'idle' | 'active' | 'waiting_for_input'
  }>
}

type SectionKey =
  | 'attention'
  | 'active'
  | 'tasks'
  | 'upcoming'
  | 'completed'
  | 'agents'

type NeedsAttentionItem =
  | {
    id: string
    title: string
    type: 'mission'
    status: 'needs_input' | 'failed'
    at: number
  }
  | {
    id: string
    title: string
    type: 'run'
    status: 'failed'
    at: number
  }

const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 5,
  urgent: 4,
  high: 3,
  medium: 2,
  normal: 2,
  low: 1,
}

function getGreeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function toLocalYmd(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isDueToday(dueDate: string | undefined, now: Date): boolean {
  if (!dueDate) return false
  const parsed = new Date(dueDate)

  if (!Number.isNaN(parsed.getTime())) {
    return (
      parsed.getFullYear() === now.getFullYear()
      && parsed.getMonth() === now.getMonth()
      && parsed.getDate() === now.getDate()
    )
  }

  return dueDate.slice(0, 10) === toLocalYmd(now)
}

function getPriorityWeight(priority: string): number {
  return PRIORITY_WEIGHT[priority.trim().toLowerCase()] ?? 0
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '0m'
  const totalMinutes = Math.floor(ms / 60_000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatTimeAgo(timestamp: number, nowTs: number): string {
  const diff = nowTs - timestamp
  if (diff < 45_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function formatCountdown(timestamp: number, nowTs: number): string {
  const diff = timestamp - nowTs
  if (diff <= 0) return 'now'
  return `in ${formatDuration(diff)}`
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ')
}

type SectionProps = {
  id: SectionKey
  title: string
  count: number
  open: boolean
  onToggle: (id: SectionKey) => void
  emptyText: string
  children: React.ReactNode
  tone?: 'default' | 'attention'
}

function SectionCard({
  id,
  title,
  count,
  open,
  onToggle,
  emptyText,
  children,
  tone = 'default',
}: SectionProps) {
  return (
    <section
      className={cn(
        'rounded-xl border p-3 sm:p-4',
        tone === 'attention'
          ? 'border-red-900/60 bg-red-950/20'
          : 'border-primary-800 bg-primary-900',
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <h3 className="text-sm font-semibold text-primary-100">{title}</h3>
        <div className="flex items-center gap-2">
          <span className="inline-flex min-w-6 items-center justify-center rounded-full border border-primary-700 bg-primary-800 px-2 py-0.5 text-[11px] font-medium text-primary-200">
            {count}
          </span>
          <span className="text-xs text-primary-300" aria-hidden>
            {open ? 'Hide' : 'Show'}
          </span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 border-t border-primary-800/80 pt-3">
              {count === 0 ? (
                <p className="text-xs text-primary-400">{emptyText}</p>
              ) : (
                children
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

export function AgendaView({
  activeMissions,
  tasks,
  upcomingCrons,
  recentCompletions,
  agentStatuses,
}: AgendaViewProps) {
  const now = useMemo(() => new Date(), [])
  const nowTs = now.getTime()
  const greeting = getGreeting(now.getHours())

  const needsAttention = useMemo<NeedsAttentionItem[]>(() => {
    const missionAlerts: NeedsAttentionItem[] = activeMissions
      .filter((mission) => mission.status === 'needs_input' || mission.status === 'failed')
      .map((mission) => ({
        id: mission.id,
        title: mission.title,
        type: 'mission',
        status: mission.status as 'needs_input' | 'failed',
        at: mission.startedAt,
      }))

    const failedRuns: NeedsAttentionItem[] = recentCompletions
      .filter((completion) => completion.status === 'failed')
      .map((completion) => ({
        id: completion.id,
        title: completion.title,
        type: 'run',
        status: 'failed',
        at: completion.completedAt,
      }))

    return [...missionAlerts, ...failedRuns].sort((a, b) => b.at - a.at)
  }, [activeMissions, recentCompletions])

  const activeNow = useMemo(
    () => activeMissions.filter((mission) => mission.status === 'running'),
    [activeMissions],
  )

  const tasksDueToday = useMemo(() => {
    return tasks
      .filter((task) => isDueToday(task.dueDate, now))
      .slice()
      .sort((a, b) => {
        const priorityDiff = getPriorityWeight(b.priority) - getPriorityWeight(a.priority)
        if (priorityDiff !== 0) return priorityDiff
        return a.title.localeCompare(b.title)
      })
  }, [tasks, now])

  const upcoming24h = useMemo(() => {
    const cutoff = nowTs + 24 * 60 * 60 * 1000
    return upcomingCrons
      .filter((cron) => cron.nextRunAt >= nowTs && cron.nextRunAt <= cutoff)
      .slice()
      .sort((a, b) => a.nextRunAt - b.nextRunAt)
  }, [upcomingCrons, nowTs])

  const recentlyCompleted = useMemo(() => {
    return recentCompletions
      .slice()
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, 5)
  }, [recentCompletions])

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    attention: true,
    active: true,
    tasks: true,
    upcoming: true,
    completed: true,
    agents: true,
  })

  const toggleSection = (id: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="space-y-3">
      <header className="rounded-xl border border-primary-800 bg-primary-900 p-4">
        <p className="text-xs uppercase tracking-wide text-primary-400">Today overview</p>
        <h2 className="mt-1 text-lg font-semibold text-primary-100">{greeting}</h2>
        <p className="text-xs text-primary-300">Here is your daily briefing.</p>
      </header>

      <SectionCard
        id="attention"
        title="🔴 Needs Attention"
        count={needsAttention.length}
        open={openSections.attention}
        onToggle={toggleSection}
        emptyText="No blockers right now."
        tone="attention"
      >
        <ul className="space-y-2">
          {needsAttention.map((item) => (
            <li key={`${item.type}-${item.id}`} className="rounded-lg border border-primary-800 bg-primary-950/60 px-3 py-2">
              <p className="text-sm font-medium text-primary-100">{item.title}</p>
              <p className="mt-0.5 text-xs text-primary-300">
                {item.type === 'mission' ? `Mission ${formatStatus(item.status)}` : 'Failed run'}
                {' · '}
                {formatTimeAgo(item.at, nowTs)}
              </p>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        id="active"
        title="🟢 Active Now"
        count={activeNow.length}
        open={openSections.active}
        onToggle={toggleSection}
        emptyText="No active missions."
      >
        <ul className="space-y-2">
          {activeNow.map((mission) => (
            <li key={mission.id} className="rounded-lg border border-primary-800 bg-primary-950/60 px-3 py-2">
              <p className="text-sm font-medium text-primary-100">{mission.title}</p>
              <p className="mt-0.5 text-xs text-primary-300">
                {mission.agents} agent{mission.agents === 1 ? '' : 's'}
                {' · '}
                {formatDuration(nowTs - mission.startedAt)} elapsed
              </p>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        id="tasks"
        title="📋 Tasks Due Today"
        count={tasksDueToday.length}
        open={openSections.tasks}
        onToggle={toggleSection}
        emptyText="No tasks due today."
      >
        <ul className="space-y-2">
          {tasksDueToday.map((task) => (
            <li key={task.id} className="rounded-lg border border-primary-800 bg-primary-950/60 px-3 py-2">
              <p className="text-sm font-medium text-primary-100">{task.title}</p>
              <p className="mt-0.5 text-xs text-primary-300">
                {task.priority}
                {' · '}
                {formatStatus(task.status)}
                {task.assignedAgent ? ` · ${task.assignedAgent}` : ''}
              </p>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        id="upcoming"
        title="⏰ Upcoming (24h)"
        count={upcoming24h.length}
        open={openSections.upcoming}
        onToggle={toggleSection}
        emptyText="No cron runs scheduled in the next 24 hours."
      >
        <ul className="space-y-2">
          {upcoming24h.map((cron) => (
            <li key={cron.id} className="rounded-lg border border-primary-800 bg-primary-950/60 px-3 py-2">
              <p className="text-sm font-medium text-primary-100">{cron.name}</p>
              <p className="mt-0.5 text-xs text-primary-300">
                {formatCountdown(cron.nextRunAt, nowTs)}
                {' · '}
                {cron.schedule}
              </p>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        id="completed"
        title="✅ Recently Completed"
        count={recentlyCompleted.length}
        open={openSections.completed}
        onToggle={toggleSection}
        emptyText="No recent completions yet."
      >
        <ul className="space-y-2">
          {recentlyCompleted.map((completion) => (
            <li key={completion.id} className="rounded-lg border border-primary-800 bg-primary-950/60 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-primary-100">{completion.title}</p>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                    completion.status === 'complete'
                      ? 'bg-primary-800 text-primary-200'
                      : 'bg-red-950/40 text-red-300',
                  )}
                >
                  {completion.status}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-primary-300">{formatTimeAgo(completion.completedAt, nowTs)}</p>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        id="agents"
        title="🤖 Agent Status"
        count={agentStatuses.length}
        open={openSections.agents}
        onToggle={toggleSection}
        emptyText="No agents available."
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {agentStatuses.map((agent) => {
            const isActive = agent.status === 'active'
            const isWaiting = agent.status === 'waiting_for_input'
            return (
              <article key={agent.id} className="rounded-lg border border-primary-800 bg-primary-950/60 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-primary-100">{agent.name}</p>
                  <span
                    className={cn(
                      'inline-block size-2 rounded-full',
                      isActive
                        ? 'bg-accent-400'
                        : isWaiting
                          ? 'bg-red-400'
                          : 'bg-primary-400',
                    )}
                    aria-hidden
                  />
                </div>
                <p className="mt-0.5 text-xs capitalize text-primary-300">
                  {formatStatus(agent.status)}
                </p>
              </article>
            )
          })}
        </div>
      </SectionCard>
    </div>
  )
}
