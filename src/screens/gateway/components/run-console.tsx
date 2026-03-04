import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchSessionHistory } from '@/lib/gateway-api'
import {
  BrainIcon,
  ComputerTerminal01Icon,
  File01Icon,
  ListViewIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@/lib/utils'

type RunConsoleProps = {
  runId: string
  runTitle: string
  runStatus: 'running' | 'needs_input' | 'complete' | 'failed'
  agents: Array<{ id: string; name: string; modelId?: string; status?: string }>
  pendingApprovals?: Array<{ id: string; tool: string; args?: string; agentName?: string }>
  startedAt?: number
  duration?: string
  tokenCount?: number
  costEstimate?: number
  onClose?: () => void
  onStopMission?: () => void
  onKillAgent?: (agentId: string) => void
  onSteerAgent?: (agentId: string, message: string) => void
  onApprove?: (approvalId: string) => void
  onDeny?: (approvalId: string) => void
  sessionKeys?: string[]
  agentNameMap?: Record<string, string>
}

type ConsoleTab = 'stream' | 'timeline' | 'artifacts' | 'report'
type StreamView = 'combined' | 'lanes'

type MockStreamEvent = {
  id: string
  timestamp: string
  agentName: string
  eventType: 'status' | 'output' | 'tool' | 'error'
  message: string
}

const TAB_OPTIONS: Array<{ id: ConsoleTab; label: string }> = [
  { id: 'stream', label: 'Stream' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'report', label: 'Report' },
]

const STATUS_STYLES: Record<RunConsoleProps['runStatus'], string> = {
  running: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  needs_input: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  complete: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
  failed: 'border-red-500/40 bg-red-500/15 text-red-300',
}

const EVENT_STYLES: Record<MockStreamEvent['eventType'], string> = {
  status: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  output: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  tool: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  error: 'border-red-500/40 bg-red-500/10 text-red-300',
}

const CONSOLE_DEEP_LINKS: Array<{
  label: string
  href: string
  icon: typeof File01Icon
}> = [
  { label: 'Logs', href: '/logs', icon: ListViewIcon },
  { label: 'Files', href: '/files', icon: File01Icon },
  { label: 'Terminal', href: '/terminal', icon: ComputerTerminal01Icon },
  { label: 'Memory', href: '/memory', icon: BrainIcon },
]

function formatRunStatus(status: RunConsoleProps['runStatus']): string {
  switch (status) {
    case 'needs_input':
      return 'Needs Input'
    case 'complete':
      return 'Complete'
    case 'failed':
      return 'Failed'
    case 'running':
    default:
      return 'Running'
  }
}

function formatDuration(startedAt?: number): string | null {
  if (!startedAt || Number.isNaN(startedAt)) return null
  const elapsedMs = Math.max(0, Date.now() - startedAt)
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function formatCost(costEstimate?: number): string {
  if (typeof costEstimate !== 'number' || !Number.isFinite(costEstimate)) return '$0.00'
  return `$${costEstimate.toFixed(2)}`
}

type LiveStreamEvent = {
  id: string
  timestamp: string
  agentName: string
  eventType: 'status' | 'output' | 'tool' | 'error'
  message: string
}

function roleToEventType(role?: string): LiveStreamEvent['eventType'] {
  if (role === 'assistant') return 'output'
  if (role === 'tool') return 'tool'
  if (role === 'system') return 'status'
  return 'status'
}

function formatTs(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function extractContent(msg: { content?: string | Array<{ type?: string; text?: string }>; text?: string }): string {
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) return msg.content.map(p => p.text ?? '').join('')
  if (typeof msg.text === 'string') return msg.text
  return ''
}

function sanitizeArgsPreview(args?: string): string {
  if (!args) return 'No arguments'
  const cleaned = args
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return 'No arguments'
  if (cleaned.length <= 200) return cleaned
  return `${cleaned.slice(0, 200)}...`
}

export function RunConsole({
  runId,
  runTitle,
  runStatus,
  agents,
  pendingApprovals,
  startedAt,
  duration,
  tokenCount,
  costEstimate,
  onClose,
  onStopMission,
  onKillAgent,
  onSteerAgent,
  onApprove,
  onDeny,
  sessionKeys,
  agentNameMap,
}: RunConsoleProps) {
  const [activeTab, setActiveTab] = useState<ConsoleTab>('stream')
  const [streamView, setStreamView] = useState<StreamView>('combined')
  const [steerTarget, setSteerTarget] = useState<string | null>(null)
  const [steerInput, setSteerInput] = useState('')
  const [liveEvents, setLiveEvents] = useState<LiveStreamEvent[]>([])
  const [isAutoScroll, setIsAutoScroll] = useState(true)
  const streamEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Fetch session history for all session keys
  const fetchAllHistory = useCallback(async () => {
    if (!sessionKeys?.length) return
    const allEvents: LiveStreamEvent[] = []
    for (const key of sessionKeys) {
      try {
        const res = await fetchSessionHistory(key)
        const msgs = res?.messages ?? []
        const agentName = agentNameMap?.[key] ?? 'Agent'
        for (const msg of msgs) {
          const content = extractContent(msg)
          if (!content.trim()) continue
          const ts = typeof msg.timestamp === 'number' ? msg.timestamp : Date.now()
          allEvents.push({
            id: `${key}-${ts}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: formatTs(ts),
            agentName,
            eventType: roleToEventType(msg.role),
            message: content,
          })
        }
      } catch { /* skip failed fetches */ }
    }
    allEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    setLiveEvents(allEvents)
  }, [sessionKeys, agentNameMap])

  // Initial fetch + polling when running
  useEffect(() => {
    void fetchAllHistory()
    if (runStatus !== 'running') return
    const interval = setInterval(() => void fetchAllHistory(), 5000)
    return () => clearInterval(interval)
  }, [fetchAllHistory, runStatus])

  // Auto-scroll
  useEffect(() => {
    if (isAutoScroll && streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [liveEvents, isAutoScroll])

  const handleStreamScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setIsAutoScroll(atBottom)
  }, [])

  // Use live events if available, otherwise fall back to mocks
  const hasLiveData = sessionKeys?.length && liveEvents.length > 0

  const resolvedDuration = duration || formatDuration(startedAt) || '0s'
  const resolvedTokens = typeof tokenCount === 'number' ? tokenCount.toLocaleString() : '0'
  const statusLabel = formatRunStatus(runStatus)

  const mockEvents = useMemo<MockStreamEvent[]>(() => {
    const primaryAgent = agents[0]?.name || 'Mission Control'
    const secondaryAgent = agents[1]?.name || primaryAgent
    const hasFailure = runStatus === 'failed'

    return [
      {
        id: `${runId}-evt-1`,
        timestamp: '00:00:03',
        agentName: primaryAgent,
        eventType: 'status',
        message: 'Session initialized and task context loaded.',
      },
      {
        id: `${runId}-evt-2`,
        timestamp: '00:00:11',
        agentName: secondaryAgent,
        eventType: 'tool',
        message: 'Executed repository scan and identified target files.',
      },
      {
        id: `${runId}-evt-3`,
        timestamp: '00:00:18',
        agentName: primaryAgent,
        eventType: hasFailure ? 'error' : 'output',
        message: hasFailure
          ? 'Encountered runtime exception while applying patch.'
          : 'Generated implementation draft and queued validation pass.',
      },
    ]
  }, [agents, runId, runStatus])

  const displayEvents: Array<{ id: string; timestamp: string; agentName: string; eventType: 'status' | 'output' | 'tool' | 'error'; message: string }> = hasLiveData ? liveEvents : mockEvents

  const eventsByAgent = useMemo(() => {
    const grouped = new Map<string, typeof displayEvents>()
    for (const event of displayEvents) {
      const existing = grouped.get(event.agentName)
      if (existing) {
        existing.push(event)
      } else {
        grouped.set(event.agentName, [event])
      }
    }
    return Array.from(grouped.entries()).map(([agentName, events]) => ({ agentName, events }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayEvents])

  return (
    <section className="flex h-full flex-col overflow-hidden bg-[var(--theme-bg,#0b0e14)] text-primary-100 dark:bg-slate-900">
      <header className="border-b border-primary-800/80 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="max-w-[300px] truncate text-sm font-semibold text-primary-100 sm:max-w-[500px] sm:text-base">
                {runTitle}
              </h2>
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                  STATUS_STYLES[runStatus],
                )}
              >
                {statusLabel}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-primary-300">
              <span>Duration: {resolvedDuration}</span>
              <span>Tokens: {resolvedTokens}</span>
              <span>Cost: {formatCost(costEstimate)}</span>
              <span>Agents: {agents.length}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {CONSOLE_DEEP_LINKS.map((link) => (
                <button
                  key={link.href}
                  type="button"
                  onClick={() => {
                    window.location.href = link.href
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-1 text-[10px] text-primary-300 transition-colors hover:bg-primary-800/40 hover:text-primary-100"
                >
                  <HugeiconsIcon icon={link.icon} size={11} strokeWidth={1.6} />
                  <span>{link.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {runStatus === 'running' && onStopMission ? (
              <button
                type="button"
                onClick={onStopMission}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-red-500/40 bg-red-500/15 px-3 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/25"
              >
                ■ Stop
              </button>
            ) : null}
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 items-center rounded-md border border-primary-700 bg-primary-900/70 px-3 text-xs font-medium text-primary-200 transition-colors hover:border-primary-600 hover:bg-primary-800"
              >
                Close
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <nav className="border-b border-primary-800/70 px-4 py-2 sm:px-5">
        <div className="flex flex-wrap gap-2">
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-primary-800 text-primary-100 underline underline-offset-4'
                  : 'bg-primary-900/60 text-primary-300 hover:bg-primary-800/80 hover:text-primary-100',
              )}
            >
              {tab.label}
              {tab.id === 'stream' && displayEvents.length > 0 && (
                <span className="ml-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-primary-700 px-1 text-[9px] font-bold leading-none text-primary-200">
                  {displayEvents.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Agent control bar */}
      {(runStatus === 'running' || runStatus === 'needs_input') && agents.length > 0 ? (
        <div className="border-b border-primary-800/60 px-4 py-2 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            {agents.map((agent) => (
              <div key={agent.id} className="inline-flex items-center gap-1.5 rounded-lg border border-primary-700/80 bg-primary-900/50 px-2 py-1">
                <span className={cn('h-1.5 w-1.5 rounded-full', agent.status === 'active' || agent.status === 'running' ? 'bg-emerald-400 animate-pulse' : agent.status === 'waiting_for_input' ? 'bg-amber-400' : 'bg-primary-500')} />
                <span className="text-[11px] font-medium text-primary-200">{agent.name}</span>
                {onSteerAgent ? (
                  <button
                    type="button"
                    onClick={() => setSteerTarget(steerTarget === agent.id ? null : agent.id)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-primary-400 transition-colors hover:bg-primary-800 hover:text-primary-200"
                  >
                    Steer
                  </button>
                ) : null}
                {onKillAgent ? (
                  <button
                    type="button"
                    onClick={() => onKillAgent(agent.id)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-red-400 transition-colors hover:bg-red-500/15 hover:text-red-300"
                  >
                    Kill
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {steerTarget && onSteerAgent ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] text-primary-400">→ {agents.find(a => a.id === steerTarget)?.name}:</span>
              <input
                type="text"
                value={steerInput}
                onChange={(e) => setSteerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && steerInput.trim()) {
                    onSteerAgent(steerTarget, steerInput.trim())
                    setSteerInput('')
                    setSteerTarget(null)
                  }
                }}
                placeholder="Send directive..."
                className="flex-1 rounded-md border border-primary-700 bg-primary-950 px-2 py-1 text-xs text-primary-100 placeholder:text-primary-500 focus:border-accent-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (steerInput.trim()) {
                    onSteerAgent(steerTarget, steerInput.trim())
                    setSteerInput('')
                    setSteerTarget(null)
                  }
                }}
                className="rounded-md bg-accent-500/20 px-2 py-1 text-[11px] font-medium text-accent-300 transition-colors hover:bg-accent-500/30"
              >
                Send
              </button>
              <button
                type="button"
                onClick={() => { setSteerTarget(null); setSteerInput('') }}
                className="text-[11px] text-primary-500 hover:text-primary-300"
              >
                ✕
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div ref={scrollContainerRef} onScroll={handleStreamScroll} className="flex-1 overflow-auto px-4 py-4 sm:px-5">
        {activeTab === 'stream' ? (
          <div className="space-y-3 font-mono text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-primary-200">{hasLiveData ? `${displayEvents.length} events` : 'Live event stream will appear here'}</p>
              <div className="inline-flex items-center rounded-md border border-primary-700 bg-primary-900/60 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setStreamView('combined')}
                  className={cn(
                    'rounded px-2 py-1 text-xs transition-colors',
                    streamView === 'combined'
                      ? 'bg-primary-800 text-primary-100'
                      : 'bg-primary-900/60 text-primary-300 hover:text-primary-100',
                  )}
                >
                  Combined
                </button>
                <button
                  type="button"
                  onClick={() => setStreamView('lanes')}
                  className={cn(
                    'rounded px-2 py-1 text-xs transition-colors',
                    streamView === 'lanes'
                      ? 'bg-primary-800 text-primary-100'
                      : 'bg-primary-900/60 text-primary-300 hover:text-primary-100',
                  )}
                >
                  Lanes
                </button>
              </div>
            </div>

            {pendingApprovals && pendingApprovals.length > 0 ? (
              <section className="sticky top-0 z-10 rounded-lg border border-amber-500/40 bg-amber-500/15 p-3 shadow-lg backdrop-blur">
                <h3 className="text-sm font-semibold text-amber-200">⚠️ Approval Required</h3>
                <ol className="mt-2 space-y-2">
                  {pendingApprovals.map((approval) => (
                    <li
                      key={approval.id}
                      className="rounded-md border border-amber-500/30 bg-primary-950/60 p-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-1">
                          <p className="text-xs text-amber-100">
                            Tool: <span className="font-semibold">{approval.tool}</span>
                          </p>
                          <p className="text-xs text-primary-200">
                            Agent: <span className="font-medium">{approval.agentName || 'Unknown agent'}</span>
                          </p>
                          <p className="text-xs text-primary-300 break-all">
                            Args: {sanitizeArgsPreview(approval.args)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onApprove ? onApprove(approval.id) : console.log('approve pending approval', approval.id)}
                            className="rounded-md border border-amber-500/50 bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-500/30"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeny ? onDeny(approval.id) : console.log('deny pending approval', approval.id)}
                            className="rounded-md border border-primary-700 bg-primary-900/80 px-2.5 py-1 text-xs font-medium text-primary-200 transition-colors hover:bg-primary-800"
                          >
                            Deny
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {runStatus === 'needs_input' && (!pendingApprovals || pendingApprovals.length === 0) ? (
              <div className="rounded-lg border border-primary-700/80 bg-primary-900/60 px-3 py-2 text-xs text-primary-300">
                Mission is waiting for input — check the approval queue
              </div>
            ) : null}

            {streamView === 'combined' ? (
              <ol className="space-y-2">
                {displayEvents.map((event) => (
                  <li
                    key={event.id}
                    className="rounded-lg border border-primary-800/80 bg-primary-950/60 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-primary-400">[{event.timestamp}]</span>
                      <span className="text-primary-200">{event.agentName}</span>
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase',
                          EVENT_STYLES[event.eventType],
                        )}
                      >
                        {event.eventType}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-primary-300 line-clamp-3">{event.message}</p>
                  </li>
                ))}
              </ol>
            ) : null}

            {streamView === 'lanes' ? (
              eventsByAgent.length >= 3 ? (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {eventsByAgent.map((lane) => {
                    const latestEvent = lane.events[lane.events.length - 1]
                    const laneDotClass =
                      latestEvent?.eventType === 'error'
                        ? 'bg-red-400'
                        : latestEvent?.eventType === 'tool'
                          ? 'bg-amber-400'
                          : latestEvent?.eventType === 'output'
                            ? 'bg-sky-400'
                            : 'bg-emerald-400'
                    return (
                      <section
                        key={lane.agentName}
                        className="min-w-[240px] shrink-0 rounded-lg border border-primary-800/80 bg-primary-950/60 p-3"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className={cn('h-2 w-2 rounded-full', laneDotClass)} />
                          <h3 className="text-xs font-semibold text-primary-100">{lane.agentName}</h3>
                        </div>
                        <ol className="space-y-2">
                          {lane.events.map((event) => (
                            <li
                              key={event.id}
                              className="rounded-md border border-primary-800/80 bg-primary-900/60 px-2 py-1.5"
                            >
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-primary-400">[{event.timestamp}]</span>
                                <span
                                  className={cn(
                                    'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase',
                                    EVENT_STYLES[event.eventType],
                                  )}
                                >
                                  {event.eventType}
                                </span>
                              </div>
                              <p className="mt-1 whitespace-pre-wrap break-words text-primary-300 line-clamp-3">{event.message}</p>
                            </li>
                          ))}
                        </ol>
                      </section>
                    )
                  })}
                </div>
              ) : (
                <div
                  className={cn(
                    'grid gap-3',
                    eventsByAgent.length === 2 ? 'grid-cols-2' : 'grid-cols-1',
                  )}
                >
                  {eventsByAgent.map((lane) => {
                    const latestEvent = lane.events[lane.events.length - 1]
                    const laneDotClass =
                      latestEvent?.eventType === 'error'
                        ? 'bg-red-400'
                        : latestEvent?.eventType === 'tool'
                          ? 'bg-amber-400'
                          : latestEvent?.eventType === 'output'
                            ? 'bg-sky-400'
                            : 'bg-emerald-400'
                    return (
                      <section
                        key={lane.agentName}
                        className="rounded-lg border border-primary-800/80 bg-primary-950/60 p-3"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className={cn('h-2 w-2 rounded-full', laneDotClass)} />
                          <h3 className="text-xs font-semibold text-primary-100">{lane.agentName}</h3>
                        </div>
                        <ol className="space-y-2">
                          {lane.events.map((event) => (
                            <li
                              key={event.id}
                              className="rounded-md border border-primary-800/80 bg-primary-900/60 px-2 py-1.5"
                            >
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-primary-400">[{event.timestamp}]</span>
                                <span
                                  className={cn(
                                    'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase',
                                    EVENT_STYLES[event.eventType],
                                  )}
                                >
                                  {event.eventType}
                                </span>
                              </div>
                              <p className="mt-1 whitespace-pre-wrap break-words text-primary-300 line-clamp-3">{event.message}</p>
                            </li>
                          ))}
                        </ol>
                      </section>
                    )
                  })}
                </div>
              )
            ) : null}
            <div ref={streamEndRef} />
            {!isAutoScroll && displayEvents.length > 5 && (
              <button
                type="button"
                onClick={() => {
                  streamEndRef.current?.scrollIntoView({ behavior: 'smooth' })
                  setIsAutoScroll(true)
                }}
                className="sticky bottom-2 mx-auto flex items-center gap-1 rounded-full border border-primary-700 bg-primary-900/90 px-3 py-1.5 text-[11px] font-medium text-primary-200 shadow-lg backdrop-blur transition-colors hover:bg-primary-800"
              >
                ↓ Jump to latest
              </button>
            )}
          </div>
        ) : null}

        {activeTab === 'timeline' ? (
          <div className="rounded-xl border border-dashed border-primary-700 bg-primary-950/50 px-4 py-6 text-sm text-primary-300">
            Mission timeline
          </div>
        ) : null}

        {activeTab === 'artifacts' ? (
          <div className="rounded-xl border border-dashed border-primary-700 bg-primary-950/50 px-4 py-6 text-sm text-primary-300">
            Artifacts created during this run
          </div>
        ) : null}

        {activeTab === 'report' ? (
          <div className="rounded-xl border border-dashed border-primary-700 bg-primary-950/50 px-4 py-6 text-sm text-primary-300">
            Run report will be generated on completion
          </div>
        ) : null}
      </div>
    </section>
  )
}
