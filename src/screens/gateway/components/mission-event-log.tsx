import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertDiamondIcon,
  ArrowTurnBackwardIcon,
  CheckmarkCircle02Icon,
  PlayCircleIcon,
  Rocket01Icon,
  Task01Icon,
  AiBrain01Icon,
  Chat01Icon,
  Target01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
import type { MissionEvent } from '@/screens/gateway/lib/mission-events'

type MissionEventLogProps = {
  events: MissionEvent[]
  agentNames?: Record<string, string>
  className?: string
}

type EventFilter = 'all' | 'agent' | 'task' | 'errors'

type EventVisual = {
  icon: React.ComponentProps<typeof HugeiconsIcon>['icon']
  toneClassName: string
}

const FILTER_OPTIONS: Array<{ key: EventFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'agent', label: 'Agent Events' },
  { key: 'task', label: 'Task Events' },
  { key: 'errors', label: 'Errors Only' },
]

function getEventVisual(eventType: MissionEvent['type']): EventVisual {
  switch (eventType) {
    case 'agent.spawned':
      return { icon: Rocket01Icon, toneClassName: 'border-sky-500/30 bg-sky-500/10 text-sky-300' }
    case 'agent.started':
      return { icon: PlayCircleIcon, toneClassName: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' }
    case 'agent.thinking':
      return { icon: AiBrain01Icon, toneClassName: 'border-violet-500/30 bg-violet-500/10 text-violet-300' }
    case 'agent.output':
      return { icon: Chat01Icon, toneClassName: 'border-primary-700 bg-primary-800/70 text-primary-300' }
    case 'agent.completed':
      return { icon: CheckmarkCircle02Icon, toneClassName: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' }
    case 'agent.failed':
      return { icon: AlertDiamondIcon, toneClassName: 'border-red-500/30 bg-red-500/10 text-red-300' }
    case 'agent.retrying':
      return { icon: ArrowTurnBackwardIcon, toneClassName: 'border-accent-500/30 bg-accent-500/10 text-accent-300' }
    case 'mission.started':
    case 'mission.completed':
    case 'mission.aborted':
      return { icon: Target01Icon, toneClassName: 'border-accent-500/30 bg-accent-500/10 text-accent-300' }
    case 'task.assigned':
    case 'task.completed':
    case 'task.failed':
      return { icon: Task01Icon, toneClassName: 'border-sky-500/30 bg-sky-500/10 text-sky-300' }
  }
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getAgentLabel(event: MissionEvent, agentNames?: Record<string, string>): string {
  if ('agentId' in event.payload) {
    return agentNames?.[event.payload.agentId] ?? event.payload.agentId
  }

  return 'Mission'
}

function getEventDescription(event: MissionEvent, agentNames?: Record<string, string>): string {
  switch (event.type) {
    case 'agent.spawned':
      return `spawned session ${event.payload.sessionKey} on ${event.payload.model}`
    case 'agent.started':
      return event.payload.firstChunk
        ? `started with "${event.payload.firstChunk}"`
        : 'started processing'
    case 'agent.thinking':
      return 'entered reasoning mode'
    case 'agent.output':
      return event.payload.isStreaming ? 'streaming output' : 'emitted output'
    case 'agent.completed':
      return `completed with ${event.payload.tokenCount} tokens`
    case 'agent.failed':
      return event.payload.willRetry ? `failed and will retry: ${event.payload.error}` : `failed: ${event.payload.error}`
    case 'agent.retrying':
      return `retry ${event.payload.retryCount} spawned as ${event.payload.newSessionKey}`
    case 'mission.started':
      return `started "${event.payload.goal}" with ${event.payload.team.length} agents`
    case 'mission.completed':
      return 'completed successfully'
    case 'mission.aborted':
      return `aborted: ${event.payload.reason}`
    case 'task.assigned': {
      const agentName = agentNames?.[event.payload.agentId] ?? event.payload.agentId
      return `assigned ${event.payload.taskId} to ${agentName}`
    }
    case 'task.completed':
      return `completed ${event.payload.taskId}`
    case 'task.failed':
      return `failed ${event.payload.taskId}: ${event.payload.error}`
  }
}

function matchesFilter(event: MissionEvent, filter: EventFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'agent') return event.type.startsWith('agent.')
  if (filter === 'task') return event.type.startsWith('task.')
  return event.type === 'agent.failed' || event.type === 'task.failed' || event.type === 'mission.aborted'
}

export function MissionEventLog({ events, agentNames, className }: MissionEventLogProps) {
  const [filter, setFilter] = useState<EventFilter>('all')
  const [expandedOutputIds, setExpandedOutputIds] = useState<Record<string, boolean>>({})
  const endRef = useRef<HTMLDivElement | null>(null)

  const filteredEvents = useMemo(
    () => events.filter((event) => matchesFilter(event, filter)),
    [events, filter],
  )

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [filteredEvents])

  return (
    <section
      className={cn(
        'flex h-full min-h-[320px] flex-col overflow-hidden rounded-2xl border border-primary-800 bg-primary-900/70 shadow-[0_18px_60px_rgba(0,0,0,0.35)]',
        className,
      )}
    >
      <div className="border-b border-primary-800 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                filter === option.key
                  ? 'border-accent-500 bg-accent-500/15 text-accent-300'
                  : 'border-primary-700 bg-primary-800/80 text-primary-300 hover:border-primary-700 hover:bg-primary-800 hover:text-primary-100',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {filteredEvents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-primary-700 bg-primary-950/60 px-4 py-8 text-center">
            <p className="text-sm text-primary-300">No mission events yet.</p>
          </div>
        ) : (
          <ol className="space-y-2">
            <AnimatePresence initial={false}>
              {filteredEvents.map((event) => {
                const visual = getEventVisual(event.type)
                const isOutputEvent = event.type === 'agent.output'
                const isExpanded = Boolean(expandedOutputIds[event.id])

                return (
                  <motion.li
                    key={event.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="rounded-xl border border-primary-800 bg-primary-950/60 px-3 py-2"
                  >
                    <div className="flex items-start gap-3">
                      <span className="min-w-[72px] pt-0.5 font-mono text-[11px] text-primary-400">
                        [{formatTimestamp(event.timestamp)}]
                      </span>
                      <span
                        className={cn(
                          'inline-flex size-7 shrink-0 items-center justify-center rounded-full border',
                          visual.toneClassName,
                        )}
                      >
                        <HugeiconsIcon icon={visual.icon} size={15} strokeWidth={1.8} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                          <span className="font-semibold text-primary-100">
                            {getAgentLabel(event, agentNames)}
                          </span>
                          <span className="text-primary-300">
                            {getEventDescription(event, agentNames)}
                          </span>
                        </div>

                        {isOutputEvent ? (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedOutputIds((current) => ({
                                  ...current,
                                  [event.id]: !current[event.id],
                                }))
                              }
                              className="text-xs font-medium text-primary-400 transition-colors hover:text-primary-100"
                            >
                              {isExpanded ? 'Hide output' : 'Show output'}
                            </button>
                            <AnimatePresence initial={false}>
                              {isExpanded ? (
                                <motion.pre
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="mt-2 overflow-x-auto rounded-lg border border-primary-800 bg-primary-900 px-3 py-2 font-mono text-[11px] leading-relaxed text-primary-200"
                                >
                                  {event.payload.text}
                                </motion.pre>
                              ) : null}
                            </AnimatePresence>
                          </div>
                        ) : null}

                        {event.type === 'agent.completed' && event.payload.finalOutput ? (
                          <p className="mt-2 line-clamp-2 text-xs text-primary-300">
                            {event.payload.finalOutput}
                          </p>
                        ) : null}

                        {event.type === 'mission.completed' && event.payload.report ? (
                          <p className="mt-2 line-clamp-2 text-xs text-primary-300">
                            {event.payload.report}
                          </p>
                        ) : null}

                        {event.type === 'task.completed' && event.payload.result ? (
                          <p className="mt-2 line-clamp-2 text-xs text-primary-300">
                            {event.payload.result}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ol>
        )}
        <div ref={endRef} />
      </div>
    </section>
  )
}
